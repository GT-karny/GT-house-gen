// ============================================================================
// 集合住宅の描画(M1 簡易)。住棟マスを CC0-PBR 壁(実寸 planar UV)で立ち上げ、
// facade パネル(掃き出し窓/居室窓/玄関ドア/MB/階段室窓/エントランス)を面に proud
// で重ね、バルコニー(スラブ + 4種の手摺 + 左右の隔て板)/共用廊下スラブ、屋根、塔屋、
// 屋外鉄骨階段(折り返し)を載せる。敷地は ./site に委譲。純プラン/roofs/site を消費。
// ============================================================================

import * as THREE from 'three';
import type {
  AptBuildingPlan, AptPanel, Balcony, BalconyPartition, BarFrame, CorridorSlab, ExteriorStair, Penthouse, Vec2,
} from '../gen/types';
import type { AptRoofMass } from '../gen/roof';
import { planarBoxUV, WALL_TILE, makeDoorModule, type ModuleMesh } from '../../viewer/modules';
import {
  storeWallMaterial, mullionMaterial, parapetMaterial, roofMaterial, metalMaterial, poleMaterial,
  curbMaterial, propMaterial, windowGlassMaterial, railGlassMaterial, accentMaterial, mbMaterial,
  type StoreWallVariant,
} from './materials';
import { aptSiteMeshes } from './site';
import type { AptSitePlan } from '../gen/types';
import {
  resolveWindowAppearance, windowAppearanceMaterial, type WindowLightingMode,
} from '../../viewer/windowSurfaces';

const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);
const dir3 = (x: number, y: number) => new THREE.Vector3(x, 0, -y).normalize();
const PROUD = 0.1;

export type BalconyRailStyle = 'glass' | 'bars' | 'panel' | 'concrete';
export type StairGuardStyle = 'steel' | 'white' | 'wall'; // 外階段ガード: スチール / 白 / 外壁同色パネル

export type WallPattern = 'horizontal' | 'vertical' | 'none';

export interface AptRenderParams {
  seed: number;
  windowLighting: WindowLightingMode;
  windowInteriorMapping: boolean;
  showSite: boolean;
  wallMain: StoreWallVariant;
  wallBase: StoreWallVariant; // 1階の腰壁(water two-tone)。=wallMain なら単一
  accent: number; // 手摺笠木 / 庇
  balconyRail: BalconyRailStyle;
  stairGuard: StairGuardStyle;
  wallPattern: WallPattern; // §10.4 ツートン分節。vertical=戸境の縦帯を立てる
  stripe: number; // vertical パターン時の縦帯色
}

export function renderApartment(
  plan: AptBuildingPlan,
  roofs: AptRoofMass[],
  site: AptSitePlan,
  p: AptRenderParams
): THREE.Group {
  const g = new THREE.Group();
  if (p.showSite) for (const o of aptSiteMeshes(site)) g.add(o);

  const baseZ = roofs.length ? roofs[0].eaveZ - plan.floors * plan.floorHeight : 0;
  buildingMass(g, plan.bar, plan.floors, plan.floorHeight, baseZ, p);
  // 縦帯(戸境)ツートン: バルコニー面の住戸境界に全高の別色ストライプを立てる(§10.4)。
  if (p.wallPattern === 'vertical') {
    for (const m of verticalStripeMeshes(plan.bar, plan.units, plan.floors, plan.floorHeight, baseZ, p.stripe)) g.add(m);
  }

  // 玄関ドアは house-gen の詳細ドアモジュール(框戸/フラット)を1回作って共有描画。
  // サイズはドアパネルの w/h(facade が実寸で設定: leaf≈0.86m / 開口≈2.03m)から組む。
  const doorP = plan.panels.find((pn) => pn.type === 'door');
  const doorMod = doorP ? makeDoorModule(doorP.w, doorP.h, { style: 'flush' }, storeWallMaterial(p.wallMain)) : null;
  for (const panel of plan.panels) {
    if (panel.type === 'door') { if (doorMod) g.add(doorInstance(doorMod, panel)); }
    else g.add(panelMesh(panel, p.accent, p.seed, p.windowLighting, p.windowInteriorMapping));
  }
  for (const b of plan.balconies) g.add(balconyMesh(b, p.balconyRail, p.accent));
  for (const part of plan.partitions) g.add(partitionMesh(part));
  // 外階段が接続する位置は外廊下の腰壁に開口を空ける(階段⇄廊下の通り抜け)
  const stairOpenings = plan.exteriorStairs.map((s): [number, number] => {
    const uc = dot(sub(s.base, plan.bar.origin), plan.bar.axisU);
    const d0 = uc - s.runU / 2 - 0.05; // 廊下ローカル距離(a 起点)。near landing 側に開口
    return [Math.max(0, d0 - 0.1), d0 + 1.2];
  });
  for (const c of plan.corridors) g.add(corridorSlab(c, p.wallMain, stairOpenings));

  // 端部(妻)の返し壁: バルコニー/外廊下の左右側面を外壁マテリアルで閉じる
  const balconyDepth = plan.balconies[0]?.depth ?? 1.5;
  for (const m of endReturnMeshes(plan.bar, plan.floors, plan.floorHeight, baseZ, balconyDepth, plan.corridor.widthM, p.wallMain)) g.add(m);

  // 軒: どの屋根形式でもベランダ(前)と玄関前=外廊下(後)を覆うサイズで張り出す
  const eaveF = balconyDepth + 0.25, eaveR = plan.corridor.widthM + 0.25, eaveS = 0.45;
  for (const m of aptRoofMeshes(plan.bar, roofs, eaveF, eaveR, eaveS)) g.add(m);
  for (const ph of plan.penthouses) penthouseMeshes(ph, p).forEach((m) => g.add(m));
  for (const s of plan.exteriorStairs) exteriorStairMeshes(s, p.stairGuard, p.wallMain).forEach((m) => g.add(m));
  return g;
}

