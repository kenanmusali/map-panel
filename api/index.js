import app from '../backend/server.js';

// Vercel handler.
//
// Why this wrapper exists:
// With legacy `vercel.json` routes (`{ src: "/api/(.*)", dest: "/api/index.js" }`)
// the URL the function receives can be either `/api/login` (preserved) or
// `/login` (stripped), depending on Vercel internal routing.
// We force Express to always see `/api/...` so its routes (mounted at /api) match.
export default function handler(req, res) {
  console.log('[vercel-handler] incoming req.url =', req.url, 'method =', req.method);

  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url === '/' ? '' : req.url);
    console.log('[vercel-handler] normalized req.url =', req.url);
  }

  return app(req, res);
}
