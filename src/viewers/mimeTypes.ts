const EXTENSION_MIME_MAP: Record<string, string> = {
  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',

  // Videos
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',

  // Audio
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/opus',
  '.flac': 'audio/flac',

  // Documents
  '.pdf': 'application/pdf',
};

export function inferMimeType(fileNameOrPath: string): string | undefined {
  const lastDot = fileNameOrPath.lastIndexOf('.');
  if (lastDot === -1) {
    return undefined;
  }
  const ext = fileNameOrPath.slice(lastDot).toLowerCase();
  return EXTENSION_MIME_MAP[ext];
}

/**
 * Creates a typed blob URL without duplicating bytes or mutating the raw file.
 * Ensures mock File handles or files with missing .type render natively in
 * <img>, <video>, <audio>, and PDF <iframe> viewers under strict CSP.
 */
export function createTypedBlobUrl(file: File, fileNameOrPath: string): string {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return '';
  }
  const mime = file.type || inferMimeType(fileNameOrPath);
  if (mime && file.type !== mime && typeof file.slice === 'function') {
    const typedSlice = file.slice(0, file.size, mime);
    return URL.createObjectURL(typedSlice);
  }
  return URL.createObjectURL(file);
}

export function safeRevokeBlobUrl(url: string | null | undefined): void {
  if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

export function formatDurationSeconds(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
