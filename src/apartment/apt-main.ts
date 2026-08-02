import GUI from 'lil-gui';
import { createViewer } from '../viewer/scene';
import { renderApartment, disposeGroup, type AptRenderParams, type BalconyRailStyle, type StairGuardStyle } from './viewer/render';
import {
  DEFAULT_APT_CONFIG, APT_PRESETS, resolveWallPattern, type AptConfig, type AptPresetName, type StructureType,
} from './gen/config';
import type { WallPattern } from './viewer/render';
import { generateApartment } from './gen/building';
import { makeSampleAptLot, type LotShape } from './gen/lot';
import { rand01 } from '../shared/rng';
import type { StoreWallVariant } from './viewer/materials';
import * as THREE from 'three';
import type { WindowLightingMode } from '../viewer/windowSurfaces';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const viewer = createViewer(canvas);

// 集合住宅は敷地・棟高が大きいので、太陽の影フラスタムを広げ、家用の街路グリッドを消す。
const sun = viewer.scene.children.find((o): o is THREE.DirectionalLight => (o as THREE.DirectionalLight).isDirectionalLight);
if (sun) {
  const s = 60;
  sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
  sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
  sun.shadow.camera.updateProjectionMatrix();
}
viewer.scene.children.filter((o) => o.type === 'GridHelper').forEach((o) => (o.visible = false));

// 外壁は seed で解決(house/store と同機構)。tile=磁器質タイル風の石壁PBR、concrete=打放し、
// siding=木造サイディング、twotone=基準階と1階でトーン差。
type AptWallStyle = 'auto' | 'tile' | 'concrete' | 'siding' | 'twotone';
const TILE_TEX: StoreWallVariant[] = ['stone', 'stone2'];
const SIDING_TEX: StoreWallVariant[] = ['siding', 'siding2', 'siding3'];
const pick = <T,>(arr: T[], k: number, seed: number): T => arr[Math.floor(rand01(seed, k) * arr.length)];

function resolveWall(structure: StructureType, seed: number, floors: number, style: AptWallStyle): { main: StoreWallVariant; base: StoreWallVariant } {
  let s = style;
  if (s === 'auto') {
    if (structure === 'wood') s = 'siding';
    else { const r = rand01(seed, 421); s = r < 0.5 ? 'tile' : r < 0.8 ? 'twotone' : 'concrete'; }
  }
  if (s === 'siding') { const m = pick(SIDING_TEX, 431, seed); return { main: m, base: m }; }
  if (s === 'concrete') return { main: 'concrete', base: 'concrete' };
  if (s === 'twotone') return { main: pick(TILE_TEX, 432, seed), base: floors > 1 ? 'concrete' : pick(TILE_TEX, 432, seed) };
  const m = pick(TILE_TEX, 433, seed); // tile
  return { main: m, base: m };
}

// バルコニー手摺スタイルを seed で解決(建物ごとに一貫)。auto は4種から抽選。
type BalconyRailChoice = 'auto' | BalconyRailStyle;
function resolveBalconyRail(seed: number, style: BalconyRailChoice): BalconyRailStyle {
  if (style !== 'auto') return style;
  const styles: BalconyRailStyle[] = ['glass', 'bars', 'panel', 'concrete'];
  return styles[Math.floor(rand01(seed, 0xba1) * styles.length)];
}

// 外階段ガードを seed で解決。auto は steel/white/wall から抽選。
type StairGuardChoice = 'auto' | StairGuardStyle;
function resolveStairGuard(seed: number, style: StairGuardChoice): StairGuardStyle {
  if (style !== 'auto') return style;
  const styles: StairGuardStyle[] = ['steel', 'white', 'wall'];
  return styles[Math.floor(rand01(seed, 0x57a2) * styles.length)];
}

// 縦帯(戸境)ストライプの色を seed で解決(§10.4: 木/濃色/灰/白/黒)。
const STRIPE_COLORS = [0x6b4f3a, 0x4a4f57, 0x8f9298, 0xece7dd, 0x33383f];
const resolveStripe = (seed: number): number => STRIPE_COLORS[Math.floor(rand01(seed, 0x571b) * STRIPE_COLORS.length)];

const cfg: AptConfig = { ...structuredClone(DEFAULT_APT_CONFIG), ...structuredClone(APT_PRESETS['midrise-gallery-rc']) };
const view = {
  preset: 'midrise-gallery-rc' as AptPresetName,
  showSite: true,
  lotShape: 'rectangle' as LotShape,
  wallStyle: 'auto' as AptWallStyle,
  balconyRail: 'auto' as BalconyRailChoice,
  stairGuard: 'auto' as StairGuardChoice,
  elevator: 'auto' as 'auto' | 'on' | 'off',
  exteriorStair: 'auto' as 'auto' | 'on' | 'off',
  windowLighting: 'mixed' as WindowLightingMode,
  windowInteriorMapping: true,
};