/** 端部(妻)の返し壁。バルコニー(前面)/外廊下(背面)の張出しスラブの左右側面を、外壁と
 *  同じ仕上げの立上り壁で閉じる(玄関側の「側面に壁がない」を解消)。 */
function endReturnMeshes(
  bar: BarFrame, floors: number, fh: number, baseZ: number,
  balconyDepth: number, corridorW: number, wallVariant: StoreWallVariant
): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const gm = bar.gridModule;
  const lenM = bar.lengthBays * gm, depM = bar.depthBays * gm;
  const nFront = scale(bar.axisV, -1), nRear = bar.axisV;
  const H = 1.1, T = 0.14;
  const frontCorner = (u: number) => add(bar.origin, scale(bar.axisU, u));
  const rearCorner = (u: number) => add(add(bar.origin, scale(bar.axisU, u)), scale(bar.axisV, depM));
  const panel = (corner: Vec2, outward: Vec2, depth: number, z: number) => {
    const c = add(corner, scale(outward, depth / 2));
    const geom = new THREE.BoxGeometry(T, H, depth);
    planarBoxUV(geom, T, H, depth, WALL_TILE);
    const mesh = new THREE.Mesh(geom, storeWallMaterial(wallVariant));
    const uA = new THREE.Vector3(bar.axisU.x, 0, -bar.axisU.y).normalize();
    const oA = new THREE.Vector3(outward.x, 0, -outward.y).normalize();
    const M = new THREE.Matrix4().makeBasis(uA, new THREE.Vector3(0, 1, 0), oA);
    M.setPosition(toThree(c.x, c.y, z + H / 2));
    mesh.applyMatrix4(M); mesh.castShadow = true; mesh.receiveShadow = true; out.push(mesh);
  };
  for (let f = 0; f < floors; f++) {
    const zFloor = baseZ + f * fh;
    // バルコニー側(全階)の端部返し
    panel(frontCorner(0), nFront, balconyDepth, zFloor);
    panel(frontCorner(lenM), nFront, balconyDepth, zFloor);
    // 外廊下側(上階のみ、1階は地面レベル)の端部返し
    if (f > 0) {
      panel(rearCorner(0), nRear, corridorW, zFloor);
      panel(rearCorner(lenM), nRear, corridorW, zFloor);
    }
  }
  return out;
}

/** 住棟マス: 実寸 planar-UV の PBR 壁でバーを立ち上げる(two-tone は1階を base に)。 */
function buildingMass(g: THREE.Group, bar: BarFrame, floors: number, fh: number, baseZ: number, p: AptRenderParams) {
  const lenM = bar.lengthBays * bar.gridModule;
  const depM = bar.depthBays * bar.gridModule;
  const totalH = floors * fh;
  const center = add(bar.origin, add(scale(bar.axisU, lenM / 2), scale(bar.axisV, depM / 2)));
  const twoTone = p.wallBase !== p.wallMain && floors > 1;
  const lowerH = twoTone ? fh : totalH;
  const upperH = twoTone ? totalH - fh : 0;
  const box = (h: number, yc: number, variant: StoreWallVariant) => {
    const geom = new THREE.BoxGeometry(lenM, h, depM);
    planarBoxUV(geom, lenM, h, depM, WALL_TILE);
    const mesh = new THREE.Mesh(geom, storeWallMaterial(variant));
    orientOBB(mesh, center.x, center.y, baseZ + yc, bar.axisU, bar.axisV);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  };
  box(lowerH, lowerH / 2, p.wallBase);
  if (twoTone) box(upperH, fh + upperH / 2, p.wallMain);
}

