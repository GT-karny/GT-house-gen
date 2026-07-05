// ============================================================================
// Shared 2D vector math — used by BOTH the house generator (src/gen) and the
// roadside-store generator (src/store). Pure, no Three.js. This is the canonical
// implementation; src/gen/vec.ts re-exports from here so existing house code and
// tests keep their relative imports unchanged.
// ============================================================================

export interface Vec2 {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export function norm(a: Vec2): Vec2 {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 };
}
/** Rotate 90° clockwise: the outward normal of a CCW polygon edge. */
export const perpCW = (a: Vec2): Vec2 => ({ x: a.y, y: -a.x });

/** Map local (u,v) coords (long axis U, perp axis V) into world XY. */
export function localToWorld(u: number, w: number, center: Vec2, axisU: Vec2, axisV: Vec2): Vec2 {
  return {
    x: center.x + axisU.x * u + axisV.x * w,
    y: center.y + axisU.y * u + axisV.y * w,
  };
}

/** Shoelace signed area (m²). Positive = CCW. */
export function signedArea(ring: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function centroidOf(ring: Vec2[]): Vec2 {
  let cx = 0;
  let cy = 0;
  for (const p of ring) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / ring.length, y: cy / ring.length };
}
