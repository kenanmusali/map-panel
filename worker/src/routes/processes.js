// processes.js — diagrams CRUD + groups + archive (Hono).
import { Hono } from 'hono';
import { requireAuth } from './auth.js';
import { getFile, putFile, deleteFile } from '../lib/github.js';
import { tenantBase, tenantOf } from '../lib/tenancy.js';
import { logEvent, bumpRev, lockStatus } from '../lib/rt.js';

const router = new Hono();
router.use('*', requireAuth);

const userOf = (c) => c.get('user');
const tenant = (c) => tenantOf({ user: userOf(c) });
const isAdmin = (c) => { const r = userOf(c)?.role; return r === 'admin' || r === 'superadmin'; };

const indexPath   = (base) => `${base}/diagrams/index.json`;
const archivePath = (base) => `${base}/diagrams/archive.json`;
const processPath = (base, id) => `${base}/diagrams/processes/process-${id}.json`;

function logAction(c, action, detail, target, targetName) {
  const u = userOf(c);
  logEvent(tenant(c), {
    type: 'admin', action, actor: u?.username, role: u?.role,
    target: target != null ? String(target) : null, targetName: targetName || null, detail: detail || null
  }).catch(() => {});
}

async function readArchive(base) {
  const file = await getFile(archivePath(base));
  const cc = file ? file.content : null;
  return (cc && Array.isArray(cc.items)) ? cc : { items: [] };
}
const writeArchive = (base, content, message) => putFile(archivePath(base), content, { message });

function ensureGroups(idx) {
  let changed = false;
  if (!idx || typeof idx !== 'object') idx = {};
  if (!Array.isArray(idx.processes)) { idx.processes = []; changed = true; }
  if (!Array.isArray(idx.groups)) { idx.groups = []; changed = true; }
  const orphans = idx.processes.filter(p => !p.groupId);
  if (orphans.length && idx.groups.length === 0) { idx.groups.push({ id: 1, name: 'Ümumi' }); changed = true; }
  if (orphans.length && idx.groups.length) {
    const gid = idx.groups[0].id;
    idx.processes.forEach(p => { if (!p.groupId) { p.groupId = gid; changed = true; } });
  }
  return { idx, changed };
}
async function readIndex(base) {
  const file = await getFile(indexPath(base));
  return ensureGroups(file ? file.content : null).idx;
}
const writeIndex = (base, content, message) => putFile(indexPath(base), content, { message });
function nextId(list) {
  const ids = (list || []).map(x => Number(x.id)).filter(Number.isFinite);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

/* ============================== LIST + GROUPS ============================== */
router.get('/', async (c) => {
  const base = tenantBase(tenant(c));
  const file = await getFile(indexPath(base));
  const { idx, changed } = ensureGroups(file ? file.content : null);
  if (changed) await writeIndex(base, idx, 'Migrate diagrams to groups').catch(() => {});
  const archive = await readArchive(base);
  return c.json({ groups: idx.groups || [], processes: idx.processes || [], archived: archive.items || [] });
});

router.post('/group', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403);
  const base = tenantBase(tenant(c));
  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  if (!name) return c.json({ error: 'Qrup adi teleb olunur' }, 400);
  const idx = await readIndex(base);
  const group = { id: nextId(idx.groups), name };
  idx.groups = [...idx.groups, group];
  await writeIndex(base, idx, `Create group ${group.id}`);
  logAction(c, 'group.create', `Qovluq yaradıldı: ${name}`, group.id, name);
  return c.json(group, 201);
});

router.put('/group/:gid', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403);
  const base = tenantBase(tenant(c));
  const gid = Number(c.req.param('gid'));
  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  if (!name) return c.json({ error: 'Qrup adi teleb olunur' }, 400);
  const idx = await readIndex(base);
  const g = idx.groups.find(x => Number(x.id) === gid);
  if (!g) return c.json({ error: 'Qrup tapilmadi' }, 404);
  g.name = name;
  await writeIndex(base, idx, `Rename group ${gid}`);
  logAction(c, 'group.rename', `Qovluq adı dəyişdi: ${name}`, gid, name);
  return c.json(g);
});

