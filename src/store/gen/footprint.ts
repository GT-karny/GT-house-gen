// ============================================================================
// Store footprint — composes the building mass(es) on an INTEGER BAY GRID (cell
// = panelW), so every wall length is an exact multiple of panelW. Fills the
// StorePad and rear-anchors within it (building at the back of the lot, front
// toward the road). A 'box-service' archetype adds a single-storey rear service
// wing that steps below the main box. Reuses the shared rasterize→boundary-trace.
// Pure logic (renderer-agnostic). Mirrors src/gen/footprint.ts.
// ============================================================================

import type { StoreConfig, StoreArchetype } from './config';
import type { StoreLot, StoreMass, StorePad, Vec2 } from './types';
import { Rng, weightedPick } from '../../shared/rng';
import { rasterizeRects, traceBoundary, type GridRect } from '../../shared/geom2d';
import { add, scale, norm } from '../../shared/vec';

interface BayRect extends GridRect {
  floors: number;
}

export interface StoreFootprintTier {
  floor: number;
  ring: Vec2[];
}

export interface StoreFootprintResult {
  ring: Vec2[];
  tiers: StoreFootprintTier[];
  masses: StoreMass[];
  archetype: StoreArchetype;
}

/** Bay-coord source rects for an archetype. y=0 is the FRONT (road) edge, y=cd
 *  the REAR; the rear is pinned to the pad origin, so the building grows toward
 *  the road. */
function composeStoreMasses(
  cfg: StoreConfig,
  rng: Rng,
  clamp: { w: number; d: number }
): { rects: BayRect[]; name: StoreArchetype } {
  const name = weightedPick(cfg.archetypeWeights, rng.next());
  const F = cfg.floors;
  const cw = Math.max(1, clamp.w);
  const cd = Math.max(1, clamp.d);
  const rects: BayRect[] = [];

  if (name === 'box-service' && cd >= 3) {
    // single-storey service wing at the REAR (high y), main box at the front
    const serviceDepth = Math.max(1, Math.min(Math.round(cd * 0.3), cd - 2));
    const coreDepth = cd - serviceDepth;
    rects.push({ x0: 0, y0: 0, x1: cw, y1: coreDepth, floors: F });
    rects.push({ x0: 0, y0: coreDepth, x1: cw, y1: cd, floors: 1 });
  } else {
    rects.push({ x0: 0, y0: 0, x1: cw, y1: cd, floors: F });
  }
  return { rects, name };
}

export function generateStoreFootprint(
  lot: StoreLot,
  cfg: StoreConfig,
  pad: StorePad
): StoreFootprintResult {
  const rng = new Rng(cfg.seed ^ 0x570e);
  const { rects, name } = composeStoreMasses(cfg, rng, { w: pad.maxWidthBays, d: pad.maxDepthBays });
  const maxFloors = rects.reduce((m, r) => Math.max(m, r.floors), 1);

  const axisU = pad.axisU ?? norm(lot.longestEdgeDir);
  const axisV = pad.axisV;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x0); maxX = Math.max(maxX, r.x1);
    minY = Math.min(minY, r.y0); maxY = Math.max(maxY, r.y1);
  }
  const vRef = pad.anchor === 'rear' ? maxY : minY;
  const toWorld = (gx: number, gy: number): Vec2 =>
    add(
      pad.originWorld,
      add(scale(axisU, (gx - minX) * cfg.panelW), scale(axisV, (gy - vRef) * cfg.panelW))
    );

  const ring = traceBoundary(rasterizeRects(rects)).map((p) => toWorld(p.x, p.y));

  const tiers: StoreFootprintTier[] = [];
  for (let t = 0; t < maxFloors; t++) {
    const sub = rects.filter((r) => r.floors > t);
    if (sub.length === 0) continue;
    const r = traceBoundary(rasterizeRects(sub)).map((p) => toWorld(p.x, p.y));
    if (r.length >= 4) tiers.push({ floor: t, ring: r });
  }

  const masses: StoreMass[] = rects.map((r) => ({
    obb: {
      center: toWorld((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2),
      axisU,
      axisV,
      halfU: ((r.x1 - r.x0) * cfg.panelW) / 2,
      halfV: ((r.y1 - r.y0) * cfg.panelW) / 2,
    },
    floors: r.floors,
  }));

  return { ring, tiers, masses, archetype: name };
}
