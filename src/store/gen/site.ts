// ============================================================================
// Store site planner — lays out the LOT (any CONVEX polygon: rectangle, skewed
// quad, rounded/chamfered corner lot) around the building: the PARKING FIELD,
// the perimeter landscape belt, the building pad, a rear service yard, the
// pedestrian approach, the driveway mouth onto the road, and freestanding
// signage. Everything is computed in lot-local (u,v) (u = street-parallel,
// v = depth from road); the lot polygon is projected into (u,v) and used to (a)
// FIT the building at the chosen anchor, (b) FILTER parking stalls to those fully
// inside, and (c) CLIP ground zones to the lot outline. Pure logic, no Three.js.
// ============================================================================

import type { StoreConfig, BuildingDepth, BuildingSide } from './config';
import type {
  StoreLot, StoreSitePlan, StorePad, SiteRect, StoreProp, FenceSpan, Vec2, SignInstance, StoreZoneKind,
} from './types';
import { rand01 } from '../../shared/rng';
import { norm, sub, dot, add, scale, len } from '../../shared/vec';
import { pointInPolygon, distToBoundary, clipConvex, rectInsideConvex } from '../../shared/poly';
import { fillParkingRegion, mergeParking } from './parking';
import { placePylon, placeMenuSign } from './signage';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const yawOf = (dir: Vec2) => (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
const SERVICE_DEPTH = 6; // rear loading yard depth (m)

export function planStoreSite(lot: StoreLot, cfg: StoreConfig): StoreSitePlan {
  const seed = cfg.seed;
  // --- lot-local frame (v away from the road); project the ring into (u,v) ---
  const axisU = norm(lot.longestEdgeDir);
  const axisV: Vec2 = { x: -axisU.y, y: axisU.x };
  const W = (u: number, v: number): Vec2 => ({
    x: lot.centroid.x + axisU.x * u + axisV.x * v,
    y: lot.centroid.y + axisU.y * u + axisV.y * v,
  });
  const lotUV: Vec2[] = lot.ring.map((p) => {
    const d = sub(p, lot.centroid);
    return { x: dot(d, axisU), y: dot(d, axisV) };
  });
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const q of lotUV) {
    uMin = Math.min(uMin, q.x); uMax = Math.max(uMax, q.x);
    vMin = Math.min(vMin, q.y); vMax = Math.max(vMax, q.y);
  }

  const EDGE = cfg.edgeLandscape;
  const APPROACH = cfg.approachGap;
  const { panelW, stallW, stallL, aisleW } = cfg;
  const MIN_FIELD_DEPTH = aisleW + stallL; // entry aisle + one nose-in row
  const SIDEGAP = Math.max(1.0, EDGE); // clearance between building side/rear and parking
  const bSet = Math.max(EDGE, 1.0); // building setback from the lot boundary

  // ---- building placement: two independent axes (each 'auto' = seed-random) --
  let depthA: Exclude<BuildingDepth, 'auto'> = cfg.buildingDepth === 'auto'
    ? (rand01(seed, 0xa1) < 0.7 ? 'rear' : 'front') // roadside stores usually sit back
    : cfg.buildingDepth;
  const sideA: Exclude<BuildingSide, 'auto'> = cfg.buildingSide === 'auto'
    ? (rand01(seed, 0xa2) < 0.5 ? 'center' : rand01(seed, 0xa2, 1) < 0.5 ? 'left' : 'right')
    : cfg.buildingSide;
  const bays = (target: number, mn: number, mx: number) =>
    Math.max(1, Math.round(clamp(target, mn, Math.max(mn, mx)) / panelW));
  const wBays = bays(cfg.buildTargetWidth, cfg.minBuildWidth, uMax - uMin - 2 * bSet);
  const dBays = bays(cfg.buildTargetDepth, cfg.minBuildDepth, vMax - vMin - 2 * bSet);
  // A front-anchored building starves the entrance-side field, so its parking has
  // to reach around via a side corridor. If the sides are too narrow for one,
  // fall back to rear-anchoring so the (reachable) frontage field carries parking.
  const sideRoom = (uMax - uMin - 2 * bSet - wBays * panelW) / 2;
  if (depthA === 'front' && sideRoom < MIN_FIELD_DEPTH + SIDEGAP) depthA = 'rear';
  // reserve a rear service yard when the building is anchored toward the back
  const rearAnchored = depthA === 'rear';
  const backGap = cfg.serviceYard && rearAnchored ? EDGE + SERVICE_DEPTH : EDGE;

  const cornersUV = (u0: number, v0: number, BW: number, BD: number): Vec2[] =>
    [{ x: u0, y: v0 }, { x: u0 + BW, y: v0 }, { x: u0 + BW, y: v0 + BD }, { x: u0, y: v0 + BD }];
  const bestU0 = (v0: number, BW: number, BD: number, mode: 'left' | 'right' | 'center'): number | null => {
    const cand: number[] = [];
    for (let u0 = uMin + bSet; u0 <= uMax - bSet - BW + 1e-6; u0 += panelW) {
      if (rectInsideConvex(cornersUV(u0, v0, BW, BD), lotUV, bSet)) cand.push(u0);
    }
    if (!cand.length) return null;
    return mode === 'left' ? cand[0] : mode === 'right' ? cand[cand.length - 1] : cand[(cand.length - 1) >> 1];
  };
  const fit = (wB: number, dB: number): { u0: number; v0: number; BW: number; BD: number } | null => {
    const BW = wB * panelW, BD = dB * panelW;
    const uMode = sideA; // 'left' | 'center' | 'right'
    const vs: number[] = [];
    if (depthA === 'front') {
      for (let v0 = vMin + bSet; v0 <= vMax - bSet - BD + 1e-6; v0 += panelW) vs.push(v0);
    } else {
      for (let v0 = vMax - backGap - BD; v0 >= vMin + bSet - 1e-6; v0 -= panelW) vs.push(v0);
    }
    for (const v0 of vs) {
      const u0 = bestU0(v0, BW, BD, uMode);
      if (u0 !== null) return { u0, v0, BW, BD };
    }
    return null;
  };
  let placed: { u0: number; v0: number; BW: number; BD: number } | null = null;
  for (let s = 0; s < 8 && !placed; s++) placed = fit(Math.max(1, wBays - s), Math.max(1, dBays - s));
  if (!placed) placed = { u0: uMin + bSet, v0: vMin + bSet, BW: panelW, BD: panelW };

  const uB0 = placed.u0, uB1 = uB0 + placed.BW, vB0 = placed.v0, vB1 = vB0 + placed.BD, BW = placed.BW;
  const maxWidthBays = Math.max(1, Math.round(placed.BW / panelW));
  const maxDepthBays = Math.max(1, Math.round(placed.BD / panelW));
  const pad: StorePad = {
    originWorld: W(uB0, vB1), axisU, axisV, anchor: 'rear', frontV: vB0, maxWidthBays, maxDepthBays,
  };

  // ---- parking field: a connected drive network + fields that back into it ---
  // Link-drives (frontage / rear bands + full-depth side corridors are the side
  // fields' own entry aisles) form the circulation spine the entrance feeds into;
  // every parking field's outer edge backs onto a drive, so nothing dead-ends.
  const parts: ReturnType<typeof fillParkingRegion>[] = [];
  const linkDrives: Vec2[][] = [];
  const uL = uMin + EDGE, uR = uMax - EDGE, vFront = vMin + EDGE, vRear = vMax - EDGE;

  // frontage drive: a full-width band at the road side linking the entrance to every field
  const fdV = Math.min(vFront + aisleW, vRear);
  linkDrives.push([W(uL, vFront), W(uR, vFront), W(uR, fdV), W(uL, fdV)]);

  // full-depth side fields fit only where a lot side is wide enough. Where one
  // does NOT fit, the front/far fields expand to the lot edge to use that strip;
  // where it does, they stay building-width so they don't overlap the side field.
  const sideL = (uB0 - SIDEGAP) - uL, sideR = uR - (uB1 + SIDEGAP);
  const longEnough = vRear - vFront >= stallW * 2;
  const sideLFits = sideL >= MIN_FIELD_DEPTH && longEnough;
  const sideRFits = sideR >= MIN_FIELD_DEPTH && longEnough;
  const feU0 = sideLFits ? uB0 : uL, feU1 = sideRFits ? uB1 : uR;

  // front field, rows backing into the frontage drive
  const frontB1 = vB0 - APPROACH;
  if (frontB1 - fdV >= stallL && feU1 - feU0 >= stallW) {
    parts.push(fillParkingRegion({ a0: feU0, a1: feU1, b0: 0, b1: frontB1 - fdV, W: (a, b) => W(a, fdV + b) }, cfg, seed, 0x1000, true, cfg.accessibleStalls));
  }

  // rear / far field behind the building (unless it's the loading yard)
  const farIsService = cfg.serviceYard && rearAnchored && vRear - vB1 > 1;
  const rdV0 = vRear - aisleW;
  const farB0 = vB1 + SIDEGAP;
  const farFits = !farIsService && rdV0 - farB0 >= stallL && feU1 - feU0 >= stallW;
  const sideVEnd = farFits ? rdV0 : vRear; // side fields stop at the rear drive if present

  // full-depth side fields: STALLS line the lot boundary (the JP norm when parking
  // runs parallel to a side) and the entry aisle (drive) runs INBOARD along the
  // building flank — touching the frontage drive at the front and the rear drive
  // at the back. They begin past the frontage drive so no stall sits on it or the
  // entrance driveway.
  if (sideLFits) parts.push(fillParkingRegion({ a0: fdV, a1: sideVEnd, b0: 0, b1: sideL, W: (a, b) => W((uB0 - SIDEGAP) - b, a) }, cfg, seed, 0x2000));
  if (sideRFits) parts.push(fillParkingRegion({ a0: fdV, a1: sideVEnd, b0: 0, b1: sideR, W: (a, b) => W((uB1 + SIDEGAP) + b, a) }, cfg, seed, 0x3000));

  if (farFits) {
    linkDrives.push([W(uL, rdV0), W(uR, rdV0), W(uR, vRear), W(uL, vRear)]); // rear drive band
    parts.push(fillParkingRegion({ a0: feU0, a1: feU1, b0: 0, b1: rdV0 - farB0, W: (a, b) => W(a, rdV0 - b) }, cfg, seed, 0x1500, true));
  }

  const parking = mergeParking(cfg, parts);
  // keep only stalls whose footprint lies fully inside the lot polygon
  parking.stalls = parking.stalls.filter((s) => stallInside(s, lot.ring, 0.3));
  parking.count = parking.stalls.length;

  // ==== ZONING: asphalt base (whole lot) + landscape belt + clipped patches ===
  const zones: SiteRect[] = [];
  zones.push({ ring: lot.ring, kind: 'leftover' }); // paved base → gap-free coverage
  // landscape belt: a strip inward from each lot edge
  for (let i = 0; i < lot.ring.length; i++) {
    const A = lot.ring[i], B = lot.ring[(i + 1) % lot.ring.length];
    const e = norm(sub(B, A));
    const inN = { x: -e.y, y: e.x }; // interior side of a CCW edge
    zones.push({ ring: [A, B, add(B, scale(inN, EDGE)), add(A, scale(inN, EDGE))], kind: 'landscape' });
  }
  const clipZone = (worldRing: Vec2[], kind: StoreZoneKind) => {
    const c = clipConvex(worldRing, lot.ring);
    if (c.length >= 3) zones.push({ ring: c, kind });
  };
  for (const r of parking.rows) clipZone(r.ring, 'parking');
  for (const a of parking.aisles) clipZone(a.ring, 'aisle');
  for (const d of linkDrives) clipZone(d, 'aisle'); // frontage / rear circulation bands
  clipZone([W(uB0, vB0), W(uB1, vB0), W(uB1, vB1), W(uB0, vB1)], 'pad');
  const apV0 = Math.max(vMin, vB0 - APPROACH);
  if (vB0 - apV0 > 0.2) clipZone([W(uB0, apV0), W(uB1, apV0), W(uB1, vB0), W(uB0, vB0)], 'approach');
  if (farIsService) clipZone([W(uMin + EDGE, vB1), W(uMax - EDGE, vB1), W(uMax - EDGE, vMax - EDGE), W(uMin + EDGE, vMax - EDGE)], 'serviceyard');

  // ---- driveway + entrance + fences along the actual polygon edges -----------
  const frontIdx = frontEdgeIndex(lot.ring, lot.roadDir);
  const A = lot.ring[frontIdx], B = lot.ring[(frontIdx + 1) % lot.ring.length];
  const eDir = norm(sub(B, A));
  const eInN = { x: -eDir.y, y: eDir.x }; // inward
  const eLen = len(sub(B, A));
  const driveW = clamp(7, 3, eLen - 2);
  const driveFrac = rand01(seed, 0x51, 1) < 0.5 ? 0.32 : 0.68;
  const tC = clamp(driveFrac * eLen, driveW / 2 + 0.5, eLen - driveW / 2 - 0.5);
  const g0 = tC - driveW / 2, g1 = tC + driveW / 2;
  const entrances = [{ pos: add(A, scale(eDir, tC)), width: driveW }];
  // the entry driveway crosses the frontage landscape + frontage drive and STOPS
  // at the parking edge (no deeper), so it overlaps the frontage drive for the
  // reachability seed but never sits on a stall.
  const driveDepth = EDGE + aisleW;
  const driveRing = [
    add(A, scale(eDir, g0)), add(A, scale(eDir, g1)),
    add(add(A, scale(eDir, g1)), scale(eInN, driveDepth)), add(add(A, scale(eDir, g0)), scale(eInN, driveDepth)),
  ];
  clipZone(driveRing, 'drive');

  // drive-through lane along one flank of the building
  const driveRings: Vec2[][] = [driveRing];
  if (cfg.driveThrough) {
    const laneW = 3.5;
    let dt: Vec2[] | null = null;
    if (uMax - EDGE - (uB1 + 0.2) >= laneW) dt = [W(uB1, vB0), W(uB1 + laneW, vB0), W(uB1 + laneW, vB1), W(uB1, vB1)];
    else if (uB0 - 0.2 - (uMin + EDGE) >= laneW) dt = [W(uB0 - laneW, vB0), W(uB0, vB0), W(uB0, vB1), W(uB0 - laneW, vB1)];
    if (dt) { clipZone(dt, 'drivethrough'); driveRings.push(dt); }
  }

  // ---- REACHABILITY: keep only stalls connected to the entry drive ----------
  // Flood the drive network (entry driveway + all parking aisles, which touch
  // where they abut) and drop any stall that isn't served by a reached aisle, so
  // no unreachable parking is ever emitted (JP/US "no dead-end stall" practice).
  {
    const nodes: Vec2[][] = [...driveRings, ...linkDrives, ...parking.aisles.map((a) => a.ring)];
    const reached = new Array<boolean>(nodes.length).fill(false);
    const queue: number[] = [];
    for (let i = 0; i < driveRings.length; i++) { reached[i] = true; queue.push(i); }
    while (queue.length) {
      const i = queue.pop()!;
      for (let j = 0; j < nodes.length; j++) {
        if (!reached[j] && convexTouch(nodes[i], nodes[j], 0.5)) { reached[j] = true; queue.push(j); }
      }
    }
    const liveAisles = nodes.filter((_, i) => reached[i]);
    parking.stalls = parking.stalls.filter((s) => {
      const c = stallCorners(s);
      return liveAisles.some((d) => convexTouch(c, d, 0.5));
    });
    parking.count = parking.stalls.length;
  }

  // perimeter fence: a curb per lot edge; the frontage edge splits at the drive
  const fences: FenceSpan[] = [];
  for (let i = 0; i < lot.ring.length; i++) {
    const P = lot.ring[i], Q = lot.ring[(i + 1) % lot.ring.length];
    const d = norm(sub(Q, P));
    const outN = { x: d.y, y: -d.x }; // outward for a CCW ring
    if (i === frontIdx) {
      const cuts = [0, g0, g1, eLen].sort((x, y) => x - y);
      for (let k = 0; k < cuts.length - 1; k++) {
        const x0 = cuts[k], x1 = cuts[k + 1];
        if (x1 - x0 < 1e-3) continue;
        const open = (x0 + x1) / 2 >= g0 - 1e-6 && (x0 + x1) / 2 <= g1 + 1e-6;
        fences.push({ a: add(P, scale(d, x0)), b: add(P, scale(d, x1)), normal: outN, kind: open ? 'open' : 'planting', height: open ? 0 : 0.5 });
      }
    } else {
      fences.push({ a: P, b: Q, normal: outN, kind: 'curb', height: 0.15 });
    }
  }

  // ---- freestanding signage --------------------------------------------------
  const signs: SignInstance[] = [];
  if (cfg.signPylon) {
    // near the frontage-edge end opposite the driveway, set in from the corner
    const endT = tC > eLen / 2 ? Math.min(eLen * 0.14, tC - driveW) : Math.max(eLen * 0.86, tC + driveW);
    const pPos = add(add(A, scale(eDir, clamp(endT, 1.5, eLen - 1.5))), scale(eInN, EDGE * 0.6 + 0.5));
    signs.push(placePylon(cfg, pPos, lot.baseZ, axisU));
  }
  if (cfg.driveThrough) {
    const menuU = clamp(uB1 + 1.5, uMin + EDGE, uMax - EDGE);
    signs.push(placeMenuSign(cfg, W(menuU, vB0 - 1.0), lot.baseZ, axisU));
  }

  // ---- props -----------------------------------------------------------------
  const props: StoreProp[] = [];
  const inLot = (p: Vec2, m = 0) => pointInPolygon(p, lot.ring) && distToBoundary(p, lot.ring) >= m;
  // parking-lot pole lights along the field edges (never on a stall)
  const H = cfg.lightPoleHeight;
  const S = clamp(H * 3.5, 14, 20);
  const fv0 = vMin + EDGE + 1.5, fv1 = vB0 - APPROACH - 1.0;
  if (fv1 > fv0) {
    const cols = [uMin + EDGE + 0.6, uMax - EDGE - 0.6];
    if (uMax - uMin - 2 * EDGE > 45) cols.push((uMin + uMax) / 2);
    const nv = Math.max(1, Math.round((fv1 - fv0) / S));
    for (const pu of cols) for (let j = 0; j < nv; j++) props.push({ kind: 'lightpole', center: W(pu, fv0 + ((fv1 - fv0) * (j + 0.5)) / nv), halfU: 0.12, halfV: 0.12, h: H });
  }
  if (cfg.parkingLayout === 'wrap') {
    const nv2 = Math.max(1, Math.round((vB1 - vB0) / S));
    for (const pu of [uMin + EDGE + 0.6, uMax - EDGE - 0.6]) for (let j = 0; j < nv2; j++) props.push({ kind: 'lightpole', center: W(pu, vB0 + ((vB1 - vB0) * (j + 0.5)) / nv2), halfU: 0.12, halfV: 0.12, h: H });
  }
  // storefront eave floodlights over the frontage
  const eaveZ = lot.baseZ + cfg.floors * cfg.panelH - 0.4;
  const nFl = Math.max(2, Math.round(BW / 6));
  for (let i = 0; i < nFl; i++) props.push({ kind: 'floodlight', center: W(uB0 + (BW * (i + 0.5)) / nFl, vB0 - 0.15), halfU: 0.28, halfV: 0.16, h: eaveZ, yawDeg: yawOf(scale(axisV, -1)) });
  // cart corrals near the storefront
  if (cfg.carts && vB0 - APPROACH - 2.5 > vMin) {
    for (const t of [0.3, 0.7]) props.push({ kind: 'cart-corral', center: W(clamp(uB0 + BW * t, uB0 + 1, uB1 - 1), vB0 - APPROACH - 2.0), halfU: 1.2, halfV: 0.7, h: 1.1, yawDeg: yawOf(axisU) });
  }
  // service-yard truck
  if (farIsService && vMax - EDGE - vB1 > 3) props.push({ kind: 'truck', center: W(uB0 + BW * 0.3, (vB1 + vMax - EDGE) / 2), halfU: 1.3, halfV: 4.0, h: 3.2, yawDeg: yawOf(axisV) });
  // frontage plantings + flags along the frontage belt
  scatterFrontage(props, cfg, A, eDir, eInN, eLen, EDGE, g0, g1);
  // conform every prop to the lot polygon
  const kept = props.filter((p) => inLot(p.center, 0));

  return { lotRing: lot.ring, pad, parking, zones, props: kept, signs, entrances, fences };
}

