// queue.js
const KEY = 'ai_queue_v1';
const CFG_KEY = 'ai_cfg_v1';

// Default config
const DEFAULT_CFG = {
  enabled: true,
  endpoint: 'http://localhost:8000/ingest',
  batchSize: 25,
  flushIntervalMs: 4000,
  maxRetries: 5,
  apiKey: '' // <- must be set in config
};

export async function getCfg() {
  const { [CFG_KEY]: cfg } = await chrome.storage.local.get(CFG_KEY);
  return { ...DEFAULT_CFG, ...(cfg || {}) };
}

export async function setCfg(patch) {
  const cfg = { ...(await getCfg()), ...(patch || {}) };
  await chrome.storage.local.set({ [CFG_KEY]: cfg });
  return cfg;
}

export async function pushEvent(evt) {
  const now = Date.now();
  const rec = { ...evt, _ts: now, _retries: 0 };
  const { [KEY]: buf = [] } = await chrome.storage.local.get(KEY);
  buf.push(rec);
  await chrome.storage.local.set({ [KEY]: buf });
}

export async function drain(batchSize) {
  const { [KEY]: buf = [] } = await chrome.storage.local.get(KEY);
  if (buf.length === 0) return [];
  const batch = buf.slice(0, batchSize);
  await chrome.storage.local.set({ [KEY]: buf.slice(batchSize) });
  return batch;
}

async function requeueFailed(batch) {
  const { [KEY]: buf = [] } = await chrome.storage.local.get(KEY);
  const cfg = await getCfg();

  // Increment retries and filter out those that exceeded maxRetries
  const retryBatch = batch
    .map(e => ({ ...e, _retries: (e._retries || 0) + 1 }))
    .filter(e => e._retries <= cfg.maxRetries);

  await chrome.storage.local.set({
    [KEY]: [...retryBatch, ...buf].slice(0, 5000),
  });
}

export async function flushLoop(getInstallId) {
  const cfg = await getCfg();
  const baseInterval = cfg.flushIntervalMs || 4000;

  setInterval(async () => {
    const cfgNow = await getCfg();
    if (!cfgNow.enabled) return;

    const batch = await drain(cfgNow.batchSize);
    if (!batch || batch.length === 0) return;

    try {
      const installId = await getInstallId(); // ✅ await here
      const res = await fetch(cfgNow.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-API-Key': cfgNow.apiKey || '',
        },
        body: JSON.stringify({ installId, events: batch }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.debug(`[queue] flushed ${batch.length} events`);
    } catch (e) {
      console.warn(`[queue] flush failed: ${e}`);
      await requeueFailed(batch);

      // backoff logic unchanged
      const maxDelay = baseInterval * 8;
      const delay = Math.min(
        maxDelay,
        baseInterval * 2 ** (batch[0]?._retries || 1)
      );
      console.debug(`[queue] backoff for ${delay}ms before next retry`);
      await new Promise(r => setTimeout(r, delay));
    }
  }, baseInterval);
}
