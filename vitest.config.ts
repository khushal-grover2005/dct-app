import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const REAL_ROOT = fs.realpathSync(__dirname);

export default defineConfig({
  root: REAL_ROOT,
  plugins: [react()],
  server: {
    fs: {
      strict: false,
      allow: [REAL_ROOT, __dirname],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(REAL_ROOT, './src'),
    },
  },
});
