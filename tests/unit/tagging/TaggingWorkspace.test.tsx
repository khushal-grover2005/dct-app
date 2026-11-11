import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

describe('Tagging Workspace UI Integration Tests (T-04, T-05, T-06, T-15)', () => {
  const sampleDir = path.resolve(
    __dirname,
    '../../../docs/consent-tagging/examples/sample-collection'
  );
  const sampleListPath = path.resolve(
    __dirname,
    '../../../docs/consent-tagging/examples/consented_list.sample.csv'
  );
  const validListCsv = fs.readFileSync(sampleListPath, 'utf8');

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
                durationMs: 2,
              },
            } as MessageEvent<WorkerOutboundMessage>);
          } catch (err) {
            this.onerror?.(new ErrorEvent('error', { error: err }));
          }
        }, 5);
      }
    }

    terminate() {}
  }

  function buildSampleEntries(extraEntries: MockFileEntry[] = []): (MockFileEntry | MockDirectoryEntry)[] {
    const readFile = (filename: string): Uint8Array => {
      const buf = fs.readFileSync(path.join(sampleDir, filename));
      return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    };

    const base: MockFileEntry[] = [
      'IMG-0001.png',
      'IMG-0002.png',
      'IMG-0003.png',
      'IMG-0004.png',
      'VID-0005.mp4',
      'AUD-0006.wav',
      'SNS-0007.csv',
      'DOC-0008.pdf',
    ].map((name) => ({
      kind: 'file',
      name,
      content: readFile(name),
      lastModified: Date.UTC(2026, 10, 4, 6, 2, 11),
    }));

    return [...base, ...extraEntries];
  }

  async function launchWorkspace(
    user: ReturnType<typeof userEvent.setup>,
    extraEntries: MockFileEntry[] = []
  ) {
    const entries = buildSampleEntries(extraEntries);
    const mockHandle = createMockDirectoryHandle('sample-collection', entries);
    window.showDirectoryPicker = vi.fn().mockResolvedValue(mockHandle);

    render(<App />);
    await user.click(screen.getByTestId('open-folder-button'));
    await waitFor(() => {
      expect(screen.getByTestId('folder-name')).toHaveTextContent(/sample-collection/);
    });

    const listFile = new File([validListCsv], 'consented_list.sample.csv', { type: 'text/csv' });
    await user.upload(screen.getByTestId('consented-list-input'), listFile);

    await waitFor(() => {
      expect(screen.getByTestId('proceed-button')).not.toBeDisabled();
    });

    await user.click(screen.getByTestId('proceed-button'));
    expect(screen.getByTestId('tagging-workspace')).toBeInTheDocument();
  }

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
    vi.stubGlobal('Worker', MockWorker);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-object-url'),
      revokeObjectURL: vi.fn(),
    });
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('enforces per-asset non-selectability (T-04: minor, expired consent, and post-list_valid_until)', async () => {
    const user = userEvent.setup();
    await launchWorkspace(user, [
      {
        kind: 'file',
        name: 'IMG-9999-AFTER-EXPIRY.png',
        content: new Uint8Array([1, 2, 3, 4]),
        lastModified: Date.UTC(2026, 10, 10, 12, 0, 0), // After 2026-11-08T04:30:00Z
      },
    ]);

    // Select IMG-0001.png explicitly (list is alphabetically sorted so AUD-0006.wav is first)
    await user.click(screen.getByTestId('workspace-asset-item-IMG-0001.png'));

    // IMG-0001.png captured 2026-11-04T06:02:11Z
    const person001 = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
    const person002 = '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2';
    const person003 = 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e03';
    const person004 = 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f04';

    // Selectable adults have Select buttons
    expect(screen.getByTestId(`select-person-btn-${person001}`)).toBeInTheDocument();
    expect(screen.getByTestId(`select-person-btn-${person002}`)).toBeInTheDocument();

    // Person 003 expired (2026-11-03 < 2026-11-04) shows reason and NO Select button
    const row003 = screen.getByTestId(`people-list-row-${person003}`);
    expect(within(row003).getByTestId(`non-selectable-reason-${person003}`)).toHaveTextContent(
      'consent expired 3 Nov'
    );
    expect(within(row003).queryByRole('button', { name: /select/i })).not.toBeInTheDocument();

    // Person 004 minor shows reason and NO Select button
    const row004 = screen.getByTestId(`people-list-row-${person004}`);
    expect(within(row004).getByTestId(`non-selectable-reason-${person004}`)).toHaveTextContent(
      'minor'
    );
    expect(within(row004).queryByRole('button', { name: /select/i })).not.toBeInTheDocument();

    // Switch to asset captured AFTER list_valid_until -> NOBODY is selectable & app asks for newer list
    await user.click(screen.getByTestId('workspace-asset-item-IMG-9999-AFTER-EXPIRY.png'));
    expect(screen.getByTestId('list-expired-asset-banner')).toBeInTheDocument();

    const listArea = screen.getByTestId('participant-select-list');
    expect(within(listArea).queryByRole('button', { name: /select/i })).not.toBeInTheDocument();
  });

  it('prevents duplicate chips, supports hint search & removal, and has ZERO ID inputs in DOM (T-05)', async () => {
    const user = userEvent.setup();
    await launchWorkspace(user);

    const person001 = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
    const person002 = '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2';

    // Audit Rule 3 / R-13: No input anywhere in the DOM for any ID
    const allInputs = Array.from(document.querySelectorAll('input, textarea'));
    for (const el of allInputs) {
      const attrs = `${el.id} ${el.getAttribute('name') ?? ''} ${el.getAttribute('placeholder') ?? ''} ${el.getAttribute('data-testid') ?? ''}`.toLowerCase();
      expect(attrs).not.toContain('person_id');
      expect(attrs).not.toContain('consent_id');
      expect(attrs).not.toContain('project_id');
      expect(attrs).not.toContain('export_id');
    }

    // Search by contact hint '…01' (or '01')
    const searchInput = screen.getByTestId('participant-search-input');
    await user.type(searchInput, '…01');
    expect(screen.getByTestId(`people-list-row-${person001}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`people-list-row-${person002}`)).not.toBeInTheDocument();

    // Select 001 -> shows 1 chip; pressing Enter in search again keeps 1 chip
    await user.click(screen.getByTestId(`select-person-btn-${person001}`));
    expect(screen.getByTestId(`selected-person-chip-${person001}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`select-person-btn-${person001}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`person-already-selected-${person001}`)).toHaveTextContent('Selected');

    await user.click(searchInput);
    await user.keyboard('{Enter}');
    expect(screen.getAllByTestId(`selected-person-chip-${person001}`)).toHaveLength(1);

    // Remove and re-add works
    await user.click(screen.getByTestId(`remove-person-btn-${person001}`));
    expect(screen.queryByTestId(`selected-person-chip-${person001}`)).not.toBeInTheDocument();

    await user.click(screen.getByTestId(`select-person-btn-${person001}`));
    expect(screen.getByTestId(`selected-person-chip-${person001}`)).toBeInTheDocument();
  });

  it('enforces No person exclusivity, bystander-only warning, done counts, and filters (T-06)', async () => {
    const user = userEvent.setup();
    await launchWorkspace(user);

    const person001 = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';
    expect(screen.getByTestId('workspace-done-count')).toHaveTextContent('0 of 8 done');

    // Explicitly switch to IMG-0001.png before tagging (AUD-0006.wav is first alphabetically)
    await user.click(screen.getByTestId('workspace-asset-item-IMG-0001.png'));

    // Select Person 001 on IMG-0001.png -> No person toggle cannot be turned on
    await user.click(screen.getByTestId(`select-person-btn-${person001}`));
    expect(screen.getByTestId('no-person-toggle')).toBeDisabled();
    expect(screen.getByTestId('workspace-done-count')).toHaveTextContent('1 of 8 done');

    // Switch to IMG-0002.png -> add 1 bystander only -> shows exact error & stays not done
    await user.click(screen.getByTestId('workspace-asset-item-IMG-0002.png'));
    await user.click(screen.getByTestId('bystander-increment-btn'));

    expect(screen.getByTestId('bystander-count-value')).toHaveTextContent('1');
    expect(screen.getByTestId('bystander-only-warning')).toHaveTextContent(
      'bystander only — delete this file'
    );
    expect(screen.getByTestId('workspace-asset-status-IMG-0002.png')).toHaveTextContent(
      'bystander only — delete this file'
    );
    expect(screen.getByTestId('no-person-toggle')).toBeDisabled();
    expect(screen.getByTestId('workspace-done-count')).toHaveTextContent('1 of 8 done');

    // Switch to IMG-0004.png -> toggle No person ON -> done becomes 2 of 8
    await user.click(screen.getByTestId('workspace-asset-item-IMG-0004.png'));
    await user.click(screen.getByTestId('no-person-toggle'));
    expect(screen.getByTestId('workspace-done-count')).toHaveTextContent('2 of 8 done');
    expect(screen.getByTestId('bystander-increment-btn')).toBeDisabled();

    // Test state filter & type filter
    await user.selectOptions(screen.getByTestId('asset-status-filter'), 'bystander_only');
    expect(screen.getByTestId('workspace-asset-item-IMG-0002.png')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-asset-item-IMG-0001.png')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByTestId('asset-status-filter'), 'no_person');
    expect(screen.getByTestId('workspace-asset-item-IMG-0004.png')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-asset-item-IMG-0002.png')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByTestId('asset-status-filter'), 'all');
    await user.selectOptions(screen.getByTestId('asset-type-filter'), 'sensor');
    expect(screen.getByTestId('workspace-asset-item-SNS-0007.csv')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-asset-item-IMG-0004.png')).not.toBeInTheDocument();
  });

  it('renders modality-specific viewers, headings, and fallback tagging (T-15)', async () => {
    const user = userEvent.setup();
    await launchWorkspace(user, [
      { kind: 'file', name: 'unplayable.mkv', content: new Uint8Array([0, 1, 2]) },
      { kind: 'file', name: 'raw_shot.heic', content: new Uint8Array([3, 4, 5]) },
    ]);

    const person001 = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';

    // Audio viewer + exact heading text 'heard in this recording'
    await user.click(screen.getByTestId('workspace-asset-item-AUD-0006.wav'));
    expect(screen.getByTestId('audio-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('people-panel-heading')).toHaveTextContent(/heard in this recording/i);

    // Select person before media review -> still not done until confirmed/played to end
    await user.click(screen.getByTestId(`select-person-btn-${person001}`));
    expect(screen.getByTestId('workspace-asset-status-AUD-0006.wav')).toHaveTextContent(
      'not fully reviewed'
    );
    expect(screen.getByTestId('workspace-done-count')).toHaveTextContent('0 of 10 done');

    // Confirm reviewed outside the app -> marks done!
    await user.click(screen.getByTestId('confirm-external-review-btn'));
    expect(screen.getByTestId('workspace-asset-status-AUD-0006.wav')).toHaveTextContent(
      'tagged (1)'
    );
    expect(screen.getByTestId('workspace-done-count')).toHaveTextContent('1 of 10 done');

    // Sensor CSV shows first 200 lines out of 202
    await user.click(screen.getByTestId('workspace-asset-item-SNS-0007.csv'));
    expect(screen.getByTestId('sensor-viewer')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('sensor-line-count')).toHaveTextContent(
        'Showing first 200 of 202 lines'
      );
      expect(screen.getByTestId('sensor-viewer')).toHaveTextContent('# SYNTHETIC SAMPLE SNS-0007');
    });

    // Document PDF mounts iframe
    await user.click(screen.getByTestId('workspace-asset-item-DOC-0008.pdf'));
    expect(screen.getByTestId('document-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer-frame')).toBeInTheDocument();

    // Fallback: .heic image shows no-preview fallback & can still be tagged
    await user.click(screen.getByTestId('workspace-asset-item-raw_shot.heic'));
    expect(screen.getByTestId('fallback-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('fallback-guidance-text')).toHaveTextContent(
      /view this file in your usual viewer, then tag it here/i
    );
    await user.click(screen.getByTestId(`select-person-btn-${person001}`));
    expect(screen.getByTestId('workspace-asset-status-raw_shot.heic')).toHaveTextContent('tagged (1)');

    // Fallback: .mkv video shows fallback + requires "I reviewed it outside the app"
    await user.click(screen.getByTestId('workspace-asset-item-unplayable.mkv'));
    expect(screen.getByTestId('fallback-viewer')).toBeInTheDocument();
    await user.click(screen.getByTestId(`select-person-btn-${person001}`));
    expect(screen.getByTestId('workspace-asset-status-unplayable.mkv')).toHaveTextContent(
      'not fully reviewed'
    );
    await user.click(screen.getByTestId('confirm-external-review-btn'));
    expect(screen.getByTestId('workspace-asset-status-unplayable.mkv')).toHaveTextContent(
      'tagged (1)'
    );
  });

  it('supports keyboard navigation, zoom, search focus, No person (n), and bystander (b) (R-17)', async () => {
    const user = userEvent.setup();
    await launchWorkspace(user);

    // Move explicitly to IMG-0001.png first, then test blur so keyboard shortcuts fire globally
    await user.click(screen.getByTestId('workspace-asset-item-IMG-0001.png'));
    (document.activeElement as HTMLElement | null)?.blur();

    // Image zoom keys: +, -, 0
    expect(screen.getByTestId('image-zoom-level')).toHaveTextContent('100%');
    await user.keyboard('+');
    expect(screen.getByTestId('image-zoom-level')).toHaveTextContent('125%');
    await user.keyboard('0');
    expect(screen.getByTestId('image-zoom-level')).toHaveTextContent('100%');

    // Focus search via '/' and select first match via Enter
    await user.keyboard('/');
    expect(screen.getByTestId('participant-search-input')).toHaveFocus();
    await user.type(screen.getByTestId('participant-search-input'), '001');
    await user.keyboard('{Enter}');
    expect(
      screen.getByTestId('selected-person-chip-3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1')
    ).toBeInTheDocument();

    // Clear search and blur input before using workspace shortcuts
    await user.clear(screen.getByTestId('participant-search-input'));
    (document.activeElement as HTMLElement | null)?.blur();

    // ArrowDown moves to IMG-0002.png; 'b' increments bystander count
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('viewer-asset-id')).toHaveTextContent('IMG-0002.png');
    await user.keyboard('b');
    expect(screen.getByTestId('bystander-count-value')).toHaveTextContent('1');

    // ArrowDown -> IMG-0003.png, ArrowDown -> IMG-0004.png; 'n' toggles No person
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('viewer-asset-id')).toHaveTextContent('IMG-0004.png');
    await user.keyboard('n');
    expect(screen.getByTestId('no-person-toggle')).toHaveAttribute('aria-pressed', 'true');
  });
});
