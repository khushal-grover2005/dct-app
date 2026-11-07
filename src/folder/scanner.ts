import {
  FolderScanOptions,
  FolderScanResult,
  IngestedAsset,
  CustomTypeMap,
} from './types';
import { classifyAsset, parseDctTypesJson } from './classifier';
import { extractCaptureTime } from './captureTime';

export function normalizeAssetPath(path: string): string {
  let normalized = path.replace(/\\/g, '/');

  // Strip leading ./
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  // Strip leading /
  while (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }

  // Collapse consecutive slashes
  normalized = normalized.replace(/\/+/g, '/');

  // Strip trailing slash
  while (normalized.endsWith('/') && normalized.length > 0) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

export function isIgnoredFile(name: string): boolean {
  if (name.startsWith('.')) {
    return true;
  }

  // Ignore export CSVs like asset_export_*.csv, asset_export.sample.csv
  if (/^asset_export.*\.csv$/i.test(name)) {
    return true;
  }

  return false;
}

export function isIgnoredDirectory(name: string): boolean {
  if (name.startsWith('.')) {
    return true;
  }
  return false;
}

async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function scanFolder(
  directoryHandle: FileSystemDirectoryHandle,
  options?: FolderScanOptions
): Promise<FolderScanResult> {
  const warnings: string[] = [];
  let effectiveCustomTypeMap: CustomTypeMap = { ...(options?.customTypeMap ?? {}) };
  const assets: IngestedAsset[] = [];
  const captureExtractor = options?.captureTimeExtractor ?? extractCaptureTime;

  // Check for root dct-types.json
  try {
    const typesHandle = await directoryHandle.getFileHandle('dct-types.json');
    const file = await typesHandle.getFile();
    const text = await readFileAsText(file);
    const parseResult = parseDctTypesJson(text);
    warnings.push(...parseResult.warnings);
    effectiveCustomTypeMap = {
      ...effectiveCustomTypeMap,
      ...parseResult.customTypeMap,
    };
  } catch {
    // dct-types.json does not exist or cannot be read; this is normal
  }

  async function traverseDirectory(
    dirHandle: FileSystemDirectoryHandle,
    prefix: string
  ): Promise<void> {
    const isRoot = prefix === '';

    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const fileName = entry.name;

        // Skip ignored files (.gitkeep, .DS_Store, .dct-progress.json, asset_export_*.csv)
        if (isIgnoredFile(fileName)) {
          continue;
        }

        // Skip dct-types.json in root folder
        if (isRoot && fileName.toLowerCase() === 'dct-types.json') {
          continue;
        }

        const relativePath = prefix ? `${prefix}/${fileName}` : fileName;
        const assetId = normalizeAssetPath(relativePath);

        try {
          const fileHandle = entry as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          const assetType = classifyAsset(assetId, effectiveCustomTypeMap);
          const timeResult = await captureExtractor(
            file,
            assetType,
            options?.timezone
          );

          assets.push({
            assetId,
            file,
            handle: fileHandle,
            assetType,
            sizeBytes: file.size,
            capturedAt: timeResult.capturedAt,
            captureTimeSource: timeResult.source,
            durationSeconds: timeResult.durationSeconds,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          warnings.push(`Failed to read asset '${relativePath}': ${message}`);
        }
      } else if (entry.kind === 'directory') {
        if (isIgnoredDirectory(entry.name)) {
          continue;
        }

        const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        const subDirHandle = entry as FileSystemDirectoryHandle;
        await traverseDirectory(subDirHandle, nextPrefix);
      }
    }
  }

  await traverseDirectory(directoryHandle, '');

  // Natural sort by assetId
  assets.sort((a, b) =>
    a.assetId.localeCompare(b.assetId, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );

  return {
    folderName: directoryHandle.name,
    assets,
    warnings,
    customTypeMap: Object.keys(effectiveCustomTypeMap).length > 0 ? effectiveCustomTypeMap : undefined,
  };
}
