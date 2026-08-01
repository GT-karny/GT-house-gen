import * as THREE from 'three';
import GUI from 'lil-gui';
import { createViewer } from './viewer/scene';
import { renderHouse, disposeGroup, type RenderParams, type RoofType, type WallStyle, type FenceStyle } from './viewer/render';
import type { WallVariant, DoorLeafVariant, FenceMeshTex, BlockVariant, WoodFenceTex } from './viewer/materials';
import type { DoorStyle } from './viewer/modules';
import { rand01 } from './gen/rng';
import { DEFAULT_CONFIG, JP_TRACT_PRESET, JP_CUBE_PRESET, type GenConfig } from './gen/config';
import { generateHouse, type GenerateOptions } from './gen/building';
import { makeSampleLot, type LotShape } from './gen/lot';
import { planStreetscape, DEFAULT_STREET, type StreetscapeConfig } from './env/streetscape';
import { streetscapeGroup, disposeStreetscape } from './viewer/env';
import { planRailway, DEFAULT_RAILWAY, type RailwayConfig } from './env/railway';
import { railwayGroup, disposeRailway } from './viewer/railway';

type StyleName = 'generic' | 'jp-tract' | 'jp-cube';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const viewer = createViewer(canvas);

const cfg: GenConfig = structuredClone(DEFAULT_CONFIG);
const view = {
  style: 'jp-tract' as StyleName,
  showFootprint: true,
  showSite: true,
  roofType: 'auto' as 'auto' | RoofType,
  ridgeAxis: 'U' as 'U' | 'V',
  wallStyle: 'auto' as 'auto' | WallStyle,
  fenceStyle: 'auto' as 'auto' | FenceStyle,
  doorStyle: 'auto' as 'auto' | DoorStyle,
  doorLeaf: 'auto' as 'auto' | DoorLeafVariant,
  roofPitch: 0.45,
  eaveOverhang: 0.7,
  doorCanopy: true,
  rowCount: 6,       // 通りに並べる棟数 (1 = 単体)
  rowGap: 0.0,       // 隣家との隙間 (m) — 0 で敷地が連続
  rowVaryLot: true,  // 各敷地の間口/奥行をシードで少し振る
  showStreet: true,  // 前面道路・歩道・電柱 (家とは分離した公共空間)
  showRailway: true, // 日本の在来線 + 第1種踏切
  lotShape: 'rectangle' as LotShape, // 敷地形状 (矩形/台形/丸角/隅切り)
};

// Streetscape (public realm) config — SEPARATE from GenConfig so it never mixes
// into the house data model / core. Lives in src/env.
const street: StreetscapeConfig = { ...DEFAULT_STREET };
const railway: RailwayConfig = { ...DEFAULT_RAILWAY };

// randomisation palettes (picked per seed when the control is on 'auto')
const ROOF_COLORS = [0x3b3d42, 0x4a4d53, 0x2f3136, 0x5a4b3a, 0x6b6560, 0x7a3f36]; // 黒/濃灰/灰/茶/瓦/レンガ
const FENCE_COLORS = [0xcac3b4, 0xb8b0a0, 0xdcd7ca, 0x9a938a, 0xe6e0d3, 0x8f8a80]; // ブロック塀の色幅

// texture palettes per look (picked per seed among the CC0 variants)
const PLASTER_TEX: WallVariant[] = ['plaster', 'plaster2'];
const SIDING_TEX: WallVariant[] = ['siding', 'siding2', 'siding3'];
const BASE_TEX: WallVariant[] = ['stone', 'stone2', 'brick', 'brick2', 'concrete']; // 腰壁/2トーン下部
const DOOR_LEAVES: DoorLeafVariant[] = ['wood_a', 'wood_b', 'wood_c'];
const DOOR_STYLES: DoorStyle[] = ['panel', 'glass', 'flush'];
const MESH_TEX: FenceMeshTex[] = ['fence', 'fence2', 'fence3'];
const BLOCK_TEX: BlockVariant[] = ['concrete', 'concrete2', 'brick', 'brick2', 'stone', 'stone2'];
const WOOD_TEX: WoodFenceTex[] = ['siding', 'siding3'];

/** Resolve 'auto' wall style from the seed so each house varies (plaster / siding / two-tone). */
function resolveWallStyle(seed: number): WallStyle {
  if (view.wallStyle !== 'auto') return view.wallStyle;
  const r = rand01(seed, 321);
  return r < 0.5 ? 'plaster' : r < 0.75 ? 'siding' : 'twotone';
}

