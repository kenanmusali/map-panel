import { Router } from 'express';
import { getFile, putFile, deleteFile } from '../services/github.js';

const router = Router();
const dataPath = () => (process.env.DATA_PATH || 'data').replace(/^\/|\/$/g, '');

const indexPath = () => `${dataPath()}/index.json`;
const processPath = id => `${dataPath()}/processes/process-${id}.json`;

async function readIndex() {
  const file = await getFile(indexPath());
  if (!file) return { processes: [] };
  return file.content;
}

async function writeIndex(content, message) {
  return putFile(indexPath(), content, { message });
}

// GET /api/processes — list summaries
router.get('/', async (_req, res, next) => {
  try {
    const idx = await readIndex();
    res.json(idx.processes || []);
  } catch (e) { next(e); }
});

// GET /api/processes/:id — full process
router.get('/:id', async (req, res, next) => {
  try {
    const file = await getFile(processPath(req.params.id));
    if (!file) return res.status(404).json({ error: 'Process not found' });
    res.json(file.content);
  } catch (e) { next(e); }
});

// POST /api/processes — create
// Body: { id?, title, width?, height?, lanes?, nodes?, edges? }
router.post('/', async (req, res, next) => {
  try {
    const idx = await readIndex();
    const existingIds = (idx.processes || []).map(p => Number(p.id)).filter(Number.isFinite);
    const newId = req.body.id || (existingIds.length ? Math.max(...existingIds) + 1 : 1);

    const process = {
      id: newId,
      title: req.body.title || `Yeni proses ${newId}`,
      width: req.body.width || 1600,
      height: req.body.height || 600,
      lanes: req.body.lanes || [],
      nodes: req.body.nodes || [],
      edges: req.body.edges || []
    };

    await putFile(processPath(newId), process, { message: `Create process ${newId}` });

    const nextIdx = {
      ...idx,
      processes: [...(idx.processes || []), { id: newId, title: process.title }]
    };
    await writeIndex(nextIdx, `Add process ${newId} to index`);

    res.status(201).json(process);
  } catch (e) { next(e); }
});

// PUT /api/processes/:id — update full process
router.put('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Process body required' });
    }
    body.id = Number(id);

    await putFile(processPath(id), body, { message: `Update process ${id}` });

    // Sync title in index if changed
    const idx = await readIndex();
    const list = idx.processes || [];
    const i = list.findIndex(p => Number(p.id) === Number(id));
    if (i >= 0 && list[i].title !== body.title) {
      list[i].title = body.title;
      await writeIndex({ ...idx, processes: list }, `Sync title for process ${id}`);
    }

    res.json(body);
  } catch (e) { next(e); }
});

// DELETE /api/processes/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    await deleteFile(processPath(id), { message: `Delete process ${id}` });
    const idx = await readIndex();
    const next = { ...idx, processes: (idx.processes || []).filter(p => Number(p.id) !== Number(id)) };
    await writeIndex(next, `Remove process ${id} from index`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
