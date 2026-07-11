// pdfs.js — document (PDF) CRUD + groups + archive + binary streaming (Hono).
import { Hono } from 'hono';
import { requireAuth } from './auth.js';
import { getFile, putFile, deleteFile, getBinary, putBinary, deleteBinary } from '../lib/github.js';
import { tenantBase, tenantOf } from '../lib/tenancy.js';
import { logEvent } from '../lib/rt.js';

const router = new Hono();
router.use('*', requireAuth);

const userOf = (c) => c.get('user');
const tenant = (c) => tenantOf({ user: userOf(c) });
const isAdmin = (c) => { const r = userOf(c)?.role; return r === 'admin' || r === 'superadmin'; };

const pdfIndexPath      = (base) => `${base}/files/index.json`;
const pdfArchivePath    = (base) => `${base}/files/archive.json`;
const pdfFilePathFiles  = (base, id) => `${base}/files/pdf/pdf-${id}.pdf`;
const pdfFilePathLegacy  = (base, id) => `${base}/pdfs/files/pdf-${id}.pdf`;
const pdfFilePathLegacy2 = (base, id) => `${base}/files/files/pdf-${id}.pdf`;

function logAction(c, action, detail, target, targetName) {
  const u = userOf(c);
  logEvent(tenant(c), {
    type: 'admin', action, actor: u?.username, role: u?.role,
    target: target != null ? String(target) : null, targetName: targetName || null, detail: detail || null
  }).catch(() => {});
}

async function readArchive(base) {
  const file = await getFile(pdfArchivePath(base));
  const cc = file ? file.content : null;
  return (cc && Array.isArray(cc.items)) ? cc : { items: [] };
}
const writeArchive = (base, content, message) => putFile(pdfArchivePath(base), content, { message });

function ensureGroups(idx) {
  let changed = false;
  if (!idx || typeof idx !== 'object') idx = {};
  if (!Array.isArray(idx.pdfs)) { idx.pdfs = []; changed = true; }
  if (!Array.isArray(idx.groups)) { idx.groups = []; changed = true; }
  const orphans = idx.pdfs.filter(p => !p.groupId);
  if (orphans.length && idx.groups.length === 0) { idx.groups.push({ id: 1, name: 'Ümumi' }); changed = true; }
  if (orphans.length && idx.groups.length) {
    const gid = idx.groups[0].id;
    idx.pdfs.forEach(p => { if (!p.groupId) { p.groupId = gid; changed = true; } });
  }
  return { idx, changed };
}
async function readIndex(base) {
  const file = await getFile(pdfIndexPath(base));
  return ensureGroups(file ? file.content : null).idx;
}
const writeIndex = (base, content, message) => putFile(pdfIndexPath(base), content, { message });
function nextId(list) {
  const ids = (list || []).map(x => Number(x.id)).filter(Number.isFinite);
  return ids.length ? Math.max(...ids) + 1 : 1;
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ============================== LIST + GROUPS ============================== */
router.get('/', async (c) => {
  const base = tenantBase(tenant(c));
  const file = await getFile(pdfIndexPath(base));
  const { idx, changed } = ensureGroups(file ? file.content : null);
  if (changed) await writeIndex(base, idx, 'Migrate pdfs to groups').catch(() => {});
  const archive = await readArchive(base);
  return c.json({ groups: idx.groups || [], pdfs: idx.pdfs || [], archived: archive.items || [] });
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
  await writeIndex(base, idx, `Create pdf group ${group.id}`);
  logAction(c, 'pdfgroup.create', `PDF qovluğu yaradıldı: ${name}`, group.id, name);
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
  await writeIndex(base, idx, `Rename pdf group ${gid}`);
  logAction(c, 'pdfgroup.rename', `PDF qovluğu adı dəyişdi: ${name}`, gid, name);
  return c.json(g);
});

router.delete('/group/:gid', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403);
  const base = tenantBase(tenant(c));
  const gid = Number(c.req.param('gid'));
  const idx = await readIndex(base);
  const inGroup = idx.pdfs.filter(p => Number(p.groupId) === gid);
  for (const p of inGroup) {
    await deleteBinary(pdfFilePathFiles(base, p.id), { message: `Delete pdf ${p.id} (group ${gid})` }).catch(() => {});
    await deleteBinary(pdfFilePathLegacy(base, p.id)).catch(() => {});
    await deleteBinary(pdfFilePathLegacy2(base, p.id)).catch(() => {});
  }
  idx.pdfs = idx.pdfs.filter(p => Number(p.groupId) !== gid);
  idx.groups = idx.groups.filter(g => Number(g.id) !== gid);
  await writeIndex(base, idx, `Delete pdf group ${gid}`);
  logAction(c, 'pdfgroup.delete', `PDF qovluğu silindi (${inGroup.length} sənəd)`, gid);
  return c.json({ ok: true, deletedPdfs: inGroup.length });
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
  await writeIndex(base, idx, 'Reorder pdf groups');
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
  const groupItems = idx.pdfs.filter(p => Number(p.groupId) === groupId);
  const byId = new Map(groupItems.map(p => [Number(p.id), p]));
  const seq = [];
  for (const id of order) if (byId.has(id)) { seq.push(byId.get(id)); byId.delete(id); }
  for (const p of byId.values()) seq.push(p);
  let k = 0;
  idx.pdfs = idx.pdfs.map(p => Number(p.groupId) === groupId ? seq[k++] : p);
  await writeIndex(base, idx, `Reorder pdfs in group ${groupId}`);
  return c.json({ pdfs: idx.pdfs });
});

