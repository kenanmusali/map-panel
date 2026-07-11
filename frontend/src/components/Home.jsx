import { useState, useEffect, useRef } from 'react';
import { LogoFull } from './Logo.jsx';
import {
  Search, LogOut, Plus, Loader2, Trash2, ChevronLeft,
  ChevronRight, ChevronDown, Folder, FolderOpen, FolderPlus, Pencil, Edit3, GripVertical
} from './icons.jsx';
import { Archive, ArchiveRestore } from 'lucide-react';
import { api, setToken } from '../api/client.js';
import NameModal from './NameModal.jsx';
import TitleEditButton from './TitleEditButton.jsx';
import { importDiagramFromExcel, downloadTemplate } from './excel.js';
import { importDiagramFromJson } from './diagramExport.js';

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
  const [archived, setArchived] = useState([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});   // groupId -> bool
  const [modal, setModal] = useState(null);        // see types below
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(null);
  const [pendingArchive, setPendingArchive] = useState(null); // process id awaiting confirm

  // ---- drag & drop ordering ----
  const groupDrag = useRef(null);          // gid being dragged
  const [groupOver, setGroupOver] = useState(null);
  const itemDrag = useRef(null);           // { gid, id }
  const [itemOver, setItemOver] = useState(null); // { gid, id }

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
      setArchived(data.archived || []);
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

  /* ---------- drag & drop: folders ---------- */
  function onGroupDragStart(e, gid) {
    if (isViewer) return;
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
    const fi = order.indexOf(from);
    const ti = order.indexOf(gid);
    if (fi < 0 || ti < 0) return;
    order.splice(ti, 0, order.splice(fi, 1)[0]);
    const next = order.map(id => groups.find(g => g.id === id));
    setGroups(next); // optimistic
    try { await api.reorderGroups(order); } catch { load(); }
  }
  function onGroupDragEnd() { groupDrag.current = null; setGroupOver(null); }

  /* ---------- drag & drop: items inside a folder ---------- */
  function onItemDragStart(e, gid, id) {
    if (isViewer) return;
    e.stopPropagation();
    itemDrag.current = { gid, id };
    e.dataTransfer.effectAllowed = 'move';
  }
  function onItemDragOver(e, gid, id) {
    const d = itemDrag.current;
    if (!d || Number(d.gid) !== Number(gid)) return; // only within the same folder
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

    // Reorder only the ids that belong to this group, then rebuild the full
    // list by walking the original order and swapping in the new sequence for
    // this group. Guard against any id going missing so we never inject
    // `undefined` into `processes` (which used to crash the render).
    const groupIds = processes.filter(p => Number(p.groupId) === Number(gid)).map(p => p.id);
    const fi = groupIds.indexOf(d.id);
    const ti = groupIds.indexOf(id);
    if (fi < 0 || ti < 0) return;
    groupIds.splice(ti, 0, groupIds.splice(fi, 1)[0]);

    const byId = new Map(processes.map(p => [p.id, p]));
    let k = 0;
    const reordered = processes.map(p => {
      if (Number(p.groupId) !== Number(gid)) return p;
      const nid = groupIds[k++];
      return byId.get(nid) || p; // fall back to original if anything is off
    }).filter(Boolean);

    setProcesses(reordered); // optimistic
    try { await api.reorderProcesses(Number(gid), groupIds); } catch { load(); }
  }
  function onItemDragEnd() { itemDrag.current = null; setItemOver(null); }

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
  async function importDiagramExcel(file, { groupId } = {}) {
    const data = await importDiagramFromExcel(file);
    const p = await api.createProcess({
      title: data.title,
      subtitle: data.subtitle || '',
      groupId: groupId || modal?.groupId,
      width: data.width || 2200,
      height: data.height || 900,
      lanes: data.lanes || [],
      nodes: data.nodes || [],
      edges: data.edges || [],
      ...(data.theme ? { theme: data.theme } : {})
    });
    setModal(null);
    await load();
    onOpen(p.id);
  }
  async function importDiagramJson(file, { groupId } = {}) {
    const data = await importDiagramFromJson(file);
    const p = await api.createProcess({
      title: data.title,
      subtitle: data.subtitle || '',
      groupId: groupId || modal?.groupId,
      width: data.width || 2200,
      height: data.height || 900,
      lanes: data.lanes || [],
      nodes: data.nodes || [],
      edges: data.edges || [],
      ...(data.theme ? { theme: data.theme } : {})
    });
    setModal(null);
    await load();
    onOpen(p.id);
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
      await api.archiveProcess(p.id);
      setPendingArchive(null);
      await load();
      setArchiveOpen(true);
    } catch (err) { alert('Arxivə köçürülə bilmədi: ' + err.message); }
  }
  async function unarchiveProcess(e, p) {
    e.stopPropagation();
    try {
      await api.unarchiveProcess(p.id);
      await load();
    } catch (err) { alert('Bərpa edilə bilmədi: ' + err.message); }
  }
  async function deleteArchived(e, p) {
    e.stopPropagation();
    if (!confirm(`"${p.title}" diaqramını tamamilə silmək istəyirsiniz? Geri alına bilməz.`)) return;
    try {
      await api.deleteProcess(p.id);
      setArchived(prev => prev.filter(x => x.id !== p.id));
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
        {!isViewer && !loading && (
            <button className="process-item create-btn" onClick={() => setModal({ type: 'group-create' })} disabled={busy}>
              <div className="num"><FolderPlus size={20} /></div>
              <div className="label">Yeni qrup yarat</div>
            </button>
          )}

          {!loading && !error && groups.map((g, gi) => {
            const fullItems = processes.filter(p => p && Number(p.groupId) === Number(g.id));
            const items = fullItems.filter(matches);
            const total = fullItems.length;
            // hide a group if searching and it has no matches
            if (q && items.length === 0) return null;
            // viewers never see empty folders (nothing to do with them)
            if (isViewer && total === 0) return null;
            const isOpen = q ? true : !!expanded[g.id];
            const dndOn = !isViewer && !q;
            const folderNo = gi + 1;
            const isGroupOver = groupOver === g.id && groupDrag.current !== g.id;

            return (
              <div
                key={g.id}
                className={`group-card ${isOpen ? 'open' : ''} ${isGroupOver ? 'drag-over' : ''}`}
              >
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
                    {items.map((p) => {
                      const itemNo = fullItems.indexOf(p) + 1;
                      const isItemOver = itemOver && itemOver.id === p.id
                        && (!itemDrag.current || itemDrag.current.id !== p.id);
                      return (
                        <div
                          key={p.id}
                          className={`process-item diagram-row ${isItemOver ? 'drag-over' : ''}`}
                          onClick={() => onOpen(p.id)}
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
                            <span className="row-title">{p.title}</span>
                            {p.subtitle ? <span className="row-subtitle">{p.subtitle}</span> : null}
                          </div>
                          {!isViewer && (
                            <div className="row-actions" onClick={e => e.stopPropagation()}>
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
                                  <button className="action-btn" title="Redaktə et"
                                    onClick={() => setModal({ type: 'diagram-edit', proc: p })}>
                                    <Edit3 size={16} />
                                  </button>
                                  <button className="action-btn" title="Arxivə köçür"
                                    onClick={(e) => requestArchive(e, p)}>
                                    <Archive size={16} />
                                  </button>
                                  <button className="action-btn" title="Sil"
                                    onClick={(e) => deleteProcess(e, p)}>
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

  
          {!isViewer && !loading && !error && archived.length > 0 && (() => {
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
                      <div key={p.id} className="process-item diagram-row archived-row" onClick={() => onOpen(p.id)}>
                        <div className="num"><Archive size={14} /></div>
                        <div className="label">
                          <span className="row-title">{p.title}</span>
                          {p.subtitle ? <span className="row-subtitle">{p.subtitle}</span> : null}
                        </div>
                        {!isViewer && (
                          <div className="row-actions" onClick={e => e.stopPropagation()}>
                            <button className="action-btn" title="Arxivdən çıxar"
                              onClick={(e) => unarchiveProcess(e, p)}>
                              <ArchiveRestore size={16} />
                            </button>
                            <button className="action-btn" title="Tamamilə sil"
                              onClick={(e) => deleteArchived(e, p)}>
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
          })()}
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
          saveLabel="Yarat və aç"
          withImport onImport={importDiagramExcel} onImportJson={importDiagramJson} onTemplate={downloadTemplate}
          onClose={() => setModal(null)} onSave={saveDiagramCreate} />
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