/** Concrete wall texture variants (main + ground-floor base) from the seed. */
function resolveWall(seed: number): { main: WallVariant; base: WallVariant } {
  const style = resolveWallStyle(seed);
  if (style === 'siding') { const m = pick(SIDING_TEX, 331, seed); return { main: m, base: m }; }
  if (style === 'twotone') return { main: pick(PLASTER_TEX, 332, seed), base: pick(BASE_TEX, 333, seed) };
  const m = pick(PLASTER_TEX, 334, seed);
  return { main: m, base: m };
}

/** Resolve 玄関ドア form + leaf material + 袖ガラス from the seed. */
function resolveDoor(seed: number): { style: DoorStyle; leaf: DoorLeafVariant; sidelight: boolean } {
  const style: DoorStyle = view.doorStyle === 'auto' ? pick(DOOR_STYLES, 351, seed) : view.doorStyle;
  let leaf: DoorLeafVariant;
  if (view.doorLeaf !== 'auto') leaf = view.doorLeaf;
  else if (style === 'panel') leaf = pick(DOOR_LEAVES, 352, seed);
  else leaf = rand01(seed, 353) < 0.4 ? 'painted' : pick(DOOR_LEAVES, 354, seed);
  const sidelight = style !== 'panel' && rand01(seed, 355) < 0.5;
  return { style, leaf, sidelight };
}

/** Resolve 'auto' roof form (type + ridge direction) from the seed. */
function resolveRoof(seed: number): { type: RoofType; ridge: 'U' | 'V' } {
  if (view.roofType !== 'auto') return { type: view.roofType, ridge: view.ridgeAxis };
  const r = rand01(seed, 511);
  const type: RoofType = r < 0.45 ? 'gable' : r < 0.8 ? 'hip' : 'mono';
  return { type, ridge: rand01(seed, 512) < 0.65 ? 'U' : 'V' };
}
const pick = <T,>(arr: T[], k: number, seed: number): T => arr[Math.floor(rand01(seed, k) * arr.length)];

const FENCE_STYLES: FenceStyle[] = ['block', 'block', 'wood', 'mesh', 'hedge']; // block寄りの重み
/** Resolve 'auto' fence style from the seed. */
function resolveFenceStyle(seed: number): FenceStyle {
  return view.fenceStyle === 'auto' ? pick(FENCE_STYLES, 413, seed) : view.fenceStyle;
}

let current: THREE.Group | null = null;
let currentStreet: THREE.Group | null = null;
let currentRailway: THREE.Group | null = null;
let currentRailPlan: ReturnType<typeof planRailway> | null = null;

interface BuiltHouse {
  group: THREE.Group;
  width: number; // this house's lot width along the street (X)
  depth: number; // this house's lot depth (Y) — used to place the front street
  plan: ReturnType<typeof generateHouse>['plan'];
  site: ReturnType<typeof generateHouse>['site'];
}

/** Generate + render ONE house, fully resolved from its own seed. Group is
 *  centred on its lot origin; the caller offsets it along the street (X). */
function buildHouseGroup(seed: number): BuiltHouse {
  // per-house config: same tunables, own seed, optionally jittered lot size
  const hcfg: GenConfig = { ...cfg, seed };
  if (view.rowVaryLot && view.rowCount > 1) {
    hcfg.lotWidth = cfg.lotWidth + Math.round((rand01(seed, 901) - 0.5) * 4);   // ±2m
    hcfg.lotDepth = cfg.lotDepth + Math.round((rand01(seed, 902) - 0.5) * 4);   // ±2m
  }

  const roof = resolveRoof(seed);
  const opts: GenerateOptions = { roofStyle: roof.type, roofPitch: view.roofPitch };
  const lot = makeSampleLot(hcfg.lotWidth, hcfg.lotDepth, view.lotShape, seed);
  const { plan, roofs, site } = generateHouse(lot, hcfg, opts);

  const wall = resolveWall(seed);
  const door = resolveDoor(seed);
  const rp: RenderParams = {
    panelW: hcfg.panelW,
    panelH: hcfg.panelH,
    showFootprint: view.showFootprint,
    showMasses: false,
    doorCanopy: view.doorCanopy,
    eaveOverhang: view.eaveOverhang,
    roofType: roof.type,
    ridgeAxis: roof.ridge,
    wallMain: wall.main,
    wallBase: wall.base,
    doorStyle: door.style,
    doorLeaf: door.leaf,
    doorSidelight: door.sidelight,
    roofColor: pick(ROOF_COLORS, 411, seed),
    fenceColor: pick(FENCE_COLORS, 412, seed),
    fenceStyle: resolveFenceStyle(seed),
    fenceMeshTex: pick(MESH_TEX, 414, seed),
    blockVariant: pick(BLOCK_TEX, 415, seed),
    woodTex: pick(WOOD_TEX, 416, seed),
    showSite: view.showSite,
  };
  const group = renderHouse(plan, roofs, rp, site);
  return { group, width: hcfg.lotWidth, depth: hcfg.lotDepth, plan, site };
}

