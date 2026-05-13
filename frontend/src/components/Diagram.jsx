import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, LogOut, Edit3, Eye, Save, Loader2, CheckCircle2 } from './icons.jsx';
import { LogoFull } from './Logo.jsx';
import { api, setToken } from '../api/client.js';
import DiagramCanvas from './DiagramCanvas.jsx';
import NodeModal from './NodeModal.jsx';
import AdminPanel from './AdminPanel.jsx';

export default function Diagram({ processId, onBack, onLogout }) {
  const [process, setProcess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selection: in view mode, opens a modal. In edit mode, populates the admin panel.
  // selection = { kind: 'node' | 'lane', id }
  const [selection, setSelection] = useState(null);

  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [processId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const p = await api.getProcess(processId);
      setProcess(normalizeProcess(p));
      setDirty(false);
      setSelection(null);
    } catch (e) {
      setError(e.message);
      if (e.status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  }

  function updateProcess(updater) {
    setProcess(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return next;
    });
    setDirty(true);
  }

  async function save() {
    if (!process || saving) return;
    setSaving(true);
    try {
      await api.updateProcess(process.id, process);
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      alert('Yadda saxlanılmadı: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleEdit() {
    if (editMode && dirty) {
      if (!confirm('Yadda saxlanmayan dəyişikliklər var. Davam etmək istəyirsiniz?')) return;
    }
    setEditMode(!editMode);
    setSelection(null);
  }

  function logout() {
    setToken(null);
    onLogout();
  }

  const onNodeClick = useCallback((nodeId) => {
    setSelection({ kind: 'node', id: nodeId });
  }, []);

  const onLaneClick = useCallback((laneIndex) => {
    if (!editMode) return;
    setSelection({ kind: 'lane', id: laneIndex });
  }, [editMode]);

  function closeModal() { setSelection(null); }

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
          {editMode && (
            <button
              className={`pill-chip save-chip ${dirty ? 'dirty' : ''}`}
              onClick={save}
              disabled={saving || !dirty}
            >
              {saving ? <Loader2 size={16} className="spin" /> :
                savedFlash ? <CheckCircle2 size={16} /> :
                <Save size={16} />}
              <span>{saving ? 'Saxlanılır...' : savedFlash ? 'Saxlanıldı' : 'Yadda saxla'}</span>
            </button>
          )}
          <button className="pill-chip edit-chip" onClick={toggleEdit}>
            {editMode ? <Eye size={16} /> : <Edit3 size={16} />}
            <span>{editMode ? 'Baxış' : 'Redaktə'}</span>
          </button>
          <button className="logout-btn" onClick={logout}>
            <LogOut size={16} /><span>Log out</span>
          </button>
        </div>
      </div>

      <div className={`diagram-wrap ${editMode ? 'edit-mode' : ''}`}>
        <div className="diagram-main">
          <div className="diagram-container">
            {loading && <div className="empty-state"><Loader2 size={20} className="spin" /> Yüklənir...</div>}
            {error && !loading && <div className="empty-state error">{error}</div>}
            {!loading && !error && process && (
              <DiagramCanvas
                process={process}
                selectedNodeId={editMode && selection?.kind === 'node' ? selection.id : null}
                modalNodeId={!editMode && selection?.kind === 'node' ? selection.id : null}
                editMode={editMode}
                onNodeClick={onNodeClick}
                onLaneClick={onLaneClick}
                onNodeMove={(nodeId, x, y) => {
                  updateProcess(p => ({
                    ...p,
                    nodes: p.nodes.map(n => n.id === nodeId ? { ...n, x, y } : n)
                  }));
                }}
              />
            )}
          </div>
        </div>

        {editMode && process && (
          <AdminPanel
            process={process}
            selection={selection}
            setSelection={setSelection}
            updateProcess={updateProcess}
          />
        )}
      </div>

      {!editMode && selection?.kind === 'node' && process && (
        <NodeModal
          node={process.nodes.find(n => String(n.id) === String(selection.id))}
          onClose={closeModal}
        />
      )}
    </>
  );
}

/**
 * Make sure a process loaded from backend has all expected fields.
 * Lane.id is generated if missing.
 */
function normalizeProcess(p) {
  const lanes = (p.lanes || []).map((l, i) => ({
    id: l.id || `lane-${i + 1}`,
    label: l.label || '',
    y: l.y ?? 0,
    h: l.h ?? 200
  }));
  return {
    ...p,
    width: p.width || 1600,
    height: p.height || 600,
    lanes,
    nodes: p.nodes || [],
    edges: p.edges || []
  };
}
