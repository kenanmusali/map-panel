// index.js — Cloudflare Worker entry (Hono).
// Mounts the same API surface the old Express backend exposed, under /api.
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import authRoutes from './routes/auth.js';
import processes from './routes/processes.js';
import pdfs from './routes/pdfs.js';
import settings from './routes/settings.js';
import live from './routes/live.js';
import superadmin from './routes/superadmin.js';
import { rtBackend } from './lib/rt.js';
import { diagnose } from './lib/github.js';

const app = new Hono();

// Make Cloudflare bindings/vars readable through process.env for the shared
// service modules (works with or without the nodejs_compat auto-populate).
app.use('*', async (c, next) => {
  if (typeof process !== 'undefined' && process.env && c.env) {
    for (const k of Object.keys(c.env)) {
      const v = c.env[k];
      if (typeof v === 'string' && process.env[k] === undefined) process.env[k] = v;
    }
  }
  await next();
});

// CORS — set CORS_ORIGIN to a comma-separated list of your Pages origins, or *.
app.use('*', cors({
  origin: (origin) => {
    const raw = (typeof process !== 'undefined' && process.env.CORS_ORIGIN) || '*';
    const allowed = raw.split(',').map(s => s.trim());
    if (!origin || allowed.includes('*') || allowed.includes(origin)) return origin || '*';
    return ''; // not allowed
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

// Health + debug (public, no secrets)
app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now(), rt: rtBackend() }));
app.get('/api/debug', async (c) => {
  try { return c.json({ ...(await diagnose()), rt: rtBackend() }); }
  catch (e) { return c.json({ error: e.message }, 500); }
});

// Public + protected routes (each protected router applies requireAuth itself)
app.route('/api', authRoutes);            // /api/login, /api/me
app.route('/api/processes', processes);
app.route('/api/pdfs', pdfs);
app.route('/api/settings', settings);
app.route('/api/live', live);
app.route('/api/superadmin', superadmin);

app.notFound((c) => c.json({ error: 'Route not found', method: c.req.method, url: c.req.path }, 404));
app.onError((err, c) => {
  console.error('[ERROR]', err);
  const status = err.status || 500;
  const payload = { error: err.message || 'Server error' };
  if (err.lock) payload.lock = err.lock;
  return c.json(payload, status);
});

export default app;
