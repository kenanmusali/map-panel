const express = require('express');
const jwt = require('jsonwebtoken');

const USERS = [
  { username: 'admin', password: 'admin123', role: 'admin' },
  { username: 'user', password: 'user123', role: 'viewer' }
];

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body;
  const user = USERS.find(x => x.username === username && x.password === password);
  
  if (!user) {
    return res.status(401).json({ error: 'Bad credentials' });
  }

  const token = jwt.sign(
    { username: user.username, role: user.role },
    process.env.JWT_SECRET || 'absheron-secret'
  );

  res.status(200).json({ token, role: user.role, username: user.username });
};

