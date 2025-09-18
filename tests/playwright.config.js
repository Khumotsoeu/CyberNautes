// tests/playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 30000,
  retries: 0,
  testDir: __dirname,   // ensure it looks for tests here
  use: {
    headless: true,
    baseURL: 'http://localhost:8000',
  },
  webServer: {
    command: 'python server/server.py',
    url: 'http://localhost:8000/ingest',
    reuseExistingServer: !process.env.CI,
    timeout: 20000,   // wait up to 20s for server to be ready
  },
});
