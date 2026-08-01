// ============================================================================
// Freestanding signage placement — the roadside store's most recognisable
// element. A pylon (自立サインポール) stands in the front landscape facing the
// road; a menu board (メニュー看板) sits beside the drive-through lane. Wall
// signage is handled as the building's `signband` panels, not here. Pure data.
// ============================================================================

import type { StoreConfig } from './config';
import type { OBB, SignInstance, Vec2, WallFace } from './types';
import { lerp, len, sub } from '../../shared/vec';
import { rand01, hashInts } from '../../shared/rng';

/** Yaw (deg) whose readable sign face points along the given 2D direction.
 *  (The renderer aligns the board's broad face normal to this yaw.) */
function faceYaw(dir: Vec2): number {
  return (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
}

/** The store's brand-logo id: explicit (`logoStyle ≥ 0`) or seed-derived (`-1`).
 *  A stable integer; the renderer maps it onto its logo set (e.g. the Three canvas
 *  drawer) via `id % variantCount`. Pure logic, renderer-agnostic. */
export function resolveLogoId(cfg: StoreConfig): number {
  if (cfg.logoStyle >= 0) return Math.floor(cfg.logoStyle);
  const pools: Record<StoreConfig['brandCategory'], readonly number[]> = {
    'big-box': [0, 1, 2],
    convenience: [3, 4],
    'family-restaurant': [5, 6],
    'drive-through': [7],
  };
  const pool = pools[cfg.brandCategory];
  return pool[(hashInts(cfg.seed, 0x1060) >>> 0) % pool.length];
}

export function placePylon(cfg: StoreConfig, pos: Vec2, baseZ: number, axisU: Vec2): SignInstance {
  // A roadside pylon reads best PERPENDICULAR to the road: its broad face runs
  // along the street (normal ‖ axisU) so traffic approaching along the road sees
  // it head-on, not edge-on. (Boards are legible from both sides.)
  return {
    kind: 'pylon', pos, z: baseZ, yawDeg: faceYaw(axisU),
    w: cfg.pylonHeight >= 7 ? 3.0 : 2.2, h: cfg.pylonHeight >= 7 ? 4.0 : 3.0,
    poleH: cfg.pylonHeight, color: cfg.brandColor, logoId: resolveLogoId(cfg),
  };
}

export function placeMenuSign(cfg: StoreConfig, pos: Vec2, baseZ: number, axisU: Vec2): SignInstance {
  // Faces across the drive-through lane (‖ axisU) toward the stopped car.
  return {
    kind: 'menu', pos, z: baseZ, yawDeg: faceYaw(axisU),
    w: 1.4, h: 1.9, poleH: 0.4, color: cfg.brandColor, logoId: resolveLogoId(cfg),
  };
}

/** 壁面看板: a logo box centred on the frontage. On a mansard roof it becomes a
 *  billboard ON the decorative band (just above the eave, clearing the entrance
 *  porch below); otherwise it hangs just below the eave. `bandH` = mansard band
 *  height (0 = not mansard). z is the box CENTER; poleH=0 (wall-mounted); the
 *  renderer offsets it proud of the wall along `face.normal` (via yawDeg). */
export function placeWallSign(cfg: StoreConfig, face: WallFace, eaveZ: number, bandH = 0, avoidCenter = false): SignInstance {
  const w = Math.min(face.length * 0.5, 7);
  if (bandH > 0.6) {
    const h = Math.min(1.6, Math.max(0.9, bandH - 0.4)); // fits within the band, above the porch
    return { kind: 'wall', pos: lerp(face.a, face.b, 0.5), z: eaveZ + h / 2 + 0.15, yawDeg: faceYaw(face.normal), w, h, poleH: 0, color: cfg.brandColor, logoId: resolveLogoId(cfg) };
  }
  // below the eave: shift off-centre when a centred entrance porch would collide,
  // and hang clear of the eave (a pitched roof's front fascia dips below the wall
  // top, so leave room below it)
  const t = avoidCenter && face.length > w * 1.6 ? 0.24 : 0.5;
  const h = Math.min(2.0, Math.max(1.0, cfg.panelH * 0.4));
  return { kind: 'wall', pos: lerp(face.a, face.b, t), z: eaveZ - h / 2 - 0.55, yawDeg: faceYaw(face.normal), w, h, poleH: 0, color: cfg.brandColor, logoId: resolveLogoId(cfg) };
}

/** 袖看板: a tall double-sided sign projecting perpendicular from the frontage
 *  corner nearest the entrance. Kept below the eave so it never punches through
 *  the roof/mansard band. yawDeg encodes the wall's OUTWARD normal; the renderer
 *  projects the board along it and orients its broad faces ‖ the wall so drivers
 *  approaching along the road read it head-on. z is the box CENTER. */
export function placeBladeSign(cfg: StoreConfig, face: WallFace, baseZ: number, eaveZ: number): SignInstance {
  // corner nearest b (entrance side by convention), pulled 0.6 m in from the edge
  const t = 1 - 0.6 / Math.max(1, len(sub(face.b, face.a)));
  const pos = lerp(face.a, face.b, t);
  // keep the top well under the eave: a pitched roof's front fascia dips ~0.3 m
  // below the wall top, and the blade projects PAST it, so leave clear room
  const h = Math.max(0.8, Math.min(cfg.panelH * 0.8, eaveZ - baseZ - 1.6)); // top ≤ eave − 0.7
  return {
    kind: 'blade', pos, z: baseZ + 0.9 + h / 2, yawDeg: faceYaw(face.normal),
    w: 0.9, h, poleH: 0, color: cfg.brandColor, logoId: resolveLogoId(cfg),
  };
}

/** 屋上看板 (flat roofs only): a seed-random cube (キューブ型) or upright board
 *  (板型) standing on the roof of the main mass, facing the road. Returns null
 *  when the seed rolls "no rooftop sign". z = roof top (the sign's base). */
export function placeRooftopSign(cfg: StoreConfig, mass: OBB, roofZ: number, faceNormal: Vec2): SignInstance | null {
  if (rand01(cfg.seed, 0x2f00) >= 0.6) return null; // ~60% of eligible flat roofs get one
  const yawDeg = faceYaw(faceNormal);
  const wSpan = mass.halfU * 2, dSpan = mass.halfV * 2;
  if (rand01(cfg.seed, 0x2f01) < 0.12) {
    // cube — perched on one of the two FRONT (road-side) corners of the roof,
    // rising above the parapet (like a phone-shop cube). Left/right by seed.
    const side = Math.max(2.4, Math.min(Math.min(wSpan, dSpan) * 0.22, 3.6));
    const n = faceNormal, t = { x: -faceNormal.y, y: faceNormal.x }; // n = toward road
    const eN = Math.abs(mass.halfU * (mass.axisU.x * n.x + mass.axisU.y * n.y)) + Math.abs(mass.halfV * (mass.axisV.x * n.x + mass.axisV.y * n.y));
    const eT = Math.abs(mass.halfU * (mass.axisU.x * t.x + mass.axisU.y * t.y)) + Math.abs(mass.halfV * (mass.axisV.x * t.x + mass.axisV.y * t.y));
    const m = 0.3; // keep the cube fully on the roof (off the parapet edge)
    const dn = Math.max(0, eN - side / 2 - m);
    const dt = Math.max(0, eT - side / 2 - m);
    const sgn = rand01(cfg.seed, 0x2f02) < 0.5 ? -1 : 1; // front-left / front-right
    const pos: Vec2 = { x: mass.center.x + n.x * dn + t.x * sgn * dt, y: mass.center.y + n.y * dn + t.y * sgn * dt };
    return { kind: 'roof-cube', pos, z: roofZ, yawDeg, w: side, h: side, poleH: 0, color: cfg.brandColor, logoId: resolveLogoId(cfg) };
  }
  // board — a wide upright panel set toward the frontage edge, on short legs
  const w = Math.max(4, Math.min(wSpan * 0.6, 12));
  const h = Math.max(2, Math.min(w * 0.32, 3.5));
  const off = Math.max(0, dSpan / 2 - h * 0.6);
  const pos: Vec2 = { x: mass.center.x + faceNormal.x * off, y: mass.center.y + faceNormal.y * off };
  return { kind: 'roof-board', pos, z: roofZ, yawDeg, w, h, poleH: 0.6, color: cfg.brandColor, logoId: resolveLogoId(cfg) };
}