router.delete('/group/:gid', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403);
  const base = tenantBase(tenant(c));
  const gid = Number(c.req.param('gid'));
  const idx = await readIndex(base);
  const inGroup = idx.processes.filter(p => Number(p.groupId) === gid);
  for (const p of inGroup) await deleteFile(processPath(base, p.id), { message: `Delete process ${p.id} (group ${gid})` }).catch(() => {});
  idx.processes = idx.processes.filter(p => Number(p.groupId) !== gid);
  idx.groups = idx.groups.filter(g => Number(g.id) !== gid);
  await writeIndex(base, idx, `Delete group ${gid}`);
  logAction(c, 'group.delete', `Qovluq silindi (${inGroup.length} diaqram)`, gid);
  return c.json({ ok: true, deletedDiagrams: inGroup.length });
});

/* ================================= REORDER ================================= */
router.put('/groups/reorder', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403);
  const base = tenantBase(tenant(c));
  const body = await c.req.json().catch(() => ({}));
  const order = Array.isArray(body?.order) ? body.order.map(Number) : null;
  if (!order) return c.json({ error: 'order array required' }, 400);
  const idx = await readIndex(base);
  const byId = new Map(idx.groups.map(g => [Number(g.id), g]));
  const reordered = [];
  for (const id of order) if (byId.has(id)) { reordered.push(byId.get(id)); byId.delete(id); }
  for (const g of byId.values()) reordered.push(g);
  idx.groups = reordered;
  await writeIndex(base, idx, 'Reorder groups');
  return c.json({ groups: idx.groups });
});

router.put('/reorder', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403);
  const base = tenantBase(tenant(c));
  const body = await c.req.json().catch(() => ({}));
  const groupId = Number(body?.groupId);
  const order = Array.isArray(body?.order) ? body.order.map(Number) : null;
  if (!groupId || !order) return c.json({ error: 'groupId and order required' }, 400);
  const idx = await readIndex(base);
  const groupItems = idx.processes.filter(p => Number(p.groupId) === groupId);
  const byId = new Map(groupItems.map(p => [Number(p.id), p]));
  const seq = [];
  for (const id of order) if (byId.has(id)) { seq.push(byId.get(id)); byId.delete(id); }
  for (const p of byId.values()) seq.push(p);
  let k = 0;
  idx.processes = idx.processes.map(p => Number(p.groupId) === groupId ? seq[k++] : p);
  await writeIndex(base, idx, `Reorder diagrams in group ${groupId}`);
  return c.json({ processes: idx.processes });
});

/* ================================= ARCHIVE ================================= */
router.post('/:id/archive', async (c) => {
  const base = tenantBase(tenant(c));
  const id = Number(c.req.param('id'));
  const idx = await readIndex(base);
  const entry = idx.processes.find(p => Number(p.id) === id);
  if (!entry) return c.json({ error: 'Process not found' }, 404);
  idx.processes = idx.processes.filter(p => Number(p.id) !== id);
  const archive = await readArchive(base);
  const group = idx.groups.find(g => Number(g.id) === Number(entry.groupId));
  archive.items = [...archive.items.filter(a => Number(a.id) !== id), { ...entry, groupName: group?.name || '', archivedAt: new Date().toISOString() }];
  await writeArchive(base, archive, `Archive process ${id}`);
  await writeIndex(base, idx, `Remove process ${id} from index (archived)`);
  logAction(c, 'diagram.archive', `Diaqram arxivləndi: ${entry.title}`, id, entry.title);
  return c.json({ ok: true, archived: archive.items });
});

router.post('/:id/unarchive', async (c) => {
  const base = tenantBase(tenant(c));
  const id = Number(c.req.param('id'));
  const archive = await readArchive(base);
  const entry = archive.items.find(a => Number(a.id) === id);
  if (!entry) return c.json({ error: 'Archived process not found' }, 404);
  const idx = await readIndex(base);
  let gid = Number(entry.groupId);
  if (!idx.groups.some(g => Number(g.id) === gid)) {
    if (!idx.groups.length) idx.groups.push({ id: 1, name: 'Ümumi' });
    gid = Number(idx.groups[0].id);
  }
  const { groupName, archivedAt, ...meta } = entry;
  idx.processes = [...idx.processes, { ...meta, groupId: gid }];
  archive.items = archive.items.filter(a => Number(a.id) !== id);
  await writeIndex(base, idx, `Restore process ${id} from archive`);
  await writeArchive(base, archive, `Unarchive process ${id}`);
  logAction(c, 'diagram.unarchive', `Diaqram arxivdən qaytarıldı: ${meta.title}`, id, meta.title);
  return c.json({ ok: true });
});

/* ================================ PROCESSES ================================ */
router.get('/:id', async (c) => {
  const base = tenantBase(tenant(c));
  const file = await getFile(processPath(base, c.req.param('id')));
  if (!file) return c.json({ error: 'Process not found' }, 404);
  return c.json(file.content);
});

