import { useState, useEffect, useRef } from 'react';
import { LogoFull } from '../Logo.jsx';
import {
  ChevronLeft, ChevronRight, ChevronDown, LogOut, Plus, Loader2, Trash2,
  Eye, Edit3, Search, Folder, FolderOpen, FolderPlus, Pencil, GripVertical
} from '../icons.jsx';
import { Archive, ArchiveRestore } from 'lucide-react';
import { api, setToken } from '../../api/client.js';
import { pdfsApi } from '../../api/pdfsClient.js';
import PdfFormModal from './PdfFormModal.jsx';
import NameModal from '../NameModal.jsx';
import TitleEditButton from '../TitleEditButton.jsx';

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
  const [groups, setGroups] = useState([]);
  const [pdfs, setPdfs] = useState([]);
  const [archived, setArchived] = useState([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [modal, setModal] = useState(null); // pdf modal: {mode, pdf?, defaultGroupId?}
  const [gmodal, setGmodal] = useState(null); // group modal: {type:'create'|'rename', group?}
  const [settings, setSettings] = useState(null);
  const [pendingArchive, setPendingArchive] = useState(null); // pdf id awaiting confirm

  // ---- drag & drop ordering ----
  const groupDrag = useRef(null);
  const [groupOver, setGroupOver] = useState(null);
  const itemDrag = useRef(null);
  const [itemOver, setItemOver] = useState(null);

  const role = localStorage.getItem('role');
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
      const data = await pdfsApi.list();
      const gs = data.groups || [];
      const list = data.pdfs || []; // keep stored order (drag & drop reordering)
      setGroups(gs);
      setPdfs(list);
      setArchived(data.archived || []);
      setExpanded(prev => {
        if (Object.keys(prev).length) return prev;
        const o = {}; gs.forEach(g => { o[g.id] = true; }); return o;
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
  function toggleGroup(gid) { setExpanded(prev => ({ ...prev, [gid]: !prev[gid] })); }

  /* ---------- drag & drop: folders ---------- */
  function onGroupDragStart(e, gid) {
    if (!isAdmin) return;
    groupDrag.current = gid;
    e.dataTransfer.effectAllowed = 'move';
  }
  function onGroupDragOver(e, gid) {
    if (groupDrag.current == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (groupOver !== gid) setGroupOver(gid);
  }
  async function onGroupDrop(e, gid) {
    e.preventDefault();
    const from = groupDrag.current;
    groupDrag.current = null;
    setGroupOver(null);
    if (from == null || from === gid) return;
    const order = groups.map(g => g.id);
    const fi = order.indexOf(from), ti = order.indexOf(gid);
    if (fi < 0 || ti < 0) return;
    order.splice(ti, 0, order.splice(fi, 1)[0]);
    setGroups(order.map(id => groups.find(g => g.id === id)));
    try { await pdfsApi.reorderGroups(order); } catch { load(); }
  }
  function onGroupDragEnd() { groupDrag.current = null; setGroupOver(null); }

  /* ---------- drag & drop: PDFs inside a folder ---------- */
  function onItemDragStart(e, gid, id) {
    if (!isAdmin) return;
    e.stopPropagation();
    itemDrag.current = { gid, id };
    e.dataTransfer.effectAllowed = 'move';
  }
  function onItemDragOver(e, gid, id) {
    const d = itemDrag.current;
    if (!d || Number(d.gid) !== Number(gid)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!itemOver || itemOver.id !== id) setItemOver({ gid, id });
  }
  async function onItemDrop(e, gid, id) {
    const d = itemDrag.current;
    itemDrag.current = null;
    setItemOver(null);
    if (!d || Number(d.gid) !== Number(gid) || d.id === id) return;
    e.preventDefault();
    e.stopPropagation();
    const groupIds = pdfs.filter(p => Number(p.groupId) === Number(gid)).map(p => p.id);
    const fi = groupIds.indexOf(d.id), ti = groupIds.indexOf(id);
    if (fi < 0 || ti < 0) return;
    groupIds.splice(ti, 0, groupIds.splice(fi, 1)[0]);
    const byId = new Map(pdfs.map(p => [p.id, p]));
    let k = 0;
    const reordered = pdfs.map(p => {
      if (Number(p.groupId) !== Number(gid)) return p;
      return byId.get(groupIds[k++]) || p;
    }).filter(Boolean);
    setPdfs(reordered);
    try { await pdfsApi.reorderPdfs(Number(gid), groupIds); } catch { load(); }
  }
  function onItemDragEnd() { itemDrag.current = null; setItemOver(null); }

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
    } catch (err) { alert('Silinə bilmədi: ' + err.message); }
  }

  /* ---------- archive (two-step: ask, then confirm) ---------- */
  function requestArchive(e, p) {
    e.stopPropagation();
    setPendingArchive(p.id);
  }
  function cancelArchive(e) {
    e.stopPropagation();
    setPendingArchive(null);
  }
  async function confirmArchive(e, p) {
    e.stopPropagation();
    try {
      await pdfsApi.archive(p.id);
      setPendingArchive(null);
      await load();
      setArchiveOpen(true);
    } catch (err) { alert('Arxivə köçürülə bilmədi: ' + err.message); }
  }
  async function unarchivePdf(e, p) {
    e.stopPropagation();
    try { await pdfsApi.unarchive(p.id); await load(); }
    catch (err) { alert('Bərpa edilə bilmədi: ' + err.message); }
  }
  async function deleteArchivedPdf(e, p) {
    e.stopPropagation();
    if (!confirm(`"${p.title}" sənədini tamamilə silmək istəyirsiniz? Geri alına bilməz.`)) return;
    try {
      await pdfsApi.remove(p.id);
      setArchived(prev => prev.filter(x => x.id !== p.id));
    } catch (err) { alert('Silinə bilmədi: ' + err.message); }
  }

  async function handleModalSave(payload) {
    try {
      if (modal?.mode === 'create') await pdfsApi.create(payload);
      else if (modal?.mode === 'edit') await pdfsApi.update(modal.pdf.id, payload);
      setModal(null);
      await load();
    } catch (e) { alert('Xəta: ' + e.message); }
  }

  /* group actions */
  async function saveGroupCreate({ name }) {
    const g = await pdfsApi.createGroup(name);
    setExpanded(prev => ({ ...prev, [g.id]: true }));
    setGmodal(null);
    await load();
  }
  async function saveGroupRename({ name }) {
    await pdfsApi.renameGroup(gmodal.group.id, name);
    setGmodal(null);
    await load();
  }
  async function deleteGroup(g) {
    const count = pdfs.filter(p => Number(p.groupId) === Number(g.id)).length;
    const msg = count
      ? `"${g.name}" qrupunu və içindəki ${count} sənədi silmək istəyirsiniz? Geri alına bilməz.`
      : `"${g.name}" qrupunu silmək istəyirsiniz?`;
    if (!confirm(msg)) return;
    try { await pdfsApi.deleteGroup(g.id); await load(); }
    catch (e) { alert('Silinə bilmədi: ' + e.message); }
  }

  const q = query.trim().toLowerCase();
  function matches(p) {
    if (!q) return true;
    return (p.title || '').toLowerCase().includes(q)
      || (p.subtitle || '').toLowerCase().includes(q);
  }

  const noResults = !loading && !error && groups.length === 0 && pdfs.length === 0;

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
      <br />
      <div className="home-wrap">
        <LogoFull size="large" />
        <h2 className="home-title">
          {(settings?.pdf_page_title) || 'Normativ Sənədlər'}
          {isAdmin && settings && (
            <TitleEditButton
              heading="Başlığı dəyiş"
              nameLabel="Səhifə başlığı"
              name0={(settings?.pdf_page_title) || 'Normativ Sənədlər'}
              onSave={({ name }) => saveSettings({ pdf_page_title: name })}
            />
          )}
        </h2>

        <div className="search-wrap">
          <span className="search-icon"><Search size={18} /></span>
          <input type="text" placeholder="Ad və ya nömrə ilə axtar"
            value={query} onChange={e => setQuery(e.target.value)} />
        </div>

        <div className="process-list">
          {loading && <div className="empty-state"><Loader2 size={20} className="spin" />Yüklənir...</div>}
          {error && !loading && <div className="empty-state error">{error}</div>}
          {noResults && <div className="empty-state">Heç bir qrup yoxdur</div>}
      {isAdmin && !loading && (
            <button className="process-item create-btn" onClick={() => setGmodal({ type: 'create' })}>
              <div className="num"><FolderPlus size={20} /></div>
              <div className="label">Yeni qrup yarat</div>
            </button>
          )}

          {!loading && !error && groups.map((g, gi) => {
            const fullItems = pdfs.filter(p => Number(p.groupId) === Number(g.id));
            const items = fullItems.filter(matches);
            const total = fullItems.length;
            if (q && items.length === 0) return null;
            // non-admins never see empty folders
            if (!isAdmin && total === 0) return null;
            const isOpen = q ? true : !!expanded[g.id];
            const dndOn = isAdmin && !q;
            const folderNo = gi + 1;
            const isGroupOver = groupOver === g.id && groupDrag.current !== g.id;

            return (
              <div key={g.id} className={`group-card ${isOpen ? 'open' : ''} ${isGroupOver ? 'drag-over' : ''}`}>
                <div
                  className="group-head"
                  onClick={() => toggleGroup(g.id)}
                  draggable={dndOn}
                  onDragStart={e => onGroupDragStart(e, g.id)}
                  onDragOver={e => onGroupDragOver(e, g.id)}
                  onDrop={e => onGroupDrop(e, g.id)}
                  onDragEnd={onGroupDragEnd}
                >
                  {dndOn && (
                    <span className="order-grip group-grip" title="Sürüklə" onClick={e => e.stopPropagation()}>
                      <GripVertical size={15} />
                    </span>
                  )}
                  <span className="folder-no">{folderNo}</span>
                  <span className="group-chevron">
                    {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </span>
                  <span className="group-folder">
                    {isOpen ? <FolderOpen size={18} /> : <Folder size={18} />}
                  </span>
                  <span className="group-name">{g.name}</span>
                  <span className="group-count">{total}</span>

                  {isAdmin && (
                    <span className="group-actions" onClick={e => e.stopPropagation()}>
                      <button className="group-act-btn" title="PDF əlavə et"
                        onClick={() => setModal({ mode: 'create', defaultGroupId: g.id })}>
                        <Plus size={16} />
                      </button>
                      <button className="group-act-btn" title="Adı dəyiş"
                        onClick={() => setGmodal({ type: 'rename', group: g })}>
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
                    {items.length === 0 && <div className="child-empty">Bu qrupda sənəd yoxdur.</div>}
                    {items.map((p) => {
                      const itemNo = fullItems.indexOf(p) + 1;
                      const isItemOver = itemOver && itemOver.id === p.id
                        && (!itemDrag.current || itemDrag.current.id !== p.id);
                      return (
                        <div
                          key={p.id}
                          className={`process-item pdf-item ${isItemOver ? 'drag-over' : ''}`}
                          draggable={dndOn}
                          onDragStart={e => onItemDragStart(e, g.id, p.id)}
                          onDragOver={e => onItemDragOver(e, g.id, p.id)}
                          onDrop={e => onItemDrop(e, g.id, p.id)}
                          onDragEnd={onItemDragEnd}
                        >
                          {dndOn && (
                            <span className="order-grip item-grip" title="Sürüklə" onClick={e => e.stopPropagation()}>
                              <GripVertical size={14} />
                            </span>
                          )}
                          <div className="num">{folderNo}.{itemNo}</div>
                          <div className="label">
                            <span className="row-title">
                              {p.title}
                              {p.size ? <span className="pdf-size">{fmtSize(p.size)}</span> : null}
                            </span>
                            {p.subtitle ? <span className="row-subtitle">{p.subtitle}</span> : null}
                          </div>

                          <div className="pdf-actions">
                            <button className="action-btn" onClick={() => viewPdf(p)} disabled={busy === p.id} title="Bax">
                              {busy === p.id ? <Loader2 size={15} className="spin" /> : <Eye size={15} />}
                              <span>Bax</span>
                            </button>
                            <button className="action-btn" onClick={() => downloadPdf(p)} disabled={busy === p.id} title="Yüklə">
                              <DownloadIcon size={15} /><span>Yüklə</span>
                            </button>
                            {isAdmin && (
                              <>
                                {pendingArchive === p.id ? (
                                  <div className="archive-confirm">
                                    <span className="archive-confirm-q"> </span>
                                    <button className="action-btn confirm-yes" title="Təsdiq et"
                                      onClick={(e) => confirmArchive(e, p)}>
                                      <Archive size={15} /><span>Təsdiq</span>
                                    </button>
                                    <button className="action-btn" title="Ləğv et"
                                      onClick={cancelArchive}>
                                      <span>Ləğv</span>
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <button className="action-btn action-btn-icon nospace"
                                      onClick={(e) => { e.stopPropagation(); setModal({ mode: 'edit', pdf: p }); }} title="Redaktə et">
                                      <Edit3 size={15} />
                                    </button>
                                    <button className="action-btn action-btn-icon nospace"
                                      onClick={(e) => requestArchive(e, p)} title="Arxivə köçür">
                                      <Archive size={15} />
                                    </button>
                                    <button className="action-btn action-btn-icon action-btn-danger"
                                      onClick={(e) => removePdf(e, p)} title="Sil">
                                      <Trash2 size={15} />
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

    

          {isAdmin && !loading && !error && archived.length > 0 && (() => {
            const items = archived.filter(matches);
            if (q && items.length === 0) return null;
            const isOpen = q ? true : archiveOpen;
            return (
              <div className={`group-card archive-card ${isOpen ? 'open' : ''}`}>
                <div className="group-head" onClick={() => setArchiveOpen(v => !v)}>
                  <span className="group-chevron">
                    {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </span>
                  <span className="group-folder"><Archive size={17} /></span>
                  <span className="group-name">Arxiv</span>
                  <span className="group-count">{archived.length}</span>
                </div>
                {isOpen && (
                  <div className="group-body">
                    {items.map((p) => (
                      <div key={p.id} className="process-item pdf-item archived-row">
                        <div className="num"><Archive size={14} /></div>
                        <div className="label">
                          <span className="row-title">
                            {p.title}
                            {p.size ? <span className="pdf-size">{fmtSize(p.size)}</span> : null}
                          </span>
                          {p.subtitle ? <span className="row-subtitle">{p.subtitle}</span> : null}
                        </div>
                        <div className="pdf-actions">
                          <button className="action-btn" onClick={() => viewPdf(p)} disabled={busy === p.id} title="Bax">
                            {busy === p.id ? <Loader2 size={15} className="spin" /> : <Eye size={15} />}
                            <span>Bax</span>
                          </button>
                          {isAdmin && (
                            <>
                              <button className="action-btn action-btn-icon nospace"
                                onClick={(e) => unarchivePdf(e, p)} title="Arxivdən çıxar">
                                <ArchiveRestore size={15} />
                              </button>
                              <button className="action-btn action-btn-icon action-btn-danger"
                                onClick={(e) => deleteArchivedPdf(e, p)} title="Tamamilə sil">
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {modal && (
        <PdfFormModal
          mode={modal.mode}
          pdf={modal.pdf}
          groups={groups}
          defaultGroupId={modal.defaultGroupId}
          onClose={() => setModal(null)}
          onSave={handleModalSave}
        />
      )}
      {gmodal?.type === 'create' && (
        <NameModal heading="Yeni qrup" nameLabel="Qrup adı" namePlaceholder="Qrupun adı"
          saveLabel="Yarat" onClose={() => setGmodal(null)} onSave={saveGroupCreate} />
      )}
      {gmodal?.type === 'rename' && (
        <NameModal heading="Qrupu adlandır" nameLabel="Qrup adı" name0={gmodal.group.name}
          onClose={() => setGmodal(null)} onSave={saveGroupRename} />
      )}
    </>
  );
}
