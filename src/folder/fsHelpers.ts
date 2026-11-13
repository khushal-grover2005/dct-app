import { normalizeAssetPath } from './scanner';

export interface ResolvedAssetPath {
  dirHandle: FileSystemDirectoryHandle;
  fileName: string;
}

/**
 * Traverses subdirectories under `rootHandle` along forward-slash segments of `assetId`.
 */
export async function resolveParentDirectoryAndName(
  rootHandle: FileSystemDirectoryHandle,
  assetId: string
): Promise<ResolvedAssetPath> {
  const normalized = normalizeAssetPath(assetId);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Invalid empty asset path: "${assetId}"`);
  }

  const fileName = parts[parts.length - 1]!;
  let current = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]!);
  }

  return { dirHandle: current, fileName };
}

/**
 * Resolves a FileSystemFileHandle for a potentially nested `assetId` (e.g. `day1/IMG-0001.png`).
 */
export async function getFileHandleByRelativePath(
  rootHandle: FileSystemDirectoryHandle,
  assetId: string
): Promise<FileSystemFileHandle> {
  const { dirHandle, fileName } = await resolveParentDirectoryAndName(rootHandle, assetId);
  return dirHandle.getFileHandle(fileName);
}

/**
 * Checks whether a file at relative path `assetId` currently exists on disk in `rootHandle`.
 */
export async function assetExistsInDirectory(
  rootHandle: FileSystemDirectoryHandle,
  assetId: string
): Promise<boolean> {
  try {
    await getFileHandleByRelativePath(rootHandle, assetId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Permanently deletes a file at relative path `assetId` from `rootHandle`.
 */
export async function removeAssetFromDirectory(
  rootHandle: FileSystemDirectoryHandle,
  assetId: string
): Promise<void> {
  const { dirHandle, fileName } = await resolveParentDirectoryAndName(rootHandle, assetId);
  if (typeof dirHandle.removeEntry !== 'function') {
    throw new Error('Directory handle does not support removeEntry.');
  }
  await dirHandle.removeEntry(fileName);
}

/**
 * Reads a File/Blob as UTF-8 text in both browser and Vitest/jsdom environments.
 */
export async function readFileTextSafe(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file text'));
    reader.readAsText(file);
  });
}