function panelBasis(yawDeg: number, pos: Vec2, z: number): THREE.Matrix4 {
  const up = new THREE.Vector3(0, 1, 0);
  const zAxis = dir3(Math.cos((yawDeg * Math.PI) / 180), Math.sin((yawDeg * Math.PI) / 180));
  const xAxis = new THREE.Vector3().crossVectors(up, zAxis).normalize();
  const m = new THREE.Matrix4().makeBasis(xAxis, up, zAxis);
  m.setPosition(toThree(pos.x, pos.y, z));
  return m;
}

/** 玄関ドア: 共有した house-gen ドアモジュールを配置(框戸/フラット等の詳細形状)。 */
function doorInstance(mod: ModuleMesh, panel: AptPanel): THREE.Object3D {
  const m = new THREE.Mesh(mod.geometry, mod.materials);
  m.applyMatrix4(panelBasis(panel.yawDeg, panel.pos, panel.z));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function panelMesh(
  panel: AptPanel,
  accent: number,
  seed: number,
  lighting: WindowLightingMode,
  interiorMapping: boolean,
): THREE.Object3D {
  const grp = new THREE.Group();
  const w = panel.w, h = panel.h;
  if (panel.type === 'mb') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), mbMaterial());
    m.position.z = PROUD / 2; grp.add(m);
  } else if (panel.type === 'entrance') {
    glazed(grp, w, h, accent, true);
  } else {
    const isResidentialWindow = panel.type === 'window' || panel.type === 'sashwindow' || panel.type === 'stairwin';
    const glassMaterial = isResidentialWindow
      ? windowAppearanceMaterial(resolveWindowAppearance(
        interiorMapping,
        lighting,
        seed,
        panel.size ?? (panel.type === 'stairwin' ? 'small' : 'medium'),
        panel.floor,
        Math.round(panel.pos.x * 100),
        Math.round(panel.pos.y * 100),
        panel.type === 'sashwindow' ? 1 : panel.type === 'stairwin' ? 2 : 0,
      ))
      : windowGlassMaterial();
    glazed(grp, w, h, accent, false, glassMaterial);
  }
  grp.applyMatrix4(panelBasis(panel.yawDeg, panel.pos, panel.z));
  grp.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  return grp;
}

function glazed(grp: THREE.Group, w: number, h: number, accent: number, entrance: boolean, material: THREE.Material = windowGlassMaterial()) {
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, h * 0.94, 0.05), material);
  glass.position.z = PROUD / 2 - 0.06; grp.add(glass);
  const fr = 0.07, mZ = PROUD / 2;
  const bar = (bw: number, bh: number, x: number, y: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.07), mullionMaterial());
    b.position.set(x, y, mZ); grp.add(b);
  };
  bar(w, fr, 0, h / 2 - fr / 2); bar(w, fr, 0, -h / 2 + fr / 2);
  bar(fr, h, -w / 2 + fr / 2, 0); bar(fr, h, w / 2 - fr / 2, 0);
  const bays = Math.max(1, Math.round(w / 1.0));
  for (let i = 1; i < bays; i++) bar(0.05, h - 2 * fr, -w / 2 + (w * i) / bays, 0);
  if (entrance) {
    const awn = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.14, 1.2), accentMaterial(accent));
    awn.position.set(0, h / 2 + 0.1, PROUD / 2 + 0.55); awn.castShadow = true; grp.add(awn);
  }
}

