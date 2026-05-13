import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const okUser = username === process.env.AUTH_USERNAME;
  const okPass = password === process.env.AUTH_PASSWORD;
  if (!okUser || !okPass) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    return res.status(500).json({ error: 'Server misconfigured: JWT_SECRET' });
  }

  const token = jwt.sign({ sub: username }, secret, {
    expiresIn: process.env.TOKEN_EXPIRES_IN || '7d'
  });
  res.json({ token, user: { username } });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { username: payload.sub };
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export default router;
