const API_URL = import.meta.env.VITE_API_URL || '';

let token = localStorage.getItem('auth_token') || null;

export function getToken() { return token; }

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('auth_token', t);
  else localStorage.removeItem('auth_token');
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  // 401 → clear stale token
  if (res.status === 401) {
    setToken(null);
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!res.ok) {
    const msg = (data && data.error) || `Request failed: ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  login: (username, password) => request('POST', '/api/login', { username, password }),
  me:    () => request('GET',  '/api/me'),
  // Returns { groups, processes }
  listProcesses: () => request('GET', '/api/processes'),
  getProcess:    (id) => request('GET', `/api/processes/${id}`),
  createProcess: (data) => request('POST', '/api/processes', data),
  updateProcess: (id, data) => request('PUT', `/api/processes/${id}`, data),
  updateProcessMeta: (id, data) => request('PUT', `/api/processes/${id}/meta`, data),
  deleteProcess: (id) => request('DELETE', `/api/processes/${id}`),

  // Diagram groups
  createGroup: (name) => request('POST', '/api/processes/group', { name }),
  renameGroup: (gid, name) => request('PUT', `/api/processes/group/${gid}`, { name }),
  deleteGroup: (gid) => request('DELETE', `/api/processes/group/${gid}`),

  // Settings (editable section titles)
  getSettings: () => request('GET', '/api/settings'),
  updateSettings: (patch) => request('PUT', '/api/settings', patch)
};