/** 前面バルコニー: 床スラブ + 手摺(4スタイル)。 */
function balconyMesh(b: Balcony, style: BalconyRailStyle, accent: number): THREE.Object3D {
  const grp = new THREE.Group();
  const width = len(sub(b.b, b.a));
  const mid = scale(add(b.a, b.b), 0.5);
  const outN = b.normal;
  const uDir = norm(sub(b.b, b.a));
  const cen = add(mid, scale(outN, b.depth / 2));
  const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, b.depth), parapetMaterial());
  orient(slab, cen.x, cen.y, b.z - 0.09, uDir);
  slab.castShadow = true; slab.receiveShadow = true; grp.add(slab);

  const edge = add(mid, scale(outN, b.depth));
  const cap = (h: number, mat: THREE.Material) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, 0.09), mat);
    orient(c, edge.x, edge.y, b.z + h, uDir); grp.add(c);
  };
  if (style === 'concrete') {
    const up = new THREE.Mesh(new THREE.BoxGeometry(width, 1.1, 0.14), parapetMaterial());
    orient(up, edge.x, edge.y, b.z + 0.55, uDir); up.castShadow = true; grp.add(up);
    cap(1.12, accentMaterial(accent));
  } else if (style === 'panel') {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, 1.0, 0.05), propMaterial(0xb9bec4));
    orient(panel, edge.x, edge.y, b.z + 0.5, uDir); panel.castShadow = true; grp.add(panel);
    cap(1.04, accentMaterial(accent));
  } else if (style === 'bars') {
    // 上下レール + 縦格子(アルミ手摺)
    const rail = (yy: number) => { const r = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, 0.05), accentMaterial(accent)); orient(r, edge.x, edge.y, b.z + yy, uDir); grp.add(r); };
    rail(0.1); rail(1.05);
    const n = Math.max(3, Math.round(width / 0.11));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = b.a.x + (b.b.x - b.a.x) * t + outN.x * b.depth;
      const py = b.a.y + (b.b.y - b.a.y) * t + outN.y * b.depth;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.95, 0.025), metalMaterial());
      orient(bar, px, py, b.z + 0.55, uDir); grp.add(bar);
    }
  } else {
    // glass
    const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 1.05, 0.04), railGlassMaterial());
    orient(rail, edge.x, edge.y, b.z + 0.525, uDir); grp.add(rail);
    cap(1.08, accentMaterial(accent));
  }

  // box/inset: 左右の袖壁(cheek)で戸ごとに閉じる → 立面リズムが「箱・壁・箱」に(§10.2)。
  // continuous は隣戸と連続するため袖壁なし。
  if (b.form !== 'continuous') {
    const up = new THREE.Vector3(0, 1, 0);
    const xA = new THREE.Vector3(uDir.x, 0, -uDir.y).normalize();
    const zA = new THREE.Vector3(outN.x, 0, -outN.y).normalize();
    const cheek = (P: Vec2) => {
      const c = add(P, scale(outN, b.depth / 2));
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.02, b.depth * 0.98), parapetMaterial());
      const M = new THREE.Matrix4().makeBasis(xA, up, zA);
      M.setPosition(toThree(c.x, c.y, b.z + 0.51));
      m.applyMatrix4(M); m.castShadow = true; m.receiveShadow = true; grp.add(m);
    };
    cheek(b.a); cheek(b.b);
  }
  return grp;
}

/** 縦帯(戸境)ツートン。住戸境界 u に全高の細い別色ストライプをバルコニー面へ立てる。 */
function verticalStripeMeshes(bar: BarFrame, units: { startBay: number; bays: number }[], floors: number, fh: number, baseZ: number, color: number): THREE.Object3D[] {
  const gm = bar.gridModule;
  const totalH = floors * fh;
  const outN = scale(bar.axisV, -1); // 前面(バルコニー側)外向き
  const up = new THREE.Vector3(0, 1, 0);
  const xA = new THREE.Vector3(bar.axisU.x, 0, -bar.axisU.y).normalize();
  const zA = new THREE.Vector3(outN.x, 0, -outN.y).normalize();
  const edges = new Set<number>();
  for (const u of units) { edges.add(u.startBay); edges.add(u.startBay + u.bays); }
  const out: THREE.Object3D[] = [];
  for (const e of edges) {
    const p = add(bar.origin, scale(bar.axisU, e * gm));
    const c = add(p, scale(outN, 0.05));
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.45, totalH, 0.1), propMaterial(color));
    const M = new THREE.Matrix4().makeBasis(xA, up, zA);
    M.setPosition(toThree(c.x, c.y, baseZ + totalH / 2));
    m.applyMatrix4(M); m.castShadow = true; m.receiveShadow = true; out.push(m);
  }
  return out;
}

/** バルコニー左右の隔て板(隣戸境界)。見付け方向=outward、壁沿いに薄い。 */
function partitionMesh(p: BalconyPartition): THREE.Object3D {
  const outward = p.outward;
  const tangent = { x: -outward.y, y: outward.x }; // 壁沿い
  const up = new THREE.Vector3(0, 1, 0);
  const xA = new THREE.Vector3(tangent.x, 0, -tangent.y).normalize();
  const zA = new THREE.Vector3(outward.x, 0, -outward.y).normalize();
  const geom = new THREE.BoxGeometry(0.03, p.height, p.depth * 0.92);
  const mesh = new THREE.Mesh(geom, propMaterial(0xd6d9dd));
  const cx = p.pos.x + outward.x * (p.depth * 0.46);
  const cy = p.pos.y + outward.y * (p.depth * 0.46);
  const m = new THREE.Matrix4().makeBasis(xA, up, zA);
  m.setPosition(toThree(cx, cy, p.z + p.height / 2));
  mesh.applyMatrix4(m); mesh.castShadow = true;
  return mesh;
}