let pendingFrame = true; // reframe only when the row STRUCTURE changes (not on seed shuffles)

function regenerate() {
  const n = Math.max(1, Math.round(view.rowCount));
  const root = new THREE.Group();

  // lay houses left→right along the street (+X). Each lot is contiguous with the
  // next (share the boundary fence), so we walk a cursor by each lot's own width.
  const built: BuiltHouse[] = [];
  let totalW = 0;
  for (let i = 0; i < n; i++) {
    const seed = n > 1 ? (cfg.seed + i * 1013) % 100000 : cfg.seed;
    const h = buildHouseGroup(seed);
    built.push(h);
    totalW += h.width + (i < n - 1 ? view.rowGap : 0);
  }
  // centre the whole row on the origin
  let cursor = -totalW / 2;
  for (const h of built) {
    h.group.position.x = cursor + h.width / 2;
    root.add(h.group);
    cursor += h.width + view.rowGap;
  }

  if (current) {
    viewer.content.remove(current);
    disposeGroup(current);
  }
  viewer.content.add(root);
  current = root;

  // --- streetscape (前面道路) — built from the ROW EXTENT, added to the separate
  // `env` group so it never mixes with the house geometry (nor the house core). ---
  rebuildStreet(totalW, built);

  // frame the street only when the row structure changed or the user asked for
  // it — never on a plain seed shuffle, so orbiting is preserved while browsing.
  if (pendingFrame) {
    frameStreet(totalW, built[0].site.pad.frontV);
    pendingFrame = false;
  }

  // HUD summarises the centre house + the row as a whole
  const c = built[Math.floor(built.length / 2)];
  const win = c.plan.panels.filter((p) => p.type === 'window');
  const wc = (s: string) => win.filter((p) => p.size === s).length;
  const doors = c.plan.panels.filter((p) => p.type === 'door').length;
  const walls = c.plan.panels.filter((p) => p.type === 'wall').length;
  const massFloors = c.plan.masses.map((mm) => mm.floors).join('/');
  const rowLine = n > 1 ? `通り: ${n}棟   総間口: ${totalW.toFixed(1)}m\n` : '';
  hud.textContent =
    rowLine +
    `style: ${view.style}   archetype: ${c.plan.archetype}   masses(F): ${massFloors}   balconies: ${c.plan.balconies.length}\n` +
    `lot: ${c.width}×${cfg.lotDepth}m   駐車: ${c.site.arrangement}/${c.site.cars}台\n` +
    `wall:${walls}  door:${doors}  window:${win.length} (L:${wc('large')} M:${wc('medium')} S:${wc('small')})`;
}

/** (Re)build the front streetscape for the current row and swap it into the
 *  viewer's SEPARATE `env` group. Row is centred on the origin, so it spans
 *  [−totalW/2, +totalW/2] along X; the street fronts the deepest lot. */
function rebuildStreet(totalW: number, built: BuiltHouse[]) {
  if (currentStreet) {
    viewer.env.remove(currentStreet);
    disposeStreetscape(currentStreet);
    currentStreet = null;
  }
  if (currentRailway) {
    viewer.env.remove(currentRailway);
    disposeRailway(currentRailway);
    currentRailway = null;
    currentRailPlan = null;
  }
  if (!view.showStreet || built.length === 0) return;

  const maxDepth = Math.max(...built.map((h) => h.depth));
  const bounds = { xMin: -totalW / 2, xMax: totalW / 2, frontY: -maxDepth / 2 };
  const plan = planStreetscape(
    bounds,
    { ...street, seed: cfg.seed },
  );
  let railPlan: ReturnType<typeof planRailway> | null = null;
  if (view.showRailway) {
    const roadNearY = bounds.frontY - street.walkWidth;
    const roadFarY = roadNearY - street.roadWidth;
    const plannedRail = planRailway({
      ...bounds,
      rearY: maxDepth / 2,
      roadNearY,
      roadFarY,
      farEdgeY: roadFarY - street.farWidth,
    }, { ...railway, seed: cfg.seed });
    railPlan = plannedRail;
    // Do not place a utility pole inside the railway/crossing equipment envelope.
    plan.props = plan.props.filter((p) => Math.abs(p.center.x - plannedRail.centerX) > railway.ballastWidth / 2 + 1.2);
  }
  const g = streetscapeGroup(plan);
  viewer.env.add(g);
  currentStreet = g;
  if (railPlan) {
    const rg = railwayGroup(railPlan);
    viewer.env.add(rg);
    currentRailway = rg;
    currentRailPlan = railPlan;
  }
}

