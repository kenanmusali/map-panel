import { useState, useEffect } from 'react';
import { LogoFull } from '../Logo.jsx';
import { ChevronLeft, LogOut, Plus, Loader2, Trash2, Eye, Edit3, Search } from '../icons.jsx';
import { setToken } from '../../api/client.js';
import { pdfsApi } from '../../api/pdfsClient.js';
import PdfFormModal from './PdfFormModal.jsx';

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
function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DownloadIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function PdfList({ onBack, onLogout }) {
  const [now, setNow] = useState(new Date());
  const [pdfs, setPdfs] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null); // id of row currently being downloaded/viewed
  const [modal, setModal] = useState(null); // null | { mode: 'create' } | { mode: 'edit', pdf }

  const role = localStorage.getItem('role');
  const isAdmin = role === 'admin';

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await pdfsApi.list();
      // sort by id ascending so numbering stays stable
      list.sort((a, b) => Number(a.id) - Number(b.id));
      setPdfs(list);
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

  async function viewPdf(p) {
    setBusy(p.id);
    try { await pdfsApi.view(p.id); }
    catch (e) { alert('Xəta: ' + e.message); }
    finally { setBusy(null); }
  }

  async function downloadPdf(p) {
    setBusy(p.id);
    try { await pdfsApi.download(p.id, p.filename); }
    catch (e) { alert('Xəta: ' + e.message); }
    finally { setBusy(null); }
  }

  async function removePdf(e, p) {
    e.stopPropagation();
    if (!confirm(`"${p.title}" PDF-i silmək istəyirsiniz?`)) return;
    try {
      await pdfsApi.remove(p.id);
      setPdfs(prev => prev.filter(x => x.id !== p.id));
    } catch (err) {
      alert('Silinə bilmədi: ' + err.message);
    }
  }

  async function handleModalSave(payload) {
    try {
      if (modal?.mode === 'create') {
        await pdfsApi.create(payload);
      } else if (modal?.mode === 'edit') {
        await pdfsApi.update(modal.pdf.id, payload);
      }
      setModal(null);
      await load();
    } catch (e) {
      alert('Xəta: ' + e.message);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="top-left">
          <button className="pill-chip back-chip" onClick={onBack}>
            <ChevronLeft size={16} /><span>Geri</span>
          </button>
          <div className="pill-chip">{fmtTime(now)}</div>
          <div className="pill-chip">{fmtDate(now)}</div>
        </div>
        <button className="logout-btn" onClick={logout}>
          <LogOut size={16} /><span>Çıxış</span>
        </button>
      </div>

      <div className="home-wrap">
        <LogoFull size="large" />
        <h2 className="home-title">Normativ Sənədlər</h2>

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
          {!loading && !error && pdfs.length === 0 && (
            <div className="empty-state">Heç bir PDF yoxdur</div>
          )}

          {(() => {
            const q = query.trim().toLowerCase();
            const shown = pdfs
              .map((p, idx) => ({ p, idx }))
              .filter(({ p, idx }) => !q || (p.title || '').toLowerCase().includes(q) || String(idx + 1).includes(q));
            if (!loading && !error && pdfs.length > 0 && shown.length === 0) {
              return <div className="empty-state">Heç bir nəticə tapılmadı</div>;
            }
            return !loading && shown.map(({ p, idx }) => (
            <div key={p.id} className="process-item pdf-item">
              <div className="num">{idx + 1}</div>
              <div className="label">
                {p.title}
                {p.size ? <span className="pdf-size">{fmtSize(p.size)}</span> : null}
              </div>

              <div className="pdf-actions">
                <button
                  className="pdf-action-btn"
                  onClick={() => viewPdf(p)}
                  disabled={busy === p.id}
                  title="Bax"
                >
                  {busy === p.id ? <Loader2 size={15} className="spin" /> : <Eye size={15} />}
                  <span>Bax</span>
                </button>
                <button
                  className="pdf-action-btn"
                  onClick={() => downloadPdf(p)}
                  disabled={busy === p.id}
                  title="Yüklə"
                >
                  <DownloadIcon size={15} />
                  <span>Yüklə</span>
                </button>

                {isAdmin && (
                  <>
                    <button
                      className="pdf-action-btn pdf-action-btn-icon"
                      onClick={(e) => { e.stopPropagation(); setModal({ mode: 'edit', pdf: p }); }}
                      title="Redaktə et"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      className="pdf-action-btn pdf-action-btn-icon pdf-action-btn-danger"
                      onClick={(e) => removePdf(e, p)}
                      title="Sil"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ));
          })()}

          {isAdmin && !loading && (
            <button className="process-item create-btn" onClick={() => setModal({ mode: 'create' })}>
              <div className="num"><Plus size={22} /></div>
              <div className="label">PDF əlavə et</div>
            </button>
          )}
        </div>
      </div>

      {modal && (
        <PdfFormModal
          mode={modal.mode}
          pdf={modal.pdf}
          onClose={() => setModal(null)}
          onSave={handleModalSave}
        />
      )}
    </>
  );
}
