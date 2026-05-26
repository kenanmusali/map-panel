import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter, { requireAuth } from './routes/auth.js';
import processesRouter from './routes/processes.js';
import pdfsRouter from './routes/pdfs.js';

const app = express();
const PORT = process.env.PORT || 4000;

// CORS — supports comma-separated list, or "*" for dev
const allowed = (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes('*') || allowed.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: false
}));

// 25 MB — PDFs are sent as base64 JSON
app.use(express.json({ limit: '25mb' }));

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Public routes
app.use('/api', authRouter);

// Protected routes
app.use('/api/processes', requireAuth, processesRouter);
app.use('/api/pdfs', requireAuth, pdfsRouter);

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Server error' });
});

// Only start HTTP server when running locally (not on Vercel)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`\n  Abşeron backend running on http://localhost:${PORT}`);
    console.log(`  GitHub repo: ${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO} (${process.env.GITHUB_BRANCH})\n`);
  });
}

// Export for Vercel serverless
export default app;