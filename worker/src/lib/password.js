// password.js — password hashing that runs on Cloudflare Workers.
//
// bcrypt is CPU-heavy and can blow the Workers free-tier CPU budget. So new
// hashes use PBKDF2-SHA256 via the native Web Crypto API (fast, a couple of
// ms). Existing bcrypt hashes ($2…) from the old backend are still verified
// (via a lazily-imported bcryptjs) and transparently upgraded to PBKDF2 on the
// user's next successful login — so nobody has to reset their password.

const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 100_000;

function b64(bytes) {
  let bin = '';
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin);
}
function unb64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return new Uint8Array(bits);
}

// Returns a self-describing string: pbkdf2$<iterations>$<saltB64>$<hashB64>
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(String(password), salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export function isLegacyHash(stored) {
  return typeof stored === 'string' && stored.startsWith('$2');
}
// True when the stored hash isn't our current PBKDF2 format (→ upgrade it).
export function needsRehash(stored) {
  return !(typeof stored === 'string' && stored.startsWith('pbkdf2$'));
}

export async function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.startsWith('pbkdf2$')) {
    const [, iterStr, saltB64, hashB64] = stored.split('$');
    const iterations = Number(iterStr) || PBKDF2_ITERATIONS;
    const salt = unb64(saltB64);
    const expected = unb64(hashB64);
    const got = await pbkdf2(String(password), salt, iterations);
    if (got.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
    return diff === 0;
  }
  // Legacy bcrypt hash — verify with bcryptjs (loaded only when needed).
  if (isLegacyHash(stored)) {
    try {
      const bcrypt = (await import('bcryptjs')).default;
      return bcrypt.compareSync(String(password || ''), stored);
    } catch {
      return false;
    }
  }
  return false;
}
