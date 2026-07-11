// AdminPanel.jsx — pill-navbar editor.
// Every group of settings lives behind a small pill button in the top bar.
// Click a pill -> its editor opens in a SIDEBAR docked to the right edge
// (not a dropdown). Click the pill again, another pill, or the sidebar's
// X to close/switch. Only one section is open at a time.
import { useState, useRef, useEffect } from 'react';
import {
  Plus, Trash2, Pill as PillIcon, Square, Diamond, Shapes, GripVertical, Eye, X,
  ChevronDown
} from './icons.jsx';
import {
  Palette, Waypoints, LayoutList, Layers, SlidersHorizontal,
  Download, FileSpreadsheet, ArrowRightLeft, ArrowUp, ArrowDown,
  Type, ListOrdered, RotateCcw, Maximize2, FileText as PopupIcon,
  FileText as DocIcon, Keyboard, Wrench, Clock, Archive,
  Share2, Link2, FileJson, FileText as PdfIcon, Check, Copy
} from 'lucide-react';
import { SHAPES, STYLES, SHAPE_LABEL, STYLE_LABEL, nodeView, nodeDefaults } from './nodeStyle.js';
import { IconPicker, Icon } from './iconLibrary.jsx';
import { makeSection } from './infoModel.js';
import { exportDiagramToExcel, downloadTemplate } from './excel.js';
import { exportDiagramToJson, exportDiagramToPdf } from './diagramExport.js';
import { asColorString } from './colorUtils.js';
import { getToken } from '../api/client.js';
import { repackLanes as repackLanesNodes } from './laneRepack.js';
import { autoNodeHeight } from './nodeMeasure.js';
import { shapeImage } from './shapeImages.js';

/* ============ Pill: navbar tab button. Its content is NOT a dropdown —
   the AdminPanel renders the open pill's content in a right sidebar. ============ */
function PillTab({ pid, icon, label, badge, openPill, setOpenPill }) {
  const isOpen = openPill === pid;
  return (
    <button
      type="button"
      className={`pill-tab ${isOpen ? 'open' : ''}`}
      onClick={() => setOpenPill(isOpen ? null : pid)}
    >
      {icon}<span>{label}</span>
      {badge != null && <span className="pill-badge">{badge}</span>}
      <ChevronDown size={12} className="pill-tab-chev" />
    </button>
  );
}

