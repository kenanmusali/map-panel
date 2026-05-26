// Vercel catchall API function.
// File path uses [...path] so Vercel's filesystem routing sends ANY request
// matching /api/* to this single handler. Express then dispatches based on req.url.

import app from '../backend/server.js';

export default function handler(req, res) {
  console.log('[api]', req.method, req.url);
  return app(req, res);
}
