// Diagram.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, LogOut, Edit3, Eye, Save, Loader2, CheckCircle2, AlertCircle
} from './icons.jsx';
import { LogoFull } from './Logo.jsx';
import { api, setToken } from '../api/client.js';
import DiagramCanvas from './DiagramCanvas.jsx';
import NodeModal from './NodeModal.jsx';
import AdminPanel from './AdminPanel.jsx';

const DRAFT_KEY = (id) => `absheron_draft_${id}`;
const LANE_PAD = 20;
const LANE_MIN_H = 160;

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

export default function Diagram({ processId, onBack, onLogout }) {
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

  const [hasDraft, setHasDraft] = useState(false);
  const [serverProcess, setServerProcess] = useState(null);
  const [modalAnchorRect, setModalAnchorRect] = useState(null);

  const processRef = useRef(process);
  const dirtyRef = useRef(dirty);
  useEffect(() => { processRef.current = process; }, [process]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [processId]);

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
          setHasDraft(true);
          setDirty(true);
        } catch {
          setProcess(normalized);
          setHasDraft(false);
          setDirty(false);
        }
      } else {
        setProcess(normalized);
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
    setHasDraft(false);
    setDirty(false);
    setSelection(null);
  }

  function updateProcess(updater) {
    setProcess(prev => typeof updater === 'function' ? updater(prev) : updater);
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
    updateProcess(p => {
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
            <button className="pill-chip edit-chip" onClick={toggleEdit}>
              {editMode ? <Eye size={16} /> : <Edit3 size={16} />}
              <span>{editMode ? 'Baxış' : 'Redaktə et'}</span>
            </button>
          )}

          <button className="logout-btn" onClick={logout}>
            <LogOut size={16} /><span>Log out</span>
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
          <div className="diagram-container">
            {loading && (
              <div className="empty-state"><Loader2 size={20} className="spin" />Yüklənir...</div>
            )}
            {error && !loading && (
              <div className="empty-state error">{error}</div>
            )}
            {!loading && !error && process && (
              <DiagramCanvas
                process={process}
                selectedNodeId={editMode && selection?.kind === 'node' ? selection.id : null}
                modalNodeId={!editMode && selection?.kind === 'node' ? selection.id : null}
                editMode={!isViewer && editMode}
                onNodeClick={onNodeClick}
                onLaneClick={onLaneClick}
                onNodeMove={onNodeMove}
                onNodeMoveEnd={onNodeMoveEnd}
              />
            )}
          </div>
        </div>

        {!isViewer && editMode && process && (
          <AdminPanel
            process={process}
            selection={selection}
            setSelection={setSelection}
            updateProcess={updateProcess}
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