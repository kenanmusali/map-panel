// superadmin.js — global control panel API (Hono). Super admin only.
import { Hono } from 'hono';
import { requireAuth, requireSuperadmin } from './auth.js';
import {
  listDepartments, createDepartment, renameDepartment, deleteDepartment,
  listUsers, createUser, updateUser, deleteUser
} from '../lib/authstore.js';
import { presenceListAll, lockList, readEventsMany, logEvent, rtBackend } from '../lib/rt.js';

const router = new Hono();
router.use('*', requireAuth, requireSuperadmin);

const SUPER_BUCKET = '_super';
const actor = (c) => c.get('user')?.username;

async function allTenantIds() {
  const depts = await listDepartments();
  return [...depts.map(d => d.id), SUPER_BUCKET];
}
function audit(who, action, detail, tenantId = SUPER_BUCKET) {
  logEvent(tenantId, { type: 'superadmin', action, actor: who, role: 'superadmin', detail }).catch(() => {});
}

/* -------------------------------------------------------------- overview */
router.get('/overview', async (c) => {
  const depts = await listDepartments();
  const users = await listUsers();
  const online = await presenceListAll(await allTenantIds());
  return c.json({
    backend: rtBackend(),
    departments: depts.length,
    users: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    viewers: users.filter(u => u.role === 'viewer').length,
    onlineNow: online.length
  });
});

/* ----------------------------------------------------------- departments */
router.get('/departments', async (c) => {
  const depts = await listDepartments();
  const users = await listUsers();
  return c.json(depts.map(d => ({
    ...d,
    userCount: users.filter(u => u.tenantId === d.id).length,
    adminCount: users.filter(u => u.tenantId === d.id && u.role === 'admin').length
  })));
});
router.post('/departments', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const dept = await createDepartment(body?.name);
  audit(actor(c), 'department.create', `Şöbə yaradıldı: ${dept.name}`);
  return c.json(dept, 201);
});
router.put('/departments/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const dept = await renameDepartment(c.req.param('id'), body?.name);
  audit(actor(c), 'department.rename', `Şöbə adı dəyişdi: ${dept.name}`);
  return c.json(dept);
});
router.delete('/departments/:id', async (c) => {
  await deleteDepartment(c.req.param('id'));
  audit(actor(c), 'department.delete', `Şöbə silindi: ${c.req.param('id')}`);
  return c.json({ ok: true });
});

/* ----------------------------------------------------------------- users */
router.get('/users', async (c) => {
  const tenantId = c.req.query('tenantId') || undefined;
  return c.json(await listUsers(tenantId));
});
router.post('/users', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const user = await createUser({ ...body, createdBy: actor(c) });
  audit(actor(c), 'user.create', `${user.role === 'admin' ? 'Admin' : 'İstifadəçi'} yaradıldı: ${user.username}`, user.tenantId);
  return c.json(user, 201);
});
router.put('/users/:username', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) || {};
  const user = await updateUser(c.req.param('username'), body);
  const what = [];
  if (body?.password) what.push('şifrə');
  if (body?.role) what.push('rol=' + body.role);
  if (typeof body?.disabled === 'boolean') what.push(body.disabled ? 'deaktiv' : 'aktiv');
  if (body?.tenantId !== undefined) what.push('şöbə');
  audit(actor(c), 'user.update', `${user.username} yeniləndi (${what.join(', ') || 'məlumat'})`, user.tenantId);
  return c.json(user);
});
router.delete('/users/:username', async (c) => {
  await deleteUser(c.req.param('username'));
  audit(actor(c), 'user.delete', `İstifadəçi silindi: ${c.req.param('username')}`);
  return c.json({ ok: true });
});

/* ------------------------------------------------------------- live view */
router.get('/live', async (c) => {
  const ids = await allTenantIds();
  const [people, depts] = await Promise.all([presenceListAll(ids), listDepartments()]);
  const nameOf = Object.fromEntries(depts.map(d => [d.id, d.name]));
  const lockLists = await Promise.all(depts.map(d => lockList(d.id).catch(() => [])));
  const locks = [];
  depts.forEach((d, i) => lockLists[i].forEach(l => locks.push({ ...l, tenantId: d.id, departmentName: d.name })));
  return c.json({
    people: people.map(p => ({ ...p, departmentName: p.tenantId === SUPER_BUCKET ? '—' : (nameOf[p.tenantId] || p.tenantId) })),
    locks
  });
});

/* ------------------------------------------------------------- analytics */
router.get('/analytics', async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 500, 2000);
  const tenantId = c.req.query('tenantId');
  const ids = tenantId ? [tenantId] : await allTenantIds();
  let events = await readEventsMany(ids, { limit: 2000 });
  const actorQ = c.req.query('actor');
  const typeQ = c.req.query('type');
  const actionQ = c.req.query('action');
  const sinceQ = c.req.query('since');
  if (actorQ) events = events.filter(e => e.actor === actorQ);
  if (typeQ) events = events.filter(e => e.type === typeQ);
  if (actionQ) events = events.filter(e => (e.action || '').startsWith(actionQ));
  if (sinceQ) { const t = Number(sinceQ); events = events.filter(e => e.ts >= t); }
  return c.json({ events: events.slice(0, limit) });
});

export default router;