let current: THREE.Group | null = null;

function frameCamera() {
  const L = Math.max(cfg.lotWidth, cfg.lotDepth);
  const h = cfg.floors * cfg.panelH;
  viewer.camera.position.set(L * 0.5, h * 0.7 + L * 0.35, L * 0.85);
  viewer.controls.target.set(0, h * 0.35, -cfg.lotDepth * 0.18);
}

function regenerate() {
  cfg.elevator = view.elevator === 'auto' ? 'auto' : view.elevator === 'on';
  cfg.exteriorStair = view.exteriorStair === 'auto' ? 'auto' : view.exteriorStair === 'on';
  const lot = makeSampleAptLot(cfg.lotWidth, cfg.lotDepth, view.lotShape, cfg.seed);
  const { plan, roofs, site } = generateApartment(lot, cfg);
  const wall = resolveWall(cfg.structure, cfg.seed, plan.floors, view.wallStyle);
  const rail = resolveBalconyRail(cfg.seed, view.balconyRail);
  const guard = resolveStairGuard(cfg.seed, view.stairGuard);
  // 分節パターン(§10.4): horizontal のみ腰壁(水平帯)を出す。vertical は縦帯を render 側で立てる。
  const pattern: WallPattern = resolveWallPattern(cfg);
  const wallBase = pattern === 'horizontal' ? wall.base : wall.main;
  const rp: AptRenderParams = {
    seed: cfg.seed, windowLighting: view.windowLighting, windowInteriorMapping: view.windowInteriorMapping,
    showSite: view.showSite, wallMain: wall.main, wallBase, accent: cfg.accentColor,
    balconyRail: rail, stairGuard: guard, wallPattern: pattern, stripe: resolveStripe(cfg.seed),
  };
  const group = renderApartment(plan, roofs, site, rp);

  if (current) { viewer.content.remove(current); disposeGroup(current); }
  viewer.content.add(group);
  current = group;

  const shortTag = site.parkingShort ? ' ⚠不足' : '';
  const stairTag = plan.exteriorStairs.length ? `外階段${plan.exteriorStairs.length}/${guard}` : `内階段`;
  hud.textContent =
    `preset: ${view.preset}   access: ${plan.accessType}   structure: ${plan.structure}   floors: ${plan.floors}\n` +
    `lot: ${cfg.lotWidth}×${cfg.lotDepth}m ${view.lotShape} (${lot.areaM2.toFixed(0)}㎡)   棟: ${plan.bar.lengthBays}×${plan.bar.depthBays}bay @${plan.bar.gridModule.toFixed(2)}m (${(plan.bar.lengthBays * plan.bar.gridModule).toFixed(1)}×${(plan.bar.depthBays * plan.bar.gridModule).toFixed(1)}m)   基準階${plan.units.length}戸 / 総${plan.unitCount}戸\n` +
    `駐車: ${site.parking.count}/${site.parkingRequired}台${shortTag}   駐輪要: ${site.bikeRequired}台   コア: ${plan.cores.length}(${stairTag})   手摺: ${rail}   塔屋: ${plan.penthouses.length}`;
}

function applyPreset(name: AptPresetName) {
  view.preset = name;
  const seed = cfg.seed;
  Object.assign(cfg, structuredClone(DEFAULT_APT_CONFIG), structuredClone(APT_PRESETS[name]));
  cfg.seed = seed;
  view.elevator = cfg.elevator === 'auto' ? 'auto' : cfg.elevator ? 'on' : 'off';
  view.exteriorStair = cfg.exteriorStair === 'auto' ? 'auto' : cfg.exteriorStair ? 'on' : 'off';
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  frameCamera();
  regenerate();
}

// ---- GUI ----
const gui = new GUI({ title: 'Apartment-Gen' });
gui.add(view, 'preset', ['wood-apart', 'lowrise-wall-rc', 'midrise-gallery-rc']).name('★ 種別 preset').onChange(applyPreset);
gui.add(cfg, 'seed', 0, 9999, 1).onChange(regenerate);
gui.add({ next: () => { cfg.seed = (cfg.seed + 1) % 10000; gui.controllersRecursive().forEach((c) => c.updateDisplay()); regenerate(); } }, 'next').name('▶ next seed');

