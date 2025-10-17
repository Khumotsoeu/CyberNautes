// popup.js
import { getCfg, setCfg, pushEvent, drain } from './queue.js';
import { sendToBackend } from './backend.js';

document.addEventListener('DOMContentLoaded', async () => {
  async function getInstallId() {
    const key = 'ai_install_id';
    const s = await chrome.storage.local.get(key);
    if (s[key]) return s[key];
    // Generate new if missing (use crypto.randomUUID if available)
    const id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    await chrome.storage.local.set({ [key]: id });
    return id;
  }
  const toggleEnabled = document.getElementById('toggleEnabled');
  const toggle_blocking = document.getElementById('toggleBlocking');
  const flushBtn = document.getElementById('flushBtn');
  const saveCfgBtn = document.getElementById('saveCfg');
  const resetCfgBtn = document.getElementById('resetCfg');
  const clearAlertsBtn = document.getElementById('clearAlerts');
  const alertsList = document.getElementById('alertsList');
  const alertsCount = document.getElementById('alertsCount');
  const statusEl = document.getElementById('status');

  const scanBtn = document.getElementById('scanBtn');
  const clearBtn = document.getElementById('clearBtn');
  const alertBox = document.getElementById('alertBox');
  const threatType = document.getElementById('threatType');
  const statusMsg = document.getElementById('statusMsg');

  const statsTotal = document.getElementById('statsTotal');
  const statsLast24h = document.getElementById('statsLast24h');
  const statsKinds = document.getElementById('statsLKinds');
  const dailyReport = document.getElementById('dailyReport');

  // --- Load config ---
  const cfg = await getCfg();
  toggleEnabled.checked = cfg.enabled;
  document.getElementById('cfgEndpoint').value = cfg.endpoint;
  document.getElementById('cfgApiKey').value = cfg.apiKey;
  document.getElementById('cfgBatchSize').value = cfg.batchSize;

  statusEl.textContent = cfg.enabled ? 'Enabled' : 'Disabled';

  // --- Toggle enabled ---
  toggleEnabled.addEventListener('change', async (e) => {
    await setCfg({ enabled: e.target.checked });
    statusEl.textContent = e.target.checked ? 'Enabled' : 'Disabled';
  });

  // --- Toggle realtime blocking ---
  toggle_blocking.addEventListener('change', async (e) => {
    await setCfg({ blockSuspicious: e.target.checked });
    // Inform background to update rules immediately
    try {
      const port = chrome.runtime.connect({ name: 'popupListener' });
    port.postMessage({ kind: 'toggle_blocking', enabled: e.target.checked });
    } catch {} 
  });

  // --- Flush button ---
  flushBtn.addEventListener('click', async () => {
    const batch = await drain(cfg.batchSize);
    if (batch.length > 0) {
      const ts = new Date().toLocaleString();
      const entry = `[system] Flushed ${batch.length} events - ${ts}`;
      addAlert(entry, "system");

      try {
        const installId = await getInstallId();
        await sendToBackend("/ingest", { installId, events: batch });
        console.log("[popup] flushed events to backend");
      } catch (err) {
        console.warn("[popup] failed to flush events", err);
      }
    }
  });

  saveCfgBtn.addEventListener('click', async () => {
  const patch = {
    endpoint: document.getElementById('cfgEndpoint').value,
    apiKey: document.getElementById('cfgApiKey').value,
    batchSize: parseInt(document.getElementById('cfgBatchSize').value, 10)
  };
  await setCfg(patch);
  statusEl.textContent = 'Config saved ✅';

  const ts = new Date().toLocaleString();
  addAlert(`[system] Config saved - ${ts}`, "system");

  try {
    await sendToBackend("/ingest", { events: [{ kind: "config_saved", ts: Date.now(), patch }] });
  } catch (err) {
    console.warn("[popup] failed to send config_saved test event", err);
  }
});


  // --- Reset config ---
  resetCfgBtn.addEventListener('click', async () => {
    await setCfg({});
    statusEl.textContent = 'Config reset';

    const ts = new Date().toLocaleString();
    const entry = `[system] Config reset - ${ts}`;
    addAlert(entry, "system");

    try {
      await sendToBackend("/ingest", { events: [{ kind: "config_reset", ts: Date.now() }] });
      console.log("[popup] sent config_reset test event");
    } catch (err) {
      console.warn("[popup] failed to send config_reset test event", err);
    }
  });

  // --- Simulate scan ---
  scanBtn.addEventListener('click', () => {
    const threats = ['Phishing attempt', 'Malware script', 'Suspicious redirect', 'Keylogger detected'];
    const randomThreat = threats[Math.floor(Math.random() * threats.length)];
    const timestamp = new Date().toLocaleString();
    const entry = `${randomThreat} - ${timestamp}`;

    // Update alert box
    threatType.textContent = randomThreat;
    alertBox.style.display = 'block';
    statusMsg.textContent = `Threat detected: ${randomThreat}`;

    // Use threat styling
    addAlert(entry, "threat");
  });

  // --- Clear simulated alerts (not history) ---
  clearBtn.addEventListener('click', () => {
    alertBox.style.display = 'none';
    threatType.textContent = 'Unknown';
    statusMsg.textContent = 'System idle. No threats detected.';
  });

  // --- Clear alerts list ---
  clearAlertsBtn.addEventListener('click', () => {
    alertsList.innerHTML = '<li class="muted">No alerts yet</li>';
    alertsCount.textContent = '0';
  });

  // --- Render alerts helper ---
  function addAlert(entry, type = "system") {
    if (alertsList.querySelector('.muted')) {
      alertsList.innerHTML = '';
    }
    const li = document.createElement('li');
    li.textContent = entry;

    if (type === "system") {
      li.classList.add("system-alert");
    } else if (type === "threat") {
      li.classList.add("threat-alert");
    }

    alertsList.prepend(li);

    const count = alertsList.querySelectorAll('li').length;
    alertsCount.textContent = count;
  }

  // === Backend alerts via background connection ===
  const port = chrome.runtime.connect({ name: 'popupListener' });
  port.onMessage.addListener((msg) => {
    if (msg && msg.kind === 'alert') {
      const timestamp = new Date().toLocaleString();
      const entry = `[${msg.level || 'info'}] ${msg.message} - ${timestamp}`;
      addAlert(entry, "threat");

      // Update alert box live
      threatType.textContent = msg.message || 'Unknown threat';
      alertBox.style.display = 'block';
      statusMsg.textContent = `Backend alert: ${msg.message}`;
    }
  });

  // === Dashboard fetch ===
  async function fetchDashboard() {
    try {
      const stats = await sendToBackend('/dashboard', null, {method: 'GET' });
      statsTotal.textContent = stats?.total_events ?? '-';
      statsLast24h.textContent = stats?.events_last_24h ?? '-';

      statsKinds.innerHTML = '';
      const kinds = stats?.by_kinds || {};
      Object.keys(kinds).sorts().forEach(kind => {
        const li = document.createElement('li');
        li.textContent = `${kind}: ${kinds[kind]}`;
        statsKinds.appendChild(li);
      });
    } catch (e) {
      // ignore in dev without server
    }

    try {
      const report = await sendToBackend('/daily_report', null, {method: 'GET' });
      dailyReport.innerHTML = '';
      for (const d of report?.days || []) {
        const li = document.createElement('li');
        const kinds = Object.entries(d.kinds).map(([k, v]) => `${k}: ${v}`).join(', ');
        li.textContent = '${d.day} - total ${d.total} (${kinds})';
        dailyReport.appendChild(li);
      }
    } catch (e) {
      // ignore in dev
    }
  }
  
  // Initial fetch and periodic refresh
  await refreshDashboard();
  setInterval(refreshDashboard, 15000)
});