router.post('/', async (c) => {
  const base = tenantBase(tenant(c));
  const body = await c.req.json().catch(() => ({}));
  const idx = await readIndex(base);
  const groupId = Number(body.groupId);
  if (!groupId || !idx.groups.some(g => Number(g.id) === groupId)) return c.json({ error: 'Diaqram bir qrupa aid olmalidir' }, 400);
  const newId = body.id || nextId(idx.processes);
  const title = body.title || `Yeni proses ${newId}`;
  const subtitle = body.subtitle ? String(body.subtitle) : '';
  const process = {
    id: newId, title, subtitle,
    width: body.width || 1600, height: body.height || 600,
    lanes: body.lanes || [], nodes: body.nodes || [], edges: body.edges || []
  };
  if (body.theme && typeof body.theme === 'object') process.theme = body.theme;
  await putFile(processPath(base, newId), process, { message: `Create process ${newId}` });
  idx.processes = [...idx.processes, { id: newId, title, subtitle, groupId }];
  await writeIndex(base, idx, `Add process ${newId} to index`);
  await bumpRev(tenant(c), newId).catch(() => {});
  logAction(c, 'diagram.create', `Diaqram yaradıldı: ${title}`, newId, title);
  return c.json(process, 201);
});

router.put('/:id/meta', async (c) => {
  const base = tenantBase(tenant(c));
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const idx = await readIndex(base);
  const entry = idx.processes.find(p => Number(p.id) === id);
  if (!entry) return c.json({ error: 'Process not found' }, 404);
  if (typeof body.title === 'string') entry.title = body.title;
  if (typeof body.subtitle === 'string') entry.subtitle = body.subtitle;
  if (body.groupId !== undefined) {
    const gid = Number(body.groupId);
    if (idx.groups.some(g => Number(g.id) === gid)) entry.groupId = gid;
  }
  await writeIndex(base, idx, `Update meta for process ${id}`);
  const file = await getFile(processPath(base, id));
  if (file) await putFile(processPath(base, id), { ...file.content, title: entry.title, subtitle: entry.subtitle }, { message: `Sync meta for process ${id}` });
  logAction(c, 'diagram.meta', `Diaqram məlumatı yeniləndi: ${entry.title}`, id, entry.title);
  return c.json(entry);
});

router.put('/:id', async (c) => {
  const base = tenantBase(tenant(c));
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') return c.json({ error: 'Process body required' }, 400);

  const lock = await lockStatus(tenant(c), id).catch(() => null);
  if (lock && lock.owner !== userOf(c)?.username) {
    return c.json({ error: `Bu diaqramı hazırda ${lock.owner} redaktə edir`, lock }, 423);
  }
  body.id = Number(id);
  await putFile(processPath(base, id), body, { message: `Update process ${id}` });
  const idx = await readIndex(base);
  const i = idx.processes.findIndex(p => Number(p.id) === Number(id));
  if (i >= 0) {
    let changed = false;
    if (typeof body.title === 'string' && idx.processes[i].title !== body.title) { idx.processes[i].title = body.title; changed = true; }
    if (typeof body.subtitle === 'string' && idx.processes[i].subtitle !== body.subtitle) { idx.processes[i].subtitle = body.subtitle; changed = true; }
    if (changed) await writeIndex(base, idx, `Sync title for process ${id}`);
  }
  const rev = await bumpRev(tenant(c), id).catch(() => 0);
  logAction(c, 'diagram.update', `Diaqram redaktə edildi: ${body.title || id}`, id, body.title);
  return c.json({ ...body, _rev: rev });
});

router.delete('/:id', async (c) => {
  const base = tenantBase(tenant(c));
  const id = c.req.param('id');
  await deleteFile(processPath(base, id), { message: `Delete process ${id}` });
  const idx = await readIndex(base);
  const entry = idx.processes.find(p => Number(p.id) === Number(id));
  idx.processes = idx.processes.filter(p => Number(p.id) !== Number(id));
  await writeIndex(base, idx, `Remove process ${id} from index`);
  const archive = await readArchive(base);
  if (archive.items.some(a => Number(a.id) === Number(id))) {
    archive.items = archive.items.filter(a => Number(a.id) !== Number(id));
    await writeArchive(base, archive, `Remove process ${id} from archive`);
  }
  logAction(c, 'diagram.delete', `Diaqram silindi: ${entry?.title || id}`, id, entry?.title);
  return c.json({ ok: true });
});

export default router;
