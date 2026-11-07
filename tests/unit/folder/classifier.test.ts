import { describe, it, expect } from 'vitest';
import {
  classifyAsset,
  parseDctTypesJson,
  hasNativePreview,
} from '../../../src/folder/classifier';

describe('Asset Classifier', () => {
  describe('Default Type Classification', () => {
    it('classifies images correctly', () => {
      const extensions = [
        'photo.jpg',
        'photo.jpeg',
        'graphic.png',
        'pic.webp',
        'anim.gif',
        'raw.bmp',
        'modern.avif',
        'iphone.heic',
        'scanned.tif',
        'dslr.cr2',
      ];
      for (const name of extensions) {
        expect(classifyAsset(name)).toBe('image');
      }
    });

    it('classifies videos correctly', () => {
      const extensions = [
        'clip.mp4',
        'movie.m4v',
        'quicktime.mov',
        'web.webm',
        'film.mkv',
        'legacy.avi',
        'phone.3gp',
      ];
      for (const name of extensions) {
        expect(classifyAsset(name)).toBe('video');
      }
    });

    it('classifies audio correctly', () => {
      const extensions = [
        'recording.wav',
        'song.mp3',
        'audiobook.m4a',
        'track.aac',
        'sample.ogg',
        'stream.opus',
        'lossless.flac',
      ];
      for (const name of extensions) {
        expect(classifyAsset(name)).toBe('audio');
      }
    });

    it('classifies sensor files correctly', () => {
      const extensions = [
        'data.csv',
        'table.tsv',
        'metrics.json',
        'events.jsonl',
        'notes.txt',
        'runtime.log',
        'eeg.edf',
        'raw_stream.bin',
        'telemetry.dat',
      ];
      for (const name of extensions) {
        expect(classifyAsset(name)).toBe('sensor');
      }
    });

    it('classifies documents correctly', () => {
      const extensions = [
        'report.pdf',
        'letter.doc',
        'paper.docx',
        'draft.odt',
        'memo.rtf',
      ];
      for (const name of extensions) {
        expect(classifyAsset(name)).toBe('document');
      }
    });

    it('classifies unknown or extension-less files as other', () => {
      expect(classifyAsset('data.xyz')).toBe('other');
      expect(classifyAsset('file.unknown')).toBe('other');
      expect(classifyAsset('config.custom')).toBe('other');
      expect(classifyAsset('README')).toBe('other');
      expect(classifyAsset('LICENSE')).toBe('other');
      expect(classifyAsset('trailing-dot.')).toBe('other');
    });

    it('is case-insensitive', () => {
      expect(classifyAsset('PHOTO.PNG')).toBe('image');
      expect(classifyAsset('MOVIE.MP4')).toBe('video');
      expect(classifyAsset('SOUND.WAV')).toBe('audio');
      expect(classifyAsset('SENSOR.CSV')).toBe('sensor');
      expect(classifyAsset('MANUAL.PDF')).toBe('document');
    });

    it('handles compound dots and complex file names', () => {
      expect(classifyAsset('capture.v1.0.png')).toBe('image');
      expect(classifyAsset('sensor.final.verified.csv')).toBe('sensor');
      expect(classifyAsset('archive.tar.gz')).toBe('other');
    });
  });

  describe('dct-types.json Parsing', () => {
    it('parses valid custom mapping JSON cleanly', () => {
      const json = JSON.stringify({
        sensor: ['.edf', '.bin'],
        document: ['.epub'],
      });
      const result = parseDctTypesJson(json);
      expect(result.warnings).toHaveLength(0);
      expect(result.customTypeMap['.edf']).toBe('sensor');
      expect(result.customTypeMap['.bin']).toBe('sensor');
      expect(result.customTypeMap['.epub']).toBe('document');
    });

    it('normalizes missing dots and uppercase letters', () => {
      const json = JSON.stringify({
        sensor: ['EDF', ' bin '],
      });
      const result = parseDctTypesJson(json);
      expect(result.warnings).toHaveLength(0);
      expect(result.customTypeMap['.edf']).toBe('sensor');
      expect(result.customTypeMap['.bin']).toBe('sensor');
    });

    it('reports warning for invalid JSON syntax', () => {
      const result = parseDctTypesJson('{ invalid: json');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Invalid JSON syntax');
      expect(result.customTypeMap).toEqual({});
    });

    it('reports warning when root is not an object', () => {
      const result = parseDctTypesJson('["sensor", ".edf"]');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('must be a JSON object');
    });

    it('reports warning for unknown asset types', () => {
      const json = JSON.stringify({
        unsupported_type: ['.xyz'],
        image: ['.custom_img'],
      });
      const result = parseDctTypesJson(json);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("Unknown asset type 'unsupported_type'");
      expect(result.customTypeMap['.custom_img']).toBe('image');
    });

    it('reports warning when type value is not an array', () => {
      const json = JSON.stringify({
        sensor: '.csv',
      });
      const result = parseDctTypesJson(json);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('must be an array');
    });

    it('skips non-string items within arrays', () => {
      const json = JSON.stringify({
        sensor: [123, null, '.mydata'],
      });
      const result = parseDctTypesJson(json);
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      expect(result.customTypeMap['.mydata']).toBe('sensor');
    });
  });

  describe('Custom Overrides Application', () => {
    it('allows custom overrides to re-map default extensions', () => {
      const customMap = {
        '.csv': 'document' as const,
      };
      expect(classifyAsset('data.csv', customMap)).toBe('document');
    });

    it('maps proprietary extensions via custom map', () => {
      const customMap = {
        '.rig': 'sensor' as const,
      };
      expect(classifyAsset('capture.rig', customMap)).toBe('sensor');
    });

    it('falls back to default mappings for unmapped extensions', () => {
      const customMap = {
        '.rig': 'sensor' as const,
      };
      expect(classifyAsset('photo.png', customMap)).toBe('image');
    });
  });

  describe('Native Preview Capability', () => {
    it('identifies formats with native browser preview', () => {
      expect(hasNativePreview('image', 'photo.png')).toBe(true);
      expect(hasNativePreview('image', 'photo.jpg')).toBe(true);
      expect(hasNativePreview('video', 'movie.mp4')).toBe(true);
      expect(hasNativePreview('audio', 'voice.wav')).toBe(true);
      expect(hasNativePreview('document', 'doc.pdf')).toBe(true);
      expect(hasNativePreview('sensor', 'stream.csv')).toBe(true);
    });

    it('identifies formats without native browser preview', () => {
      expect(hasNativePreview('image', 'photo.heic')).toBe(false);
      expect(hasNativePreview('video', 'movie.mkv')).toBe(false);
      expect(hasNativePreview('document', 'doc.docx')).toBe(false);
      expect(hasNativePreview('other', 'file.xyz')).toBe(false);
    });
  });
});
