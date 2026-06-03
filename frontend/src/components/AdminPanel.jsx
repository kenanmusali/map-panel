// AdminPanel.jsx - Fixed with auto-height on drag
import { useState, useRef } from 'react';
import { Plus, Trash2, Pill, Square, SquareDashed, Diamond, BoxSelect, GripVertical, Eye, Archive } from './icons.jsx';

export default function AdminPanel({ process, selection, setSelection, updateProcess }) {
  return (
    <aside className="admin-panel">
      <PanelsSection
        process={process}
        selection={selection}
        setSelection={setSelection}
        updateProcess={updateProcess}
      />
      <NodesSection
        process={process}
        setSelection={setSelection}
        updateProcess={updateProcess}
      />
      <SelectedSection
        process={process}
        selection={selection}
        setSelection={setSelection}
        updateProcess={updateProcess}
      />
      <CanvasSection process={process} updateProcess={updateProcess} />
    </aside>
  );
}

/* =====================================================
   Repack lanes — recalculate y and auto-height based on nodes
   Min panel width 180px, height auto fits content
   ===================================================== */
function repackLanes(lanes, nodes) {
  let y = 20;
  return lanes.map(l => {
    // Calculate auto-height based on nodes in this lane
    const laneNodes = nodes.filter(n => n.laneId === l.id);
    let minHeight = 180; // Min height 180px
    if (laneNodes.length > 0) {
      const maxBottom = Math.max(...laneNodes.map(n => (n.y || 0) + (n.h || 100)));
      const laneTop = y;
      minHeight = Math.max(minHeight, maxBottom - laneTop + 40);
    }
    const packed = { ...l, y, h: minHeight };
    y += minHeight;
    return packed;
  });
}

