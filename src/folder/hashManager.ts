import {
  AggregateProgress,
  HashJob,
  IngestedAsset,
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from './types';

export interface HashManagerOptions {
  maxConcurrency?: number;
  chunkSizeBytes?: number;
  workerFactory?: () => Worker;
  onAggregateProgress?: (progress: AggregateProgress) => void;
}

interface WorkerSlot {
  id: number;
  worker: Worker;
  currentJob: HashJob | null;
  currentBytesProcessed: number;
  isBusy: boolean;
}

export class HashManager {
  private maxConcurrency: number;
  private chunkSizeBytes?: number;
  private workerFactory: () => Worker;
  private slots: WorkerSlot[] = [];
  private queue: HashJob[] = [];
  private disposed = false;

  private totalAssets = 0;
  private completedAssets = 0;
  private totalBytes = 0;
  private completedBytes = 0;
  private onAggregateProgressCallback?: (progress: AggregateProgress) => void;

  constructor(options?: HashManagerOptions) {
    this.maxConcurrency = options?.maxConcurrency ?? 2;
    this.chunkSizeBytes = options?.chunkSizeBytes;
    this.onAggregateProgressCallback = options?.onAggregateProgress;

    this.workerFactory =
      options?.workerFactory ??
      (() => {
        if (typeof Worker !== 'undefined') {
          return new Worker(new URL('./hashWorker.ts', import.meta.url), {
            type: 'module',
          });
        }
        throw new Error('Web Worker is not supported in this environment');
      });
  }

  private initWorkerSlot(id: number): WorkerSlot {
    const worker = this.workerFactory();
    const slot: WorkerSlot = {
      id,
      worker,
      currentJob: null,
      currentBytesProcessed: 0,
      isBusy: false,
    };

    worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
      this.handleWorkerMessage(slot, event.data);
    };

    worker.onerror = (err: ErrorEvent) => {
      this.handleWorkerError(slot, err);
    };

    return slot;
  }

  private ensureWorkerPool(): void {
    if (this.disposed || this.slots.length >= this.maxConcurrency) {
      return;
    }

    while (this.slots.length < this.maxConcurrency) {
      const slot = this.initWorkerSlot(this.slots.length);
      this.slots.push(slot);
    }
  }

  public enqueue(job: HashJob): void {
    if (this.disposed) {
      job.onError(new Error('HashManager is already disposed'));
      return;
    }

    this.totalAssets++;
    this.totalBytes += job.file.size;
    this.queue.push(job);
    this.notifyAggregateProgress();
    this.dispatchNext();
  }

  private dispatchNext(): void {
    if (this.disposed || this.queue.length === 0) {
      return;
    }

    this.ensureWorkerPool();

    const idleSlot = this.slots.find((s) => !s.isBusy);
    if (!idleSlot) {
      return;
    }

    const job = this.queue.shift();
    if (!job) {
      return;
    }

    idleSlot.isBusy = true;
    idleSlot.currentJob = job;
    idleSlot.currentBytesProcessed = 0;

    const msg: WorkerInboundMessage = {
      type: 'HASH_FILE',
      jobId: job.jobId,
      assetId: job.assetId,
      file: job.file,
      chunkSizeBytes: this.chunkSizeBytes,
    };

    idleSlot.worker.postMessage(msg);
  }

  private handleWorkerMessage(slot: WorkerSlot, message: WorkerOutboundMessage): void {
    const job = slot.currentJob;
    if (!job || job.jobId !== message.jobId) {
      return;
    }

    switch (message.type) {
      case 'PROGRESS': {
        slot.currentBytesProcessed = message.bytesProcessed;
        job.onProgress?.({
          bytesProcessed: message.bytesProcessed,
          totalBytes: message.totalBytes,
          percent: message.percent,
        });
        this.notifyAggregateProgress();
        break;
      }

      case 'DONE': {
        this.completedAssets++;
        this.completedBytes += job.file.size;
        slot.isBusy = false;
        slot.currentJob = null;
        slot.currentBytesProcessed = 0;

        job.onDone({
          sha256: message.sha256,
          durationMs: message.durationMs,
        });

        this.notifyAggregateProgress();
        this.dispatchNext();
        break;
      }

      case 'ERROR': {
        this.completedAssets++;
        this.completedBytes += job.file.size;
        slot.isBusy = false;
        slot.currentJob = null;
        slot.currentBytesProcessed = 0;

        job.onError(new Error(message.error));
        this.notifyAggregateProgress();
        this.dispatchNext();
        break;
      }

      case 'CANCELLED': {
        this.completedAssets++;
        this.completedBytes += job.file.size;
        slot.isBusy = false;
        slot.currentJob = null;
        slot.currentBytesProcessed = 0;

        job.onCancelled?.();
        this.notifyAggregateProgress();
        this.dispatchNext();
        break;
      }
    }
  }

  private handleWorkerError(slot: WorkerSlot, err: ErrorEvent): void {
    const job = slot.currentJob;
    const errorMsg = err.message || 'Worker encounter an unhandled error';

    if (job) {
      this.completedAssets++;
      this.completedBytes += job.file.size;
      slot.isBusy = false;
      slot.currentJob = null;
      slot.currentBytesProcessed = 0;
      job.onError(new Error(errorMsg));
    }

    this.notifyAggregateProgress();
    this.dispatchNext();
  }

  private notifyAggregateProgress(): void {
    if (!this.onAggregateProgressCallback) {
      return;
    }

    let activeBytes = 0;
    for (const slot of this.slots) {
      if (slot.isBusy) {
        activeBytes += slot.currentBytesProcessed;
      }
    }

    const processedBytes = Math.min(this.completedBytes + activeBytes, this.totalBytes);
    const overallPercent =
      this.totalBytes > 0
        ? Math.min(100, Math.round((processedBytes / this.totalBytes) * 100))
        : 100;

    this.onAggregateProgressCallback({
      totalAssets: this.totalAssets,
      completedAssets: this.completedAssets,
      totalBytes: this.totalBytes,
      processedBytes,
      overallPercent,
    });
  }

  public cancelJob(jobId: string): void {
    // Check if pending in queue
    const queueIndex = this.queue.findIndex((j) => j.jobId === jobId);
    if (queueIndex !== -1) {
      const removed = this.queue.splice(queueIndex, 1)[0];
      if (removed) {
        this.completedAssets++;
        this.completedBytes += removed.file.size;
        removed.onCancelled?.();
        this.notifyAggregateProgress();
      }
      return;
    }

    // Check if active in slot
    const slot = this.slots.find((s) => s.isBusy && s.currentJob?.jobId === jobId);
    if (slot) {
      const msg: WorkerInboundMessage = { type: 'CANCEL', jobId };
      slot.worker.postMessage(msg);
    }
  }

  public cancelAll(): void {
    // Drain queue
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (job) {
        this.completedAssets++;
        this.completedBytes += job.file.size;
        job.onCancelled?.();
      }
    }

    // Cancel active slots
    for (const slot of this.slots) {
      if (slot.isBusy && slot.currentJob) {
        const msg: WorkerInboundMessage = {
          type: 'CANCEL',
          jobId: slot.currentJob.jobId,
        };
        slot.worker.postMessage(msg);
      }
    }

    this.notifyAggregateProgress();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.cancelAll();

    for (const slot of this.slots) {
      try {
        slot.worker.terminate();
      } catch {
        // Ignore termination errors
      }
    }

    this.slots = [];
    this.queue = [];
  }

  public async hashAssets(
    assets: IngestedAsset[],
    onProgress?: (aggregate: AggregateProgress) => void
  ): Promise<IngestedAsset[]> {
    if (onProgress) {
      this.onAggregateProgressCallback = onProgress;
    }

    const promises = assets.map((asset) => {
      return new Promise<void>((resolve, reject) => {
        const jobId = `job_${asset.assetId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        this.enqueue({
          jobId,
          assetId: asset.assetId,
          file: asset.file,
          onProgress: (progress) => {
            asset.hashProgress = progress.percent;
          },
          onDone: ({ sha256 }) => {
            asset.sha256 = sha256;
            asset.hashProgress = 100;
            resolve();
          },
          onError: (err) => {
            reject(err);
          },
          onCancelled: () => {
            resolve();
          },
        });
      });
    });

    await Promise.all(promises);
    return assets;
  }
}
