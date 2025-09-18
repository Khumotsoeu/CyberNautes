// tests/test_e2e.spec.js
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const EXT_PATH = path.join(__dirname, '..');

// Dummy API key for CI/testing
const TEST_API_KEY = 'test-ci-key';

// Mock page that triggers console + fetch
const HTML = `
<!DOCTYPE html>
<html>
<head><title>ThreatGuard Test</title></head>
<body>
<script>
console.log('threatguard-test');
fetch('/echo', { method: 'GET' }).catch(()=>{});
</script>
</body>
</html>`;

const TEST_PAGE = path.join(__dirname, 'test.html');
fs.writeFileSync(TEST_PAGE, HTML);

test('extension captures console + fetch and sends to ingest', async ({ browser }) => {
  const context = await browser.newContext({
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
  });

  // Preload config with dummy API key into chrome.storage.local
  await context.addInitScript((cfgKey, key) => {
    chrome.storage.local.set({
      [cfgKey]: {
        enabled: true,
        endpoint: 'http://localhost:8000/ingest',
        batchSize: 10,
        flushIntervalMs: 2000,
        maxRetries: 3,
        apiKey: key
      }
    });
  }, 'ai_cfg_v1', TEST_API_KEY);

  const page = await context.newPage();
  await page.goto(`file://${TEST_PAGE}`);

  // Wait some seconds for flush loop
  await page.waitForTimeout(6000);

  // Verify ingest.log got the events
  const logFile = path.join(__dirname, '..', 'server', 'ingest.log');
  const logData = fs.readFileSync(logFile, 'utf8');
  expect(logData).toContain('console');
  expect(logData).toContain('client_request');
});
