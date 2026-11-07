import exifr from 'exifr';
import { createFile, MP4MediaInfo } from 'mp4box';
import { AssetType, CaptureTimeResult } from './types';

export interface DateComponents {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
}

interface MP4ArrayBufferWithStart extends ArrayBuffer {
  fileStart: number;
}

export function getDefaultCaptureTimezone(): string {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CAPTURE_TIMEZONE) {
      return String(import.meta.env.VITE_CAPTURE_TIMEZONE);
    }
  } catch {
    // fallback if import.meta is unavailable
  }
  return 'Asia/Kolkata';
}

export function parseDateComponents(value: unknown): DateComponents | null {
  if (typeof value === 'string') {
    const match = value
      .trim()
      .match(/^(\d{4})[-: /](\d{2})[-: /](\d{2})[-: T](\d{2})[-: ](\d{2})[-: ](\d{2})/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const hour = Number(match[4]);
      const minute = Number(match[5]);
      const second = Number(match[6]);

      if (
        !isNaN(year) &&
        !isNaN(month) &&
        !isNaN(day) &&
        !isNaN(hour) &&
        !isNaN(minute) &&
        !isNaN(second) &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31 &&
        hour >= 0 &&
        hour <= 23 &&
        minute >= 0 &&
        minute <= 59 &&
        second >= 0 &&
        second <= 59
      ) {
        return { year, month, day, hour, minute, second };
      }
    }
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
      hour: value.getHours(),
      minute: value.getMinutes(),
      second: value.getSeconds(),
    };
  }

  return null;
}

export function formatUtcIso(date: Date): string {
  // Format as YYYY-MM-DDTHH:mm:ssZ (omits milliseconds for data contract v1 parity)
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function convertLocalToUtcIso(
  components: DateComponents,
  timeZone: string = 'Asia/Kolkata'
): string {
  const { year, month, day, hour, minute, second } = components;

  // Validate IANA timezone string; fallback to Asia/Kolkata on invalid
  let validTz = timeZone;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: validTz });
  } catch {
    validTz = 'Asia/Kolkata';
  }

  // 1. Initial UTC guess assuming wall clock time matches UTC
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: validTz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const getWallMsAtUtc = (utcMs: number): number => {
    const parts = dtf.formatToParts(new Date(utcMs));
    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== 'literal') {
        map[p.type] = parseInt(p.value, 10);
      }
    }
    const partHour = map['hour'] === 24 ? 0 : (map['hour'] ?? 0);
    const partYear = map['year'] ?? year;
    const partMonth = map['month'] ?? month;
    const partDay = map['day'] ?? day;
    const partMin = map['minute'] ?? 0;
    const partSec = map['second'] ?? 0;

    return Date.UTC(partYear, partMonth - 1, partDay, partHour, partMin, partSec);
  };

  // 2. Measure timezone offset at this wall clock time
  const wallAtGuess = getWallMsAtUtc(guessUtcMs);
  const offsetMs = wallAtGuess - guessUtcMs;
  let exactUtcMs = guessUtcMs - offsetMs;

  // 3. Second pass refinement (handles DST boundary shifts)
  const wallAtExact = getWallMsAtUtc(exactUtcMs);
  if (wallAtExact !== guessUtcMs) {
    const secondOffset = wallAtExact - exactUtcMs;
    exactUtcMs = guessUtcMs - secondOffset;
  }

  return formatUtcIso(new Date(exactUtcMs));
}

async function readBlobAsArrayBuffer(blob: Blob | File): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export async function extractMp4CreationTime(
  file: File
): Promise<{ capturedAt: string; durationSeconds?: number } | null> {
  if (file.size === 0) {
    return null;
  }

  return new Promise((resolve) => {
    try {
      const mp4File = createFile();
      let settled = false;

      const finish = (result: { capturedAt: string; durationSeconds?: number } | null) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };

      mp4File.onReady = (info: MP4MediaInfo) => {
        if (
          info.created &&
          !isNaN(info.created.getTime()) &&
          info.created.getFullYear() > 1970 // Guard against uninitialized 1904/0 camera clock
        ) {
          const durationSeconds =
            info.timescale > 0 ? info.duration / info.timescale : undefined;
          finish({
            capturedAt: formatUtcIso(info.created),
            durationSeconds,
          });
        } else {
          finish(null);
        }
      };

      mp4File.onError = () => {
        finish(null);
      };

      const chunkSize = 256 * 1024; // 256 KB slices
      let offset = 0;

      const readChunk = async () => {
        if (settled || offset >= file.size) {
          if (!settled) {
            try {
              mp4File.flush();
            } catch {
              // Ignore flush errors
            }
            finish(null);
          }
          return;
        }

        try {
          const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
          const ab = await readBlobAsArrayBuffer(slice);
          const bufferWithStart = ab as MP4ArrayBufferWithStart;
          bufferWithStart.fileStart = offset;
          offset += ab.byteLength;

          mp4File.appendBuffer(bufferWithStart);
        } catch {
          finish(null);
          return;
        }

        if (!settled) {
          setTimeout(readChunk, 0);
        }
      };

      readChunk();
    } catch {
      resolve(null);
    }
  });
}

export async function extractCaptureTime(
  file: File,
  assetType: AssetType,
  timezone?: string
): Promise<CaptureTimeResult> {
  const fallbackUtc = formatUtcIso(new Date(file.lastModified));
  const effectiveTz = timezone || getDefaultCaptureTimezone();

  if (assetType === 'image') {
    try {
      // Read initial 256 KB or full file for EXIF metadata
      const headerSlice = file.slice(0, Math.min(file.size, 256 * 1024));
      const buffer = await readBlobAsArrayBuffer(headerSlice);

      const tags = (await exifr.parse(buffer, {
        pick: ['DateTimeOriginal'],
        reviveValues: false,
      })) as { DateTimeOriginal?: unknown } | undefined;

      if (tags && tags.DateTimeOriginal) {
        const components = parseDateComponents(tags.DateTimeOriginal);
        if (components) {
          const utcIso = convertLocalToUtcIso(components, effectiveTz);
          return {
            capturedAt: utcIso,
            source: 'exif',
          };
        }
      }
    } catch {
      // Any parsing error falls back to lastModified
    }

    return {
      capturedAt: fallbackUtc,
      source: 'last_modified',
    };
  }

  if (assetType === 'video') {
    try {
      const mp4Result = await extractMp4CreationTime(file);
      if (mp4Result) {
        return {
          capturedAt: mp4Result.capturedAt,
          source: 'mp4box',
          durationSeconds: mp4Result.durationSeconds,
        };
      }
    } catch {
      // Fall through to lastModified
    }

    return {
      capturedAt: fallbackUtc,
      source: 'last_modified',
    };
  }

  // Audio, sensor, document, other
  return {
    capturedAt: fallbackUtc,
    source: 'last_modified',
  };
}
