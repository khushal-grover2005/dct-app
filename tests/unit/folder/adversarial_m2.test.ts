import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import './mockFileSystem';
import { StreamingSha256, computeSha256 } from '../../../src/folder/sha256';
import { HashManager } from '../../../src/folder/hashManager';
import {
  extractCaptureTime,
  convertLocalToUtcIso,
  extractMp4CreationTime,
} from '../../../src/folder/captureTime';
import { WorkerInboundMessage, WorkerOutboundMessage } from '../../../src/folder/types';

describe('Adversarial Stress Harness: Milestone 2 Ingestion & Hashing', () => {
  const sampleDir = path.resolve(
    __dirname,
    '../../../docs/consent-tagging/examples/sample-collection'
  );
  const sampleCsvPath = path.resolve(
    __dirname,
    '../../../docs/consent-tagging/examples/asset_export.sample.csv'
  );

  // --------------------------------------------------------------------------
  // Challenge 1: Sample Collection Exact Match with asset_export.sample.csv
  // --------------------------------------------------------------------------
  describe('Challenge 1: Exact byte-for-byte SHA-256 match for all 8 sample assets', () => {
    it('matches sample CSV content_sha256 for all 8 assets in sample-collection', () => {
      const csvContent = fs.readFileSync(sampleCsvPath, 'utf8');
      const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const header = lines[0]?.split(',');
      expect(header).toBeDefined();

      const assetIdIdx = header?.indexOf('asset_id') ?? -1;
      const shaIdx = header?.indexOf('content_sha256') ?? -1;
      expect(assetIdIdx).toBeGreaterThanOrEqual(0);
      expect(shaIdx).toBeGreaterThanOrEqual(0);

      const expectedMap = new Map<string, string>();
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i]?.split(',');
        if (!row || row.length <= Math.max(assetIdIdx, shaIdx)) continue;
        const assetId = row[assetIdIdx]?.trim();
        const sha = row[shaIdx]?.trim();
        if (assetId && sha) {
          expectedMap.set(assetId, sha);
        }
      }

      // There are 8 unique assets in sample-collection
      const sampleFiles = fs.readdirSync(sampleDir);
      expect(sampleFiles.length).toBe(8);

      for (const fileName of sampleFiles) {
        const filePath = path.join(sampleDir, fileName);
        const fileBytes = fs.readFileSync(filePath);

        // 1. Independent Node crypto oracle
        const nodeHash = crypto.createHash('sha256').update(fileBytes).digest('hex');

        // 2. Pure TypeScript StreamingSha256
        const appHash = computeSha256(new Uint8Array(fileBytes));

        // 3. Expected from asset_export.sample.csv
        const expectedHash = expectedMap.get(fileName);

        expect(expectedHash).toBeDefined();
        expect(nodeHash).toBe(expectedHash);
        expect(appHash).toBe(expectedHash);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Challenge 2: Multi-chunk streaming across 8MB blocks (>16MB and >32MB)
  // --------------------------------------------------------------------------
  describe('Challenge 2: Large simulated files (>16MB and >32MB) multi-chunk streaming', () => {
    it('correctly hashes a 16MB + 777 bytes buffer streaming across 8MB blocks', () => {
      const size = 16 * 1024 * 1024 + 777; // ~16.0007 MB
      const buffer = new Uint8Array(size);

      // Populate with pseudo-random pattern to avoid trivial zero compressibility
      for (let i = 0; i < size; i += 4096) {
        buffer[i] = (i * 31 + 17) & 0xff;
        buffer[Math.min(i + 1, size - 1)] = (i * 7 + 13) & 0xff;
      }

      // 1. Oracle: Node crypto hash
      const oracleHash = crypto.createHash('sha256').update(buffer).digest('hex');

      // 2. StreamingSha256 using strict 8MB chunks
      const chunkSize = 8 * 1024 * 1024;
      const streamingHasher = new StreamingSha256();
      let offset = 0;
      let chunksProcessed = 0;

      while (offset < size) {
        const next = Math.min(offset + chunkSize, size);
        streamingHasher.update(buffer.subarray(offset, next));
        offset = next;
        chunksProcessed++;
      }

      const streamingResult = streamingHasher.digest();

      expect(chunksProcessed).toBe(3); // 8MB + 8MB + 777 bytes = 3 chunks
      expect(streamingResult).toBe(oracleHash);
    });

    it('correctly hashes a 32MB + 1234 bytes buffer streaming across 8MB blocks', () => {
      const size = 32 * 1024 * 1024 + 1234; // ~32.001 MB
      const buffer = new Uint8Array(size);

      // Populate with non-zero patterns
      for (let i = 0; i < size; i += 8192) {
        buffer[i] = (i ^ 0xaa) & 0xff;
        buffer[Math.min(i + 100, size - 1)] = (i ^ 0x55) & 0xff;
      }

      // 1. Oracle: Node crypto hash
      const oracleHash = crypto.createHash('sha256').update(buffer).digest('hex');

      // 2. StreamingSha256 using 8MB chunks
      const chunkSize = 8 * 1024 * 1024;
      const streamingHasher = new StreamingSha256();
      let offset = 0;
      let chunksProcessed = 0;

      while (offset < size) {
        const next = Math.min(offset + chunkSize, size);
        streamingHasher.update(buffer.subarray(offset, next));
        offset = next;
        chunksProcessed++;
      }

      const streamingResult = streamingHasher.digest();

      expect(chunksProcessed).toBe(5); // 8MB * 4 + 1234 bytes = 5 chunks
      expect(streamingResult).toBe(oracleHash);
    });

    it('handles various irregular chunk sizes (1, 63, 64, 65, 127, 128, 512, 4096 bytes) with exact parity', () => {
      const testData = new Uint8Array(10000);
      for (let i = 0; i < testData.length; i++) {
        testData[i] = (i * 13 + 7) & 0xff;
      }
      const oracleHash = crypto.createHash('sha256').update(testData).digest('hex');

      const chunkSizes = [1, 7, 55, 56, 63, 64, 65, 127, 128, 129, 255, 256, 1024, 4096];
      for (const size of chunkSizes) {
        const hasher = new StreamingSha256();
        for (let i = 0; i < testData.length; i += size) {
          hasher.update(testData.subarray(i, Math.min(i + size, testData.length)));
        }
        expect(hasher.digest()).toBe(oracleHash);
      }
    });

    it('throws when update() or digest() is called after finalized', () => {
      const hasher = new StreamingSha256();
      hasher.update(new Uint8Array([1, 2, 3]));
      hasher.digest();

      expect(() => hasher.update(new Uint8Array([4]))).toThrow(
        /Cannot update StreamingSha256 after digest/
      );
      expect(() => hasher.digest()).toThrow(
        /digest\(\) has already been called/
      );
    });
  });

  // --------------------------------------------------------------------------
  // Challenge 3: Concurrency Pool (Strict Max 2 Workers across 10+ jobs)
  // --------------------------------------------------------------------------
  describe('Challenge 3: Concurrency pool strictly limits concurrency to max 2', () => {
    it('queues 10 files simultaneously and verifies active concurrency never exceeds 2', async () => {
      let activeWorkers = 0;
      let maxObservedActive = 0;
      const completedJobIds: string[] = [];

      const stressWorkerFactory = (): Worker => {
        let isTerminated = false;
        const worker = {
          onmessage: null as ((e: MessageEvent<WorkerOutboundMessage>) => void) | null,
          onerror: null as ((e: ErrorEvent) => void) | null,
          postMessage(data: WorkerInboundMessage) {
            if (data.type === 'HASH_FILE') {
              activeWorkers++;
              if (activeWorkers > maxObservedActive) {
                maxObservedActive = activeWorkers;
              }

              // Verify invariant synchronously upon postMessage
              expect(activeWorkers).toBeLessThanOrEqual(2);

              // Simulate async worker latency with variable delay
              const delay = 10 + Math.floor(Math.random() * 20);
              setTimeout(async () => {
                if (isTerminated) return;

                // Concurrency invariant must still hold
                expect(activeWorkers).toBeLessThanOrEqual(2);

                const ab = await data.file.arrayBuffer();
                const sha256 = crypto
                  .createHash('sha256')
                  .update(new Uint8Array(ab))
                  .digest('hex');

                // Decrement active workers before emitting completion
                activeWorkers--;

                worker.onmessage?.({
                  data: {
                    type: 'DONE',
                    jobId: data.jobId,
                    assetId: data.assetId,
                    sha256,
                    totalBytes: data.file.size,
                    durationMs: delay,
                  },
                } as MessageEvent<WorkerOutboundMessage>);
              }, delay);
            }
          },
          terminate() {
            isTerminated = true;
          },
        };

        return worker as unknown as Worker;
      };

      const manager = new HashManager({
        maxConcurrency: 2,
        workerFactory: stressWorkerFactory,
      });

      // Create 10 simulated files
      const files: File[] = [];
      for (let i = 0; i < 10; i++) {
        files.push(
          new File([`content of file #${i} for concurrency stress`], `file_${i}.txt`)
        );
      }

      const promises = files.map((file, idx) => {
        return new Promise<void>((resolve, reject) => {
          manager.enqueue({
            jobId: `job_${idx}`,
            assetId: file.name,
            file,
            onDone: ({ sha256 }) => {
              completedJobIds.push(file.name);
              const expectedHash = crypto
                .createHash('sha256')
                .update(new TextEncoder().encode(`content of file #${idx} for concurrency stress`))
                .digest('hex');
              expect(sha256).toBe(expectedHash);
              resolve();
            },
            onError: reject,
          });
        });
      });

      await Promise.all(promises);

      expect(completedJobIds.length).toBe(10);
      expect(maxObservedActive).toBe(2);
      expect(activeWorkers).toBe(0);

      manager.dispose();
    });

    it('queues 20 files under heavy contention and reports accurate aggregate progress', async () => {
      let maxObservedActive = 0;
      let currentActive = 0;
      const progressUpdates: number[] = [];

      const poolWorkerFactory = (): Worker => {
        let isTerminated = false;
        const worker = {
          onmessage: null as ((e: MessageEvent<WorkerOutboundMessage>) => void) | null,
          onerror: null as ((e: ErrorEvent) => void) | null,
          postMessage(data: WorkerInboundMessage) {
            if (data.type === 'HASH_FILE') {
              currentActive++;
              maxObservedActive = Math.max(maxObservedActive, currentActive);

              setTimeout(async () => {
                if (isTerminated) return;
                currentActive--;
                const ab = await data.file.arrayBuffer();
                const sha256 = crypto
                  .createHash('sha256')
                  .update(new Uint8Array(ab))
                  .digest('hex');

                worker.onmessage?.({
                  data: {
                    type: 'DONE',
                    jobId: data.jobId,
                    assetId: data.assetId,
                    sha256,
                    totalBytes: data.file.size,
                    durationMs: 5,
                  },
                } as MessageEvent<WorkerOutboundMessage>);
              }, 5);
            }
          },
          terminate() {
            isTerminated = true;
          },
        };

        return worker as unknown as Worker;
      };

      const manager = new HashManager({
        maxConcurrency: 2,
        workerFactory: poolWorkerFactory,
        onAggregateProgress: (agg) => {
          progressUpdates.push(agg.overallPercent);
        },
      });

      const promises: Promise<void>[] = [];
      for (let i = 0; i < 20; i++) {
        const file = new File([`stress payload ${i}`], `stress_${i}.dat`);
        promises.push(
          new Promise((resolve, reject) => {
            manager.enqueue({
              jobId: `stress_job_${i}`,
              assetId: file.name,
              file,
              onDone: () => resolve(),
              onError: reject,
            });
          })
        );
      }

      await Promise.all(promises);

      expect(maxObservedActive).toBe(2);
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);

      manager.dispose();
    });
  });

  // --------------------------------------------------------------------------
  // Challenge 4: Capture Time Extraction & Corrupt Fallbacks
  // --------------------------------------------------------------------------
  describe('Challenge 4: Capture time extraction, MP4 header parsing, and corrupt fallbacks', () => {
    it('verifies VID-0005.mp4 extracts 2026-11-04T06:40:00Z with source mp4box', async () => {
      const vidPath = path.join(sampleDir, 'VID-0005.mp4');
      const buffer = fs.readFileSync(vidPath);
      const file = new File([buffer], 'VID-0005.mp4', {
        type: 'video/mp4',
        lastModified: Date.UTC(2026, 10, 4, 12, 0, 0),
      });

      const result = await extractCaptureTime(file, 'video');
      expect(result.source).toBe('mp4box');
      expect(result.capturedAt).toBe('2026-11-04T06:40:00Z');
      expect(result.durationSeconds).toBeDefined();
      expect(result.durationSeconds!).toBeGreaterThan(0);

      // Verify direct extractMp4CreationTime API
      const directResult = await extractMp4CreationTime(file);
      expect(directResult).not.toBeNull();
      expect(directResult?.capturedAt).toBe('2026-11-04T06:40:00Z');
    });

    it('falls back to file.lastModified for images without EXIF data', async () => {
      const fixedTime = Date.UTC(2026, 10, 4, 6, 2, 11);
      const imgPath = path.join(sampleDir, 'IMG-0001.png');
      const buffer = fs.readFileSync(imgPath);
      const file = new File([buffer], 'IMG-0001.png', {
        type: 'image/png',
        lastModified: fixedTime,
      });

      const result = await extractCaptureTime(file, 'image');
      expect(result.source).toBe('last_modified');
      expect(result.capturedAt).toBe('2026-11-04T06:02:11Z');
    });

    it('falls back gracefully to lastModified for corrupt MP4 files without crashing', async () => {
      const fallbackMs = Date.UTC(2026, 10, 4, 8, 30, 0);

      // Subcase 1: 0-byte file
      const emptyFile = new File([], 'empty.mp4', {
        type: 'video/mp4',
        lastModified: fallbackMs,
      });
      const resEmpty = await extractCaptureTime(emptyFile, 'video');
      expect(resEmpty.source).toBe('last_modified');
      expect(resEmpty.capturedAt).toBe('2026-11-04T08:30:00Z');

      // Subcase 2: 1-byte file
      const oneByteFile = new File([new Uint8Array([0x00])], 'onebyte.mp4', {
        type: 'video/mp4',
        lastModified: fallbackMs,
      });
      const resOneByte = await extractCaptureTime(oneByteFile, 'video');
      expect(resOneByte.source).toBe('last_modified');
      expect(resOneByte.capturedAt).toBe('2026-11-04T08:30:00Z');

      // Subcase 3: Random garbage binary bytes (not MP4 format)
      const garbageBytes = new Uint8Array(2048);
      for (let i = 0; i < garbageBytes.length; i++) garbageBytes[i] = (i * 37) & 0xff;
      const garbageFile = new File([garbageBytes], 'garbage.mp4', {
        type: 'video/mp4',
        lastModified: fallbackMs,
      });
      const resGarbage = await extractCaptureTime(garbageFile, 'video');
      expect(resGarbage.source).toBe('last_modified');
      expect(resGarbage.capturedAt).toBe('2026-11-04T08:30:00Z');

      // Subcase 4: Truncated MP4 ftyp box (valid box header, truncated payload)
      const truncatedBox = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]); // 32 bytes announced, only 8 provided
      const truncatedFile = new File([truncatedBox], 'truncated.mp4', {
        type: 'video/mp4',
        lastModified: fallbackMs,
      });
      const resTruncated = await extractCaptureTime(truncatedFile, 'video');
      expect(resTruncated.source).toBe('last_modified');
      expect(resTruncated.capturedAt).toBe('2026-11-04T08:30:00Z');
    });

    it('falls back gracefully to lastModified for corrupt image files', async () => {
      const fallbackMs = Date.UTC(2026, 10, 4, 9, 15, 0);

      // Corrupt JPEG
      const corruptJpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04])], 'corrupt.jpg', {
        type: 'image/jpeg',
        lastModified: fallbackMs,
      });
      const resJpeg = await extractCaptureTime(corruptJpeg, 'image');
      expect(resJpeg.source).toBe('last_modified');
      expect(resJpeg.capturedAt).toBe('2026-11-04T09:15:00Z');

      // Non-image text saved as .png
      const fakePng = new File(['just plain text, not a PNG'], 'fake.png', {
        type: 'image/png',
        lastModified: fallbackMs,
      });
      const resPng = await extractCaptureTime(fakePng, 'image');
      expect(resPng.source).toBe('last_modified');
      expect(resPng.capturedAt).toBe('2026-11-04T09:15:00Z');
    });

    it('correctly handles timezone conversion edge cases: midnight rollover, leap years, and invalid identifiers', () => {
      // Midnight rollover in Asia/Kolkata (+05:30)
      // 2026-11-04 03:00:00 IST -> 2026-11-03 21:30:00 UTC
      const rollover = convertLocalToUtcIso(
        { year: 2026, month: 11, day: 4, hour: 3, minute: 0, second: 0 },
        'Asia/Kolkata'
      );
      expect(rollover).toBe('2026-11-03T21:30:00Z');

      // Leap day: 2024-02-29 12:00:00 IST -> 2024-02-29 06:30:00 UTC
      const leapDay = convertLocalToUtcIso(
        { year: 2024, month: 2, day: 29, hour: 12, minute: 0, second: 0 },
        'Asia/Kolkata'
      );
      expect(leapDay).toBe('2024-02-29T06:30:00Z');

      // Unknown / invalid timezone identifier gracefully defaults to Asia/Kolkata
      const invalidTz = convertLocalToUtcIso(
        { year: 2026, month: 11, day: 4, hour: 11, minute: 32, second: 11 },
        'Bogus/NonExistent_Zone'
      );
      expect(invalidTz).toBe('2026-11-04T06:02:11Z');

      // Valid custom timezone: UTC
      const utcTz = convertLocalToUtcIso(
        { year: 2026, month: 11, day: 4, hour: 11, minute: 32, second: 11 },
        'UTC'
      );
      expect(utcTz).toBe('2026-11-04T11:32:11Z');
    });
  });

  // --------------------------------------------------------------------------
  // Challenge 5: Rule 4 Immutability Guarantee
  // --------------------------------------------------------------------------
  describe('Challenge 5: Rule 4 Sample collection files remain byte-for-byte unchanged', () => {
    it('confirms all 8 sample assets match baseline SHA-256 and byte sizes exactly', () => {
      const baseline: Record<string, { size: number; sha256: string }> = {
        'AUD-0006.wav': {
          size: 96138,
          sha256: '570475d23f0878b87d95de909a167e167297f98ad25c4061ab4ed7e59e820527',
        },
        'DOC-0008.pdf': {
          size: 1616,
          sha256: '8491e3916b78e4a55b894f691ed66912a2699df2c33ceac2706d08cf4ac94aae',
        },
        'IMG-0001.png': {
          size: 10481,
          sha256: '2180908ddf0ede06fd1be557ec0741028aaccc8f69030b0260c071490fe198e3',
        },
        'IMG-0002.png': {
          size: 10876,
          sha256: 'd7ccb67ce581735227576793a5ed283fe97658b7f3855985c954cef033cb928d',
        },
        'IMG-0003.png': {
          size: 10377,
          sha256: '8bf338500e6e1049641dd043cca6cdc1c8883f475992b5ccdfe61aaf1c2d2227',
        },
        'IMG-0004.png': {
          size: 9141,
          sha256: '252faa78eca702304cc17cbc026361d2c17607834b7869178174413a9fa3fd3c',
        },
        'SNS-0007.csv': {
          size: 4849,
          sha256: '884016620503eb2fc868a7bb722723936bf152859da9acd610a2d175058162d4',
        },
        'VID-0005.mp4': {
          size: 87103,
          sha256: '06020319b521122923f0c02ecdb030893d561ce6ccf9e3e596791e68de8e002b',
        },
      };

      for (const [filename, expected] of Object.entries(baseline)) {
        const filePath = path.join(sampleDir, filename);
        const stat = fs.statSync(filePath);
        const buffer = fs.readFileSync(filePath);
        const actualSha = crypto.createHash('sha256').update(buffer).digest('hex');

        expect(stat.size).toBe(expected.size);
        expect(actualSha).toBe(expected.sha256);
      }
    });
  });
});
