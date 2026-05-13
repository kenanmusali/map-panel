import { useState } from 'react';
import { Plus, Trash2, Pill, Square, SquareDashed } from './icons.jsx';

/**
 * Right-side editor panel. Three sections:
 *   1. PANELS — add / edit / delete lanes
 *   2. NODES — quick-add buttons for the 3 node types
 *   3. SELECTED — edit currently selected node or lane
 */
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

      <CanvasSection
        process={process}
        updateProcess={updateProcess}
      />
    </aside>
  );
}

/* =====================================================
   PANELS (Lanes) section
   ===================================================== */
function PanelsSection({ process, selection, setSelection, updateProcess }) {
  function addLane() {
    const lanes = process.lanes;
    const lastY = lanes.length ? (lanes[lanes.length - 1].y + lanes[lanes.length - 1].h) : 20;
    const newLane = {
      id: `lane-${Date.now()}`,
      label: `Yeni panel ${lanes.length + 1}`,
      y: lastY,
      h: 180
    };
    const newHeight = Math.max(process.height, lastY + 180 + 40);
    updateProcess(p => ({ ...p, lanes: [...p.lanes, newLane], height: newHeight }));
    setSelection({ kind: 'lane', id: process.lanes.length });
  }

  function deleteLane(index) {
    if (!confirm('Bu paneli silmək istəyirsiniz? Daxilindəki node-lar saxlanılacaq, amma yenidən mövqeyə salınması tələb oluna bilər.')) return;
    updateProcess(p => ({
      ...p,
      lanes: p.lanes.filter((_, i) => i !== index)
    }));
    setSelection(null);
  }

  return (
    <section className="panel-section">
      <header>
        <h3>PANELLƏR <span className="muted">({process.lanes.length})</span></h3>
        <button className="icon-btn" onClick={addLane} title="Yeni panel əlavə et">
          <Plus size={14} /> <span>Əlavə et</span>
        </button>
      </header>

      <div className="panel-list">
        {process.lanes.length === 0 && (
          <div className="hint">Hələ panel yoxdur. "Əlavə et" düyməsinə basın.</div>
        )}
        {process.lanes.map((lane, i) => {
          const isSel = selection?.kind === 'lane' && selection.id === i;
          return (
            <div
              key={lane.id}
              className={`panel-item ${isSel ? 'selected' : ''}`}
              onClick={() => setSelection({ kind: 'lane', id: i })}
            >
              <div className="panel-bar" />
              <div className="panel-name">{lane.label}</div>
              <div className="panel-meta">h: {lane.h}px</div>
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
    </section>
  );
}

/* =====================================================
   NODES section — quick-add 3 types
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
    if (process.lanes.length === 0) {
      alert('Əvvəlcə bir panel əlavə edin.');
      return;
    }
    const lane = process.lanes[Math.min(targetLane, process.lanes.length - 1)];
    const id = nextNodeId();
    const defaults = nodeDefaults(type);
    const node = {
      id,
      type,
      x: 80,
      y: lane.y + 20,
      ...defaults,
      text: `Yeni ${type === 'pill' ? 'başlangıc/son' : type === 'rect' ? 'addım' : 'alt-addım'}`,
      info: { general: [''], risks: [''] },
      diagramType: type === 'pill' ? 'start-end' : type === 'rect' ? 'process' : 'decision',
      popup: 'Yeni popup məlumatı'
    };
    updateProcess(p => ({ ...p, nodes: [...p.nodes, node] }));
    setSelection({ kind: 'node', id });
  }

  return (
    <section className="panel-section">
      <header>
        <h3>NODE ƏLAVƏ ET</h3>
      </header>

      <div className="field-row">
        <label className="lbl">Panel:</label>
        <select
          value={targetLane}
          onChange={e => setTargetLane(Number(e.target.value))}
          disabled={process.lanes.length === 0}
        >
          {process.lanes.length === 0 ? (
            <option>Panel yoxdur</option>
          ) : process.lanes.map((l, i) => (
            <option key={l.id} value={i}>{l.label}</option>
          ))}
        </select>
      </div>

      <div className="node-types">
        <button className="type-btn" onClick={() => addNode('pill')} title="Başlanğıc / son node">
          <div className="type-preview pill"><Pill size={14} /></div>
          <span>Pill</span>
          <small>Başlanğıc / son</small>
        </button>
        <button className="type-btn" onClick={() => addNode('rect')} title="Normal addım">
          <div className="type-preview rect"><Square size={14} /></div>
          <span>Rect</span>
          <small>Normal addım</small>
        </button>
        <button className="type-btn" onClick={() => addNode('stroke')} title="Alt-addım (kontur)">
          <div className="type-preview stroke"><SquareDashed size={14} /></div>
          <span>Stroke</span>
          <small>Alt-addım</small>
        </button>
      </div>
    </section>
  );
}

function nodeDefaults(type) {
  switch (type) {
    case 'pill':   return { w: 230, h: 100 };
    case 'rect':   return { w: 220, h: 90 };
    case 'stroke': return { w: 260, h: 80 };
    default:       return { w: 220, h: 90 };
  }
}

/* =====================================================
   SELECTED — properties of selected node or lane
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

  return <NodeEditor
    node={node}
    process={process}
    updateProcess={updateProcess}
    onDelete={() => setSelection(null)}
  />;
}

/* =====================================================
   Lane editor
   ===================================================== */
function LaneEditor({ lane, laneIndex, updateProcess, onDelete }) {
  function patch(field, value) {
    updateProcess(p => ({
      ...p,
      lanes: p.lanes.map((l, i) => i === laneIndex ? { ...l, [field]: value } : l)
    }));
  }

  return (
    <section className="panel-section">
      <header><h3>PANEL REDAKTƏSİ</h3></header>

      <div className="field-row col">
        <label>Ad (yeni sətr üçün <kbd>Enter</kbd>)</label>
        <textarea
          rows={3}
          value={lane.label}
          onChange={e => patch('label', e.target.value)}
        />
      </div>

      <div className="field-row two">
        <div>
          <label>Y (top)</label>
          <input type="number" value={lane.y} onChange={e => patch('y', Number(e.target.value))} />
        </div>
        <div>
          <label>Hündürlük</label>
          <input type="number" value={lane.h} onChange={e => patch('h', Number(e.target.value))} />
        </div>
      </div>

      <button className="btn danger" onClick={() => {
        if (!confirm('Bu paneli silmək istəyirsiniz?')) return;
        updateProcess(p => ({ ...p, lanes: p.lanes.filter((_, i) => i !== laneIndex) }));
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
  function patch(field, value) {
    updateProcess(p => ({
      ...p,
      nodes: p.nodes.map(n => String(n.id) === String(node.id) ? { ...n, [field]: value } : n)
    }));
  }

  function patchInfo(field, value) {
    const info = { ...(node.info || {}), [field]: value };
    patch('info', info);
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
        to:   String(e.to)   === String(node.id) ? parsed : e.to
      }))
    }));
  }

  function deleteNode() {
    if (!confirm('Bu node-u silmək istəyirsiniz?')) return;
    updateProcess(p => ({
      ...p,
      nodes: p.nodes.filter(n => String(n.id) !== String(node.id)),
      edges: p.edges.filter(e => String(e.from) !== String(node.id) && String(e.to) !== String(node.id))
    }));
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
          <input
            defaultValue={node.id}
            onBlur={e => changeId(e.target.value)}
            placeholder="1, 2, 5.1..."
          />
        </div>
        <div>
          <label>Tip</label>
          <select value={node.type} onChange={e => patch('type', e.target.value)}>
            <option value="pill">Pill (başlanğıc/son)</option>
            <option value="rect">Rect (normal)</option>
            <option value="stroke">Stroke (alt-addım)</option>
          </select>
        </div>
      </div>

      <div className="field-row col">
        <label>Mətn</label>
        <textarea
          rows={3}
          value={node.text}
          onChange={e => patch('text', e.target.value)}
        />
      </div>

      <div className="field-row four">
        <div><label>X</label><input type="number" value={node.x} onChange={e => patch('x', Number(e.target.value))} /></div>
        <div><label>Y</label><input type="number" value={node.y} onChange={e => patch('y', Number(e.target.value))} /></div>
        <div><label>En</label><input type="number" value={node.w} onChange={e => patch('w', Number(e.target.value))} /></div>
        <div><label>Hün.</label><input type="number" value={node.h} onChange={e => patch('h', Number(e.target.value))} /></div>
      </div>

      <details className="info-edit">
        <summary>Ümumi məlumat / Risklər (popup)</summary>
        <div className="field-row col">
          <label>Ümumi məlumat (hər abzas yeni sətrdə)</label>
          <textarea
            rows={5}
            value={(node.info?.general || []).join('\n\n')}
            onChange={e => patchInfo('general', e.target.value.split('\n\n').filter(Boolean))}
          />
        </div>
        <div className="field-row col">
          <label>Risklər (hər biri yeni sətrdə)</label>
          <textarea
            rows={4}
            value={(node.info?.risks || []).join('\n')}
            onChange={e => patchInfo('risks', e.target.value.split('\n').filter(Boolean))}
          />
        </div>
      </details>

      <EdgesEditor node={node} process={process} updateProcess={updateProcess} />

      <button className="btn danger" onClick={deleteNode}>
        <Trash2 size={14} /><span>Node-u sil</span>
      </button>
    </section>
  );
}

/* =====================================================
   Edges editor (per-node, outgoing connections)
   ===================================================== */
function EdgesEditor({ node, process, updateProcess }) {
  const [targetId, setTargetId] = useState('');
  const [sSide, setSSide] = useState('bottom');
  const [eSide, setESide] = useState('top');
  const [dashed, setDashed] = useState(false);

  const outgoing = process.edges
    .map((e, i) => ({ ...e, idx: i }))
    .filter(e => String(e.from) === String(node.id));

  function addEdge() {
    if (!targetId) { alert('Hədəf node seçin.'); return; }
    const target = process.nodes.find(n => String(n.id) === String(targetId));
    if (!target) { alert('Hədəf node tapılmadı.'); return; }
    const parsed = /^\d+$/.test(targetId) ? Number(targetId) : targetId;
    const newEdge = {
      from: node.id,
      to: parsed,
      s: sSide,
      e: eSide,
      dashed
    };
    updateProcess(p => ({ ...p, edges: [...p.edges, newEdge] }));
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
      <summary>Bu node-dan çıxan oxlar ({outgoing.length})</summary>

      <div className="edges-list">
        {outgoing.map(e => {
          const tgt = process.nodes.find(n => String(n.id) === String(e.to));
          return (
            <div key={e.idx} className="edge-item">
              <div className="edge-row">
                <span className="edge-arrow">→</span>
                <strong>#{e.to}</strong>
                <span className="edge-tgt">{tgt?.text?.slice(0, 30) || ''}{tgt?.text?.length > 30 ? '…' : ''}</span>
                <button className="icon-btn ghost danger" onClick={() => deleteEdge(e.idx)}><Trash2 size={12} /></button>
              </div>
              <div className="edge-row sm">
                <select value={e.s || 'bottom'} onChange={ev => updateEdge(e.idx, { s: ev.target.value })}>
                  <option value="top">üst</option>
                  <option value="right">sağ</option>
                  <option value="bottom">alt</option>
                  <option value="left">sol</option>
                </select>
                <span>→</span>
                <select value={e.e || 'top'} onChange={ev => updateEdge(e.idx, { e: ev.target.value })}>
                  <option value="top">üst</option>
                  <option value="right">sağ</option>
                  <option value="bottom">alt</option>
                  <option value="left">sol</option>
                </select>
                <label className="check">
                  <input type="checkbox" checked={!!e.dashed} onChange={ev => updateEdge(e.idx, { dashed: ev.target.checked })} />
                  <span>kəsik</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="edge-add">
        <div className="field-row col">
          <label>Yeni ox — hədəf node</label>
          <select value={targetId} onChange={e => setTargetId(e.target.value)}>
            <option value="">— Seç —</option>
            {otherNodes.map(n => (
              <option key={n.id} value={n.id}>#{n.id} — {n.text?.slice(0, 32)}</option>
            ))}
          </select>
        </div>
        <div className="field-row three">
          <select value={sSide} onChange={e => setSSide(e.target.value)}>
            <option value="top">üst</option><option value="right">sağ</option>
            <option value="bottom">alt</option><option value="left">sol</option>
          </select>
          <select value={eSide} onChange={e => setESide(e.target.value)}>
            <option value="top">üst</option><option value="right">sağ</option>
            <option value="bottom">alt</option><option value="left">sol</option>
          </select>
          <label className="check"><input type="checkbox" checked={dashed} onChange={e => setDashed(e.target.checked)} /><span>kəsik</span></label>
        </div>
        <button className="btn primary small" onClick={addEdge}>
          <Plus size={14} /><span>Ox əlavə et</span>
        </button>
      </div>
    </details>
  );
}

/* =====================================================
   Canvas size
   ===================================================== */
function CanvasSection({ process, updateProcess }) {
  return (
    <section className="panel-section">
      <header><h3>CANVAS ÖLÇÜSÜ</h3></header>
      <div className="field-row two">
        <div>
          <label>En</label>
          <input type="number" value={process.width}
            onChange={e => updateProcess(p => ({ ...p, width: Number(e.target.value) }))} />
        </div>
        <div>
          <label>Hündürlük</label>
          <input type="number" value={process.height}
            onChange={e => updateProcess(p => ({ ...p, height: Number(e.target.value) }))} />
        </div>
      </div>
      <div className="field-row col">
        <label>Başlıq</label>
        <input value={process.title}
          onChange={e => updateProcess(p => ({ ...p, title: e.target.value }))} />
      </div>
    </section>
  );
}
