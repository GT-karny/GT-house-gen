// ============================================================================
// Site planner — lays out the LOT around the house: driveway parking, a side
// garden (庭), the entrance approach (アプローチ), and the perimeter fence (塀).
//
// Everything is computed in lot-LOCAL coordinates (u,v): u = street-parallel
// (lot.longestEdgeDir), v = depth from the road edge (v=0 at the frontage,
// increasing inward). We assume the codebase invariant that the house FRONT is
// the -V / road side (front-protruding wings point toward v=0), matching
// makeSampleLot where roadDir = -axisV.
//
// Parking dimensions follow JP practice (web-researched): 1 car ≈ 2.5×5.0 m
// (min), 2 cars side-by-side ≈ 5.0 m wide × 5.0 m deep; 民法 side setback ≈0.5 m.
//
// Pure logic, no Three.js — a renderer-agnostic site planner.
// ============================================================================

import type { GenConfig } from './config';
import type { Lot, Vec2, SitePlan, SiteRect, FenceSpan, FenceKind, HousePad, SiteProp, ZoneKind } from './types';
import { Rng, rand01 } from './rng';
import { add, scale, dot, norm, sub, len } from './vec';
import { pointInPolygon, insideWithMargin, clipConvex } from '../shared/poly';

// stall + boundary constants (meters)
const CAR_W = 2.5; // one stall width (min); JP comfortable is 2.5–2.7
const CAR_GAP = 0.5; // clearance between two side-by-side cars (JP: 0.6–0.8, min 0.5)
const CAR_L = 5.0;
const APPROACH_W = 1.2; // entrance walk — always reserved so the drive never eats it
const GARDEN_MIN = 2.0; // a strip narrower than this isn't worth calling a garden
const FRONT_GAP = 0.3; // slack between parking and the house front
const FRONT_SB = 0.5; // token front setback when the house sits near the road

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Plan the lot: house pad + parking/garden/approach zones + perimeter fence. */
export function planSite(lot: Lot, cfg: GenConfig): SitePlan {
  const rng = new Rng((cfg.seed ^ 0x51e5) | 0);

  // local frame: axisV MUST match footprint's default (+V away from frontage).
  const axisU = norm(lot.longestEdgeDir);
  const axisV: Vec2 = { x: -axisU.y, y: axisU.x };

  // lot extents by projecting the ring; road edge is the min-V side (v=0).
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const p of lot.ring) {
    const d = sub(p, lot.centroid);
    const u = dot(d, axisU), v = dot(d, axisV);
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  const LW = uMax - uMin;
  const LD = vMax - vMin;
  const origin = add(lot.centroid, add(scale(axisU, uMin), scale(axisV, vMin)));
  const W = (u: number, v: number): Vec2 => add(origin, add(scale(axisU, u), scale(axisV, v)));
  const rect = (u0: number, v0: number, u1: number, v1: number): Vec2[] =>
    [W(u0, v0), W(u1, v0), W(u1, v1), W(u0, v1)];

  // Lot polygon in local (u,v) — u,v measured from the min corner, so the AABB is
  // [0,LW]×[0,LD]. For a plain rectangular lot the ring sits exactly on that box;
  // otherwise (trapezoid / rounded / chamfered) it's a smaller convex polygon and
  // we must FIT the house inside it and CLIP the zones/fences to its real edges.
  const lotUV: Vec2[] = lot.ring.map((p) => { const d = sub(p, origin); return { x: dot(d, axisU), y: dot(d, axisV) }; });
  const rectLot = lotUV.length === 4 && lotUV.every(
    (q) => (Math.abs(q.x) < 1e-4 || Math.abs(q.x - LW) < 1e-4) && (Math.abs(q.y) < 1e-4 || Math.abs(q.y - LD) < 1e-4),
  );

  const SIDE_SB = cfg.sideSetback;
  const REAR_SB = cfg.rearSetback;
  const bu0 = SIDE_SB; // buildable u start
  const BW = Math.max(0, LW - 2 * SIDE_SB); // buildable frontage width
  const HOUSE_MIN_W = cfg.minBuildingWidth; // 最小間口 (狭小の下限)

  const availD = LD - REAR_SB; // usable depth from the road to the rear setback
  const HOUSE_MIN_D = cfg.minBuildingDepth; // 最小奥行 (狭小の下限)
  const stallFits = availD >= CAR_L; // a full 5 m stall must fit within the depth

  // --- parking stall count: 1 is the norm; 2 only on genuinely wide+deep lots,
  // and even then with a low, width-scaled probability. Each stall always
  // reserves an approach lane beside it so circulation stays usable. ---------
  const widthFor = (c: number) => (c <= 0 ? 0 : c * CAR_W + (c - 1) * CAR_GAP);
  const oneNeed = widthFor(1) + APPROACH_W; // 3.7 m frontage for 1 car + path
  const twoNeed = widthFor(2) + APPROACH_W; // 6.7 m for 2 cars + path
  let cars: number;
  if (cfg.parkingTarget === 'auto') {
    if (!stallFits || BW < oneNeed) cars = 0;
    else if (BW >= twoNeed && rng.next() < clamp((BW - twoNeed) / 6, 0, 1) * 0.4) cars = 2;
    else cars = 1;
  } else {
    const want = cfg.parkingTarget;
    cars = !stallFits ? 0 : want >= 2 && BW >= twoNeed ? 2 : want >= 1 && BW >= oneNeed ? 1 : 0;
  }
  let parkW = widthFor(cars);

  // --- arrangement + which side the drive sits on --------------------------
  // Parking in FRONT needs a full stall plus house room behind it; if the lot
  // is too shallow for that, fall back to a BESIDE strip, else drop the parking.
  const frontDepthOk = availD >= CAR_L + FRONT_GAP + HOUSE_MIN_D;
  const wantBeside = rng.next() < 0.4; // drawn regardless so seeds stay stable
  const parkLeft = rng.next() < 0.5;
  const besideOk = cars > 0 && BW - parkW - FRONT_GAP >= Math.max(HOUSE_MIN_W, 3);
  let arrangement: 'front' | 'beside';
  if (cars === 0) {
    arrangement = 'front';
  } else if (!frontDepthOk) {
    if (besideOk) arrangement = 'beside';
    else { cars = 0; parkW = 0; arrangement = 'front'; } // too shallow to park at all
  } else {
    arrangement = besideOk && wantBeside ? 'beside' : 'front';
  }
  const parkDepth = cars > 0 ? Math.min(CAR_L, availD) : 0;

  // --- place house + drive across the frontage (garden = the leftover side) --
  let frontV: number, houseU0: number, HW: number;
  let parkU0 = 0, parkU1 = 0;

  // house takes `fillRatio` of the usable width; the rest (gw) becomes the side
  // garden strip, so the house shifts to one side leaving an open side.
  const splitHouseGarden = (usable: number) => {
    let hw = clamp(usable * cfg.fillRatio, HOUSE_MIN_W, usable);
    let gw = usable - hw;
    if (gw < GARDEN_MIN) { gw = 0; hw = usable; }
    return { hw, gw };
  };

  // Front-edge FLAT u-range: on a rounded/chamfered lot the road-side corners are
  // cut away (they should read as open/landscaped, not paved). The driveway must
  // stay on the straight part of the frontage, so we slide it into [flatU0,flatU1]
  // — the u-projection of the actual front edge. For a rectangle this is the full
  // width, so the slide is a no-op and the layout is unchanged.
  let flatU0 = 0, flatU1 = LW;
  if (!rectLot && cars > 0) {
    const fe = frontEdgeIndex(lot.ring, lot.roadDir);
    const P = lot.ring[fe], Q = lot.ring[(fe + 1) % lot.ring.length];
    const uA = dot(sub(P, origin), axisU), uB = dot(sub(Q, origin), axisU);
    flatU0 = Math.min(uA, uB); flatU1 = Math.max(uA, uB);
  }
  const fitParkU = (u0: number, u1: number): [number, number] => {
    const w = u1 - u0;
    if (flatU1 - flatU0 <= w) { const c = (flatU0 + flatU1) / 2; return [c - w / 2, c + w / 2]; }
    let a = u0, b = u1;
    if (a < flatU0) { b += flatU0 - a; a = flatU0; }
    if (b > flatU1) { a -= b - flatU1; b = flatU1; }
    return [a, b];
  };

  if (arrangement === 'front') {
    // car(s) parked nose-in ahead of the house; house behind the parking depth.
    frontV = cars > 0 ? parkDepth + FRONT_GAP : FRONT_SB;
    const { hw, gw } = splitHouseGarden(BW);
    HW = hw;
    if (parkLeft) {
      houseU0 = bu0;
      [parkU0, parkU1] = fitParkU(bu0, bu0 + parkW);
    } else {
      houseU0 = bu0 + gw;
      [parkU0, parkU1] = fitParkU(bu0 + BW - parkW, bu0 + BW);
    }
  } else {
    // beside: house sits near the road, parking is a side strip full car-length.
    // The drive is placed first (clamped off any cut corner), then the house is
    // tucked beside it — so shifting the drive inward carries the house with it.
    frontV = FRONT_SB;
    const { hw } = splitHouseGarden(BW - parkW - FRONT_GAP);
    HW = hw;
    if (parkLeft) {
      [parkU0, parkU1] = fitParkU(bu0, bu0 + parkW);
      houseU0 = parkU1 + FRONT_GAP;
    } else {
      [parkU0, parkU1] = fitParkU(LW - SIDE_SB - parkW, LW - SIDE_SB);
      houseU0 = parkU0 - FRONT_GAP - hw;
    }
  }

  // --- house pad (rear-anchored, 建蔽率-capped) ---------------------------
  const rearV = LD - REAR_SB;
  const houseAvailD = rearV - frontV;
  const targetArea = cfg.coverageRatio * (LW * LD);
  let depthCap = clamp(targetArea / Math.max(HW, cfg.panelW), HOUSE_MIN_D, houseAvailD);
  // enforce the minimum building AREA (bump depth up, still bounded by the lot)
  if (HW * depthCap < cfg.minBuildingArea) depthCap = Math.min(houseAvailD, cfg.minBuildingArea / HW);
  const maxDepthBays = Math.max(1, Math.floor(depthCap / cfg.panelW));
  const hf0 = rearV - maxDepthBays * cfg.panelW; // house front line (≈ actual footprint)

  // --- fit the house rectangle inside the (possibly non-rectangular) lot -------
  // On a non-rect lot the AABB-derived rectangle can poke past a slanted/cut edge
  // (e.g. a trapezoid narrowing at the rear). Trim it a whole bay at a time — off
  // the overhanging side, or the front (shallower) — until every corner sits
  // inside the polygon. Rear stays anchored; the trim keeps the bay grid intact.
  let pu0 = houseU0, pu1 = houseU0 + HW, pvf = hf0;
  if (!rectLot) {
    const inn = (u: number, v: number) => insideWithMargin({ x: u, y: v }, lotUV, 0.02);
    const ok = () => inn(pu0, pvf) && inn(pu1, pvf) && inn(pu0, rearV) && inn(pu1, rearV);
    for (let it = 0; it < 60 && !ok(); it++) {
      const lOut = !inn(pu0, pvf) || !inn(pu0, rearV);
      const rOut = !inn(pu1, pvf) || !inn(pu1, rearV);
      const fOut = !inn(pu0, pvf) || !inn(pu1, pvf);
      if (lOut && pu1 - pu0 > cfg.panelW + 1e-6) pu0 += cfg.panelW;
      else if (rOut && pu1 - pu0 > cfg.panelW + 1e-6) pu1 -= cfg.panelW;
      else if (fOut && rearV - pvf > cfg.panelW + 1e-6) pvf += cfg.panelW;
      else break;
    }
  }
  const hu0 = pu0, hu1 = pu1, hf = pvf;
  const HW2 = hu1 - hu0; // clamped house width
  const houseDepth = rearV - hf;
  const pad: HousePad = {
    originWorld: W(hu0, rearV), axisU, axisV, anchor: 'rear', frontV,
    maxWidthBays: Math.max(1, Math.floor(HW2 / cfg.panelW)),
    maxDepthBays: Math.max(1, Math.round(houseDepth / cfg.panelW)),
  };

  // ==== ZONING: partition the WHOLE lot with NO gaps =======================
  // Real 外構 order = 動線 (drive + approach) first, then building, then gardens
  // fill the rest. Base tiles below cover the lot exactly (lot = A+B+C+D+house);
  // the drive, an L-shaped approach path, and an L-shaped garden are traced on
  // top so the layout isn't plain rectangles and nothing reads as empty.
  const zones: SiteRect[] = [];
  // On a non-rect lot every zone is CLIPPED to the real polygon so nothing spills
  // past a slanted/cut edge; the AABB base tiles still cover the lot gap-free
  // because the lot ⊆ AABB. On a rectangle it's a straight push (byte-identical).
  const pushZone = (ring: Vec2[], kind: ZoneKind) => {
    const r = rectLot ? ring : clipConvex(ring, lot.ring);
    if (r.length >= 3) zones.push({ ring: r, kind });
  };
  const roleForSide = (w: number): ZoneKind => (w >= GARDEN_MIN ? 'garden' : 'yard');
  pushZone(rect(0, rearV, LW, LD), 'yard');               // A 背面犬走り
  pushZone(rect(0, 0, hu0, rearV), roleForSide(hu0));     // B 左側帯
  pushZone(rect(hu1, 0, LW, rearV), roleForSide(LW - hu1)); // C 右側帯
  pushZone(rect(hu0, 0, hu1, hf), 'yard');                // D 前面フォアコート(土間)
  pushZone(rect(hu0, hf, hu1, rearV), 'yard');            // E 建物下地(犬走り: 実形状の余白を砂利で埋める)

  // entrance & gate — gate BESIDE the drive, path doglegs to the door (L字動線)
  let doorU = clamp((hu0 + hu1) / 2, hu0 + APPROACH_W, hu1 - APPROACH_W);
  let gateU: number;
  if (cars > 0 && arrangement === 'front') {
    doorU = parkLeft ? Math.max(doorU, parkU1 + APPROACH_W) : Math.min(doorU, parkU0 - APPROACH_W);
    doorU = clamp(doorU, hu0 + APPROACH_W, hu1 - APPROACH_W);
    gateU = parkLeft
      ? Math.min(hu1 - APPROACH_W / 2, parkU1 + APPROACH_W * 0.7)
      : Math.max(hu0 + APPROACH_W / 2, parkU0 - APPROACH_W * 0.7);
  } else {
    gateU = clamp(doorU, SIDE_SB + APPROACH_W / 2, LW - SIDE_SB - APPROACH_W / 2);
  }

  // driveway on top of the forecourt / side strip
  if (cars > 0 && parkW > 0) pushZone(rect(parkU0, 0, parkU1, parkDepth), 'parking');

  // side garden (主庭) on the roomier side, WRAPPING into the front corner away
  // from the entrance → an L, not a bare rectangle. Clipped off the drive+door.
  const gardenRight = LW - hu1 >= hu0;
  const sideW = gardenRight ? LW - hu1 : hu0;
  if (sideW >= GARDEN_MIN) {
    const g0 = gardenRight ? hu1 : 0;
    const g1 = gardenRight ? LW : hu0;
    const gRects: UVRect[] = [{ u0: g0, v0: 0, u1: g1, v1: rearV }];
    // bend across the front on the garden side, kept clear of the door + drive
    let cu0 = gardenRight ? Math.max(hu0, doorU + APPROACH_W) : hu0;
    let cu1 = gardenRight ? hu1 : Math.min(hu1, doorU - APPROACH_W);
    if (cars > 0) { if (gardenRight) cu0 = Math.max(cu0, parkU1); else cu1 = Math.min(cu1, parkU0); }
    if (cu1 - cu0 >= 0.8 && hf > 0.6) gRects.push({ u0: cu0, v0: 0, u1: cu1, v1: Math.min(hf, sideW + hf * 0.5) });
    pushZone(traceRectUnion(gRects, 0.2, W), 'garden');
  }

  // L-shaped approach path (pavers) over the forecourt/garden: gate → dogleg → door
  const aw = APPROACH_W;
  const midV = clamp(hf * 0.55, aw, Math.max(aw, hf - aw));
  const loU = Math.min(gateU, doorU), hiU = Math.max(gateU, doorU);
  const aRects: UVRect[] = [
    { u0: gateU - aw / 2, v0: 0, u1: gateU + aw / 2, v1: midV + aw / 2 },      // from gate inward
    { u0: loU - aw / 2, v0: midV - aw / 2, u1: hiU + aw / 2, v1: midV + aw / 2 }, // dogleg across
    { u0: doorU - aw / 2, v0: midV - aw / 2, u1: doorU + aw / 2, v1: hf },      // up to the door
  ];
  pushZone(traceRectUnion(aRects, 0.2, W), 'approach');

  // --- utility props (犬走り室外機 / 裏の物置 / 門脇の駐輪) ------------------
  const props: SiteProp[] = [];
  const acLeft = gardenRight; // AC on the犬走り side (opposite the garden)
  const acU = acLeft ? Math.max(0.3, hu0 - 0.3) : Math.min(LW - 0.3, hu1 + 0.3);
  for (let i = 0; i < (houseDepth > 3 ? 2 : 1); i++) {
    const v = rearV - 0.7 - i * 0.9;
    if (v > hf + 0.3) props.push({ kind: 'ac', center: W(acU, v), halfU: 0.22, halfV: 0.18, h: 0.6 });
  }
  const gapL = hu0, gapR = LW - hu1, shedRight = gapR >= gapL, gap = shedRight ? gapR : gapL;
  if (gap >= 1.3 && houseDepth >= 1.4) {
    const shw = Math.min(0.8, gap / 2 - 0.15);
    const cu = shedRight ? LW - SIDE_SB - shw : SIDE_SB + shw;
    const cv = rearV - 0.85;
    pushZone(rect(cu - shw - 0.15, cv - 0.85, cu + shw + 0.15, cv + 0.85), 'service');
    props.push({ kind: 'shed', center: W(cu, cv), halfU: shw, halfV: 0.7, h: 2.0 });
  }
  const bikeU = gateU + (gateU < doorU ? -0.8 : 0.8);
  if (frontV >= 2.0 && bikeU > SIDE_SB + 0.3 && bikeU < LW - SIDE_SB - 0.3) {
    props.push({ kind: 'bike', center: W(bikeU, 1.0), halfU: 0.3, halfV: 0.75, h: 1.0 });
  }

  // --- 植栽: natural mix per garden side (Web調査: 高木/中木/低木を不等辺三角形で、
  //     奥に高木・手前に低木、庭面積に応じた本数、密植しすぎない) ----------------
  const scatter = (u0: number, u1: number, v0: number, v1: number, kb: number) => {
    const w = u1 - u0, d = v1 - v0;
    if (w < 1.0 || d < 1.2) return; // not a real garden (犬走り等) → 植えない
    const n = Math.round(clamp((w * d) / 5, 1, 6)); // 面積で本数(1〜6)
    const pts: { u: number; v: number }[] = [];
    for (let k = 0; k < n; k++) {
      const u = u0 + w * (0.18 + 0.64 * rand01(cfg.seed, kb, 1, k));
      const v = v0 + d * (0.12 + 0.76 * rand01(cfg.seed, kb, 2, k)); // 不等辺: ランダム散布
      pts.push({ u, v });
    }
    pts.sort((a, b) => b.v - a.v); // 奥(v大)から: 高木→中木→低木
    const mids = Math.max(1, Math.floor(n / 3));
    pts.forEach((pt, i) => {
      const r = rand01(cfg.seed, kb, 3, i);
      if (i === 0) props.push({ kind: 'tree', center: W(pt.u, pt.v), halfU: Math.min(1.1, 0.8 + 0.3 * r), halfV: 0, h: 2.4 + 0.9 * r }); // シンボル高木
      else if (i <= mids) props.push({ kind: 'tree', center: W(pt.u, pt.v), halfU: 0.5 + 0.2 * r, halfV: 0, h: 1.5 + 0.5 * r }); // 中木
      else props.push({ kind: 'shrub', center: W(pt.u, pt.v), halfU: 0.35 + 0.2 * r, halfV: 0, h: 0.5 + 0.3 * r }); // 低木/下草
    });
  };
  // side gardens, each with a v-range that skips a beside-drive at the front
  const leftV0 = arrangement === 'beside' && parkLeft ? parkDepth + 0.4 : 0.5;
  scatter(0.35, hu0 - 0.2, leftV0, rearV - 0.4, 741);
  const rightV0 = arrangement === 'beside' && !parkLeft ? parkDepth + 0.4 : 0.5;
  scatter(hu1 + 0.2, LW - 0.35, rightV0, rearV - 0.4, 751);
  // a couple of low front-hedge shrubs, only where the front edge is fenced (not drive/gate)
  for (const cu of [SIDE_SB + 0.4, LW - SIDE_SB - 0.4]) {
    const inDrive = parkW > 0 && cu >= parkU0 - 0.6 && cu <= parkU1 + 0.6;
    const inGate = cu >= gateU - APPROACH_W && cu <= gateU + APPROACH_W;
    if (!inDrive && !inGate) props.push({ kind: 'shrub', center: W(cu, 0.35), halfU: 0.35, halfV: 0, h: 0.5 });
  }

  // --- parked cars (random occupancy) + optional carport -------------------
  const CAR_COLORS = [0xe8e8ea, 0x1b1d21, 0x8f949b, 0x35435a, 0x7a2f2f, 0x2f4a37];
  if (cars > 0 && parkW > 0) {
    const stallW = parkW / cars;
    for (let i = 0; i < cars; i++) {
      if (rand01(cfg.seed, 601, i) < 0.4) continue; // some stalls sit empty
      const cu = parkU0 + (i + 0.5) * stallW;
      const cv = Math.min(parkDepth - 0.4, 2.4); // nose toward the road
      props.push({ kind: 'car', center: W(cu, cv), halfU: 0.85, halfV: 2.05, h: 1.5,
        color: CAR_COLORS[Math.floor(rand01(cfg.seed, 602, i) * CAR_COLORS.length)] });
    }
  }
  let carport: SitePlan['carport'];
  if (cars > 0 && parkW > 0 && parkDepth >= 4.6 && rand01(cfg.seed, 610) < 0.35) {
    const cpRing = rect(parkU0, 0, parkU1, parkDepth);
    const clipped = rectLot ? cpRing : clipConvex(cpRing, lot.ring);
    if (clipped.length >= 3) carport = { ring: clipped, height: 2.3 }; // 独立カーポート
  }

  // --- perimeter fence -----------------------------------------------------
  // The road-side (front) edge splits into solid runs, a gate opening, and the
  // driveway mouth (measured in local u); the back + side edges are solid runs.
  const gate0 = gateU - aw / 2, gate1 = gateU + aw / 2;
  // Emit the split front edge over the u-interval [uLo,uHi]; W() maps u onto the
  // v=0 line, which is exactly the front edge for every sample lot shape.
  const frontRuns = (uLo: number, uHi: number, outN: Vec2) => {
    const brk = new Set<number>([uLo, uHi]);
    for (const g of [gate0, gate1]) if (g > uLo && g < uHi) brk.add(g);
    if (parkW > 0) for (const p of [parkU0, parkU1]) if (p > uLo && p < uHi) brk.add(p);
    const xs = [...brk].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i], x1 = xs[i + 1];
      if (x1 - x0 < 1e-3) continue;
      const mid = (x0 + x1) / 2;
      const isOpen = parkW > 0 && mid >= parkU0 - 1e-6 && mid <= parkU1 + 1e-6; // driveway mouth
      const isGate = !isOpen && mid >= gate0 - 1e-6 && mid <= gate1 + 1e-6;
      const kind: FenceKind = isOpen ? 'open' : isGate ? 'gate' : 'solid';
      fences.push({ a: W(x0, 0), b: W(x1, 0), normal: outN, kind, height: kind === 'open' ? 0 : kind === 'gate' ? 1.1 : 1.2 });
    }
  };
  const fences: FenceSpan[] = [];
  if (rectLot) {
    // rectangle: back + two sides solid, front edge split
    fences.push({ a: W(0, LD), b: W(LW, LD), normal: axisV, kind: 'solid', height: 1.6 });        // back
    fences.push({ a: W(0, 0), b: W(0, LD), normal: scale(axisU, -1), kind: 'solid', height: 1.6 }); // left
    fences.push({ a: W(LW, 0), b: W(LW, LD), normal: axisU, kind: 'solid', height: 1.6 });          // right
    frontRuns(0, LW, scale(axisV, -1));
  } else {
    // any convex polygon: fence each actual edge; the road-facing edge is split
    const frontIdx = frontEdgeIndex(lot.ring, lot.roadDir);
    for (let i = 0; i < lot.ring.length; i++) {
      const P = lot.ring[i], Q = lot.ring[(i + 1) % lot.ring.length];
      const d = norm(sub(Q, P));
      const outN = { x: d.y, y: -d.x }; // outward normal of a CCW edge
      if (i === frontIdx) {
        const uP = dot(sub(P, origin), axisU), uQ = dot(sub(Q, origin), axisU);
        frontRuns(Math.min(uP, uQ), Math.max(uP, uQ), outN);
      } else {
        fences.push({ a: P, b: Q, normal: outN, kind: 'solid', height: 1.6 });
      }
    }
  }

  // conform loose props (plantings / cars / shed / AC / bike) to the real lot
  const keptProps = rectLot ? props : props.filter((p) => pointInPolygon(p.center, lot.ring));

  return { lotRing: lot.ring, arrangement, cars, pad, zones, props: keptProps, carport, fences };
}

