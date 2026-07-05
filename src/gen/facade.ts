// ============================================================================
// Facade generator — face roles + modular panel grid + split-grammar.
//
// Real Japanese houses are NOT uniformly glazed: the STREET face is closed
// (few, small, high windows, often with 面格子 / シャッターボックス), the
// GARDEN face is open (掃き出し窓 + a 2F balcony), and SIDE faces carry only a
// handful of small water-room windows. We therefore assign each wall a ROLE and
// drive window density + size from it. Windows are placed on an even rhythm
// (pier guaranteed between them) and keyed by a stable per-wall seed so the same
// physical wall aligns across storeys.
// ============================================================================

import type { GenConfig } from './config';
import type { Lot, WallFace, PanelInstance, Vec2, Module, WindowSize, FaceRole, Balcony } from './types';
import type { FootprintTier } from './footprint';
import { sub, norm, perpCW, dot, lerp, len, add, scale } from './vec';
import { rand01, hashInts } from './rng';

/** Stable id for a wall from its (quantised) endpoints — identical walls across
 *  storeys share it, which keeps windows vertically aligned. */
function faceSeed(cfg: GenConfig, a: Vec2, b: Vec2): number {
  const q = (n: number) => Math.round(n * 100);
  return hashInts(cfg.seed, q(a.x), q(a.y), q(b.x), q(b.y));
}

/** Split a ring into wall faces, each tagged with a role and a bay count.
 *  street = road-facing front. garden = ONE of the left/right SIDE walls (that's
 *  where the yard usually sits on a JP lot), chosen by seed. Everything else
 *  (the back + the opposite side) is a closed 'side'. */
export function buildFaces(ring: Vec2[], cfg: GenConfig, lot: Lot): WallFace[] {
  const n = ring.length;
  const axisU = norm(lot.longestEdgeDir); // street-parallel (left↔right) axis
  const geo = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const dir = norm(sub(b, a));
    const normal = perpCW(dir); // outward for a CCW ring
    const length = len(sub(b, a));
    const bays = Math.max(1, Math.round(length / cfg.panelW));
    geo.push({ index: i, a, b, normal, length, bays, road: dot(normal, lot.roadDir), lr: dot(normal, axisU) });
  }
  // street = the entrance wall: the MOST SET-BACK road-facing wall (the back of
  // a recessed 玄関ポーチ, or the crook of an L/U), so the door lands there —
  // never on a wall that juts forward. Ties break toward the longer wall.
  const axisV = { x: -axisU.y, y: axisU.x }; // +V = away from the road (深さ)
  let streetIdx = -1, streetDepth = -Infinity, streetLen = -Infinity;
  for (const f of geo) {
    if (f.road <= 0.5) continue;
    const depth = ((f.a.x + f.b.x) / 2) * axisV.x + ((f.a.y + f.b.y) / 2) * axisV.y;
    if (depth > streetDepth + 1e-6 || (Math.abs(depth - streetDepth) < 1e-6 && f.length > streetLen)) {
      streetDepth = depth; streetLen = f.length; streetIdx = f.index;
    }
  }
  // garden = a left/right SIDE wall (normal ≈ ±axisU); pick the side by seed,
  // then the longest wall on that side.
  const gardenSign = rand01(cfg.seed, 909) < 0.5 ? 1 : -1;
  let gardenIdx = -1, gardenLen = -Infinity;
  for (const f of geo) {
    if (Math.abs(f.road) >= 0.5) continue; // skip front/back
    if (f.lr * gardenSign <= 0.3) continue; // wrong side
    if (f.length > gardenLen) { gardenLen = f.length; gardenIdx = f.index; }
  }
  // fallback: any side wall
  if (gardenIdx < 0) for (const f of geo) if (Math.abs(f.road) < 0.5 && f.length > gardenLen && f.index !== streetIdx) { gardenLen = f.length; gardenIdx = f.index; }

  return geo.map((f) => {
    const role: FaceRole = f.index === streetIdx ? 'street' : f.index === gardenIdx ? 'garden' : 'side';
    return { index: f.index, a: f.a, b: f.b, normal: f.normal, length: f.length, bays: f.bays, isPrimary: f.index === streetIdx, role };
  });
}

