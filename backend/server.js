import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRouter, { requireAuth } from './routes/auth.js';
import processesRouter from './routes/processes.js';
import pdfsRouter from './routes/pdfs.js';

const app = express();
const PORT = process.env.PORT || 4000;

// CORS
const allowed = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (
      !origin ||
      allowed.includes('*') ||
      allowed.includes(origin)
    ) {
      return cb(null, true);
    }

    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: false
}));

// JSON
app.use(express.json({
  limit: '25mb'
}));

// DEBUG
console.log('SERVER LOADED');

// HEALTH
app.get(['/api/health', '/health'], (_req, res) => {
  res.json({
    ok: true,
    ts: Date.now()
  });
});

// PUBLIC ROUTES
app.use(['/api', '/'], authRouter);

// PROTECTED ROUTES
app.use(['/api/processes', '/processes'], requireAuth, processesRouter);
app.use(['/api/pdfs', '/pdfs'], requireAuth, pdfsRouter);

// 404 — show the URL Express actually saw, so we can debug from Vercel logs
app.use((req, res) => {
  console.warn('[404]', req.method, req.url);
  res.status(404).json({
    error: 'Route not found',
    method: req.method,
    url: req.url
  });
});

// ERROR HANDLER
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);

  res.status(err.status || 500).json({
    error: err.message || 'Server error'
  });
});

// LOCAL ONLY
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(
      `Backend running on http://localhost:${PORT}`
    );
  });
}

// VERCEL EXPORT
export default app;