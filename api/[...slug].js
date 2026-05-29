import app from '../backend/server.js';

export default function handler(req, res) {
  console.log('[api catch-all]', req.method, req.url);
  return app(req, res);
}
