import { describe, it, expect } from 'vitest';
import {
  normalizeAssetPath,
  isIgnoredFile,
  isIgnoredDirectory,
  scanFolder,
} from '../../../src/folder/scanner';
import {
  createMockDirectoryHandle,
  MockFileEntry,
  MockDirectoryEntry,
} from './mockFileSystem';

describe('Folder Scanner', () => {
  describe('Path Normalization', () => {
    it('normalizes flat and nested paths with forward slashes', () => {
      expect(normalizeAssetPath('IMG-0001.png')).toBe('IMG-0001.png');
      expect(normalizeAssetPath('sub/x.png')).toBe('sub/x.png');
      expect(normalizeAssetPath('sub\\nested\\image.png')).toBe('sub/nested/image.png');
      expect(normalizeAssetPath('./sub//nested///image.png')).toBe('sub/nested/image.png');
      expect(normalizeAssetPath('/root/file.png/')).toBe('root/file.png');
    });
  });

  describe('Ignore Filters', () => {
    it('identifies hidden files as ignored', () => {
      expect(isIgnoredFile('.DS_Store')).toBe(true);
      expect(isIgnoredFile('.gitkeep')).toBe(true);
      expect(isIgnoredFile('.dct-progress.json')).toBe(true);
      expect(isIgnoredFile('normal_file.png')).toBe(false);
    });

    it('identifies export CSV files as ignored', () => {
      expect(isIgnoredFile('asset_export_LAB-A-2026-11-04-01_20261104T100000Z.csv')).toBe(true);
      expect(isIgnoredFile('asset_export.sample.csv')).toBe(true);
      expect(isIgnoredFile('asset_export.correction.sample.csv')).toBe(true);
      expect(isIgnoredFile('asset_export_presentation.png')).toBe(false);
      expect(isIgnoredFile('my_asset_export_data.tsv')).toBe(false);
    });

    it('identifies hidden directories as ignored', () => {
      expect(isIgnoredDirectory('.git')).toBe(true);
      expect(isIgnoredDirectory('.vscode')).toBe(true);
      expect(isIgnoredDirectory('subfolder')).toBe(false);
    });
  });

  describe('scanFolder Execution', () => {
    it('scans sample collection layout with 8 assets and expected types (T-01)', async () => {
      const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
        { kind: 'file', name: 'IMG-0001.png' },
        { kind: 'file', name: 'IMG-0002.png' },
        { kind: 'file', name: 'IMG-0003.png' },
        { kind: 'file', name: 'IMG-0004.png' },
        { kind: 'file', name: 'VID-0005.mp4' },
        { kind: 'file', name: 'AUD-0006.wav' },
        { kind: 'file', name: 'SNS-0007.csv' },
        { kind: 'file', name: 'DOC-0008.pdf' },
        { kind: 'file', name: '.DS_Store' },
        { kind: 'file', name: '.dct-progress.json' },
        { kind: 'file', name: 'asset_export_LAB-A.csv' },
      ];

      const dirHandle = createMockDirectoryHandle('sample-collection', mockEntries);
      const result = await scanFolder(dirHandle);

      expect(result.folderName).toBe('sample-collection');
      expect(result.assets).toHaveLength(8);
      expect(result.warnings).toHaveLength(0);

      const typeCounts = result.assets.reduce(
        (acc, a) => {
          acc[a.assetType] = (acc[a.assetType] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      expect(typeCounts['image']).toBe(4);
      expect(typeCounts['video']).toBe(1);
      expect(typeCounts['audio']).toBe(1);
      expect(typeCounts['sensor']).toBe(1);
      expect(typeCounts['document']).toBe(1);
    });

    it('recurses into subdirectories with normalized forward slashes', async () => {
      const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
        { kind: 'file', name: 'root.png' },
        {
          kind: 'directory',
          name: 'session_01',
          entries: [
            { kind: 'file', name: 'cam1.mp4' },
            {
              kind: 'directory',
              name: 'sensors',
              entries: [{ kind: 'file', name: 'accel.csv' }],
            },
          ],
        },
      ];

      const dirHandle = createMockDirectoryHandle('root', mockEntries);
      const result = await scanFolder(dirHandle);

      expect(result.assets).toHaveLength(3);
      expect(result.assets.map((a) => a.assetId)).toEqual([
        'root.png',
        'session_01/cam1.mp4',
        'session_01/sensors/accel.csv',
      ]);
    });

    it('sorts assets deterministically by assetId', async () => {
      const scrambledEntries: MockFileEntry[] = [
        { kind: 'file', name: 'VID-0005.mp4' },
        { kind: 'file', name: 'DOC-0008.pdf' },
        { kind: 'file', name: 'IMG-0001.png' },
        { kind: 'file', name: 'AUD-0006.wav' },
      ];

      const dirHandle = createMockDirectoryHandle('scrambled', scrambledEntries);
      const result = await scanFolder(dirHandle);

      expect(result.assets.map((a) => a.assetId)).toEqual([
        'AUD-0006.wav',
        'DOC-0008.pdf',
        'IMG-0001.png',
        'VID-0005.mp4',
      ]);
    });

    it('reads and applies dct-types.json while excluding it from assets list', async () => {
      const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
        {
          kind: 'file',
          name: 'dct-types.json',
          content: JSON.stringify({ sensor: ['.custom_log'] }),
        },
        { kind: 'file', name: 'data.custom_log' },
        { kind: 'file', name: 'regular.png' },
      ];

      const dirHandle = createMockDirectoryHandle('custom_root', mockEntries);
      const result = await scanFolder(dirHandle);

      expect(result.assets).toHaveLength(2);
      expect(result.assets.find((a) => a.assetId === 'dct-types.json')).toBeUndefined();

      const customAsset = result.assets.find((a) => a.assetId === 'data.custom_log');
      expect(customAsset?.assetType).toBe('sensor');

      const regularAsset = result.assets.find((a) => a.assetId === 'regular.png');
      expect(regularAsset?.assetType).toBe('image');
    });

    it('surfaces warnings for malformed dct-types.json without halting scan', async () => {
      const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
        {
          kind: 'file',
          name: 'dct-types.json',
          content: '{ bad_json',
        },
        { kind: 'file', name: 'regular.png' },
      ];

      const dirHandle = createMockDirectoryHandle('warning_root', mockEntries);
      const result = await scanFolder(dirHandle);

      expect(result.assets).toHaveLength(1);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Invalid JSON syntax');
    });

    it('handles empty folders cleanly', async () => {
      const dirHandle = createMockDirectoryHandle('empty', []);
      const result = await scanFolder(dirHandle);
      expect(result.assets).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });
});
