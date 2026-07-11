// settings.js — per-department UI text settings (Hono).
import { Hono } from 'hono';
import { requireAuth } from './auth.js';
import { getFile, putFile } from '../lib/github.js';
import { tenantBase, tenantOf } from '../lib/tenancy.js';

const router = new Hono();
router.use('*', requireAuth);

const settingsPath = (base) => `${base}/settings.json`;
const DEFAULTS = {
  org_title: 'ABŞERON LOGİSTİKA MƏRKƏZİ',
  diagrams_page_title: 'İş Axışları',
  pdf_page_title: 'Normativ Sənədlər',
  hub_diagrams_title: 'İş Axışları',
  hub_diagrams_sub: 'Proses xəritələri',
  hub_pdf_title: 'Normativ Sənədlər',
  hub_pdf_sub: 'Prosedurlar, prosesler, əsəsnamələr'
};

const userOf = (c) => c.get('user');
const tenant = (c) => tenantOf({ user: userOf(c) });

function requireAdmin(c) {
  const r = userOf(c)?.role;
  return r === 'admin' || r === 'superadmin';
}
async function readSettings(base) {
  const file = await getFile(settingsPath(base));
  return { ...DEFAULTS, ...(file?.content || {}) };
}

router.get('/', async (c) => c.json(await readSettings(tenantBase(tenant(c)))));

router.put('/', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'Admin only' }, 403);
  const base = tenantBase(tenant(c));
  const current = await readSettings(base);
  const incoming = (await c.req.json().catch(() => ({}))) || {};
  const next = { ...current };
  for (const k of Object.keys(DEFAULTS)) if (typeof incoming[k] === 'string') next[k] = incoming[k];
  await putFile(settingsPath(base), next, { message: 'Update settings' });
  return c.json(next);
});

export default router;
