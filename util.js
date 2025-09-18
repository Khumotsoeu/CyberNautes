// util.js

// Safe headers allowlist
const SAFE_HEADERS = ["content-type", "accept", "referer", "user-agent"];

export function uuidv4() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      );
}

export async function sha256Hex(str) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function safeNow() {
  return new Date().toISOString();
}

export function safeOrigin(u) {
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch (err) {
    console.debug("safeOrigin: failed to parse", u, err);
    return u;
  }
}

export function redactUrl(u, allowlist = []) {
  try {
    const url = new URL(u);
    if (!url.search) return `${url.origin}${url.pathname}`;
    const keep = new URLSearchParams();
    for (const k of allowlist) {
      const v = url.searchParams.get(k);
      if (v) keep.set(k, v);
    }
    const qs = keep.toString();
    return `${url.origin}${url.pathname}${qs ? `?${qs}` : ""}`;
  } catch (err) {
    console.debug("redactUrl: failed to parse", u, err);
    return u;
  }
}

export function serializeHeaders(headers, keep = SAFE_HEADERS) {
  const out = {};
  try {
    for (const [k, v] of headers) {
      const lk = String(k).toLowerCase();
      if (keep.includes(lk)) out[lk] = v;
    }
  } catch (err) {
    console.debug("serializeHeaders: failed", err);
  }
  return out;
}