/** 背面 共用廊下/外廊下: 床スラブ + 外側の立上り腰壁(実体・壁マテリアル=側面あり)
 *  + 金属手摺笠木。腰壁を建物と同じ外壁仕上げにし、玄関側に「壁」がある見えにする。 */
function corridorSlab(c: CorridorSlab, wallVariant: StoreWallVariant, openings: [number, number][]): THREE.Object3D {
  const grp = new THREE.Group();
  const width = len(sub(c.b, c.a));
  const mid = scale(add(c.a, c.b), 0.5);
  const cen = add(mid, scale(c.normal, c.depth / 2));
  const uDir = norm(sub(c.b, c.a));
  const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.2, c.depth), parapetMaterial());
  orient(slab, cen.x, cen.y, c.z - 0.1, uDir);
  slab.castShadow = true; slab.receiveShadow = true; grp.add(slab);
  // 立上り腰壁は上階のみ(1階は地面レベル)。外壁マテリアルで面一。階段接続位置は開口。
  if (c.floor > 0) {
    const spandrelH = 1.1, spandrelT = 0.16;
    for (const [s0, s1] of subtractRanges(width, openings)) {
      const w = s1 - s0;
      if (w < 0.2) continue;
      const innerC = add(c.a, scale(uDir, (s0 + s1) / 2));
      const edge = add(innerC, scale(c.normal, c.depth));
      const sg = new THREE.BoxGeometry(w, spandrelH, spandrelT);
      planarBoxUV(sg, w, spandrelH, spandrelT, WALL_TILE);
      const spandrel = new THREE.Mesh(sg, storeWallMaterial(wallVariant));
      orient(spandrel, edge.x, edge.y, c.z + spandrelH / 2, uDir);
      spandrel.castShadow = true; spandrel.receiveShadow = true; grp.add(spandrel);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, spandrelT + 0.06), metalMaterial());
      orient(cap, edge.x, edge.y, c.z + spandrelH + 0.03, uDir);
      grp.add(cap);
    }
  }
  return grp;
}

/** 屋外鉄骨階段(折り返し=コの字)。走りを棟長方向(a=along)に取り、奥行(b=outward)は
 *  2フライト側並び。**外廊下の外側(offsetV)に張り出し**、各階(a=-half 側)で廊下に接続、
 *  外端(a=+half)の踊場で180°折返し。ガード(手摺)は steel/white(開放手摺)/wall(外壁
 *  同色の実体パネル)を切替。 */
