// content_script.js
(function inject() {
  if (document.documentElement.hasAttribute('data-ai-threatguard-injected')) {
    return; // already injected
  }
  document.documentElement.setAttribute('data-ai-threatguard-injected', 'true');

  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('injected.js');
  s.async = false;
  (document.head || document.documentElement).appendChild(s);
})();

// Robust background connection with auto-reconnect and message queue
let port = null;
let isConnecting = false;
let reconnectTimerId = 0;
let retryDelayMs = 250;
const MAX_RETRY_DELAY_MS = 30000;
const pendingQueue = [];
const MAX_QUEUE = 200;

function scheduleReconnect() {
  clearTimeout(reconnectTimerId);
  reconnectTimerId = setTimeout(connectToBackground, retryDelayMs);
  retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
}

function connectToBackground() {
  if (!chrome?.runtime?.id) {
    // Extension context not available (e.g., reloaded/disabled)
    return;
  }
  if (port || isConnecting) return;
  isConnecting = true;
  try {
    const p = chrome.runtime.connect({ name: 'eventStream' });
    p.onDisconnect.addListener(() => {
      port = null;
      scheduleReconnect();
    });
    port = p;
    retryDelayMs = 250;
    flushQueue();
  } catch (e) {
    // Likely "Extension context invalidated"; back off and retry
    scheduleReconnect();
  } finally {
    isConnecting = false;
  }
}

function enqueue(payload) {
  if (pendingQueue.length >= MAX_QUEUE) pendingQueue.shift();
  pendingQueue.push(payload);
}

function flushQueue() {
  if (!port) return;
  while (pendingQueue.length) {
    const next = pendingQueue[0];
    try {
      port.postMessage(next);
      pendingQueue.shift();
    } catch (e) {
      // Port broke mid-flush; retry later
      port = null;
      scheduleReconnect();
      break;
    }
  }
}

function postToBackground(payload) {
  if (!chrome?.runtime?.id) return;
  if (!port) {
    enqueue(payload);
    connectToBackground();
    return;
  }
  try {
    port.postMessage(payload);
  } catch (e) {
    // e.g., Error: Extension context invalidated
    enqueue(payload);
    port = null;
    scheduleReconnect();
  }
}

// Attempt initial connect soon after load
connectToBackground();

// Listen for events from injected.js
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data || {};
  if (data.__aiThreatGuard !== true) return;

  postToBackground(data.payload);
});

// Try reconnecting when the tab becomes visible again
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !port) {
    connectToBackground();
  }
});
