import express from 'express';
import jwt from 'jsonwebtoken';
import { verifyLogin, listDepartments, findUserRaw } from '../services/authstore.js';
import { logEvent, presenceLeave } from '../services/rt.js';

const router = express.Router();
const SECRET = () => process.env.JWT_SECRET || 'absheron-secret';

/* --------------------------------------------------------------- guards */
// Re-validates the token AND the live account on every request. This is what
// makes "deactivate" / "delete" take effect immediately: the very next poll a
// disabled/deleted user's browser makes comes back 401 with a machine-readable
// `code`, and the client force-logs-out. (authstore caches for a few seconds so
// this doesn't hammer GitHub.)
export async function requireAuth(req, res, next) {
  let decoded;
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    decoded = jwt.verify(authHeader.slice(7), SECRET());
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const fresh = await findUserRaw(decoded.username);
    if (!fresh) {
      // Account was deleted → kick out and tell the client to discard local edits.
      presenceLeave(decoded.tenantId || '_super', decoded.username).catch(() => {});
      return res.status(401).json({ error: 'Hesab silinib', code: 'account_deleted' });
    }
    if (fresh.disabled) {
      // Account was deactivated → kick out but let the client keep local drafts.
      presenceLeave(fresh.tenantId || '_super', fresh.username).catch(() => {});
      return res.status(401).json({ error: 'Hesab deaktiv edilib', code: 'account_disabled' });
    }
    // Trust the store for role/tenant so a mid-session change is honoured too.
    req.user = { username: fresh.username, role: fresh.role, tenantId: fresh.tenantId };
    next();
  } catch (e) {
    // If the account store is briefly unreachable, don't lock everyone out —
    // fall back to the (valid) token claims for this request only.
    req.user = { username: decoded.username, role: decoded.role, tenantId: decoded.tenantId };
    next();
  }
}

export function requireAdmin(req, res, next) {
  // super admin can pass admin gates too (but normally uses its own panel)
  if (req.user?.role === 'admin' || req.user?.role === 'superadmin') return next();
  return res.status(403).json({ error: 'Admin only' });
}

export function requireSuperadmin(req, res, next) {
  if (req.user?.role === 'superadmin') return next();
  return res.status(403).json({ error: 'Super admin only' });
}

/* --------------------------------------------------------------- login */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const user = await verifyLogin(username, password);
    if (!user) return res.status(401).json({ error: 'İstifadəçi adı və ya şifrə yanlışdır' });

    let departmentName = null;
    if (user.tenantId) {
      const depts = await listDepartments().catch(() => []);
      departmentName = depts.find(d => d.id === user.tenantId)?.name || null;
    }

    const token = jwt.sign(
      { username: user.username, role: user.role, tenantId: user.tenantId },
      SECRET(),
      { expiresIn: '30d' }
    );

    logEvent(user.tenantId || '_super', {
      type: 'auth', action: 'login',
      actor: user.username, role: user.role,
      detail: 'Sistemə daxil oldu'
    }).catch(() => {});

    res.json({
      token,
      username: user.username,
      displayName: user.displayName || user.username,
      role: user.role,
      tenantId: user.tenantId,
      departmentName
    });
  } catch (e) { next(e); }
});

/* ----------------------------------------------------------------- /me */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    let departmentName = null;
    if (req.user.tenantId) {
      const depts = await listDepartments().catch(() => []);
      departmentName = depts.find(d => d.id === req.user.tenantId)?.name || null;
    }
    res.json({
      username: req.user.username,
      role: req.user.role,
      tenantId: req.user.tenantId,
      departmentName
    });
  } catch (e) { next(e); }
});

export default router;
