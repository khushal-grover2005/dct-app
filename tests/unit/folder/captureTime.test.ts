import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import './mockFileSystem';
import {
  extractCaptureTime,
  parseDateComponents,
  convertLocalToUtcIso,
  formatUtcIso,
} from '../../../src/folder/captureTime';

describe('Capture Time Extraction', () => {
  const sampleDir = path.resolve(
    __dirname,
    '../../../docs/consent-tagging/examples/sample-collection'
  );

  describe('Pure Date & Timezone Conversion', () => {
    it('parses date components from formatted strings and Date objects', () => {
      const fromExifColon = parseDateComponents('2026:11:04 11:32:11');
      expect(fromExifColon).toEqual({
        year: 2026,
        month: 11,
        day: 4,
        hour: 11,
        minute: 32,
        second: 11,
      });

      const fromHyphen = parseDateComponents('2026-11-04T11:32:11');
      expect(fromHyphen).toEqual({
        year: 2026,
        month: 11,
        day: 4,
        hour: 11,
        minute: 32,
        second: 11,
      });

      const fromDateObj = parseDateComponents(new Date(2026, 10, 4, 11, 35, 40));
      expect(fromDateObj).toEqual({
        year: 2026,
        month: 11,
        day: 4,
        hour: 11,
        minute: 35,
        second: 40,
      });

      expect(parseDateComponents('invalid-date')).toBeNull();
      expect(parseDateComponents(12345)).toBeNull();
    });

    it('converts Asia/Kolkata local time (+05:30) to UTC ISO Z', () => {
      const components = {
        year: 2026,
        month: 11,
        day: 4,
        hour: 11,
        minute: 32,
        second: 11,
      };
      const utcIso = convertLocalToUtcIso(components, 'Asia/Kolkata');
      expect(utcIso).toBe('2026-11-04T06:02:11Z');
    });

    it('handles midnight rollover crossing day boundaries', () => {
      const components = {
        year: 2026,
        month: 11,
        day: 4,
        hour: 2,
        minute: 0,
        second: 0,
      };
      const utcIso = convertLocalToUtcIso(components, 'Asia/Kolkata');
      expect(utcIso).toBe('2026-11-03T20:30:00Z');
    });

    it('supports custom timezones (e.g. America/New_York UTC-5)', () => {
      const components = {
        year: 2026,
        month: 11,
        day: 4,
        hour: 12,
        minute: 0,
        second: 0,
      };
      const utcIso = convertLocalToUtcIso(components, 'America/New_York');
      expect(utcIso).toBe('2026-11-04T17:00:00Z');
    });

    it('gracefully falls back to Asia/Kolkata on invalid timezone identifier', () => {
      const components = {
        year: 2026,
        month: 11,
        day: 4,
        hour: 11,
        minute: 32,
        second: 11,
      };
      const utcIso = convertLocalToUtcIso(components, 'Invalid/NonExistent');
      expect(utcIso).toBe('2026-11-04T06:02:11Z');
    });

    it('formats UTC ISO matching data contract TS_RE second precision', () => {
      const d = new Date(Date.UTC(2026, 10, 4, 6, 2, 11, 123));
      const formatted = formatUtcIso(d);
      expect(formatted).toBe('2026-11-04T06:02:11Z');
      expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(formatted)).toBe(true);
    });
  });

  describe('Sample Collection Extraction (T-01 Acceptance)', () => {
    it('extracts 06:40:00Z creation time from VID-0005.mp4 header via mp4box', async () => {
      const filePath = path.join(sampleDir, 'VID-0005.mp4');
      const buffer = fs.readFileSync(filePath);
      const file = new File([buffer], 'VID-0005.mp4', {
        type: 'video/mp4',
        lastModified: 1730700000000,
      });

      const result = await extractCaptureTime(file, 'video');
      expect(result.source).toBe('mp4box');
      expect(result.capturedAt).toBe('2026-11-04T06:40:00Z');
      expect(result.durationSeconds).toBeDefined();
    });

    it('falls back to file.lastModified for PNG images without EXIF (IMG-0001.png)', async () => {
      const filePath = path.join(sampleDir, 'IMG-0001.png');
      const buffer = fs.readFileSync(filePath);
      const fixedTime = Date.UTC(2026, 10, 4, 6, 2, 11);
      const file = new File([buffer], 'IMG-0001.png', {
        type: 'image/png',
        lastModified: fixedTime,
      });

      const result = await extractCaptureTime(file, 'image');
      expect(result.source).toBe('last_modified');
      expect(result.capturedAt).toBe('2026-11-04T06:02:11Z');
    });

    it('falls back to file.lastModified for audio, sensor, and document assets', async () => {
      const fixedTime = Date.UTC(2026, 10, 4, 6, 45, 0);

      const audioFile = new File(['dummy audio'], 'AUD-0006.wav', {
        lastModified: fixedTime,
      });
      const audioResult = await extractCaptureTime(audioFile, 'audio');
      expect(audioResult.source).toBe('last_modified');
      expect(audioResult.capturedAt).toBe('2026-11-04T06:45:00Z');

      const sensorFile = new File(['sensor,data'], 'SNS-0007.csv', {
        lastModified: fixedTime,
      });
      const sensorResult = await extractCaptureTime(sensorFile, 'sensor');
      expect(sensorResult.source).toBe('last_modified');

      const docFile = new File(['pdf doc'], 'DOC-0008.pdf', {
        lastModified: fixedTime,
      });
      const docResult = await extractCaptureTime(docFile, 'document');
      expect(docResult.source).toBe('last_modified');
    });
  });

  describe('Edge Cases and Corrupt Files', () => {
    it('handles 0-byte video files gracefully without throwing', async () => {
      const emptyFile = new File([], 'empty.mp4', {
        type: 'video/mp4',
        lastModified: Date.UTC(2026, 10, 4, 8, 0, 0),
      });
      const result = await extractCaptureTime(emptyFile, 'video');
      expect(result.source).toBe('last_modified');
      expect(result.capturedAt).toBe('2026-11-04T08:00:00Z');
    });

    it('handles corrupt non-MP4 content in video files gracefully', async () => {
      const corruptFile = new File(['this is not a valid mp4'], 'corrupt.mp4', {
        type: 'video/mp4',
        lastModified: Date.UTC(2026, 10, 4, 8, 0, 0),
      });
      const result = await extractCaptureTime(corruptFile, 'video');
      expect(result.source).toBe('last_modified');
      expect(result.capturedAt).toBe('2026-11-04T08:00:00Z');
    });

    it('handles corrupt image data gracefully', async () => {
      const corruptImg = new File(['corrupt binary bytes'], 'corrupt.jpg', {
        type: 'image/jpeg',
        lastModified: Date.UTC(2026, 10, 4, 8, 0, 0),
      });
      const result = await extractCaptureTime(corruptImg, 'image');
      expect(result.source).toBe('last_modified');
      expect(result.capturedAt).toBe('2026-11-04T08:00:00Z');
    });

    it('extracts mvhd creation time from a 4 GiB+ MP4 with tail-placed moov in O(1) header slices', async () => {
      const raw = fs.readFileSync(path.join(sampleDir, 'VID-0005.mp4'));
      const extractBox = (targetType: string): Uint8Array => {
        let offset = 0;
        while (offset + 8 <= raw.length) {
          const size = raw.readUInt32BE(offset);
          const type = raw.subarray(offset + 4, offset + 8).toString('ascii');
          if (type === targetType) {
            return new Uint8Array(raw.subarray(offset, offset + size));
          }
          offset += size;
        }
        throw new Error(`Missing box ${targetType}`);
      };

      const ftypBox = extractBox('ftyp');
      const moovBox = extractBox('moov');
      const mdatSize = 4 * 1024 * 1024 * 1024; // 4 GiB sparse media payload
      const mdatHeader = new Uint8Array(16);
      const mdatView = new DataView(mdatHeader.buffer);
      mdatView.setUint32(0, 1, false); // Extended 64-bit box size marker
      mdatHeader.set([0x6d, 0x64, 0x61, 0x74], 4); // 'mdat'
      mdatView.setBigUint64(8, BigInt(mdatSize), false);

      const mdatStart = ftypBox.length;
      const moovStart = mdatStart + mdatSize;
      const totalSize = moovStart + moovBox.length;
      let sliceReads = 0;

      const virtualBigFile = {
        name: 'huge_4gb_tail_moov.mp4',
        size: totalSize,
        lastModified: Date.UTC(2026, 10, 4, 9, 0, 0),
        slice(start = 0, end = totalSize): Blob {
          sliceReads++;
          const clampedEnd = Math.min(end, totalSize);
          const length = Math.max(0, clampedEnd - start);
          const out = new Uint8Array(length);

          const copyRange = (segStart: number, segBytes: Uint8Array) => {
            const segEnd = segStart + segBytes.length;
            const overlapStart = Math.max(start, segStart);
            const overlapEnd = Math.min(clampedEnd, segEnd);
            if (overlapStart < overlapEnd) {
              out.set(
                segBytes.subarray(overlapStart - segStart, overlapEnd - segStart),
                overlapStart - start
              );
            }
          };

          copyRange(0, ftypBox);
          copyRange(mdatStart, mdatHeader);
          copyRange(moovStart, moovBox);
          return new Blob([out]);
        },
      } as unknown as File;

      const result = await extractCaptureTime(virtualBigFile, 'video');
      expect(result.source).toBe('mp4box');
      expect(result.capturedAt).toBe('2026-11-04T06:40:00Z');
      expect(sliceReads).toBeLessThanOrEqual(10);
    });

    it('fails fast without scanning full file when ISOBMFF box header is invalid', async () => {
      const badBox = new Uint8Array(32);
      const view = new DataView(badBox.buffer);
      view.setUint32(0, 4, false); // Invalid < 8 box size
      badBox.set([0x66, 0x74, 0x79, 0x70], 4);
      const file = new File([badBox], 'badbox.mp4', {
        lastModified: Date.UTC(2026, 10, 4, 8, 15, 0),
      });
      const result = await extractCaptureTime(file, 'video');
      expect(result.source).toBe('last_modified');
      expect(result.capturedAt).toBe('2026-11-04T08:15:00Z');
    });
  });
});
