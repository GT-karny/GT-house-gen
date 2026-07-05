// ============================================================================
// Shared 2D grid geometry — rasterize a union of axis-aligned rectangles onto an
// integer cell grid, then boundary-trace it into a single CCW ring. This is the
// marching-edge algorithm the house footprint/site code uses inline; extracted
// here so the store generator can compose L/box masses on a bay grid the same
// way (every wall length stays an exact multiple of the cell size). Pure logic.
// ============================================================================

import type { Vec2 } from './vec';

/** A rectangle in integer grid (cell) coordinates: [x0,x1) × [y0,y1). */
export interface GridRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Rasterize the union of grid rects into a set of occupied "gx,gy" cell keys. */
export function rasterizeRects(rects: GridRect[]): Set<string> {
  const cells = new Set<string>();
  for (const r of rects) {
    for (let gx = r.x0; gx < r.x1; gx++) {
      for (let gy = r.y0; gy < r.y1; gy++) cells.add(`${gx},${gy}`);
    }
  }
  return cells;
}

/** Remove collinear points from an axis-aligned integer ring. */
function simplifyRectilinear(ring: Vec2[]): Vec2[] {
  const n = ring.length;
  if (n < 3) return ring;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p = ring[(i - 1 + n) % n];
    const c = ring[i];
    const q = ring[(i + 1) % n];
    const collinear = (c.x - p.x) * (q.y - c.y) - (c.y - p.y) * (q.x - c.x) === 0;
    if (!collinear) out.push(c);
  }
  return out;
}

/**
 * Trace the CCW outer boundary of a rasterized cell set into a ring of integer
 * grid coordinates (collinear points removed). Emits directed edges (interior on
 * the left) then stitches them into one loop. Assumes a simply-connected region.
 */
export function traceBoundary(cells: Set<string>): Vec2[] {
  if (cells.size === 0) return [];
  const has = (x: number, y: number) => cells.has(`${x},${y}`);
  const edges = new Map<string, Vec2>();
  const key = (x: number, y: number) => `${x},${y}`;
  for (const c of cells) {
    const [gx, gy] = c.split(',').map(Number);
    if (!has(gx, gy - 1)) edges.set(key(gx, gy), { x: gx + 1, y: gy });
    if (!has(gx + 1, gy)) edges.set(key(gx + 1, gy), { x: gx + 1, y: gy + 1 });
    if (!has(gx, gy + 1)) edges.set(key(gx + 1, gy + 1), { x: gx, y: gy + 1 });
    if (!has(gx - 1, gy)) edges.set(key(gx, gy + 1), { x: gx, y: gy });
  }
  const start = edges.keys().next().value as string;
  const [sx, sy] = start.split(',').map(Number);
  const loop: Vec2[] = [];
  let cur = { x: sx, y: sy };
  const guard = edges.size + 4;
  for (let i = 0; i < guard; i++) {
    loop.push(cur);
    const nxt = edges.get(key(cur.x, cur.y));
    if (!nxt) break;
    if (nxt.x === sx && nxt.y === sy) break;
    cur = nxt;
  }
  return simplifyRectilinear(loop);
}
