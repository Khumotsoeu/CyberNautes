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

// Persistent connection to background
let port;
try {
  port = chrome.runtime.connect({ name: 'eventStream' });
} catch (e) {
  console.warn('[ThreatGuard] failed to connect to background:', e);
}

// Listen for events from injected.js
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data || {};
  if (data.__aiThreatGuard !== true) return;

  try {
    port?.postMessage(data.payload);
  } catch (e) {
    console.warn('[ThreatGuard] failed to post message to background:', e);
  }
});
