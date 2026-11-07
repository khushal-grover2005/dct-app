import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import crypto from 'node:crypto';
import App from '@/app/App';
import {
  createMockDirectoryHandle,
  MockFileEntry,
  MockDirectoryEntry,
} from '../folder/mockFileSystem';
import { HashManager } from '@/folder/hashManager';
import type { WorkerInboundMessage, WorkerOutboundMessage } from '@/folder/types';

describe('Adversarial Stress Harness: Milestone 4 Start Screen & State Pipeline', () => {
  // Configurable MockWorker with termination tracking and cancellation
  class ControllableMockWorker {
    public static instances: ControllableMockWorker[] = [];
    public terminated = false;
    public pendingTimers: NodeJS.Timeout[] = [];
    public onmessage: ((e: MessageEvent<WorkerOutboundMessage>) => void) | null = null;
    public onerror: ((e: ErrorEvent) => void) | null = null;

    constructor() {
      ControllableMockWorker.instances.push(this);
    }

    postMessage(data: WorkerInboundMessage) {
      if (this.terminated) return;

      if (data.type === 'HASH_FILE') {
        const timer = setTimeout(async () => {
          if (this.terminated) return;
          try {
            const ab = await data.file.arrayBuffer();
            const nodeHash = crypto.createHash('sha256').update(Buffer.from(ab)).digest('hex');
            this.onmessage?.({
              data: {
                type: 'DONE',
                jobId: data.jobId,
                assetId: data.assetId,
                sha256: nodeHash,
                totalBytes: data.file.size,
                durationMs: 5,
              },
            } as MessageEvent<WorkerOutboundMessage>);
          } catch (err) {
            this.onerror?.(new ErrorEvent('error', { error: err }));
          }
        }, 15);
        this.pendingTimers.push(timer);
      }
    }

    terminate() {
      this.terminated = true;
      for (const t of this.pendingTimers) {
        clearTimeout(t);
      }
      this.pendingTimers = [];
    }
  }

  const SAMPLE_VALID_LIST_CSV = `project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until
6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic gait study,3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,Person A,…01,,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z
6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic gait study,7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70102,Person B,…02,,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z`;

  beforeEach(() => {
    ControllableMockWorker.instances = [];
    vi.stubGlobal('Worker', ControllableMockWorker);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const w of ControllableMockWorker.instances) {
      w.terminate();
    }
    ControllableMockWorker.instances = [];
    localStorage.clear();
    sessionStorage.clear();
  });

  // ==========================================================================
  // Challenge 1: Rapid Folder Switching under Concurrent Hashing
  // ==========================================================================
  describe('Challenge 1: Rapid folder switching under concurrent Web Worker hashing', () => {
    it('1.1: Immediately switches folders while workers are hashing without race conditions', async () => {
      const user = userEvent.setup();

      // Folder A has 6 files
      const folderAEntries: MockFileEntry[] = Array.from({ length: 6 }, (_, i) => ({
        kind: 'file',
        name: `folderA_asset_${i}.png`,
        content: `Content of Folder A file ${i}`,
      }));
      const handleA = createMockDirectoryHandle('folder-alpha', folderAEntries);

      // Folder B has 3 files
      const folderBEntries: MockFileEntry[] = Array.from({ length: 3 }, (_, i) => ({
        kind: 'file',
        name: `folderB_asset_${i}.jpg`,
        content: `Content of Folder B file ${i}`,
      }));
      const handleB = createMockDirectoryHandle('folder-beta', folderBEntries);

      // Start with Folder A
      let currentHandle = handleA;
      window.showDirectoryPicker = vi.fn().mockImplementation(async () => currentHandle);

      render(<App />);

      // Open Folder A
      await user.click(screen.getByTestId('open-folder-button'));

      // Verify Folder A opened
      await waitFor(() => {
        expect(screen.getByTestId('folder-name')).toHaveTextContent('folder-alpha');
        expect(screen.getByTestId('asset-count-badge')).toHaveTextContent('6 assets found');
      });

      // Capture active worker count during Folder A
      const initialWorkers = [...ControllableMockWorker.instances];
      expect(initialWorkers.length).toBeGreaterThan(0);

      // Rapidly switch to Folder B before Folder A finishes hashing
      currentHandle = handleB;
      await user.click(screen.getByTestId('open-folder-button'));

      // Verify that workers from Folder A were terminated
      for (const w of initialWorkers) {
        expect(w.terminated).toBe(true);
      }

      // Verify UI state switched cleanly to Folder B
      await waitFor(() => {
        expect(screen.getByTestId('folder-name')).toHaveTextContent('folder-beta');
        expect(screen.getByTestId('asset-count-badge')).toHaveTextContent('3 assets found');
      });

      // Verify that ONLY Folder B assets are present in the table
      expect(screen.getByTestId('asset-row-folderB_asset_0.jpg')).toBeInTheDocument();
      expect(screen.getByTestId('asset-row-folderB_asset_1.jpg')).toBeInTheDocument();
      expect(screen.getByTestId('asset-row-folderB_asset_2.jpg')).toBeInTheDocument();
      expect(screen.queryByTestId('asset-row-folderA_asset_0.png')).not.toBeInTheDocument();

      // Wait for Folder B hashing to complete 100%
      await waitFor(
        () => {
          expect(screen.getByTestId('hashing-progress-bar')).toHaveTextContent(/100%/);
        },
        { timeout: 3000 }
      );

      // Verify correct Folder B hashes
      for (let i = 0; i < 3; i++) {
        const expectedHash = crypto
          .createHash('sha256')
          .update(Buffer.from(`Content of Folder B file ${i}`))
          .digest('hex');
        expect(screen.getByTestId(`asset-hash-folderB_asset_${i}.jpg`)).toHaveTextContent(
          expectedHash
        );
      }

      // No warning banners logged
      expect(screen.queryByTestId('folder-warnings-callout')).not.toBeInTheDocument();
    });

    it('1.2: Same filename in Folder A and Folder B resolves with Folder B hash, never polluted by A', async () => {
      const user = userEvent.setup();

      const handleA = createMockDirectoryHandle('same-name-A', [
        { kind: 'file', name: 'photo.jpg', content: 'UNIQUE_PAYLOAD_FOR_FOLDER_A' },
      ]);
      const handleB = createMockDirectoryHandle('same-name-B', [
        { kind: 'file', name: 'photo.jpg', content: 'DIFFERENT_PAYLOAD_FOR_FOLDER_B' },
      ]);

      const expectedHashA = crypto
        .createHash('sha256')
        .update(Buffer.from('UNIQUE_PAYLOAD_FOR_FOLDER_A'))
        .digest('hex');
      const expectedHashB = crypto
        .createHash('sha256')
        .update(Buffer.from('DIFFERENT_PAYLOAD_FOR_FOLDER_B'))
        .digest('hex');
      expect(expectedHashA).not.toEqual(expectedHashB);

      let currentHandle = handleA;
      window.showDirectoryPicker = vi.fn().mockImplementation(async () => currentHandle);

      render(<App />);

      // Open A then immediately open B
      await user.click(screen.getByTestId('open-folder-button'));
      currentHandle = handleB;
      await user.click(screen.getByTestId('open-folder-button'));

      await waitFor(() => {
        expect(screen.getByTestId('folder-name')).toHaveTextContent('same-name-B');
      });

      await waitFor(
        () => {
          expect(screen.getByTestId('hashing-progress-bar')).toHaveTextContent(/100%/);
        },
        { timeout: 3000 }
      );

      // Verify hash is strictly expectedHashB, not expectedHashA
      expect(screen.getByTestId('asset-hash-photo.jpg')).toHaveTextContent(expectedHashB);
      expect(screen.getByTestId('asset-hash-photo.jpg')).not.toHaveTextContent(expectedHashA);
    });

    it('1.3 [DEFECT-02 Empirical Demonstration]: HashManager handleWorkerMessage lacks this.disposed guard and slot cleanup on dispose', () => {
      let onDoneCalled = false;
      let capturedWorker: {
        postMessage: ReturnType<typeof vi.fn>;
        terminate: ReturnType<typeof vi.fn>;
        onmessage: ((e: MessageEvent<WorkerOutboundMessage>) => void) | null;
        onerror: ((e: ErrorEvent) => void) | null;
      } | null = null;

      const fakeWorker = {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        onmessage: null as ((e: MessageEvent<WorkerOutboundMessage>) => void) | null,
        onerror: null as ((e: ErrorEvent) => void) | null,
      };

      const manager = new HashManager({
        maxConcurrency: 1,
        workerFactory: () => {
          capturedWorker = fakeWorker;
          return fakeWorker as unknown as Worker;
        },
      });

      const file = new File(['test payload'], 'test.png');
      manager.enqueue({
        jobId: 'job-123',
        assetId: 'test.png',
        file,
        onDone: () => {
          onDoneCalled = true;
        },
        onError: () => {},
      });

      expect(capturedWorker).not.toBeNull();
      expect(fakeWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'HASH_FILE', jobId: 'job-123' })
      );

      // Dispose manager while job is running
      manager.dispose();
      expect(fakeWorker.terminate).toHaveBeenCalled();

      // If a message was already enqueued in the browser event queue before terminate,
      // it delivers to fakeWorker.onmessage.
      // Because HashManager does not check this.disposed or detach worker.onmessage,
      // onDone will still execute!
      fakeWorker.onmessage?.({
        data: {
          type: 'DONE',
          jobId: 'job-123',
          assetId: 'test.png',
          sha256: 'mock-sha256',
          totalBytes: file.size,
          durationMs: 1,
        },
      } as MessageEvent<WorkerOutboundMessage>);

      // This confirms the empirical flaw: onDone is invoked on a disposed manager!
      expect(onDoneCalled).toBe(true);
    });
  });

  // ==========================================================================
  // Challenge 2: Empty Folder Ingestion (0 Assets & Division-by-Zero)
  // ==========================================================================
  describe('Challenge 2: Empty folder ingestion (0 assets, division by zero protection)', () => {
    it('2.1: Handles completely empty folder (0 assets) without crashing or NaN', async () => {
      const user = userEvent.setup();
      const emptyHandle = createMockDirectoryHandle('empty-folder', []);
      window.showDirectoryPicker = vi.fn().mockResolvedValue(emptyHandle);

      render(<App />);
      await user.click(screen.getByTestId('open-folder-button'));

      // Folder name and 0 count badge
      await waitFor(() => {
        expect(screen.getByTestId('folder-name')).toHaveTextContent('empty-folder');
        expect(screen.getByTestId('asset-count-badge')).toHaveTextContent('0 assets found');
      });

      // Hashing progress bar does NOT render NaN or crash
      const progressBar = screen.getByTestId('hashing-progress-bar');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar.textContent).not.toContain('NaN');
      expect(progressBar.textContent).not.toContain('Infinity');

      // AssetTable is NOT rendered
      expect(screen.queryByTestId('asset-table')).not.toBeInTheDocument();

      // Proceed button remains strictly disabled
      const proceedButton = screen.getByTestId('proceed-button');
      expect(proceedButton).toBeDisabled();
    });

    it('2.2: Folder containing only ignored hidden files (.git, .hidden, .dct-progress.json) results in 0 assets', async () => {
      const user = userEvent.setup();
      const ignoredHandle = createMockDirectoryHandle('ignored-only', [
        { kind: 'file', name: '.DS_Store', content: 'trash' },
        { kind: 'file', name: '.dct-progress.json', content: '{}' },
        { kind: 'file', name: 'asset_export_20261107T120000Z.csv', content: 'some export' },
        {
          kind: 'directory',
          name: '.git',
          entries: [{ kind: 'file', name: 'HEAD', content: 'ref: refs/heads/main' }],
        },
      ]);
      window.showDirectoryPicker = vi.fn().mockResolvedValue(ignoredHandle);

      render(<App />);
      await user.click(screen.getByTestId('open-folder-button'));

      await waitFor(() => {
        expect(screen.getByTestId('folder-name')).toHaveTextContent('ignored-only');
        expect(screen.getByTestId('asset-count-badge')).toHaveTextContent('0 assets found');
      });

      expect(screen.getByTestId('proceed-button')).toBeDisabled();
    });

    it('2.3: Proceed button remains disabled even if valid consented list is loaded when assets = 0', async () => {
      const user = userEvent.setup();

      // 1. Load valid list
      render(<App />);
      const file = new File([SAMPLE_VALID_LIST_CSV], 'consented_list.csv', { type: 'text/csv' });
      await user.upload(screen.getByTestId('consented-list-input'), file);

      await waitFor(() => {
        expect(screen.getByTestId('list-summary-project')).toHaveTextContent('Synthetic gait study');
      });

      // 2. Open empty folder
      const emptyHandle = createMockDirectoryHandle('zero-assets', []);
      window.showDirectoryPicker = vi.fn().mockResolvedValue(emptyHandle);
      await user.click(screen.getByTestId('open-folder-button'));

      await waitFor(() => {
        expect(screen.getByTestId('folder-name')).toHaveTextContent('zero-assets');
        expect(screen.getByTestId('asset-count-badge')).toHaveTextContent('0 assets found');
      });

      // Crucial: proceed button MUST remain disabled because assets = 0
      const proceedBtn = screen.getByTestId('proceed-button');
      expect(proceedBtn).toBeDisabled();
    });
  });

  // ==========================================================================
  // Challenge 3: Deeply Nested Folder Structures (a/b/c/d/file.png)
  // ==========================================================================
  describe('Challenge 3: Deeply nested folder structures with forward slashes', () => {
    it('3.1: Ingests 4 levels of nested directories and produces forward-slash relative asset_id', async () => {
      const user = userEvent.setup();

      const deepFileContent = 'DEEP_NESTED_PNG_PAYLOAD';
      const deepHash = crypto.createHash('sha256').update(Buffer.from(deepFileContent)).digest('hex');

      const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
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
                          kind: 'file',
                          name: 'deep_sensor.dat',
                          content: 'SENSOR_DATA_AT_LEVEL_4',
                        },
                        {
                          kind: 'file',
                          name: 'deep_photo.png',
                          content: deepFileContent,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              kind: 'file',
              name: 'sub_doc.pdf',
              content: 'PDF_AT_LEVEL_1',
            },
          ],
        },
        {
          kind: 'file',
          name: 'root_note.txt',
          content: 'TXT_AT_ROOT',
        },
      ];

      const deepHandle = createMockDirectoryHandle('nested-collection', mockEntries);
      window.showDirectoryPicker = vi.fn().mockResolvedValue(deepHandle);

      render(<App />);
      await user.click(screen.getByTestId('open-folder-button'));

      await waitFor(() => {
        expect(screen.getByTestId('folder-name')).toHaveTextContent('nested-collection');
        expect(screen.getByTestId('asset-count-badge')).toHaveTextContent('4 assets found');
      });

      // Verify relative path format: strictly forward slashes, no backslashes
      const expectedDeepPath = 'level1/level2/level3/level4/deep_photo.png';
      expect(screen.getByTestId(`asset-row-${expectedDeepPath}`)).toBeInTheDocument();
      expect(screen.getByTestId('asset-row-level1/level2/level3/level4/deep_sensor.dat')).toBeInTheDocument();
      expect(screen.getByTestId('asset-row-level1/sub_doc.pdf')).toBeInTheDocument();
      expect(screen.getByTestId('asset-row-root_note.txt')).toBeInTheDocument();

      // Wait for hashing completion
      await waitFor(
        () => {
          expect(screen.getByTestId('hashing-progress-bar')).toHaveTextContent(/100%/);
        },
        { timeout: 3000 }
      );

      // Verify SHA-256 for deeply nested file matches crypto oracle
      expect(screen.getByTestId(`asset-hash-${expectedDeepPath}`)).toHaveTextContent(deepHash);
    });

    it('3.2: Custom extension override at collection root (dct-types.json) applies to nested files', async () => {
      const user = userEvent.setup();

      const customTypesJson = JSON.stringify({
        sensor: ['.customdat'],
        image: ['.myimg'],
      });

      const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
        {
          kind: 'file',
          name: 'dct-types.json',
          content: customTypesJson,
        },
        {
          kind: 'directory',
          name: 'nested',
          entries: [
            {
              kind: 'file',
              name: 'sensor_stream.customdat',
              content: 'stream 1 2 3',
            },
            {
              kind: 'file',
              name: 'capture.myimg',
              content: 'image bits',
            },
          ],
        },
      ];

      const handle = createMockDirectoryHandle('custom-types-collection', mockEntries);
      window.showDirectoryPicker = vi.fn().mockResolvedValue(handle);

      render(<App />);
      await user.click(screen.getByTestId('open-folder-button'));

      await waitFor(() => {
        expect(screen.getByTestId('folder-name')).toHaveTextContent('custom-types-collection');
        expect(screen.getByTestId('asset-count-badge')).toHaveTextContent('2 assets found');
      });

      // Verify custom type mapping applied: 1 sensor, 1 image
      expect(screen.getByTestId('type-pill-sensor')).toHaveTextContent('1 sensor');
      expect(screen.getByTestId('type-pill-image')).toHaveTextContent('1 image');
    });
  });

  // ==========================================================================
  // Challenge 4: Large Asset Collections (>50 Mock Assets)
  // ==========================================================================
  describe('Challenge 4: Large asset collections (>50 assets)', () => {
    it('4.1: Seamlessly processes 60 assets with monotonic progress tracking and full completion', async () => {
      const user = userEvent.setup();

      const TOTAL_FILES = 60;
      const files: MockFileEntry[] = Array.from({ length: TOTAL_FILES }, (_, i) => ({
        kind: 'file',
        name: `asset_${String(i).padStart(3, '0')}.png`,
        content: `Synthetic payload data for benchmark asset ${i}`,
      }));

      const largeHandle = createMockDirectoryHandle('large-dataset', files);
      window.showDirectoryPicker = vi.fn().mockResolvedValue(largeHandle);

      render(<App />);
      await user.click(screen.getByTestId('open-folder-button'));

      await waitFor(() => {
        expect(screen.getByTestId('folder-name')).toHaveTextContent('large-dataset');
        expect(screen.getByTestId('asset-count-badge')).toHaveTextContent('60 assets found');
      });

      // Verify that progress completes to 100%
      await waitFor(
        () => {
          expect(screen.getByTestId('hashing-progress-bar')).toHaveTextContent(/100%/);
        },
        { timeout: 8000 }
      );

      // Verify sample hashes match oracle
      const firstHash = crypto
        .createHash('sha256')
        .update(Buffer.from('Synthetic payload data for benchmark asset 0'))
        .digest('hex');
      const lastHash = crypto
        .createHash('sha256')
        .update(Buffer.from(`Synthetic payload data for benchmark asset ${TOTAL_FILES - 1}`))
        .digest('hex');

      expect(screen.getByTestId('asset-hash-asset_000.png')).toHaveTextContent(firstHash);
      expect(screen.getByTestId(`asset-hash-asset_${String(TOTAL_FILES - 1).padStart(3, '0')}.png`)).toHaveTextContent(lastHash);

      // Verify type badge shows 60 image
      expect(screen.getByTestId('type-pill-image')).toHaveTextContent('60 image');
    });

    it('4.2: Large collection (>50 assets) preserves RAM privacy without writing to web storage', async () => {
      const user = userEvent.setup();

      const files: MockFileEntry[] = Array.from({ length: 55 }, (_, i) => ({
        kind: 'file',
        name: `scale_asset_${i}.jpg`,
        content: `Data ${i}`,
      }));

      const handle = createMockDirectoryHandle('scale-privacy', files);
      window.showDirectoryPicker = vi.fn().mockResolvedValue(handle);

      render(<App />);
      await user.click(screen.getByTestId('open-folder-button'));

      await waitFor(() => {
        expect(screen.getByTestId('asset-count-badge')).toHaveTextContent('55 assets found');
      });

      await waitFor(
        () => {
          expect(screen.getByTestId('hashing-progress-bar')).toHaveTextContent(/100%/);
        },
        { timeout: 6000 }
      );

      // Privacy invariant check: zero writes to localStorage or sessionStorage
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
    });
  });

  // ==========================================================================
  // Challenge 5: Cancellation (AbortError) Handling in Directory Picker
  // ==========================================================================
  describe('Challenge 5: User cancellation (AbortError) handling in directory picker', () => {
    it('5.1: AbortError on initial open preserves idle state without warnings', async () => {
      const user = userEvent.setup();
      const abortErr = new DOMException('The user aborted a request.', 'AbortError');
      window.showDirectoryPicker = vi.fn().mockRejectedValue(abortErr);

      render(<App />);
      await user.click(screen.getByTestId('open-folder-button'));

      // Retains idle state
      expect(screen.getByText(/no collection folder opened/i)).toBeInTheDocument();
      expect(screen.queryByTestId('folder-warnings-callout')).not.toBeInTheDocument();
      expect(screen.getByTestId('proceed-button')).toBeDisabled();
    });

    it('5.2: AbortError on "Change folder" preserves already loaded folder state without disruption', async () => {
      const user = userEvent.setup();

      const initialEntries: MockFileEntry[] = [
        { kind: 'file', name: 'photo1.png', content: 'INITIAL_PHOTO_DATA' },
      ];
      const initialHandle = createMockDirectoryHandle('preserved-folder', initialEntries);

      // 1. Initial successful folder open
      window.showDirectoryPicker = vi.fn().mockResolvedValueOnce(initialHandle);

      render(<App />);
      await user.click(screen.getByTestId('open-folder-button'));

      await waitFor(() => {
        expect(screen.getByTestId('folder-name')).toHaveTextContent('preserved-folder');
        expect(screen.getByTestId('asset-count-badge')).toHaveTextContent('1 assets found');
      });

      // 2. Click "Change folder" and simulate user cancelling dialog
      const abortErr = new DOMException('The user aborted a request.', 'AbortError');
      window.showDirectoryPicker = vi.fn().mockRejectedValueOnce(abortErr);

      await user.click(screen.getByTestId('open-folder-button'));

      // State MUST be preserved!
      expect(screen.getByTestId('folder-name')).toHaveTextContent('preserved-folder');
      expect(screen.getByTestId('asset-count-badge')).toHaveTextContent('1 assets found');
      expect(screen.getByTestId('asset-row-photo1.png')).toBeInTheDocument();
      expect(screen.queryByTestId('folder-warnings-callout')).not.toBeInTheDocument();
    });

    it('5.3: Non-AbortError on "Change folder" surfaces descriptive warning callout', async () => {
      const user = userEvent.setup();
      const initialHandle = createMockDirectoryHandle('initial-folder', [
        { kind: 'file', name: 'photo1.png', content: 'INITIAL_PHOTO_DATA' },
      ]);
      window.showDirectoryPicker = vi.fn().mockResolvedValueOnce(initialHandle);

      render(<App />);
      await user.click(screen.getByTestId('open-folder-button'));

      await waitFor(() => {
        expect(screen.getByTestId('folder-name')).toHaveTextContent('initial-folder');
      });

      const permErr = new DOMException('Permission denied by user.', 'NotAllowedError');
      window.showDirectoryPicker = vi.fn().mockRejectedValueOnce(permErr);

      await user.click(screen.getByTestId('open-folder-button'));

      await waitFor(() => {
        expect(screen.getByTestId('folder-warnings-callout')).toBeInTheDocument();
        expect(screen.getByTestId('folder-warnings-callout')).toHaveTextContent(/Folder selection error/i);
      });
    });

    it('5.4 [DEFECT-01 Empirical Demonstration]: Non-AbortError on initial open is invisible because warning callout is inside {folderName && (...)}', async () => {
      const user = userEvent.setup();
      const permErr = new DOMException('Permission denied by user.', 'NotAllowedError');
      window.showDirectoryPicker = vi.fn().mockRejectedValue(permErr);

      render(<App />);
      await user.click(screen.getByTestId('open-folder-button'));

      // The error occurred and was added to folderWarnings in useAppPipeline,
      // but because folderName is null, FolderSection does NOT render folder-warnings-callout!
      expect(screen.queryByTestId('folder-warnings-callout')).not.toBeInTheDocument();
      // The user is still shown the initial empty prompt with no indication that an error occurred:
      expect(screen.getByText(/no collection folder opened/i)).toBeInTheDocument();
    });
  });
});