function exteriorStairMeshes(s: ExteriorStair, guard: StairGuardStyle, wallVariant: StoreWallVariant): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const runU = s.runU, spanV = s.spanV, fh = s.floorHeight, N = s.floors, oV = s.offsetV;
  const up = new THREE.Vector3(0, 1, 0);
  const xA = new THREE.Vector3(s.along.x, 0, -s.along.y).normalize();
  const zA = new THREE.Vector3(s.outward.x, 0, -s.outward.y).normalize();
  // b は offsetV ぶん外側へ(外廊下の外に出す)
  const wp = (a: number, b: number, y: number) =>
    toThree(s.base.x + s.along.x * a + s.outward.x * (oV + b), s.base.y + s.along.y * a + s.outward.y * (oV + b), s.z + y);

  const guardMat = guard === 'wall' ? storeWallMaterial(wallVariant) : guard === 'white' ? accentMaterial(0xf0f0f2) : metalMaterial();
  const solid = guard === 'wall';
  const half = runU / 2, Lf = 0.9, aFar = half - Lf, flightW = 0.9;
  const b1c = flightW / 2, b2c = spanV - flightW / 2;

  const deck = (aLo: number, aHi: number, bLo: number, bHi: number, y: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(aHi - aLo, 0.1, bHi - bLo), metalMaterial());
    const M = new THREE.Matrix4().makeBasis(xA, up, zA); M.setPosition(wp((aLo + aHi) / 2, (bLo + bHi) / 2, y - 0.05));
    m.applyMatrix4(M); m.castShadow = true; m.receiveShadow = true; out.push(m);
  };
  const post = (a: number, b: number, h: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), poleMaterial());
    const M = new THREE.Matrix4().makeBasis(xA, up, zA); M.setPosition(wp(a, b, h / 2));
    m.applyMatrix4(M); m.castShadow = true; out.push(m);
  };
  // 水平ガード(a方向)。solid=実体パネル / 開放=笠木+縦材。
  const guardH = (aLo: number, aHi: number, b: number, y: number) => {
    const M0 = () => new THREE.Matrix4().makeBasis(xA, up, zA);
    if (solid) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(aHi - aLo, 1.0, 0.04), guardMat);
      const M = M0(); M.setPosition(wp((aLo + aHi) / 2, b, y + 0.5)); m.applyMatrix4(M); m.castShadow = true; out.push(m);
    } else {
      const top = new THREE.Mesh(new THREE.BoxGeometry(aHi - aLo, 0.05, 0.05), guardMat);
      const M = M0(); M.setPosition(wp((aLo + aHi) / 2, b, y + 1.0)); top.applyMatrix4(M); out.push(top);
      const n = Math.max(2, Math.round((aHi - aLo) / 0.35));
      for (let i = 0; i <= n; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.0, 0.035), guardMat); const Mp = M0(); Mp.setPosition(wp(aLo + ((aHi - aLo) * i) / n, b, y + 0.5)); p.applyMatrix4(Mp); out.push(p); }
    }
  };
  // 垂直ガード(b方向、踊場端など)
  const guardB = (a: number, bLo: number, bHi: number, y: number) => {
    const M0 = () => new THREE.Matrix4().makeBasis(xA, up, zA);
    if (solid) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, bHi - bLo), guardMat);
      const M = M0(); M.setPosition(wp(a, (bLo + bHi) / 2, y + 0.5)); m.applyMatrix4(M); m.castShadow = true; out.push(m);
    } else {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, bHi - bLo), guardMat);
      const M = M0(); M.setPosition(wp(a, (bLo + bHi) / 2, y + 1.0)); top.applyMatrix4(M); out.push(top);
      const n = Math.max(2, Math.round((bHi - bLo) / 0.35));
      for (let i = 0; i <= n; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.0, 0.035), guardMat); const Mp = M0(); Mp.setPosition(wp(a, bLo + ((bHi - bLo) * i) / n, y + 0.5)); p.applyMatrix4(Mp); out.push(p); }
    }
  };
  // 傾斜ガード(フライト外縁)。solid は縦パネルを段状に並べて斜面へ追従させる。
  const guardFlight = (aLo: number, aHi: number, b: number, yLo: number, yHi: number) => {
    const da = aHi - aLo, dy = yHi - yLo;
    if (solid) {
      // 段々にせず、勾配に沿った1枚の平行四辺形パラペット(縦端は鉛直・上下端は勾配)で滑らかに。
      const H = 1.0, T = 0.05;
      const shape = new THREE.Shape();
      shape.moveTo(aLo, yLo); shape.lineTo(aHi, yHi); shape.lineTo(aHi, yHi + H); shape.lineTo(aLo, yLo + H);
      const geom = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
      const M = new THREE.Matrix4().makeBasis(xA, up, zA); M.setPosition(wp(0, b - T / 2, 0));
      const m = new THREE.Mesh(geom, guardMat);
      m.applyMatrix4(M); m.castShadow = true; m.receiveShadow = true; out.push(m);
    } else {
      const L = Math.hypot(da, dy) || 1;
      const xL = xA.clone().multiplyScalar(da / L).add(new THREE.Vector3(0, dy / L, 0)).normalize();
      const yL = new THREE.Vector3().crossVectors(zA, xL).normalize();
      const top = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.05), guardMat);
      const M = new THREE.Matrix4().makeBasis(xL, yL, zA); M.setPosition(wp((aLo + aHi) / 2, b, (yLo + yHi) / 2 + 1.0)); top.applyMatrix4(M); out.push(top);
      for (const t of [0.15, 0.4, 0.65, 0.9]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.0, 0.035), guardMat); const Mp = new THREE.Matrix4().makeBasis(xA, up, zA); Mp.setPosition(wp(aLo + da * t, b, yLo + dy * t + 0.5)); p.applyMatrix4(Mp); out.push(p); }
    }
  };
  const flight = (aLo: number, aHi: number, bC: number, yLo: number, yHi: number) => {
    const da = aHi - aLo, dy = yHi - yLo, L = Math.hypot(da, dy) || 1;
    const xL = xA.clone().multiplyScalar(da / L).add(new THREE.Vector3(0, dy / L, 0)).normalize();
    const yL = new THREE.Vector3().crossVectors(zA, xL).normalize();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(L, 0.07, flightW), metalMaterial());
    const M = new THREE.Matrix4().makeBasis(xL, yL, zA); M.setPosition(wp((aLo + aHi) / 2, bC, (yLo + yHi) / 2));
    slab.applyMatrix4(M); slab.castShadow = true; out.push(slab);
    const steps = Math.min(9, Math.max(4, Math.round(Math.abs(dy) / 0.18)));
    for (let k = 0; k < steps; k++) {
      const t = (k + 0.5) / steps;
      const tr = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, flightW * 0.94), curbMaterial());
      const Mt = new THREE.Matrix4().makeBasis(xA, up, zA); Mt.setPosition(wp(aLo + da * t, bC, yLo + dy * t + 0.05));
      tr.applyMatrix4(Mt); tr.castShadow = true; out.push(tr);
    }
  };

  // 各階の到着踊場(廊下接続)+ その手すり(外側b縁 + 外側u端。内側は廊下へ開ける)
  for (let f = 0; f < N; f++) {
    deck(-half, -half + 0.5, 0, spanV, f * fh);
    guardH(-half, -half + 0.5, spanV - 0.02, f * fh);
    guardB(-half + 0.02, 0.45, spanV, f * fh);
  }
  for (let f = 0; f < N - 1; f++) {
    const yLo = f * fh, yMid = f * fh + fh / 2, yHi = (f + 1) * fh;
    deck(aFar, half, 0, spanV, yMid); // 踊場(外端、180°折返し)
    flight(-half + 0.4, aFar, b1c, yLo, yMid); // フライト1: 廊下 → 踊場(手前 b)
    flight(aFar, -half + 0.4, b2c, yMid, yHi); // フライト2: 踊場 → 上階(外側 b)
    guardFlight(-half + 0.4, aFar, flightW, yLo, yMid); // フライト1 well 側ガード
    guardFlight(aFar, -half + 0.4, spanV - 0.02, yMid, yHi); // フライト2 外側ガード
    guardH(aFar, half, spanV - 0.02, yMid); // 踊場 外縁ガード
    guardB(half - 0.02, 0, spanV, yMid); // 踊場 折返し端ガード
  }
  const topH = (N - 1) * fh + 1.05;
  for (const a of [-half + 0.05, half - 0.05]) for (const b of [0.06, spanV - 0.06]) post(a, b, topH);
  return out;
}

