// ============================================================================
// Sample store-lot factory. In the real pipeline the lot ring comes from an upstream
// block→lot subdivision (any convex polygon); here we synthesize a few shapes so
// the prototype can exercise non-rectangular lots: a plain rectangle, an
// irregular (skewed) quad, a rounded-corner lot (交差点の丸角), and a chamfered
// lot (交差点の隅切り). All are CCW convex, long axis +X, road to −Y. The
// generator itself accepts ANY convex `StoreLot.ring`.
// ============================================================================

import type { StoreLot, Vec2 } from './types';
import { centroidOf, signedArea } from '../../shared/vec';
import { rand01 } from '../../shared/rng';

export type LotShape = 'rectangle' | 'irregular-quad' | 'rounded-corner' | 'chamfered';

function lotFromRing(ring: Vec2[]): StoreLot {
  return {
    ring,
    baseZ: 0,
    areaM2: Math.abs(signedArea(ring)),
    centroid: centroidOf(ring),
    longestEdgeDir: { x: 1, y: 0 }, // street-parallel long axis
    primaryRoadId: 1,
    adjacentRoadIds: [1],
    roadDir: { x: 0, y: -1 }, // toward the road (south); frontage faces this way
  };
}

export function makeSampleStoreLot(
  width = 60,
  depth = 70,
  shape: LotShape = 'rectangle',
  seed = 1
): StoreLot {
  const hw = width / 2, hd = depth / 2;
  const r = (ch: number, ...ix: number[]) => rand01(seed, ch, ...ix);

  if (shape === 'irregular-quad') {
    // a skewed trapezoid: front/back widths differ, sides slightly sheared.
    const fw = width * (0.72 + 0.24 * r(1)); // front (road-side) width
    const bw = width * (0.72 + 0.24 * r(2)); // back width
    const skew = (r(3) - 0.5) * width * 0.18; // lateral shear
    const ring: Vec2[] = [
      { x: -fw / 2, y: -hd },
      { x: fw / 2, y: -hd },
      { x: bw / 2 + skew, y: hd },
      { x: -bw / 2 + skew, y: hd },
    ];
    return lotFromRing(ring);
  }

  if (shape === 'rounded-corner') {
    // rectangle with the two road-side corners rounded (an intersection lot).
    const rad = Math.min(hw, hd) * (0.28 + 0.22 * r(1));
    const seg = 5;
    const ring: Vec2[] = [];
    // start after the front-left rounding, go CCW: front edge → FR round → right
    // edge → back-right → back edge → back-left → left edge → FL round.
    ring.push({ x: -hw + rad, y: -hd });
    ring.push({ x: hw - rad, y: -hd });
    arc(ring, { x: hw - rad, y: -hd + rad }, rad, -Math.PI / 2, 0, seg); // FR
    ring.push({ x: hw, y: hd });
    ring.push({ x: -hw, y: hd });
    ring.push({ x: -hw, y: -hd + rad });
    arc(ring, { x: -hw + rad, y: -hd + rad }, rad, Math.PI, Math.PI * 1.5, seg); // FL
    return lotFromRing(dedup(ring));
  }

  if (shape === 'chamfered') {
    // rectangle with the two road-side corners cut off (隅切り).
    const c = Math.min(hw, hd) * (0.2 + 0.18 * r(1));
    const ring: Vec2[] = [
      { x: -hw + c, y: -hd },
      { x: hw - c, y: -hd },
      { x: hw, y: -hd + c },
      { x: hw, y: hd },
      { x: -hw, y: hd },
      { x: -hw, y: -hd + c },
    ];
    return lotFromRing(ring);
  }

  // rectangle
  return lotFromRing([
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ]);
}

/** Append a CCW arc (center, radius) from a0 to a1 as `seg` points. */
function arc(out: Vec2[], center: Vec2, radius: number, a0: number, a1: number, seg: number) {
  for (let i = 1; i < seg; i++) {
    const t = a0 + ((a1 - a0) * i) / seg;
    out.push({ x: center.x + radius * Math.cos(t), y: center.y + radius * Math.sin(t) });
  }
}

/** Drop consecutive near-duplicate points. */
function dedup(ring: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-6) out.push(p);
  }
  return out;
}
