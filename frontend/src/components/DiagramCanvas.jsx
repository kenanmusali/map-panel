// DiagramCanvas.jsx
import { useRef, useState, useMemo, useEffect } from 'react';

const SNAP_SIZE = 10;
const RAIL_W = 56;
const PAD_RIGHT = 80;
const PAD_BOTTOM = 40;
const MIN_W = 700;
const MIN_H = 300;
const CORNER_R = 10;          // path corner radius
const DRAG_THRESHOLD = 3;     // px before a mousedown counts as a drag

const SIDES = ['top', 'right', 'bottom', 'left'];

export default function DiagramCanvas({
  process,
  selectedNodeId,
  modalNodeId,
  editMode,
  onNodeClick,
  onLaneClick,
  onNodeMove,
  onNodeMoveEnd,
  onCreateEdge
}) {
  const canvasRef = useRef(null);
  const railLayerRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [hoverNodeId, setHoverNodeId] = useState(null);
  const [link, setLink] = useState(null);   // { fromId, fromSide, from:{x,y}, cur:{x,y}, overId }
  const didLinkRef = useRef(false);

  // ---- Canvas auto-fit to content ----
  const { canvasW, canvasH } = useMemo(() => {
    const contentRight = process.nodes.length
      ? Math.max(...process.nodes.map(n => (n.x || 0) + (n.w || 0)))
      : RAIL_W + 200;

    const contentBottom = process.lanes.length
      ? Math.max(...process.lanes.map(l => (l.y || 0) + (l.h || 0)))
      : 200;

    return {
      canvasW: Math.max(MIN_W, contentRight + PAD_RIGHT),
      canvasH: Math.max(MIN_H, contentBottom + PAD_BOTTOM)
    };
  }, [process.nodes, process.lanes]);

  // Pin lane rails to the left edge of the scroll viewport while scrolling
  // horizontally (counter-translate by scrollLeft). Vertical scroll is untouched,
  // so rails still move with their lanes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const scroller = canvas?.parentElement; // .diagram-container (overflow:auto)
    if (!canvas || !scroller) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const layer = railLayerRef.current;
      if (layer) layer.style.transform = `translateX(${scroller.scrollLeft}px)`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply(); // initial
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [canvasW, canvasH]);

  // Convert a mouse event into canvas-local coordinates
  function toCanvasPoint(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ---- Node drag handlers ----
  function onMouseDownNode(e, node) {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    setDrag({
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
      moved: false
    });
  }

  // ---- Link (drag-to-connect) handlers ----
  function onHandleMouseDown(e, node, side) {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();           // don't start a node drag
    const from = anchor(node, side);
    setLink({ fromId: node.id, fromSide: side, from, cur: from, overId: null });
  }

  function onMouseMove(e) {
    if (link) {
      setLink(prev => prev ? { ...prev, cur: toCanvasPoint(e) } : prev);
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    // Ignore tiny movements so clicks still count as clicks
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    let nx = Math.round((drag.origX + dx) / SNAP_SIZE) * SNAP_SIZE;
    let ny = Math.round((drag.origY + dy) / SNAP_SIZE) * SNAP_SIZE;
    nx = Math.max(RAIL_W + 4, nx);
    ny = Math.max(4, ny);

    if (!drag.moved) setDrag(prev => ({ ...prev, moved: true }));
    onNodeMove(drag.nodeId, nx, ny);
  }

  function finishLink(targetNode) {
    if (!link) return;
    if (targetNode && String(targetNode.id) !== String(link.fromId) && onCreateEdge) {
      const toSide = nearestSide(targetNode, link.cur);
      onCreateEdge(link.fromId, link.fromSide, targetNode.id, toSide);
      didLinkRef.current = true;
      setTimeout(() => { didLinkRef.current = false; }, 0);
    }
    setLink(null);
  }

  function endDrag() {
    if (link) { setLink(null); return; }   // released on empty canvas → cancel
    if (!drag) return;
    if (drag.moved && onNodeMoveEnd) onNodeMoveEnd(drag.nodeId);
    setDrag(null);
  }

  const modalOpen = modalNodeId !== null && modalNodeId !== undefined;

  return (
    <div
      ref={canvasRef}
      className={`diagram-canvas ${link ? 'linking' : ''}`}
      style={{ width: canvasW, height: canvasH }}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      {/* Lane rails (left vertical labels) — pinned horizontally on scroll */}
      <div className="rail-layer" ref={railLayerRef}>
        {process.lanes.map((lane, idx) => (
          <div
            key={lane.id}
            className="lane-rail"
            style={{ top: lane.y, height: lane.h, width: RAIL_W }}
            onClick={(e) => { e.stopPropagation(); onLaneClick(idx); }}
          >
            <div className="lane-label">
              {lane.label.split('\n').map((line, i, arr) => (
                <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Lane separator rows */}
      {process.lanes.map((lane) => (
        <div
          key={'row-' + lane.id}
          className="lane-row"
          style={{ top: lane.y, height: lane.h, left: RAIL_W }}
        />
      ))}

      {/* SVG edges */}
      <Edges process={process} width={canvasW} height={canvasH} />

      {/* Temp link preview while dragging a connection */}
      {link && (
        <svg
          className="link-preview"
          width={canvasW}
          height={canvasH}
          style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, overflow: 'visible', zIndex: 9 }}
        >
          <defs>
            <marker id="arrow-link" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
            </marker>
          </defs>
          <line
            x1={link.from.x} y1={link.from.y}
            x2={link.cur.x} y2={link.cur.y}
            stroke="var(--primary)" strokeWidth="2"
            strokeDasharray="5 5" strokeLinecap="round"
            markerEnd="url(#arrow-link)"
          />
        </svg>
      )}

      {/* Nodes */}
      {process.nodes.map((node) => {
        const isSelected =
          String(modalNodeId) === String(node.id) ||
          String(selectedNodeId) === String(node.id);
        const dimmed = modalOpen && !isSelected;
        const isLinkTarget = link && String(link.overId) === String(node.id) && String(link.fromId) !== String(node.id);
        const showHandles = editMode && !drag && (String(hoverNodeId) === String(node.id) || (link && String(link.fromId) === String(node.id)));

        const cls = [
          'node',
          node.type,
          isSelected ? 'selected' : '',
          dimmed ? 'dimmed' : '',
          editMode ? 'editable' : '',
          drag?.nodeId === node.id ? 'dragging' : '',
          isLinkTarget ? 'link-target' : ''
        ].filter(Boolean).join(' ');

        return (
          <div
            key={node.id}
            className={cls}
            style={{ left: node.x, top: node.y, width: node.w, minHeight: node.h }}
            onMouseDown={(e) => onMouseDownNode(e, node)}
            onMouseEnter={() => {
              setHoverNodeId(node.id);
              if (link) setLink(prev => prev ? { ...prev, overId: node.id } : prev);
            }}
            onMouseLeave={() => {
              setHoverNodeId(prev => (String(prev) === String(node.id) ? null : prev));
              if (link) setLink(prev => (prev && String(prev.overId) === String(node.id) ? { ...prev, overId: null } : prev));
            }}
            onMouseUp={(e) => {
              if (link) { e.stopPropagation(); finishLink(node); }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (drag?.moved) return;   // ignore click after drag
              if (didLinkRef.current) return; // ignore click right after linking
              const rect = e.currentTarget.getBoundingClientRect();
              onNodeClick(node.id, rect);
            }}
          >
            <div className="num">{node.id}</div>
            <div className="text">{node.text}</div>

            {showHandles && SIDES.map(side => (
              <div
                key={side}
                className={`link-handle ${side} ${node.type === 'diamond' ? 'on-diamond' : ''}`}
                title="Ox çəkmək üçün sürükləyin"
                onMouseDown={(e) => onHandleMouseDown(e, node, side)}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="link-dot" />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* Choose which side of the target the arrow enters, based on where the
   pointer was released relative to the target's box (predictable / Figma-like). */
function nearestSide(node, pt) {
  const dTop = Math.abs(pt.y - node.y);
  const dBottom = Math.abs(pt.y - (node.y + node.h));
  const dLeft = Math.abs(pt.x - node.x);
  const dRight = Math.abs(pt.x - (node.x + node.w));
  const min = Math.min(dTop, dBottom, dLeft, dRight);
  if (min === dTop) return 'top';
  if (min === dBottom) return 'bottom';
  if (min === dLeft) return 'left';
  return 'right';
}

/* ====== SVG EDGES ====== */
function Edges({ process, width, height }) {
  const nodeMap = Object.fromEntries(process.nodes.map(n => [String(n.id), n]));

  return (
    <svg
      className="edges"
      width={width}
      height={height}
      style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0.5 1 L 9 5 L 0.5 9 Z" fill="var(--primary)" />
        </marker>
        <marker id="arrow-d" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M 0.5 1 L 9 5 L 0.5 9 Z" fill="#7ba0b3" />
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
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={e.dashed ? '5 5' : null}
            markerEnd={`url(#arrow${e.dashed ? '-d' : ''})`}
          />
        );
      })}
    </svg>
  );
}

/* ====== PATH ROUTING ====== */

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

/**
 * Build a list of waypoints for an orthogonal path between two nodes.
 * Supports optional `via` waypoints (list of {x,y} points).
 */
function pathPoints(from, to, sSide, eSide, via) {
  const s = anchor(from, sSide);
  const e = anchor(to, eSide);

  // Via-waypoint routing — alternate axes around each via
  if (via && via.length > 0) {
    const pts = [s];
    let prev = s;
    for (const v of via) {
      pts.push({ x: v.x, y: prev.y });
      pts.push({ x: v.x, y: v.y });
      prev = v;
    }
    pts.push({ x: e.x, y: prev.y });
    pts.push(e);
    return dedupe(pts);
  }

  // Straight line if already aligned
  if (Math.abs(s.x - e.x) < 1 || Math.abs(s.y - e.y) < 1) return [s, e];

  const sH = sSide === 'left' || sSide === 'right';
  const eH = eSide === 'left' || eSide === 'right';
  const sV = sSide === 'top' || sSide === 'bottom';
  const eV = eSide === 'top' || eSide === 'bottom';

  if (sV && eV) {
    const midY = (s.y + e.y) / 2;
    return [s, { x: s.x, y: midY }, { x: e.x, y: midY }, e];
  }
  if (sH && eH) {
    const midX = (s.x + e.x) / 2;
    return [s, { x: midX, y: s.y }, { x: midX, y: e.y }, e];
  }
  if (sV && eH) return [s, { x: s.x, y: e.y }, e];
  if (sH && eV) return [s, { x: e.x, y: s.y }, e];

  return [s, e];
}

function dedupe(pts) {
  const r = [];
  for (const p of pts) {
    const last = r[r.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.5 || Math.abs(last.y - p.y) > 0.5) r.push(p);
  }
  return r;
}

/**
 * Convert a list of points into an SVG path string with rounded corners (radius r).
 * Each interior point becomes a quadratic Bézier curve.
 */
function roundedPath(points, r) {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dist1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const dist2 = Math.hypot(next.x - curr.x, next.y - curr.y);
    // Clamp radius so corners on short segments don't overshoot
    const rr = Math.min(r, dist1 / 2, dist2 / 2);

    if (rr < 0.5) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    const dx1 = (curr.x - prev.x) / dist1;
    const dy1 = (curr.y - prev.y) / dist1;
    const dx2 = (next.x - curr.x) / dist2;
    const dy2 = (next.y - curr.y) / dist2;

    const beforeX = curr.x - dx1 * rr;
    const beforeY = curr.y - dy1 * rr;
    const afterX  = curr.x + dx2 * rr;
    const afterY  = curr.y + dy2 * rr;

    d += ` L ${beforeX} ${beforeY} Q ${curr.x} ${curr.y} ${afterX} ${afterY}`;
  }

  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function computePath(from, to, sSide, eSide, via) {
  return roundedPath(pathPoints(from, to, sSide, eSide, via), CORNER_R);
}