function penthouseMeshes(ph: Penthouse, p: AptRenderParams): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const geom = new THREE.BoxGeometry(ph.obb.halfU * 2, ph.height, ph.obb.halfV * 2);
  planarBoxUV(geom, ph.obb.halfU * 2, ph.height, ph.obb.halfV * 2, WALL_TILE);
  const box = new THREE.Mesh(geom, storeWallMaterial(p.wallMain));
  orientOBB(box, ph.obb.center.x, ph.obb.center.y, ph.z + ph.height / 2, ph.obb.axisU, ph.obb.axisV);
  box.castShadow = true; box.receiveShadow = true; out.push(box);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(ph.obb.halfU * 2 + 0.2, 0.2, ph.obb.halfV * 2 + 0.2), parapetMaterial());
  orientOBB(cap, ph.obb.center.x, ph.obb.center.y, ph.z + ph.height + 0.1, ph.obb.axisU, ph.obb.axisV);
  cap.castShadow = true; out.push(cap);
  return out;
}

/** 軒付き屋根。ridge/eaves は棟長方向(U)に沿い、前(バルコニー)eaveF・後(外廊下)eaveR・
 *  側 eaveS ぶん張り出して、どの屋根形式でもベランダ/玄関前を覆う。 */
function aptRoofMeshes(bar: BarFrame, roofs: AptRoofMass[], eaveF: number, eaveR: number, eaveS: number): THREE.Object3D[] {
  if (!roofs.length) return [];
  const { style, eaveZ } = roofs[0];
  const gm = bar.gridModule;
  const lenM = bar.lengthBays * gm, depM = bar.depthBays * gm;
  const axisU = bar.axisU, axisV = bar.axisV;
  const barCenter = add(bar.origin, add(scale(axisU, lenM / 2), scale(axisV, depM / 2)));
  const halfU = lenM / 2 + eaveS;
  const halfV = depM / 2 + (eaveF + eaveR) / 2;
  const center = add(barCenter, scale(axisV, (eaveR - eaveF) / 2)); // 前後の軒差ぶん中心をずらす
  const out: THREE.Object3D[] = [];

  if (style === 'flat' || style === 'mono') {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(halfU * 2, 0.26, halfV * 2), roofMaterial(false));
    orientOBB(slab, center.x, center.y, eaveZ + 0.13, axisU, axisV);
    slab.castShadow = true; slab.receiveShadow = true; out.push(slab);
    const fh = 0.28;
    const fasciaV = (offV: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(halfU * 2 + 0.1, fh, 0.12), parapetMaterial());
      orientOBB(m, center.x + axisV.x * offV, center.y + axisV.y * offV, eaveZ + fh / 2, axisU, axisV);
      m.castShadow = true; out.push(m);
    };
    const fasciaU = (offU: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, fh, halfV * 2 + 0.1), parapetMaterial());
      orientOBB(m, center.x + axisU.x * offU, center.y + axisU.y * offU, eaveZ + fh / 2, axisU, axisV);
      m.castShadow = true; out.push(m);
    };
    fasciaV(halfV); fasciaV(-halfV); fasciaU(halfU); fasciaU(-halfU);
    return out;
  }
  // gable / hip: 切妻プリズム(棟=U方向、軒=v=±halfV)
  const rise = Math.max(halfV * 0.42, 1.2);
  out.push(gablePrism(center, axisU, axisV, halfU, halfV, eaveZ, eaveZ + rise));
  return out;
}

