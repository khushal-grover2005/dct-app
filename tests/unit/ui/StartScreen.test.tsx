import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'node:fs';
import path from 'node:path';
import App from '@/app/App';
import {
  createMockDirectoryHandle,
  MockFileEntry,
  MockDirectoryEntry,
} from '../folder/mockFileSystem';
import { computeSha256 } from '@/folder/sha256';
import type { WorkerInboundMessage, WorkerOutboundMessage } from '@/folder/types';

describe('StartScreen Integration Suite (UC-01 & UC-02)', () => {
  const sampleDir = path.resolve(
    __dirname,
    '../../../docs/consent-tagging/examples/sample-collection'
  );
  const sampleListPath = path.resolve(
    __dirname,
    '../../../docs/consent-tagging/examples/consented_list.sample.csv'
  );
  const validListCsv = fs.readFileSync(sampleListPath, 'utf8');

  // Mock Worker for jsdom hashing simulation
  class MockWorker {
    onmessage: ((e: MessageEvent<WorkerOutboundMessage>) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;

    postMessage(data: WorkerInboundMessage) {
      if (data.type === 'HASH_FILE') {
        setTimeout(async () => {
          try {
            const ab = await data.file.arrayBuffer();
            const sha256 = computeSha256(new Uint8Array(ab));
            this.onmessage?.({
              data: {
                type: 'DONE',
                jobId: data.jobId,
                assetId: data.assetId,
                sha256,
                totalBytes: data.file.size,
                durationMs: 5,
              },
            } as MessageEvent<WorkerOutboundMessage>);
          } catch (err) {
            this.onerror?.(new ErrorEvent('error', { error: err }));
          }
        }, 10);
      }
    }

    terminate() {}
  }

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
    vi.stubGlobal('Worker', MockWorker);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders initial folder and consented list pickers in idle state', () => {
    window.showDirectoryPicker = vi.fn();
    render(<App />);

    expect(screen.getByTestId('open-folder-button')).toBeInTheDocument();
    expect(screen.getByTestId('load-list-button')).toBeInTheDocument();
    expect(screen.getByText(/no collection folder opened/i)).toBeInTheDocument();
    expect(screen.getByText(/no consented list loaded/i)).toBeInTheDocument();
    expect(screen.getByTestId('proceed-button')).toBeDisabled();
  });

  it('ingests sample folder and renders 8 assets with badges, capture times, and hashes (T-01)', async () => {
    const user = userEvent.setup();
    const readFile = (filename: string): Uint8Array => {
      const buf = fs.readFileSync(path.join(sampleDir, filename));
      return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    };

    const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
      {
        kind: 'file',
        name: 'IMG-0001.png',
        content: readFile('IMG-0001.png'),
        lastModified: Date.UTC(2026, 10, 4, 6, 2, 11),
      },
      {
        kind: 'file',
        name: 'IMG-0002.png',
        content: readFile('IMG-0002.png'),
      },
      {
        kind: 'file',
        name: 'IMG-0003.png',
        content: readFile('IMG-0003.png'),
      },
      {
        kind: 'file',
        name: 'IMG-0004.png',
        content: readFile('IMG-0004.png'),
      },
      {
        kind: 'file',
        name: 'VID-0005.mp4',
        content: readFile('VID-0005.mp4'),
      },
      {
        kind: 'file',
        name: 'AUD-0006.wav',
        content: readFile('AUD-0006.wav'),
      },
      {
        kind: 'file',
        name: 'SNS-0007.csv',
        content: readFile('SNS-0007.csv'),
      },
      {
        kind: 'file',
        name: 'DOC-0008.pdf',
        content: readFile('DOC-0008.pdf'),
      },
    ];

    const mockHandle = createMockDirectoryHandle('sample-collection', mockEntries);
    window.showDirectoryPicker = vi.fn().mockResolvedValue(mockHandle);

    render(<App />);
    await user.click(screen.getByTestId('open-folder-button'));

    // Verify folder name and asset count
    await waitFor(() => {
      expect(screen.getByTestId('folder-name')).toHaveTextContent(/sample-collection/);
      expect(screen.getByTestId('asset-count-badge')).toHaveTextContent('8 assets found');
    });

    // Verify asset table rows and types
    expect(screen.getByTestId('asset-row-IMG-0001.png')).toBeInTheDocument();
    expect(screen.getByTestId('asset-row-VID-0005.mp4')).toBeInTheDocument();
    expect(screen.getByTestId('asset-row-AUD-0006.wav')).toBeInTheDocument();
    expect(screen.getByTestId('asset-row-SNS-0007.csv')).toBeInTheDocument();
    expect(screen.getByTestId('asset-row-DOC-0008.pdf')).toBeInTheDocument();

    // Verify type pills
    expect(screen.getByTestId('type-pill-image')).toHaveTextContent('4 image');
    expect(screen.getByTestId('type-pill-video')).toHaveTextContent('1 video');
    expect(screen.getByTestId('type-pill-audio')).toHaveTextContent('1 audio');
    expect(screen.getByTestId('type-pill-sensor')).toHaveTextContent('1 sensor');
    expect(screen.getByTestId('type-pill-document')).toHaveTextContent('1 document');

    // Verify VID-0005.mp4 capture time from header
    const vidCapturedAt = screen.getByTestId('asset-captured-at-VID-0005.mp4');
    expect(vidCapturedAt).toHaveTextContent('06:40:00Z');

    // Verify IMG-0001.png capture time from EXIF
    const imgCapturedAt = screen.getByTestId('asset-captured-at-IMG-0001.png');
    expect(imgCapturedAt).toHaveTextContent('06:02:11Z');

    // Verify hashing progress reaches 100%
    await waitFor(
      () => {
        expect(screen.getByTestId('hashing-progress-bar')).toHaveTextContent(/100%/);
      },
      { timeout: 4000 }
    );

    // Verify exact SHA-256 for IMG-0001.png
    expect(screen.getByTestId('asset-hash-IMG-0001.png')).toHaveTextContent(
      '2180908ddf0ede06fd1be557ec0741028aaccc8f69030b0260c071490fe198e3'
    );
  });

  it('loads consented list and displays project summary with non-selectable reasons (T-03)', async () => {
    const user = userEvent.setup();
    window.showDirectoryPicker = vi.fn();
    render(<App />);

    const file = new File([validListCsv], 'consented_list.sample.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('consented-list-input');
    await user.upload(fileInput, file);

    // Verify project name and summary counts
    await waitFor(() => {
      expect(screen.getByTestId('list-summary-project')).toHaveTextContent('Synthetic gait study');
      expect(screen.getByTestId('total-people-count')).toHaveTextContent('4');
      expect(screen.getByTestId('list-summary-counts')).toHaveTextContent(
        /4 people, 2 not selectable/i
      );
    });

    // Verify non-selectable reasons in participant table
    expect(screen.getByText('minor')).toBeInTheDocument();
    expect(screen.getByText('consent expired 3 Nov')).toBeInTheDocument();

    // Verify AGENTS.md Rule 8: zero storage writes
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('refuses invalid consented list whole and displays descriptive error alert (L01–L04)', async () => {
    const user = userEvent.setup();
    window.showDirectoryPicker = vi.fn();
    render(<App />);

    // L01 Missing column
    const badCsv = validListCsv.replace('consent_id,', '');
    const file = new File([badCsv], 'invalid.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('consented-list-input');
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      expect(screen.getByTestId('list-error-banner')).toHaveTextContent(/L01/i);
    });

    // Verify whole list refusal (no summary, no participant table)
    expect(screen.queryByTestId('list-summary-project')).not.toBeInTheDocument();
    expect(screen.queryByTestId('participant-table')).not.toBeInTheDocument();
  });

  it('refuses list with UTF-8 BOM whole with BOM_NOT_ALLOWED error', async () => {
    const user = userEvent.setup();
    window.showDirectoryPicker = vi.fn();
    render(<App />);

    const bomCsv = '\ufeff' + validListCsv;
    const file = new File([bomCsv], 'bom.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('consented-list-input');
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      expect(screen.getByTestId('list-error-banner')).toHaveTextContent(/BOM_NOT_ALLOWED/i);
    });

    expect(screen.queryByTestId('list-summary-project')).not.toBeInTheDocument();
  });

  it('supports loading list first, then opening folder, and enables Start Tagging', async () => {
    const user = userEvent.setup();

    // 1. Load list first
    const mockEntries: (MockFileEntry | MockDirectoryEntry)[] = [
      {
        kind: 'file',
        name: 'IMG-0001.png',
        content: fs.readFileSync(path.join(sampleDir, 'IMG-0001.png')),
      },
    ];
    const mockHandle = createMockDirectoryHandle('gait-dataset', mockEntries);
    window.showDirectoryPicker = vi.fn().mockResolvedValue(mockHandle);

    render(<App />);

    const file = new File([validListCsv], 'consented_list.sample.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('consented-list-input');
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByTestId('list-summary-project')).toHaveTextContent('Synthetic gait study');
    });

    // Still disabled because no folder opened yet
    expect(screen.getByTestId('proceed-button')).toBeDisabled();

    // 2. Open folder second
    await user.click(screen.getByTestId('open-folder-button'));

    await waitFor(() => {
      expect(screen.getByTestId('folder-name')).toHaveTextContent(/gait-dataset/);
    });

    // Both folder and valid list are loaded -> proceed button enabled!
    await waitFor(() => {
      expect(screen.getByTestId('proceed-button')).not.toBeDisabled();
    });

    // Verify collection reference defaults to folder name
    const collInput = screen.getByTestId('collection-ref-input') as HTMLInputElement;
    expect(collInput.value).toBe('gait-dataset');

    // Edit collection reference
    fireEvent.change(collInput, { target: { value: 'custom-ref-123' } });
    expect(collInput.value).toBe('custom-ref-123');

    // Click proceed -> enters Increment 2 Tagging Workspace and supports returning to Start
    await user.click(screen.getByTestId('proceed-button'));
    expect(screen.getByTestId('tagging-workspace')).toBeInTheDocument();

    await user.click(screen.getByTestId('back-to-start-btn'));
    expect(screen.getByTestId('start-screen')).toBeInTheDocument();
  });

  it('handles user cancellation of directory picker without errors', async () => {
    const user = userEvent.setup();
    const abortErr = new DOMException('The user aborted a request.', 'AbortError');
    window.showDirectoryPicker = vi.fn().mockRejectedValue(abortErr);

    render(<App />);
    await user.click(screen.getByTestId('open-folder-button'));

    // Should retain idle state without warnings
    expect(screen.queryByTestId('folder-warnings-callout')).not.toBeInTheDocument();
    expect(screen.getByText(/no collection folder opened/i)).toBeInTheDocument();
  });
});
