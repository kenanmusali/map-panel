module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method !== 'POST') {
    res.status(405);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { username, password } = JSON.parse(body);
      
      if (username === 'admin' && password === 'admin123') {
        res.status(200);
        res.end(JSON.stringify({ token: 'fake-jwt-token', role: 'admin', username: 'admin' }));
      } else {
        res.status(401);
        res.end(JSON.stringify({ error: 'Bad credentials' }));
      }
    } catch (e) {
      res.status(400);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
};

