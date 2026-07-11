// github.js — persistence for Cloudflare Workers.
//
// Workers have no filesystem, so this is a pure-fetch GitHub Contents API
// client (JSON + binary), with an in-memory Map fallback used when GitHub isn't
// configured (handy for local `wrangler dev` / demos — but that store is
// ephemeral per-isolate). GitHub stays the real source of truth in production,
// exactly like the old backend ("store on github same old").

const API_BASE = 'https://api.github.com';

function cfg() {
  const e = (typeof process !== 'undefined' && process.env) ? process.env : {};
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH = 'main' } = e;
  return { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH };
}
function hasGithubConfig() {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = cfg();
  return !!(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO);
}
function headers() {
  const { GITHUB_TOKEN } = cfg();
  return {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'map-panel-worker'
  };
}
function urlFor(p) {
  const { GITHUB_OWNER, GITHUB_REPO } = cfg();
  const encodedPath = p.split('/').map(encodeURIComponent).join('/');
  return `${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodedPath}`;
}

/* ------------------------------ in-memory store ------------------------------ */
// path -> object (JSON) ; path -> Uint8Array (binary)
const memJson = new Map();
const memBin = new Map();

/* --------------------------------- helpers ---------------------------------- */
async function ghGetSha(p) {
 const { GITHUB_BRANCH } = cfg();
const res = await fetch(
  `${urlFor(p)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
  { headers: headers() }
);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.sha || null;
}

/* =========================== JSON FILES =========================== */
export async function getFile(p) {
  if (!hasGithubConfig()) {
    return memJson.has(p) ? { content: memJson.get(p), sha: 'mem' } : null;
  }
  try {
    const { GITHUB_BRANCH } = cfg();
    const res = await `${urlFor(p)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers: headers() });
    if (res.status === 404) return memJson.has(p) ? { content: memJson.get(p), sha: 'mem' } : null;
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = atobUtf8(String(data.content || '').replace(/\n/g, ''));
    const content = JSON.parse(text);
    memJson.set(p, content); // warm the cache
    return { content, sha: data.sha };
  } catch {
    // Transient GitHub error → fall back to whatever we last saw in memory.
    return memJson.has(p) ? { content: memJson.get(p), sha: 'mem' } : null;
  }
}

export async function putFile(p, contentObject, { message, sha } = {}) {
  memJson.set(p, contentObject); // always mirror in memory first
  if (!hasGithubConfig()) return { ok: true };

  const { GITHUB_BRANCH } = cfg();
  const content = btoaUtf8(JSON.stringify(contentObject, null, 2) + '\n');

  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      let useSha = (attempt === 0) ? sha : undefined;
      if (useSha === undefined) useSha = await ghGetSha(p).catch(() => null);
      const body = { message: message || `Update ${p}`, content, branch: GITHUB_BRANCH };
      if (useSha && useSha !== 'mem') body.sha = useSha;

      const res = await fetch(urlFor(p), { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
      if (res.ok) return res.json();
      const txt = await res.text();
      if (res.status === 409 || res.status === 422) { lastErr = new Error(txt); continue; } // stale SHA → retry
      throw new Error(`GitHub ${res.status}: ${txt}`);
    } catch (e) { lastErr = e; }
  }
  const err = new Error(`GitHub-a yazmaq mümkün olmadı: ${lastErr?.message || 'naməlum xəta'}`);
  err.status = 502;
  throw err;
}

