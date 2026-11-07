import { describe, it, expect } from 'vitest';
import {
  normalizeAssetPath,
  isIgnoredFile,
  isIgnoredDirectory,
  scanFolder,
} from '../../../src/folder/scanner';
import {
  classifyAsset,
  parseDctTypesJson,
  hasNativePreview,
} from '../../../src/folder/classifier';
import {
  createMockDirectoryHandle,
  MockFileEntry,
  MockDirectoryEntry,
} from './mockFileSystem';

describe('Adversarial Stress Testing — Milestone 2', () => {
  // =========================================================================
  // Mission 1: Deep Recursive Directory Structures (5+ levels deep)
  // =========================================================================
  describe('Mission 1: Deep Recursive Traversal', () => {
    it('traverses deeply nested linear folders (7 levels deep) with correct forward slashes', async () => {
      const mockEntries: MockDirectoryEntry[] = [
        {
          kind: 'directory',
          name: 'level1',
          entries: [
            {
              kind: 'directory',
              name: 'level2',
              entries: [
                {
                  kind: 'directory',
                  name: 'level3',
                  entries: [
                    {
                      kind: 'directory',
                      name: 'level4',
                      entries: [
                        {
                          kind: 'directory',
                          name: 'level5',
                          entries: [
                            {
                              kind: 'directory',
                              name: 'level6',
                              entries: [
                                {
                                  kind: 'directory',
                                  name: 'level7',
                                  entries: [
                                    { kind: 'file', name: 'deep_leaf.png' },
                                    { kind: 'file', name: 'deep_sensor.csv' },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const dirHandle = createMockDirectoryHandle('deep_linear', mockEntries);
      const result = await scanFolder(dirHandle);

      expect(result.warnings).toHaveLength(0);
      expect(result.assets).toHaveLength(2);
      expect(result.assets.map((a) => a.assetId)).toEqual([
        'level1/level2/level3/level4/level5/level6/level7/deep_leaf.png',
        'level1/level2/level3/level4/level5/level6/level7/deep_sensor.csv',
      ]);
      expect(result.assets[0]!.assetType).toBe('image');
      expect(result.assets[1]!.assetType).toBe('sensor');
    });

    it('traverses asymmetric multi-branch trees across varying depths with deterministic sorting', async () => {
      const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
        { kind: 'file', name: 'root_image.png' },
        {
          kind: 'directory',
          name: 'branch_a',
          entries: [
            { kind: 'file', name: 'a_depth2.wav' },
            {
              kind: 'directory',
              name: 'branch_a_sub',
              entries: [
                {
                  kind: 'directory',
                  name: 'depth4',
                  entries: [
                    {
                      kind: 'directory',
                      name: 'depth5',
                      entries: [{ kind: 'file', name: 'a_depth6.mp4' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          kind: 'directory',
          name: 'branch_b',
          entries: [
            {
              kind: 'directory',
              name: 'depth3',
              entries: [{ kind: 'file', name: 'b_depth4.pdf' }],
            },
          ],
        },
      ];

      const dirHandle = createMockDirectoryHandle('multi_branch', mockEntries);
      const result = await scanFolder(dirHandle);

      expect(result.warnings).toHaveLength(0);
      expect(result.assets).toHaveLength(4);
      expect(result.assets.map((a) => a.assetId)).toEqual([
        'branch_a/a_depth2.wav',
        'branch_a/branch_a_sub/depth4/depth5/a_depth6.mp4',
        'branch_b/depth3/b_depth4.pdf',
        'root_image.png',
      ]);
      expect(result.assets.map((a) => a.assetType)).toEqual([
        'audio',
        'video',
        'document',
        'image',
      ]);
    });

    it('prunes hidden directories at any depth without descending into them', async () => {
      const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
        {
          kind: 'directory',
          name: 'legit_dir',
          entries: [
            { kind: 'file', name: 'valid.png' },
            {
              kind: 'directory',
              name: '.git',
              entries: [
                {
                  kind: 'directory',
                  name: 'objects',
                  entries: [
                    { kind: 'file', name: 'commit_hash.bin' },
                    { kind: 'file', name: 'data.csv' },
                  ],
                },
              ],
            },
            {
              kind: 'directory',
              name: '.hidden_cache',
              entries: [{ kind: 'file', name: 'cached.jpg' }],
            },
          ],
        },
      ];

      const dirHandle = createMockDirectoryHandle('hidden_tree', mockEntries);
      const result = await scanFolder(dirHandle);

      expect(result.warnings).toHaveLength(0);
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0]!.assetId).toBe('legit_dir/valid.png');
    });

    it('filters ignored files even when deeply nested in level 5+ directories', async () => {
      const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
        {
          kind: 'directory',
          name: 'l1',
          entries: [
            {
              kind: 'directory',
              name: 'l2',
              entries: [
                {
                  kind: 'directory',
                  name: 'l3',
                  entries: [
                    {
                      kind: 'directory',
                      name: 'l4',
                      entries: [
                        {
                          kind: 'directory',
                          name: 'l5',
                          entries: [
                            { kind: 'file', name: '.DS_Store' },
                            { kind: 'file', name: '.dct-progress.json' },
                            { kind: 'file', name: 'asset_export_session_01.csv' },
                            { kind: 'file', name: 'legit_audio.wav' },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const dirHandle = createMockDirectoryHandle('deep_ignore', mockEntries);
      const result = await scanFolder(dirHandle);

      expect(result.assets).toHaveLength(1);
      expect(result.assets[0]!.assetId).toBe('l1/l2/l3/l4/l5/legit_audio.wav');
    });

    it('handles empty subdirectories at arbitrary depths gracefully', async () => {
      const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
        {
          kind: 'directory',
          name: 'l1',
          entries: [
            {
              kind: 'directory',
              name: 'empty_l2',
              entries: [
                {
                  kind: 'directory',
                  name: 'empty_l3',
                  entries: [],
                },
              ],
            },
            { kind: 'file', name: 'survivor.png' },
          ],
        },
      ];

      const dirHandle = createMockDirectoryHandle('empty_branches', mockEntries);
      const result = await scanFolder(dirHandle);

      expect(result.assets).toHaveLength(1);
      expect(result.assets[0]!.assetId).toBe('l1/survivor.png');
      expect(result.warnings).toHaveLength(0);
    });
  });

  // =========================================================================
  // Mission 2: Path Separator Normalization
  // =========================================================================
  describe('Mission 2: Path Separator Normalization', () => {
    it('normalizes single and multiple Windows backslashes to forward slashes', () => {
      expect(normalizeAssetPath('sub\\nested\\image.png')).toBe('sub/nested/image.png');
      expect(normalizeAssetPath('a\\b\\c\\d\\e\\file.txt')).toBe('a/b/c/d/e/file.txt');
      expect(normalizeAssetPath('sub\\\\nested\\\\\\image.png')).toBe('sub/nested/image.png');
    });

    it('normalizes mixed forward and backward slashes seamlessly', () => {
      expect(normalizeAssetPath('a/b\\c/d\\e/file.mp4')).toBe('a/b/c/d/e/file.mp4');
      expect(normalizeAssetPath('session_01\\cam1/angle2\\frame_001.png')).toBe(
        'session_01/cam1/angle2/frame_001.png'
      );
    });

    it('handles leading and trailing slashes and relative prefixes', () => {
      expect(normalizeAssetPath('.\\sub\\file.png')).toBe('sub/file.png');
      expect(normalizeAssetPath('.\\.\\.\\nested\\file.png')).toBe('nested/file.png');
      expect(normalizeAssetPath('\\\\server\\share\\file.png')).toBe('server/share/file.png');
      expect(normalizeAssetPath('/root/folder/file.png/')).toBe('root/folder/file.png');
      expect(normalizeAssetPath('folder\\file.png\\\\')).toBe('folder/file.png');
    });

    it('guarantees that mock handles or OS paths injecting backslashes produce zero backslashes in assetId', async () => {
      const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
        {
          kind: 'directory',
          name: 'folder\\sub',
          entries: [
            { kind: 'file', name: 'win\\nested\\file.png' },
          ],
        },
      ];

      const dirHandle = createMockDirectoryHandle('win_root', mockEntries);
      const result = await scanFolder(dirHandle);

      expect(result.assets).toHaveLength(1);
      const assetId = result.assets[0]!.assetId;
      expect(assetId).not.toContain('\\');
      expect(assetId).toBe('folder/sub/win/nested/file.png');
      expect(assetId).not.toContain('//');
    });
  });

  // =========================================================================
  // Mission 3: Edge Case Filenames
  // =========================================================================
  describe('Mission 3: Edge Case Filenames', () => {
    it('correctly identifies and rejects hidden dotfiles and dot directories', () => {
      expect(isIgnoredFile('.DS_Store')).toBe(true);
      expect(isIgnoredFile('.hidden')).toBe(true);
      expect(isIgnoredFile('.gitkeep')).toBe(true);
      expect(isIgnoredFile('.gitignore')).toBe(true);
      expect(isIgnoredFile('.bashrc')).toBe(true);
      expect(isIgnoredFile('.dct-progress.json')).toBe(true);

      expect(isIgnoredDirectory('.git')).toBe(true);
      expect(isIgnoredDirectory('.hidden_dir')).toBe(true);
      expect(isIgnoredDirectory('.cache')).toBe(true);

      // Normal files starting with non-dot must not be ignored
      expect(isIgnoredFile('normal.DS_Store')).toBe(false);
      expect(isIgnoredFile('dot.in.the.middle.png')).toBe(false);
      expect(isIgnoredDirectory('subfolder')).toBe(false);
    });

    it('correctly filters out application export CSV files (case-insensitive)', () => {
      expect(isIgnoredFile('asset_export.csv')).toBe(true);
      expect(isIgnoredFile('asset_export_123.csv')).toBe(true);
      expect(isIgnoredFile('asset_export.sample.csv')).toBe(true);
      expect(isIgnoredFile('asset_export.correction.sample.csv')).toBe(true);
      expect(isIgnoredFile('asset_export_LAB-A-2026-11-04-01_20261104T100000Z.csv')).toBe(true);
      // Case variations
      expect(isIgnoredFile('ASSET_EXPORT_123.CSV')).toBe(true);
      expect(isIgnoredFile('Asset_Export_Sample.Csv')).toBe(true);

      // Non-export files or different extensions must NOT be ignored
      expect(isIgnoredFile('asset_export.txt')).toBe(false);
      expect(isIgnoredFile('asset_export.png')).toBe(false);
      expect(isIgnoredFile('my_asset_export.csv')).toBe(false);
      expect(isIgnoredFile('not_an_asset_export.csv')).toBe(false);
    });

    it('classifies uppercase extensions identically to lowercase extensions', () => {
      expect(classifyAsset('IMG_001.PNG')).toBe('image');
      expect(classifyAsset('IMG_002.JPG')).toBe('image');
      expect(classifyAsset('IMG_003.JPEG')).toBe('image');
      expect(classifyAsset('CLIP_001.MP4')).toBe('video');
      expect(classifyAsset('CLIP_002.MOV')).toBe('video');
      expect(classifyAsset('AUDIO_001.WAV')).toBe('audio');
      expect(classifyAsset('AUDIO_002.MP3')).toBe('audio');
      expect(classifyAsset('DATA_001.CSV')).toBe('sensor');
      expect(classifyAsset('DOC_001.PDF')).toBe('document');

      // Mixed-case extensions
      expect(classifyAsset('photo.PnG')).toBe('image');
      expect(classifyAsset('clip.Mp4')).toBe('video');
      expect(classifyAsset('sound.WaV')).toBe('audio');
      expect(classifyAsset('sensor.CsV')).toBe('sensor');
      expect(classifyAsset('report.PdF')).toBe('document');
    });

    it('classifies unknown extensions and unsupported formats as "other"', () => {
      expect(classifyAsset('archive.xyz')).toBe('other');
      expect(classifyAsset('model.bin_custom')).toBe('other');
      expect(classifyAsset('library.dll')).toBe('other');
      expect(classifyAsset('backup.bak')).toBe('other');
      expect(classifyAsset('firmware.hex')).toBe('other');
      expect(hasNativePreview('other', 'archive.xyz')).toBe(false);
    });

    it('classifies extensionless files, trailing dots, and numeric extensions as "other"', () => {
      expect(classifyAsset('README')).toBe('other');
      expect(classifyAsset('LICENSE')).toBe('other');
      expect(classifyAsset('Makefile')).toBe('other');
      expect(classifyAsset('Dockerfile')).toBe('other');
      expect(classifyAsset('INSTALL')).toBe('other');
      expect(classifyAsset('trailing_dot.')).toBe('other');
      expect(classifyAsset('double_dot..')).toBe('other');
      expect(classifyAsset('backup.20261104')).toBe('other');
    });

    it('handles files with multiple dots before the extension correctly', () => {
      expect(classifyAsset('archive.tar.gz')).toBe('other');
      expect(classifyAsset('bundle.min.js')).toBe('other');
      expect(classifyAsset('scan.v2.preview.final.png')).toBe('image');
      expect(classifyAsset('recording.session.take1.wav')).toBe('audio');
      expect(classifyAsset('sensor.run.001.csv')).toBe('sensor');
    });
  });

  // =========================================================================
  // Mission 4: Custom dct-types.json Robustness
  // =========================================================================
  describe('Mission 4: Custom dct-types.json Robustness', () => {
    it('handles malformed JSON syntax with descriptive warnings without crashing', () => {
      const malformedCases = [
        '{ truncated: json',
        '<!DOCTYPE html><html></html>',
        '{ "sensor": [".dat", }',
        'undefined',
        '',
      ];

      for (const badJson of malformedCases) {
        const result = parseDctTypesJson(badJson);
        expect(result.customTypeMap).toEqual({});
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('Invalid JSON syntax');
      }
    });

    it('handles non-object JSON roots with descriptive warnings', () => {
      const nonObjectRoots = [
        '["sensor", ".dat"]',
        '"string literal"',
        '42',
        'true',
        'null',
      ];

      for (const root of nonObjectRoots) {
        const result = parseDctTypesJson(root);
        expect(result.customTypeMap).toEqual({});
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('must be a JSON object');
      }
    });

    it('handles empty mapping and empty arrays cleanly without warnings', () => {
      const emptyResult = parseDctTypesJson('{}');
      expect(emptyResult.warnings).toHaveLength(0);
      expect(emptyResult.customTypeMap).toEqual({});

      const emptyArraysResult = parseDctTypesJson(
        JSON.stringify({
          image: [],
          video: [],
          sensor: [],
        })
      );
      expect(emptyArraysResult.warnings).toHaveLength(0);
      expect(emptyArraysResult.customTypeMap).toEqual({});
    });

    it('handles malformed values within valid JSON objects and ignores them with warnings', () => {
      const json = JSON.stringify({
        sensor: 'not-an-array',
        video: 12345,
        audio: null,
        document: ['.valid_doc'],
      });

      const result = parseDctTypesJson(json);
      expect(result.warnings.length).toBe(3);
      expect(result.customTypeMap['.valid_doc']).toBe('document');
      expect(result.customTypeMap['.csv']).toBeUndefined();
    });

    it('ignores non-string items inside type arrays while preserving valid strings', () => {
      const json = JSON.stringify({
        sensor: [null, 123, false, {}, [], '.custom_sensor'],
      });

      const result = parseDctTypesJson(json);
      expect(result.warnings.length).toBe(5);
      expect(result.customTypeMap['.custom_sensor']).toBe('sensor');
    });

    it('overrides built-in extensions with custom mappings', () => {
      const json = JSON.stringify({
        document: ['.csv'], // .csv is normally sensor
        sensor: ['.mp4'],   // .mp4 is normally video
        other: ['.png'],    // .png is normally image
      });

      const { customTypeMap } = parseDctTypesJson(json);

      expect(classifyAsset('data.csv', customTypeMap)).toBe('document');
      expect(classifyAsset('video.mp4', customTypeMap)).toBe('sensor');
      expect(classifyAsset('photo.png', customTypeMap)).toBe('other');
      // Unmentioned extensions retain default classification
      expect(classifyAsset('audio.wav', customTypeMap)).toBe('audio');
    });

    it('normalizes custom extensions: strips whitespace, prepends dots, and handles case insensitivity', () => {
      const json = JSON.stringify({
        sensor: ['  XYZ  ', '.BiN_Custom', 'log_data'],
        document: ['EPUB', '  .MoBi  '],
      });

      const { customTypeMap, warnings } = parseDctTypesJson(json);
      expect(warnings).toHaveLength(0);

      // Verify custom map has lowercase keys with leading dot
      expect(customTypeMap['.xyz']).toBe('sensor');
      expect(customTypeMap['.bin_custom']).toBe('sensor');
      expect(customTypeMap['.log_data']).toBe('sensor');
      expect(customTypeMap['.epub']).toBe('document');
      expect(customTypeMap['.mobi']).toBe('document');

      // Test classification with uppercase, lowercase, and mixed-case file names
      expect(classifyAsset('data.XYZ', customTypeMap)).toBe('sensor');
      expect(classifyAsset('data.xyz', customTypeMap)).toBe('sensor');
      expect(classifyAsset('data.XyZ', customTypeMap)).toBe('sensor');
      expect(classifyAsset('book.epub', customTypeMap)).toBe('document');
      expect(classifyAsset('book.EPUB', customTypeMap)).toBe('document');
      expect(classifyAsset('device.LOG_DATA', customTypeMap)).toBe('sensor');
    });

    it('applies root dct-types.json during scanFolder while excluding it from assets list', async () => {
      const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
        {
          kind: 'file',
          name: 'dct-types.json',
          content: JSON.stringify({
            sensor: ['.custom_log', 'ACCEL'],
          }),
        },
        { kind: 'file', name: 'device1.custom_log' },
        { kind: 'file', name: 'device2.ACCEL' },
        { kind: 'file', name: 'regular.png' },
      ];

      const dirHandle = createMockDirectoryHandle('custom_scan_root', mockEntries);
      const result = await scanFolder(dirHandle);

      expect(result.warnings).toHaveLength(0);
      expect(result.assets).toHaveLength(3);
      expect(result.assets.find((a) => a.assetId === 'dct-types.json')).toBeUndefined();

      const logAsset = result.assets.find((a) => a.assetId === 'device1.custom_log');
      expect(logAsset?.assetType).toBe('sensor');

      const accelAsset = result.assets.find((a) => a.assetId === 'device2.ACCEL');
      expect(accelAsset?.assetType).toBe('sensor');

      const regularAsset = result.assets.find((a) => a.assetId === 'regular.png');
      expect(regularAsset?.assetType).toBe('image');
    });

    it('surfaces warnings in scanFolder when root dct-types.json is malformed and falls back to default types', async () => {
      const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
        {
          kind: 'file',
          name: 'dct-types.json',
          content: '{ bad_json',
        },
        { kind: 'file', name: 'device.custom_ext' },
        { kind: 'file', name: 'regular.png' },
      ];

      const dirHandle = createMockDirectoryHandle('bad_custom_root', mockEntries);
      const result = await scanFolder(dirHandle);

      expect(result.assets).toHaveLength(2);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Invalid JSON syntax in dct-types.json');

      const customExtAsset = result.assets.find((a) => a.assetId === 'device.custom_ext');
      expect(customExtAsset?.assetType).toBe('other'); // default fallback
      const regularAsset = result.assets.find((a) => a.assetId === 'regular.png');
      expect(regularAsset?.assetType).toBe('image');
    });
  });
});
