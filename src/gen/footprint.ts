// ============================================================================
// Footprint generator — composed rectangular masses, now with per-mass storey
// counts so a 下屋 (single-storey wing) steps below the 総二階 main box.
//
// Masses are composed on an INTEGER BAY GRID (cells = panelW) then rasterized +
// boundary-traced. Working on the grid guarantees every wall length is an exact
// multiple of panelW (no fractional bays). We emit ONE union ring PER STOREY
// (tier): tier t = union of the masses that are still present at floor t. The
// ground tier is the full outline; upper tiers drop the 下屋 wings, so the
// facade and roof step naturally.
// ============================================================================

import type { GenConfig, ArchetypeName } from './config';
import type { Lot, MassInfo, Vec2, HousePad } from './types';
import { Rng, weightedPick } from './rng';
import { add, scale, localToWorld, norm } from './vec';

/** A mass in integer bay coordinates (grid units), axis-aligned in local frame. */
interface BayRect {
  x0: number; // inclusive
  y0: number;
  x1: number; // exclusive
  y1: number;
  floors: number;
}

export interface FootprintTier {
  floor: number; // 0-based storey this ring bounds
  ring: Vec2[]; // world-XY CCW ring
}

export interface FootprintResult {
  ring: Vec2[]; // ground union ring (full outline), world-XY
  tiers: FootprintTier[]; // per-storey rings
  masses: MassInfo[]; // world OBBs tagged with storey count
  archetype: ArchetypeName;
}

/** Compose the source rectangles for an archetype, in integer bay coords.
 *  `notch` is an optional subtractive region carved from the GROUND floor front
 *  — a recessed 玄関ポーチ that the upper floor cantilevers over. */
function composeMasses(
  cfg: GenConfig,
  rng: Rng,
  clampBays: { w: number; d: number } | null
): { rects: BayRect[]; name: ArchetypeName; notch: BayRect | null } {
  const name = weightedPick(cfg.archetypeWeights, rng.next());
  const F = cfg.floors;
  const wingFloors = cfg.downWings ? 1 : F; // 下屋 = single storey when enabled

  // When a lot pad is given, the whole composition (core + wings) must fit inside
  // maxWidth × maxDepth bays. Reserve a width slice for a side wing and a depth
  // slice for a front wing so the union never overflows the pad.
  const maxW = clampBays ? clampBays.w : Infinity;
  const maxD = clampBays ? clampBays.d : Infinity;

  const jit = () => rng.int(-cfg.dimJitterBays, cfg.dimJitterBays);
  const cw = Math.min(maxW, Math.max(2, cfg.coreWidthBays + jit())); // core width (U/long)
  const cd = Math.min(maxD, Math.max(2, cfg.coreDepthBays + jit())); // core depth (V/short)

  // core is centered on the long axis, its front (V=0) sits on the frontage line
  const core: BayRect = { x0: 0, y0: 0, x1: cw, y1: cd, floors: F };
  const rects: BayRect[] = [core];

  const wingW = Math.max(2, Math.round(cw * cfg.wingSizeRatio));
  // front-wing depth, capped so core+wing stays within the pad depth budget
  const frontBudget = Number.isFinite(maxD) ? maxD - cd : Infinity;
  const wingD = Math.min(Math.max(2, Math.round(cd * 0.5)), frontBudget);
  const side = rng.next() < 0.5 ? 0 : 1; // left / right choice

  // Protruding blocks read from the FRONT (y<0, toward the road) or the SIDES
  // (x beyond the core) — never the back, which looks wrong on a JP house.
  // Each wing is skipped when the pad leaves no room, so the union always fits.
  switch (name) {
    case 'rect':
      break;
    case 'lshape': {
      // an L: one side of the front bumps forward (a room / 玄関 wing)
      if (wingD >= 1) {
        const x0 = side === 0 ? 0 : cw - wingW;
        rects.push({ x0, y0: -wingD, x1: x0 + wingW, y1: 0, floors: wingFloors });
      }
      break;
    }
    case 'tshape': {
      // central front bump (entrance hall / porch)
      if (wingD >= 1) {
        const bx = Math.floor((cw - wingW) / 2);
        rects.push({ x0: bx, y0: -wingD, x1: bx + wingW, y1: 0, floors: wingFloors });
      }
      break;
    }
    case 'ushape': {
      // two front wings with a recessed entry between them (courtyard entry)
      if (wingD >= 1) {
        const ww = Math.max(2, Math.round(cw * 0.33));
        rects.push({ x0: 0, y0: -wingD, x1: ww, y1: 0, floors: wingFloors });
        rects.push({ x0: cw - ww, y0: -wingD, x1: cw, y1: 0, floors: wingFloors });
      }
      break;
    }
    case 'garage': {
      // an attached garage / carport block on one side, flush to the front
      const gW = Math.min(Math.max(2, Math.round(cw * 0.4)), Number.isFinite(maxW) ? maxW - cw : Infinity);
      const gd = Math.max(2, cd - 1);
      if (gW >= 2) {
        if (side === 0) rects.push({ x0: -gW, y0: 0, x1: 0, y1: gd, floors: wingFloors });
        else rects.push({ x0: cw, y0: 0, x1: cw + gW, y1: gd, floors: wingFloors });
      }
      break;
    }
  }

  if (cfg.notch && name === 'rect') {
    // Break a plain box with a small single-storey front bump (porch / 下屋).
    const bw = Math.max(2, Math.round(cw * 0.25));
    const bd = Math.max(1, Math.round(cd * 0.25));
    const bx = rng.int(1, Math.max(1, cw - bw - 1));
    rects.push({ x0: bx, y0: -bd, x1: bx + bw, y1: 0, floors: wingFloors });
  }

  // Recessed 玄関ポーチ: carve a concave bite out of ONE FRONT CORNER (never the
  // middle) of the ground floor, on flat-fronted archetypes that have a front
  // door. Its set-back back wall becomes the entrance; the upper floor stays
  // full and cantilevers over the porch. Only carved when a front door exists.
  let notch: BayRect | null = null;
  if (cfg.recessedEntrance && cfg.doorFacesRoadOnly && (name === 'rect' || name === 'garage') && cw >= 4 && rng.next() < 0.6) {
    const nw = Math.min(2, cw - 2); // porch width (bays)
    const nd = Math.min(Math.max(1, Math.round(cd * 0.3)), cd - 1);
    const atLeft = rng.next() < 0.5;
    const x0 = atLeft ? 0 : cw - nw;
    notch = { x0, y0: 0, x1: x0 + nw, y1: nd, floors: 0 };
  }

  return { rects, name, notch };
}

