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

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function ch(x: number, y: number, z: number): number {
  return (x & y) ^ (~x & z);
}

function maj(x: number, y: number, z: number): number {
  return (x & y) ^ (x & z) ^ (y & z);
}

function sigma0(x: number): number {
  return rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22);
}

function sigma1(x: number): number {
  return rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25);
}

function gamma0(x: number): number {
  return rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
}

function gamma1(x: number): number {
  return rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10);
}

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
        this.processBlock(this.buffer, 0);
        this.bufferLength = 0;
        offset += needed;
      } else {
        this.buffer.set(chunk, this.bufferLength);
        this.bufferLength += len;
        return this;
      }
    }

    // Process full 64-byte blocks directly from chunk
    while (offset + 64 <= len) {
      this.processBlock(chunk, offset);
      offset += 64;
    }

    // Retain any remaining trailing bytes
    if (offset < len) {
      const remaining = len - offset;
      this.buffer.set(chunk.subarray(offset, len), 0);
      this.bufferLength = remaining;
    }

    return this;
  }

  private processBlock(block: Uint8Array, offset: number): void {
    const w = this.w;

    // Load first 16 words big-endian
    for (let i = 0; i < 16; i++) {
      const idx = offset + i * 4;
      const b0 = block[idx] ?? 0;
      const b1 = block[idx + 1] ?? 0;
      const b2 = block[idx + 2] ?? 0;
      const b3 = block[idx + 3] ?? 0;
      w[i] = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
    }

    // Expand to 64 words
    for (let t = 16; t < 64; t++) {
      const wt2 = w[t - 2] ?? 0;
      const wt7 = w[t - 7] ?? 0;
      const wt15 = w[t - 15] ?? 0;
      const wt16 = w[t - 16] ?? 0;
      w[t] = (gamma1(wt2) + wt7 + gamma0(wt15) + wt16) | 0;
    }

    let a = this.h[0] ?? 0;
    let b = this.h[1] ?? 0;
    let c = this.h[2] ?? 0;
    let d = this.h[3] ?? 0;
    let e = this.h[4] ?? 0;
    let f = this.h[5] ?? 0;
    let g = this.h[6] ?? 0;
    let h = this.h[7] ?? 0;

    for (let t = 0; t < 64; t++) {
      const wt = w[t] ?? 0;
      const kt = K[t] ?? 0;
      const t1 = (h + sigma1(e) + ch(e, f, g) + kt + wt) | 0;
      const t2 = (sigma0(a) + maj(a, b, c)) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    this.h[0] = ((this.h[0] ?? 0) + a) | 0;
    this.h[1] = ((this.h[1] ?? 0) + b) | 0;
    this.h[2] = ((this.h[2] ?? 0) + c) | 0;
    this.h[3] = ((this.h[3] ?? 0) + d) | 0;
    this.h[4] = ((this.h[4] ?? 0) + e) | 0;
    this.h[5] = ((this.h[5] ?? 0) + f) | 0;
    this.h[6] = ((this.h[6] ?? 0) + g) | 0;
    this.h[7] = ((this.h[7] ?? 0) + h) | 0;
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
      this.processBlock(this.buffer, 0);
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

    this.processBlock(this.buffer, 0);

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
