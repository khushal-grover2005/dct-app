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

const MAX_ISOBMFF_BOX_HOPS = 2048;
const MAX_FTYP_BOX_BYTES = 1024 * 1024;
const MAX_MOOV_BOX_BYTES = 32 * 1024 * 1024;

function parsePrintableBoxType(view: DataView): string | null {
  if (view.byteLength < 8) {
    return null;
  }
  let type = '';
  for (let i = 4; i < 8; i++) {
    const code = view.getUint8(i);
    if (code < 0x20 || code > 0x7e) {
      return null;
    }
    type += String.fromCharCode(code);
  }
  return type;
}

/**
 * Walks top-level ISOBMFF box headers using tiny 16-byte slices so `mdat`
 * payloads (including 4 GB+ videos) are skipped in O(1) without sequential reads.
 */
async function extractIsomFtypAndMoov(file: File): Promise<ArrayBuffer | null> {
  if (file.size < 8) {
    return null;
  }

  const slices: ArrayBuffer[] = [];
  let foundMoov = false;
  let offset = 0;
  let hops = 0;

  while (offset + 8 <= file.size && hops < MAX_ISOBMFF_BOX_HOPS) {
    hops++;
    const headerEnd = Math.min(offset + 16, file.size);
    const headerBuf = await readBlobAsArrayBuffer(file.slice(offset, headerEnd));
    if (headerBuf.byteLength < 8) {
      return null;
    }

    const view = new DataView(headerBuf);
    const boxType = parsePrintableBoxType(view);
    if (!boxType) {
      return null;
    }

    const size32 = view.getUint32(0, false);
    let boxSize: number;
    if (size32 === 0) {
      boxSize = file.size - offset;
    } else if (size32 === 1) {
      if (headerBuf.byteLength < 16) {
        return null;
      }
      const largeSize = view.getBigUint64(8, false);
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) {
        return null;
      }
      boxSize = Number(largeSize);
    } else {
      boxSize = size32;
    }

    if (!Number.isFinite(boxSize) || boxSize < 8 || offset + boxSize > file.size) {
      return null;
    }

    if (boxType === 'ftyp' && boxSize <= MAX_FTYP_BOX_BYTES) {
      slices.push(await readBlobAsArrayBuffer(file.slice(offset, offset + boxSize)));
    } else if (boxType === 'moov') {
      if (boxSize > MAX_MOOV_BOX_BYTES) {
        return null;
      }
      slices.push(await readBlobAsArrayBuffer(file.slice(offset, offset + boxSize)));
      foundMoov = true;
      break;
    }

    offset += boxSize;
  }

  if (!foundMoov || slices.length === 0) {
    return null;
  }

  const totalBytes = slices.reduce((sum, buf) => sum + buf.byteLength, 0);
  const combined = new Uint8Array(totalBytes);
  let writeOffset = 0;
  for (const buf of slices) {
    combined.set(new Uint8Array(buf), writeOffset);
    writeOffset += buf.byteLength;
  }
  return combined.buffer;
}

export async function extractMp4CreationTime(
  file: File
): Promise<{ capturedAt: string; durationSeconds?: number } | null> {
  if (file.size < 8) {
    return null;
  }

  const metadataBuffer = await extractIsomFtypAndMoov(file);
  if (!metadataBuffer) {
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

      const bufferWithStart = metadataBuffer as MP4ArrayBufferWithStart;
      bufferWithStart.fileStart = 0;
      mp4File.appendBuffer(bufferWithStart);
      mp4File.flush();
      if (!settled) {
        finish(null);
      }
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
