import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const venvWin = path.resolve(import.meta.dirname, '..', '.venv/Scripts/python.exe');
const venvPosix = path.resolve(import.meta.dirname, '..', '.venv/bin/python');
const pythonExe = fs.existsSync(venvWin)
  ? venvWin
  : fs.existsSync(venvPosix)
    ? venvPosix
    : 'python3';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8124',
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `"${pythonExe}" -m uvicorn --factory --app-dir ../backend app.main:create_app --host 127.0.0.1 --port 8124`,
    url: 'http://127.0.0.1:8124/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      ...process.env,
      ENVIRONMENT: 'production',
      GEMINI_API_KEY: '',
      GEMINI_MODEL: '',
      AIR_QUALITY_TIMEOUT_SECONDS: '2.5',
    },
  },
});
