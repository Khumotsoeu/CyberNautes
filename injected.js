(function() {
  const pageUrl = location.href;
  function send(evt) {
    window.postMessage({ __aiThreatGuard: true, payload: evt }, '*');
  }

  // ---- Console hooks ----
  ['log', 'warn', 'error'].forEach(level => {
    const orig = console[level];
    console[level] = function(...args) {
      try {
        const msg = args.map(a => safeString(a)).join(' ');
        send({
          type: 'console',
          level,
          message: msg,
          pageUrl,
          topFrame: window === window.top
        });
      } catch {}
      return orig.apply(this, args);
    };
  });

  // ---- Runtime errors ----
  window.addEventListener('error', e => {
    send({
      type: 'runtime_error',
      error: String(e.message || 'Error'),
      stack: String(e.error?.stack || `${e.filename}:${e.lineno}`),
      pageUrl,
      topFrame: window === window.top
    });
  });
  window.addEventListener('unhandledrejection', e => {
    send({
      type: 'runtime_error',
      error: 'unhandledrejection',
      stack: safeString(e.reason),
      pageUrl,
      topFrame: window === window.top
    });
  });

  // ---- Fetch hook ----
  const _fetch = window.fetch;
  window.fetch = async function(input, init = {}) {
    const start = performance.now();
    const req = new Request(input, init);
    try {
      const res = await _fetch(req);
      const durationMs = Math.round(performance.now() - start);
      send({
        type: 'xhrfetch',
        phase: 'completed',
        pageUrl,
        topFrame: window === window.top,
        request: {
          url: req.url,
          method: req.method,
          headers: serializeReqHeaders(req.headers)
        },
        response: { status: res.status },
        durationMs
      });
      return res;
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      send({
        type: 'xhrfetch',
        phase: 'error',
        pageUrl,
        topFrame: window === window.top,
        request: { url: String(input), method: (init && init.method) || 'GET', headers: {} },
        response: null,
        durationMs
      });
      throw err;
    }
  };

  // ---- XHR hook ----
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__ai_req = { method, url, t0: performance.now() };
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    const xhr = this;
    const meta = xhr.__ai_req || { t0: performance.now(), method: 'GET', url: '' };
    function finalize(phase) {
      const durationMs = Math.round(performance.now() - meta.t0);
      try {
        send({
          type: 'xhrfetch',
          phase,
          pageUrl,
          topFrame: window === window.top,
          request: { url: meta.url, method: meta.method, headers: {} },
          response: { status: xhr.status || 0 },
          durationMs
        });
      } catch {}
    }
    xhr.addEventListener('load', () => finalize('completed'));
    xhr.addEventListener('error', () => finalize('error'));
    xhr.addEventListener('abort', () => finalize('abort'));
    return _send.apply(this, arguments);
  };

  // ---- Login form detection ----
  addEventListener('submit', e => {
    try {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      const hasPwd = !!form.querySelector('input[type="password"]');
      if (!hasPwd) return;
      const method = (form.method || 'GET').toUpperCase();
      const path = location.pathname;
      send({
        type: 'login_attempt',
        pageUrl,
        topFrame: window === window.top,
        method,
        path
      });
    } catch {}
  }, true);

  // ---- Helpers ----
  function safeString(v) {
    try {
      if (typeof v === 'string') return truncate(v, 500);
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      return truncate(JSON.stringify(v), 500);
    } catch { return '[unserializable]'; }
  }

  function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function serializeReqHeaders(h) {
    const keep = ['accept', 'content-type', 'referer'];
    const out = {};
    try { for (const [k,v] of h.entries()) {
      const lk = k.toLowerCase();
      if (keep.includes(lk)) out[lk] = v;
    } } catch {}
    return out;
  }
})();
