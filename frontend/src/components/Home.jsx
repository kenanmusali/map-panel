import { useState, useEffect } from 'react';
import { LogoFull } from './Logo.jsx';
import { Search, LogOut, Plus, Loader2, Trash2, Archive } from './icons.jsx';
import { api, setToken } from '../api/client.js';

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

export default function Home({ onOpen, onLogout }) {
  const [now, setNow] = useState(new Date());
  const [query, setQuery] = useState('');
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const role = localStorage.getItem('role');
  const isViewer = role === 'viewer';

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await api.listProcesses();
      setProcesses(list);
    } catch (e) {
      setError(e.message);
      if (e.status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  }

  async function createNew() {
    const title = prompt('Proses adı:');
    if (!title) return;
    setCreating(true);
    try {
      const p = await api.createProcess({
        title, width: 2200, height: 900,
        lanes: [], nodes: [], edges: [], archived: false
      });
      await load();
      onOpen(p.id);
    } catch (e) {
      alert('Xəta: ' + e.message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteProcess(e, p) {
    e.stopPropagation();
    if (!confirm(`"${p.title}" prosesini tamamilə silmək istəyirsiniz? Bu əməliyyat geri alına bilməz.`)) return;
    try {
      await api.deleteProcess(p.id || p._id);
      setProcesses(prev => prev.filter(x => (x.id || x._id) !== (p.id || p._id)));
    } catch (err) {
      alert('Silinə bilmədi: ' + err.message);
    }
  }

  function logout() {
    setToken(null);
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    onLogout();
  }

  const q = query.trim().toLowerCase();

  const active = processes.filter(p => {
    if (p.archived) return false;
    if (!q) return true;
    return (p.title || '').toLowerCase().includes(q) || String(p.id).includes(q);
  });

  const archived = processes.filter(p => {
    if (!p.archived) return false;
    if (!q) return true;
    return (p.title || '').toLowerCase().includes(q) || String(p.id).includes(q);
  });

  return (
    <>
      <div className="topbar">
        <div className="top-left">
          <div className="pill-chip">{fmtTime(now)}</div>
          <div className="pill-chip">{fmtDate(now)}</div>
        </div>
        <button className="logout-btn" onClick={logout}>
          <LogOut size={16} /><span>Log out</span>
        </button>
      </div>

      <div className="home-wrap">
        <LogoFull size="large" />
        <h2 className="home-title">
          ABŞERON LOGİSTİKA MƏRKƏZİ<br />PROSES XƏRİTƏLƏRİ
        </h2>

        <div className="search-wrap">
          <span className="search-icon"><Search size={18} /></span>
          <input
            type="text"
            placeholder="Search by name or number badge"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="process-list">
          {loading && <div className="empty-state"><Loader2 size={20} className="spin" />Yüklənir...</div>}
          {error && !loading && <div className="empty-state error">{error}</div>}
          {!loading && !error && active.length === 0 && archived.length === 0 && (
            <div className="empty-state">Heç bir nəticə tapılmadı</div>
          )}

          {!loading && active.map(p => (
            <div key={p.id || p._id} className="process-item" onClick={() => onOpen(p.id || p._id)}>
              <div className="num">{p.id || p._id}</div>
              <div className="label">{p.title}</div>
              {!isViewer && <div style={{ marginLeft:'auto', fontSize:'13px', color:'var(--text-muted)' }}>Redaktə et</div>}
            </div>
          ))}

     {!isViewer && !loading && archived.length > 0 && (
  <>
    <button className="archive-toggle" onClick={() => setShowArchived(v => !v)}>
      <Archive size={14} />
      <span>Arxiv ({archived.length})</span>
      <span className="archive-toggle-arrow">{showArchived ? '▴' : '▾'}</span>
    </button>

    {showArchived && archived.map(p => (
      <div
        key={p.id || p._id}
        className="process-item archived-item"
        onClick={() => onOpen(p.id || p._id)}
      >
        <div className="num" style={{ opacity: 0.5 }}>{p.id || p._id}</div>
        <div className="label">
          {p.title}
          <span className="archive-badge">Arxiv</span>
        </div>
        <button
          className="delete-archive-btn"
          title="Arxivdən çıxar"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('Bu prosesi arxivdən çıxarmaq istəyirsiniz?')) {
              api.updateProcess(p.id || p._id, { ...p, archived: false })
                .then(() => load());
            }
          }}
        >
          <Archive size={14} />
        </button>
        <button
          className="delete-archive-btn"
          title="Tamamilə sil"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`"${p.title}" prosesini tamamilə silmək istəyirsiniz? Bu əməliyyat geri alına bilməz.`)) {
              api.deleteProcess(p.id || p._id)
                .then(() => load());
            }
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    ))}
  </>
)}

          {!isViewer && (
            <button className="process-item create-btn" onClick={createNew} disabled={creating}>
              <div className="num"><Plus size={22} /></div>
              <div className="label">{creating ? 'Yaradılır...' : 'Yeni proses əlavə et'}</div>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