/** Rasterize the union of bay rects into a set of occupied cell keys. */
function rasterize(rects: BayRect[]): Set<string> {
  const cells = new Set<string>();
  for (const r of rects) {
    for (let gx = r.x0; gx < r.x1; gx++) {
      for (let gy = r.y0; gy < r.y1; gy++) cells.add(`${gx},${gy}`);
    }
  }
  return cells;
}

/**
 * Trace the CCW outer boundary of a rasterized cell set. Emits directed edges
 * (interior on the left) then stitches them into a single loop. Assumes a
 * simply-connected region (all our archetypes are), so one loop results.
 */
function traceBoundary(cells: Set<string>): Vec2[] {
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
 * Build a footprint for the given lot. The lot provides the local frame:
 * axisU = longestEdgeDir (street-parallel long axis), axisV = outward-from-road.
 */
export function generateFootprint(lot: Lot, cfg: GenConfig, pad?: HousePad): FootprintResult {
  const rng = new Rng(cfg.seed ^ 0x1234);
  const { rects, name, notch } = composeMasses(cfg, rng, pad ? { w: pad.maxWidthBays, d: pad.maxDepthBays } : null);
  const maxFloors = rects.reduce((m, r) => Math.max(m, r.floors), 1);

  // subtract the recessed-entrance notch from a cell set (ground floor only)
  const carve = (cells: Set<string>) => {
    if (!notch) return cells;
    for (let gx = notch.x0; gx < notch.x1; gx++)
      for (let gy = notch.y0; gy < notch.y1; gy++) cells.delete(`${gx},${gy}`);
    return cells;
  };

  // local frame axes — a pad supplies its own (lot-aligned) frame + anchor.
  const axisU = pad ? pad.axisU : norm(lot.longestEdgeDir);
  const axisV = pad ? pad.axisV : { x: -axisU.y, y: axisU.x }; // +V away from the frontage

  // shared transform: bbox over ALL rects so every tier lines up
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x0); maxX = Math.max(maxX, r.x1);
    minY = Math.min(minY, r.y0); maxY = Math.max(maxY, r.y1);
  }
  const cx = (minX + maxX) / 2;
  const spanV = (maxY - minY) * cfg.panelW;
  // pad mode: pin one depth edge to pad.origin. 'rear' pins bay maxY (the back)
  // so the house sits at the back of the lot and grows toward the road (−V);
  // 'front' pins bay minY. Along the frontage the min-U corner maps to origin (+U).
  // Non-pad mode centers the composition on the lot.
  const vRef = pad && pad.anchor === 'rear' ? maxY : minY;
  const toWorld = (gx: number, gy: number): Vec2 =>
    pad
      ? add(
          pad.originWorld,
          add(scale(axisU, (gx - minX) * cfg.panelW), scale(axisV, (gy - vRef) * cfg.panelW))
        )
      : localToWorld((gx - cx) * cfg.panelW, (gy - minY) * cfg.panelW - spanV * 0.5, lot.centroid, axisU, axisV);

  // ground outline carries the notch; upper floors do not (2F over the porch)
  const ring = traceBoundary(carve(rasterize(rects))).map((p) => toWorld(p.x, p.y));

  const tiers: FootprintTier[] = [];
  for (let t = 0; t < maxFloors; t++) {
    const sub = rects.filter((r) => r.floors > t);
    if (sub.length === 0) continue;
    const cells = rasterize(sub);
    if (t === 0) carve(cells);
    const r = traceBoundary(cells).map((p) => toWorld(p.x, p.y));
    if (r.length >= 4) tiers.push({ floor: t, ring: r });
  }

  const masses: MassInfo[] = rects.map((r) => ({
    obb: {
      center: toWorld((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), // same transform as the rings
      axisU,
      axisV,
      halfU: ((r.x1 - r.x0) * cfg.panelW) / 2,
      halfV: ((r.y1 - r.y0) * cfg.panelW) / 2,
    },
    floors: r.floors,
  }));

  return { ring, tiers, masses, archetype: name };
}
