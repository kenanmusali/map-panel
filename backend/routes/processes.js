import { Router } from 'express';
import { getFile, putFile, deleteFile } from '../services/github.js';

const router = Router();
const dataPath = () => (process.env.DATA_PATH || 'data').replace(/^\/|\/$/g, '');

const indexPath = () => `${dataPath()}/diagrams/index.json`;
const processPath = id => `${dataPath()}/diagrams/processes/process-${id}.json`;

/* ---------- index helpers + one-time migration to groups ---------- */
function ensureGroups(idx) {
  let changed = false;
  if (!idx || typeof idx !== 'object') idx = {};
  if (!Array.isArray(idx.processes)) { idx.processes = []; changed = true; }
  if (!Array.isArray(idx.groups)) { idx.groups = []; changed = true; }

  const orphans = idx.processes.filter(p => !p.groupId);
  if (orphans.length && idx.groups.length === 0) {
    idx.groups.push({ id: 1, name: 'Ümumi' });
    changed = true;
  }
  if (orphans.length && idx.groups.length) {
    const gid = idx.groups[0].id;
    idx.processes.forEach(p => { if (!p.groupId) { p.groupId = gid; changed = true; } });
  }
  return { idx, changed };
}

async function readIndex() {
  const file = await getFile(indexPath());
  const { idx } = ensureGroups(file ? file.content : null);
  return idx;
}

async function writeIndex(content, message) {
  return putFile(indexPath(), content, { message });
}

function nextId(list) {
  const ids = (list || []).map(x => Number(x.id)).filter(Number.isFinite);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

/* =========================== GROUPS =========================== */
router.get('/', async (_req, res, next) => {
  try {
    const file = await getFile(indexPath());
    const { idx, changed } = ensureGroups(file ? file.content : null);
    if (changed) await writeIndex(idx, 'Migrate diagrams to groups').catch(() => {});
    res.json({ groups: idx.groups || [], processes: idx.processes || [] });
  } catch (e) { next(e); }
});

router.post('/group', requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Qrup adi teleb olunur' });
    const idx = await readIndex();
    const group = { id: nextId(idx.groups), name };
    idx.groups = [...idx.groups, group];
    await writeIndex(idx, `Create group ${group.id}`);
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
    await writeIndex(idx, `Rename group ${gid}`);
    res.json(g);
  } catch (e) { next(e); }
});

router.delete('/group/:gid', requireAdmin, async (req, res, next) => {
  try {
    const gid = Number(req.params.gid);
    const idx = await readIndex();
    const inGroup = idx.processes.filter(p => Number(p.groupId) === gid);
    for (const p of inGroup) {
      await deleteFile(processPath(p.id), { message: `Delete process ${p.id} (group ${gid})` }).catch(() => {});
    }
    idx.processes = idx.processes.filter(p => Number(p.groupId) !== gid);
    idx.groups = idx.groups.filter(g => Number(g.id) !== gid);
    await writeIndex(idx, `Delete group ${gid}`);
    res.json({ ok: true, deletedDiagrams: inGroup.length });
  } catch (e) { next(e); }
});

/* =========================== PROCESSES =========================== */
router.get('/:id', async (req, res, next) => {
  try {
    const file = await getFile(processPath(req.params.id));
    if (!file) return res.status(404).json({ error: 'Process not found' });
    res.json(file.content);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const idx = await readIndex();
    const groupId = Number(req.body.groupId);
    if (!groupId || !idx.groups.some(g => Number(g.id) === groupId)) {
      return res.status(400).json({ error: 'Diaqram bir qrupa aid olmalidir' });
    }
    const newId = req.body.id || nextId(idx.processes);
    const title = req.body.title || `Yeni proses ${newId}`;
    const subtitle = req.body.subtitle ? String(req.body.subtitle) : '';

    const process = {
      id: newId, title, subtitle,
      width: req.body.width || 1600,
      height: req.body.height || 600,
      lanes: req.body.lanes || [],
      nodes: req.body.nodes || [],
      edges: req.body.edges || []
    };
    await putFile(processPath(newId), process, { message: `Create process ${newId}` });
    idx.processes = [...idx.processes, { id: newId, title, subtitle, groupId }];
    await writeIndex(idx, `Add process ${newId} to index`);
    res.status(201).json(process);
  } catch (e) { next(e); }
});

router.put('/:id/meta', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const idx = await readIndex();
    const entry = idx.processes.find(p => Number(p.id) === id);
    if (!entry) return res.status(404).json({ error: 'Process not found' });

    if (typeof req.body.title === 'string') entry.title = req.body.title;
    if (typeof req.body.subtitle === 'string') entry.subtitle = req.body.subtitle;
    if (req.body.groupId !== undefined) {
      const gid = Number(req.body.groupId);
      if (idx.groups.some(g => Number(g.id) === gid)) entry.groupId = gid;
    }
    await writeIndex(idx, `Update meta for process ${id}`);

    const file = await getFile(processPath(id));
    if (file) {
      const body = { ...file.content, title: entry.title, subtitle: entry.subtitle };
      await putFile(processPath(id), body, { message: `Sync meta for process ${id}` });
    }
    res.json(entry);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Process body required' });
    }
    body.id = Number(id);
    await putFile(processPath(id), body, { message: `Update process ${id}` });

    const idx = await readIndex();
    const i = idx.processes.findIndex(p => Number(p.id) === Number(id));
    if (i >= 0) {
      let changed = false;
      if (typeof body.title === 'string' && idx.processes[i].title !== body.title) {
        idx.processes[i].title = body.title; changed = true;
      }
      if (typeof body.subtitle === 'string' && idx.processes[i].subtitle !== body.subtitle) {
        idx.processes[i].subtitle = body.subtitle; changed = true;
      }
      if (changed) await writeIndex(idx, `Sync title for process ${id}`);
    }
    res.json(body);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    await deleteFile(processPath(id), { message: `Delete process ${id}` });
    const idx = await readIndex();
    idx.processes = idx.processes.filter(p => Number(p.id) !== Number(id));
    await writeIndex(idx, `Remove process ${id} from index`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
