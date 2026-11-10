import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, CheckCircle2, Clock } from 'lucide-react';
import type { AssetTagState } from '../tagging/types';
import { createTypedBlobUrl, safeRevokeBlobUrl, formatDurationSeconds } from './mimeTypes';
import type { ViewerKeyboardActions } from './FallbackViewer';

interface AudioViewerProps {
  asset: AssetTagState;
  file: File;
  onReviewedToEnd: () => void;
  onConfirmExternalReview: (confirmed: boolean) => void;
  onDurationKnown?: (durationSeconds: number) => void;
  onLoadFailed?: () => void;
  actionsRef?: React.MutableRefObject<ViewerKeyboardActions | null>;
}

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;
const MAX_WAVEFORM_DECODE_BYTES = 32 * 1024 * 1024;
const WAVEFORM_BAR_COUNT = 96;

function computeFallbackPeaks(barCount: number): number[] {
  return Array.from({ length: barCount }, (_, idx) => {
    const val = Math.abs(Math.sin(idx * 0.35)) * 0.5 + 0.15;
    return Number(val.toFixed(2));
  });
}

export const AudioViewer: React.FC<AudioViewerProps> = ({
  asset,
  file,
  onReviewedToEnd,
  onConfirmExternalReview,
  onDurationKnown,
  onLoadFailed,
  actionsRef,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(asset.durationSeconds ?? 0);
  const [furthestPlayed, setFurthestPlayed] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [peaks, setPeaks] = useState<number[]>(() => computeFallbackPeaks(WAVEFORM_BAR_COUNT));
  const hasPlayedRef = useRef(false);

  // Create blob URL
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

  // Decode client-side waveform peaks (zero network, offline AudioContext)
  useEffect(() => {
    let cancelled = false;
    const extractWaveform = async () => {
      const win = window as WindowWithWebkitAudio;
      const AudioCtx = window.AudioContext ?? win.webkitAudioContext;
      if (!AudioCtx || file.size === 0 || file.size > MAX_WAVEFORM_DECODE_BYTES) {
        if (!cancelled) {
          setPeaks(computeFallbackPeaks(WAVEFORM_BAR_COUNT));
        }
        return;
      }

      let ctx: AudioContext | null = null;
      try {
        ctx = new AudioCtx();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        if (cancelled) return;

        const channelData = audioBuffer.getChannelData(0);
        const step = Math.max(1, Math.floor(channelData.length / WAVEFORM_BAR_COUNT));
        const nextPeaks: number[] = [];

        for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
          const start = i * step;
          const end = Math.min(channelData.length, start + step);
          let maxAmp = 0;
          for (let j = start; j < end; j++) {
            const sample = Math.abs(channelData[j] ?? 0);
            if (sample > maxAmp) {
              maxAmp = sample;
            }
          }
          nextPeaks.push(Math.max(0.08, Math.min(1, maxAmp)));
        }

        setPeaks(nextPeaks);
        if (Number.isFinite(audioBuffer.duration) && audioBuffer.duration > 0) {
          setDuration(audioBuffer.duration);
          onDurationKnown?.(audioBuffer.duration);
        }
      } catch {
        if (!cancelled) {
          setPeaks(computeFallbackPeaks(WAVEFORM_BAR_COUNT));
        }
      } finally {
        if (ctx && typeof ctx.close === 'function') {
          try {
            await ctx.close();
          } catch {
            // Ignore AudioContext close error
          }
        }
      }
    };

    void extractWaveform();
    return () => {
      cancelled = true;
    };
  }, [file, asset.assetId, onDurationKnown]);

  // Draw waveform onto canvas whenever playback progresses
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const progressRatio = duration > 0 ? currentTime / duration : 0;
    const reviewedRatio = asset.reviewedToEnd ? 1 : duration > 0 ? furthestPlayed / duration : 0;

    const barWidth = width / peaks.length;
    const gap = Math.max(1, barWidth * 0.25);
    const drawnWidth = Math.max(1, barWidth - gap);

    peaks.forEach((amp, i) => {
      const ratio = i / peaks.length;
      const barH = Math.max(4, amp * (height * 0.8));
      const x = i * barWidth;
      const y = (height - barH) / 2;

      if (ratio <= progressRatio) {
        ctx.fillStyle = '#0284c7'; // Active played head (sky-600)
      } else if (ratio <= reviewedRatio) {
        ctx.fillStyle = '#7dd3fc'; // Previously reviewed region (sky-300)
      } else {
        ctx.fillStyle = '#cbd5e1'; // Unreviewed region (slate-300)
      }

      ctx.fillRect(x, y, drawnWidth, barH);
    });
  }, [peaks, currentTime, duration, furthestPlayed, asset.reviewedToEnd]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused || audio.ended) {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Ignore autoplay promise rejection
        });
      }
    } else {
      audio.pause();
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

  const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const nextTime = clickRatio * duration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(e.target.value);
    if (audioRef.current && Number.isFinite(nextTime)) {
      audioRef.current.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const ct = audio.currentTime;
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
    setCurrentTime(ct);

    if (hasPlayedRef.current && !audio.seeking) {
      setFurthestPlayed((prev) => Math.max(prev, ct));
      if (dur > 0 && ct >= dur - 0.15 && !asset.reviewedToEnd) {
        onReviewedToEnd();
      }
    }
  };

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
      onDurationKnown?.(audio.duration);
    }
    audio.playbackRate = playbackRate;
  };

  const handleEnded = () => {
    setIsPlaying(false);
    const dur = duration || audioRef.current?.duration || 0;
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
      data-testid="audio-viewer"
      className="flex flex-col h-full min-h-[380px] bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm"
    >
      {/* Review Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs">
        <div className="flex items-center space-x-2">
          {asset.reviewedToEnd || asset.externalReviewConfirmed ? (
            <span
              data-testid="media-review-status-badge"
              className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              {asset.reviewedToEnd ? 'Reviewed to end' : 'Reviewed outside app'}
            </span>
          ) : (
            <span
              data-testid="media-review-status-badge"
              className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-medium"
            >
              <Clock className="w-3.5 h-3.5 mr-1" />
              Not fully reviewed ({reviewedPercent}% heard)
            </span>
          )}
        </div>

        <button
          type="button"
          data-testid="confirm-external-review-btn"
          onClick={() => onConfirmExternalReview(!asset.externalReviewConfirmed)}
          className={`px-2.5 py-1 rounded border text-xs font-medium transition ${
            asset.externalReviewConfirmed
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
          }`}
        >
          {asset.externalReviewConfirmed
            ? 'Reviewed outside the app ✓'
            : 'Mark reviewed outside the app'}
        </button>
      </div>

      {/* Waveform Body */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 space-y-6">
        <div className="w-full max-w-2xl bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="font-mono font-medium text-slate-900">{asset.assetId}</span>
            <span>Click waveform to scrub</span>
          </div>

          <canvas
            ref={canvasRef}
            data-testid="audio-waveform-canvas"
            width={640}
            height={140}
            onClick={handleWaveformClick}
            className="w-full h-36 bg-slate-50 rounded border border-slate-200 cursor-pointer"
          />

          <div className="flex items-center space-x-3">
            <span className="font-mono text-xs w-12 text-slate-600">
              {formatDurationSeconds(currentTime)}
            </span>
            <input
              type="range"
              data-testid="audio-scrubber"
              min={0}
              max={duration || 0}
              step={0.05}
              value={currentTime}
              onChange={handleScrub}
              aria-label="Audio playback position"
              className="flex-1 accent-sky-600 cursor-pointer"
            />
            <span className="font-mono text-xs w-12 text-right text-slate-600">
              {formatDurationSeconds(duration)}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                data-testid="audio-play-pause-btn"
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !isMuted;
                  setIsMuted(next);
                  if (audioRef.current) {
                    audioRef.current.muted = next;
                  }
                }}
                aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                className="p-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center space-x-1 text-xs">
              <span className="text-slate-500 mr-1">Speed:</span>
              {SPEED_OPTIONS.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  data-testid={`audio-speed-${rate}`}
                  onClick={() => handleSpeedChange(rate)}
                  className={`px-2 py-1 rounded font-mono transition ${
                    playbackRate === rate
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {rate}×
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {blobUrl && (
        <audio
          ref={audioRef}
          data-testid="audio-player-element"
          src={blobUrl}
          onPlay={() => {
            hasPlayedRef.current = true;
            setIsPlaying(true);
          }}
          onPause={() => setIsPlaying(false)}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onError={() => onLoadFailed?.()}
          className="hidden"
        />
      )}
    </div>
  );
};
