import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Maximize2 } from 'lucide-react';
import type { AssetTagState } from '../tagging/types';
import { createTypedBlobUrl, safeRevokeBlobUrl } from './mimeTypes';
import type { ViewerKeyboardActions } from './FallbackViewer';

interface ImageViewerProps {
  asset: AssetTagState;
  file: File;
  onLoadFailed?: () => void;
  actionsRef?: React.MutableRefObject<ViewerKeyboardActions | null>;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

export const ImageViewer: React.FC<ImageViewerProps> = ({
  asset,
  file,
  onLoadFailed,
  actionsRef,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(
    null
  );

  // Create and cleanly revoke blob URL when file/asset changes
  useEffect(() => {
    const url = createTypedBlobUrl(file, asset.assetId);
    setBlobUrl(url);
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    return () => {
      safeRevokeBlobUrl(url);
    };
  }, [asset.assetId, file]);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, Number((z + ZOOM_STEP).toFixed(2))));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const next = Math.max(MIN_ZOOM, Number((z - ZOOM_STEP).toFixed(2)));
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const zoomReset = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = {
      zoomIn,
      zoomOut,
      zoomReset,
    };
    return () => {
      if (actionsRef.current) {
        actionsRef.current = null;
      }
    };
  }, [actionsRef, zoomIn, zoomOut, zoomReset]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if not captured
      }
    }
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  };

  return (
    <div data-testid="image-viewer" className="flex flex-col h-full min-h-[380px] bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/90 border-b border-slate-700 text-xs text-slate-200">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            data-testid="image-zoom-out-btn"
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out (-)"
            title="Zoom out (-)"
            className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-40 transition"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span
            data-testid="image-zoom-level"
            className="font-mono w-14 text-center select-none text-slate-100"
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            data-testid="image-zoom-in-btn"
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in (+)"
            title="Zoom in (+)"
            className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-40 transition"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            data-testid="image-zoom-reset-btn"
            onClick={zoomReset}
            aria-label="Reset zoom (0)"
            title="Reset zoom and pan (0)"
            className="inline-flex items-center space-x-1 px-2 py-1 rounded hover:bg-slate-700 transition"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Fit</span>
          </button>
          <button
            type="button"
            data-testid="image-rotate-btn"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            aria-label="Rotate 90 degrees"
            title="Rotate 90 degrees"
            className="p-1.5 rounded hover:bg-slate-700 transition"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
        <span className="text-[11px] text-slate-400">
          Drag to pan • Keys: + / − / 0
        </span>
      </div>

      {/* Viewport */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className={`flex-1 flex items-center justify-center overflow-hidden relative select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {blobUrl && (
          <img
            data-testid="image-viewer-img"
            src={blobUrl}
            alt={asset.assetId}
            draggable={false}
            onError={() => onLoadFailed?.()}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
            className="max-w-full max-h-full object-contain transition-transform duration-75"
          />
        )}
      </div>
    </div>
  );
};
