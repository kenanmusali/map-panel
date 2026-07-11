// Hand off to the Express app so /api/login uses the real DB-backed login
// (bcrypt + JWT). Previously this returned a hardcoded fake token, which
// would shadow the real login on Vercel — removed.
import app from '../backend/server.js';

export default function handler(req, res) {
  return app(req, res);
}
