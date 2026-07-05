// ============================================================================
// Shared convex-polygon helpers for arbitrary (non-rectangular) lots: point-in-
// polygon, distance-to-boundary (for setbacks), and Sutherland–Hodgman clipping
// of a subject polygon against a CONVEX clip polygon (CCW). Used to conform the
// parking field and ground zones to irregular / rounded / chamfered lots. Pure.
// ============================================================================

import type { Vec2 } from './vec';

/** Ray-cast point-in-polygon (works for convex or concave rings). */
export function pointInPolygon(p: Vec2, ring: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Shortest distance from point p to segment ab. */
function distToSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const apx = p.x - a.x, apy = p.y - a.y;
  const len2 = abx * abx + aby * aby || 1e-9;
  let t = (apx * abx + apy * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = a.x + t * abx - p.x, dy = a.y + t * aby - p.y;
  return Math.hypot(dx, dy);
}

/** Min distance from p to the polygon boundary (edges). */
export function distToBoundary(p: Vec2, ring: Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    d = Math.min(d, distToSeg(p, ring[i], ring[(i + 1) % ring.length]));
  }
  return d;
}

/** True if p is inside the ring AND at least `margin` from every edge (i.e.
 *  inside the polygon inset by `margin`). Correct for convex rings. */
export function insideWithMargin(p: Vec2, ring: Vec2[], margin: number): boolean {
  return pointInPolygon(p, ring) && distToBoundary(p, ring) >= margin;
}

/** True if every corner of the axis-aligned (in the given frame) rectangle is
 *  inside the convex ring with `margin` clearance → the whole rect is inside. */
export function rectInsideConvex(corners: Vec2[], ring: Vec2[], margin: number): boolean {
  for (const c of corners) if (!insideWithMargin(c, ring, margin)) return false;
  return true;
}

/** Sutherland–Hodgman: clip `subject` (any polygon) against a CONVEX `clip`
 *  polygon (CCW). Returns the clipped ring (possibly empty). */
export function clipConvex(subject: Vec2[], clip: Vec2[]): Vec2[] {
  let output = subject;
  const n = clip.length;
  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
  for (let i = 0; i < n && output.length > 0; i++) {
    const A = clip[i], B = clip[(i + 1) % n];
    const ex = B.x - A.x, ey = B.y - A.y;
    // interior is to the LEFT of directed edge A→B (CCW convex)
    const inside = (p: Vec2) => cross(ex, ey, p.x - A.x, p.y - A.y) >= -1e-9;
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j - 1 + input.length) % input.length];
      const curIn = inside(cur), prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) output.push(segEdgeIntersect(prev, cur, A, B));
        output.push(cur);
      } else if (prevIn) {
        output.push(segEdgeIntersect(prev, cur, A, B));
      }
    }
  }
  return output;
}

/** Intersection of segment p→q with the infinite line through edge A→B. */
function segEdgeIntersect(p: Vec2, q: Vec2, A: Vec2, B: Vec2): Vec2 {
  const ex = B.x - A.x, ey = B.y - A.y;
  const dx = q.x - p.x, dy = q.y - p.y;
  const denom = ex * dy - ey * dx || 1e-9;
  const t = (ex * (p.y - A.y) - ey * (p.x - A.x)) / denom;
  return { x: p.x - t * dx, y: p.y - t * dy };
}
