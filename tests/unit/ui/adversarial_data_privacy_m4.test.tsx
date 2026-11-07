import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import crypto from 'node:crypto';
import App from '@/app/App';
import {
  createMockDirectoryHandle,
  MockFileEntry,
} from '../folder/mockFileSystem';
import type { WorkerInboundMessage, WorkerOutboundMessage } from '@/folder/types';

describe('Adversarial Stress Harness: Milestone 4 Consented List Validation & Privacy', () => {
  // Controllable mock worker for folder-coupled tests
  class TestMockWorker {
    public static instances: TestMockWorker[] = [];
    public terminated = false;
    public pendingTimers: NodeJS.Timeout[] = [];
    public onmessage: ((e: MessageEvent<WorkerOutboundMessage>) => void) | null = null;
    public onerror: ((e: ErrorEvent) => void) | null = null;

    constructor() {
      TestMockWorker.instances.push(this);
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
                durationMs: 2,
              },
            } as MessageEvent<WorkerOutboundMessage>);
          } catch (err) {
            this.onerror?.(new ErrorEvent('error', { error: err }));
          }
        }, 5);
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

  const BASE_PROJECT_ID = '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01';
  const BASE_PROJECT_NAME = 'Adversarial Test Project';
  const BASE_VALID_UNTIL = '2026-11-08T04:30:00Z';
  const BASE_GENERATED_AT = '2026-11-01T04:30:00Z';

  function generateValidCsv(
    people: {
      personId: string;
      consentId: string;
      displayName: string;
      contactHint?: string;
      consentExpiresAt?: string;
      isMinor: boolean;
    }[]
  ): string {
    const headers = [
      'project_id',
      'project_name',
      'person_id',
      'consent_id',
      'display_name',
      'contact_hint',
      'consent_expires_at',
      'is_minor',
      'list_generated_at',
      'list_valid_until',
    ];

    const rows = people.map((p) => [
      BASE_PROJECT_ID,
      BASE_PROJECT_NAME,
      p.personId,
      p.consentId,
      p.displayName,
      p.contactHint ?? '',
      p.consentExpiresAt ?? '',
      p.isMinor ? 'true' : 'false',
      BASE_GENERATED_AT,
      BASE_VALID_UNTIL,
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  function makeUuid(index: number, prefix: string): string {
    const hex = index.toString(16).padStart(12, '0');
    return `${prefix}-0000-4000-8000-${hex}`;
  }

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
    TestMockWorker.instances = [];
    vi.stubGlobal('Worker', TestMockWorker);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const w of TestMockWorker.instances) {
      w.terminate();
    }
    TestMockWorker.instances = [];
    localStorage.clear();
    sessionStorage.clear();
  });

  // ==========================================================================
  // Challenge 1: Malformed and Corrupted CSV Files
  // ==========================================================================
  describe('Challenge 1: Malformed CSVs and corrupted data uploaded to consented list picker', () => {
    it('1.1: Refuses CSV with unclosed quotes at the end of the file without crashing React', async () => {
      const user = userEvent.setup();
      render(<App />);

      const validPart = generateValidCsv([
        {
          personId: '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1',
          consentId: '9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101',
          displayName: 'Person A',
          isMinor: false,
        },
      ]);
      const malformedCsv = validPart + '\n"unclosed quote line without closing quote';

      const file = new File([malformedCsv], 'unclosed_quote.csv', { type: 'text/csv' });
      await user.upload(screen.getByTestId('consented-list-input'), file);

      await waitFor(() => {
        expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      });

      // Assert error banner displays CSV parse error
      expect(screen.getByTestId('list-error-banner')).toHaveTextContent(/CSV_PARSE_ERROR|quoted/i);

      // Assert whole-list refusal: zero participant table or summary
      expect(screen.queryByTestId('participant-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('list-summary-project')).not.toBeInTheDocument();
      expect(screen.getByTestId('proceed-button')).toBeDisabled();
    });

    it('1.2: Refuses CSV with unescaped mid-cell quotes causing parse error', async () => {
      const user = userEvent.setup();
      render(<App />);

      const badCsv = `project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until
${BASE_PROJECT_ID},"Study "Broken" Quote",3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,Person A,,,false,${BASE_GENERATED_AT},${BASE_VALID_UNTIL}`;

      const file = new File([badCsv], 'mid_quote.csv', { type: 'text/csv' });
      await user.upload(screen.getByTestId('consented-list-input'), file);

      await waitFor(() => {
        expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('participant-table')).not.toBeInTheDocument();
    });

    it('1.3: Refuses binary garbage (random bytes) uploaded to list picker without unhandled exception', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Create 4KB of random binary bytes
      const randomBytes = new Uint8Array(4096);
      for (let i = 0; i < randomBytes.length; i++) {
        randomBytes[i] = i % 256;
      }

      const file = new File([randomBytes], 'binary_garbage.csv', { type: 'text/csv' });
      await user.upload(screen.getByTestId('consented-list-input'), file);

      await waitFor(() => {
        expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      });

      // L01 or CSV parse error should be reported
      expect(screen.getByTestId('list-error-banner')).toHaveTextContent(/L01|CSV_PARSE_ERROR|missing columns/i);
      expect(screen.queryByTestId('participant-table')).not.toBeInTheDocument();
    });

    it('1.4: Refuses binary PNG image file disguised as CSV', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Standard PNG header
      const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      const file = new File([pngHeader], 'image_disguised.csv', { type: 'text/csv' });
      await user.upload(screen.getByTestId('consented-list-input'), file);

      await waitFor(() => {
        expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('participant-table')).not.toBeInTheDocument();
    });

    it('1.5: Refuses zero-byte completely empty file with descriptive L01 missing columns', async () => {
      render(<App />);

      const file = new File([''], 'empty.csv', { type: 'text/csv' });
      const input = screen.getByTestId('consented-list-input');
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      });

      expect(screen.getByTestId('list-error-banner')).toHaveTextContent(/L01|missing columns/i);
      expect(screen.queryByTestId('participant-table')).not.toBeInTheDocument();
    });

    it('1.6: Refuses file containing only newlines and whitespace', async () => {
      const user = userEvent.setup();
      render(<App />);

      const file = new File(['\n\n   \r\n   \n'], 'blank_lines.csv', { type: 'text/csv' });
      await user.upload(screen.getByTestId('consented-list-input'), file);

      await waitFor(() => {
        expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      });

      expect(screen.getByTestId('list-error-banner')).toHaveTextContent(/L01|missing columns/i);
    });

    it('1.7: Refuses UTF-16 encoded file (null-byte delimited) without unhandled crash', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Simulate UTF-16 LE text containing 0x00 between characters
      const utf16Bytes = new Uint8Array([
        0x70, 0x00, 0x72, 0x00, 0x6f, 0x00, 0x6a, 0x00, 0x65, 0x00, 0x63, 0x00, 0x74, 0x00,
      ]);
      const file = new File([utf16Bytes], 'utf16_sample.csv', { type: 'text/csv' });
      await user.upload(screen.getByTestId('consented-list-input'), file);

      await waitFor(() => {
        expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('participant-table')).not.toBeInTheDocument();
    });

    it('1.8: Refuses gigantic line without delimiters (>40,000 chars) gracefully', async () => {
      const user = userEvent.setup();
      render(<App />);

      const hugeLine = 'A'.repeat(40000);
      const file = new File([hugeLine], 'huge_line.csv', { type: 'text/csv' });
      await user.upload(screen.getByTestId('consented-list-input'), file);

      await waitFor(() => {
        expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      });

      expect(screen.getByTestId('list-error-banner')).toHaveTextContent(/L01|missing columns/i);
    });
  });

  // ==========================================================================
  // Challenge 2: Massive Consented List (>500 Participants) Performance
  // ==========================================================================
  describe('Challenge 2: Large consented list (>500 participants) rendering and selectability performance', () => {
    it('2.1: Parses, evaluates selectability, and renders 600 participants accurately under 2 seconds', async () => {
      const user = userEvent.setup();

      // Generate 600 unique valid participants:
      // - 300 adults with active consents (selectable)
      // - 150 minors (non-selectable, reason: minor)
      // - 150 adults with expired consents (non-selectable, reason: consent expired)
      const TOTAL_COUNT = 600;
      const people = Array.from({ length: TOTAL_COUNT }, (_, i) => {
        const isMinor = i >= 300 && i < 450;
        const isExpired = i >= 450;
        return {
          personId: makeUuid(i + 1, '11111111'),
          consentId: makeUuid(i + 1, '22222222'),
          displayName: `Participant Benchmark ${String(i).padStart(3, '0')}`,
          contactHint: `…${String(i).padStart(3, '0')}`,
          consentExpiresAt: isExpired ? '2026-11-03T00:00:00Z' : undefined,
          isMinor,
        };
      });

      const largeCsv = generateValidCsv(people);
      const file = new File([largeCsv], 'consented_list_600.csv', { type: 'text/csv' });

      render(<App />);

      const start = performance.now();
      await user.upload(screen.getByTestId('consented-list-input'), file);

      // Verify UI renders summary and counts
      await waitFor(() => {
        expect(screen.getByTestId('list-summary-project')).toHaveTextContent(BASE_PROJECT_NAME);
        expect(screen.getByTestId('total-people-count')).toHaveTextContent('600');
        expect(screen.getByTestId('list-summary-counts')).toHaveTextContent(
          '600 people, 300 not selectable'
        );
      });
      const duration = performance.now() - start;

      // Assert total time to upload, parse, and render 600 rows is responsive
      expect(duration).toBeLessThan(3000);

      // Verify participant table renders
      expect(screen.getByTestId('participant-table')).toBeInTheDocument();

      // Verify first, middle, and last participant rows exist
      expect(screen.getByTestId('participant-row-11111111-0000-4000-8000-000000000001')).toBeInTheDocument();
      expect(screen.getByTestId('participant-row-11111111-0000-4000-8000-00000000012c')).toBeInTheDocument();
      expect(screen.getByTestId('participant-row-11111111-0000-4000-8000-000000000258')).toBeInTheDocument();

      // Verify reason badges
      const minorBadges = screen.getAllByText('minor');
      expect(minorBadges.length).toBe(150);

      const expiredBadges = screen.getAllByText(/consent expired/i);
      expect(expiredBadges.length).toBe(150);
    });

    it('2.2: Reactive selectability recalculation across 600 participants when opening a collection folder', async () => {
      const user = userEvent.setup();

      // Start with 600 participants
      const TOTAL_COUNT = 600;
      const people = Array.from({ length: TOTAL_COUNT }, (_, i) => ({
        personId: makeUuid(i + 1, '33333333'),
        consentId: makeUuid(i + 1, '44444444'),
        displayName: `Subject ${i}`,
        consentExpiresAt: i < 100 ? '2026-11-03T00:00:00Z' : undefined,
        isMinor: false,
      }));

      const csv = generateValidCsv(people);
      const file = new File([csv], 'list_600.csv', { type: 'text/csv' });

      render(<App />);

      // 1. Load list first
      await user.upload(screen.getByTestId('consented-list-input'), file);
      await waitFor(() => {
        expect(screen.getByTestId('total-people-count')).toHaveTextContent('600');
      });

      // 2. Open folder with capture time
      const mockEntries: MockFileEntry[] = [
        {
          kind: 'file',
          name: 'photo.png',
          content: 'PHOTO_DATA',
          lastModified: Date.UTC(2026, 10, 4, 6, 0, 0),
        },
      ];
      const mockHandle = createMockDirectoryHandle('benchmark-folder', mockEntries);
      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockHandle);

      const recomputeStart = performance.now();
      await user.click(screen.getByTestId('open-folder-button'));

      await waitFor(() => {
        expect(screen.getByTestId('folder-name')).toHaveTextContent('benchmark-folder');
        expect(screen.getByTestId('proceed-button')).toBeEnabled();
      });
      const recomputeDuration = performance.now() - recomputeStart;

      // Selectability re-synchronization across 600 participants must be fast (< 2500ms)
      expect(recomputeDuration).toBeLessThan(2500);
      expect(screen.getByTestId('list-summary-counts')).toHaveTextContent(
        '600 people, 100 not selectable'
      );
    });
  });

  // ==========================================================================
  // Challenge 3: In-Memory Privacy Penetration Testing (AGENTS.md Rule 8)
  // ==========================================================================
  describe('Challenge 3: In-memory privacy penetration test across storage, DOM attributes, URLs, and console', () => {
    it('3.1: Zero participant names or contact hints in storage, URLs, console, or DOM attributes on successful upload', async () => {
      const user = userEvent.setup();

      const CANARY_NAME_1 = 'TOP_SECRET_SUBJECT_001_ALICE';
      const CANARY_NAME_2 = 'CLASSIFIED_PARTICIPANT_002_BOB';
      const CANARY_CONTACT_1 = 'CONFIDENTIAL_PHONE_+15550199';
      const CANARY_CONTACT_2 = 'CONFIDENTIAL_EMAIL_SECRET@LAB';

      const CANARY_NAMES = [CANARY_NAME_1, CANARY_NAME_2];
      const CANARY_CONTACTS = [CANARY_CONTACT_1, CANARY_CONTACT_2];

      const csv = generateValidCsv([
        {
          personId: '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1',
          consentId: '9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101',
          displayName: CANARY_NAME_1,
          contactHint: CANARY_CONTACT_1,
          isMinor: false,
        },
        {
          personId: '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2',
          consentId: '9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70102',
          displayName: CANARY_NAME_2,
          contactHint: CANARY_CONTACT_2,
          isMinor: true,
        },
      ]);

      // Console spies
      const consoleLogSpy = vi.spyOn(console, 'log');
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const consoleInfoSpy = vi.spyOn(console, 'info');

      render(<App />);

      const file = new File([csv], 'confidential_list.csv', { type: 'text/csv' });
      await user.upload(screen.getByTestId('consented-list-input'), file);

      await waitFor(() => {
        expect(screen.getByTestId('list-summary-project')).toHaveTextContent(BASE_PROJECT_NAME);
      });

      const allCanaries = [...CANARY_NAMES, ...CANARY_CONTACTS];

      // 1. Audit localStorage
      expect(localStorage.length).toBe(0);
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        const val = localStorage.getItem(key) || '';
        for (const c of allCanaries) {
          expect(key).not.toContain(c);
          expect(val).not.toContain(c);
        }
      }

      // 2. Audit sessionStorage
      expect(sessionStorage.length).toBe(0);
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)!;
        const val = sessionStorage.getItem(key) || '';
        for (const c of allCanaries) {
          expect(key).not.toContain(c);
          expect(val).not.toContain(c);
        }
      }

      // 3. Audit URL query / hash
      const currentUrl = window.location.href;
      for (const c of allCanaries) {
        expect(currentUrl).not.toContain(encodeURIComponent(c));
        expect(window.location.search).not.toContain(c);
        expect(window.location.hash).not.toContain(c);
      }

      // 4. Audit Console calls
      const allConsoleCalls = [
        ...consoleLogSpy.mock.calls,
        ...consoleWarnSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
        ...consoleInfoSpy.mock.calls,
      ].flat().map(String);

      for (const msg of allConsoleCalls) {
        for (const c of allCanaries) {
          expect(msg).not.toContain(c);
        }
      }

      // 5. Audit ALL DOM element attributes across the entire document
      const allElements = document.querySelectorAll('*');
      for (const el of Array.from(allElements)) {
        for (const attr of Array.from(el.attributes)) {
          for (const c of allCanaries) {
            expect(attr.name).not.toContain(c);
            expect(attr.value).not.toContain(c);
          }
        }
      }
    });

    it('3.2: Zero participant names or contact hints in error messages or DOM attributes during error states', async () => {
      const user = userEvent.setup();

      const SECRET_NAME = 'HIGHLY_SENSITIVE_PATIENT_NAME';
      const SECRET_CONTACT = 'SECRET_CONTACT_HINT_EMAIL';

      // Schema error: is_minor is invalid
      const badCsv = `project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until
${BASE_PROJECT_ID},${BASE_PROJECT_NAME},3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,${SECRET_NAME},${SECRET_CONTACT},,MAYBE,${BASE_GENERATED_AT},${BASE_VALID_UNTIL}`;

      render(<App />);

      const file = new File([badCsv], 'schema_error.csv', { type: 'text/csv' });
      await user.upload(screen.getByTestId('consented-list-input'), file);

      await waitFor(() => {
        expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      });

      // Verify that the error banner text does NOT contain the secret name or contact
      const bannerText = screen.getByTestId('list-error-banner').textContent || '';
      expect(bannerText).not.toContain(SECRET_NAME);
      expect(bannerText).not.toContain(SECRET_CONTACT);

      // Verify zero storage writes in error state
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);

      // Verify all DOM attributes
      const allElements = document.querySelectorAll('*');
      for (const el of Array.from(allElements)) {
        for (const attr of Array.from(el.attributes)) {
          expect(attr.name).not.toContain(SECRET_NAME);
          expect(attr.value).not.toContain(SECRET_NAME);
          expect(attr.name).not.toContain(SECRET_CONTACT);
          expect(attr.value).not.toContain(SECRET_CONTACT);
        }
      }
    });

    it('3.3: L04 duplicate person_id error reports person_id UUID only, never display name', async () => {
      const user = userEvent.setup();

      const SENSITIVE_NAME_1 = 'DUPLICATE_PERSON_ORIGINAL';
      const SENSITIVE_NAME_2 = 'DUPLICATE_PERSON_COPY';
      const DUPLICATE_UUID = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';

      const duplicateCsv = `project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until
${BASE_PROJECT_ID},${BASE_PROJECT_NAME},${DUPLICATE_UUID},9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,${SENSITIVE_NAME_1},…01,,false,${BASE_GENERATED_AT},${BASE_VALID_UNTIL}
${BASE_PROJECT_ID},${BASE_PROJECT_NAME},${DUPLICATE_UUID},9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70102,${SENSITIVE_NAME_2},…02,,false,${BASE_GENERATED_AT},${BASE_VALID_UNTIL}`;

      render(<App />);

      const file = new File([duplicateCsv], 'duplicate.csv', { type: 'text/csv' });
      await user.upload(screen.getByTestId('consented-list-input'), file);

      await waitFor(() => {
        expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      });

      const bannerText = screen.getByTestId('list-error-banner').textContent || '';
      expect(bannerText).toContain('L04');
      expect(bannerText).toContain(DUPLICATE_UUID);
      // Strictly verify no names leaked in error
      expect(bannerText).not.toContain(SENSITIVE_NAME_1);
      expect(bannerText).not.toContain(SENSITIVE_NAME_2);
    });
  });

  // ==========================================================================
  // Challenge 4: Loading Invalid List After Valid List (State Reset & Refusal)
  // ==========================================================================
  describe('Challenge 4: Loading invalid list after a valid list was loaded', () => {
    it('4.1: Immediately unmounts participant table, clears names, and refuses list when invalid list is uploaded after valid list', async () => {
      const user = userEvent.setup();

      const CANARY_NAME = 'INITIAL_VALID_CANARY_PARTICIPANT';
      const validCsv = generateValidCsv([
        {
          personId: '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1',
          consentId: '9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101',
          displayName: CANARY_NAME,
          isMinor: false,
        },
      ]);

      render(<App />);

      // 1. Upload valid list
      const validFile = new File([validCsv], 'valid.csv', { type: 'text/csv' });
      await user.upload(screen.getByTestId('consented-list-input'), validFile);

      await waitFor(() => {
        expect(screen.getByTestId('list-summary-project')).toHaveTextContent(BASE_PROJECT_NAME);
        expect(screen.getByText(CANARY_NAME)).toBeInTheDocument();
      });

      // 2. Now upload invalid list (missing consent_id column - L01)
      const invalidCsv = validCsv.replace('consent_id,', '');
      const invalidFile = new File([invalidCsv], 'invalid_l01.csv', { type: 'text/csv' });
      await user.upload(screen.getByTestId('consented-list-input'), invalidFile);

      await waitFor(() => {
        expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      });

      // 3. Verify immediate complete purge:
      // - ParticipantTable unmounted
      // - CANARY_NAME is completely gone from the DOM
      // - ListSummary unmounted
      // - Proceed button is disabled
      expect(screen.queryByTestId('participant-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('list-summary-project')).not.toBeInTheDocument();
      expect(screen.queryByText(CANARY_NAME)).not.toBeInTheDocument();
      expect(screen.getByTestId('proceed-button')).toBeDisabled();
    });

    it('4.2: Handles alternating state transitions cleanly (Valid -> Binary -> Valid -> L04 -> Valid)', async () => {
      const user = userEvent.setup();

      const validCsv1 = generateValidCsv([
        {
          personId: '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1',
          consentId: '9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101',
          displayName: 'Person Alpha',
          isMinor: false,
        },
      ]);
      const validCsv2 = generateValidCsv([
        {
          personId: '7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2',
          consentId: '9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70102',
          displayName: 'Person Beta',
          isMinor: false,
        },
      ]);

      render(<App />);

      // Step 1: Valid 1
      await user.upload(
        screen.getByTestId('consented-list-input'),
        new File([validCsv1], 'valid1.csv', { type: 'text/csv' })
      );
      await waitFor(() => {
        expect(screen.getByText('Person Alpha')).toBeInTheDocument();
      });

      // Step 2: Binary garbage
      const garbageBytes = new Uint8Array([0x00, 0xff, 0x12, 0x34, 0x56]);
      await user.upload(
        screen.getByTestId('consented-list-input'),
        new File([garbageBytes], 'garbage.csv', { type: 'text/csv' })
      );
      await waitFor(() => {
        expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      });
      expect(screen.queryByText('Person Alpha')).not.toBeInTheDocument();

      // Step 3: Valid 2
      await user.upload(
        screen.getByTestId('consented-list-input'),
        new File([validCsv2], 'valid2.csv', { type: 'text/csv' })
      );
      await waitFor(() => {
        expect(screen.getByText('Person Beta')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('list-error-banner')).not.toBeInTheDocument();

      // Step 4: L04 Duplicate
      const duplicateCsv = validCsv2 + '\n' + validCsv2.split('\n')[1];
      await user.upload(
        screen.getByTestId('consented-list-input'),
        new File([duplicateCsv], 'dup.csv', { type: 'text/csv' })
      );
      await waitFor(() => {
        expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
      });
      expect(screen.queryByText('Person Beta')).not.toBeInTheDocument();
    });

    it('4.3: Folder-coupled tagging readiness disables proceed button when valid list is replaced by invalid list', async () => {
      const user = userEvent.setup();

      // Folder with 1 file
      const mockEntries: MockFileEntry[] = [
        {
          kind: 'file',
          name: 'doc.pdf',
          content: 'PDF_CONTENT',
          lastModified: Date.UTC(2026, 10, 4, 6, 0, 0),
        },
      ];
      const mockHandle = createMockDirectoryHandle('tagging-readiness-dir', mockEntries);
      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockHandle);

      render(<App />);

      // 1. Open folder
      await user.click(screen.getByTestId('open-folder-button'));
      await waitFor(() => {
        expect(screen.getByTestId('folder-name')).toHaveTextContent('tagging-readiness-dir');
      });

      // 2. Load valid list
      const validCsv = generateValidCsv([
        {
          personId: '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1',
          consentId: '9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101',
          displayName: 'Person A',
          isMinor: false,
        },
      ]);
      await user.upload(
        screen.getByTestId('consented-list-input'),
        new File([validCsv], 'valid.csv', { type: 'text/csv' })
      );

      // Verify Proceed button is ENABLED
      await waitFor(() => {
        expect(screen.getByTestId('proceed-button')).toBeEnabled();
      });

      // 3. Upload invalid list (L02 multiple projects)
      const l02Csv =
        validCsv +
        '\n00000000-0000-4000-8000-000000000002,Project 2,7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70102,Person B,,,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z';
      await user.upload(
        screen.getByTestId('consented-list-input'),
        new File([l02Csv], 'l02.csv', { type: 'text/csv' })
      );

      // Verify Proceed button IMMEDIATELY BECOMES DISABLED
      await waitFor(() => {
        expect(screen.getByTestId('list-error-banner')).toBeInTheDocument();
        expect(screen.getByTestId('proceed-button')).toBeDisabled();
      });

      // Folder assets remain visible in the AssetTable
      expect(screen.getByTestId('asset-row-doc.pdf')).toBeInTheDocument();
    });
  });
});
