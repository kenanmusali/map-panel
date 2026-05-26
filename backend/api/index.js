// Vercel Serverless entry point
// Uses dynamic import because backend has "type": "module" (ESM)
let app;

module.exports = async (req, res) => {
  if (!app) {
    const mod = await import('../server.js');
    app = mod.default;
  }
  app(req, res);
};