import app from '../backend/server.js';

export default function handler(req, res) {
  console.log('[api catchall]', req.method, req.url);
  return app(req, res);
}