/** Effective window density for a face, by role (street is closed for privacy). */
function faceDensity(cfg: GenConfig, role: FaceRole): number {
  if (role === 'street') return cfg.windowDensity * cfg.streetOpenness;
  if (role === 'side') return cfg.windowDensity * 0.5;
  return cfg.windowDensity; // garden
}

/** Even-rhythm window columns with a guaranteed solid pier between them. */
function windowColumns(cfg: GenConfig, face: WallFace, seed: number): Set<number> {
  const margin = cfg.cornerMarginBays;
  const lo = margin, hi = face.bays - margin;
  const usable = hi - lo;
  const cols = new Set<number>();
  const density = faceDensity(cfg, face.role);
  if (usable <= 0 || density <= 0) return cols;

  const maxWin = Math.ceil(usable / 2);
  const count = Math.min(maxWin, Math.max(1, Math.round(usable * density)));
  for (let k = 0; k < count; k++) {
    const base = count === 1 ? lo + Math.floor(usable / 2) : lo + Math.round((k * (usable - 1)) / (count - 1));
    let bay = base;
    if (cfg.windowJitter > 0 && rand01(seed, 404, k) < cfg.windowJitter) {
      const cand = base + (rand01(seed, 505, k) < 0.5 ? -1 : 1);
      if (cand >= lo && cand < hi && !cols.has(cand - 1) && !cols.has(cand) && !cols.has(cand + 1)) bay = cand;
    }
    if (cols.has(bay - 1) || cols.has(bay) || cols.has(bay + 1)) continue;
    cols.add(bay);
  }
  return cols;
}

/** Opening size by role + floor. Big 掃き出し窓 only face the garden. */
function chooseWindowSize(cfg: GenConfig, face: WallFace, floor: number, bay: number, seed: number): WindowSize {
  switch (cfg.windowSizeMode) {
    case 'medium':
      return 'medium';
    case 'byFloor':
      return floor === 0 ? 'large' : 'medium';
    case 'japan':
    default:
      if (face.role === 'garden' && floor === 0) return 'large'; // 掃き出し窓 to garden
      if (face.role === 'side') return rand01(seed, 606, floor, bay) < 0.5 ? 'small' : 'medium';
      if (face.role === 'street' && rand01(seed, 707, floor, bay) < 0.3) return 'small'; // 浴室/階段の小窓
      return 'medium'; // 腰窓
  }
}

/** Door bay on the street face: centred, kept off the very corners when the wall
 *  is wide enough (falls back to the full width for a narrow wing front). */
function doorBay(_cfg: GenConfig, face: WallFace, seed: number): number {
  if (face.bays < 1) return -1;
  let lo = 1, hi = face.bays - 2;
  if (hi < lo) { lo = 0; hi = face.bays - 1; } // narrow wall: allow the corners
  const mid = Math.floor((face.bays - 1) / 2);
  const off = Math.floor(rand01(seed, 202) * 3) - 1;
  return Math.min(hi, Math.max(lo, mid + off));
}

/** A centred run of `count` bays inside the corner margins (for a balcony's
 *  掃き出し窓, forced regardless of the face's usual density). */
function centeredRun(cfg: GenConfig, face: WallFace, count: number): Set<number> {
  const lo = cfg.cornerMarginBays;
  const usable = face.bays - 2 * cfg.cornerMarginBays;
  const set = new Set<number>();
  if (usable <= 0) return set;
  const c = Math.min(count, usable);
  const start = lo + Math.floor((usable - c) / 2);
  for (let i = 0; i < c; i++) set.add(start + i);
  return set;
}

