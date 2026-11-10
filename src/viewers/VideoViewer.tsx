import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type { AssetTagState } from '../tagging/types';
import { createTypedBlobUrl, safeRevokeBlobUrl, formatDurationSeconds } from './mimeTypes';
import type { ViewerKeyboardActions } from './FallbackViewer';

interface VideoViewerProps {
  asset: AssetTagState;
  file: File;
  onReviewedToEnd: () => void;
  onConfirmExternalReview: (confirmed: boolean) => void;
  onDurationKnown?: (durationSeconds: number) => void;
  onLoadFailed?: () => void;
  actionsRef?: React.MutableRefObject<ViewerKeyboardActions | null>;
}

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;
const FRAME_STEP_SECONDS = 1 / 30;

export const VideoViewer: React.FC<VideoViewerProps> = ({
  asset,
  file,
  onReviewedToEnd,
  onConfirmExternalReview,
  onDurationKnown,
  onLoadFailed,
  actionsRef,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(asset.durationSeconds ?? 0);
  const [furthestPlayed, setFurthestPlayed] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    const url = createTypedBlobUrl(file, asset.assetId);
    setBlobUrl(url);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(asset.durationSeconds ?? 0);
    setFurthestPlayed(0);
    setPlaybackRate(1);
    hasPlayedRef.current = false;
    return () => {
      safeRevokeBlobUrl(url);
    };
  }, [asset.assetId, asset.durationSeconds, file]);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Ignore autoplay promise rejections in restricted environments
        });
      }
    } else {
      video.pause();
    }
  }, []);

  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = {
      togglePlayPause,
    };
    return () => {
      if (actionsRef.current) {
        actionsRef.current = null;
      }
    };
  }, [actionsRef, togglePlayPause]);

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleFrameStep = (direction: -1 | 1) => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
    }
    const target = Math.max(0, Math.min(duration || 0, video.currentTime + direction * FRAME_STEP_SECONDS));
    video.currentTime = target;
    setCurrentTime(target);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    const nextTime = Number(e.target.value);
    if (video && Number.isFinite(nextTime)) {
      video.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const ct = video.currentTime;
    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration;
    setCurrentTime(ct);

    if (hasPlayedRef.current && !video.seeking) {
      setFurthestPlayed((prev) => Math.max(prev, ct));
      if (dur > 0 && ct >= dur - 0.15 && !asset.reviewedToEnd) {
        onReviewedToEnd();
      }
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    if (Number.isFinite(video.duration) && video.duration > 0) {
      setDuration(video.duration);
      onDurationKnown?.(video.duration);
    }
    video.playbackRate = playbackRate;
  };

  const handleEnded = () => {
    setIsPlaying(false);
    const dur = duration || videoRef.current?.duration || 0;
    if (dur > 0) {
      setFurthestPlayed(dur);
    }
    if (!asset.reviewedToEnd) {
      onReviewedToEnd();
    }
  };

  const reviewedPercent =
    asset.reviewedToEnd
      ? 100
      : duration > 0
        ? Math.min(100, Math.round((furthestPlayed / duration) * 100))
        : 0;

  return (
    <div
      data-testid="video-viewer"
      className="flex flex-col h-full min-h-[380px] bg-slate-900 rounded-lg overflow-hidden border border-slate-800"
    >
      {/* Review Status Subheader */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-800 border-b border-slate-700 text-xs">
        <div className="flex items-center space-x-2">
          {asset.reviewedToEnd || asset.externalReviewConfirmed ? (
            <span
              data-testid="media-review-status-badge"
              className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 font-medium"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              {asset.reviewedToEnd ? 'Reviewed to end' : 'Reviewed outside app'}
            </span>
          ) : (
            <span
              data-testid="media-review-status-badge"
              className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-700 font-medium"
            >
              <Clock className="w-3.5 h-3.5 mr-1" />
              Not fully reviewed ({reviewedPercent}% watched)
            </span>
          )}
        </div>

        <button
          type="button"
          data-testid="confirm-external-review-btn"
          onClick={() => onConfirmExternalReview(!asset.externalReviewConfirmed)}
          className={`px-2.5 py-1 rounded border text-xs font-medium transition ${
            asset.externalReviewConfirmed
              ? 'bg-emerald-700/40 border-emerald-500 text-emerald-100 hover:bg-emerald-700/60'
              : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'
          }`}
        >
          {asset.externalReviewConfirmed
            ? 'Reviewed outside the app ✓'
            : 'Mark reviewed outside the app'}
        </button>
      </div>

      {/* Video Canvas */}
      <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
        {blobUrl && (
          <video
            ref={videoRef}
            data-testid="video-player-element"
            src={blobUrl}
            playsInline
            onClick={togglePlayPause}
            onPlay={() => {
              hasPlayedRef.current = true;
              setIsPlaying(true);
            }}
            onPause={() => setIsPlaying(false)}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onError={() => onLoadFailed?.()}
            className="max-w-full max-h-full cursor-pointer"
          />
        )}
      </div>

      {/* Playback Controls */}
      <div className="px-4 py-3 bg-slate-800 border-t border-slate-700 space-y-2 text-slate-200">
        <div className="flex items-center space-x-3">
          <span className="font-mono text-xs w-12 text-slate-300">
            {formatDurationSeconds(currentTime)}
          </span>
          <input
            type="range"
            data-testid="video-scrubber"
            min={0}
            max={duration || 0}
            step={0.05}
            value={currentTime}
            onChange={handleScrub}
            aria-label="Video playback position"
            className="flex-1 accent-sky-400 cursor-pointer"
          />
          <span className="font-mono text-xs w-12 text-right text-slate-300">
            {formatDurationSeconds(duration)}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              data-testid="video-play-pause-btn"
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium transition"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            <button
              type="button"
              data-testid="video-frame-back-btn"
              onClick={() => handleFrameStep(-1)}
              title="Step back 1 frame"
              className="inline-flex items-center px-2 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
            >
              <SkipBack className="w-3.5 h-3.5 mr-1" />
              <span>-1f</span>
            </button>

            <button
              type="button"
              data-testid="video-frame-forward-btn"
              onClick={() => handleFrameStep(1)}
              title="Step forward 1 frame"
              className="inline-flex items-center px-2 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
            >
              <span>+1f</span>
              <SkipForward className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>

          <div className="flex items-center space-x-1">
            <span className="text-slate-400 mr-1">Speed:</span>
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                data-testid={`video-speed-${rate}`}
                onClick={() => handleSpeedChange(rate)}
                className={`px-2 py-1 rounded font-mono transition ${
                  playbackRate === rate
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {rate}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
