# Abşeron Logistika Mərkəzi — Proses Xəritələri

Full-stack web application for managing logistics process maps. Vite + React frontend, Express backend, **GitHub used as JSON storage** (no database needed).

## How it works

- **Frontend** (Vite + React) — login screen, home with process list, diagram viewer, and an **admin panel on the right side** for editing.
- **Backend** (Node.js + Express) — auth + CRUD endpoints that read/write JSON files to a GitHub repo via the GitHub Contents API.
- **Storage** — every process is one JSON file in your GitHub repo (`data/processes/process-{id}.json`). The index of all processes lives in `data/index.json`. All edits commit back to the repo automatically.

## Project structure

```
absheron-app/
├── README.md
├── package.json            ← runs frontend + backend together
├── .gitignore
│
├── backend/                ← Express API
│   ├── package.json
│   ├── .env.example
│   ├── server.js
│   ├── routes/
│   │   ├── auth.js         ← POST /api/login
│   │   └── processes.js    ← CRUD for processes
│   └── services/
│       └── github.js       ← GitHub Contents API wrapper
│
├── frontend/               ← Vite + React
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── .env.example
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── styles.css      ← all styling, CSS variables
│       ├── api/
│       │   └── client.js   ← fetch wrappers
│       └── components/
│           ├── Login.jsx
│           ├── Home.jsx
│           ├── Diagram.jsx
│           ├── DiagramCanvas.jsx
│           ├── NodeModal.jsx
│           ├── AdminPanel.jsx   ← right-side editor
│           ├── Logo.jsx
│           └── icons.jsx
│
└── data/                   ← seed data — push these to your GitHub repo once
    ├── index.json
    └── processes/
        ├── process-1.json
        ├── process-2.json
        └── process-3.json
```

## Setup

### 1. Create a GitHub repo for storage

Create a **new private GitHub repo** (e.g. `absheron-data`). It will hold your process JSON files.

Push the contents of the `data/` folder from this project into that repo so the structure is:

```
your-data-repo/
├── data/
│   ├── index.json
│   └── processes/
│       ├── process-1.json
│       ├── process-2.json
│       └── process-3.json
```

### 2. Generate a GitHub Personal Access Token (PAT)

1. Go to https://github.com/settings/personal-access-tokens/new
2. **Fine-grained token** → only your `absheron-data` repo
3. Permissions: **Contents: Read and write**
4. Copy the token (starts with `github_pat_...`)

### 3. Configure backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```
PORT=4000
GITHUB_TOKEN=github_pat_xxxxxxxxxxxxxxxxxxxx
GITHUB_OWNER=your-github-username
GITHUB_REPO=absheron-data
GITHUB_BRANCH=main
DATA_PATH=data
AUTH_USERNAME=admin
AUTH_PASSWORD=changeme
JWT_SECRET=replace-with-long-random-string
```

Install and run:

```bash
npm install
npm run dev
```

Backend now runs on http://localhost:4000

### 4. Configure frontend

```bash
cd ../frontend
cp .env.example .env
```

`frontend/.env`:

```
VITE_API_URL=http://localhost:4000
```

Install and run:

```bash
npm install
npm run dev
```

Frontend now runs on http://localhost:5173

### 5. Run both at once (optional)

From the project root:

```bash
npm install
npm run dev
```

This uses `concurrently` to spin up both servers together.

## Using the admin panel

1. Log in (`admin` / `changeme` by default — change in `.env`).
2. Open any process from the home page.
3. Click **Edit** in the top-right of the diagram to toggle edit mode.
4. The right-side admin panel appears with three sections:

   **PANELS (Lanes)** — the horizontal rows like "ADY", "MPO", "VPD-nin Əməliyyatlar və koordinasiya şöbəsi"
   - Click `+ Add panel` to create a new lane
   - Each panel shows its label and height; click to edit, trash icon to delete

   **NODES** — three buttons for the three types
   - `+ Pill` (full radius — for start/end nodes)
   - `+ Rectangle` (filled blue — for normal steps)
   - `+ Stroke` (outlined — for sub-steps like 5.1, 7.2)

   When you click one, a new node is added in the currently selected panel. Drag it to reposition.

   **SELECTED ITEM** — when you click a node in edit mode, this section shows:
   - Node ID (auto-generated, or you can override e.g. `5.1`)
   - Type (switch between pill/rect/stroke)
   - Text content
   - General info + Risks (for the click-popup)
   - Delete button

5. Click **Save** in the top bar. The backend commits the updated JSON file to your GitHub repo. That's it — your data is versioned in git.

## API reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST   | `/api/login` | `{ username, password }` → `{ token }` |
| GET    | `/api/processes` | list of `{id, title}` |
| GET    | `/api/processes/:id` | full process object |
| POST   | `/api/processes` | create new process |
| PUT    | `/api/processes/:id` | update full process |
| DELETE | `/api/processes/:id` | delete process |

All endpoints except `/api/login` require `Authorization: Bearer <token>`.

## Data model

```jsonc
// data/index.json
{
  "processes": [
    { "id": 1, "title": "Vaqonların Mərkəzə qəbulu prosesi" },
    { "id": 2, "title": "..." }
  ]
}

// data/processes/process-1.json
{
  "id": 1,
  "title": "Vaqonların Mərkəzə qəbulu prosesi",
  "width": 1820,
  "height": 720,
  "lanes": [
    { "id": "lane-1", "label": "ADY", "y": 20, "h": 200 }
  ],
  "nodes": [
    {
      "id": 1,
      "type": "pill",     // "pill" | "rect" | "stroke"
      "x": 100, "y": 70,
      "w": 230, "h": 110,
      "text": "...",
      "info": { "general": ["..."], "risks": ["..."] }
    }
  ],
  "edges": [
    { "from": 1, "to": 2, "s": "bottom", "e": "top", "dashed": false }
  ]
}
```

## Production deployment

- **Backend** → any Node host (Hostinger VPS, Railway, Fly.io). Set the `.env` vars.
- **Frontend** → run `npm run build` in `frontend/`, deploy `dist/` to any static host (Vercel, Netlify, or behind nginx on the same VPS). Set `VITE_API_URL` to your backend URL before building.

## License

Private — internal use only.
