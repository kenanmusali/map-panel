// auth.js — login, /me, and the auth middleware (Hono).
// requireAuth re-validates the account on every request so deactivating or
// deleting a user takes effect live (their next poll returns 401 + a `code`).
import { Hono } from 'hono';
import { sign, verify } from '../lib/jwt.js';
import { verifyLogin, listDepartments, findUserRaw } from '../lib/authstore.js';
import { logEvent, presenceLeave } from '../lib/rt.js';

const SECRET = () => (typeof process !== 'undefined' && process.env.JWT_SECRET) || 'absheron-secret';

export async function requireAuth(c, next) {
  const authHeader = c.req.header('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);

  let decoded;
  try { decoded = await verify(authHeader.slice(7), SECRET()); }
  catch { return c.json({ error: 'Invalid token' }, 401); }

  try {
    const fresh = await findUserRaw(decoded.username);
    if (!fresh) {
      presenceLeave(decoded.tenantId || '_super', decoded.username).catch(() => {});
      return c.json({ error: 'Hesab silinib', code: 'account_deleted' }, 401);
    }
    if (fresh.disabled) {
      presenceLeave(fresh.tenantId || '_super', fresh.username).catch(() => {});
      return c.json({ error: 'Hesab deaktiv edilib', code: 'account_disabled' }, 401);
    }
    c.set('user', { username: fresh.username, role: fresh.role, tenantId: fresh.tenantId });
  } catch {
    // Account store briefly unreachable — trust the (valid) token for this request.
    c.set('user', { username: decoded.username, role: decoded.role, tenantId: decoded.tenantId });
  }
  await next();
}

export function requireSuperadmin(c, next) {
  const u = c.get('user');
  if (u?.role !== 'superadmin') return c.json({ error: 'Super admin only' }, 403);
  return next();
}

const router = new Hono();

router.post('/login', async (c) => {
  const { username, password } = await c.req.json().catch(() => ({}));
  const user = await verifyLogin(username, password);
  if (!user) return c.json({ error: 'İstifadəçi adı və ya şifrə yanlışdır' }, 401);

  let departmentName = null;
  if (user.tenantId) {
    const depts = await listDepartments().catch(() => []);
    departmentName = depts.find(d => d.id === user.tenantId)?.name || null;
  }
  const token = await sign(
    { username: user.username, role: user.role, tenantId: user.tenantId },
    SECRET(), { expiresInSec: 60 * 60 * 24 * 30 }
  );
  logEvent(user.tenantId || '_super', {
    type: 'auth', action: 'login', actor: user.username, role: user.role, detail: 'Sistemə daxil oldu'
  }).catch(() => {});

  return c.json({
    token, username: user.username, displayName: user.displayName || user.username,
    role: user.role, tenantId: user.tenantId, departmentName
  });
});

router.get('/me', requireAuth, async (c) => {
  const u = c.get('user');
  let departmentName = null;
  if (u.tenantId) {
    const depts = await listDepartments().catch(() => []);
    departmentName = depts.find(d => d.id === u.tenantId)?.name || null;
  }
  return c.json({ username: u.username, role: u.role, tenantId: u.tenantId, departmentName });
});

export default router;