/* ================================= ARCHIVE ================================= */
router.post('/:id/archive', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403);
  const base = tenantBase(tenant(c));
  const id = Number(c.req.param('id'));
  const idx = await readIndex(base);
  const entry = idx.pdfs.find(p => Number(p.id) === id);
  if (!entry) return c.json({ error: 'PDF not found' }, 404);
  idx.pdfs = idx.pdfs.filter(p => Number(p.id) !== id);
  const archive = await readArchive(base);
  const group = idx.groups.find(g => Number(g.id) === Number(entry.groupId));
  archive.items = [...archive.items.filter(a => Number(a.id) !== id), { ...entry, groupName: group?.name || '', archivedAt: new Date().toISOString() }];
  await writeArchive(base, archive, `Archive pdf ${id}`);
  await writeIndex(base, idx, `Remove pdf ${id} from index (archived)`);
  logAction(c, 'pdf.archive', `Sənəd arxivləndi: ${entry.title}`, id, entry.title);
  return c.json({ ok: true, archived: archive.items });
});

router.post('/:id/unarchive', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403);
  const base = tenantBase(tenant(c));
  const id = Number(c.req.param('id'));
  const archive = await readArchive(base);
  const entry = archive.items.find(a => Number(a.id) === id);
  if (!entry) return c.json({ error: 'Archived PDF not found' }, 404);
  const idx = await readIndex(base);
  let gid = Number(entry.groupId);
  if (!idx.groups.some(g => Number(g.id) === gid)) {
    if (!idx.groups.length) idx.groups.push({ id: 1, name: 'Ümumi' });
    gid = Number(idx.groups[0].id);
  }
  const { groupName, archivedAt, ...meta } = entry;
  idx.pdfs = [...idx.pdfs, { ...meta, groupId: gid }];
  archive.items = archive.items.filter(a => Number(a.id) !== id);
  await writeIndex(base, idx, `Restore pdf ${id} from archive`);
  await writeArchive(base, archive, `Unarchive pdf ${id}`);
  logAction(c, 'pdf.unarchive', `Sənəd arxivdən qaytarıldı: ${meta.title}`, id, meta.title);
  return c.json({ ok: true });
});

/* ============================== PDF FILE STREAM ============================== */
router.get('/:id/file', async (c) => {
  const base = tenantBase(tenant(c));
  const id = c.req.param('id');
  const idx = await readIndex(base);
  let meta = (idx.pdfs || []).find(p => Number(p.id) === Number(id));
  if (!meta) { const archive = await readArchive(base); meta = archive.items.find(a => Number(a.id) === Number(id)); }
  if (!meta) return c.json({ error: 'PDF not found' }, 404);

  let bin = await getBinary(pdfFilePathFiles(base, id));
  if (!bin) bin = await getBinary(pdfFilePathLegacy(base, id));
  if (!bin) bin = await getBinary(pdfFilePathLegacy2(base, id));
  if (!bin) return c.json({ error: 'PDF file missing' }, 404);

  return new Response(bin, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(meta.filename || `pdf-${id}.pdf`)}"`,
      'Content-Length': String(bin.length)
    }
  });
});