function gablePrism(c: Vec2, U: Vec2, V: Vec2, hu: number, hv: number, eaveZ: number, ridgeZ: number): THREE.Mesh {
  const gp = (a: number, b: number, z: number) => toThree(c.x + U.x * a + V.x * b, c.y + U.y * a + V.y * b, z);
  const pos: number[] = [];
  const T = (p: THREE.Vector3, q: THREE.Vector3, s: THREE.Vector3) => pos.push(p.x, p.y, p.z, q.x, q.y, q.z, s.x, s.y, s.z);
  const Q = (p: THREE.Vector3, q: THREE.Vector3, s: THREE.Vector3, u: THREE.Vector3) => { T(p, q, s); T(p, s, u); };
  const r0 = gp(hu, 0, ridgeZ), r1 = gp(-hu, 0, ridgeZ);
  Q(gp(hu, hv, eaveZ), gp(-hu, hv, eaveZ), r1, r0);
  Q(gp(hu, -hv, eaveZ), r0, r1, gp(-hu, -hv, eaveZ));
  T(gp(hu, -hv, eaveZ), gp(hu, hv, eaveZ), gp(hu, 0, ridgeZ));
  T(gp(-hu, hv, eaveZ), gp(-hu, -hv, eaveZ), gp(-hu, 0, ridgeZ));
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, roofMaterial(true));
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function orientOBB(mesh: THREE.Object3D, cx: number, cy: number, z: number, axisU: Vec2, axisV: Vec2) {
  const up = new THREE.Vector3(0, 1, 0);
  const xA = new THREE.Vector3(axisU.x, 0, -axisU.y).normalize();
  const zA = new THREE.Vector3(axisV.x, 0, -axisV.y).normalize();
  const m = new THREE.Matrix4().makeBasis(xA, up, zA);
  m.setPosition(toThree(cx, cy, z));
  mesh.applyMatrix4(m);
}

function orient(mesh: THREE.Object3D, cx: number, cy: number, z: number, uDir: Vec2) {
  const up = new THREE.Vector3(0, 1, 0);
  const xA = new THREE.Vector3(uDir.x, 0, -uDir.y).normalize();
  const zA = new THREE.Vector3().crossVectors(xA, up).normalize();
  const m = new THREE.Matrix4().makeBasis(xA, up, zA);
  m.setPosition(toThree(cx, cy, z));
  mesh.applyMatrix4(m);
}

// --- Vec2 ヘルパ(描画層ローカル)---
function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
function scale(a: Vec2, s: number): Vec2 { return { x: a.x * s, y: a.y * s }; }
function len(a: Vec2): number { return Math.hypot(a.x, a.y); }
function dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y; }
function norm(a: Vec2): Vec2 { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; }

/** [0,len] から openings(区間の配列)を除いた被覆区間を返す。 */
function subtractRanges(len: number, openings: [number, number][]): [number, number][] {
  const cl = openings
    .map(([a, b]) => [Math.max(0, Math.min(len, a)), Math.max(0, Math.min(len, b))] as [number, number])
    .filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  let cur = 0;
  for (const [a, b] of cl) { if (a > cur) out.push([cur, a]); cur = Math.max(cur, b); }
  if (cur < len) out.push([cur, len]);
  return out;
}

export function disposeGroup(group: THREE.Group) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}