export async function deleteFile(p, { message } = {}) {
  memJson.delete(p);
  if (!hasGithubConfig()) return { ok: true };
  try {
    const sha = await ghGetSha(p).catch(() => null);
    if (!sha) return { ok: true };
    const { GITHUB_BRANCH } = cfg();
    const res = await fetch(urlFor(p), {
      method: 'DELETE', headers: headers(),
      body: JSON.stringify({ message: message || `Delete ${p}`, sha, branch: GITHUB_BRANCH })
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  } catch (e) {
    console.error('[deleteFile]', e.message);
    return { ok: true, githubSynced: false };
  }
}

// List file names in a directory (used by the RT github-json fallback).
export async function listDir(p) {
  if (hasGithubConfig()) {
    try {
      const { GITHUB_BRANCH } = cfg();
      const res = await fetch(`${urlFor(p)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers: headers() });
      if (res.ok) {
        const arr = await res.json();
        if (Array.isArray(arr)) return arr.filter(x => x.type === 'file').map(x => x.name);
      }
      return [];
    } catch { return []; }
  }
  // in-memory: derive children of the prefix
  const prefix = p.endsWith('/') ? p : p + '/';
  const names = new Set();
  for (const key of memJson.keys()) {
    if (key.startsWith(prefix)) {
      const rest = key.slice(prefix.length);
      if (!rest.includes('/')) names.add(rest);
    }
  }
  return [...names];
}

/* =========================== BINARY FILES (PDFs) =========================== */
export async function getBinary(p) {
  if (!hasGithubConfig()) return memBin.get(p) || null;
  try {
    const { GITHUB_BRANCH } = cfg();
    const res = await fetch(`${urlFor(p)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers: headers() });
    if (res.status === 404) return memBin.get(p) || null;
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (data.content) return unb64(String(data.content).replace(/\n/g, ''));
    if (data.download_url) {
      const raw = await fetch(data.download_url, { headers: { Authorization: `Bearer ${cfg().GITHUB_TOKEN}`, 'User-Agent': 'map-panel-worker' } });
      if (!raw.ok) throw new Error('download_url fetch failed');
      return new Uint8Array(await raw.arrayBuffer());
    }
    return null;
  } catch {
    return memBin.get(p) || null;
  }
}

export async function putBinary(p, bytes, { message } = {}) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  memBin.set(p, u8);
  if (!hasGithubConfig()) return { ok: true };

  const { GITHUB_BRANCH } = cfg();
  const content = b64(u8);
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const useSha = await ghGetSha(p).catch(() => null);
      const body = { message: message || `Update ${p}`, content, branch: GITHUB_BRANCH };
      if (useSha) body.sha = useSha;
      const res = await fetch(urlFor(p), { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
      if (res.ok) return res.json();
      const txt = await res.text();
      if (res.status === 409 || res.status === 422) { lastErr = new Error(txt); continue; }
      throw new Error(`GitHub ${res.status}: ${txt}`);
    } catch (e) { lastErr = e; }
  }
  const err = new Error(`PDF GitHub-a yüklənmədi: ${lastErr?.message || 'naməlum xəta'}`);
  err.status = 502;
  throw err;
}

export async function deleteBinary(p, { message } = {}) {
  memBin.delete(p);
  if (!hasGithubConfig()) return { ok: true };
  try {
    const sha = await ghGetSha(p).catch(() => null);
    if (!sha) return { ok: true };
    const { GITHUB_BRANCH } = cfg();
    const res = await fetch(urlFor(p), {
      method: 'DELETE', headers: headers(),
      body: JSON.stringify({ message: message || `Delete ${p}`, sha, branch: GITHUB_BRANCH })
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  } catch (e) {
    console.error('[deleteBinary]', e.message);
    return { ok: true, githubSynced: false };
  }
}

/* =========================== helpers: base64 <-> bytes/utf8 =========================== */
function b64(u8) {
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}
function unb64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const _enc = new TextEncoder();
const _dec = new TextDecoder();
function btoaUtf8(str) { return b64(_enc.encode(str)); }
function atobUtf8(b64str) { return _dec.decode(unb64(b64str)); }

/* =========================== diagnostics =========================== */
export async function diagnose() {
  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } = cfg();
  const out = { runtime: 'cloudflare-workers', githubConfigured: hasGithubConfig(), owner: GITHUB_OWNER || null, repo: GITHUB_REPO || null, branch: GITHUB_BRANCH || null };
  if (hasGithubConfig()) {
    for (const p of ['data/diagrams/index.json', 'data/files/index.json']) {
      try {
        const res = await fetch(`${urlFor(p)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers: headers() });
        out[p] = { githubStatus: res.status };
      } catch (e) { out[p] = { githubError: e.message }; }
    }
  }
  return out;
}
