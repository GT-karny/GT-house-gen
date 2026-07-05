// ============================================================================
// Storefront generator — face roles + a retail split-grammar. Unlike a house,
// the road/parking-facing FRONTAGE is wide open (entrance + glazing + signage
// band); FLANK sides are semi-open; the SERVICE rear is closed with a loading
// shutter. Windows keyed by a stable per-wall seed so cells align across floors.
// Pure logic (renderer-agnostic). Mirrors src/gen/facade.ts.
// ============================================================================

import type { StoreConfig } from './config';
import type { StoreLot, WallFace, StorePanel, Vec2, FaceRole, StorefrontModule } from './types';
import type { StoreFootprintTier } from './footprint';
import { sub, norm, perpCW, dot, lerp, len } from '../../shared/vec';
import { rand01, hashInts } from '../../shared/rng';

function faceSeed(cfg: StoreConfig, a: Vec2, b: Vec2): number {
  const q = (n: number) => Math.round(n * 100);
  return hashInts(cfg.seed, q(a.x), q(a.y), q(b.x), q(b.y));
}

/** Dice a ring into faces and tag roles: frontage = most road-facing wall,
 *  service = most road-averse wall, the rest flank. */
export function buildStoreFaces(ring: Vec2[], cfg: StoreConfig, lot: StoreLot): WallFace[] {
  const n = ring.length;
  const geo = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const dir = norm(sub(b, a));
    const normal = perpCW(dir);
    const length = len(sub(b, a));
    const bays = Math.max(1, Math.round(length / cfg.panelW));
    geo.push({ index: i, a, b, normal, length, bays, road: dot(normal, lot.roadDir) });
  }
  let frontIdx = -1, frontRoad = -Infinity, frontLen = -Infinity;
  let servIdx = -1, servRoad = Infinity, servLen = -Infinity;
  for (const f of geo) {
    if (f.road > frontRoad + 1e-6 || (Math.abs(f.road - frontRoad) < 1e-6 && f.length > frontLen)) {
      frontRoad = f.road; frontLen = f.length; frontIdx = f.index;
    }
    if (f.road < servRoad - 1e-6 || (Math.abs(f.road - servRoad) < 1e-6 && f.length > servLen)) {
      servRoad = f.road; servLen = f.length; servIdx = f.index;
    }
  }
  return geo.map((f) => {
    const role: FaceRole = f.index === frontIdx ? 'frontage' : f.index === servIdx ? 'service' : 'flank';
    return { index: f.index, a: f.a, b: f.b, normal: f.normal, length: f.length, bays: f.bays, isPrimary: f.index === frontIdx, role };
  });
}

/** Entrance bay columns on the frontage ground floor (centred, spread). */
function entranceBays(cfg: StoreConfig, face: WallFace): Set<number> {
  const set = new Set<number>();
  const count = Math.max(1, Math.min(cfg.entranceCount, Math.floor(face.bays / 2)));
  for (let k = 0; k < count; k++) {
    const t = count === 1 ? 0.5 : 0.3 + (0.4 * k) / (count - 1);
    set.add(Math.min(face.bays - 1, Math.max(0, Math.round(t * (face.bays - 1)))));
  }
  return set;
}

/** Build every storefront panel for the per-storey footprint rings. */
export function generateStorefront(
  tiers: StoreFootprintTier[],
  cfg: StoreConfig,
  lot: StoreLot,
  baseZ: number
): StorePanel[] {
  const panels: StorePanel[] = [];
  const topFloor = tiers.reduce((m, t) => Math.max(m, t.floor), 0);

  for (const tier of tiers) {
    const faces = buildStoreFaces(tier.ring, cfg, lot);
    for (const face of faces) {
      const seed = faceSeed(cfg, face.a, face.b);
      const yaw = (Math.atan2(face.normal.y, face.normal.x) * 180) / Math.PI;
      const floor = tier.floor;
      const doors = floor === 0 && face.role === 'frontage' ? entranceBays(cfg, face) : new Set<number>();
      const shutterBay = face.role === 'service' && floor === 0 ? Math.floor(face.bays / 2) : -1;

      for (let bay = 0; bay < face.bays; bay++) {
        const pos = lerp(face.a, face.b, (bay + 0.5) / face.bays);
        let type: StorefrontModule = 'wall';
        const isCorner = bay === 0 || bay === face.bays - 1;
        if (doors.has(bay)) {
          type = 'entrance';
        } else if (bay === shutterBay) {
          type = 'shutter';
        } else if (face.role === 'frontage') {
          if (!isCorner && rand01(seed, 11, floor, bay) < cfg.glazingRatio) type = 'glazing';
        } else if (face.role === 'flank') {
          if (!isCorner && rand01(seed, 12, floor, bay) < cfg.glazingRatio * 0.4) type = 'glazing';
        }
        panels.push({
          type, faceIndex: face.index, floor, bay, pos,
          z: baseZ + floor * cfg.panelH + cfg.panelH / 2, yawDeg: yaw, w: cfg.panelW, h: cfg.panelH,
        });
      }

      // continuous signage band across the frontage/flank top (below the parapet)
      if (cfg.signband && floor === topFloor && face.role !== 'service') {
        const topZ = baseZ + (topFloor + 1) * cfg.panelH;
        for (let bay = 0; bay < face.bays; bay++) {
          const pos = lerp(face.a, face.b, (bay + 0.5) / face.bays);
          panels.push({
            type: 'signband', faceIndex: face.index, floor, bay, pos,
            z: topZ - cfg.signbandH / 2, yawDeg: yaw, w: cfg.panelW, h: cfg.signbandH,
          });
        }
      }
    }
  }
  return panels;
}
