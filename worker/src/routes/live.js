// live.js — presence heartbeat, edit-locks, revision polling, activity (Hono).
import { Hono } from 'hono';
import { requireAuth } from './auth.js';
import {
  presenceBeat, presenceLeave, lockAcquire, lockRelease, lockStatus, getAllRevs, logEvent
} from '../lib/rt.js';

const router = new Hono();
router.use('*', requireAuth);

const tid = (c) => c.get('user')?.tenantId || '_super';

router.post('/presence', async (c) => {
  const { view, target, targetName } = await c.req.json().catch(() => ({}));
  const u = c.get('user');
  await presenceBeat(tid(c), u.username, {
    role: u.role,
    view: String(view || '').slice(0, 40),
    target: target != null ? String(target).slice(0, 40) : null,
    targetName: targetName ? String(targetName).slice(0, 120) : null
  });
  return c.json({ ok: true });
});

router.post('/presence/leave', async (c) => {
  await presenceLeave(tid(c), c.get('user').username);
  return c.json({ ok: true });
});

router.post('/lock/:id', async (c) => {
  const u = c.get('user');
  const r = await lockAcquire(tid(c), c.req.param('id'), u.username, u.role);
  return c.json(r, r.ok ? 200 : 423);
});
router.get('/lock/:id', async (c) => c.json({ lock: await lockStatus(tid(c), c.req.param('id')) }));
router.delete('/lock/:id', async (c) => c.json(await lockRelease(tid(c), c.req.param('id'), c.get('user').username)));

router.get('/revs', async (c) => c.json({ revs: await getAllRevs(tid(c)) }));

// Only meaningful admin actions are recorded now (page views / node clicks
// were removed — noise + a fetch per tap).
const ALLOWED = new Set(['edit.start']);
router.post('/track', async (c) => {
  const { action, target, targetName, detail } = await c.req.json().catch(() => ({}));
  if (!ALLOWED.has(action)) return c.json({ ok: true, skipped: true });
  const u = c.get('user');
  await logEvent(u.tenantId || '_super', {
    type: 'user', action, actor: u.username, role: u.role,
    target: target != null ? String(target).slice(0, 60) : null,
    targetName: targetName ? String(targetName).slice(0, 160) : null,
    detail: detail ? String(detail).slice(0, 200) : null
  });
  return c.json({ ok: true });
});

export default router;