/** Tight inspection view centred on the crossing safety equipment. */
function frameCrossing() {
  if (!currentRailPlan) return;
  const [near, far] = currentRailPlan.devices;
  const targetX = (near.center.x + far.center.x) / 2;
  const targetY = (near.center.y + far.center.y) / 2;
  const mastHeight = Math.max(near.mastHeight, far.mastHeight);
  viewer.controls.target.set(targetX, mastHeight * 0.50, -targetY);
  viewer.camera.position.set(targetX + 8.3, mastHeight + 2.5, -targetY + 9.4);
  viewer.camera.updateProjectionMatrix();
  viewer.controls.update();
}

/** Close inspection of one independent electric gate machine and its drive. */
function frameGateMachine() {
  if (!currentRailPlan) return;
  const device = currentRailPlan.devices[0];
  const side = device.gateCenter.x < currentRailPlan.centerX ? -1 : 1;
  const x = device.gateCenter.x;
  const z = -device.gateCenter.y;
  viewer.controls.target.set(x, 0.82, z);
  viewer.camera.position.set(x + side * 3.0, 2.55, z + 3.6);
  viewer.camera.updateProjectionMatrix();
  viewer.controls.update();
}

/** Pull the camera back to fit a street of the given width (along X), viewed
 *  from the road side (−Y in gen space → +Z in three). */
function frameStreet(spanX: number, depth: number) {
  let xMin = -spanX / 2;
  let xMax = spanX / 2;
  if (view.showStreet && view.showRailway) {
    const crossingX = railway.crossingSide === 'right'
      ? xMax + railway.crossingOffset
      : xMin - railway.crossingOffset;
    xMin = Math.min(xMin, crossingX - railway.ballastWidth / 2 - 2);
    xMax = Math.max(xMax, crossingX + railway.ballastWidth / 2 + 2);
  }
  const targetX = (xMin + xMax) / 2;
  const half = Math.max(xMax - xMin, depth) / 2;
  const dist = half / Math.tan((viewer.camera.fov * Math.PI) / 360) * 1.35 + 8;
  viewer.controls.target.set(targetX, 3, 0);
  viewer.camera.position.set(targetX + dist * 0.35, dist * 0.6, dist * 0.95);
  viewer.camera.updateProjectionMatrix();
}

/** Apply a whole-house style preset (config + view), refresh the GUI, redraw. */
function applyStyle(style: StyleName) {
  view.style = style;
  if (style === 'jp-tract') {
    Object.assign(cfg, structuredClone(JP_TRACT_PRESET));
    view.roofType = 'auto'; // 切妻/寄棟/片流れをシードで
    view.roofPitch = 0.45;
    view.eaveOverhang = 0.7;
    view.doorCanopy = true;
  } else if (style === 'jp-cube') {
    Object.assign(cfg, structuredClone(JP_CUBE_PRESET));
    view.roofType = 'flat';
    view.roofPitch = 0.0;
    view.eaveOverhang = 0.15;
    view.doorCanopy = false;
  } else {
    Object.assign(cfg, structuredClone(DEFAULT_CONFIG));
    view.roofType = 'auto';
    view.roofPitch = 0.6;
    view.eaveOverhang = 0.4;
    view.doorCanopy = false;
  }
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  regenerate();
}

// ---- GUI ----
const gui = new GUI({ title: 'House-Gen' });
gui.add(view, 'style', ['generic', 'jp-tract', 'jp-cube']).name('★ style preset').onChange(applyStyle);
gui.add(cfg, 'seed', 0, 9999, 1).onChange(regenerate);
gui.add({ shuffle: () => { cfg.seed = (cfg.seed + 1) % 10000; gui.controllersRecursive().forEach((c) => c.updateDisplay()); regenerate(); } }, 'shuffle').name('▶ next seed');

