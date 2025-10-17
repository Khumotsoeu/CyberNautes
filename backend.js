// backend.js
import { getCfg } from "./queue.js";

// 🔗 Send payloads to backend, respecting dev mode (omit X-API-Key if empty)
export async function sendToBackend(path, payload, options = {}) { 
  const cfg = await getCfg();
  if (!cfg.endpoint) return null;

  const headers = { "content-type": "application/json" };
  if (cfg.apiKey && cfg.apiKey.trim() !== "") {
    headers["X-API-Key"] = cfg.apiKey.trim();
  }

  const url = cfg.endpoint.replace("/ingest", path);
  const method = options.method || "POST".toUpperCase();
  const init = {method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = JSON.stringify(payload ?? {});
  }
  const res = await fetch(url, init);

  if (!res.ok) throw new Error(`${path} failed: HTTP ${res.status}`);
  return res.json();
}


  