export default function AdminPanel({ process, selection, setSelection, updateProcess, onClose, onHeightChange, onSidebarChange, addStyle, setAddStyle, onAddShape, onArchive }) {
  const [openPill, setOpenPill] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (onSidebarChange) onSidebarChange(!!openPill);
  }, [openPill, onSidebarChange]);

  // report the bar's in-flow height (the sidebar is fixed and doesn't count)
  // so the canvas below can pad itself clear of the floating navbar
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !onHeightChange) return;
    const report = () => onHeightChange(el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange]);

  const SECTIONS = [
    { pid: 'diagram', icon: <Layers size={14} />, label: 'Diaqram',
      content: <DiagramMetaSection process={process} updateProcess={updateProcess} onArchive={onArchive} /> },
    { pid: 'theme', icon: <Palette size={14} />, label: 'Rəng/Tema',
      content: <ThemeSection process={process} updateProcess={updateProcess} /> },
    { pid: 'panels', icon: <LayoutList size={14} />, label: 'Panellər', badge: process.lanes.length,
      content: <PanelsSection process={process} selection={selection} setSelection={setSelection} updateProcess={updateProcess} /> },
    { pid: 'addnode', icon: <Shapes size={14} />, label: 'Node əlavə et',
      content: <NodesSection process={process} selection={selection} setSelection={setSelection}
        updateProcess={updateProcess} addStyle={addStyle} setAddStyle={setAddStyle} onAddShape={onAddShape} /> },
    { pid: 'export', icon: <Share2 size={14} />, label: 'Paylaş',
      content: <ExportShareSection process={process} /> },
    // { pid: 'canvas', icon: <SlidersHorizontal size={14} />, label: 'Canvas ölçüsü',
    //   content: <CanvasSection process={process} updateProcess={updateProcess} /> },
  ];
  const openSection = SECTIONS.find(s => s.pid === openPill) || null;

  return (
    <aside className="admin-panel" ref={rootRef}>
      <div className="admin-panel-bar">
        <span>REDAKTOR</span>
        {onClose && (
          <button className="panel-close-btn" onClick={onClose} title="Paneli bağla">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="pill-row-label"></div>
      <div className="pill-row">
        {SECTIONS.map(s => (
          <PillTab key={s.pid} pid={s.pid} icon={s.icon} label={s.label} badge={s.badge}
            openPill={openPill} setOpenPill={setOpenPill} />
        ))}
      </div>

      {openSection && (
        <div className="editor-sidebar">
          <div className="editor-sidebar-head">
            <span className="editor-sidebar-title">{openSection.icon} {openSection.label}</span>
            <button className="panel-close-btn" onClick={() => setOpenPill(null)} title="Bağla">
              <X size={15} />
            </button>
          </div>
          <div className="editor-sidebar-body">{openSection.content}</div>
        </div>
      )}

    </aside>
  );
}

/* ===================== small reusable color field ===================== */
const SWATCHES = [
  '#3a7894', '#1f4456', '#0e7490', '#2563eb', '#4f46e5',
  '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#d97706',
  '#ca8a04', '#16a34a', '#059669', '#0d9488', '#475569', '#111827'
];

export function ColorField({ label, value, onChange, onClear, placeholder = 'Standart' }) {
  // value may arrive as a legacy colour-object; normalise to a plain string so
  // the <input>, background and swatch comparison below can never crash.
  const v = asColorString(value);
  return (
    <div className="color-field">
      {label ? <label>{label}</label> : null}
      <div className="color-row">
        <label className="color-swatch-btn" title="Rəng seç" style={v ? { background: v } : undefined}>
          <input
            type="color"
            value={v || '#3a7894'}
            onChange={e => onChange(e.target.value)}
          />
          {!v && <span className="color-swatch-empty" />}
        </label>
        <input
          type="text"
          className="color-hex"
          value={v}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
        {v ? (
          <button type="button" className="icon-btn ghost" title="Sıfırla" onClick={onClear}>
            <RotateCcw size={13} />
          </button>
        ) : null}
      </div>
      <div className="color-swatches">
        {SWATCHES.map(c => (
          <button
            key={c}
            type="button"
            className={`swatch ${v.toLowerCase() === c ? 'on' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  );
}

/* ===================== DİAQRAM meta ===================== */
function DiagramMetaSection({ process, updateProcess, onArchive }) {
  return (
    <>
      <div className="field-row col">
        <label>Ad</label>
        <textarea rows={2} value={process.title || ''}
          onChange={e => updateProcess(p => ({ ...p, title: e.target.value }), 'meta-title')}
          placeholder="Diaqramın adı" />
      </div>
      <div className="field-row col">
        <label>İkinci ad (etiket)</label>
        <input value={process.subtitle || ''}
          onChange={e => updateProcess(p => ({ ...p, subtitle: e.target.value }), 'meta-subtitle')}
          placeholder="məs. ALM-X1-2-3S" />
      </div>
      <div className="hint">Dəyişikliklər "Yadda saxla" düyməsi ilə qeyd olunur.</div>
      {onArchive && (
        <button className="btn" style={{ marginTop: 14 }} onClick={onArchive}>
          <Archive size={14} /> <span>Bu diaqramı arxivə köçür</span>
        </button>
      )}
    </>
  );
}

/* ===================== RƏNG / TEMA ===================== */
function ThemeSection({ process, updateProcess }) {
  const theme = process.theme || {};
  function setTheme(patch) {
    updateProcess(p => ({ ...p, theme: { ...(p.theme || {}), ...patch } }), 'theme');
  }
  function applyAll(color) {
    if (!color) return;
    updateProcess(p => ({ ...p, theme: { node: color, edge: color, lane: color } }), 'theme-all');
  }
  function resetAll() {
    updateProcess(p => { const { theme, ...rest } = p; return rest; });
  }

  return (
    <div className="theme-panel">
      <div className="hint" style={{ marginBottom: 14 }}>
        Bütün diaqrama tətbiq olunan rənglər. Ayrı-ayrı node və oxlar öz rənglərini üstələyə bilər.
      </div>

      <div className="theme-card">
        <div className="theme-card-head">
          <span className="theme-dot" style={{ background: theme.node || 'var(--primary)' }} />
          <span>Pill / Node</span>
        </div>
        <ColorField label="" value={theme.node || ''}
          onChange={v => setTheme({ node: v })} onClear={() => setTheme({ node: '' })} />
      </div>

      <div className="theme-card">
        <div className="theme-card-head">
          <span className="theme-dot" style={{ background: theme.edge || 'var(--primary)' }} />
          <span>Ox (arrow)</span>
        </div>
        <ColorField label="" value={theme.edge || ''}
          onChange={v => setTheme({ edge: v })} onClear={() => setTheme({ edge: '' })} />
      </div>

      <div className="theme-card">
        <div className="theme-card-head">
          <span className="theme-dot" style={{ background: theme.lane || 'var(--primary)' }} />
          <span>Panel (sidepanel)</span>
        </div>
        <ColorField label="" value={theme.lane || ''}
          onChange={v => setTheme({ lane: v })} onClear={() => setTheme({ lane: '' })} />
      </div>

      <div className="theme-card theme-all-card">
        <div className="theme-card-head"><span>Hamısına birdən tətbiq et</span></div>
        <ColorField label="" value=""
          onChange={v => applyAll(v)} onClear={() => {}} placeholder="Bir rəng seç" />
      </div>

      <button className="btn" onClick={resetAll} style={{ marginTop: 6 }}>
        <RotateCcw size={14} /> <span>Standart rəngə qaytar</span>
      </button>
    </div>
  );
}

/* ===================== lane repack ===================== */
export function repackLanes(lanes, nodes) {
  let y = 20;
  return lanes.map(l => {
    const laneNodes = nodes.filter(n => n.laneId === l.id);
    let minHeight = 180;
    if (laneNodes.length > 0) {
      const maxBottom = Math.max(...laneNodes.map(n => (n.y || 0) + (n.h || 100)));
      minHeight = Math.max(minHeight, maxBottom - y + 40);
    }
    const packed = { ...l, y, h: minHeight };
    y += minHeight;
    return packed;
  });
}

/* ===================== PANELLƏR ===================== */
function PanelsSection({ process, selection, setSelection, updateProcess }) {
  const [newPanelName, setNewPanelName] = useState('');
  const dragIdx = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  function addLane() {
    if (!newPanelName.trim()) return;
    const newLane = { id: `lane-${Date.now()}`, label: newPanelName.trim(), y: 0, h: 180 };
    updateProcess(p => {
      const newLanes = [...p.lanes, newLane];
      const repacked = repackLanes(newLanes, p.nodes);
      const last = repacked[repacked.length - 1];
      const newHeight = Math.max(p.height, (last?.y + last?.h + 40) || 600);
      return { ...p, lanes: repacked, height: newHeight };
    });
    setNewPanelName('');
    setSelection({ kind: 'lane', id: process.lanes.length });
  }

  function deleteLane(index) {
    const laneToDelete = process.lanes[index];
    if (!confirm(`"${laneToDelete.label}" panelini silmək istəyirsiniz? Panel daxilindəki node-lar silinəcək.`)) return;
    updateProcess(p => {
      const remainingNodes = p.nodes.filter(n => n.laneId !== laneToDelete.id);
      const remainingLanes = p.lanes.filter((_, i) => i !== index);
      const repackedLanes = repackLanes(remainingLanes, remainingNodes);
      const updatedNodes = remainingNodes.map(node => {
        const nodeLane = repackedLanes.find(l => l.id === node.laneId);
        if (nodeLane) {
          const oldLane = p.lanes.find(l => l.id === node.laneId);
          const yOffset = nodeLane.y - (oldLane?.y || 0);
          return { ...node, y: node.y + yOffset };
        }
        return node;
      });
      return { ...p, lanes: repackedLanes, nodes: updatedNodes };
    });
    if (selection?.kind === 'lane' && selection.id === index) setSelection(null);
  }

  function renamePanel(id, value) {
    updateProcess(prev => ({
      ...prev, lanes: prev.lanes.map(l => l.id === id ? { ...l, label: value } : l)
    }), `rename-${id}`);
  }

  function onDragStart(e, idx) { dragIdx.current = idx; e.dataTransfer.effectAllowed = 'move'; }
  function onDragOver(e, idx) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(idx); }
  function onDrop(e, dropIdx) {
    e.preventDefault();
    const fromIdx = dragIdx.current;
    if (fromIdx === null || fromIdx === dropIdx) { setDragOver(null); return; }
    updateProcess(p => {
      const lanes = [...p.lanes];
      const [moved] = lanes.splice(fromIdx, 1);
      lanes.splice(dropIdx, 0, moved);
      const repacked = repackLanes(lanes, p.nodes);
      const updatedNodes = p.nodes.map(node => {
        const oldLane = p.lanes.find(l => l.id === node.laneId);
        const newLane = repacked.find(l => l.id === node.laneId);
        if (oldLane && newLane) return { ...node, y: node.y + (newLane.y - oldLane.y) };
        return node;
      });
      return { ...p, lanes: repacked, nodes: updatedNodes };
    });
    if (selection?.kind === 'lane') setSelection(null);
    dragIdx.current = null; setDragOver(null);
  }
  function onDragEnd() { dragIdx.current = null; setDragOver(null); }

  return (
    <>
      <div className="panel-add-row">
        <input value={newPanelName} onChange={e => setNewPanelName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addLane()} placeholder="Yeni panel adı" />
        <button className="btn primary small" onClick={addLane}><Plus size={14} /> Əlavə et</button>
      </div>

      <div className="panel-list">
        {process.lanes.length === 0 && <div className="hint">Hələ panel yoxdur.</div>}
        {process.lanes.map((lane, i) => {
          const isSel = selection?.kind === 'lane' && selection.id === i;
          const nodeCount = process.nodes.filter(n => n.laneId === lane.id).length;
          return (
            <div key={lane.id}
              className={`panel-item ${isSel ? 'selected' : ''} ${dragOver === i ? 'drag-over' : ''}`}
              onClick={() => setSelection({ kind: 'lane', id: i })}
              draggable onDragStart={e => onDragStart(e, i)} onDragOver={e => onDragOver(e, i)}
              onDrop={e => onDrop(e, i)} onDragEnd={onDragEnd}>
              <div className="drag-handle" title="Sürükləyin"><GripVertical size={14} /></div>
              <div className="panel-bar" />
              <input value={lane.label} onChange={e => renamePanel(lane.id, e.target.value)}
                onClick={e => e.stopPropagation()} />
              <div className="panel-meta">{nodeCount}</div>
              <button className="icon-btn ghost danger"
                onClick={(e) => { e.stopPropagation(); deleteLane(i); }} title="Sil">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ===================== NODE ƏLAVƏ ET ===================== */
function NodesSection({ process, selection, setSelection, updateProcess, addStyle, setAddStyle, onAddShape }) {
  // If a single node is selected, this panel edits THAT node (change its shape
  // or border) instead of adding a brand-new one.
  const selectedNode = selection?.kind === 'node'
    ? process.nodes.find(n => String(n.id) === String(selection.id))
    : null;

  const style = selectedNode ? nodeView(selectedNode).style : addStyle;
  function setStyle(s) {
    if (selectedNode) applyToSelected({ style: s });
    else setAddStyle(s);
  }

  // Apply a shape/style change to the selected node, re-fitting its height so
  // the lane doesn't jump (same behaviour as the context menu).
  function applyToSelected(patch) {
    if (!selectedNode) return;
    updateProcess(p => {
      const newNodes = p.nodes.map(n => {
        if (String(n.id) !== String(selectedNode.id)) return n;
        const next = { ...n, ...patch };
        if (patch.type) next.dash = undefined;
        const def = nodeDefaults(patch.type || nodeView(next).shape);
        next.h = Math.max(def.h, autoNodeHeight(next, next.text));
        return next;
      });
      const r = repackLanesNodes(p.lanes, newNodes);
      return { ...p, nodes: r.nodes, lanes: r.lanes };
    }, `node-${selectedNode.id}-addpanel`);
  }

  function pickShape(shape) {
    if (selectedNode) applyToSelected({ type: shape, style });
    else onAddShape(shape, style);
  }

  function onDragStart(e, shape) {
    // Payload the canvas reads on drop to create the node where it lands.
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-map-shape', JSON.stringify({ shape, style }));
    // Also encode the shape into a custom MIME type — unlike getData(), the
    // list of *types* IS readable during dragover, so the canvas can show the
    // correct ghost while hovering (not just on drop).
    e.dataTransfer.setData(`application/x-map-shape-${shape}`, shape);
    e.dataTransfer.setData('text/plain', shape);
  }

  // Renumber node IDs to a gap-free 1..N sequence. Numeric IDs keep their
  // relative order (1,2,4,5 -> 1,2,3,4); any non-numeric IDs are appended
  // after them. Edge from/to references are remapped so nothing breaks.
  function renumberIds() {
    if (!process.nodes.length) return;
    if (!confirm('Bütün node ID-ləri 1-dən başlayaraq ardıcıl nömrələnəcək və boşluqlar doldurulacaq. Davam edilsin?')) return;
    updateProcess(p => {
      const ordered = [...p.nodes].sort((a, b) => {
        const na = /^\d+$/.test(String(a.id)), nb = /^\d+$/.test(String(b.id));
        if (na && nb) return Number(a.id) - Number(b.id);
        if (na) return -1;
        if (nb) return 1;
        return 0;
      });
      const map = new Map();
      ordered.forEach((n, i) => map.set(String(n.id), i + 1));
      const nodes = p.nodes.map(n => ({ ...n, id: map.get(String(n.id)) }));
      const edges = p.edges.map(e => ({
        ...e,
        from: map.has(String(e.from)) ? map.get(String(e.from)) : e.from,
        to: map.has(String(e.to)) ? map.get(String(e.to)) : e.to,
      }));
      return { ...p, nodes, edges };
    }, 'renumber-ids');
  }

  return (
    <>
      {selectedNode && (
        <div className="edit-selected-banner">
          <div className="edit-selected-info">
            <Wrench size={14} />
            <span>Seçili node redaktə olunur: <b>#{selectedNode.id}</b></span>
          </div>
          <button type="button" className="edit-selected-clear" onClick={() => setSelection(null)}
            title="Seçimi ləğv et — yeni node əlavə et">
            <X size={13} /> <span>Yeni əlavə et</span>
          </button>
        </div>
      )}

      <div className="field-row col">
        <label className="lbl">Sərhəd:</label>
        <div className="seg-toggle">
          {STYLES.map(s => (
            <button key={s} type="button" className={style === s ? 'on' : ''} onClick={() => setStyle(s)}>
              {STYLE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <p className="node-types-intro">
        {selectedNode
          ? <>Aşağıdan forma seçin — seçili <b>#{selectedNode.id}</b> node-un forması dəyişəcək (yeni node əlavə olunmayacaq).</>
          : <>Formanı canvas üzərinə <b>sürükləyin</b> — buraxdığınız yerə əlavə olunur.
             Yaxud <b>klikləyin</b> — ekranda görünən panelə avtomatik əlavə olunur.</>}
      </p>
      <div className="node-types img-grid">
        {SHAPES.map(shape => {
          const isCur = selectedNode && nodeView(selectedNode).shape === shape;
          return (
            <button
              key={shape}
              className={`type-btn shape-card ${isCur ? 'on' : ''}`}
              draggable={!selectedNode}
              onDragStart={e => !selectedNode && onDragStart(e, shape)}
              onClick={() => pickShape(shape)}
              title={selectedNode
                ? `Seçili node-u ${SHAPE_LABEL[shape]} formasına dəyiş`
                : `${SHAPE_LABEL[shape]} — sürükləyin və ya klikləyin`}>
              <span className="shape-thumb">
                <img src={shapeImage(shape)} alt={SHAPE_LABEL[shape]} draggable={false} />
              </span>
              <span>{SHAPE_LABEL[shape]}</span>
            </button>
          );
        })}
      </div>

      <div className="node-id-organize">
        <button type="button" className="btn" onClick={renumberIds}>
          <ListOrdered size={14} /> <span>ID-ləri nizamla (boşluqları doldur)</span>
        </button>
        <div className="hint" style={{ marginTop: 8 }}>
          Silinən node-lardan sonra qalan ID-ləri 1-dən başlayaraq yenidən ardıcıl
          nömrələyir (məs. 1, 2, 4, 5 → 1, 2, 3, 4). Oxların bağlantıları da yenilənir.
        </div>
      </div>
    </>
  );
}

/* ===================== İXRAC / PAYLAŞ ===================== */
function ExportShareSection({ process }) {
  const [orientation, setOrientation] = useState('landscape');
  const [copied, setCopied] = useState(false);
  const isLoggedIn = !!getToken();

  const shareUrl = `${window.location.origin}${window.location.pathname}?d=${encodeURIComponent(process.id)}`;

  async function copyLink() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = shareUrl; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Linki kopyalayın:', shareUrl);
    }
  }

  return (
    <div className="export-panel">
      {/* ---- Save as PDF ---- */}
      <div className="export-block">
        <div className="export-block-title"><PdfIcon size={14} /> PDF kimi saxla</div>
        <div className="field-row col">
          <label className="lbl">İstiqamət</label>
          <div className="seg-toggle">
            <button type="button" className={orientation === 'landscape' ? 'on' : ''}
              onClick={() => setOrientation('landscape')}>Albom (üfüqi)</button>
            <button type="button" className={orientation === 'portrait' ? 'on' : ''}
              onClick={() => setOrientation('portrait')}>Portret (şaquli)</button>
          </div>
        </div>
        <button className="btn primary" onClick={() => exportDiagramToPdf(process, { orientation })}>
          <Download size={15} /> <span>PDF-ə çıxart</span>
        </button>
        <div className="hint" style={{ marginTop: 6 }}>
          Çap pəncərəsi açılır — orada <b>“PDF kimi yadda saxla”</b> seçin.
        </div>
      </div>

      {/* ---- Save as Excel ---- */}
      <div className="export-block">
        <div className="export-block-title"><FileSpreadsheet size={14} /> Excel kimi saxla</div>
        <button className="btn" onClick={() => exportDiagramToExcel(process)}>
          <Download size={15} /> <span>Excel-ə (.xlsx) çıxart</span>
        </button>
        <button className="btn" style={{ marginTop: 8 }} onClick={downloadTemplate}>
          <FileSpreadsheet size={15} /> <span>Boş Excel şablonu yüklə</span>
        </button>
      </div>

      {/* ---- Save as JSON ---- */}
      <div className="export-block">
        <div className="export-block-title"><FileJson size={14} /> JSON kimi saxla</div>
        <button className="btn" onClick={() => exportDiagramToJson(process)}>
          <Download size={15} /> <span>JSON məlumatını yüklə</span>
        </button>
        <div className="hint" style={{ marginTop: 6 }}>
          Bütün paneller, node-lar və oxlar tam şəkildə JSON faylına yazılır.
        </div>
      </div>

      {/* ---- Share as link ---- */}
      <div className="export-block">
        <div className="export-block-title"><Link2 size={14} /> Link ilə paylaş</div>
        <div className="share-link-row">
          <input className="share-link-input" readOnly value={shareUrl}
            onFocus={e => e.target.select()} />
          <button className="btn primary share-copy-btn" onClick={copyLink}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            <span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
          </button>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          Bu link birbaşa <b>bu diaqramı</b> açır. {isLoggedIn
            ? 'İstifadəçi daxil olubsa, diaqram dərhal açılacaq.'
            : 'Açan şəxs daxil olmayıbsa, əvvəlcə giriş tələb olunacaq, sonra diaqram açılacaq.'}
        </div>
      </div>
    </div>
  );
}

/* ===================== CANVAS ===================== */
function CanvasSection({ process, updateProcess }) {
  return (
    <>
      <div className="field-row two">
        <div>
          <label>En (px)</label>
          <input type="number" value={process.width}
            onChange={e => updateProcess(p => ({ ...p, width: Number(e.target.value) }))} />
        </div>
      </div>
      <div className="hint">Hündürlük avtomatik tənzimlənir. Panel hündürlükləri node-lara uyğun dəyişir.</div>
    </>
  );
}