/** Index of the lot edge most facing the road (the frontage edge). */
function frontEdgeIndex(ring: Vec2[], roadDir: Vec2): number {
  let best = 0, bestScore = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const A = ring[i], B = ring[(i + 1) % ring.length];
    const d = norm(sub(B, A));
    const outN = { x: d.y, y: -d.x }; // outward (CCW)
    const score = dot(outN, roadDir) * len(sub(B, A)); // road-facing × length
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** A stall's 4 corners (world, CCW ring), from its center + facing yaw. */
function stallCorners(s: { center: Vec2; halfU: number; halfV: number; yawDeg: number }): Vec2[] {
  const yaw = (s.yawDeg * Math.PI) / 180;
  const along = { x: Math.cos(yaw), y: Math.sin(yaw) };
  const across = { x: along.y, y: -along.x };
  const c = s.center;
  return [
    { x: c.x - across.x * s.halfU - along.x * s.halfV, y: c.y - across.y * s.halfU - along.y * s.halfV },
    { x: c.x + across.x * s.halfU - along.x * s.halfV, y: c.y + across.y * s.halfU - along.y * s.halfV },
    { x: c.x + across.x * s.halfU + along.x * s.halfV, y: c.y + across.y * s.halfU + along.y * s.halfV },
    { x: c.x - across.x * s.halfU + along.x * s.halfV, y: c.y - across.y * s.halfU + along.y * s.halfV },
  ];
}

/** A stall's 4 corners (world), all inside the lot. */
function stallInside(s: { center: Vec2; halfU: number; halfV: number; yawDeg: number }, ring: Vec2[], margin: number): boolean {
  return rectInsideConvex(stallCorners(s), ring, margin);
}

/** True if two convex polygons overlap or lie within `eps` of each other
 *  (separating-axis test with an `eps` slack, so edge-abutting rects count as
 *  touching). Used to flood the drivable network for the reachability prune. */
function convexTouch(A: Vec2[], B: Vec2[], eps: number): boolean {
  return !separated(A, B, eps) && !separated(B, A, eps);
}
function separated(edgesOf: Vec2[], other: Vec2[], eps: number): boolean {
  for (let i = 0; i < edgesOf.length; i++) {
    const p = edgesOf[i], q = edgesOf[(i + 1) % edgesOf.length];
    let nx = -(q.y - p.y), ny = q.x - p.x; // edge normal
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const v of edgesOf) { const d = v.x * nx + v.y * ny; aMin = Math.min(aMin, d); aMax = Math.max(aMax, d); }
    for (const v of other) { const d = v.x * nx + v.y * ny; bMin = Math.min(bMin, d); bMax = Math.max(bMax, d); }
    if (aMin - bMax > eps || bMin - aMax > eps) return true;
  }
  return false;
}