const fLot = gui.addFolder('Lot (敷地)');
fLot.add(cfg, 'lotWidth', 12, 60, 1).name('間口 width').onChange(regenerate);
fLot.add(cfg, 'lotDepth', 14, 60, 1).name('奥行 depth').onChange(regenerate);
fLot.add(view, 'lotShape', ['rectangle', 'irregular-quad', 'rounded-corner', 'chamfered']).name('敷地形状').onChange(regenerate);
fLot.add(cfg, 'sideSetback', 0, 4, 0.1).name('側方後退').onChange(regenerate);
fLot.add(cfg, 'rearSetback', 0.5, 6, 0.1).name('背面後退').onChange(regenerate);
fLot.add(cfg, 'edgeLandscape', 0, 5, 0.5).name('外周緑地').onChange(regenerate);
fLot.add(cfg, 'frontSetback', 1, 8, 0.5).name('前面/アプローチ').onChange(regenerate);
fLot.add(view, 'showSite').name('外構 表示').onChange(regenerate);

const fBld = gui.addFolder('Building (住棟)');
fBld.add(cfg, 'accessType', ['auto', 'stair-access', 'single-corridor']).name('アクセス型').onChange(regenerate);
fBld.add(cfg, 'structure', ['wood', 'rc-wall', 'rc-frame', 'steel']).name('構造').onChange(regenerate);
fBld.add(cfg, 'floors', 2, 14, 1).name('階数(固定時)').onChange(regenerate);
fBld.add(cfg, 'floorsRandom').name('階数ランダム').onChange(regenerate);
fBld.add(cfg, 'floorsMin', 2, 14, 1).name('階数 min').onChange(regenerate);
fBld.add(cfg, 'floorsMax', 2, 14, 1).name('階数 max').onChange(regenerate);
fBld.add(cfg, 'buildingLengthBays', 6, 40, 1).name('棟長 bays(基準)').onChange(regenerate);
fBld.add(cfg, 'buildingLengthRandom').name('棟長ランダム(等倍〜2倍)').onChange(regenerate);
fBld.add(cfg, 'unitDepth', 6, 13, 0.5).name('住戸奥行(前後)').onChange(regenerate);
fBld.add(cfg, 'unitDepthRandom').name('奥行ランダム(前後)').onChange(regenerate);
fBld.add(cfg, 'gridModule', 1.0, 1.8, 0.01).name('パネル幅/モジュール(左右)').onChange(regenerate);
fBld.add(cfg, 'gridModuleRandom').name('パネル幅ランダム(左右)').onChange(regenerate);
fBld.add(cfg, 'panelH', 2.6, 3.4, 0.05).name('階高').onChange(regenerate);
fBld.add(cfg, 'corridorWidth', 1.2, 2.0, 0.1).name('廊下幅(片廊下)').onChange(regenerate);
fBld.add(cfg, 'balconyDepth', 0.9, 2.2, 0.1).name('バルコニー奥行').onChange(regenerate);
fBld.add(cfg, 'stairSpacingUnits', 1, 4, 1).name('階段室型 戸/コア').onChange(regenerate);
fBld.add(view, 'elevator', ['auto', 'on', 'off']).name('EV').onChange(regenerate);
fBld.add(cfg, 'penthouse').name('塔屋 PH').onChange(regenerate);
fBld.add(view, 'exteriorStair', ['auto', 'on', 'off']).name('外階段(低層)').onChange(regenerate);
fBld.add(cfg, 'exteriorStairMaxFloors', 2, 6, 1).name('外階段 上限階').onChange(regenerate);
fBld.add(cfg, 'stairPlacement', ['auto', 'rear', 'gable']).name('外階段 配置(背面/妻)').onChange(regenerate);
fBld.add(view, 'stairGuard', ['auto', 'steel', 'white', 'wall']).name('外階段 ガード').onChange(regenerate);
fBld.add(cfg, 'roofForm', ['flat', 'gable', 'hip', 'mono']).name('屋根形状').onChange(regenerate);
fBld.add(view, 'wallStyle', ['auto', 'tile', 'concrete', 'siding', 'twotone']).name('外壁').onChange(regenerate);
fBld.add(view, 'balconyRail', ['auto', 'glass', 'bars', 'panel', 'concrete']).name('バルコニー手摺').onChange(regenerate);
fBld.add(cfg, 'coreStyle', ['auto', 'blank', 'windows', 'glazed']).name('コア立面(空白/窓/ガラス)').onChange(regenerate);
fBld.add(cfg, 'balconyForm', ['auto', 'continuous', 'inset', 'box']).name('バルコニー形状(連続/彫込/箱)').onChange(regenerate);
fBld.add(cfg, 'windowMix', ['auto', 'single', 'mixed']).name('窓構成(全幅/掃出+腰窓)').onChange(regenerate);
fBld.add(view, 'windowLighting', ['day', 'night', 'mixed']).name('窓 (昼/夜/混在)').onChange(regenerate);
fBld.add(view, 'windowInteriorMapping').name('窓 Interior Mapping').onChange(regenerate);
fBld.add(cfg, 'wallPattern', ['auto', 'horizontal', 'vertical', 'none']).name('ツートン分節(水平帯/縦帯)').onChange(regenerate);
fBld.add(cfg, 'gableStyle', ['auto', 'blank', 'windows']).name('妻面(無地/窓)').onChange(regenerate);

