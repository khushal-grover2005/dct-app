import { AssetType, CustomTypeMap } from './types';

export const VALID_ASSET_TYPES: readonly AssetType[] = [
  'image',
  'video',
  'audio',
  'sensor',
  'document',
  'other',
] as const;

export const DEFAULT_TYPE_EXTENSIONS: Record<AssetType, string[]> = {
  image: [
    // Preview supported
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
    '.bmp',
    '.avif',
    // No preview fallback
    '.heic',
    '.heif',
    '.tif',
    '.tiff',
    '.raw',
    '.dng',
    '.cr2',
    '.nef',
    '.arw',
  ],
  video: [
    // Preview supported
    '.mp4',
    '.m4v',
    '.mov',
    '.webm',
    // No preview fallback
    '.mkv',
    '.avi',
    '.wmv',
    '.mts',
    '.3gp',
  ],
  audio: [
    // Preview supported
    '.wav',
    '.mp3',
    '.m4a',
    '.aac',
    '.ogg',
    '.oga',
    '.opus',
    '.flac',
  ],
  sensor: [
    '.csv',
    '.tsv',
    '.json',
    '.jsonl',
    '.txt',
    '.log',
    '.edf',
    '.bin',
    '.dat',
  ],
  document: [
    // Preview supported
    '.pdf',
    // No preview fallback
    '.doc',
    '.docx',
    '.odt',
    '.rtf',
  ],
  other: [],
};

export interface ParseDctTypesResult {
  customTypeMap: CustomTypeMap;
  warnings: string[];
}

export function parseDctTypesJson(jsonString: string): ParseDctTypesResult {
  const warnings: string[] = [];
  const customTypeMap: CustomTypeMap = {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`Invalid JSON syntax in dct-types.json: ${message}`);
    return { customTypeMap, warnings };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    warnings.push('dct-types.json must be a JSON object mapping asset types to extension lists.');
    return { customTypeMap, warnings };
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  for (const [key, value] of entries) {
    if (!VALID_ASSET_TYPES.includes(key as AssetType)) {
      warnings.push(`Unknown asset type '${key}' in dct-types.json ignored.`);
      continue;
    }

    if (!Array.isArray(value)) {
      warnings.push(`Value for asset type '${key}' in dct-types.json must be an array of string extensions.`);
      continue;
    }

    const assetType = key as AssetType;
    for (const item of value) {
      if (typeof item !== 'string') {
        warnings.push(`Skipping non-string extension in '${key}': ${String(item)}`);
        continue;
      }

      const trimmed = item.trim().toLowerCase();
      if (!trimmed) {
        continue;
      }

      const normalizedExt = trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
      customTypeMap[normalizedExt] = assetType;
    }
  }

  return { customTypeMap, warnings };
}

export function classifyAsset(
  fileNameOrPath: string,
  customTypeMap?: CustomTypeMap
): AssetType {
  const lastDot = fileNameOrPath.lastIndexOf('.');
  if (lastDot === -1 || lastDot === fileNameOrPath.length - 1) {
    return 'other';
  }

  const ext = fileNameOrPath.slice(lastDot).toLowerCase();

  if (customTypeMap && ext in customTypeMap) {
    const mapped = customTypeMap[ext];
    if (mapped) {
      return mapped;
    }
  }

  for (const [type, extensions] of Object.entries(DEFAULT_TYPE_EXTENSIONS)) {
    if (extensions.includes(ext)) {
      return type as AssetType;
    }
  }

  return 'other';
}

export function hasNativePreview(assetType: AssetType, fileNameOrPath: string): boolean {
  const lastDot = fileNameOrPath.lastIndexOf('.');
  if (lastDot === -1) {
    return false;
  }
  const ext = fileNameOrPath.slice(lastDot).toLowerCase();

  switch (assetType) {
    case 'image':
      return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'].includes(ext);
    case 'video':
      return ['.mp4', '.m4v', '.mov', '.webm'].includes(ext);
    case 'audio':
      return ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac'].includes(ext);
    case 'sensor':
      return ['.csv', '.tsv', '.json', '.jsonl', '.txt', '.log'].includes(ext);
    case 'document':
      return ext === '.pdf';
    default:
      return false;
  }
}
