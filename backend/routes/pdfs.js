import { Router } from 'express';
import { getFile, putFile, deleteFile, getBinary, putBinary, deleteBinary } from '../services/github.js';

const router = Router();
const dataPath = () => (process.env.DATA_PATH || 'data').replace(/^\/|\/$/g, '');

const pdfIndexPathLegacy = () => `${dataPath()}/pdfs/index.json`;
const pdfIndexPathFiles = () => `${dataPath()}/files/index.json`;
const pdfFilePathLegacy  = (id) => `${dataPath()}/pdfs/files/pdf-${id}.pdf`;
const pdfFilePathLegacy2 = (id) => `${dataPath()}/files/files/pdf-${id}.pdf`;
const pdfFilePathFiles   = (id) => `${dataPath()}/files/pdf/pdf-${id}.pdf`;

async function readIndex() {
  // Try legacy `data/pdfs/index.json` first, then `data/files/index.json`
  let file = await getFile(pdfIndexPathLegacy());
  if (file) return file.content;
  file = await getFile(pdfIndexPathFiles());
  if (file) return file.content;
  return { pdfs: [] };
}

async function writeIndex(content, message) {
  // Prefer writing to `data/files/index.json` (where PDFs are stored in this project)
  return putFile(pdfIndexPathFiles(), content, { message });
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// GET /api/pdfs — list
router.get('/', async (_req, res, next) => {
  try {
    const idx = await readIndex();
    res.json(idx.pdfs || []);
  } catch (e) { next(e); }
});

// GET /api/pdfs/:id/file — stream the PDF binary
router.get('/:id/file', async (req, res, next) => {
  try {
    const id = req.params.id;
    const idx = await readIndex();
    const meta = (idx.pdfs || []).find(p => Number(p.id) === Number(id));
    if (!meta) return res.status(404).json({ error: 'PDF not found' });

    // Try new path first, then legacy paths
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

// POST /api/pdfs — create (admin)
// Body: { title, filename, dataBase64 }
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { title, filename, dataBase64 } = req.body || {};
    if (!title || !dataBase64) {
      return res.status(400).json({ error: 'title and dataBase64 are required' });
    }

    const idx = await readIndex();
    const existingIds = (idx.pdfs || []).map(p => Number(p.id)).filter(Number.isFinite);
    const newId = existingIds.length ? Math.max(...existingIds) + 1 : 1;

    const buf = Buffer.from(dataBase64, 'base64');
    // Write binaries into data/files by default
    await putBinary(pdfFilePathFiles(newId), buf, { message: `Add pdf ${newId}` });

    const entry = {
      id: newId,
      title: String(title),
      filename: filename || `pdf-${newId}.pdf`,
      size: buf.length,
      uploadedAt: new Date().toISOString()
    };

    const nextIdx = { ...idx, pdfs: [...(idx.pdfs || []), entry] };
    await writeIndex(nextIdx, `Add pdf ${newId} to index`);

    res.status(201).json(entry);
  } catch (e) { next(e); }
});

// PUT /api/pdfs/:id — update title and optionally replace file (admin)
// Body: { title?, filename?, dataBase64? }
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { title, filename, dataBase64 } = req.body || {};

    const idx = await readIndex();
    const list = idx.pdfs || [];
    const i = list.findIndex(p => Number(p.id) === id);
    if (i < 0) return res.status(404).json({ error: 'PDF not found' });

    const updated = { ...list[i] };
    if (typeof title === 'string') updated.title = title;
    if (typeof filename === 'string' && filename) updated.filename = filename;

    if (dataBase64) {
      const buf = Buffer.from(dataBase64, 'base64');
      // Replace binary in files path
      await putBinary(pdfFilePathFiles(id), buf, { message: `Replace pdf ${id}` });
      updated.size = buf.length;
      updated.uploadedAt = new Date().toISOString();
    }

    list[i] = updated;
    await writeIndex({ ...idx, pdfs: list }, `Update pdf ${id}`);
    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE /api/pdfs/:id (admin)
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const idx = await readIndex();
    const list = (idx.pdfs || []).filter(p => Number(p.id) !== id);
    // Delete from new path and any legacy paths
    await deleteBinary(pdfFilePathFiles(id), { message: `Delete pdf ${id}` }).catch(() => {});
    await deleteBinary(pdfFilePathLegacy(id), { message: `Delete pdf ${id}` }).catch(() => {});
    await deleteBinary(pdfFilePathLegacy2(id), { message: `Delete pdf ${id}` }).catch(() => {});
    await writeIndex({ ...idx, pdfs: list }, `Remove pdf ${id} from index`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
