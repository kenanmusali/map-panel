import { useState, useEffect } from 'react';
import { LogoFull } from './Logo.jsx';
import {
  Search, LogOut, Plus, Loader2, Trash2, ChevronLeft,
  ChevronRight, ChevronDown, Folder, FolderOpen, FolderPlus, Pencil, Edit3
} from './icons.jsx';
import { api, setToken } from '../api/client.js';
import NameModal from './NameModal.jsx';
import TitleEditButton from './TitleEditButton.jsx';

function fmtTime(d) {
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = (h % 12 || 12).toString().padStart(2, '0');
  return `${hh}:${m} ${period}`;
}
function fmtDate(d) {
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export default function Home({ onOpen, onLogout, onBack }) {
  const [now, setNow] = useState(new Date());
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});   // groupId -> bool
  const [modal, setModal] = useState(null);        // see types below
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(null);

  const role = localStorage.getItem('role');
  const isViewer = role === 'viewer';
  const isAdmin = role === 'admin';

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { load(); }, []);
  useEffect(() => { api.getSettings().then(setSettings).catch(() => setSettings({})); }, []);

  async function saveSettings(patch) {
    const next = await api.updateSettings(patch);
    setSettings(next);
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.listProcesses();
      const gs = data.groups || [];
      setGroups(gs);
      setProcesses(data.processes || []);
      // expand all groups by default the first time
      setExpanded(prev => {
        if (Object.keys(prev).length) return prev;
        const o = {};
        gs.forEach(g => { o[g.id] = true; });
        return o;
      });
    } catch (e) {
      setError(e.message);
      if (e.status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setToken(null);
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    onLogout();
  }

  function toggleGroup(gid) {
    setExpanded(prev => ({ ...prev, [gid]: !prev[gid] }));
  }

  /* ---------- group actions ---------- */
  async function saveGroupCreate({ name }) {
    const g = await api.createGroup(name);
    setExpanded(prev => ({ ...prev, [g.id]: true }));
    setModal(null);
    await load();
  }
  async function saveGroupRename({ name }) {
    await api.renameGroup(modal.group.id, name);
    setModal(null);
    await load();
  }
  async function deleteGroup(g) {
    const count = processes.filter(p => Number(p.groupId) === Number(g.id)).length;
    const msg = count
      ? `"${g.name}" qrupunu və içindəki ${count} diaqramı silmək istəyirsiniz? Geri alına bilməz.`
      : `"${g.name}" qrupunu silmək istəyirsiniz?`;
    if (!confirm(msg)) return;
    try {
      await api.deleteGroup(g.id);
      await load();
    } catch (e) { alert('Silinə bilmədi: ' + e.message); }
  }

  /* ---------- diagram actions ---------- */
  async function saveDiagramCreate({ name, subtitle, groupId }) {
    setBusy(true);
    try {
      const p = await api.createProcess({
        title: name, subtitle, groupId: groupId || modal.groupId,
        width: 2200, height: 900, lanes: [], nodes: [], edges: []
      });
      setModal(null);
      await load();
      onOpen(p.id);
    } catch (e) {
      alert('Xəta: ' + e.message);
    } finally { setBusy(false); }
  }
  async function saveDiagramEdit({ name, subtitle, groupId }) {
    await api.updateProcessMeta(modal.proc.id, { title: name, subtitle, groupId });
    setModal(null);
    await load();
  }
  async function deleteProcess(e, p) {
    e.stopPropagation();
    if (!confirm(`"${p.title}" diaqramını silmək istəyirsiniz? Geri alına bilməz.`)) return;
    try {
      await api.deleteProcess(p.id);
      setProcesses(prev => prev.filter(x => x.id !== p.id));
    } catch (err) { alert('Silinə bilmədi: ' + err.message); }
  }

  const q = query.trim().toLowerCase();
  function matches(p) {
    if (!q) return true;
    return (p.title || '').toLowerCase().includes(q)
      || (p.subtitle || '').toLowerCase().includes(q)
      || String(p.id).includes(q);
  }

  const noResults = !loading && !error && groups.length === 0 && processes.length === 0;

  return (
    <>
      <div className="topbar">
        <div className="top-left">
          {onBack && (
            <button className="pill-chip back-chip" onClick={onBack}>
              <ChevronLeft size={16} /><span>Geri</span>
            </button>
          )}
          <div className="pill-chip">{fmtTime(now)}</div>
          <div className="pill-chip">{fmtDate(now)}</div>
        </div>
        <button className="logout-btn" onClick={logout}>
          <LogOut size={16} /><span>Çıxış</span>
        </button>
      </div>
      <br />
      <div className="home-wrap">
        <LogoFull size="large" />
        <h2 className="home-title">
          {(settings?.org_title) || 'ABŞERON LOGİSTİKA MƏRKƏZİ'}<br />
          {(settings?.diagrams_page_title) || 'İş Axışları'}
          {isAdmin && settings && (
            <TitleEditButton
              heading="Başlığı dəyiş"
              nameLabel="Səhifə başlığı"
              name0={(settings?.diagrams_page_title) || 'İş Axışları'}
              onSave={({ name }) => saveSettings({ diagrams_page_title: name })}
            />
          )}
        </h2>

        <div className="search-wrap">
          <span className="search-icon"><Search size={18} /></span>
          <input
            type="text"
            placeholder="Ad və ya nömrə ilə axtar"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="process-list">
          {loading && <div className="empty-state"><Loader2 size={20} className="spin" />Yüklənir...</div>}
          {error && !loading && <div className="empty-state error">{error}</div>}
          {noResults && <div className="empty-state">Heç bir qrup yoxdur</div>}

          {!loading && !error && groups.map(g => {
            const items = processes.filter(p => Number(p.groupId) === Number(g.id) && matches(p));
            const total = processes.filter(p => Number(p.groupId) === Number(g.id)).length;
            // hide a group if searching and it has no matches
            if (q && items.length === 0) return null;
            const isOpen = q ? true : !!expanded[g.id];

            return (
              <div key={g.id} className={`group-card ${isOpen ? 'open' : ''}`}>
                <div className="group-head" onClick={() => toggleGroup(g.id)}>
                  <span className="group-chevron">
                    {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </span>
                  <span className="group-folder">
                    {isOpen ? <FolderOpen size={18} /> : <Folder size={18} />}
                  </span>
                  <span className="group-name">{g.name}</span>
                  <span className="group-count">{total}</span>

                  {!isViewer && (
                    <span className="group-actions" onClick={e => e.stopPropagation()}>
                      <button className="group-act-btn" title="Diaqram əlavə et"
                        onClick={() => setModal({ type: 'diagram-create', groupId: g.id })}>
                        <Plus size={16} />
                      </button>
                      <button className="group-act-btn" title="Adı dəyiş"
                        onClick={() => setModal({ type: 'group-rename', group: g })}>
                        <Pencil size={15} />
                      </button>
                      <button className="group-act-btn danger" title="Qrupu sil"
                        onClick={() => deleteGroup(g)}>
                        <Trash2 size={15} />
                      </button>
                    </span>
                  )}
                </div>

                {isOpen && (
                  <div className="group-body">
                    {items.length === 0 && (
                      <div className="child-empty">Bu qrupda diaqram yoxdur.</div>
                    )}
                    {items.map((p, idx) => (
                      <div key={p.id} className="process-item diagram-row" onClick={() => onOpen(p.id)}>
                        <div className="num">{idx + 1}</div>
                        <div className="label">
                          <span className="row-title">{p.title}</span>
                          {p.subtitle ? <span className="row-subtitle">{p.subtitle}</span> : null}
                        </div>
                        {!isViewer && (
                          <div className="row-actions" onClick={e => e.stopPropagation()}>
                            <button className="delete-archive-btn" title="Redaktə et"
                              onClick={() => setModal({ type: 'diagram-edit', proc: p })}>
                              <Edit3 size={16} />
                            </button>
                            <button className="delete-archive-btn" title="Sil"
                              onClick={(e) => deleteProcess(e, p)}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {!isViewer && !loading && (
            <button className="process-item create-btn" onClick={() => setModal({ type: 'group-create' })} disabled={busy}>
              <div className="num"><FolderPlus size={20} /></div>
              <div className="label">Yeni qrup yarat</div>
            </button>
          )}
        </div>
      </div>

      {modal?.type === 'group-create' && (
        <NameModal heading="Yeni qrup" nameLabel="Qrup adı" namePlaceholder="Qrupun adı"
          saveLabel="Yarat" onClose={() => setModal(null)} onSave={saveGroupCreate} />
      )}
      {modal?.type === 'group-rename' && (
        <NameModal heading="Qrupu adlandır" nameLabel="Qrup adı" name0={modal.group.name}
          onClose={() => setModal(null)} onSave={saveGroupRename} />
      )}
      {modal?.type === 'diagram-create' && (
        <NameModal heading="Yeni diaqram" nameLabel="Diaqram adı" withSubtitle
          withGroup groups={groups} groupId0={modal.groupId}
          namePlaceholder="Əsas ad" subtitlePlaceholder="Qısa ikinci ad (məcburi deyil)"
          saveLabel="Yarat və aç" onClose={() => setModal(null)} onSave={saveDiagramCreate} />
      )}
      {modal?.type === 'diagram-edit' && (
        <NameModal heading="Diaqramı redaktə et" nameLabel="Diaqram adı" withSubtitle
          withGroup groups={groups} groupId0={modal.proc.groupId}
          name0={modal.proc.title || ''} subtitle0={modal.proc.subtitle || ''}
          onClose={() => setModal(null)} onSave={saveDiagramEdit} />
      )}
    </>
  );
}
