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
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    ts: Date.now()
  });
});

// PUBLIC ROUTES
app.use('/api', authRouter);

// PROTECTED ROUTES
app.use('/api/processes', requireAuth, processesRouter);
app.use('/api/pdfs', requireAuth, pdfsRouter);

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