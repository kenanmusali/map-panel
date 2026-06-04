import { Router } from 'express';
import { getFile, putFile, deleteFile, getBinary, putBinary, deleteBinary } from '../services/github.js';

const router = Router();
const dataPath = () => (process.env.DATA_PATH || 'data').replace(/^\/|\/$/g, '');

const pdfIndexPath     = () => `${dataPath()}/files/index.json`;
const pdfFilePathFiles = (id) => `${dataPath()}/files/pdf/pdf-${id}.pdf`;
const pdfFilePathLegacy  = (id) => `${dataPath()}/pdfs/files/pdf-${id}.pdf`;
const pdfFilePathLegacy2 = (id) => `${dataPath()}/files/files/pdf-${id}.pdf`;

function ensureGroups(idx) {
  let changed = false;
  if (!idx || typeof idx !== 'object') idx = {};
  if (!Array.isArray(idx.pdfs)) { idx.pdfs = []; changed = true; }
  if (!Array.isArray(idx.groups)) { idx.groups = []; changed = true; }

  const orphans = idx.pdfs.filter(p => !p.groupId);
  if (orphans.length && idx.groups.length === 0) {
    idx.groups.push({ id: 1, name: 'Ümumi' });
    changed = true;
  }
  if (orphans.length && idx.groups.length) {
    const gid = idx.groups[0].id;
    idx.pdfs.forEach(p => { if (!p.groupId) { p.groupId = gid; changed = true; } });
  }
  return { idx, changed };
}

async function readIndex() {
  const file = await getFile(pdfIndexPath());
  const { idx } = ensureGroups(file ? file.content : null);
  return idx;
}

async function writeIndex(content, message) {
  return putFile(pdfIndexPath(), content, { message });
}

function nextId(list) {
  const ids = (list || []).map(x => Number(x.id)).filter(Number.isFinite);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

/* =========================== LIST + GROUPS =========================== */
router.get('/', async (_req, res, next) => {
  try {
    const file = await getFile(pdfIndexPath());
    const { idx, changed } = ensureGroups(file ? file.content : null);
    if (changed) await writeIndex(idx, 'Migrate pdfs to groups').catch(() => {});
    res.json({ groups: idx.groups || [], pdfs: idx.pdfs || [] });
  } catch (e) { next(e); }
});

router.post('/group', requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Qrup adi teleb olunur' });
    const idx = await readIndex();
    const group = { id: nextId(idx.groups), name };
    idx.groups = [...idx.groups, group];
    await writeIndex(idx, `Create pdf group ${group.id}`);
    res.status(201).json(group);
  } catch (e) { next(e); }
});

router.put('/group/:gid', requireAdmin, async (req, res, next) => {
  try {
    const gid = Number(req.params.gid);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Qrup adi teleb olunur' });
    const idx = await readIndex();
    const g = idx.groups.find(x => Number(x.id) === gid);
    if (!g) return res.status(404).json({ error: 'Qrup tapilmadi' });
    g.name = name;
    await writeIndex(idx, `Rename pdf group ${gid}`);
    res.json(g);
  } catch (e) { next(e); }
});

router.delete('/group/:gid', requireAdmin, async (req, res, next) => {
  try {
    const gid = Number(req.params.gid);
    const idx = await readIndex();
    const inGroup = idx.pdfs.filter(p => Number(p.groupId) === gid);
    for (const p of inGroup) {
      await deleteBinary(pdfFilePathFiles(p.id), { message: `Delete pdf ${p.id} (group ${gid})` }).catch(() => {});
      await deleteBinary(pdfFilePathLegacy(p.id)).catch(() => {});
      await deleteBinary(pdfFilePathLegacy2(p.id)).catch(() => {});
    }
    idx.pdfs = idx.pdfs.filter(p => Number(p.groupId) !== gid);
    idx.groups = idx.groups.filter(g => Number(g.id) !== gid);
    await writeIndex(idx, `Delete pdf group ${gid}`);
    res.json({ ok: true, deletedPdfs: inGroup.length });
  } catch (e) { next(e); }
});

/* =========================== PDF FILE STREAM =========================== */
router.get('/:id/file', async (req, res, next) => {
  try {
    const id = req.params.id;
    const idx = await readIndex();
    const meta = (idx.pdfs || []).find(p => Number(p.id) === Number(id));
    if (!meta) return res.status(404).json({ error: 'PDF not found' });

    let bin = await getBinary(pdfFilePathFiles(id));
    if (!bin) bin = await getBinary(pdfFilePathLegacy(id));
    if (!bin) bin = await getBinary(pdfFilePathLegacy2(id));
    if (!bin) return res.status(404).json({ error: 'PDF file missing' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(meta.filename || `pdf-${id}.pdf`)}"`);
    res.setHeader('Content-Length', bin.length);
    res.send(bin);
  } catch (e) { next(e); }
});

/* =========================== PDF CRUD =========================== */
// Create — MUST belong to a group
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { title, subtitle, filename, dataBase64, groupId } = req.body || {};
    if (!title || !dataBase64) {
      return res.status(400).json({ error: 'title and dataBase64 are required' });
    }
    const idx = await readIndex();
    const gid = Number(groupId);
    if (!gid || !idx.groups.some(g => Number(g.id) === gid)) {
      return res.status(400).json({ error: 'PDF bir qrupa aid olmalidir' });
    }

    const newId = nextId(idx.pdfs);
    const buf = Buffer.from(dataBase64, 'base64');
    await putBinary(pdfFilePathFiles(newId), buf, { message: `Add pdf ${newId}` });

    const entry = {
      id: newId,
      title: String(title),
      subtitle: subtitle ? String(subtitle) : '',
      filename: filename || `pdf-${newId}.pdf`,
      size: buf.length,
      groupId: gid,
      uploadedAt: new Date().toISOString()
    };
    idx.pdfs = [...idx.pdfs, entry];
    await writeIndex(idx, `Add pdf ${newId} to index`);
    res.status(201).json(entry);
  } catch (e) { next(e); }
});

router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { title, subtitle, filename, dataBase64, groupId } = req.body || {};
    const idx = await readIndex();
    const i = idx.pdfs.findIndex(p => Number(p.id) === id);
    if (i < 0) return res.status(404).json({ error: 'PDF not found' });

    const updated = { ...idx.pdfs[i] };
    if (typeof title === 'string') updated.title = title;
    if (typeof subtitle === 'string') updated.subtitle = subtitle;
    if (typeof filename === 'string' && filename) updated.filename = filename;
    if (groupId !== undefined) {
      const gid = Number(groupId);
      if (idx.groups.some(g => Number(g.id) === gid)) updated.groupId = gid;
    }
    if (dataBase64) {
      const buf = Buffer.from(dataBase64, 'base64');
      await putBinary(pdfFilePathFiles(id), buf, { message: `Replace pdf ${id}` });
      updated.size = buf.length;
      updated.uploadedAt = new Date().toISOString();
    }
    idx.pdfs[i] = updated;
    await writeIndex(idx, `Update pdf ${id}`);
    res.json(updated);
  } catch (e) { next(e); }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const idx = await readIndex();
    idx.pdfs = (idx.pdfs || []).filter(p => Number(p.id) !== id);
    await deleteBinary(pdfFilePathFiles(id), { message: `Delete pdf ${id}` }).catch(() => {});
    await deleteBinary(pdfFilePathLegacy(id)).catch(() => {});
    await deleteBinary(pdfFilePathLegacy2(id)).catch(() => {});
    await writeIndex(idx, `Remove pdf ${id} from index`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
