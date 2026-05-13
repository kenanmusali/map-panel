import { useRef, useState } from 'react';

/**
 * Renders the diagram: lane rails on the left, lane separators, SVG edges, and nodes.
 * In edit mode, nodes can be dragged. Snap to 10px grid.
 */
export default function DiagramCanvas({
  process,
  selectedNodeId,
  modalNodeId,
  editMode,
  onNodeClick,
  onLaneClick,
  onNodeMove
}) {
  const canvasRef = useRef(null);
  const [drag, setDrag] = useState(null); // { nodeId, startX, startY, origX, origY }

  function onMouseDownNode(e, node) {
    if (!editMode) return;
    e.preventDefault();
    setDrag({
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y
    });
  }

  function onMouseMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    let nx = drag.origX + dx;
    let ny = drag.origY + dy;
    // snap to 10px grid
    nx = Math.max(0, Math.round(nx / 10) * 10);
    ny = Math.max(0, Math.round(ny / 10) * 10);
    onNodeMove(drag.nodeId, nx, ny);
  }

  function onMouseUp() {
    if (drag) setDrag(null);
  }

  const modalOpen = modalNodeId !== null && modalNodeId !== undefined;

  return (
    <div
      ref={canvasRef}
      className="diagram-canvas"
      style={{ width: process.width, height: process.height }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Lane rails (left vertical labels) */}
      {process.lanes.map((lane, idx) => (
        <div
          key={lane.id}
          className={`lane-rail ${selectedNodeId === null && (process.editLaneIndex === idx) ? 'selected' : ''}`}
          style={{ top: lane.y, height: lane.h }}
          onClick={(e) => { e.stopPropagation(); onLaneClick(idx); }}
        >
          <div className="lane-label">
            {lane.label.split('\n').map((line, i) => (
              <span key={i}>{line}{i < lane.label.split('\n').length - 1 && <br />}</span>
            ))}
          </div>
        </div>
      ))}

      {/* Lane separator rows */}
      {process.lanes.map((lane) => (
        <div
          key={'row-' + lane.id}
          className="lane-row"
          style={{ top: lane.y, height: lane.h }}
        />
      ))}

      {/* SVG edges */}
      <Edges process={process} />

      {/* Nodes */}
      {process.nodes.map((node) => {
        const isSelected = String(modalNodeId) === String(node.id) || String(selectedNodeId) === String(node.id);
        const dimmed = modalOpen && String(modalNodeId) !== String(node.id);
        const cls = [
          'node',
          node.type,
          isSelected ? 'selected' : '',
          dimmed ? 'dimmed' : '',
          editMode ? 'editable' : '',
          drag?.nodeId === node.id ? 'dragging' : ''
        ].filter(Boolean).join(' ');

        return (
          <div
            key={node.id}
            className={cls}
            style={{
              left: node.x,
              top: node.y,
              width: node.w,
              minHeight: node.h
            }}
            onMouseDown={(e) => onMouseDownNode(e, node)}
            onClick={(e) => {
              e.stopPropagation();
              if (drag) return;
              onNodeClick(node.id);
            }}
          >
            <div className="num">{node.id}</div>
            <div className="text">{node.text}</div>
            <div style={{fontSize:'10px',opacity:0.7,marginTop:'6px'}}>
              {node.diagramType || 'process'}
            </div>
            {node.popup && (
              <div title={node.popup} style={{
                marginTop:'6px',
                fontSize:'11px',
                background:'#ffffff22',
                padding:'4px',
                borderRadius:'6px'
              }}>
                popup
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ====== SVG EDGES ====== */

function Edges({ process }) {
  const nodeMap = Object.fromEntries(process.nodes.map(n => [String(n.id), n]));

  return (
    <svg className="edges" width={process.width} height={process.height}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
        </marker>
        <marker id="arrow-d" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#7ba0b3" />
        </marker>
      </defs>
      {process.edges.map((e, i) => {
        const from = nodeMap[String(e.from)];
        const to = nodeMap[String(e.to)];
        if (!from || !to) return null;
        const d = computePath(from, to, e.s || 'right', e.e || 'left', e.via);
        return (
          <path
            key={i}
            d={d}
            stroke={e.dashed ? '#7ba0b3' : 'var(--primary)'}
            strokeWidth="2"
            fill="none"
            strokeDasharray={e.dashed ? '5 5' : null}
            markerEnd={`url(#arrow${e.dashed ? '-d' : ''})`}
          />
        );
      })}
    </svg>
  );
}

function anchor(node, side) {
  const { x, y, w, h } = node;
  switch (side) {
    case 'top':    return { x: x + w / 2, y };
    case 'right':  return { x: x + w, y: y + h / 2 };
    case 'bottom': return { x: x + w / 2, y: y + h };
    case 'left':   return { x, y: y + h / 2 };
    default:       return { x: x + w / 2, y: y + h / 2 };
  }
}

function computePath(from, to, sSide, eSide, via) {
  const s = anchor(from, sSide);
  const e = anchor(to, eSide);
  if (via && via.length > 0) {
    let d = `M ${s.x} ${s.y}`;
    let prev = s;
    via.forEach(pt => {
      d += ` L ${pt.x} ${prev.y} L ${pt.x} ${pt.y}`;
      prev = pt;
    });
    d += ` L ${e.x} ${prev.y} L ${e.x} ${e.y}`;
    return d;
  }
  if (Math.abs(s.x - e.x) < 1) return `M ${s.x} ${s.y} L ${e.x} ${e.y}`;
  if (Math.abs(s.y - e.y) < 1) return `M ${s.x} ${s.y} L ${e.x} ${e.y}`;
  const sH = sSide === 'left' || sSide === 'right';
  const eH = eSide === 'left' || eSide === 'right';
  const sV = sSide === 'top' || sSide === 'bottom';
  const eV = eSide === 'top' || eSide === 'bottom';

  if (sV && eV) {
    const midY = (s.y + e.y) / 2;
    return `M ${s.x} ${s.y} L ${s.x} ${midY} L ${e.x} ${midY} L ${e.x} ${e.y}`;
  }
  if (sH && eH) {
    const midX = (s.x + e.x) / 2;
    return `M ${s.x} ${s.y} L ${midX} ${s.y} L ${midX} ${e.y} L ${e.x} ${e.y}`;
  }
  if (sV && eH) return `M ${s.x} ${s.y} L ${s.x} ${e.y} L ${e.x} ${e.y}`;
  if (sH && eV) return `M ${s.x} ${s.y} L ${e.x} ${s.y} L ${e.x} ${e.y}`;
  return `M ${s.x} ${s.y} L ${e.x} ${e.y}`;
}
