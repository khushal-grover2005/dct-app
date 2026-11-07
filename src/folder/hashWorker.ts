import { StreamingSha256 } from './sha256';
import { WorkerInboundMessage, WorkerOutboundMessage } from './types';

const cancelledJobs = new Set<string>();

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB chunks

function postMessageToMain(msg: WorkerOutboundMessage): void {
  self.postMessage(msg);
}

async function hashSmallFileWithSubtleCrypto(
  file: File | Blob
): Promise<string | null> {
  if (typeof self.crypto?.subtle?.digest !== 'function') {
    return null;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const digestBuffer = await self.crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(digestBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

async function processHashJob(
  jobId: string,
  assetId: string,
  file: File | Blob,
  chunkSizeBytes: number = DEFAULT_CHUNK_SIZE
): Promise<void> {
  const startTime = performance.now();
  const totalBytes = file.size;

  if (totalBytes === 0) {
    const hasher = new StreamingSha256();
    const sha256 = hasher.digest();
    postMessageToMain({
      type: 'DONE',
      jobId,
      assetId,
      sha256,
      totalBytes: 0,
      durationMs: performance.now() - startTime,
    });
    return;
  }

  // Strategy 1: Fast native SubtleCrypto path for small files (<= 8 MB)
  if (totalBytes <= chunkSizeBytes) {
    const subtleHash = await hashSmallFileWithSubtleCrypto(file);
    if (subtleHash) {
      if (cancelledJobs.has(jobId)) {
        cancelledJobs.delete(jobId);
        postMessageToMain({ type: 'CANCELLED', jobId, assetId });
        return;
      }

      postMessageToMain({
        type: 'PROGRESS',
        jobId,
        assetId,
        bytesProcessed: totalBytes,
        totalBytes,
        percent: 100,
      });

      postMessageToMain({
        type: 'DONE',
        jobId,
        assetId,
        sha256: subtleHash,
        totalBytes,
        durationMs: performance.now() - startTime,
      });
      return;
    }
  }

  // Strategy 2: Constant-memory StreamingSha256 for large files (> 8 MB) or fallback
  const hasher = new StreamingSha256();
  let offset = 0;

  while (offset < totalBytes) {
    if (cancelledJobs.has(jobId)) {
      cancelledJobs.delete(jobId);
      postMessageToMain({ type: 'CANCELLED', jobId, assetId });
      return;
    }

    const nextOffset = Math.min(offset + chunkSizeBytes, totalBytes);
    const slice = file.slice(offset, nextOffset);
    const chunkBuffer = await slice.arrayBuffer();

    hasher.update(new Uint8Array(chunkBuffer));
    offset = nextOffset;

    const percent = Math.round((offset / totalBytes) * 100);
    postMessageToMain({
      type: 'PROGRESS',
      jobId,
      assetId,
      bytesProcessed: offset,
      totalBytes,
      percent,
    });

    // Yield to avoid blocking event loop
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (cancelledJobs.has(jobId)) {
    cancelledJobs.delete(jobId);
    postMessageToMain({ type: 'CANCELLED', jobId, assetId });
    return;
  }

  const sha256 = hasher.digest();
  const durationMs = performance.now() - startTime;

  postMessageToMain({
    type: 'DONE',
    jobId,
    assetId,
    sha256,
    totalBytes,
    durationMs,
  });
}

self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.type === 'CANCEL') {
    cancelledJobs.add(message.jobId);
    return;
  }

  if (message.type === 'HASH_FILE') {
    try {
      await processHashJob(
        message.jobId,
        message.assetId,
        message.file,
        message.chunkSizeBytes
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      postMessageToMain({
        type: 'ERROR',
        jobId: message.jobId,
        assetId: message.assetId,
        error: errorMsg,
      });
    }
  }
};
