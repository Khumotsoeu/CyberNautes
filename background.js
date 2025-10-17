// background.js (service worker, type=module)
import { uuidv4, safeNow, redactUrl } from './util.js';
import { pushEvent, flushLoop, getCfg, setCfg } from './queue.js';

let installId = null;
async function getInstallId() {
  if (installId) return installId;
  const key = 'ai_install_id';
  const s = await chrome.storage.local.get(key);
  if (s[key]) { installId = s[key]; return installId; }
  installId = uuidv4();
  await chrome.storage.local.set({ [key]: installId });
  return installId;
}

chrome.runtime.onInstalled.addListener(async () => { await getInstallId(); });

// 🔌 Popup port registry
const popupPorts = new Set();
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'eventStream') {
    port.onMessage.addListener(async (msg) => {
      const base = { 
        t: safeNow(), 
        installId: await getInstallId(), 
        topFrame: msg.topFrame ?? true, 
        url: msg.url 
      };
      try {
        let eventObj = null;

        if (msg.type === 'console') {
          eventObj = { kind: 'console', level: msg.level, message: msg.message?.slice(0, 5000), ...base };
        } else if (msg.type === 'runtime_error') {
          eventObj = { kind: 'runtime_error', error: msg.error, stack: msg.stack, ...base };
        } else if (msg.type === 'login_attempt') {
          eventObj = { kind: 'login_attempt', path: msg.path, method: msg.method, hasPwdField: true, ...base };
        } else if (msg.type === 'xhrfetch') {
          eventObj = { kind: 'client_request', phase: msg.phase, url: redactUrl(msg.request.url), method: msg.request.method, headers: msg.request.headers, status: msg.response?.status, durationMs: msg.durationMs, ...base };
        }

        if (eventObj) {
          await pushEvent(eventObj);
          await checkAnomaly(eventObj); // 🔮 anomaly check for ALL event kinds
        }
      } catch (e) {
        console.warn('bg: failed to push/check event', e);
      }
    });
  } else if (port.name === 'popupListener') {
    popupPorts.add(port);
    port.onDisconnect.addListener(() => popupPorts.delete(port));
    //handle toggle of realtime blocking from popup
    port.message.addListener(async (msg) => {
      if (msg && msg.kind === 'toggle_blocking') {
        await setRealtimeBlocking(msg.enabled === true);
      }
    })
  }
});

// === Helper: call /predict endpoint ===
async function checkAnomaly(event) {
  try {
    const cfg = await getCfg();
    if (!cfg.apiKey || !cfg.endpoint) return;

    const res = await fetch(cfg.endpoint.replace("/ingest", "/predict"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-API-Key": cfg.apiKey
      },
      body: JSON.stringify({ installId: await getInstallId(), events: [event] })
    });

    if (!res.ok) throw new Error(`Predict failed: ${res.status}`);
    const data = await res.json();

    if (Array.isArray(data.results) && data.results[0] === -1) {
      const alertMsg = `Anomaly detected: ${event.kind} ${event.path || event.url || ""}`;

      // Forward to popup(s)
      const msg = { kind: "alert", level: "warning", type: "threat", message: alertMsg };
      popupPorts.forEach(p => p.postMessage(msg));

      // 🔔 System-level notification
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",   // ✅ correct path
        title: "NetGuardian AI Alert",
        message: alertMsg,
        priority: 2
      });
      
      //Optional: add temporary blocking rule if enabled
      const cfg = await getCfg();
      if (cfg.blockSuspicious && event.url) {
        await addTemporaryBlockRule(event.url);
      }

      console.debug("[bg] anomaly alert sent to popup + notification");
    }
  } catch (e) {
    console.warn("checkAnomaly failed", e);
  }
}

// === Network telemetry ===
chrome.webRequest.onCompleted.addListener(async (details) => {
  const { method, url, timeStamp, statusCode, ip, initiator, type, requestId } = details;
  const base = { t: safeNow(), installId: await getInstallId() };
  const evt = { kind: 'net_completed', url: redactUrl(url), method, status: statusCode, ip, initiator, resType: type, requestId, completedAt: timeStamp, ...base };
  await pushEvent(evt);
  await checkAnomaly(evt);
}, { urls: ["<all_urls>"] });

chrome.webRequest.onErrorOccurred.addListener(async (details) => {
  const { method, url, timeStamp, error, type, requestId } = details;
  const base = { t: safeNow(), installId: await getInstallId() };
  const evt = { kind: 'net_error', url: redactUrl(url), method, error, resType: type, requestId, failedAt: timeStamp, ...base };
  await pushEvent(evt);
  await checkAnomaly(evt);
}, { urls: ["<all_urls>"] });

// === Cookie metadata ===
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  const { cookie, removed, cause } = changeInfo;
  const base = { t: safeNow(), installId: await getInstallId() };
  const evt = { kind: 'cookie_change', domain: cookie.domain, path: cookie.path, secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, removed, cause, expires: cookie.expirationDate || null, ...base };
  await pushEvent(evt);
  await checkAnomaly(evt);
});

// === Start flushing loop ===
flushLoop(getInstallId);

// == Real-time blocking helper ===
async function setRealtimeBlocking(enabled) {
  const cfg = await getCfg();
  await setCfg({ ...cfg, blockSuspicious:  !!enabled });
}

async function  addTemporaryBlockRule(url) {
  try {
    const u = new URL(url);
    const host = u.host;
    const id = Math.floor(Math.random () * 1e9) + 1;
    const rule = {
      id,
      priority: 1,
      action: {type: 'block'},
      condition: {urlFilter: host, resourceTypes: [ 'main_frame', 'sub_frame', 'xmlhttprequest', 'script'] }
    };
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [rule] });
    //Auto-remove after 5 minutes
    setTimeout(async () => {
      try { await chrome.declarativeNetRequest.updateDynamicRules({ removeRulesIds: [id] }); } catch {}
    }, 5 * 60 * 1000); 
  } catch {}
}