const reframe = () => { pendingFrame = true; regenerate(); };
const fRow = gui.addFolder('Street (通り)');
fRow.add(view, 'rowCount', 1, 20, 1).name('棟数 (1=単体)').onChange(reframe);
fRow.add(view, 'rowGap', 0, 4, 0.1).name('隣家との隙間 m').onChange(reframe);
fRow.add(view, 'rowVaryLot').name('敷地サイズを振る').onChange(reframe);
fRow.add({ fit: reframe }, 'fit').name('🎥 通りにカメラを合わせる');

// 前面道路 (public realm) — separate from the house/site so it's clear in the UI
// too that this is scenery, not part of the generated building.
const fStreet = gui.addFolder('Street env (前面道路)');
fStreet.add(view, 'showStreet').name('道路/歩道/電柱 表示').onChange(regenerate);
fStreet.add(street, 'roadWidth', 3, 9, 0.5).name('車道幅 m').onChange(regenerate);
fStreet.add(street, 'walkWidth', 0, 4, 0.2).name('歩道/路肩幅 m').onChange(regenerate);
fStreet.add(street, 'centerLine').name('センターライン').onChange(regenerate);
fStreet.add(street, 'poleSpacing', 0, 30, 1).name('電柱間隔 m (0=なし)').onChange(regenerate);

const fRail = gui.addFolder('Railway (日本の踏切)');
fRail.add(view, 'showRailway').name('線路/踏切 表示').onChange(reframe);
fRail.add(railway, 'crossingSide', ['left', 'right']).name('住宅列の左右').onChange(reframe);
fRail.add(railway, 'crossingOffset', 4, 20, 0.5).name('住宅列からの距離 m').onChange(reframe);
fRail.add(railway, 'gauge', { '狭軌 1,067 mm': 1.067, '標準軌 1,435 mm': 1.435 }).name('軌間').onChange(regenerate);
fRail.add(railway, 'barrierClosed').name('遮断かんを閉じる').onChange(regenerate);
fRail.add(railway, 'warningActive').name('警報灯・方向表示を作動').onChange(regenerate);
fRail.add(railway, 'electrified').name('電化柱・架線').onChange(regenerate);
fRail.add(railway, 'sleeperType', { 'PCまくらぎ': 'pc', '木まくらぎ': 'wood' }).name('まくらぎ').onChange(regenerate);
fRail.add(railway, 'safetyEquipment', { '高設備踏切': 'full', '基本設備のみ': 'basic' }).name('保安装置').onChange(regenerate);
fRail.add({ focus: frameCrossing }, 'focus').name('🎥 踏切設備に接近');
fRail.add({ focus: frameGateMachine }, 'focus').name('🎥 遮断機を接写');

const fLot = gui.addFolder('Lot (敷地)');
fLot.add(view, 'lotShape', ['rectangle', 'irregular-quad', 'rounded-corner', 'chamfered'])
  .name('敷地形状 (矩形/台形/丸角/隅切り)').onChange(regenerate);
fLot.add(cfg, 'lotWidth', 6, 22, 0.5).name('間口 width').onChange(regenerate);
fLot.add(cfg, 'lotDepth', 8, 26, 0.5).name('奥行 depth').onChange(regenerate);
fLot.add(cfg, 'fillRatio', 0.4, 1.0, 0.05).name('間口占有 (庭↔家)').onChange(regenerate);
fLot.add(cfg, 'coverageRatio', 0.3, 0.8, 0.05).name('建蔽率 (家÷敷地)').onChange(regenerate);
fLot.add(cfg, 'parkingTarget', ['auto', 0, 1, 2]).name('駐車台数').onChange((v: string | number) => {
  cfg.parkingTarget = v === 'auto' ? 'auto' : (Number(v) as 0 | 1 | 2);
  regenerate();
});
fLot.add(cfg, 'sideSetback', 0, 2, 0.1).name('側方後退').onChange(regenerate);
fLot.add(cfg, 'rearSetback', 0, 3, 0.1).name('背面後退').onChange(regenerate);
fLot.add(cfg, 'minBuildingWidth', 2.5, 6, 0.1).name('最小間口').onChange(regenerate);
fLot.add(cfg, 'minBuildingDepth', 3, 8, 0.1).name('最小奥行').onChange(regenerate);
fLot.add(cfg, 'minBuildingArea', 15, 60, 1).name('最小建築面積㎡').onChange(regenerate);
fLot.add(view, 'showSite').name('敷地/駐車/塀 表示').onChange(regenerate);

