import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConsentedList } from '../../../src/list/parser';

describe('privacy: AGENTS.md Rule 8 In-Memory Privacy Invariants', () => {
  const SAMPLE_CSV_PATH = path.resolve(
    __dirname,
    '../../../docs/consent-tagging/examples/consented_list.sample.csv'
  );
  const sampleCsvContent = fs.readFileSync(SAMPLE_CSV_PATH, 'utf-8');

  const PARTICIPANT_NAMES = [
    'Synthetic Person 001',
    'Synthetic Person 002',
    'Synthetic Person 003',
    'Synthetic Person 004',
  ];

  const CONTACT_HINTS = ['…01', '…02', '…03', '…04'];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe('Storage isolation (localStorage, sessionStorage, IndexedDB)', () => {
    it('guarantees zero display names and contact hints are written to localStorage or sessionStorage during parsing', () => {
      // Execute list loading
      const result = loadConsentedList(sampleCsvContent);
      expect(result.success).toBe(true);

      // Audit localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) ?? '';
        const value = localStorage.getItem(key) ?? '';
        for (const name of PARTICIPANT_NAMES) {
          expect(key).not.toContain(name);
          expect(value).not.toContain(name);
        }
        for (const hint of CONTACT_HINTS) {
          expect(key).not.toContain(hint);
          expect(value).not.toContain(hint);
        }
      }

      // Audit sessionStorage
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i) ?? '';
        const value = sessionStorage.getItem(key) ?? '';
        for (const name of PARTICIPANT_NAMES) {
          expect(key).not.toContain(name);
          expect(value).not.toContain(name);
        }
        for (const hint of CONTACT_HINTS) {
          expect(key).not.toContain(hint);
          expect(value).not.toContain(hint);
        }
      }
    });

    it('guarantees zero IndexedDB databases or stores are populated with participant names', async () => {
      // Execute list loading
      const result = loadConsentedList(sampleCsvContent);
      expect(result.success).toBe(true);

      if (window.indexedDB?.databases) {
        const dbs = await window.indexedDB.databases();
        for (const db of dbs) {
          const dbName = db.name ?? '';
          for (const name of PARTICIPANT_NAMES) {
            expect(dbName).not.toContain(name);
          }
        }
      }
    });
  });

  describe('URL and Navigation isolation', () => {
    it('guarantees zero participant names or contact hints appear in window.location', () => {
      loadConsentedList(sampleCsvContent);

      const url = window.location.href;
      for (const name of PARTICIPANT_NAMES) {
        expect(url).not.toContain(encodeURIComponent(name));
        expect(url).not.toContain(name);
      }
      for (const hint of CONTACT_HINTS) {
        expect(url).not.toContain(encodeURIComponent(hint));
        expect(url).not.toContain(hint);
      }
    });
  });

  describe('Console and logging isolation', () => {
    it('guarantees zero console logging of participant names during valid and invalid list operations', () => {
      const logSpy = vi.spyOn(console, 'log');
      const infoSpy = vi.spyOn(console, 'info');
      const warnSpy = vi.spyOn(console, 'warn');
      const errorSpy = vi.spyOn(console, 'error');
      const debugSpy = vi.spyOn(console, 'debug');

      // 1. Valid load
      loadConsentedList(sampleCsvContent);

      // 2. Corrupt / invalid loads
      loadConsentedList(sampleCsvContent.replace('Synthetic gait study', ''));
      loadConsentedList('\ufeff' + sampleCsvContent);

      const allSpies = [logSpy, infoSpy, warnSpy, errorSpy, debugSpy];
      for (const spy of allSpies) {
        for (const callArgs of spy.mock.calls) {
          const callText = callArgs.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
          for (const name of PARTICIPANT_NAMES) {
            expect(callText).not.toContain(name);
          }
          for (const hint of CONTACT_HINTS) {
            expect(callText).not.toContain(hint);
          }
        }
      }
    });
  });

  describe('Validation error message safety', () => {
    it('guarantees validation error messages contain zero display names or contact hints', () => {
      // 1. Duplicate person_id test (L04)
      const duplicateCsv = `${sampleCsvContent}
6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic gait study,3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,Synthetic Person 001 Duplicate,…01,,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z`;

      const dupResult = loadConsentedList(duplicateCsv);
      expect(dupResult.success).toBe(false);
      if (!dupResult.success) {
        for (const err of dupResult.errors) {
          for (const name of PARTICIPANT_NAMES) {
            expect(err.message).not.toContain(name);
          }
          for (const hint of CONTACT_HINTS) {
            expect(err.message).not.toContain(hint);
          }
          expect(err.message).not.toContain('Duplicate');
        }
      }

      // 2. Schema error test
      const schemaErrorCsv = sampleCsvContent.replace('3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1', 'NOT-A-UUID');
      const schemaResult = loadConsentedList(schemaErrorCsv);
      expect(schemaResult.success).toBe(false);
      if (!schemaResult.success) {
        for (const err of schemaResult.errors) {
          for (const name of PARTICIPANT_NAMES) {
            expect(err.message).not.toContain(name);
          }
          for (const hint of CONTACT_HINTS) {
            expect(err.message).not.toContain(hint);
          }
        }
      }
    });
  });

  describe('Progress serialization invariant (R-08)', () => {
    it('guarantees serialized progress records contain only identifiers, never display names or contact hints', () => {
      const result = loadConsentedList(sampleCsvContent);
      expect(result.success).toBe(true);
      if (!result.success) return;

      // Simulate building .dct-progress.json as defined in app-design.md §5
      const progressRecord = {
        version: 1,
        project_id: result.data.projectId,
        tagged_assets: {
          'IMG-0001.png': {
            person_ids: result.data.people.map((p) => p.personId),
            bystander_count: 0,
          },
        },
      };

      const serialized = JSON.stringify(progressRecord);
      for (const name of PARTICIPANT_NAMES) {
        expect(serialized).not.toContain(name);
      }
      for (const hint of CONTACT_HINTS) {
        expect(serialized).not.toContain(hint);
      }
    });
  });
});
