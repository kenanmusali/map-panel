import { useState, useEffect } from 'react';
import { LogoFull } from './Logo.jsx';
import { Search, LogOut, Plus, Loader2 } from './icons.jsx';
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
    const title = prompt('Panel/Header adı:');
    if (!title) return;

    const panelCount = Number(prompt('Neçə panel istəyirsiniz?', '3') || 3);

    const lanes = Array.from({ length: panelCount }).map((_, i) => ({
      id: `lane-${Date.now()}-${i}`,
      label: `Panel ${i + 1}`,
      y: 20 + (i * 180),
      h: 160
    }));

    setCreating(true);
    try {
      const p = await api.createProcess({
        title,
        width: 2200,
        height: Math.max(700, panelCount * 190),
        lanes,
        nodes: [],
        edges: []
      });
      await load();
      onOpen(p.id);
    } catch (e) {
      alert('Xəta: ' + e.message);
    } finally {
      setCreating(false);
    }
  }

  function logout() {
    setToken(null);
    onLogout();
  }

  const filtered = processes.filter(p => {
    const q = query.trim().toLowerCase();
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
        <h2 className="home-title">ABŞERON LOGİSTİKA MƏRKƏZİ<br />PROSES XƏRİTƏLƏRİ</h2>

        <div className="search-wrap">
          <span className="search-icon"><Search size={18} /></span>
          <input
            type="text"
            placeholder="Search it by name or number badge"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="process-list">
          {loading && (
            <div className="empty-state"><Loader2 size={20} className="spin" /> Yüklənir...</div>
          )}
          {error && !loading && (
            <div className="empty-state error">{error}</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="empty-state">Heç bir nəticə tapılmadı</div>
          )}
          {!loading && filtered.map(p => (
            <div key={p.id} className="process-item" onClick={() => onOpen(p.id)}>
              <div className="num">{p.id}</div>
              <div className="label">{p.title}</div>
            </div>
          ))}

          <button className="process-item create-btn" onClick={createNew} disabled={creating}>
            <div className="num"><Plus size={22} /></div>
            <div className="label">{creating ? 'Yaradılır...' : 'Yeni proses əlavə et'}</div>
          </button>
        </div>
      </div>
    </>
  );
}
