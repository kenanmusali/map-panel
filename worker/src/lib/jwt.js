// jwt.js — dependency-free HS256 JSON Web Tokens using the Web Crypto API.
// Works identically on Cloudflare Workers and Node 18+ (both expose global
// `crypto.subtle`, `btoa`/`atob`, TextEncoder/TextDecoder). Token format is a
// standard JWT, so it is a drop-in replacement for the old jsonwebtoken usage.

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlFromBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromStr(s) { return b64urlFromBytes(enc.encode(s)); }
function strFromB64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

export async function sign(payload, secret, { expiresInSec } = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now };
  if (expiresInSec) body.exp = now + expiresInSec;
  const data = `${b64urlFromStr(JSON.stringify(header))}.${b64urlFromStr(JSON.stringify(body))}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data));
  return `${data}.${b64urlFromBytes(sig)}`;
}

export async function verify(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const data = `${parts[0]}.${parts[1]}`;
  const expected = b64urlFromBytes(
    await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data))
  );
  // constant-time-ish comparison
  const got = parts[2];
  if (got.length !== expected.length) throw new Error('bad signature');
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) throw new Error('bad signature');
  const payload = JSON.parse(strFromB64url(parts[1]));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) throw new Error('token expired');
  return payload;
}
