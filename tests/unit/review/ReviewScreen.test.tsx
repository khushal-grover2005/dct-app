import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadConsentedList } from '@/list';
import type { ProgressSaveEntry } from '@/folder';
import type { AssetTagState } from '@/tagging';
import { useReviewExport } from '@/review/useReviewExport';
import { ReviewScreen } from '@/review/ReviewScreen';
import type { ReviewCandidate, SaveSheetResult } from '@/review/types';

const exampleDir = path.resolve(__dirname, '../../../docs/consent-tagging/examples');
const listCsv = fs.readFileSync(path.join(exampleDir, 'consented_list.sample.csv'), 'utf8');
const PERSON_001 = '3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1';

function getList() {
  const parsed = loadConsentedList(listCsv, { referenceTime: '2026-11-05T12:00:00Z' });
  if (!parsed.success) throw new Error('Sample consented list failed to load.');
  return parsed.data;
}

function createAsset(overrides: Partial<AssetTagState> = {}): AssetTagState {
  return {
    assetId: 'IMG-0001.png',
    assetType: 'image',
    capturedAt: '2026-11-04T06:02:11Z',
    captureTimeSource: 'last_modified',
    sizeBytes: 123,
    sha256: 'a'.repeat(64),
    personIds: [PERSON_001],
    bystanderCount: 0,
    noPerson: false,
    reviewedToEnd: true,
    externalReviewConfirmed: false,
    state: 'active',
    ...overrides,
  };
}

function createDirectoryHandle(writes: Array<{ name: string; text: string }>) {
  return {
    async getFileHandle(name: string) {
      return {
        async createWritable() {
          let text = '';
          return {
            async write(value: string) {
              text = value;
            },
            async close() {
              writes.push({ name, text });
            },
          };
        },
      };
    },
  } as unknown as FileSystemDirectoryHandle;
}

function makeInput(assets: AssetTagState[]) {
  const writes: Array<{ name: string; text: string }> = [];
  const savedEntries: ProgressSaveEntry[] = [];
  const recordSave = vi.fn(async (entry: ProgressSaveEntry) => {
    savedEntries.push(entry);
  });
  return {
    writes,
    savedEntries,
    recordSave,
    input: {
      assets,
      consentedList: getList(),
      collectionRef: 'LAB-A-2026-11-04-01',
      directoryHandle: createDirectoryHandle(writes),
      hashingCompleted: true,
      recordSave,
    },
  };
}

function Harness({
  input,
  onJumpToAsset,
}: {
  input: ReturnType<typeof makeInput>['input'];
  onJumpToAsset: (assetId: string) => void;
}) {
  const review = useReviewExport(input);
  return (
    <ReviewScreen
      review={review}
      onBackToWorkspace={() => undefined}
      onBackToStart={() => undefined}
      onJumpToAsset={onJumpToAsset}
    />
  );
}

function candidateWithError(code: string, message: string, assetId: string): ReviewCandidate {
  const saved: SaveSheetResult = {
    saved: false,
    fileName: '',
    exportId: '',
    savedAt: '',
    csvText: '',
    heldAssets: [],
  };
  return {
    sheet: {
      exportId: '',
      exportedAt: '',
      collectionRef: '',
      fileName: '',
      csvText: '',
      rows: [],
      heldAssets: [],
      missingHashAssets: [],
      fileDateAssets: [],
    },
    errors: [{ key: code, code, message, assetId, source: 'validator' }],
    warnings: [],
    metrics: {
      totalAssets: 1,
      deletedAssets: 0,
      exportRowCount: 0,
      personTagRows: 0,
      uniquePeopleTagged: 0,
      heldAssetsCount: 0,
      notDoneAssetsCount: 1,
      unhashedAssetsCount: 0,
      countsByType: { image: 1, video: 0, audio: 0, sensor: 0, document: 0, other: 0 },
    },
    canSave: false,
    canDownload: false,
    filenameWarnings: [],
    saveSheet: async () => saved,
    downloadCopy: () => false,
    isSaving: false,
    saveError: null,
    lastSaved: null,
  };
}