/** Index of the lot edge most facing the road (the frontage edge to split). */
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

/** A union of axis-aligned uv rects, rasterized at `res` and boundary-traced into
 *  a single CCW world ring — yields organic L/U shapes (garden, dogleg path). */
interface UVRect { u0: number; v0: number; u1: number; v1: number; }
function traceRectUnion(rects: UVRect[], res: number, W: (u: number, v: number) => Vec2): Vec2[] {
  const cells = new Set<string>();
  for (const r of rects) {
    const i0 = Math.round(r.u0 / res), i1 = Math.round(r.u1 / res);
    const j0 = Math.round(r.v0 / res), j1 = Math.round(r.v1 / res);
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) cells.add(`${i},${j}`);
  }
  if (cells.size === 0) return [];
  const has = (x: number, y: number) => cells.has(`${x},${y}`);
  const key = (x: number, y: number) => `${x},${y}`;
  const edges = new Map<string, { x: number; y: number }>();
  for (const c of cells) {
    const [gx, gy] = c.split(',').map(Number);
    if (!has(gx, gy - 1)) edges.set(key(gx, gy), { x: gx + 1, y: gy });
    if (!has(gx + 1, gy)) edges.set(key(gx + 1, gy), { x: gx + 1, y: gy + 1 });
    if (!has(gx, gy + 1)) edges.set(key(gx + 1, gy + 1), { x: gx, y: gy + 1 });
    if (!has(gx - 1, gy)) edges.set(key(gx, gy + 1), { x: gx, y: gy });
  }
  const start = edges.keys().next().value as string;
  const [sx, sy] = start.split(',').map(Number);
  const loop: { x: number; y: number }[] = [];
  let cur = { x: sx, y: sy };
  for (let i = 0; i < edges.size + 4; i++) {
    loop.push(cur);
    const nxt = edges.get(key(cur.x, cur.y));
    if (!nxt || (nxt.x === sx && nxt.y === sy)) break;
    cur = nxt;
  }
  const out: Vec2[] = [];
  for (let i = 0; i < loop.length; i++) {
    const p = loop[(i - 1 + loop.length) % loop.length], c = loop[i], q = loop[(i + 1) % loop.length];
    if ((c.x - p.x) * (q.y - c.y) - (c.y - p.y) * (q.x - c.x) !== 0) out.push(W(c.x * res, c.y * res));
  }
  return out;
}
