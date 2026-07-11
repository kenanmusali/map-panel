// SuperAdmin.jsx — global control panel. Analytics + control only; it never
// touches diagrams or PDFs. Four tabs: Canlı (live), Şöbələr (departments),
// İstifadəçilər (users), Tarixçə (history/analytics).
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity, Building2, Users, History, LogOut, RefreshCw, Plus, Trash2,
  Pencil, X, Shield, KeyRound, Power, Circle, Search, Lock
} from 'lucide-react';
import { LogoFull } from './Logo.jsx';
import { api, setToken, clearIdentity } from '../api/client.js';

/* ------------------------------------------------------------- helpers */
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'indi';
  if (s < 60) return `${s} san əvvəl`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dəq əvvəl`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat əvvəl`;
  return `${Math.floor(h / 24)} gün əvvəl`;
}
function fmtDateTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const roleLabel = (r) => r === 'admin' ? 'Admin' : r === 'superadmin' ? 'Super admin' : 'İstifadəçi';
const viewLabel = (v) => ({
  hub: 'Ana səhifə', diagrams: 'Diaqramlar', pdfs: 'Sənədlər',
  diagram: 'Diaqram', superadmin: 'İdarəetmə'
}[v] || v || '—');

const ACTION_TEXT = {
  'login': 'Sistemə giriş',
  'diagram.create': 'Diaqram yaratdı', 'diagram.update': 'Diaqram redaktə etdi',
  'diagram.delete': 'Diaqram sildi', 'diagram.archive': 'Diaqramı arxivlədi',
  'diagram.unarchive': 'Arxivdən qaytardı', 'diagram.meta': 'Diaqram məlumatını dəyişdi',
  'edit.start': 'Redaktəyə başladı',
  'group.create': 'Qovluq yaratdı', 'group.rename': 'Qovluq adını dəyişdi', 'group.delete': 'Qovluq sildi',
  'pdf.create': 'Sənəd əlavə etdi', 'pdf.update': 'Sənəd yenilədi', 'pdf.delete': 'Sənəd sildi',
  'pdf.archive': 'Sənədi arxivlədi', 'pdf.unarchive': 'Sənədi qaytardı',
  'pdfgroup.create': 'PDF qovluğu yaratdı', 'pdfgroup.delete': 'PDF qovluğu sildi',
  'view.diagram': 'Diaqrama baxdı', 'view.pdf': 'Sənədə baxdı', 'view.diagrams': 'Diaqramlar bölməsi',
  'view.pdfs': 'Sənədlər bölməsi', 'view.hub': 'Ana səhifə', 'click.node': 'Node-a kliklədi',
  'department.create': 'Şöbə yaratdı', 'department.rename': 'Şöbə adını dəyişdi', 'department.delete': 'Şöbə sildi',
  'user.create': 'İstifadəçi yaratdı', 'user.update': 'İstifadəçini yenilədi', 'user.delete': 'İstifadəçi sildi'
};

/* =================================================================== ROOT */
export default function SuperAdmin({ onLogout }) {
  const [tab, setTab] = useState('live');
  const [overview, setOverview] = useState(null);
  const [departments, setDepartments] = useState([]);

  const loadOverview = useCallback(() => {
    api.sa.overview().then(setOverview).catch(() => {});
  }, []);
  const loadDepartments = useCallback(() => {
    api.sa.departments().then(setDepartments).catch(() => {});
  }, []);

  useEffect(() => { loadOverview(); loadDepartments(); }, [loadOverview, loadDepartments]);

  function logout() {
    api.presenceLeave();
    setToken(null);
    clearIdentity();
    onLogout();
  }

  const TABS = [
    { id: 'live', label: 'Canlı', icon: <Activity size={16} /> },
    { id: 'departments', label: 'Şöbələr', icon: <Building2 size={16} /> },
    { id: 'users', label: 'İstifadəçilər', icon: <Users size={16} /> },
    { id: 'history', label: 'Tarixçə', icon: <History size={16} /> }
  ];

  return (
    <div className="sa-root">
      <header className="sa-topbar">
        <div className="sa-brand">
          <LogoFull size="small" />
          <div>
            <div className="sa-title"><Shield size={15} /> Super Admin</div>
            <div className="sa-sub">İdarəetmə və analitika paneli</div>
          </div>
        </div>
        <div className="sa-top-actions">
          {overview && (
            <span className={`sa-badge ${overview.backend === 'redis' ? 'ok' : 'warn'}`}
              title={overview.backend === 'redis' ? 'Canlı rejim: Redis / Vercel KV' : 'Yaxın-canlı rejim (KV əlavə edin)'}>
              {overview.backend === 'redis' ? 'Canlı' : 'Yaxın-canlı'}
            </span>
          )}
          <button className="logout-btn" onClick={logout}><LogOut size={16} /><span>Çıxış</span></button>
        </div>
      </header>

      {overview && (
        <div className="sa-stats">
          <Stat label="Şöbələr" value={overview.departments} />
          <Stat label="İstifadəçilər" value={overview.users} />
          <Stat label="Adminlər" value={overview.admins} />
          <Stat label="İndi onlayn" value={overview.onlineNow} live />
        </div>
      )}

      <nav className="sa-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`sa-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="sa-main">
        {tab === 'live' && <LiveView departments={departments} onTick={loadOverview} />}
        {tab === 'departments' && <DepartmentsView departments={departments} reload={() => { loadDepartments(); loadOverview(); }} />}
        {tab === 'users' && <UsersView departments={departments} reload={loadOverview} />}
        {tab === 'history' && <HistoryView departments={departments} />}
      </main>
    </div>
  );
}

