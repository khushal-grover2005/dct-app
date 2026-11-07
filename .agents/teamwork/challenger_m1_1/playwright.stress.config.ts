import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, '../../..');

export default defineConfig({
  testDir: currentDir,
  testMatch: /stress_gate\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173',
    cwd: rootDir,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
