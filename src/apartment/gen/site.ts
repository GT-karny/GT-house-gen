// ============================================================================
// 集合住宅 敷地計画。建物(住棟バー)を敷地内に配置し、外構を隙間なくゾーニング:
// 前面の駐車フィールド(store の fillParkingRegion/mergeParking を無改変再利用)、
// 駐輪場、ゴミ置場、アプローチ、外周緑地帯、駐車出入口、外周フェンス、プロップ。
// すべて lot-local (u,v)(u=街路平行 / v=道路からの奥行)で計算し、任意凸敷地に対応。
// 住棟は敷地奥に配置し、バルコニー面(前面)を道路側に向ける。純ロジック。
// ============================================================================

import type { AptConfig } from './config';
import { resolveAccessType, resolveExteriorStair } from './config';
import { EXT_STAIR_SPAN_V } from './stairs';
import type {
  AptLot, AptSitePlan, AptPad, AptSiteRect, AptProp, FenceSpan, AptZoneKind, Vec2,
} from './types';
import type { StoreConfig } from '../../store/gen/config';
import { rand01 } from '../../shared/rng';
import { norm, sub, dot, add, scale, len } from '../../shared/vec';
import { pointInPolygon, distToBoundary, clipConvex, rectInsideConvex } from '../../shared/poly';
import { fillParkingRegion, mergeParking } from '../../store/gen/parking';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const yawOf = (d: Vec2) => (Math.atan2(d.y, d.x) * 180) / Math.PI;