function Stat({ label, value, live }) {
  return (
    <div className="sa-stat">
      <div className="sa-stat-val">{value}{live && <span className="sa-dot-live" />}</div>
      <div className="sa-stat-label">{label}</div>
    </div>
  );
}

/* =================================================================== LIVE */
function LiveView({ departments, onTick }) {
  const [data, setData] = useState({ people: [], locks: [] });
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  const load = useCallback(() => {
    api.sa.live().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    onTick && onTick();
  }, [onTick]);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 3000);
    return () => clearInterval(timer.current);
  }, [load]);

  const people = data.people || [];
  const locks = data.locks || [];

  return (
    <div className="sa-live">
      <div className="sa-section-head">
        <h3><span className="sa-dot-live" /> İndi onlayn ({people.length})</h3>
        <span className="sa-hint">3 saniyədən bir yenilənir</span>
      </div>

      {loading ? <div className="sa-empty">Yüklənir…</div> :
        people.length === 0 ? <div className="sa-empty">Hazırda heç kim onlayn deyil</div> : (
          <div className="sa-people">
            {people.map(p => (
              <div key={`${p.tenantId}:${p.username}`} className="sa-person">
                <div className="sa-person-top">
                  <span className="sa-avatar">{(p.username || '?')[0].toUpperCase()}</span>
                  <div className="sa-person-id">
                    <div className="sa-person-name">{p.username}
                      <span className={`sa-role-chip ${p.role}`}>{roleLabel(p.role)}</span>
                    </div>
                    <div className="sa-person-dept">{p.departmentName || '—'}</div>
                  </div>
                  <span className="sa-online-dot" title={`son siqnal: ${timeAgo(p.ts)}`} />
                </div>
                <div className="sa-person-activity">
                  <span className="sa-act-view">{viewLabel(p.view)}</span>
                  {p.targetName && <span className="sa-act-target">→ {p.targetName}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

      <div className="sa-section-head" style={{ marginTop: 22 }}>
        <h3><Lock size={15} /> Aktiv redaktələr ({locks.length})</h3>
      </div>
      {locks.length === 0 ? <div className="sa-empty">Heç bir diaqram redaktə olunmur</div> : (
        <div className="sa-locks">
          {locks.map(l => (
            <div key={`${l.tenantId}:${l.diagramId}`} className="sa-lock">
              <Lock size={14} />
              <span className="sa-lock-owner">{l.owner}</span>
              <span className="sa-lock-txt">diaqram #{l.diagramId} redaktə edir</span>
              <span className="sa-lock-dept">{l.departmentName}</span>
              <span className="sa-lock-time">{timeAgo(l.ts)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================ DEPARTMENTS */
function DepartmentsView({ departments, reload }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  async function create() {
    if (!name.trim()) return;
    setBusy(true); setErr('');
    try { await api.sa.createDepartment(name.trim()); setName(''); reload(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function rename(id) {
    if (!editing?.name.trim()) return;
    try { await api.sa.renameDepartment(id, editing.name.trim()); setEditing(null); reload(); }
    catch (e) { setErr(e.message); }
  }
  async function remove(d) {
    if (!confirm(`"${d.name}" şöbəsini və onun bütün istifadəçilərini silmək istəyirsiniz?`)) return;
    try { await api.sa.deleteDepartment(d.id); reload(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <div className="sa-panel">
      <div className="sa-addbar">
        <input className="sa-input" placeholder="Yeni şöbə adı (məs: Anbar şöbəsi)"
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && create()} />
        <button className="sa-btn primary" onClick={create} disabled={busy}><Plus size={16} /> Şöbə əlavə et</button>
      </div>
      {err && <div className="sa-err">{err}</div>}

      <div className="sa-cards">
        {departments.map(d => (
          <div key={d.id} className="sa-dept-card">
            <div className="sa-dept-icon"><Building2 size={20} /></div>
            <div className="sa-dept-body">
              {editing?.id === d.id ? (
                <div className="sa-inline-edit">
                  <input className="sa-input sm" value={editing.name}
                    onChange={e => setEditing({ ...editing, name: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && rename(d.id)} autoFocus />
                  <button className="sa-icon-btn" onClick={() => rename(d.id)} title="Yadda saxla">✓</button>
                  <button className="sa-icon-btn" onClick={() => setEditing(null)}><X size={14} /></button>
                </div>
              ) : (
                <div className="sa-dept-name">{d.name}</div>
              )}
              <div className="sa-dept-meta">{d.userCount || 0} istifadəçi · {d.adminCount || 0} admin</div>
            </div>
            <div className="sa-dept-actions">
              <button className="sa-icon-btn" onClick={() => setEditing({ id: d.id, name: d.name })} title="Adı dəyiş"><Pencil size={15} /></button>
              {d.id !== 'main' && <button className="sa-icon-btn danger" onClick={() => remove(d)} title="Sil"><Trash2 size={15} /></button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== USERS */
const emptyForm = { username: '', password: '', displayName: '', role: 'admin', tenantId: '' };
function UsersView({ departments, reload }) {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null); // null | {mode:'create'|'edit', ...}
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.sa.users(filter || undefined).then(u => { setUsers(u); setLoading(false); }).catch(() => setLoading(false));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const deptName = (id) => departments.find(d => d.id === id)?.name || (id ? id : '—');
  const shown = users.filter(u => !search ||
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.displayName || '').toLowerCase().includes(search.toLowerCase()));

  function openCreate() {
    setErr('');
    setForm({ mode: 'create', ...emptyForm, tenantId: filter || departments[0]?.id || '' });
  }
  function openEdit(u) {
    setErr('');
    setForm({ mode: 'edit', username: u.username, password: '', displayName: u.displayName || '', role: u.role, tenantId: u.tenantId || '' });
  }

  async function submit() {
    setErr('');
    try {
      if (form.mode === 'create') {
        await api.sa.createUser({
          username: form.username, password: form.password, displayName: form.displayName,
          role: form.role, tenantId: form.tenantId
        });
      } else {
        const patch = { displayName: form.displayName, role: form.role, tenantId: form.tenantId };
        if (form.password) patch.password = form.password;
        await api.sa.updateUser(form.username, patch);
      }
      setForm(null); load(); reload && reload();
    } catch (e) { setErr(e.message); }
  }

  async function toggleDisabled(u) {
    try { await api.sa.updateUser(u.username, { disabled: !u.disabled }); load(); }
    catch (e) { setErr(e.message); }
  }
  async function remove(u) {
    if (!confirm(`"${u.username}" istifadəçisini silmək istəyirsiniz?`)) return;
    try { await api.sa.deleteUser(u.username); load(); reload && reload(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <div className="sa-panel">
      <div className="sa-userbar">
        <select className="sa-input" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">Bütün şöbələr</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="sa-search">
          <Search size={15} />
          <input placeholder="İstifadəçi axtar…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="sa-btn primary" onClick={openCreate}><Plus size={16} /> İstifadəçi yarat</button>
      </div>
      {err && !form && <div className="sa-err">{err}</div>}

      {loading ? <div className="sa-empty">Yüklənir…</div> : (
        <table className="sa-table">
          <thead>
            <tr><th>İstifadəçi</th><th>Rol</th><th>Şöbə</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {shown.map(u => (
              <tr key={u.username} className={u.disabled ? 'muted' : ''}>
                <td>
                  <div className="sa-u-name">{u.displayName || u.username}</div>
                  <div className="sa-u-sub">@{u.username}</div>
                </td>
                <td><span className={`sa-role-chip ${u.role}`}>{roleLabel(u.role)}</span></td>
                <td>{u.role === 'superadmin' ? '—' : deptName(u.tenantId)}</td>
                <td>{u.disabled ? <span className="sa-status off">Deaktiv</span> : <span className="sa-status on">Aktiv</span>}</td>
                <td className="sa-row-actions">
                  {u.role !== 'superadmin' && (
                    <>
                      <button className="sa-icon-btn" onClick={() => openEdit(u)} title="Redaktə et"><Pencil size={15} /></button>
                      <button className="sa-icon-btn" onClick={() => toggleDisabled(u)} title={u.disabled ? 'Aktivləşdir' : 'Deaktiv et'}><Power size={15} /></button>
                      <button className="sa-icon-btn danger" onClick={() => remove(u)} title="Sil"><Trash2 size={15} /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={5} className="sa-empty">İstifadəçi yoxdur</td></tr>}
          </tbody>
        </table>
      )}

      {form && (
        <div className="sa-modal-overlay" onClick={() => setForm(null)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()}>
            <div className="sa-modal-head">
              <h3>{form.mode === 'create' ? 'Yeni istifadəçi' : `${form.username} — redaktə`}</h3>
              <button className="sa-icon-btn" onClick={() => setForm(null)}><X size={18} /></button>
            </div>
            <div className="sa-form">
              {form.mode === 'create' && (
                <label>İstifadəçi adı
                  <input className="sa-input" value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })} placeholder="məs: anbar_admin" />
                </label>
              )}
              <label>Ad (göstərilən)
                <input className="sa-input" value={form.displayName}
                  onChange={e => setForm({ ...form, displayName: e.target.value })} placeholder="məs: Anbar Admini" />
              </label>
              <label>{form.mode === 'create' ? 'Şifrə' : 'Yeni şifrə (dəyişmək üçün)'}
                <div className="sa-pw"><KeyRound size={15} />
                  <input className="sa-input" type="text" value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder={form.mode === 'edit' ? 'boş buraxsanız dəyişmir' : 'ən az 4 simvol'} />
                </div>
              </label>
              <div className="sa-form-row">
                <label>Rol
                  <select className="sa-input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="admin">Admin (redaktə edə bilər)</option>
                    <option value="viewer">İstifadəçi (yalnız baxış)</option>
                  </select>
                </label>
                <label>Şöbə
                  <select className="sa-input" value={form.tenantId} onChange={e => setForm({ ...form, tenantId: e.target.value })}>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
              </div>
              {err && <div className="sa-err">{err}</div>}
              <div className="sa-modal-actions">
                <button className="sa-btn" onClick={() => setForm(null)}>Ləğv et</button>
                <button className="sa-btn primary" onClick={submit}>{form.mode === 'create' ? 'Yarat' : 'Yadda saxla'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================ HISTORY */
function HistoryView({ departments }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState('');
  const [type, setType] = useState('');
  const [actor, setActor] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.sa.analytics({ tenantId, type, actor, limit: 400 })
      .then(d => { setEvents(d.events || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tenantId, type, actor]);
  useEffect(() => { load(); }, [load]);

  const deptName = (id) => id === '_super' ? 'Sistem' : (departments.find(d => d.id === id)?.name || id);

  return (
    <div className="sa-panel">
      <div className="sa-userbar">
        <select className="sa-input" value={tenantId} onChange={e => setTenantId(e.target.value)}>
          <option value="">Bütün şöbələr</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="sa-input" value={type} onChange={e => setType(e.target.value)}>
          <option value="">Bütün fəaliyyətlər</option>
          <option value="auth">Girişlər</option>
          <option value="admin">Admin əməliyyatları</option>
          <option value="user">İstifadəçi baxışları/klikləri</option>
          <option value="superadmin">Super admin əməliyyatları</option>
        </select>
        <div className="sa-search">
          <Search size={15} />
          <input placeholder="İstifadəçi adı…" value={actor} onChange={e => setActor(e.target.value)} />
        </div>
        <button className="sa-btn" onClick={load}><RefreshCw size={15} /> Yenilə</button>
      </div>

      {loading ? <div className="sa-empty">Yüklənir…</div> :
        events.length === 0 ? <div className="sa-empty">Qeyd tapılmadı</div> : (
          <div className="sa-feed">
            {events.map(e => (
              <div key={e.id} className={`sa-event t-${e.type}`}>
                <span className="sa-event-dot" />
                <div className="sa-event-body">
                  <div className="sa-event-line">
                    <b>{e.actor}</b> <span className="sa-event-role">{roleLabel(e.role)}</span>
                    <span className="sa-event-action">{ACTION_TEXT[e.action] || e.action}</span>
                    {e.targetName && <span className="sa-event-target">“{e.targetName}”</span>}
                  </div>
                  <div className="sa-event-meta">
                    {deptName(e.tenantId)} · {fmtDateTime(e.ts)} · {timeAgo(e.ts)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