/** Scatter trees/shrubs (and flags) along the frontage landscape belt. */
function scatterFrontage(
  props: StoreProp[], cfg: StoreConfig, A: Vec2, eDir: Vec2, inN: Vec2, eLen: number, EDGE: number, g0: number, g1: number
) {
  const n = Math.round(clamp(eLen / 6, 2, 12));
  for (let i = 0; i < n; i++) {
    const t = (eLen * (i + 0.5)) / n;
    if (t > g0 - 1 && t < g1 + 1) continue; // keep the driveway clear
    const r = rand01(cfg.seed, 0x7ee, i);
    const pos = add(add(A, scale(eDir, t)), scale(inN, EDGE * (0.35 + 0.3 * r)));
    if (r < 0.6) props.push({ kind: 'tree', center: pos, halfU: 1.0 + 0.6 * r, halfV: 0, h: 3.5 + 1.5 * r });
    else props.push({ kind: 'shrub', center: pos, halfU: 0.5, halfV: 0, h: 0.6 });
  }
  if (cfg.flags) {
    for (let i = 0; i < 6; i++) {
      const t = (eLen * (i + 0.5)) / 6;
      if (t > g0 - 1 && t < g1 + 1) continue;
      props.push({ kind: 'flag', center: add(add(A, scale(eDir, t)), scale(inN, EDGE * 0.25)), halfU: 0.05, halfV: 0.05, h: 4, color: cfg.brandColor });
    }
  }
}
