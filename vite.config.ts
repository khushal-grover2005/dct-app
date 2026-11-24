import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

const REAL_ROOT = fs.realpathSync(__dirname);

// On Windows directory junctions (e.g. C:\... -> D:\...), Vite's dep optimizer
// uses process.cwd() as esbuild absWorkingDir while cacheDir lives under root.
// Aligning cwd to the canonical project root prevents cross-drive path mismatches.
try {
  if (fs.realpathSync(process.cwd()) === REAL_ROOT && process.cwd() !== REAL_ROOT) {
    process.chdir(REAL_ROOT);
  }
} catch {
  // Ignore if cwd cannot be inspected or changed.
}

const CSP_POLICY =
  "default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'";

export default defineConfig({
  root: REAL_ROOT,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(REAL_ROOT, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    hmr: false,
    headers: {
      'Content-Security-Policy': CSP_POLICY,
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    headers: {
      'Content-Security-Policy': CSP_POLICY,
    },
  },
});