export function planAptSite(lot: AptLot, cfg: AptConfig): AptSitePlan {
  const seed = cfg.seed;
  const gm = cfg.gridModule;
  const EDGE = cfg.edgeLandscape;
  const side = Math.max(cfg.sideSetback, EDGE);

  // --- lot-local frame(v は道路から離れる向き)、ring を (u,v) へ射影 ---
  const axisU = norm(lot.longestEdgeDir);
  const axisV: Vec2 = { x: -axisU.y, y: axisU.x };
  const W = (u: number, v: number): Vec2 => ({
    x: lot.centroid.x + axisU.x * u + axisV.x * v,
    y: lot.centroid.y + axisU.y * u + axisV.y * v,
  });
  const rectUV = (u0: number, v0: number, u1: number, v1: number): Vec2[] => [W(u0, v0), W(u1, v0), W(u1, v1), W(u0, v1)];
  const lotUV = lot.ring.map((p) => {
    const d = sub(p, lot.centroid);
    return { x: dot(d, axisU), y: dot(d, axisV) };
  });
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const q of lotUV) {
    uMin = Math.min(uMin, q.x); uMax = Math.max(uMax, q.x);
    vMin = Math.min(vMin, q.y); vMax = Math.max(vMax, q.y);
  }

  // 背面の共用廊下/外廊下は両アクセス型とも確保(片廊下=cfg.corridorWidth、階段室型=外廊下1.2)。
  const corridorW = resolveAccessType(cfg) === 'single-corridor' ? Math.max(cfg.corridorWidth, 1.2) : 1.2;

  // 使用可能矩形(外周緑地/側方後退の内側)。道路=小さい v 側。
  const uUse0 = uMin + side, uUse1 = uMax - side;
  const vUse0 = vMin + EDGE, vUse1 = vMax - EDGE;
  const usableU = Math.max(0, uUse1 - uUse0);
  const usableV = Math.max(0, vUse1 - vUse0);

  const depthWanted = Math.max(3, Math.round(cfg.unitDepth / gm));
  const rearSpace = cfg.rearSetback + corridorW;
  const frontClear = cfg.balconyDepth + cfg.frontSetback; // バルコニー前庭
  const capLen = Math.max(4, cfg.buildingLengthBays);
  // 外階段は廊下の外へ EXT_STAIR_SPAN_V ぶん張り出す。敷地外へ出ないよう廊下側にその奥行を予約。
  const extStair = resolveExteriorStair(cfg, cfg.floors);
  const stairProj = extStair ? EXT_STAIR_SPAN_V + 0.4 : 0;
  const corridorSide = corridorW + stairProj; // 廊下側(背面)に確保する総奥行(廊下+階段)

  // --- 建物の向き(facing = バルコニーが向く方角: 前(道路)/後(奥)/左/右)を seed で選ぶ ---
  // 棟長軸(∥間口=A / ∥奥行=B)で region 分割が決まり、その中で 180°反転(廊下↔道路)を許して
  // 4方向に。奥行ベイは「前庭+建物+廊下側(廊下+階段)」が横断方向に収まるよう敷地で頭打ち。
  const depthCapA = Math.floor((usableV - frontClear - corridorSide) / gm); // 棟長∥u: 奥行∥v
  const depthCapB = Math.floor((usableU - frontClear - corridorSide) / gm); // 棟長∥v: 奥行∥u
  const depthA = Math.max(2, Math.min(depthWanted, depthCapA));
  const depthB = Math.max(2, Math.min(depthWanted, depthCapB));
  const lenCapA = Math.floor(usableU / gm);
  const lenCapB = Math.floor((usableV - cfg.frontSetback - cfg.rearSetback) / gm);
  const fitsA = lenCapA >= 4 && depthCapA >= 2;
  const fitsB = lenCapB >= 6 && depthCapB >= 2;
  // 「良い向き」= 駐車ベイ(通路+マス1列)が成立する余地を残す軸。成立する facing を集めて seed 抽選。
  const parkBay = cfg.aisleW + cfg.stallL;
  const aGood = fitsA && usableV - corridorSide - depthA * gm - frontClear >= parkBay;
  const bGood = fitsB && usableU - corridorSide - depthB * gm - frontClear >= parkBay;
  type Facing = 'front' | 'back' | 'left' | 'right';
  const faces: Facing[] = [];
  if (aGood) faces.push('front', 'back');
  if (bGood) faces.push('left', 'right');
  if (faces.length === 0) faces.push(fitsB && !fitsA ? 'left' : 'front'); // 極小敷地のフォールバック
  const facing = faces[Math.min(faces.length - 1, Math.floor(rand01(seed, 0x0a1e) * faces.length))];
  const orient: 'A' | 'B' = facing === 'front' || facing === 'back' ? 'A' : 'B';

  // フットプリント(u,v) / pad / 拡張矩形(前庭+廊下+階段) / アプローチ前庭 / バルコニー面。使用可能域に収める。
  let bU0: number, bU1: number, bV0: number, bV1: number, lengthBays: number, depthBays: number;
  let padOrigin: Vec2, padAxisU: Vec2, padAxisV: Vec2, padFrontV: number;
  let exU0: number, exU1: number, exV0: number, exV1: number;
  let apU0: number, apU1: number, apV0: number, apV1: number;
  let faceCenter: Vec2, faceTangent: Vec2, balconyOutward: Vec2;

  if (orient === 'A') {
    // 棟長∥u、奥行∥v。左右位置を seed で振る。facing=front(バルコニー道路) / back(バルコニー奥)。
    depthBays = depthA;
    lengthBays = Math.max(1, Math.min(capLen, lenCapA));
    const lenM = lengthBays * gm, depM = depthBays * gm;
    const uHiB = Math.max(uUse0, uUse1 - lenM);
    bU0 = uUse0 + (uHiB - uUse0) * rand01(seed, 0xb1d0); bU1 = Math.min(bU0 + lenM, uUse1);
    padAxisU = axisU; faceTangent = axisU; apU0 = bU0; apU1 = bU1; exU0 = bU0; exU1 = bU1;
    if (facing === 'front') { // バルコニー=道路(−v)、廊下+階段=奥(+v)
      bV1 = Math.min(vMax - rearSpace, vUse1 - corridorSide); bV0 = bV1 - depM;
      if (bV0 < vUse0) { bV0 = vUse0; bV1 = bV0 + depM; }
      padOrigin = W(bU0, bV0); padAxisV = axisV; padFrontV = bV0; balconyOutward = scale(axisV, -1);
      exV0 = bV0 - frontClear; exV1 = bV1 + corridorSide; apV0 = bV0 - frontClear; apV1 = bV0;
      faceCenter = W((bU0 + bU1) / 2, bV0);
    } else { // back: バルコニー=奥(+v)、廊下+階段=道路(−v)
      bV0 = vUse0 + corridorSide; bV1 = bV0 + depM;
      padOrigin = W(bU0, bV1); padAxisV = scale(axisV, -1); padFrontV = bV1; balconyOutward = axisV;
      exV0 = bV0 - corridorSide; exV1 = bV1 + frontClear; apV0 = bV1; apV1 = bV1 + frontClear;
      faceCenter = W((bU0 + bU1) / 2, bV1);
    }
  } else {
    // 棟長∥v、奥行∥u。前後(道路方向)位置を seed で振る。facing=left(バルコニー−u) / right(+u)。
    depthBays = depthB;
    lengthBays = Math.max(1, Math.min(capLen, lenCapB));
    const lenM = lengthBays * gm, depM = depthBays * gm;
    const vAvail = Math.max(0, usableV - cfg.frontSetback - cfg.rearSetback - lenM);
    bV0 = vUse0 + cfg.frontSetback + vAvail * rand01(seed, 0xb1d0); bV1 = bV0 + lenM;
    padAxisU = axisV; faceTangent = axisV; apV0 = bV0; apV1 = bV1; exV0 = bV0; exV1 = bV1; padFrontV = bV0;
    if (facing === 'right') { // バルコニー=+u、廊下+階段=−u。建物を左へ寄せる。
      bU0 = uUse0 + corridorSide; bU1 = bU0 + depM;
      padOrigin = W(bU1, bV0); padAxisV = scale(axisU, -1); balconyOutward = axisU;
      exU0 = bU0 - corridorSide; exU1 = bU1 + frontClear; apU0 = bU1; apU1 = bU1 + frontClear;
      faceCenter = W(bU1, (bV0 + bV1) / 2);
    } else { // left: バルコニー=−u、廊下+階段=+u。建物を右へ寄せる。
      bU1 = uUse1 - corridorSide; bU0 = bU1 - depM;
      padOrigin = W(bU0, bV0); padAxisV = axisU; balconyOutward = scale(axisU, -1);
      exU0 = bU0 - frontClear; exU1 = bU1 + corridorSide; apU0 = bU0 - frontClear; apU1 = bU0;
      faceCenter = W(bU0, (bV0 + bV1) / 2);
    }
  }

  const pad: AptPad = {
    originWorld: padOrigin, axisU: padAxisU, axisV: padAxisV, anchor: 'front', frontV: padFrontV,
    maxWidthBays: lengthBays, maxDepthBays: depthBays,
  };

  exU0 = clamp(exU0, uUse0, uUse1); exU1 = clamp(exU1, uUse0, uUse1);
  exV0 = clamp(exV0, vUse0, vUse1); exV1 = clamp(exV1, vUse0, vUse1);

  // ==== ゾーニング(先に clipZone を用意)====
  const zones: AptSiteRect[] = [];
  zones.push({ ring: lot.ring, kind: 'leftover' }); // 舗装ベース(全敷地)→ 隙間なし
  for (let i = 0; i < lot.ring.length; i++) {
    const A0 = lot.ring[i], B0 = lot.ring[(i + 1) % lot.ring.length];
    const e = norm(sub(B0, A0));
    const inN = { x: -e.y, y: e.x };
    zones.push({ ring: [A0, B0, add(B0, scale(inN, EDGE)), add(A0, scale(inN, EDGE))], kind: 'landscape' });
  }
  const clipZone = (ring: Vec2[], kind: AptZoneKind) => {
    const c = clipConvex(ring, lot.ring);
    if (c.length >= 3) zones.push({ ring: c, kind });
  };

  // ==== 駐車: 建物まわりの空き矩形(左/右/前/後)を全て駐車で埋める(側方の広い空地も活用)====
  // fillParkingRegion は向き非依存(a=行 / b=奥行)。region ごとに (a,b)→world を注入する。
  const pcfg = { stallW: cfg.stallW, stallL: cfg.stallL, aisleW: cfg.aisleW, occupancy: cfg.occupancy } as unknown as StoreConfig;
  interface Region { name: 'left' | 'right' | 'front' | 'back'; a0: number; a1: number; b1: number; W: (a: number, b: number) => Vec2; aDir: Vec2; area: number; }
  const regions: Region[] = [];
  // 各 region は「駐車列(a)を長辺に取り、奥行(b)を短辺に取る」= 列を最大化し交差通路の割
  // 負けを抑える。b0(進入通路)は建物と反対の外周側に置く。buildingEdge=建物に接する辺。
  const mkRegion = (name: Region['name'], u0: number, u1: number, v0: number, v1: number, buildingEdge: 'umin' | 'umax' | 'vmin' | 'vmax') => {
    const du = u1 - u0, dv = v1 - v0;
    if (du <= 1.0 || dv <= 1.0) return;
    let a0: number, a1: number, b1: number, Wf: (a: number, b: number) => Vec2, aDir: Vec2;
    if (du >= dv) { // 列=u。奥行=v(建物が v 辺なら外周側を b0 に)。
      a0 = u0; a1 = u1; b1 = dv; aDir = axisU;
      Wf = buildingEdge === 'vmin' ? (a, b) => W(a, v1 - b) : (a, b) => W(a, v0 + b);
    } else { // 列=v。奥行=u。
      a0 = v0; a1 = v1; b1 = du; aDir = axisV;
      Wf = buildingEdge === 'umin' ? (a, b) => W(u1 - b, a) : (a, b) => W(u0 + b, a);
    }
    regions.push({ name, a0, a1, b1, W: Wf, aDir, area: du * dv });
  };
  // 空き矩形の分割: 建物の「奥行方向の端」region を全幅に取り(駐車列を最長化)、「長さ方向
  // の端」region は建物帯のみに絞る(重なりなく usable−拡張矩形 を覆う)。
  if (orient === 'A') { // 棟長∥u → 前後(v端)を全幅、側方(u端)は建物 v 帯のみ
    mkRegion('front', uUse0, uUse1, vUse0, exV0, 'vmax');
    mkRegion('back', uUse0, uUse1, exV1, vUse1, 'vmin');
    mkRegion('left', uUse0, exU0, exV0, exV1, 'umax');
    mkRegion('right', exU1, uUse1, exV0, exV1, 'umin');
  } else { // 棟長∥v → 側方(u端)を全高、前後(v端)は建物 u 帯のみ
    mkRegion('left', uUse0, exU0, vUse0, vUse1, 'umax');
    mkRegion('right', exU1, uUse1, vUse0, vUse1, 'umin');
    mkRegion('front', exU0, exU1, vUse0, exV0, 'vmax');
    mkRegion('back', exU0, exU1, exV1, vUse1, 'vmin');
  }

  const props: AptProp[] = [];
  const regionRing = (reg: Region, a0: number, a1: number, b0: number, b1: number): Vec2[] => [reg.W(a0, b0), reg.W(a1, b0), reg.W(a1, b1), reg.W(a0, b1)];
  // 駐輪+ゴミ置場は最大の空き region の a 端に確保し、残りを駐車で埋める。
  const svc = regions.slice().sort((x, y) => y.area - x.area)[0];
  const parts: ReturnType<typeof fillParkingRegion>[] = [];
  let salt = 0x1000;
  const bikeReq = cfg.bicycleRatioPerUnit > 0;
  for (const reg of regions) {
    const accN = reg.name === 'front' ? 2 : 0; // 車椅子用は前面/エントランス寄りに
    const aRange = reg.a1 - reg.a0;
    const wantBike = svc && reg === svc && bikeReq && reg.b1 >= 2.2 && aRange >= 3.5 + cfg.stallL;
    if (wantBike) {
      const bikeSpan = clamp(aRange * 0.35, 3.5, 6.0);
      const bikeDepth = Math.min(reg.b1, clamp(reg.b1 * 0.7, 2.6, 6.5));
      clipZone(regionRing(reg, reg.a0, reg.a0 + bikeSpan, 0, bikeDepth), 'bike');
      props.push({ kind: 'bikeshelter', center: reg.W(reg.a0 + bikeSpan / 2, bikeDepth / 2), halfU: bikeDepth / 2, halfV: bikeSpan / 2, h: 2.1, yawDeg: yawOf(reg.aDir) });
      const nR = Math.max(1, Math.floor(bikeSpan / 1.6));
      for (let j = 0; j < nR; j++) {
        const ac = reg.a0 + (bikeSpan * (j + 0.5)) / nR;
        props.push({ kind: 'bikerack', center: reg.W(ac, bikeDepth / 2), halfU: 0.8, halfV: bikeDepth / 2 - 0.25, h: 1.1, yawDeg: yawOf(reg.aDir) });
      }
      // ゴミ置場(駐輪コラムの奥 b に積む)
      if (cfg.refuseStation) {
        const refD = Math.min(2.6, Math.max(0, reg.b1 - bikeDepth - 0.4));
        if (refD >= 1.5) {
          const rw = Math.min(bikeSpan - 0.4, 3.0);
          clipZone(regionRing(reg, reg.a0, reg.a0 + rw, bikeDepth + 0.4, bikeDepth + 0.4 + refD), 'refuse');
          props.push({ kind: 'refuse', center: reg.W(reg.a0 + rw / 2, bikeDepth + 0.4 + refD / 2), halfU: refD / 2 - 0.1, halfV: rw / 2 - 0.2, h: 1.6, yawDeg: yawOf(reg.aDir) });
        }
      }
      // 駐輪コラムを除いた残り a を駐車で埋める
      parts.push(fillParkingRegion({ a0: reg.a0 + bikeSpan, a1: reg.a1, b0: 0, b1: reg.b1, W: reg.W }, pcfg, seed, salt++, false, accN));
    } else {
      parts.push(fillParkingRegion({ a0: reg.a0, a1: reg.a1, b0: 0, b1: reg.b1, W: reg.W }, pcfg, seed, salt++, false, accN));
    }
  }
  const parking = mergeParking(pcfg, parts);
  parking.stalls = parking.stalls.filter((s) => stallInside(s, lot.ring, 0.3));
  parking.count = parking.stalls.length;

  // 駐車パッチ + 建物下地 + アプローチ前庭を zone 化
  for (const r of parking.rows) clipZone(r.ring, 'parking');
  for (const a of parking.aisles) clipZone(a.ring, 'aisle');
  clipZone(rectUV(bU0, bV0, bU1, bV1), 'pad');
  if (apU1 - apU0 > 0.2 && apV1 - apV0 > 0.2) clipZone(rectUV(apU0, apV0, apU1, apV1), 'approach');

  // --- 出入口 + 外周フェンス ---
  const frontIdx = frontEdgeIndex(lot.ring, lot.roadDir);
  const A = lot.ring[frontIdx], B = lot.ring[(frontIdx + 1) % lot.ring.length];
  const eDir = norm(sub(B, A));
  const eLen = len(sub(B, A));
  const driveW = clamp(6, 3, eLen - 2);
  const driveFrac = rand01(seed, 0x51) < 0.5 ? 0.28 : 0.72;
  const tC = clamp(driveFrac * eLen, driveW / 2 + 0.5, eLen - driveW / 2 - 0.5);
  const g0 = tC - driveW / 2, g1 = tC + driveW / 2;
  const entrances = [{ pos: add(A, scale(eDir, tC)), width: driveW }];

  const fences: FenceSpan[] = [];
  for (let i = 0; i < lot.ring.length; i++) {
    const P = lot.ring[i], Q = lot.ring[(i + 1) % lot.ring.length];
    const d = norm(sub(Q, P));
    const outN = { x: d.y, y: -d.x };
    if (i === frontIdx) {
      const cuts = [0, g0, g1, eLen].sort((x, y) => x - y);
      for (let k = 0; k < cuts.length - 1; k++) {
        const x0 = cuts[k], x1 = cuts[k + 1];
        if (x1 - x0 < 1e-3) continue;
        const mid = (x0 + x1) / 2;
        const open = mid >= g0 - 1e-6 && mid <= g1 + 1e-6;
        fences.push({ a: add(P, scale(d, x0)), b: add(P, scale(d, x1)), normal: outN, kind: open ? 'open' : 'hedge', height: open ? 0 : 0.6 });
      }
    } else {
      fences.push({ a: P, b: Q, normal: outN, kind: 'fence', height: 1.2 });
    }
  }

  // --- props: 各駐車 region のポール灯 / エントランス周り / 前面植栽 ---
  for (const reg of regions) {
    if (reg.area < 24) continue;
    for (const af of [0.28, 0.72]) props.push({ kind: 'lightpole', center: reg.W(reg.a0 + (reg.a1 - reg.a0) * af, reg.b1 * 0.55), halfU: 0.12, halfV: 0.12, h: 5.0 });
  }
  // エントランス: 集合郵便受け + ベンチ(バルコニー面の中央付近)。長辺は面接線(=pad.axisU)沿い。
  props.push({ kind: 'mailbox', center: add(add(faceCenter, scale(faceTangent, -1.6)), scale(balconyOutward, 1.0)), halfU: 0.9, halfV: 0.25, h: 1.3, yawDeg: yawOf(faceTangent) });
  props.push({ kind: 'bench', center: add(add(faceCenter, scale(faceTangent, 1.6)), scale(balconyOutward, 1.0)), halfU: 0.8, halfV: 0.3, h: 0.45, yawDeg: yawOf(faceTangent) });
  // 前面緑地帯の植栽(出入口は空ける)
  const nTree = Math.round(clamp(eLen / 6, 2, 10));
  for (let i = 0; i < nTree; i++) {
    const t = (eLen * (i + 0.5)) / nTree;
    if (t > g0 - 1 && t < g1 + 1) continue;
    const r = rand01(seed, 0x7ee, i);
    const pos = add(add(A, scale(eDir, t)), scale({ x: -eDir.y, y: eDir.x }, EDGE * (0.35 + 0.3 * r)));
    if (r < 0.6) props.push({ kind: 'tree', center: pos, halfU: 1.0 + 0.6 * r, halfV: 0, h: 3.5 + 1.5 * r });
    else props.push({ kind: 'shrub', center: pos, halfU: 0.5, halfV: 0, h: 0.6 });
  }
  // 敷地内に収まる prop のみ
  const kept = props.filter((p) => pointInPolygon(p.center, lot.ring) && distToBoundary(p.center, lot.ring) >= 0);

  return {
    lotRing: lot.ring, pad, parking,
    parkingRequired: 0, parkingShort: false, bikeRequired: 0, // building 側で総戸数から確定
    zones, props: kept, fences, entrances,
  };
}

/** 道路に最も面する敷地エッジ(frontage)の index。 */
function frontEdgeIndex(ring: Vec2[], roadDir: Vec2): number {
  let best = 0, bestScore = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const A = ring[i], B = ring[(i + 1) % ring.length];
    const d = norm(sub(B, A));
    const outN = { x: d.y, y: -d.x };
    const score = dot(outN, roadDir) * len(sub(B, A));
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** スタルの4隅(world, CCW)。 */
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

function stallInside(s: { center: Vec2; halfU: number; halfV: number; yawDeg: number }, ring: Vec2[], margin: number): boolean {
  return rectInsideConvex(stallCorners(s), ring, margin);
}
