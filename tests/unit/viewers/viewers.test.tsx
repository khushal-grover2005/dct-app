import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useRef } from 'react';
import {
  CenterViewerPane,
  ImageViewer,
  VideoViewer,
  SensorViewer,
  DocumentViewer,
  FallbackViewer,
  type ViewerKeyboardActions,
} from '@/viewers';
import type { AssetTagState } from '@/tagging/types';

function makeTagAsset(overrides: Partial<AssetTagState> = {}): AssetTagState {
  return {
    assetId: 'IMG-0001.png',
    assetType: 'image',
    capturedAt: '2026-11-04T06:02:11Z',
    captureTimeSource: 'last_modified',
    sizeBytes: 2048,
    personIds: [],
    bystanderCount: 0,
    noPerson: false,
    reviewedToEnd: false,
    externalReviewConfirmed: false,
    state: 'active',
    ...overrides,
  };
}

describe('Multi-Modal Viewers & CenterViewerPane (R-39, R-41, T-15)', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => `blob:mock/${blob.type || 'unknown'}`),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ImageViewer supports zoom in/out, fit reset, rotation, keyboard hook, and error callback', async () => {
    const user = userEvent.setup();
    const asset = makeTagAsset({ assetId: 'IMG-0001.png', assetType: 'image' });
    const file = new File([new Uint8Array([1, 2, 3])], 'IMG-0001.png');
    const onLoadFailed = vi.fn();
    let actions: ViewerKeyboardActions | null = null;

    const Wrapper: React.FC = () => {
      const ref = useRef<ViewerKeyboardActions | null>(null);
      return (
        <div>
          <ImageViewer asset={asset} file={file} onLoadFailed={onLoadFailed} actionsRef={ref} />
          <button type="button" onClick={() => { actions = ref.current; }}>
            grab-actions
          </button>
        </div>
      );
    };

    render(<Wrapper />);
    expect(screen.getByTestId('image-zoom-level')).toHaveTextContent('100%');

    await user.click(screen.getByTestId('image-zoom-in-btn'));
    expect(screen.getByTestId('image-zoom-level')).toHaveTextContent('125%');

    await user.click(screen.getByTestId('image-rotate-btn'));
    expect(screen.getByTestId('image-viewer-img')).toHaveStyle({
      transform: 'translate(0px, 0px) scale(1.25) rotate(90deg)',
    });

    await user.click(screen.getByTestId('image-zoom-reset-btn'));
    expect(screen.getByTestId('image-zoom-level')).toHaveTextContent('100%');

    await user.click(screen.getByText('grab-actions'));
    expect(actions).not.toBeNull();

    // Decode failure callback invokes FallbackViewer switch in parent
    fireEvent.error(screen.getByTestId('image-viewer-img'));
    expect(onLoadFailed).toHaveBeenCalledTimes(1);
  });

  it('VideoViewer supports 0.5x–2x speed, frame-step ±1f, and review-to-end on ended', async () => {
    const user = userEvent.setup();
    const asset = makeTagAsset({
      assetId: 'VID-0005.mp4',
      assetType: 'video',
      captureTimeSource: 'mp4box',
      durationSeconds: 4,
    });
    const file = new File([new Uint8Array([0, 1, 2])], 'VID-0005.mp4');
    const onReviewedToEnd = vi.fn();
    const onConfirmExternal = vi.fn();
    const onLoadFailed = vi.fn();

    render(
      <VideoViewer
        asset={asset}
        file={file}
        onReviewedToEnd={onReviewedToEnd}
        onConfirmExternalReview={onConfirmExternal}
        onLoadFailed={onLoadFailed}
      />
    );

    const videoEl = screen.getByTestId('video-player-element') as HTMLVideoElement;
    videoEl.pause = vi.fn();
    videoEl.play = vi.fn().mockResolvedValue(undefined);

    expect(screen.getByTestId('media-review-status-badge')).toHaveTextContent('Not fully reviewed');

    await user.click(screen.getByTestId('video-speed-2'));
    expect(videoEl.playbackRate).toBe(2);

    await user.click(screen.getByTestId('video-frame-forward-btn'));
    expect(videoEl.currentTime).toBeCloseTo(1 / 30, 4);

    await user.click(screen.getByTestId('video-frame-back-btn'));
    expect(videoEl.currentTime).toBeCloseTo(0, 4);

    fireEvent.ended(videoEl);
    expect(onReviewedToEnd).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('confirm-external-review-btn'));
    expect(onConfirmExternal).toHaveBeenCalledWith(true);

    fireEvent.error(videoEl);
    expect(onLoadFailed).toHaveBeenCalledTimes(1);
  });

  it('CenterViewerPane switches to FallbackViewer automatically when media decoding fails', () => {
    const asset = makeTagAsset({
      assetId: 'disguised_mkv.mp4',
      assetType: 'video',
      captureTimeSource: 'last_modified',
    });
    const file = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], 'disguised_mkv.mp4');
    const onConfirmExternalReview = vi.fn();

    render(
      <CenterViewerPane
        asset={asset}
        file={file}
        activeIndex={0}
        totalFilteredCount={1}
        hasPrev={false}
        hasNext={false}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onReviewedToEnd={vi.fn()}
        onConfirmExternalReview={onConfirmExternalReview}
        onDurationKnown={vi.fn()}
        actionsRef={{ current: null }}
      />
    );

    expect(screen.getByTestId('video-viewer')).toBeInTheDocument();
    fireEvent.error(screen.getByTestId('video-player-element'));

    expect(screen.queryByTestId('video-viewer')).not.toBeInTheDocument();
    expect(screen.getByTestId('fallback-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-external-review-btn')).toBeInTheDocument();
  });

  it('SensorViewer renders binary fallback card and DocumentViewer uses typed PDF blob URL', () => {
    const binaryAsset = makeTagAsset({
      assetId: 'recording.bin',
      assetType: 'sensor',
      sizeBytes: 4096,
    });
    const binaryFile = new File([new Uint8Array(64)], 'recording.bin');

    const { rerender } = render(<SensorViewer asset={binaryAsset} file={binaryFile} />);
    expect(screen.getByTestId('sensor-binary-viewer')).toHaveTextContent('Binary sensor (.bin)');

    const pdfAsset = makeTagAsset({
      assetId: 'DOC-0008.pdf',
      assetType: 'document',
    });
    const pdfFile = new File([new TextEncoder().encode('%PDF-1.4')], 'DOC-0008.pdf');
    rerender(<DocumentViewer asset={pdfAsset} file={pdfFile} />);
    const frame = screen.getByTestId('pdf-viewer-frame');
    expect(frame).toHaveAttribute('src', 'blob:mock/application/pdf');

    const otherAsset = makeTagAsset({
      assetId: 'readme.xyz',
      assetType: 'other',
    });
    rerender(<FallbackViewer asset={otherAsset} reason="Unknown extension" />);
    expect(screen.getByTestId('fallback-guidance-text')).toHaveTextContent(
      'No preview in app — view this file in your usual viewer, then tag it here.'
    );
    expect(screen.queryByTestId('confirm-external-review-btn')).not.toBeInTheDocument();
  });
});