describe('review screen and export workflow', () => {
  let originalCreateObjectUrl: PropertyDescriptor | undefined;
  let originalRevokeObjectUrl: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalCreateObjectUrl) {
      Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
    } else {
      Reflect.deleteProperty(URL, 'createObjectURL');
    }
    if (originalRevokeObjectUrl) {
      Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
    } else {
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
    originalCreateObjectUrl = undefined;
    originalRevokeObjectUrl = undefined;
  });

  it('lists untagged E09 and readiness errors with a jump to the exact asset', async () => {
    const user = userEvent.setup();
    const { input } = makeInput([
      createAsset({
        assetId: 'untagged.png',
        personIds: [],
        noPerson: false,
      }),
    ]);
    const onJumpToAsset = vi.fn();
    render(<Harness input={input} onJumpToAsset={onJumpToAsset} />);

    expect(await screen.findByText('[E09]')).toBeInTheDocument();
    expect(screen.getByTestId('save-sheet-btn')).toBeDisabled();
    await user.click(screen.getAllByTestId('error-jump-untagged.png')[0]!);
    expect(onJumpToAsset).toHaveBeenCalledWith('untagged.png');
  });

  it('reports bystander-only E11 and unreviewed video/audio assets as not done', () => {
    const bystander = makeInput([
      createAsset({
        assetId: 'bystander-only.png',
        personIds: [],
        bystanderCount: 1,
      }),
    ]);
    const { result: bystanderResult } = renderHook(() => useReviewExport(bystander.input));
    expect(bystanderResult.current.errors.map((error) => error.code)).toContain('E11');
    expect(bystanderResult.current.canSave).toBe(false);

    const unreviewed = makeInput([
      createAsset({
        assetId: 'unreviewed-video.mp4',
        assetType: 'video',
        reviewedToEnd: false,
        externalReviewConfirmed: false,
      }),
    ]);
    const { result: unreviewedResult } = renderHook(() => useReviewExport(unreviewed.input));
    expect(unreviewedResult.current.errors.map((error) => error.code)).toContain('NOT_DONE');
    expect(unreviewedResult.current.canSave).toBe(false);
  });

  it('renders E05 findings and lets the operator jump to the asset', async () => {
    const user = userEvent.setup();
    const onJumpToAsset = vi.fn();
    render(
      <ReviewScreen
        review={candidateWithError('E05', 'Consent does not belong to this participant.', 'wrong-consent.png')}
        onBackToWorkspace={() => undefined}
        onBackToStart={() => undefined}
        onJumpToAsset={onJumpToAsset}
      />
    );

    expect(screen.getByText('[E05]')).toBeInTheDocument();
    await user.click(screen.getByTestId('error-jump-wrong-consent.png'));
    expect(onJumpToAsset).toHaveBeenCalledWith('wrong-consent.png');
  });

  it('saves with a fresh export id each time, records held assets, and downloads a copy', async () => {
    const user = userEvent.setup();
    const { input, writes, savedEntries } = makeInput([
      createAsset({ bystanderCount: 1 }),
    ]);
    const onJumpToAsset = vi.fn();
    const { result } = renderHook(() => useReviewExport(input));
    const createObjectUrl = vi.fn(() => 'blob:review-copy');
    const revokeObjectUrl = vi.fn();
    originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const renderReview = () => (
      <ReviewScreen
        review={result.current}
        onBackToWorkspace={() => undefined}
        onBackToStart={() => undefined}
        onJumpToAsset={onJumpToAsset}
      />
    );
    const { rerender } = render(renderReview());

    expect(screen.getByTestId('save-sheet-btn')).toBeEnabled();
    expect(screen.getByTestId('review-warnings')).toHaveTextContent(
      'This asset has bystanders and will be held.'
    );
    let firstResult: SaveSheetResult | undefined;
    await act(async () => {
      firstResult = await result.current.saveSheet();
    });
    rerender(renderReview());
    expect(screen.getByTestId('saved-file-name')).toBeInTheDocument();
    const firstExportId = firstResult?.exportId;
    expect(writes).toHaveLength(1);
    expect(savedEntries[0]?.held).toEqual(['IMG-0001.png']);

    let secondResult: SaveSheetResult | undefined;
    await act(async () => {
      secondResult = await result.current.saveSheet();
    });
    rerender(renderReview());
    const secondExportId = screen.getByTestId('saved-export-id').textContent;
    expect(secondExportId).not.toBe(firstExportId);
    expect(savedEntries[1]?.export_id).toBe(secondExportId);
    expect(writes).toHaveLength(2);
    expect(secondResult?.exportId).toBe(secondExportId);

    await user.click(screen.getByTestId('download-sheet-btn'));
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it('does not expose participant names through filename warning text', () => {
    const { input } = makeInput([
      createAsset({ assetId: 'Synthetic Person 001.png' }),
    ]);
    const { result } = renderHook(() => useReviewExport(input));
    expect(result.current.filenameWarnings[0]?.message).not.toContain('Synthetic Person 001');
  });
});
