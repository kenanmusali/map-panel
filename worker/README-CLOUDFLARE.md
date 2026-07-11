# Map-Panel on Cloudflare

The backend has been ported from Express (which **cannot** run on Cloudflare) to
a **Cloudflare Worker** using [Hono](https://hono.dev). Same API, same `/api/*`
paths, same GitHub storage. The frontend goes on **Cloudflare Pages**.

```
frontend/  ->  Cloudflare Pages   (static Vite build)
worker/    ->  Cloudflare Worker  (this folder — the API)
GitHub     ->  data store         ("store on github, same old")
Upstash    ->  live presence/locks (recommended — see below)
```

What changed vs. the Node/Express backend, and why:

| Node/Express thing | Worker replacement | Reason |
|---|---|---|
| `express` | `hono` | Workers can't run Express |
| `jsonwebtoken` | Web Crypto HS256 (`src/lib/jwt.js`) | no Node crypto/streams on Workers |
| `bcryptjs` hashing | native **PBKDF2** (`src/lib/password.js`) | bcrypt is too CPU-heavy for Workers free tier |
| filesystem mirror | in-memory + GitHub only | Workers have no disk |

Existing users keep their passwords: old **bcrypt** hashes are still accepted and
are silently re-hashed to PBKDF2 on the user's next successful login.

---

## 1. Deploy the Worker (API)

```bash
cd worker
npm install
npx wrangler login
```

Set your secrets (these are NOT stored in wrangler.toml):

```bash
npx wrangler secret put JWT_SECRET          # any long random string
npx wrangler secret put GITHUB_TOKEN         # GitHub PAT with repo contents:write
# Recommended for live presence/locks (Upstash Redis REST):
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

Check / edit the non-secret vars in `wrangler.toml` (`GITHUB_OWNER`, `GITHUB_REPO`,
`GITHUB_BRANCH`, `DATA_PATH`, `CORS_ORIGIN`). Then:

```bash
npx wrangler deploy
```

You'll get a URL like `https://map-panel-api.<your-subdomain>.workers.dev`.
Verify: open `…/api/health` → `{ "ok": true, "rt": "redis" }`.

### CPU / plan note
`wrangler.toml` sets `[limits] cpu_ms = 200` so the occasional legacy-bcrypt
login can run. That block needs the **Workers Paid ($5/mo)** plan.
On the **free** plan, delete the `[limits]` block — new PBKDF2 logins are fast
and fine, but the *first* login of an old bcrypt user might hit the 10 ms cap.
Easiest free-plan path: log every existing user in once (upgrades them to
PBKDF2), or reset their passwords from the Super Admin panel.

### Live features (presence / locks)
Set the Upstash secrets above. Without them the Worker falls back to an
in-memory store that is **per-isolate** (not shared) — fine for a quick demo,
not for real multi-user live presence. `/api/health` shows `"rt":"redis"` when
Upstash is active, `"github-json"` otherwise.

---

## 2. Deploy the frontend (Cloudflare Pages)

Create a Pages project from the same repo:

- **Framework preset:** Vite
- **Root directory:** `frontend`
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Environment variable:** `VITE_API_URL = https://map-panel-api.<your-subdomain>.workers.dev`
  (the Worker origin, no trailing slash, no `/api`)

After the first Pages deploy, set the Worker's `CORS_ORIGIN` to the Pages URL and
redeploy the Worker:

```toml
# wrangler.toml
CORS_ORIGIN = "https://map-panel.pages.dev"   # comma-separate multiple origins
```
```bash
npx wrangler deploy
```

---

## Local development / testing

Run the Worker locally with Wrangler:
```bash
cd worker
cp .dev.vars.example .dev.vars   # fill in secrets
npx wrangler dev
```

Or run the identical app under plain Node (also how you'd host it on
Render/Fly.io if you ever want to):
```bash
cd worker
npm install
node node-server.js      # reads .env
```

With no GitHub/Upstash configured it runs on an in-memory store so you can smoke
test (`admin`/`admin123`, `user`/`user123`, `superadmin`/`super123`).
