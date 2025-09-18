// popup.js
import { getCfg, setCfg, pushEvent, drain } from './queue.js';
import { sendToBackend } from './backend.js';

document.addEventListener('DOMContentLoaded', async () => {
  const toggleEnabled = document.getElementById('toggleEnabled');
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

  // --- Flush button ---
  flushBtn.addEventListener('click', async () => {
    const batch = await drain(cfg.batchSize);
    if (batch.length > 0) {
      const ts = new Date().toLocaleString();
      const entry = `[system] Flushed ${batch.length} events - ${ts}`;
      addAlert(entry, "system");

      try {
        await sendToBackend("/ingest", { events: batch });
        console.log("[popup] flushed events to backend");
      } catch (err) {
        console.warn("[popup] failed to flush events", err);
      }
    }
  });

  // --- Save config ---
  saveCfgBtn.addEventListener('click', async () => {
    const patch = {
      endpoint: document.getElementById('cfgEndpoint').value,
      apiKey: document.getElementById('cfgApiKey').value,
      batchSize: parseInt(document.getElementById('cfgBatchSize').value, 10)
    };
    await setCfg(patch);
    statusEl.textContent = 'Config saved ✅';

    const ts = new Date().toLocaleString();
    const entry = `[system] Config saved - ${ts}`;
    addAlert(entry, "system");

    try {
      await sendToBackend("/ingest", { events: [{ kind: "config_saved", ts: Date.now(), patch }] });
      console.log("[popup] sent config_saved test event");
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
});