/* ================================= PDF CRUD ================================= */
router.post('/', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403);
  const base = tenantBase(tenant(c));
  const { title, subtitle, filename, dataBase64, groupId } = await c.req.json().catch(() => ({}));
  if (!title || !dataBase64) return c.json({ error: 'title and dataBase64 are required' }, 400);
  const idx = await readIndex(base);
  const gid = Number(groupId);
  if (!gid || !idx.groups.some(g => Number(g.id) === gid)) return c.json({ error: 'PDF bir qrupa aid olmalidir' }, 400);
  const newId = nextId(idx.pdfs);
  const buf = b64ToBytes(dataBase64);
  await putBinary(pdfFilePathFiles(base, newId), buf, { message: `Add pdf ${newId}` });
  const entry = {
    id: newId, title: String(title), subtitle: subtitle ? String(subtitle) : '',
    filename: filename || `pdf-${newId}.pdf`, size: buf.length, groupId: gid, uploadedAt: new Date().toISOString()
  };
  idx.pdfs = [...idx.pdfs, entry];
  await writeIndex(base, idx, `Add pdf ${newId} to index`);
  logAction(c, 'pdf.create', `Sənəd əlavə olundu: ${entry.title}`, newId, entry.title);
  return c.json(entry, 201);
});

router.put('/:id', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403);
  const base = tenantBase(tenant(c));
  const id = Number(c.req.param('id'));
  const { title, subtitle, filename, dataBase64, groupId } = await c.req.json().catch(() => ({}));
  const idx = await readIndex(base);
  const i = idx.pdfs.findIndex(p => Number(p.id) === id);
  if (i < 0) return c.json({ error: 'PDF not found' }, 404);
  const updated = { ...idx.pdfs[i] };
  if (typeof title === 'string') updated.title = title;
  if (typeof subtitle === 'string') updated.subtitle = subtitle;
  if (typeof filename === 'string' && filename) updated.filename = filename;
  if (groupId !== undefined) {
    const gid = Number(groupId);
    if (idx.groups.some(g => Number(g.id) === gid)) updated.groupId = gid;
  }
  if (dataBase64) {
    const buf = b64ToBytes(dataBase64);
    await putBinary(pdfFilePathFiles(base, id), buf, { message: `Replace pdf ${id}` });
    updated.size = buf.length;
    updated.uploadedAt = new Date().toISOString();
  }
  idx.pdfs[i] = updated;
  await writeIndex(base, idx, `Update pdf ${id}`);
  logAction(c, 'pdf.update', `Sənəd yeniləndi: ${updated.title}`, id, updated.title);
  return c.json(updated);
});

router.delete('/:id', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403);
  const base = tenantBase(tenant(c));
  const id = Number(c.req.param('id'));
  const idx = await readIndex(base);
  const entry = idx.pdfs.find(p => Number(p.id) === id);
  idx.pdfs = (idx.pdfs || []).filter(p => Number(p.id) !== id);
  await deleteBinary(pdfFilePathFiles(base, id), { message: `Delete pdf ${id}` }).catch(() => {});
  await deleteBinary(pdfFilePathLegacy(base, id)).catch(() => {});
  await deleteBinary(pdfFilePathLegacy2(base, id)).catch(() => {});
  await writeIndex(base, idx, `Remove pdf ${id} from index`);
  const archive = await readArchive(base);
  if (archive.items.some(a => Number(a.id) === id)) {
    archive.items = archive.items.filter(a => Number(a.id) !== id);
    await writeArchive(base, archive, `Remove pdf ${id} from archive`);
  }
  logAction(c, 'pdf.delete', `Sənəd silindi: ${entry?.title || id}`, id, entry?.title);
  return c.json({ ok: true });
});

export default router;