const fFoot = gui.addFolder('Footprint');
fFoot.add(cfg, 'coreWidthBays', 3, 12, 1).onChange(regenerate);
fFoot.add(cfg, 'coreDepthBays', 3, 10, 1).onChange(regenerate);
fFoot.add(cfg, 'wingSizeRatio', 0.2, 0.9, 0.05).onChange(regenerate);
fFoot.add(cfg, 'dimJitterBays', 0, 3, 1).onChange(regenerate);
fFoot.add(cfg, 'downWings').name('下屋 (stepped wing)').onChange(regenerate);
fFoot.add(cfg, 'notch').name('porch (rect only)').onChange(regenerate);
const w = cfg.archetypeWeights;
fFoot.add(w, 'rect', 0, 4, 0.5).name('w: rect').onChange(regenerate);
fFoot.add(w, 'lshape', 0, 4, 0.5).name('w: L').onChange(regenerate);
fFoot.add(w, 'tshape', 0, 4, 0.5).name('w: T').onChange(regenerate);
fFoot.add(w, 'ushape', 0, 4, 0.5).name('w: U').onChange(regenerate);
fFoot.add(w, 'garage', 0, 4, 0.5).name('w: garage').onChange(regenerate);

const fFac = gui.addFolder('Facade');
fFac.add(cfg, 'floors', 1, 4, 1).onChange(regenerate);
fFac.add(cfg, 'windowDensity', 0, 1, 0.05).onChange(regenerate);
fFac.add(cfg, 'windowJitter', 0, 1, 0.05).onChange(regenerate);
fFac.add(cfg, 'windowSizeMode', ['medium', 'byFloor', 'japan']).name('window sizes').onChange(regenerate);
fFac.add(cfg, 'streetOpenness', 0, 1, 0.05).name('街路側 openness').onChange(regenerate);
fFac.add(cfg, 'cornerMarginBays', 0, 3, 1).onChange(regenerate);
fFac.add(cfg, 'doorFacesRoadOnly').onChange(regenerate);
fFac.add(cfg, 'panelW', 0.9, 4, 0.01).name('panelW (1間=1.82)').onChange(regenerate);
fFac.add(cfg, 'panelH', 2.5, 4, 0.05).name('panelH (階高)').onChange(regenerate);

const fJp = gui.addFolder('JP detailing');
fJp.add(cfg, 'grilles').name('面格子 grille').onChange(regenerate);
fJp.add(cfg, 'shutterBoxes').name('シャッターBOX').onChange(regenerate);
fJp.add(cfg, 'bayWindows').name('出窓 bay window').onChange(regenerate);
fJp.add(cfg, 'balcony').name('2F バルコニー').onChange(regenerate);
fJp.add(cfg, 'balconyFace', ['auto', 'street', 'garden']).name('balcony 面(正面/左右)').onChange(regenerate);
fJp.add(cfg, 'recessedEntrance').name('玄関を奥まらせる').onChange(regenerate);
fJp.add(view, 'doorStyle', ['auto', 'panel', 'glass', 'flush']).name('玄関ドア形状').onChange(regenerate);
fJp.add(view, 'doorLeaf', ['auto', 'wood_a', 'wood_b', 'wood_c', 'painted']).name('ドア面材').onChange(regenerate);

const fView = gui.addFolder('View');
fView.add(view, 'roofType', ['auto', 'flat', 'gable', 'hip', 'mono']).name('屋根形状(auto=シード)').onChange(regenerate);
fView.add(view, 'ridgeAxis', ['U', 'V']).name('棟の向き(長手/短手)').onChange(regenerate);
fView.add(view, 'wallStyle', ['auto', 'plaster', 'siding', 'twotone']).name('外壁 (自動/塗壁/サイディング/2トーン)').onChange(regenerate);
fView.add(view, 'fenceStyle', ['auto', 'block', 'wood', 'mesh', 'hedge']).name('塀 (自動/ブロック/木塀/メッシュ/生垣)').onChange(regenerate);
fView.add(view, 'roofPitch', 0.2, 1.2, 0.05).onChange(regenerate);
fView.add(view, 'eaveOverhang', 0, 1.2, 0.05).name('軒の出 eaves').onChange(regenerate);
fView.add(view, 'doorCanopy').name('玄関庇 canopy').onChange(regenerate);
fView.add(view, 'showFootprint').onChange(regenerate);

// start in the 建売・郊外型 style
applyStyle('jp-tract');
