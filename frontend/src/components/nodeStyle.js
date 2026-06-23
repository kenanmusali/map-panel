// Node shapes and border styles.
// A node has a SHAPE (geometry) and a STYLE (how its border/fill looks).
//
//   STYLE:
//     solid  (Tam)   — filled primary background, white text
//     stroke         — white background, SOLID border, dark text
//     dashed (Kəsik) — white background, DASHED border, dark text

export const SHAPES = ['pill', 'rect', 'diamond', 'parallelogram'];
export const STYLES = ['solid', 'stroke', 'dashed'];

export const SHAPE_LABEL = {
  pill: 'Pill',
  rect: 'Rectangle',
  diamond: 'Romb',
  parallelogram: 'Parallel',
};

export const STYLE_LABEL = {
  solid: 'Tam',
  stroke: 'Stroke',
  dashed: 'Kəsik',
};

// Resolve a node's { shape, style }, keeping older data working:
//  - legacy type 'stroke'  -> rect + stroke
//  - legacy type 'dashed'  -> rect + dashed
//  - legacy `dash:true`    -> dashed
export function nodeView(node) {
  let shape = node.type;
  let style = node.style;

  if (shape === 'stroke') { shape = 'rect'; if (!style) style = 'stroke'; }
  else if (shape === 'dashed') { shape = 'rect'; if (!style) style = 'dashed'; }

  if (!style) style = node.dash ? 'dashed' : 'solid';

  if (!SHAPES.includes(shape)) shape = 'rect';
  if (!STYLES.includes(style)) style = 'solid';
  return { shape, style };
}

export function nodeDefaults(shape) {
  switch (shape) {
    case 'pill': return { w: 200, h: 50 };
    case 'rect': return { w: 200, h: 70 };
    case 'diamond': return { w: 150, h: 150 };
    case 'parallelogram': return { w: 210, h: 70 };
    default: return { w: 200, h: 70 };
  }
}
