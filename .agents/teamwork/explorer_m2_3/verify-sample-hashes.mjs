import fs from 'fs';
import path from 'path';

// Pure JS SHA256
class Sha256 {
  constructor() {
    this.h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.bytesHashed = 0;
    this.k = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);
    this.w = new Uint32Array(64);
  }

  _compress(block, offset) {
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (block[j] << 24) | (block[j + 1] << 16) | (block[j + 2] << 8) | block[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const v0 = w[i - 15];
      const s0 = ((v0 >>> 7) | (v0 << 25)) ^ ((v0 >>> 18) | (v0 << 14)) ^ (v0 >>> 3);
      const v1 = w[i - 2];
      const s1 = ((v1 >>> 17) | (v1 << 15)) ^ ((v1 >>> 19) | (v1 << 13)) ^ (v1 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = this.h[0], b = this.h[1], c = this.h[2], d = this.h[3];
    let e = this.h[4], f = this.h[5], g = this.h[6], h = this.h[7];

    for (let i = 0; i < 64; i++) {
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + this.k[i] + w[i]) | 0;
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    this.h[0] = (this.h[0] + a) | 0;
    this.h[1] = (this.h[1] + b) | 0;
    this.h[2] = (this.h[2] + c) | 0;
    this.h[3] = (this.h[3] + d) | 0;
    this.h[4] = (this.h[4] + e) | 0;
    this.h[5] = (this.h[5] + f) | 0;
    this.h[6] = (this.h[6] + g) | 0;
    this.h[7] = (this.h[7] + h) | 0;
  }

  update(data) {
    this.bytesHashed += data.length;
    let offset = 0;
    let remaining = data.length;

    if (this.bufferLength > 0) {
      const toCopy = Math.min(64 - this.bufferLength, remaining);
      this.buffer.set(data.subarray(0, toCopy), this.bufferLength);
      this.bufferLength += toCopy;
      offset += toCopy;
      remaining -= toCopy;

      if (this.bufferLength === 64) {
        this._compress(this.buffer, 0);
        this.bufferLength = 0;
      }
    }

    while (remaining >= 64) {
      this._compress(data, offset);
      offset += 64;
      remaining -= 64;
    }

    if (remaining > 0) {
      this.buffer.set(data.subarray(offset), 0);
      this.bufferLength = remaining;
    }
  }

  digest() {
    const totalBits = this.bytesHashed * 8;
    this.buffer[this.bufferLength++] = 0x80;

    if (this.bufferLength > 56) {
      this.buffer.fill(0, this.bufferLength);
      this._compress(this.buffer, 0);
      this.bufferLength = 0;
    }

    this.buffer.fill(0, this.bufferLength, 56);
    const view = new DataView(this.buffer.buffer);
    view.setBigUint64(56, BigInt(totalBits), false);
    this._compress(this.buffer, 0);

    return Array.from(this.h)
      .map(v => (v >>> 0).toString(16).padStart(8, '0'))
      .join('');
  }
}

// Read sample CSV expected hashes
const sampleCsv = fs.readFileSync('docs/consent-tagging/examples/asset_export.sample.csv', 'utf-8');
const lines = sampleCsv.trim().split('\n').slice(1);
const expectedHashes = {};
for (const line of lines) {
  const parts = line.split(',');
  const assetId = parts[4];
  const hash = parts[7];
  expectedHashes[assetId] = hash;
}

const sampleDir = 'docs/consent-tagging/examples/sample-collection';
const files = fs.readdirSync(sampleDir);

console.log(`Checking ${files.length} sample collection files:`);
let allMatch = true;

for (const file of files) {
  const filePath = path.join(sampleDir, file);
  const data = fs.readFileSync(filePath);

  // Test streaming in 1024-byte chunks (to test chunking!)
  const hasher = new Sha256();
  const chunkSize = 1024;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, Math.min(i + chunkSize, data.length));
    hasher.update(chunk);
  }
  const hash = hasher.digest();
  const expected = expectedHashes[file];

  const match = hash === expected;
  console.log(`${file}: ${match ? 'MATCH' : 'MISMATCH'} (${hash})`);
  if (!match) {
    console.log(`  Expected: ${expected}`);
    allMatch = false;
  }
}

console.log(`All files match: ${allMatch}`);
