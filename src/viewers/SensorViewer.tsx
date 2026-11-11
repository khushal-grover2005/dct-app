import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Binary } from 'lucide-react';
import { hasNativePreview } from '../folder';
import type { AssetTagState } from '../tagging/types';
import { formatBytes } from './mimeTypes';

interface SensorViewerProps {
  asset: AssetTagState;
  file: File;
}

interface TextPreviewState {
  lines: string[];
  totalLines: number;
  truncated: boolean;
  loading: boolean;
  error?: string;
}

const MAX_PREVIEW_LINES = 200;
const CHUNK_SIZE_BYTES = 512 * 1024; // 512 KB streaming chunks

async function readChunkText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    return blob.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

async function extractFirstLinesAndCount(file: File): Promise<{
  lines: string[];
  totalLines: number;
}> {
  if (file.size === 0) {
    return { lines: [], totalLines: 0 };
  }

  // Stream initial slice for preview lines, count newlines across remaining slices
  const lines: string[] = [];
  let totalLines = 0;
  let offset = 0;
  let leftover = '';
  const decoder = new TextDecoder('utf-8');

  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE_BYTES, file.size);
    const slice = file.slice(offset, end);

    let chunkStr: string;
    if (typeof slice.arrayBuffer === 'function') {
      const ab = await slice.arrayBuffer();
      chunkStr = decoder.decode(ab, { stream: end < file.size });
    } else {
      chunkStr = await readChunkText(slice);
    }

    const combined = leftover + chunkStr;
    const parts = combined.split(/\r?\n/);

    if (end < file.size) {
      leftover = parts.pop() ?? '';
    } else {
      // Remove single trailing empty element produced by EOF newline
      if (parts.length > 0 && parts[parts.length - 1] === '') {
        parts.pop();
      }
      leftover = '';
    }

    for (const part of parts) {
      totalLines++;
      if (lines.length < MAX_PREVIEW_LINES) {
        lines.push(part);
      }
    }

    offset = end;
  }

  return { lines, totalLines };
}

export const SensorViewer: React.FC<SensorViewerProps> = ({ asset, file }) => {
  const isTextPreview = hasNativePreview('sensor', asset.assetId);
  const [preview, setPreview] = useState<TextPreviewState>({
    lines: [],
    totalLines: 0,
    truncated: false,
    loading: isTextPreview,
  });

  useEffect(() => {
    if (!isTextPreview) {
      setPreview({ lines: [], totalLines: 0, truncated: false, loading: false });
      return;
    }

    let cancelled = false;
    setPreview({ lines: [], totalLines: 0, truncated: false, loading: true });

    extractFirstLinesAndCount(file)
      .then(({ lines, totalLines }) => {
        if (cancelled) return;
        setPreview({
          lines,
          totalLines,
          truncated: totalLines > MAX_PREVIEW_LINES,
          loading: false,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setPreview({
          lines: [],
          totalLines: 0,
          truncated: false,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [asset.assetId, file, isTextPreview]);

  if (!isTextPreview) {
    const ext = asset.assetId.includes('.')
      ? asset.assetId.slice(asset.assetId.lastIndexOf('.')).toLowerCase()
      : 'binary';

    return (
      <div
        data-testid="sensor-binary-viewer"
        className="flex flex-col items-center justify-center h-full min-h-[380px] p-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300 text-center"
      >
        <div className="p-4 rounded-full bg-white border border-slate-200 shadow-sm mb-4">
          <Binary className="w-12 h-12 text-teal-600" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 font-mono">{asset.assetId}</h3>
        <div className="mt-2 flex items-center space-x-2 text-xs text-slate-600">
          <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-medium">
            Binary sensor ({ext})
          </span>
          <span>Size: {formatBytes(asset.sizeBytes)}</span>
        </div>
        <p className="mt-4 max-w-md text-xs text-slate-600 bg-white border border-slate-200 rounded p-3">
          Binary sensor recording ({formatBytes(asset.sizeBytes)}). No text preview available —
          view this file in your usual viewer if needed, then tag who wore or was measured by the
          device.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="sensor-viewer"
      className="flex flex-col h-full min-h-[380px] bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm"
    >
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs">
        <div className="flex items-center space-x-2">
          <FileSpreadsheet className="w-4 h-4 text-teal-600" />
          <span className="font-semibold text-slate-800">Sensor Data Preview</span>
        </div>
        <span data-testid="sensor-line-count" className="font-mono text-slate-600">
          {preview.loading
            ? 'Loading lines...'
            : preview.truncated
              ? `Showing first ${preview.lines.length} of ${preview.totalLines} lines`
              : `${preview.totalLines} line${preview.totalLines === 1 ? '' : 's'} total`}
        </span>
      </div>

      {preview.error ? (
        <div className="p-6 text-xs text-rose-700 bg-rose-50">
          Failed to read sensor file: {preview.error}
        </div>
      ) : preview.loading ? (
        <div className="p-6 text-xs text-slate-500">Reading text preview...</div>
      ) : preview.lines.length === 0 ? (
        <div className="p-6 text-xs text-slate-500 italic">File is empty (0 lines).</div>
      ) : (
        <div className="flex-1 overflow-auto bg-slate-950 text-slate-100 font-mono text-xs leading-5">
          <table className="w-full border-collapse">
            <tbody>
              {preview.lines.map((line, index) => (
                <tr key={index} className="hover:bg-slate-900/80 border-b border-slate-900/50">
                  <td className="px-3 py-0.5 text-right select-none text-slate-500 w-12 border-r border-slate-800">
                    {index + 1}
                  </td>
                  <td className="px-3 py-0.5 whitespace-pre">{line}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