/** Build every panel + balcony for a set of per-storey footprint rings. */
export function generateFacade(
  tiers: FootprintTier[],
  cfg: GenConfig,
  lot: Lot,
  baseZ: number
): { panels: PanelInstance[]; balconies: Balcony[] } {
  const panels: PanelInstance[] = [];
  const balconies: Balcony[] = [];
  const topFloor = tiers.reduce((m, t) => Math.max(m, t.floor), 0);

  // Which elevation the balcony fronts. 'auto' picks the front (street) or the
  // left/right garden side by seed — so it always reads from the front 3/4 view,
  // never hidden on the back.
  const balconyRole = cfg.balconyFace === 'auto'
    ? (rand01(cfg.seed, 910) < 0.4 ? 'street' : 'garden')
    : cfg.balconyFace;

  for (const tier of tiers) {
    const faces = buildFaces(tier.ring, cfg, lot);
    const balconyFace = cfg.balcony && tier.floor === topFloor && topFloor >= 1
      ? faces.find((f) => f.role === balconyRole)
      : undefined;

    for (const face of faces) {
      const seed = faceSeed(cfg, face.a, face.b);
      const yaw = (Math.atan2(face.normal.y, face.normal.x) * 180) / Math.PI;
      const floor = tier.floor;
      // door bay is a STABLE per-wall value (same on every storey) so the door
      // column stays consistent; the door itself is only drawn on the ground floor.
      const isDoorFace = cfg.doorFacesRoadOnly ? face.role === 'street' : true;
      const doorIdx = isDoorFace ? doorBay(cfg, face, seed) : -1;

      // the balcony face gets a FORCED central 掃き出し run; others use rhythm
      const isBalcony = face === balconyFace;
      const windows = isBalcony ? centeredRun(cfg, face, 3) : windowColumns(cfg, face, seed);

      // the door column is wall (not a window) on every floor; then guarantee at
      // least one window remains, so a doored elevation (1F front) is never blank.
      // Doing this identically on every storey keeps windows vertically aligned.
      if (doorIdx >= 0 && !isBalcony) {
        windows.delete(doorIdx);
        if (windows.size === 0) {
          const lo = cfg.cornerMarginBays, hi = face.bays - cfg.cornerMarginBays;
          for (let b = hi - 1; b >= lo; b--) if (b !== doorIdx) { windows.add(b); break; }
        }
      }

      let bMin = Infinity, bMax = -Infinity;

      for (let bay = 0; bay < face.bays; bay++) {
        const p: Vec2 = lerp(face.a, face.b, (bay + 0.5) / face.bays);
        let type: Module = 'wall';
        let size: WindowSize | undefined;
        let grille = false;
        let shutter = false;
        let protrude = false;
        if (floor === 0 && bay === doorIdx && doorIdx >= 0) {
          type = 'door';
        } else if (windows.has(bay)) {
          type = 'window';
          size = isBalcony ? 'large' : chooseWindowSize(cfg, face, floor, bay, seed);
          grille = cfg.grilles && size === 'small' && floor === 0;
          shutter = cfg.shutterBoxes && (size === 'medium' || size === 'large') && face.role !== 'side';
          // 出窓 — protrude a medium window on a visible (street/garden) face
          protrude = cfg.bayWindows && !isBalcony && size === 'medium'
            && (face.role === 'street' || face.role === 'garden')
            && rand01(seed, 808, floor, bay) < 0.5;
          if (isBalcony) { bMin = Math.min(bMin, bay); bMax = Math.max(bMax, bay); }
        }
        panels.push({
          type, faceIndex: face.index, floor, bay, pos: p,
          z: baseZ + floor * cfg.panelH + cfg.panelH / 2, yawDeg: yaw, size, grille, shutter, protrude,
        });
      }

      if (isBalcony && bMax >= bMin) {
        const a = lerp(face.a, face.b, bMin / face.bays);
        const b = lerp(face.a, face.b, (bMax + 1) / face.bays);
        const off = scale(face.normal, 0.02);
        balconies.push({
          a: add(a, off), b: add(b, off), normal: face.normal,
          z: baseZ + tier.floor * cfg.panelH, depth: 1.0,
        });
      }
    }
  }
  return { panels, balconies };
}
