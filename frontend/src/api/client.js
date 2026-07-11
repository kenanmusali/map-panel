const API_URL = import.meta.env.VITE_API_URL || '';

let token = localStorage.getItem('auth_token') || null;

export function getToken() { return token; }

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('auth_token', t);
  else localStorage.removeItem('auth_token');
}
  
// Persist the identity fields the UI reads from localStorage.
export function storeIdentity(data) {
  if (!data) return;
  if (data.role != null) localStorage.setItem('role', data.role);
  if (data.username != null) localStorage.setItem('username', data.username);
  if (data.tenantId != null) localStorage.setItem('tenantId', data.tenantId);
  else localStorage.removeItem('tenantId');
  if (data.departmentName != null) localStorage.setItem('departmentName', data.departmentName);
  else localStorage.removeItem('departmentName');
  if (data.displayName != null) localStorage.setItem('displayName', data.displayName);
}

export function clearIdentity() {
  ['role', 'username', 'tenantId', 'departmentName', 'displayName'].forEach(k => localStorage.removeItem(k));
}

// App shell registers a callback here. When any request comes back 401 with a
// reason code (account_deleted / account_disabled), we fire it so the user is
// logged out live — no refresh or manual sign-out needed.
let forcedLogout = null;
export function setForcedLogoutHandler(fn) { forcedLogout = fn; }

async function request(method, path, body, { silent = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }

  if (res.status === 401) {
    const code = (data && data.code) || null;
    setToken(null);
    // account_deleted / account_disabled → tell the app to kick the user out now.
    if (code && forcedLogout) { try { forcedLogout(code); } catch { /* ignore */ } }
    const err = new Error((data && data.error) || 'Unauthorized');
    err.status = 401;
    err.code = code;
    throw err;
  }

  if (!res.ok) {
    const msg = (data && data.error) || `Request failed: ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = data;
    if (!silent) { /* callers may handle */ }
    throw err;
  }
  return data;
}

export const api = {
  login: (username, password) => request('POST', '/api/login', { username, password }),
  me:    () => request('GET',  '/api/me'),

  // Diagrams (department-scoped on the server)
  listProcesses: () => request('GET', '/api/processes'),
  getProcess:    (id) => request('GET', `/api/processes/${id}`),
  createProcess: (data) => request('POST', '/api/processes', data),
  updateProcess: (id, data) => request('PUT', `/api/processes/${id}`, data),
  updateProcessMeta: (id, data) => request('PUT', `/api/processes/${id}/meta`, data),
  deleteProcess: (id) => request('DELETE', `/api/processes/${id}`),
  archiveProcess: (id) => request('POST', `/api/processes/${id}/archive`),
  unarchiveProcess: (id) => request('POST', `/api/processes/${id}/unarchive`),

  createGroup: (name) => request('POST', '/api/processes/group', { name }),
  renameGroup: (gid, name) => request('PUT', `/api/processes/group/${gid}`, { name }),
  deleteGroup: (gid) => request('DELETE', `/api/processes/group/${gid}`),
  reorderGroups: (order) => request('PUT', '/api/processes/groups/reorder', { order }),
  reorderProcesses: (groupId, order) => request('PUT', '/api/processes/reorder', { groupId, order }),

  getSettings: () => request('GET', '/api/settings'),
  updateSettings: (patch) => request('PUT', '/api/settings', patch),

  /* -------------------- live: presence / locks / tracking -------------------- */
  presence: (payload) => request('POST', '/api/live/presence', payload, { silent: true }),
  presenceLeave: () => request('POST', '/api/live/presence/leave', {}, { silent: true }),
  track: (payload) => request('POST', '/api/live/track', payload, { silent: true }),
  acquireLock: (id) => request('POST', `/api/live/lock/${id}`),
  lockStatus: (id) => request('GET', `/api/live/lock/${id}`, undefined, { silent: true }),
  releaseLock: (id) => request('DELETE', `/api/live/lock/${id}`, undefined, { silent: true }),
  getRevs: () => request('GET', '/api/live/revs', undefined, { silent: true }),

  /* ------------------------------ super admin ------------------------------ */
  sa: {
    overview: () => request('GET', '/api/superadmin/overview'),
    departments: () => request('GET', '/api/superadmin/departments'),
    createDepartment: (name) => request('POST', '/api/superadmin/departments', { name }),
    renameDepartment: (id, name) => request('PUT', `/api/superadmin/departments/${id}`, { name }),
    deleteDepartment: (id) => request('DELETE', `/api/superadmin/departments/${id}`),
    users: (tenantId) => request('GET', `/api/superadmin/users${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`),
    createUser: (data) => request('POST', '/api/superadmin/users', data),
    updateUser: (username, patch) => request('PUT', `/api/superadmin/users/${encodeURIComponent(username)}`, patch),
    deleteUser: (username) => request('DELETE', `/api/superadmin/users/${encodeURIComponent(username)}`),
    live: () => request('GET', '/api/superadmin/live', undefined, { silent: true }),
    analytics: (params = {}) => {
      const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
      return request('GET', `/api/superadmin/analytics${q ? `?${q}` : ''}`);
    }
  }
};

// Fire-and-forget presence heartbeat helper used by the app shell.
export function beat(view, target, targetName) {
  api.presence({ view, target, targetName }).catch(() => {});
}
export function track(action, target, targetName, detail) {
  api.track({ action, target, targetName, detail }).catch(() => {});
}