/* =====================================================
   PANELS section
   ===================================================== */
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
      const newHeight = Math.max(p.height, repacked[repacked.length - 1]?.y + repacked[repacked.length - 1]?.h + 40 || 600);
      return { ...p, lanes: repacked, height: newHeight };
    });
    setNewPanelName('');
    setSelection({ kind: 'lane', id: process.lanes.length });
  }

  function deleteLane(index) {
    const laneToDelete = process.lanes[index];
    if (!confirm(`"${laneToDelete.label}" panelini silmək istəyirsiniz? Panel daxilindəki node-lar silinəcək.`)) return;
    
    updateProcess(p => {
      const remainingNodes = p.nodes.filter(node => node.laneId !== laneToDelete.id);
      const remainingLanes = p.lanes.filter((_, i) => i !== index);
      const repackedLanes = repackLanes(remainingLanes, remainingNodes);
      
      // Update node Y positions
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
      ...prev,
      lanes: prev.lanes.map(l => l.id === id ? { ...l, label: value } : l)
    }), `rename-${id}`);
  }

  function onDragStart(e, idx) {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(idx);
  }

  function onDrop(e, dropIdx) {
    e.preventDefault();
    const fromIdx = dragIdx.current;
    if (fromIdx === null || fromIdx === dropIdx) {
      setDragOver(null);
      return;
    }
    
    updateProcess(p => {
      const lanes = [...p.lanes];
      const [movedLane] = lanes.splice(fromIdx, 1);
      lanes.splice(dropIdx, 0, movedLane);
      
      const repacked = repackLanes(lanes, p.nodes);
      
      const updatedNodes = p.nodes.map(node => {
        const oldLane = p.lanes.find(l => l.id === node.laneId);
        const newLane = repacked.find(l => l.id === node.laneId);
        if (oldLane && newLane) {
          const yOffset = newLane.y - oldLane.y;
          return { ...node, y: node.y + yOffset };
        }
        return node;
      });
      
      return { ...p, lanes: repacked, nodes: updatedNodes };
    });
    
    if (selection?.kind === 'lane') setSelection(null);
    dragIdx.current = null;
    setDragOver(null);
  }

  function onDragEnd() {
    dragIdx.current = null;
    setDragOver(null);
  }

  return (
    <section className="panel-section">
      <header>
        <h3>PANELLƏR <span className="muted">({process.lanes.length})</span></h3>
        <button className="icon-btn" onClick={addLane} title="Yeni panel əlavə et">
          <Plus size={14} /> <span>Əlavə et</span>
        </button>
      </header>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          value={newPanelName}
          onChange={e => setNewPanelName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addLane()}
          placeholder="Yeni panel adı"
          style={{ flex: 1, padding: '10px' }}
        />
      </div>

      <div className="panel-list">
        {process.lanes.length === 0 && (
          <div className="hint">Hələ panel yoxdur. "Əlavə et" düyməsinə basın.</div>
        )}
        {process.lanes.map((lane, i) => {
          const isSel = selection?.kind === 'lane' && selection.id === i;
          const isDragTarget = dragOver === i;
          const nodeCount = process.nodes.filter(n => n.laneId === lane.id).length;
          return (
            <div
              key={lane.id}
              className={`panel-item ${isSel ? 'selected' : ''} ${isDragTarget ? 'drag-over' : ''}`}
              onClick={() => setSelection({ kind: 'lane', id: i })}
              draggable
              onDragStart={e => onDragStart(e, i)}
              onDragOver={e => onDragOver(e, i)}
              onDrop={e => onDrop(e, i)}
              onDragEnd={onDragEnd}
            >
              <div className="drag-handle" title="Sürükləyin">
                <GripVertical size={14} />
              </div>
              <div className="panel-bar" />
              <input
                value={lane.label}
                onChange={e => renamePanel(lane.id, e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{ flex: 1, padding: '4px 6px', marginRight: '8px', fontSize: '14px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <div className="panel-meta">{nodeCount} node | h: {lane.h}px</div>
              <button
                className="icon-btn ghost danger"
                onClick={(e) => { e.stopPropagation(); deleteLane(i); }}
                title="Sil"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="field-row two" style={{ marginTop: '16px', gap: '8px' }}>
        <button className="btn" onClick={() => updateProcess(prev => ({ ...prev, archived: !prev.archived }))}>
          {process.archived ? 'Arxivdən çıxar' : 'Arxiv et'}
        </button>
        {process.archived && (
          <button className="btn danger" onClick={() => {
            if (confirm('Bu prosesi tamamilə silmək istəyirsiniz? Bu əməliyyat geri alına bilməz.')) {
              updateProcess(prev => ({ ...prev, deleted: true }));
            }
          }}>
            <Trash2 size={14} /> <span>Sil</span>
          </button>
        )}
      </div>
    </section>
  );
}

/* =====================================================
   NODES section - vertical stacking
   ===================================================== */
function NodesSection({ process, setSelection, updateProcess }) {
  const [targetLane, setTargetLane] = useState(0);

  function nextNodeId() {
    const used = process.nodes.map(n => n.id);
    let n = 1;
    while (used.includes(n) || used.includes(String(n))) n++;
    return n;
  }

  function addNode(type) {
    if (process.lanes.length === 0) { alert('Əvvəlcə bir panel əlavə edin.'); return; }
    const lane = process.lanes[Math.min(targetLane, process.lanes.length - 1)];
    const id = nextNodeId();
    const defaults = nodeDefaults(type);
    
    // Vertical stacking - find bottommost node in this lane
    const laneNodes = process.nodes.filter(n => n.laneId === lane.id);
    let y = lane.y + 20;
    if (laneNodes.length > 0) {
      const maxBottom = Math.max(...laneNodes.map(n => (n.y || 0) + (n.h || 100)));
      y = maxBottom + 20;
    }
    
    const labelByType = {
      pill: 'başlanğıc/son',
      rect: 'addım',
      stroke: 'alt-addım',
      diamond: 'qərar',
      dashed: 'alt-addım (kəsik)'
    };
    const node = {
      id, type, x: lane.y + 80, y, laneId: lane.id, ...defaults,
      text: `Yeni ${labelByType[type] || 'addım'}`,
      info: { general: [''], risks: [''] }
    };
    
    updateProcess(p => {
      const newNodes = [...p.nodes, node];
      const repackedLanes = repackLanes(p.lanes, newNodes);
      return { ...p, nodes: newNodes, lanes: repackedLanes };
    });
    setSelection({ kind: 'node', id });
  }

  return (
    <section className="panel-section">
      <header><h3>NODE ƏLAVƏ ET</h3></header>
      <div className="field-row">
        <label className="lbl">Panel:</label>
        <select value={targetLane} onChange={e => setTargetLane(Number(e.target.value))} disabled={process.lanes.length === 0}>
          {process.lanes.length === 0
            ? <option>Panel yoxdur</option>
            : process.lanes.map((l, i) => <option key={l.id} value={i}>{l.label}</option>)
          }
        </select>
      </div>
      <div className="node-types">
        <button className="type-btn" onClick={() => addNode('pill')}>
          <div className="type-preview pill"><Pill size={14} /></div>
          <span>Pill</span><small>Başlanğıc/son</small>
        </button>
        <button className="type-btn" onClick={() => addNode('rect')}>
          <div className="type-preview rect"><Square size={14} /></div>
          <span>Rect</span><small>Normal addım</small>
        </button>
        <button className="type-btn" onClick={() => addNode('stroke')}>
          <div className="type-preview stroke"><SquareDashed size={14} /></div>
          <span>Stroke</span><small>Alt-addım</small>
        </button>
        <button className="type-btn" onClick={() => addNode('diamond')}>
          <div className="type-preview diamond"><Diamond size={14} /></div>
          <span>Romb</span><small>Qərar (4 ox)</small>
        </button>
        <button className="type-btn" onClick={() => addNode('dashed')}>
          <div className="type-preview dashed"><BoxSelect size={14} /></div>
          <span>Kəsik</span><small>Kəsik sərhəd</small>
        </button>
      </div>
    </section>
  );
}

function nodeDefaults(type) {
  switch (type) {
    case 'pill': return { w: 200, h: 50 };
    case 'rect': return { w: 200, h: 70 };
    case 'stroke': return { w: 220, h: 60 };
    case 'diamond': return { w: 150, h: 150 };
    case 'dashed': return { w: 220, h: 60 };
    default: return { w: 200, h: 70 };
  }
}

/* =====================================================
   SELECTED
   ===================================================== */
function SelectedSection({ process, selection, setSelection, updateProcess }) {
  if (!selection) {
    return (
      <section className="panel-section">
        <header><h3>SEÇİLMİŞ</h3></header>
        <div className="hint">Redaktə etmək üçün canvas-da node və ya panelə klikləyin.</div>
      </section>
    );
  }

  if (selection.kind === 'lane') {
    return <LaneEditor
      lane={process.lanes[selection.id]}
      laneIndex={selection.id}
      process={process}
      updateProcess={updateProcess}
      onDelete={() => setSelection(null)}
    />;
  }

  const node = process.nodes.find(n => String(n.id) === String(selection.id));
  if (!node) return (
    <section className="panel-section">
      <header><h3>SEÇİLMİŞ</h3></header>
      <div className="hint">Node tapılmadı.</div>
    </section>
  );

  return <NodeEditor node={node} process={process} updateProcess={updateProcess} onDelete={() => setSelection(null)} />;
}

/* =====================================================
   Lane editor
   ===================================================== */
function LaneEditor({ lane, laneIndex, process, updateProcess, onDelete }) {
  function patch(field, value) {
    updateProcess(p => {
      const newLanes = p.lanes.map((l, i) => i === laneIndex ? { ...l, [field]: value } : l);
      const repacked = repackLanes(newLanes, p.nodes);
      return { ...p, lanes: repacked };
    }, `lane-${laneIndex}-${field}`);
  }

  function recalcHeight() {
    updateProcess(p => {
      const repacked = repackLanes(p.lanes, p.nodes);
      return { ...p, lanes: repacked };
    });
  }

  const nodeCount = process.nodes.filter(n => n.laneId === lane.id).length;

  return (
    <section className="panel-section">
      <header><h3>PANEL REDAKTƏSİ</h3></header>
      <div className="field-row col">
        <label>Ad</label>
        <textarea rows={3} value={lane.label} onChange={e => patch('label', e.target.value)} />
      </div>
      <div className="field-row two">
        <div>
          <label>Y (top)</label>
          <input type="number" value={lane.y} onChange={e => patch('y', Number(e.target.value))} />
        </div>
        <div>
          <label>Min Hündürlük</label>
          <input type="number" value={lane.h} onChange={e => patch('h', Number(e.target.value))} />
        </div>
      </div>
      <div className="hint" style={{ marginBottom: '12px' }}>
        Panel daxilində {nodeCount} node var. Hündürlük avtomatik olaraq node-lara uyğun tənzimlənir.
        <button className="icon-btn" onClick={recalcHeight} style={{ marginLeft: '8px' }}>Yenilə</button>
      </div>
      <button className="btn danger" onClick={() => {
        if (!confirm('Bu paneli silmək istəyirsiniz?')) return;
        updateProcess(p => {
          const remainingNodes = p.nodes.filter(n => n.laneId !== lane.id);
          const remainingLanes = p.lanes.filter((_, i) => i !== laneIndex);
          const repacked = repackLanes(remainingLanes, remainingNodes);
          return { ...p, lanes: repacked, nodes: remainingNodes };
        });
        onDelete();
      }}>
        <Trash2 size={14} /><span>Paneli sil</span>
      </button>
    </section>
  );
}

/* =====================================================
   Node editor
   ===================================================== */
function NodeEditor({ node, process, updateProcess, onDelete }) {
  const [showPreview, setShowPreview] = useState(false);

  function patch(field, value) {
    updateProcess(p => {
      const newNodes = p.nodes.map(n => String(n.id) === String(node.id) ? { ...n, [field]: value } : n);
      const repacked = repackLanes(p.lanes, newNodes);
      return { ...p, nodes: newNodes, lanes: repacked };
    }, `node-${node.id}-${field}`);
  }

  function patchInfo(field, value) {
    patch('info', { ...(node.info || {}), [field]: value });
  }

  function changeId(newId) {
    if (newId === String(node.id)) return;
    const exists = process.nodes.some(n => String(n.id) === newId);
    if (exists) { alert('Bu ID artıq istifadə olunur.'); return; }
    const parsed = /^\d+$/.test(newId) ? Number(newId) : newId;
    updateProcess(p => ({
      ...p,
      nodes: p.nodes.map(n => String(n.id) === String(node.id) ? { ...n, id: parsed } : n),
      edges: p.edges.map(e => ({
        ...e,
        from: String(e.from) === String(node.id) ? parsed : e.from,
        to: String(e.to) === String(node.id) ? parsed : e.to
      }))
    }));
  }

  function deleteNode() {
    if (!confirm('Bu node-u silmək istəyirsiniz?')) return;
    updateProcess(p => {
      const newNodes = p.nodes.filter(n => String(n.id) !== String(node.id));
      const newEdges = p.edges.filter(e => String(e.from) !== String(node.id) && String(e.to) !== String(node.id));
      const repacked = repackLanes(p.lanes, newNodes);
      return { ...p, nodes: newNodes, edges: newEdges, lanes: repacked };
    });
    onDelete();
  }

  return (
    <section className="panel-section">
      <header>
        <h3>NODE #{node.id}</h3>
        <span className={`type-badge ${node.type}`}>{node.type}</span>
      </header>

      <div className="field-row two">
        <div>
          <label>ID</label>
          <input defaultValue={node.id} onBlur={e => changeId(e.target.value)} />
        </div>
        <div>
          <label>Tip</label>
          <select value={node.type} onChange={e => patch('type', e.target.value)}>
            <option value="pill">Pill</option>
            <option value="rect">Rect</option>
            <option value="stroke">Stroke</option>
            <option value="diamond">Romb</option>
            <option value="dashed">Kəsik</option>
          </select>
        </div>
      </div>

      <div className="field-row col">
        <label>Mətn</label>
        <textarea rows={3} value={node.text} onChange={e => patch('text', e.target.value)} />
      </div>

      <div className="field-row four">
        <div><label>X</label><input type="number" value={node.x} onChange={e => patch('x', Number(e.target.value))} /></div>
        <div><label>Y</label><input type="number" value={node.y} onChange={e => patch('y', Number(e.target.value))} /></div>
        <div><label>En</label><input type="number" value={node.w} onChange={e => patch('w', Number(e.target.value))} /></div>
        <div><label>Hün.</label><input type="number" value={node.h} onChange={e => patch('h', Number(e.target.value))} /></div>
      </div>

      <div className="field-row col">
        <label>Panel</label>
        <select value={node.laneId || ''} onChange={e => patch('laneId', e.target.value)}>
          <option value="">— Seç —</option>
          {process.lanes.map(lane => (
            <option key={lane.id} value={lane.id}>{lane.label}</option>
          ))}
        </select>
      </div>

      <details className="info-edit">
        <summary>Ümumi məlumat / Risklər</summary>
        <div className="field-row col">
          <label>Ümumi məlumat</label>
          <textarea
            rows={5}
            value={(node.info?.general || []).join('\n\n')}
            onChange={e => patchInfo('general', e.target.value.split('\n\n').filter(Boolean))}
          />
        </div>
        <div className="field-row col">
          <label>Risklər</label>
          <textarea
            rows={4}
            value={(node.info?.risks || []).join('\n')}
            onChange={e => patchInfo('risks', e.target.value.split('\n').filter(Boolean))}
          />
        </div>
        <button className="btn preview-btn" onClick={() => setShowPreview(v => !v)}>
          <Eye size={14} />
          <span>{showPreview ? 'Bağla' : 'Önizlə'}</span>
        </button>
        {showPreview && <PopupPreview node={node} />}
      </details>

      <EdgesEditor node={node} process={process} updateProcess={updateProcess} />

      <button className="btn danger" onClick={deleteNode}>
        <Trash2 size={14} /><span>Node-u sil</span>
      </button>
    </section>
  );
}

function PopupPreview({ node }) {
  const info = node.info || { general: [], risks: [] };
  const general = Array.isArray(info.general) ? info.general.filter(Boolean) : [];
  const risks = Array.isArray(info.risks) ? info.risks.filter(Boolean) : [];

  return (
    <div className="popup-preview-card">
      <div className="popup-preview-title">{node.text}</div>
      {general.map((p, i) => <p key={i} className="popup-preview-p">{p}</p>)}
      {risks.length > 0 && (
        <>
          <div className="popup-preview-heading preview-risks">⚠️ Risklər:</div>
          <ul className="popup-preview-list">
            {risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

function EdgesEditor({ node, process, updateProcess }) {
  const [targetId, setTargetId] = useState('');
  const [sSide, setSSide] = useState('bottom');
  const [eSide, setESide] = useState('top');
  const [dashed, setDashed] = useState(false);

  const outgoing = process.edges.filter(e => String(e.from) === String(node.id));

  function addEdge() {
    if (!targetId) { alert('Hədəf node seçin.'); return; }
    const target = process.nodes.find(n => String(n.id) === String(targetId));
    if (!target) { alert('Hədəf node tapılmadı.'); return; }
    updateProcess(p => ({ ...p, edges: [...p.edges, { from: node.id, to: targetId, s: sSide, e: eSide, dashed }] }));
    setTargetId('');
  }

  function deleteEdge(idx) {
    updateProcess(p => ({ ...p, edges: p.edges.filter((_, i) => i !== idx) }));
  }

  function updateEdge(idx, patch) {
    updateProcess(p => ({
      ...p,
      edges: p.edges.map((e, i) => i === idx ? { ...e, ...patch } : e)
    }));
  }

  const otherNodes = process.nodes.filter(n => String(n.id) !== String(node.id));

  return (
    <details className="edges-edit" open>
      <summary>Oxlar ({outgoing.length})</summary>
      <div className="edges-list">
        {outgoing.map((e, idx) => {
          const tgt = process.nodes.find(n => String(n.id) === String(e.to));
          return (
            <div key={idx} className="edge-item">
              <div className="edge-row">
                <span>→ #{e.to}</span>
                <span className="edge-tgt">{tgt?.text?.slice(0, 30)}</span>
                <button className="icon-btn ghost danger" onClick={() => deleteEdge(idx)}><Trash2 size={12} /></button>
              </div>
              <div className="edge-row sm">
                <select value={e.s || 'bottom'} onChange={ev => updateEdge(idx, { s: ev.target.value })}>
                  <option value="top">üst</option><option value="right">sağ</option>
                  <option value="bottom">alt</option><option value="left">sol</option>
                </select>
                <span>→</span>
                <select value={e.e || 'top'} onChange={ev => updateEdge(idx, { e: ev.target.value })}>
                  <option value="top">üst</option><option value="right">sağ</option>
                  <option value="bottom">alt</option><option value="left">sol</option>
                </select>
                <label className="check">
                  <input type="checkbox" checked={!!e.dashed} onChange={ev => updateEdge(idx, { dashed: ev.target.checked })} />
                  <span>kəsik</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>
      <div className="edge-add">
        <select value={targetId} onChange={e => setTargetId(e.target.value)}>
          <option value="">— Seç —</option>
          {otherNodes.map(n => <option key={n.id} value={n.id}>#{n.id} — {n.text?.slice(0, 32)}</option>)}
        </select>
        <div className="field-row three">
          <select value={sSide} onChange={e => setSSide(e.target.value)}>
            <option value="top">üst</option><option value="right">sağ</option>
            <option value="bottom">alt</option><option value="left">sol</option>
          </select>
          <select value={eSide} onChange={e => setESide(e.target.value)}>
            <option value="top">üst</option><option value="right">sağ</option>
            <option value="bottom">alt</option><option value="left">sol</option>
          </select>
          <label className="check">
            <input type="checkbox" checked={dashed} onChange={e => setDashed(e.target.checked)} />
            <span>kəsik</span>
          </label>
        </div>
        <button className="btn primary small" onClick={addEdge}>
          <Plus size={14} /> Ox əlavə et
        </button>
      </div>
    </details>
  );
}

/* =====================================================
   Canvas Section - width 100%, height auto fit content
   ===================================================== */
function CanvasSection({ process, updateProcess }) {
  return (
    <section className="panel-section">
      <header><h3>CANVAS ÖLÇÜSÜ</h3></header>
      <div className="field-row two">
        <div>
          <label>En (px)</label>
          <input 
            type="number" 
            value={process.width} 
            onChange={e => updateProcess(p => ({ ...p, width: Number(e.target.value) }))}
            style={{ width: '100%' }}
          />
          <small style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Minimal en 800px</small>
        </div>
      </div>
      <div className="hint">
        Hündürlük avtomatik tənzimlənir. Panel hündürlükləri node-lara uyğun olaraq dəyişir.
      </div>
    </section>
  );
}