const fMix = gui.addFolder('Unit Mix (住戸ミックス)');
for (const t of ['1R', '1K', '1LDK', '2LDK', '3LDK', '4LDK'] as const) {
  fMix.add(cfg.unitMix, t, 0, 2, 0.1).name(t).onChange(regenerate);
}
fMix.close();

const fPark = gui.addFolder('Parking / 外構');
fPark.add(cfg, 'parkingRatioPerUnit', 0, 1.2, 0.05).name('駐車 台/戸').onChange(regenerate);
fPark.add(cfg, 'bicycleRatioPerUnit', 0, 2.5, 0.1).name('駐輪 台/戸').onChange(regenerate);
fPark.add(cfg, 'stallW', 2.3, 3.0, 0.1).name('マス幅').onChange(regenerate);
fPark.add(cfg, 'stallL', 4.5, 6.0, 0.1).name('マス奥行').onChange(regenerate);
fPark.add(cfg, 'aisleW', 5.0, 7.0, 0.1).name('車路幅').onChange(regenerate);
fPark.add(cfg, 'occupancy', 0, 1, 0.05).name('駐車率').onChange(regenerate);
fPark.add(cfg, 'refuseStation').name('ゴミ置場').onChange(regenerate);
fPark.close();

// カメラを target 周りの方位(az)/仰角(el)に配置(ヘッドレス確認用)。az=0:前面, 180:背面。
function applyView(azDeg: number, elDeg: number, dist?: number) {
  const t = viewer.controls.target;
  const d = dist ?? (viewer.camera.position.distanceTo(t) || 40);
  const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
  viewer.camera.position.set(
    t.x + d * Math.cos(el) * Math.sin(az),
    t.y + d * Math.sin(el),
    t.z + d * Math.cos(el) * Math.cos(az)
  );
  viewer.camera.lookAt(t);
  viewer.controls.update();
}

// boot（URL パラメータで初期状態を上書き。デバッグ/スクショ用）
// ?preset=&seed=&floors=&lw=&ld=&sp=(rear|gable)&guard=&rail=&wall=&az=&el=&dist=&ty=
const qp = new URLSearchParams(location.search);
frameCamera();
const qpPreset = qp.get('preset') as AptPresetName | null;
applyPreset(qpPreset && APT_PRESETS[qpPreset] ? qpPreset : 'midrise-gallery-rc');
let dirty = false;
if (qp.get('seed') !== null) { cfg.seed = Number(qp.get('seed')); dirty = true; }
if (qp.get('floors') !== null) { cfg.floorsRandom = false; cfg.floors = Number(qp.get('floors')); dirty = true; }
if (qp.get('lw') !== null) { cfg.lotWidth = Number(qp.get('lw')); dirty = true; }
if (qp.get('ld') !== null) { cfg.lotDepth = Number(qp.get('ld')); dirty = true; }
if (qp.get('sp')) { cfg.stairPlacement = qp.get('sp') as 'rear' | 'gable' | 'auto'; dirty = true; }
if (qp.get('cs')) { cfg.coreStyle = qp.get('cs') as 'auto' | 'blank' | 'windows' | 'glazed'; dirty = true; }
if (qp.get('bf')) { cfg.balconyForm = qp.get('bf') as AptConfig['balconyForm']; dirty = true; }
if (qp.get('wm')) { cfg.windowMix = qp.get('wm') as AptConfig['windowMix']; dirty = true; }
if (qp.get('wp')) { cfg.wallPattern = qp.get('wp') as AptConfig['wallPattern']; dirty = true; }
if (qp.get('gs')) { cfg.gableStyle = qp.get('gs') as AptConfig['gableStyle']; dirty = true; }
if (qp.get('guard')) { view.stairGuard = qp.get('guard') as StairGuardChoice; dirty = true; }
if (qp.get('rail')) { view.balconyRail = qp.get('rail') as BalconyRailChoice; dirty = true; }
if (qp.get('wall')) { view.wallStyle = qp.get('wall') as AptWallStyle; dirty = true; }
if (dirty) { gui.controllersRecursive().forEach((c) => c.updateDisplay()); regenerate(); }
if (qp.get('az') !== null || qp.get('el') !== null) applyView(Number(qp.get('az') ?? 0), Number(qp.get('el') ?? 18), qp.get('dist') !== null ? Number(qp.get('dist')) : undefined);
if (qp.get('ty') !== null) { viewer.controls.target.y = Number(qp.get('ty')); viewer.controls.update(); }
