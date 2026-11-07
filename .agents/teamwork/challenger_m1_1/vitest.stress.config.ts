import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [path.resolve(__dirname, '../../../tests/setup.ts').replace(/\\/g, '/')],
    include: [path.resolve(__dirname, './stress_test_gate.test.tsx').replace(/\\/g, '/')],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../../src'),
    },
  },
});
