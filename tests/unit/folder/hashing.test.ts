import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import './mockFileSystem';
import { StreamingSha256, computeSha256 } from '../../../src/folder/sha256';
import { HashManager } from '../../../src/folder/hashManager';
import { IngestedAsset, WorkerInboundMessage, WorkerOutboundMessage } from '../../../src/folder/types';

describe('Streaming SHA-256 and Hashing Pool', () => {
  const sampleDir = path.resolve(
    __dirname,
    '../../../docs/consent-tagging/examples/sample-collection'
  );

  describe('Pure TypeScript StreamingSha256 Standard Vectors', () => {
    it('computes hash of empty input correctly', () => {
      const hasher = new StreamingSha256();
      expect(hasher.digest()).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
    });

    it('computes NIST vector "abc"', () => {
      expect(computeSha256('abc')).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
      );
    });

    it('computes NIST 448-bit boundary vector', () => {
      const vector = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
      expect(computeSha256(vector)).toBe(
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
      );
    });

    it('produces identical hash regardless of chunk slicing size', () => {
      const input = new TextEncoder().encode(
        'The quick brown fox jumps over the lazy dog! Testing chunk boundary robustness across multiple block boundaries.'
      );
      const expected = computeSha256(input);

      // Feed in 1-byte chunks
      const hasher1 = new StreamingSha256();
      for (let i = 0; i < input.length; i++) {
        hasher1.update(input.subarray(i, i + 1));
      }
      expect(hasher1.digest()).toBe(expected);

      // Feed in 17-byte irregular chunks
      const hasher17 = new StreamingSha256();
      for (let i = 0; i < input.length; i += 17) {
        hasher17.update(input.subarray(i, Math.min(i + 17, input.length)));
      }
      expect(hasher17.digest()).toBe(expected);
    });
  });

  describe('Sample Collection 8 Assets Exact Match Verification', () => {
    const expectedHashes: Record<string, string> = {
      'AUD-0006.wav':
        '570475d23f0878b87d95de909a167e167297f98ad25c4061ab4ed7e59e820527',
      'DOC-0008.pdf':
        '8491e3916b78e4a55b894f691ed66912a2699df2c33ceac2706d08cf4ac94aae',
      'IMG-0001.png':
        '2180908ddf0ede06fd1be557ec0741028aaccc8f69030b0260c071490fe198e3',
      'IMG-0002.png':
        'd7ccb67ce581735227576793a5ed283fe97658b7f3855985c954cef033cb928d',
      'IMG-0003.png':
        '8bf338500e6e1049641dd043cca6cdc1c8883f475992b5ccdfe61aaf1c2d2227',
      'IMG-0004.png':
        '252faa78eca702304cc17cbc026361d2c17607834b7869178174413a9fa3fd3c',
      'SNS-0007.csv':
        '884016620503eb2fc868a7bb722723936bf152859da9acd610a2d175058162d4',
      'VID-0005.mp4':
        '06020319b521122923f0c02ecdb030893d561ce6ccf9e3e596791e68de8e002b',
    };

    for (const [filename, expectedSha] of Object.entries(expectedHashes)) {
      it(`computes exact SHA-256 for ${filename}`, () => {
        const filePath = path.join(sampleDir, filename);
        const buffer = fs.readFileSync(filePath);
        const actualSha = computeSha256(new Uint8Array(buffer));
        expect(actualSha).toBe(expectedSha);
      });
    }
  });

  describe('HashManager Worker Pool and Concurrency Limits', () => {
    // Helper to create a controllable mock Worker for pool testing
    function createMockWorker(): Worker {
      let isCancelled = false;
      const worker = {
        onmessage: null as ((e: MessageEvent<WorkerOutboundMessage>) => void) | null,
        onerror: null as ((e: ErrorEvent) => void) | null,
        postMessage(data: WorkerInboundMessage) {
          if (data.type === 'CANCEL') {
            isCancelled = true;
            return;
          }

          if (data.type === 'HASH_FILE') {
            isCancelled = false;
            setTimeout(async () => {
              if (isCancelled) {
                worker.onmessage?.({
                  data: { type: 'CANCELLED', jobId: data.jobId, assetId: data.assetId },
                } as MessageEvent<WorkerOutboundMessage>);
                return;
              }

              const ab = await data.file.arrayBuffer();
              const sha256 = computeSha256(new Uint8Array(ab));

              worker.onmessage?.({
                data: {
                  type: 'PROGRESS',
                  jobId: data.jobId,
                  assetId: data.assetId,
                  bytesProcessed: data.file.size,
                  totalBytes: data.file.size,
                  percent: 100,
                },
              } as MessageEvent<WorkerOutboundMessage>);

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
            }, 10);
          }
        },
        terminate() {
          isCancelled = true;
        },
      };

      return worker as unknown as Worker;
    }

    it('enforces maximum 2 concurrent workers and drains the queue', async () => {
      let activeWorkers = 0;
      let peakConcurrency = 0;

      const trackingWorkerFactory = (): Worker => {
        let isCancelled = false;
        const worker = {
          onmessage: null as ((e: MessageEvent<WorkerOutboundMessage>) => void) | null,
          onerror: null as ((e: ErrorEvent) => void) | null,
          postMessage(data: WorkerInboundMessage) {
            if (data.type === 'HASH_FILE') {
              activeWorkers++;
              peakConcurrency = Math.max(peakConcurrency, activeWorkers);

              setTimeout(async () => {
                activeWorkers--;
                if (isCancelled) {
                  return;
                }
                const ab = await data.file.arrayBuffer();
                const sha256 = computeSha256(new Uint8Array(ab));

                worker.onmessage?.({
                  data: {
                    type: 'DONE',
                    jobId: data.jobId,
                    assetId: data.assetId,
                    sha256,
                    totalBytes: data.file.size,
                    durationMs: 10,
                  },
                } as MessageEvent<WorkerOutboundMessage>);
              }, 15);
            }
          },
          terminate() {
            isCancelled = true;
          },
        };

        return worker as unknown as Worker;
      };

      const manager = new HashManager({
        maxConcurrency: 2,
        workerFactory: trackingWorkerFactory,
      });

      const files = [
        new File(['f1'], 'file1.txt'),
        new File(['f2'], 'file2.txt'),
        new File(['f3'], 'file3.txt'),
        new File(['f4'], 'file4.txt'),
        new File(['f5'], 'file5.txt'),
      ];

      const results: string[] = [];
      const promises = files.map((file) => {
        return new Promise<void>((resolve, reject) => {
          manager.enqueue({
            jobId: `job_${file.name}`,
            assetId: file.name,
            file,
            onDone: ({ sha256 }) => {
              results.push(sha256);
              resolve();
            },
            onError: reject,
          });
        });
      });

      await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(peakConcurrency).toBeLessThanOrEqual(2);
      manager.dispose();
    });

    it('reports aggregate progress across multiple queued files', async () => {
      const progressSnapshots: number[] = [];

      const manager = new HashManager({
        maxConcurrency: 2,
        workerFactory: createMockWorker,
        onAggregateProgress: (progress) => {
          progressSnapshots.push(progress.overallPercent);
        },
      });

      const files = [
        new File(['data one'], 'file1.txt'),
        new File(['data two two'], 'file2.txt'),
        new File(['data three three three'], 'file3.txt'),
      ];

      const promises = files.map((file) => {
        return new Promise<void>((resolve, reject) => {
          manager.enqueue({
            jobId: `job_${file.name}`,
            assetId: file.name,
            file,
            onDone: () => resolve(),
            onError: reject,
          });
        });
      });

      await Promise.all(promises);

      expect(progressSnapshots.length).toBeGreaterThan(0);
      const finalProgress = progressSnapshots[progressSnapshots.length - 1];
      expect(finalProgress).toBe(100);
      manager.dispose();
    });

    it('hashes IngestedAsset catalog via hashAssets helper', async () => {
      const manager = new HashManager({
        maxConcurrency: 2,
        workerFactory: createMockWorker,
      });

      const assets: IngestedAsset[] = [
        {
          assetId: 'file_a.txt',
          file: new File(['hello world'], 'file_a.txt'),
          handle: {} as FileSystemFileHandle,
          assetType: 'sensor',
          sizeBytes: 11,
          capturedAt: '2026-11-04T06:00:00Z',
          captureTimeSource: 'last_modified',
        },
        {
          assetId: 'file_b.txt',
          file: new File(['test message'], 'file_b.txt'),
          handle: {} as FileSystemFileHandle,
          assetType: 'document',
          sizeBytes: 12,
          capturedAt: '2026-11-04T06:00:00Z',
          captureTimeSource: 'last_modified',
        },
      ];

      await manager.hashAssets(assets);

      expect(assets[0]?.sha256).toBe(computeSha256('hello world'));
      expect(assets[0]?.hashProgress).toBe(100);
      expect(assets[1]?.sha256).toBe(computeSha256('test message'));
      expect(assets[1]?.hashProgress).toBe(100);
      manager.dispose();
    });

    it('supports cancellation of pending and active jobs', async () => {
      const manager = new HashManager({
        maxConcurrency: 1,
        workerFactory: createMockWorker,
      });

      let cancelled = false;
      const file1 = new File(['file 1'], 'f1.txt');
      const file2 = new File(['file 2'], 'f2.txt');

      manager.enqueue({
        jobId: 'job_1',
        assetId: 'f1.txt',
        file: file1,
        onDone: () => {},
        onError: () => {},
      });

      manager.enqueue({
        jobId: 'job_2',
        assetId: 'f2.txt',
        file: file2,
        onDone: () => {},
        onError: () => {},
        onCancelled: () => {
          cancelled = true;
        },
      });

      manager.cancelJob('job_2');
      expect(cancelled).toBe(true);
      manager.dispose();
    });
  });

  describe('Rule 4 Immutability Guarantee', () => {
    it('guarantees zero byte modifications and identical metadata on files', async () => {
      const originalContent = 'Immutable test asset content binary 123456';
      const originalMtime = 1730700000000;
      const file = new File([originalContent], 'immutable.txt', {
        lastModified: originalMtime,
      });

      const initialSize = file.size;
      const initialName = file.name;
      const initialMtime = file.lastModified;

      // Execute hashing
      const sha256 = computeSha256(new Uint8Array(await file.arrayBuffer()));

      // Read content after hashing
      const textAfter = await file.text();

      expect(sha256).toBeDefined();
      expect(textAfter).toBe(originalContent);
      expect(file.size).toBe(initialSize);
      expect(file.name).toBe(initialName);
      expect(file.lastModified).toBe(initialMtime);
    });
  });
});
