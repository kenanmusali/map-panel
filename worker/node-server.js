// node-server.js — run the exact same Hono app under Node (for `wrangler dev`
// alternatives, local testing, or hosting on Render/Fly instead of Workers).
import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './src/index.js';

const port = Number(process.env.PORT || 4000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Map-Panel worker (Node) on http://localhost:${info.port}  rt=${process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL ? 'redis' : 'github-json/mem'}`);
});
