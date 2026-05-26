import app from '../backend/server.js';

export default function handler(req, res) {
  console.log('[api login]', req.method, req.url);
  return app(req, res);
}
