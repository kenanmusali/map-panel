// Diagram.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, LogOut, Edit3, Eye, Save, Loader2, CheckCircle2, AlertCircle, Undo2, Redo2,
  Maximize2, Minimize2, PanelRight, PanelRightOpen, X
} from './icons.jsx';
import { LogoFull } from './Logo.jsx';
import { api, setToken } from '../api/client.js';
import DiagramCanvas from './DiagramCanvas.jsx';
import NodeModal from './NodeModal.jsx';
import AdminPanel from './AdminPanel.jsx';

const DRAFT_KEY = (id) => `absheron_draft_${id}`;
const LANE_PAD = 20;
const LANE_MIN_H = 160;

// Mirror of DiagramCanvas's auto-fit content size, so fit-to-screen scales correctly.
function canvasDims(process) {
  const RAIL_W = 56, PAD_RIGHT = 80, PAD_BOTTOM = 40, MIN_W = 700, MIN_H = 300;
  const nodes = process?.nodes || [];
  const lanes = process?.lanes || [];
  const contentRight = nodes.length
    ? Math.max(...nodes.map(n => (n.x || 0) + (n.w || 0)))
    : RAIL_W + 200;
  const contentBottom = lanes.length
    ? Math.max(...lanes.map(l => (l.y || 0) + (l.h || 0)))
    : 200;
  return {
    w: Math.max(MIN_W, contentRight + PAD_RIGHT),
    h: Math.max(MIN_H, contentBottom + PAD_BOTTOM)
  };
}

/**
 * Repack lanes vertically so each lane fits its assigned nodes.
 * - Stacks lanes top-to-bottom starting at y=20.
 * - Each lane is just tall enough to fit its nodes (min LANE_MIN_H).
 * - Nodes get shifted with their lane so they stay visually positioned inside it.
 * - Nodes without a laneId (or with an invalid one) are auto-assigned to the
 *   nearest lane by Y center.
 *
 * Returns { lanes, nodes }.
 */
function repackLanes(lanes, nodes) {
  if (lanes.length === 0) return { lanes, nodes };

  // 1. Ensure every node has a valid laneId. Infer from current Y if missing.
  const tagged = nodes.map(n => {
    if (n.laneId && lanes.some(l => l.id === n.laneId)) return n;
    const cy = (n.y || 0) + (n.h || 100) / 2;
    let best = lanes[0];
    let bestDist = Infinity;
    let contained = false;
    for (const lane of lanes) {
      if (cy >= lane.y && cy < lane.y + lane.h) {
        best = lane; contained = true; break;
      }
      const dist = Math.min(Math.abs(cy - lane.y), Math.abs(cy - (lane.y + lane.h)));
      if (!contained && dist < bestDist) { bestDist = dist; best = lane; }
    }
    return { ...n, laneId: best.id };
  });

  // 2. Stack lanes; compute each lane's required height and the shift to apply to its nodes.
  let cursorY = 20;
  const shiftByLane = {};

  const newLanes = lanes.map(lane => {
    const laneNodes = tagged.filter(n => n.laneId === lane.id);

    let height = LANE_MIN_H;
    if (laneNodes.length > 0) {
      // Measure how far down nodes extend, relative to the lane's *current* top.
      const maxBottomRel = Math.max(
        ...laneNodes.map(n => (n.y || 0) + (n.h || 100) - lane.y)
      );
      height = Math.max(LANE_MIN_H, maxBottomRel + LANE_PAD);
    }

    const newY = cursorY;
    shiftByLane[lane.id] = newY - lane.y; // how far this lane is moving
    cursorY += height;

    return { ...lane, y: newY, h: height };
  });

  // 3. Apply shifts to nodes so they ride along with their lane.
  const newNodes = tagged.map(n => ({
    ...n,
    y: Math.round((n.y || 0) + (shiftByLane[n.laneId] || 0))
  }));

  return { lanes: newLanes, nodes: newNodes };
}

