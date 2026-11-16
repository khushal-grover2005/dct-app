/**
 * FIPS 180-4 compliant Streaming SHA-256 implementation in pure TypeScript.
 * Zero external dependencies, zero WebAssembly, 100% compliant with strict CSP (script-src 'self').
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export class StreamingSha256 {
  private h: Uint32Array;
  private buffer: Uint8Array;
  private bufferLength: number;
  private bytesHashed: number;
  private w: Uint32Array;
  private finalized: boolean;

  constructor() {
    this.h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.bytesHashed = 0;
    this.w = new Uint32Array(64);
    this.finalized = false;
  }

  public update(chunk: Uint8Array): this {
    if (this.finalized) {
      throw new Error('Cannot update StreamingSha256 after digest() has been called');
    }

    let offset = 0;
    const len = chunk.length;
    this.bytesHashed += len;

    // If there is residual data in buffer, fill it first
    if (this.bufferLength > 0) {
      const needed = 64 - this.bufferLength;
      if (len >= needed) {
        this.buffer.set(chunk.subarray(0, needed), this.bufferLength);
        this.processBlocks(this.buffer, 0, 64);
        this.bufferLength = 0;
        offset += needed;
      } else {
        this.buffer.set(chunk, this.bufferLength);
        this.bufferLength += len;
        return this;
      }
    }

    // Process all full 64-byte blocks with local H registers across the whole chunk
    if (offset + 64 <= len) {
      offset = this.processBlocks(chunk, offset, len);
    }

    // Retain any remaining trailing bytes
    if (offset < len) {
      const remaining = len - offset;
      this.buffer.set(chunk.subarray(offset, len), 0);
      this.bufferLength = remaining;
    }

    return this;
  }

  private processBlocks(block: Uint8Array, startOffset: number, limit: number): number {
    const w = this.w;
    const hArr = this.h;
    let h0 = hArr[0]!;
    let h1 = hArr[1]!;
    let h2 = hArr[2]!;
    let h3 = hArr[3]!;
    let h4 = hArr[4]!;
    let h5 = hArr[5]!;
    let h6 = hArr[6]!;
    let h7 = hArr[7]!;

    let offset = startOffset;
    while (offset + 64 <= limit) {
      for (let i = 0, idx = offset; i < 16; i++, idx += 4) {
        w[i] =
          ((block[idx]! << 24) |
            (block[idx + 1]! << 16) |
            (block[idx + 2]! << 8) |
            block[idx + 3]!) |
          0;
      }

      for (let t = 16; t < 64; t++) {
        const wt2 = w[t - 2]!;
        const wt15 = w[t - 15]!;
        const g1 = ((wt2 >>> 17) | (wt2 << 15)) ^ ((wt2 >>> 19) | (wt2 << 13)) ^ (wt2 >>> 10);
        const g0 = ((wt15 >>> 7) | (wt15 << 25)) ^ ((wt15 >>> 18) | (wt15 << 14)) ^ (wt15 >>> 3);
        w[t] = (g1 + w[t - 7]! + g0 + w[t - 16]!) | 0;
      }

      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;
      let f = h5;
      let g = h6;
      let h = h7;

      for (let t = 0; t < 64; t++) {
        const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const chVal = (e & f) ^ (~e & g);
        const t1 = (h + s1 + chVal + K[t]! + w[t]!) | 0;
        const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const majVal = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (s0 + majVal) | 0;

        h = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
      }

      h0 = (h0 + a) | 0;
      h1 = (h1 + b) | 0;
      h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0;
      h5 = (h5 + f) | 0;
      h6 = (h6 + g) | 0;
      h7 = (h7 + h) | 0;
      offset += 64;
    }

    hArr[0] = h0;
    hArr[1] = h1;
    hArr[2] = h2;
    hArr[3] = h3;
    hArr[4] = h4;
    hArr[5] = h5;
    hArr[6] = h6;
    hArr[7] = h7;
    return offset;
  }

  public digest(): string {
    if (this.finalized) {
      throw new Error('digest() has already been called on this StreamingSha256 instance');
    }
    this.finalized = true;

    // Pad message according to FIPS 180-4
    // Append 0x80
    this.buffer[this.bufferLength] = 0x80;
    this.bufferLength++;

    // If buffer exceeds 56 bytes, pad with zeros, process block, then pad next block
    if (this.bufferLength > 56) {
      for (let i = this.bufferLength; i < 64; i++) {
        this.buffer[i] = 0;
      }
      this.processBlocks(this.buffer, 0, 64);
      this.bufferLength = 0;
    }

    for (let i = this.bufferLength; i < 56; i++) {
      this.buffer[i] = 0;
    }

    // Append 64-bit big-endian bit length
    const totalBits = BigInt(this.bytesHashed) * 8n;
    const highBits = Number(totalBits >> 32n) & 0xffffffff;
    const lowBits = Number(totalBits & 0xffffffffn) & 0xffffffff;

    this.buffer[56] = (highBits >>> 24) & 0xff;
    this.buffer[57] = (highBits >>> 16) & 0xff;
    this.buffer[58] = (highBits >>> 8) & 0xff;
    this.buffer[59] = highBits & 0xff;

    this.buffer[60] = (lowBits >>> 24) & 0xff;
    this.buffer[61] = (lowBits >>> 16) & 0xff;
    this.buffer[62] = (lowBits >>> 8) & 0xff;
    this.buffer[63] = lowBits & 0xff;

    this.processBlocks(this.buffer, 0, 64);

    // Format as 64-character lowercase hex string
    let hex = '';
    for (let i = 0; i < 8; i++) {
      const val = (this.h[i] ?? 0) >>> 0;
      hex += val.toString(16).padStart(8, '0');
    }

    return hex;
  }
}

export function computeSha256(data: Uint8Array | ArrayBuffer | string): string {
  const hasher = new StreamingSha256();
  let bytes: Uint8Array;

  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    bytes = data;
  } else {
    bytes = new Uint8Array(data);
  }

  hasher.update(bytes);
  return hasher.digest();
}

const STREAM_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MB chunks

async function readBlobSliceArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob slice'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Computes lowercase 64-char SHA-256 hex digest of a File or Blob in 8 MB chunks.
 * Safe for multi-gigabyte files and works both in browser and Vitest/jsdom.
 */
export async function computeFileSha256(file: File | Blob): Promise<string> {
  const totalBytes = file.size;
  if (totalBytes === 0) {
    return new StreamingSha256().digest();
  }

  if (
    totalBytes <= STREAM_CHUNK_BYTES &&
    typeof globalThis.crypto?.subtle?.digest === 'function'
  ) {
    try {
      const buffer = await readBlobSliceArrayBuffer(file);
      const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback to pure TypeScript streaming engine
    }
  }

  const hasher = new StreamingSha256();
  let offset = 0;
  while (offset < totalBytes) {
    const nextOffset = Math.min(offset + STREAM_CHUNK_BYTES, totalBytes);
    const chunk = await readBlobSliceArrayBuffer(file.slice(offset, nextOffset));
    hasher.update(new Uint8Array(chunk));
    offset = nextOffset;
  }
  return hasher.digest();
}
