import { test, expect } from '@playwright/test';

test.describe('Milestone 4 Adversarial Data & Privacy E2E Suite', () => {
  // Skip on Firefox where File System Access API is intentionally gated
  test.skip(({ browserName }) => browserName === 'firefox', 'FSA API is not supported in Firefox');

  const BASE_PROJECT_ID = '6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01';
  const BASE_PROJECT_NAME = 'E2E Adversarial Testing Study';
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

  test('Challenge 1: Malformed CSVs, unclosed quotes, and binary garbage uploaded in real browser', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#app-shell')).toBeVisible();

    // 1.1 Unclosed quote
    const unclosedQuoteCsv = `project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until
${BASE_PROJECT_ID},${BASE_PROJECT_NAME},3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,Person A,,,false,${BASE_GENERATED_AT},${BASE_VALID_UNTIL}
"unclosed quote line`;

    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'unclosed.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(unclosedQuoteCsv),
    });

    await expect(page.getByTestId('list-error-banner')).toBeVisible();
    await expect(page.getByTestId('list-error-banner')).toContainText(/CSV_PARSE_ERROR|quoted/i);
    await expect(page.getByTestId('participant-table')).toHaveCount(0);
    await expect(page.getByTestId('proceed-button')).toBeDisabled();

    // 1.2 Binary garbage buffer
    const binaryGarbage = Buffer.alloc(2048);
    for (let i = 0; i < binaryGarbage.length; i++) binaryGarbage[i] = i % 256;

    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'garbage.bin',
      mimeType: 'text/csv',
      buffer: binaryGarbage,
    });

    await expect(page.getByTestId('list-error-banner')).toBeVisible();
    await expect(page.getByTestId('participant-table')).toHaveCount(0);

    // 1.3 Disguised PNG file
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'fake.png.csv',
      mimeType: 'text/csv',
      buffer: pngHeader,
    });

    await expect(page.getByTestId('list-error-banner')).toBeVisible();
    await expect(page.getByTestId('participant-table')).toHaveCount(0);

    // 1.4 Zero-byte empty file
    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'empty.csv',
      mimeType: 'text/csv',
      buffer: Buffer.alloc(0),
    });

    await expect(page.getByTestId('list-error-banner')).toBeVisible();
    await expect(page.getByTestId('list-error-banner')).toContainText(/L01|missing columns/i);
    await expect(page.getByTestId('participant-table')).toHaveCount(0);
  });

  test('Challenge 2: Large consented list (500 participants) rendering and selectability performance in real browser', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
    await page.goto('/');

    const TOTAL_PARTICIPANTS = 500;
    const people = Array.from({ length: TOTAL_PARTICIPANTS }, (_, i) => {
      const isMinor = i >= 250 && i < 375;
      const isExpired = i >= 375;
      return {
        personId: makeUuid(i + 1, '55555555'),
        consentId: makeUuid(i + 1, '66666666'),
        displayName: `Real Subject ${String(i).padStart(3, '0')}`,
        contactHint: `…${String(i).padStart(3, '0')}`,
        consentExpiresAt: isExpired ? '2026-11-03T00:00:00Z' : undefined,
        isMinor,
      };
    });

    const largeCsv = generateValidCsv(people);

    const startTime = Date.now();
    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'large_500.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(largeCsv),
    });

    await expect(page.getByTestId('list-summary-project')).toHaveText(BASE_PROJECT_NAME);
    await expect(page.getByTestId('total-people-count')).toHaveText('500');
    await expect(page.getByTestId('list-summary-counts')).toContainText('500 people, 250 not selectable');
    const elapsed = Date.now() - startTime;

    // Real browser render and validation under 4 seconds
    expect(elapsed).toBeLessThan(4000);

    // Verify first and last participant rows
    await expect(page.getByTestId('participant-row-55555555-0000-4000-8000-000000000001')).toBeVisible();
    await expect(page.getByTestId('participant-row-55555555-0000-4000-8000-0000000001f4')).toBeAttached();
  });

  test('Challenge 3: Strict in-memory privacy penetration test across storage, DOM attributes, URLs, and console', async ({
    page,
  }) => {
    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));

    await page.goto('/');

    const CANARY_NAME = 'BROWSER_IN_MEMORY_CANARY_NAME';
    const CANARY_CONTACT = 'CONFIDENTIAL_CONTACT_HINT_+9999999';

    const secretCsv = generateValidCsv([
      {
        personId: '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1',
        consentId: '9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101',
        displayName: CANARY_NAME,
        contactHint: CANARY_CONTACT,
        isMinor: false,
      },
    ]);

    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'secret.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(secretCsv),
    });

    await expect(page.getByTestId('list-summary-project')).toBeVisible();

    // Audit localStorage, sessionStorage, IndexedDB, and DOM attributes
    const auditResult = await page.evaluate(
      async ({ canaryName, canaryContact }) => {
        const canaries = [canaryName, canaryContact];
        const leaks: string[] = [];

        // 1. Storage
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!;
          const v = localStorage.getItem(k) || '';
          for (const c of canaries) {
            if (k.includes(c) || v.includes(c)) leaks.push(`localStorage: ${c}`);
          }
        }
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i)!;
          const v = sessionStorage.getItem(k) || '';
          for (const c of canaries) {
            if (k.includes(c) || v.includes(c)) leaks.push(`sessionStorage: ${c}`);
          }
        }

        // 2. IndexedDB
        if (window.indexedDB?.databases) {
          const dbs = await window.indexedDB.databases();
          for (const db of dbs) {
            for (const c of canaries) {
              if (db.name?.includes(c)) leaks.push(`indexedDB name: ${c}`);
            }
          }
        }

        // 3. DOM attributes across ALL elements
        const elements = document.querySelectorAll('*');
        for (const el of Array.from(elements)) {
          for (const attr of Array.from(el.attributes)) {
            for (const c of canaries) {
              if (attr.name.includes(c) || attr.value.includes(c)) {
                leaks.push(`DOM attribute leak: <${el.tagName} ${attr.name}="${attr.value}">`);
              }
            }
          }
        }

        return leaks;
      },
      { canaryName: CANARY_NAME, canaryContact: CANARY_CONTACT }
    );

    expect(auditResult).toEqual([]);

    // Audit console logs
    for (const log of consoleLogs) {
      expect(log).not.toContain(CANARY_NAME);
      expect(log).not.toContain(CANARY_CONTACT);
    }

    // Audit URL
    const url = page.url();
    expect(url).not.toContain(encodeURIComponent(CANARY_NAME));
    expect(url).not.toContain(encodeURIComponent(CANARY_CONTACT));
  });

  test('Challenge 4: Loading invalid list after valid list purges participant table immediately in real browser', async ({
    page,
  }) => {
    await page.goto('/');

    const INITIAL_CANARY = 'INITIAL_CANARY_NAME_TO_BE_PURGED';
    const validCsv = generateValidCsv([
      {
        personId: '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1',
        consentId: '9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101',
        displayName: INITIAL_CANARY,
        isMinor: false,
      },
    ]);

    // 1. Upload valid list
    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'initial_valid.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(validCsv),
    });

    await expect(page.getByText(INITIAL_CANARY)).toBeVisible();
    await expect(page.getByTestId('participant-table')).toBeVisible();

    // 2. Upload invalid list (L01 missing columns)
    const invalidCsv = validCsv.replace('consent_id,', '');
    await page.setInputFiles('[data-testid="consented-list-input"]', {
      name: 'now_invalid.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(invalidCsv),
    });

    // 3. Immediately assert:
    // - Error banner is visible
    // - Participant table is unmounted
    // - INITIAL_CANARY is completely gone from the DOM
    // - Proceed button is disabled
    await expect(page.getByTestId('list-error-banner')).toBeVisible();
    await expect(page.getByTestId('list-error-banner')).toContainText(/L01/i);
    await expect(page.getByTestId('participant-table')).toHaveCount(0);
    await expect(page.getByText(INITIAL_CANARY)).toHaveCount(0);
    await expect(page.getByTestId('proceed-button')).toBeDisabled();
  });
});
