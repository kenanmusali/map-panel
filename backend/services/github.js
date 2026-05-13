
import fs from 'fs/promises';
import path from 'path';

const API_BASE = 'https://api.github.com';
const LOCAL_DATA_DIR = path.resolve(process.cwd(), 'data-store');

function cfg() {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH = 'main' } = process.env;
  return { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH };
}

function hasGithubConfig() {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = cfg();
  return !!(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO &&
    GITHUB_OWNER !== 'your-github-username' &&
    GITHUB_REPO !== 'absheron-data');
}

function headers() {
  const { GITHUB_TOKEN } = cfg();
  return {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

function urlFor(p) {
  const { GITHUB_OWNER, GITHUB_REPO } = cfg();
  const encodedPath = p.split('/').map(encodeURIComponent).join('/');
  return `${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodedPath}`;
}

async function localPath(p) {
  const full = path.join(LOCAL_DATA_DIR, p);
  await fs.mkdir(path.dirname(full), { recursive: true });
  return full;
}

async function localGet(p) {
  try {
    const full = await localPath(p);
    const text = await fs.readFile(full, 'utf8');
    return {
      content: JSON.parse(text),
      sha: 'local'
    };
  } catch {
    return null;
  }
}

async function localPut(p, contentObject) {
  const full = await localPath(p);
  await fs.writeFile(full, JSON.stringify(contentObject, null, 2));
  return { ok: true };
}

async function localDelete(p) {
  try {
    const full = await localPath(p);
    await fs.unlink(full);
    return true;
  } catch {
    return false;
  }
}

export async function getFile(p) {
  if (!hasGithubConfig()) return localGet(p);

  try {
    const { GITHUB_BRANCH } = cfg();
    const res = await fetch(`${urlFor(p)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, {
      headers: headers()
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    const text = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');

    return {
      content: JSON.parse(text),
      sha: data.sha
    };
  } catch {
    return localGet(p);
  }
}

export async function putFile(p, contentObject, { message, sha } = {}) {
  if (!hasGithubConfig()) return localPut(p, contentObject);

  try {
    const { GITHUB_BRANCH } = cfg();

    if (sha === undefined) {
      const current = await getFile(p);
      sha = current?.sha;
    }

    const content = Buffer.from(
      JSON.stringify(contentObject, null, 2) + '\n',
      'utf8'
    ).toString('base64');

    const body = {
      message: message || `Update ${p}`,
      content,
      branch: GITHUB_BRANCH
    };

    if (sha && sha !== 'local') body.sha = sha;

    const res = await fetch(urlFor(p), {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(await res.text());

    return res.json();
  } catch {
    return localPut(p, contentObject);
  }
}

export async function deleteFile(p) {
  if (!hasGithubConfig()) return localDelete(p);
  return localDelete(p);
}
