const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();

app.use(cors({ origin: '*', credentials: false }));
app.use(express.json({ limit: '25mb' }));

const USERS = [
  { username: 'admin', password: 'admin123', role: 'admin' },
  { username: 'user', password: 'user123', role: 'viewer' }
];

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(x => x.username === username && x.password === password);
  
  if (!user) {
    return res.status(401).json({ error: 'Bad credentials' });
  }

  const token = jwt.sign(
    { username: user.username, role: user.role },
    process.env.JWT_SECRET || 'absheron-secret'
  );

  res.json({ token, role: user.role, username: user.username });
});

module.exports = app;
