import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadConsentedList } from '@/list/parser';
import {
  CONTRACT_VERSION,
  type ValidationReportJson,
  validateExportCsv,
  validateExportWithConsentedList,
} from '@/validation';

interface GoldenCaseExpectation {
  now: string;
  error_codes: string[];
  warning_codes: string[];
}

interface GoldenExpectedSpec {
  list: string;
  cases: Record<string, GoldenCaseExpectation>;
}

describe('T-07 Golden Cases Parity Suite (validateExport vs tools/validate_export.py)', () => {
  const goldenDir = path.resolve(
    __dirname,
    '../../../docs/consent-tagging/examples/golden'
  );
  const expectedJsonPath = path.join(goldenDir, 'expected.json');
  const spec: GoldenExpectedSpec = JSON.parse(fs.readFileSync(expectedJsonPath, 'utf8'));
  const listPath = path.resolve(goldenDir, spec.list);
  const listCsvText = fs.readFileSync(listPath, 'utf8');

  const parsedListResult = loadConsentedList(listCsvText, {
    referenceTime: '2026-11-05T12:00:00Z',
  });

  const caseEntries = Object.entries(spec.cases);

  it('loads at least 18 golden cases from expected.json and parses the sample consented list', () => {
    expect(caseEntries.length).toBeGreaterThanOrEqual(18);
    expect(parsedListResult.success).toBe(true);
  });

  describe.each(caseEntries)('Golden case: %s', (caseFileName, want) => {
    const casePath = path.join(goldenDir, caseFileName);
    const exportCsvText = fs.readFileSync(casePath, 'utf8');

    it('produces exact expected error_codes and warning_codes via validateExportCsv (T-07)', () => {
      const report = validateExportCsv(listCsvText, exportCsvText, want.now);

      const actualErrorCodes = [...new Set(report.errors.map((e) => e.code))].sort();
      const actualWarningCodes = [...new Set(report.warnings.map((w) => w.code))].sort();

      expect(actualErrorCodes).toEqual(want.error_codes);
      expect(actualWarningCodes).toEqual(want.warning_codes);
      expect(report.valid).toBe(want.error_codes.length === 0);
      expect(report.contractVersion).toBe(CONTRACT_VERSION);

      const json = report.toJson();
      expect(json.contract_version).toBe(1);
      expect(json.valid).toBe(want.error_codes.length === 0);
    });

    it('produces identical codes via in-memory validateExportWithConsentedList (R-25)', () => {
      if (!parsedListResult.success) {
        throw new Error('Sample consented list failed to parse');
      }
      const report = validateExportWithConsentedList(
        parsedListResult.data,
        exportCsvText,
        want.now
      );

      const actualErrorCodes = [...new Set(report.errors.map((e) => e.code))].sort();
      const actualWarningCodes = [...new Set(report.warnings.map((w) => w.code))].sort();

      expect(actualErrorCodes).toEqual(want.error_codes);
      expect(actualWarningCodes).toEqual(want.warning_codes);
    });

    it('never leaks participant display names or contact hints in findings (AGENTS.md Rule 8)', () => {
      const report = validateExportCsv(listCsvText, exportCsvText, want.now);
      const serialized = JSON.stringify(report.toJson());

      for (const forbidden of [
        'Synthetic Person 001',
        'Synthetic Person 002',
        'Synthetic Person 003',
        'Synthetic Person 004',
        '…01',
        '…02',
        '…03',
        '…04',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    });
  });

  it('matches tools/validate_export.py --json output field-for-field across all 18 golden cases', () => {
    const validatorPy = path.resolve(__dirname, '../../../tools/validate_export.py');
    const pythonCmd = (() => {
      for (const candidate of ['python', 'python3']) {
        try {
          execFileSync(candidate, ['--version'], { stdio: 'ignore' });
          return candidate;
        } catch {
          // try next
        }
      }
      return 'python';
    })();

    for (const [caseFileName, want] of caseEntries) {
      const casePath = path.join(goldenDir, caseFileName);
      const exportCsvText = fs.readFileSync(casePath, 'utf8');
      const tsJson = validateExportCsv(listCsvText, exportCsvText, want.now).toJson();

      let stdout: string;
      try {
        stdout = execFileSync(
          pythonCmd,
          [validatorPy, '--list', listPath, '--export', casePath, '--now', want.now, '--json'],
          { encoding: 'utf8' }
        );
      } catch (err: unknown) {
        const execErr = err as { stdout?: string; status?: number };
        if (execErr.status === 1 && typeof execErr.stdout === 'string') {
          stdout = execErr.stdout;
        } else {
          throw err;
        }
      }

      const pyJson = JSON.parse(stdout) as ValidationReportJson;
      expect(tsJson).toEqual(pyJson);
    }
  });
});