export default function Diagram({ processId, focusNodeId, onBack, onLogout }) {
  const role = localStorage.getItem('role');
  const isViewer = role === 'viewer';

  const [process, setProcess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // View: fit-to-width (no horizontal scroll) vs classic (native size)
  const [fitWidth, setFitWidth] = useState(false);
  // Side panel open/close (edit mode)
  const [panelOpen, setPanelOpen] = useState(true);
  // Live size of the diagram container, for fit-to-screen scaling
  const [containerW, setContainerW] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const containerRef = useRef(null);

  const [hasDraft, setHasDraft] = useState(false);
  const [serverProcess, setServerProcess] = useState(null);
  const [modalAnchorRect, setModalAnchorRect] = useState(null);

  const processRef = useRef(process);
  const dirtyRef = useRef(dirty);
  useEffect(() => { processRef.current = process; }, [process]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  // Track the diagram container width so fit-to-width can scale correctly
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => { setContainerW(el.clientWidth); setContainerH(el.clientHeight); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editMode, panelOpen, loading]);

  // ---- Undo / redo history ----
  const historyRef = useRef([]);   // array of process snapshots
  const indexRef = useRef(-1);     // pointer into historyRef
  const lastTagRef = useRef(null); // coalescing tag of last commit
  const lastTimeRef = useRef(0);   // timestamp of last commit
  const HISTORY_CAP = 200;
  const [histMeta, setHistMeta] = useState({ canUndo: false, canRedo: false });

  function syncHistMeta() {
    setHistMeta({
      canUndo: indexRef.current > 0,
      canRedo: indexRef.current < historyRef.current.length - 1
    });
  }

  function resetHistory(p) {
    historyRef.current = p ? [p] : [];
    indexRef.current = p ? 0 : -1;
    lastTagRef.current = null;
    lastTimeRef.current = 0;
    syncHistMeta();
  }

  function applySnapshot(p) {
    setProcess(p);
    processRef.current = p;
    setDirty(true);
  }

  function undo() {
    if (indexRef.current <= 0) return;
    indexRef.current -= 1;
    lastTagRef.current = null;
    applySnapshot(historyRef.current[indexRef.current]);
    syncHistMeta();
  }

  function redo() {
    if (indexRef.current >= historyRef.current.length - 1) return;
    indexRef.current += 1;
    lastTagRef.current = null;
    applySnapshot(historyRef.current[indexRef.current]);
    syncHistMeta();
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [processId]);

  // When opened from the list with a focused node, open that node's popup.
  useEffect(() => {
    if (!loading && process && focusNodeId != null) {
      const exists = process.nodes.some(n => String(n.id) === String(focusNodeId));
      if (exists) {
        setEditMode(false);
        setSelection({ kind: 'node', id: focusNodeId });
        setModalAnchorRect(null);
      }
    }
    /* eslint-disable-next-line */
  }, [loading, focusNodeId]);

  useEffect(() => {
    if (dirty && process) {
      try { localStorage.setItem(DRAFT_KEY(processId), JSON.stringify(process)); } catch (e) { }
    }
  }, [process, dirty, processId]);

  useEffect(() => {
    function onBeforeUnload(e) {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (!editMode) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    /* eslint-disable-next-line */
  }, [editMode]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const p = await api.getProcess(processId);
      const normalized = normalizeProcess(p);
      setServerProcess(normalized);

      const draftStr = localStorage.getItem(DRAFT_KEY(processId));
      if (draftStr) {
        try {
          const draft = JSON.parse(draftStr);
          setProcess(draft);
          processRef.current = draft;
          resetHistory(draft);
          setHasDraft(true);
          setDirty(true);
        } catch {
          setProcess(normalized);
          processRef.current = normalized;
          resetHistory(normalized);
          setHasDraft(false);
          setDirty(false);
        }
      } else {
        setProcess(normalized);
        processRef.current = normalized;
        resetHistory(normalized);
        setHasDraft(false);
        setDirty(false);
      }
      setSelection(null);
    } catch (e) {
      setError(e.message);
      if (e.status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  }

  function discardDraft() {
    localStorage.removeItem(DRAFT_KEY(processId));
    setProcess(serverProcess);
    processRef.current = serverProcess;
    resetHistory(serverProcess);
    setHasDraft(false);
    setDirty(false);
    setSelection(null);
  }

  /**
   * Commit a change as an undo checkpoint.
   * Pass an optional `tag` so rapid edits to the same field (typing) coalesce
   * into a single history entry instead of one-per-keystroke.
   */
  function updateProcess(updater, tag) {
    const prev = processRef.current;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    if (next === prev) return;

    const now = Date.now();
    const coalesce = tag && tag === lastTagRef.current && (now - lastTimeRef.current) < 800
      && historyRef.current.length > 1;

    let hist = historyRef.current.slice(0, indexRef.current + 1);
    if (coalesce) {
      hist[hist.length - 1] = next;        // replace top — merge with previous edit
    } else {
      hist.push(next);
      while (hist.length > HISTORY_CAP) hist.shift();
    }
    historyRef.current = hist;
    indexRef.current = hist.length - 1;
    lastTagRef.current = tag || null;
    lastTimeRef.current = now;

    setProcess(next);
    processRef.current = next;
    setDirty(true);
    syncHistMeta();
  }

  /** Live update with no history checkpoint (used during drag). */
  function updateProcessLive(updater) {
    const prev = processRef.current;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    setProcess(next);
    processRef.current = next;
    setDirty(true);
  }

  async function save() {
    if (!process || saving) return;
    setSaving(true);
    try {
      await api.updateProcess(process.id, process);
      localStorage.removeItem(DRAFT_KEY(processId));
      setDirty(false);
      setHasDraft(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      alert('Yadda saxlanılmadı: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleEdit() {
    if (isViewer) return;
    setEditMode(!editMode);
    setSelection(null);
  }

  function logout() {
    setToken(null);
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    onLogout();
  }

  const onNodeClick = useCallback((nodeId, rect) => {
    setSelection({ kind: 'node', id: nodeId });
    setModalAnchorRect(rect || null);
  }, []);

  const onLaneClick = useCallback((laneIndex) => {
    if (!editMode) return;
    setSelection({ kind: 'lane', id: laneIndex });
  }, [editMode]);

  function closeModal() {
    setSelection(null);
    setModalAnchorRect(null);
  }

  /**
   * Called continuously during drag.
   * Updates the node's x, y, and laneId (based on which lane its center is in now).
   * Does NOT repack — that runs once on drag end for smoother dragging.
   */
  const onNodeMove = useCallback((nodeId, x, y) => {
    updateProcessLive(p => {
      const node = p.nodes.find(n => n.id === nodeId);
      if (!node) return p;

      const centerY = y + (node.h || 100) / 2;
      let targetLaneId = node.laneId;
      let bestDist = Infinity;
      let contained = false;

      for (const lane of p.lanes) {
        if (centerY >= lane.y && centerY < lane.y + lane.h) {
          targetLaneId = lane.id;
          contained = true;
          break;
        }
        const dist = Math.min(
          Math.abs(centerY - lane.y),
          Math.abs(centerY - (lane.y + lane.h))
        );
        if (!contained && dist < bestDist) {
          bestDist = dist;
          targetLaneId = lane.id;
        }
      }

      return {
        ...p,
        nodes: p.nodes.map(n =>
          n.id === nodeId ? { ...n, x, y, laneId: targetLaneId } : n
        )
      };
    });
  }, []);

  /**
   * Called once when the drag ends. Repacks the whole layout so lanes resize
   * to fit their nodes and stack cleanly top-to-bottom.
   */
  const onNodeMoveEnd = useCallback(() => {
    updateProcess(p => {
      const r = repackLanes(p.lanes, p.nodes);
      return { ...p, lanes: r.lanes, nodes: r.nodes };
    });
  }, []);

  /**
   * Create an edge by dragging from one node's side handle to another node.
   * Avoids duplicate edges between the same pair/sides.
   */
  const onCreateEdge = useCallback((fromId, fromSide, toId, toSide) => {
    updateProcess(p => {
      const exists = p.edges.some(e =>
        String(e.from) === String(fromId) &&
        String(e.to) === String(toId) &&
        (e.s || 'bottom') === fromSide &&
        (e.e || 'top') === toSide
      );
      if (exists) return p;
      return { ...p, edges: [...p.edges, { from: fromId, to: toId, s: fromSide, e: toSide }] };
    });
  }, []);

  const showModal = !editMode && selection?.kind === 'node' && process;

  return (
    <>
      <div className="topbar">
        <div className="top-left">
          <button className="pill-chip back-chip" onClick={onBack}>
            <ChevronLeft size={16} />
            <span className="label">{process?.title || '...'}</span>
          </button>
        </div>

        <LogoFull />

        <div className="top-right">
          {!editMode && (
            <button
              className={`pill-chip edit-chip nospace ${fitWidth ? 'active' : ''}`}
              onClick={() => setFitWidth(v => !v)}
              title={fitWidth ? 'Klassik görünüş' : 'Tam en (ekrana sığdır)'}
            >
              {fitWidth ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              <span>{fitWidth ? 'Klassik' : 'Tam en'}</span>
            </button>
          )}

          {!isViewer && editMode && !panelOpen && (
            <button
              className="pill-chip edit-chip nospace"
              onClick={() => setPanelOpen(true)}
              title="Paneli aç"
            >
              <PanelRightOpen size={16} />
              <span>Panel</span>
            </button>
          )}

          {!isViewer && editMode && (
            <div className="history-group">
              <button
                className="hist-btn"
                onClick={undo}
                disabled={!histMeta.canUndo}
                title="Geri al (Ctrl+Z)"
              >
                <Undo2 size={16} />
              </button>
              <button
                className="hist-btn"
                onClick={redo}
                disabled={!histMeta.canRedo}
                title="İrəli al (Ctrl+Shift+Z)"
              >
                <Redo2 size={16} />
              </button>
            </div>
          )}

          {!isViewer && editMode && (
            <button
              className={`pill-chip save-chip ${dirty ? 'dirty' : ''}`}
              onClick={save}
              disabled={saving || !dirty}
            >
              {saving
                ? <Loader2 size={16} className="spin" />
                : savedFlash
                  ? <CheckCircle2 size={16} />
                  : <Save size={16} />
              }
              <span>{saving ? 'Saxlanılır...' : savedFlash ? 'Saxlanıldı' : 'Yadda saxla'}</span>
            </button>
          )}

          {!isViewer && (
            <button className="pill-chip edit-chip nospace" onClick={toggleEdit}>
              {editMode ? <Eye size={16} /> : <Edit3 size={16} />}
              <span>{editMode ? 'Baxış' : 'Redaktə et'}</span>
            </button>
          )}

          <button className="logout-btn" onClick={logout}>
            <LogOut size={16} /><span>Çıxış</span>
          </button>
        </div>
      </div>

      {!isViewer && hasDraft && !editMode && (
        <div className="draft-banner">
          <AlertCircle size={15} />
          <span>Saxlanılmamış dəyişikliklər var.</span>
          <button className="draft-btn primary" onClick={() => setEditMode(true)}>
            Redaktəyə davam et
          </button>
          <button className="draft-btn" onClick={discardDraft}>Ləğv et</button>
        </div>
      )}

      <div className={`diagram-wrap ${editMode ? 'edit-mode' : ''}`}>
        <div className="diagram-main">
          <div
            className={`diagram-container ${fitWidth && !editMode ? 'fit' : ''}`}
            ref={containerRef}
          >
            {loading && (
              <div className="empty-state"><Loader2 size={20} className="spin" />Yüklənir...</div>
            )}
            {error && !loading && (
              <div className="empty-state error">{error}</div>
            )}
            {!loading && !error && process && (() => {
              const pad = 32; // container padding (16 each side)
              const dims = canvasDims(process);
              const availW = Math.max(0, containerW - pad);
              const availH = Math.max(0, containerH - pad);
              const fit = fitWidth && !editMode && dims.w && dims.h && availW && availH;
              const scale = fit
                ? Math.min(1, availW / dims.w, availH / dims.h)
                : 1;
              const wrapStyle = scale < 1
                ? {
                    width: dims.w,
                    height: dims.h,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left'
                  }
                : undefined;
              const canvas = (
                <DiagramCanvas
                  process={process}
                  selectedNodeId={editMode && selection?.kind === 'node' ? selection.id : null}
                  modalNodeId={!editMode && selection?.kind === 'node' ? selection.id : null}
                  editMode={!isViewer && editMode}
                  onNodeClick={onNodeClick}
                  onLaneClick={onLaneClick}
                  onNodeMove={onNodeMove}
                  onNodeMoveEnd={onNodeMoveEnd}
                  onCreateEdge={onCreateEdge}
                />
              );
              return scale < 1
                ? <div className="canvas-scale" style={wrapStyle}>{canvas}</div>
                : canvas;
            })()}
          </div>
        </div>

        {!isViewer && editMode && panelOpen && process && (
          <AdminPanel
            process={process}
            selection={selection}
            setSelection={setSelection}
            updateProcess={updateProcess}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>

      {showModal && (
        <NodeModal
          node={process.nodes.find(n => String(n.id) === String(selection.id))}
          onClose={closeModal}
          anchorRect={modalAnchorRect}
        />
      )}
    </>
  );
}

function normalizeProcess(p) {
  const lanes = (p.lanes || []).map((l, i) => ({
    id: l.id || `lane-${i + 1}`,
    label: l.label || '',
    y: l.y ?? 0,
    h: l.h ?? LANE_MIN_H
  }));
  return {
    ...p,
    width: p.width || 1200,
    height: p.height || 600,
    lanes,
    nodes: p.nodes || [],
    edges: p.edges || []
  };
}