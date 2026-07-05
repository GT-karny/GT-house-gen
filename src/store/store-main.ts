import GUI from 'lil-gui';
import { createViewer } from '../viewer/scene';
import { renderStore, disposeGroup, type StoreRenderParams } from './viewer/render';
import { DEFAULT_STORE_CONFIG, STORE_PRESETS, type StoreConfig, type StorePresetName, type StoreRoofForm } from './gen/config';
import { generateStore } from './gen/building';
import { makeSampleStoreLot, type LotShape } from './gen/lot';
import { rand01 } from '../shared/rng';
import { LOGO_VARIANT_COUNT, type StoreWallVariant } from './viewer/materials';
import * as THREE from 'three';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const viewer = createViewer(canvas);

// store lots run larger than a house (big-box ≈100 m); widen the sun's shadow
// frustum so the whole site casts, and drop the house streetscape grid.
const sun = viewer.scene.children.find((o): o is THREE.DirectionalLight => (o as THREE.DirectionalLight).isDirectionalLight);
if (sun) {
  const s = 95;
  sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
  sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
  sun.shadow.camera.updateProjectionMatrix();
}
viewer.scene.children.filter((o) => o.type === 'GridHelper').forEach((o) => (o.visible = false));

// Cladding (外壁) is seed-resolved exactly like the house main.ts: a wall STYLE
// (plaster / siding / two-tone) drawn from the shared house WallVariant palette,
// with `base` clading the ground floor for two-tone. Stores add one commercial
// style, `metal` (角波 ribbed), weighted in for big-box / drive-through.
type StoreWallStyle = 'auto' | 'plaster' | 'siding' | 'twotone' | 'brick' | 'metal';
const PLASTER_TEX: StoreWallVariant[] = ['plaster', 'plaster2'];
const SIDING_TEX: StoreWallVariant[] = ['siding', 'siding2', 'siding3'];
const BASE_TEX: StoreWallVariant[] = ['stone', 'stone2', 'brick', 'brick2', 'concrete'];
const pick = <T,>(arr: T[], k: number, seed: number): T => arr[Math.floor(rand01(seed, k) * arr.length)];

function resolveStoreWall(
  preset: StorePresetName, seed: number, floors: number, style: StoreWallStyle
): { main: StoreWallVariant; base: StoreWallVariant } {
  let s = style;
  if (s === 'auto') {
    // family-restaurants read as cottages: 塗壁 + レンガ/石の腰壁 (two-tone wainscot)
    if (preset === 'family-restaurant') s = rand01(seed, 321) < 0.65 ? 'twotone' : 'siding';
    else {
      const metalChance = preset === 'big-box' ? 0.45 : preset === 'drive-through' ? 0.3 : 0.12;
      if (rand01(seed, 322) < metalChance) s = 'metal';
      else { const r = rand01(seed, 321); s = r < 0.4 ? 'plaster' : r < 0.6 ? 'siding' : r < 0.8 ? 'twotone' : 'brick'; }
    }
  }
  const WAINSCOT: StoreWallVariant[] = ['brick', 'brick2', 'stone', 'stone2']; // 腰壁 (skip concrete for a warm base)
  if (s === 'metal') return { main: 'ribbed', base: floors > 1 ? pick(BASE_TEX, 333, seed) : 'ribbed' };
  if (s === 'brick') return { main: 'redbrick', base: 'redbrick' }; // 赤レンガ
  if (s === 'siding') { const m = pick(SIDING_TEX, 331, seed); return { main: m, base: m }; }
  // two-tone always applies a distinct 腰壁 base (even single-storey, ファミレス風)
  if (s === 'twotone') return { main: pick(PLASTER_TEX, 332, seed), base: pick(WAINSCOT, 333, seed) };
  const m = pick(PLASTER_TEX, 334, seed);
  return { main: m, base: m };
}

// Roof form is seed-resolved when 'auto' (mirrors the house resolveRoof): each
// preset has a natural distribution — family-restaurants favour the mansard crown,
// big-box/convenience stay flat, drive-through mostly flat with the odd variation.
type StoreRoofChoice = 'auto' | StoreRoofForm;
// Above this building footprint (m²), gable/hip (triangular residential roofs)
// read wrong on a big box — coerce them to flat. Mansard/mono/flat stay valid.
const PITCHED_ROOF_MAX_AREA = 420;
function resolveStoreRoof(preset: StorePresetName, seed: number, choice: StoreRoofChoice, area: number): StoreRoofForm {
  const bigBox = area >= PITCHED_ROOF_MAX_AREA;
  if (choice !== 'auto') return bigBox && (choice === 'gable' || choice === 'hip') ? 'flat' : choice;
  const r = rand01(seed, 340);
  switch (preset) {
    case 'family-restaurant':
      return bigBox ? (r < 0.62 ? 'mansard' : 'flat') : (r < 0.6 ? 'mansard' : r < 0.82 ? 'hip' : 'gable');
    case 'drive-through': return r < 0.65 ? 'flat' : r < 0.85 ? 'mono' : 'mansard';
    case 'big-box': return r < 0.8 ? 'flat' : 'mono';
    case 'convenience': default: return 'flat';
  }
}

const cfg: StoreConfig = { ...structuredClone(DEFAULT_STORE_CONFIG), ...structuredClone(STORE_PRESETS['big-box']) };
const view = {
  preset: 'big-box' as StorePresetName, showSite: true, lotShape: 'rectangle' as LotShape,
  wallStyle: 'auto' as StoreWallStyle,
  roofStyle: 'auto' as StoreRoofChoice,
};

let current: THREE.Group | null = null;

function frameCamera() {
  const L = Math.max(cfg.lotWidth, cfg.lotDepth);
  viewer.camera.position.set(L * 0.4, L * 0.5, L * 0.8);
  viewer.controls.target.set(0, 3, -cfg.lotDepth * 0.3);
}

function regenerate() {
  const lot = makeSampleStoreLot(cfg.lotWidth, cfg.lotDepth, view.lotShape, cfg.seed);
  const roofForm = resolveStoreRoof(view.preset, cfg.seed, view.roofStyle, cfg.buildTargetWidth * cfg.buildTargetDepth);
  const { plan, roofs, site } = generateStore(lot, cfg, { roofForm });
  const wall = resolveStoreWall(view.preset, cfg.seed, plan.floors, view.wallStyle);
  const rp: StoreRenderParams = {
    brandColor: cfg.brandColor, showSite: view.showSite, wallMain: wall.main, wallBase: wall.base,
    windowAwnings: cfg.windowAwnings, entranceGable: cfg.entranceGable,
  };
  const group = renderStore(plan, roofs, site, rp);

  if (current) { viewer.content.remove(current); disposeGroup(current); }
  viewer.content.add(group);
  current = group;

  const footprintArea = plan.masses.reduce((a, m) => a + m.obb.halfU * 2 * (m.obb.halfV * 2), 0);
  const signs = site.signs.length + plan.signs.length;
  hud.textContent =
    `preset: ${view.preset}   archetype: ${plan.archetype}   配置: ${cfg.buildingDepth}/${cfg.buildingSide}   floors: ${plan.floors}\n` +
    `lot: ${cfg.lotWidth}×${cfg.lotDepth}m ${view.lotShape} (${(lot.areaM2).toFixed(0)}㎡)   建築面積: ${footprintArea.toFixed(0)}㎡\n` +
    `駐車: ${site.parking.count}台   看板: ${signs}   roof: ${roofForm}${view.roofStyle === 'auto' ? ' (auto)' : ''}`;
}

function applyPreset(name: StorePresetName) {
  view.preset = name;
  const seed = cfg.seed;
  Object.assign(cfg, structuredClone(DEFAULT_STORE_CONFIG), structuredClone(STORE_PRESETS[name]));
  cfg.seed = seed;
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  frameCamera();
  regenerate();
}

// ---- GUI ----
const gui = new GUI({ title: 'Store-Gen' });
gui.add(view, 'preset', ['big-box', 'convenience', 'family-restaurant', 'drive-through']).name('★ 業態 preset').onChange(applyPreset);
gui.add(cfg, 'seed', 0, 9999, 1).onChange(regenerate);
gui.add({ next: () => { cfg.seed = (cfg.seed + 1) % 10000; gui.controllersRecursive().forEach((c) => c.updateDisplay()); regenerate(); } }, 'next').name('▶ next seed');

const fLot = gui.addFolder('Lot (敷地)');
fLot.add(cfg, 'lotWidth', 18, 140, 1).name('間口 width').onChange(regenerate);
fLot.add(cfg, 'lotDepth', 18, 140, 1).name('奥行 depth').onChange(regenerate);
fLot.add(view, 'lotShape', ['rectangle', 'irregular-quad', 'rounded-corner', 'chamfered']).name('敷地形状').onChange(regenerate);
fLot.add(cfg, 'edgeLandscape', 0, 6, 0.5).name('外周緑地').onChange(regenerate);
fLot.add(cfg, 'frontSetback', 0, 8, 0.5).name('前面後退').onChange(regenerate);
fLot.add(view, 'showSite').name('敷地/駐車/看板 表示').onChange(regenerate);

const fBld = gui.addFolder('Building (建物)');
fBld.add(cfg, 'buildingDepth', ['auto', 'front', 'rear']).name('前後(道路側/奥)').onChange(regenerate);
fBld.add(cfg, 'buildingSide', ['auto', 'left', 'center', 'right']).name('左右(左/中/右)').onChange(regenerate);
fBld.add(cfg, 'buildTargetWidth', 8, 90, 1).name('間口 目標').onChange(regenerate);
fBld.add(cfg, 'buildTargetDepth', 8, 70, 1).name('奥行 目標').onChange(regenerate);
fBld.add(cfg, 'floors', 1, 3, 1).onChange(regenerate);
fBld.add(cfg, 'panelW', 2, 6, 0.1).name('storefront bay').onChange(regenerate);
fBld.add(cfg, 'panelH', 3, 7, 0.1).name('階高').onChange(regenerate);
fBld.add(view, 'roofStyle', ['auto', 'flat', 'gable', 'hip', 'mono', 'mansard']).name('屋根形状 (auto=シード/陸/切妻/寄棟/片流/腰折)').onChange(regenerate);
fBld.add(view, 'wallStyle', ['auto', 'plaster', 'siding', 'twotone', 'brick', 'metal']).name('外壁 (自動/塗壁/板/2トーン/赤レンガ/角波)').onChange(regenerate);

const fPark = gui.addFolder('Parking (駐車場)');
fPark.add(cfg, 'parkingLayout', ['front', 'wrap']).name('配置').onChange(regenerate);
fPark.add(cfg, 'stallW', 2.3, 3.0, 0.1).name('マス幅').onChange(regenerate);
fPark.add(cfg, 'stallL', 4.5, 6.0, 0.1).name('マス奥行').onChange(regenerate);
fPark.add(cfg, 'aisleW', 5.0, 7.0, 0.1).name('車路幅').onChange(regenerate);
fPark.add(cfg, 'occupancy', 0, 1, 0.05).name('駐車率').onChange(regenerate);
fPark.add(cfg, 'accessibleStalls', 0, 6, 1).name('身障者マス').onChange(regenerate);

const fFront = gui.addFolder('Storefront');
fFront.add(cfg, 'glazingRatio', 0, 1, 0.05).name('ガラス率').onChange(regenerate);
fFront.add(cfg, 'entranceCount', 1, 3, 1).name('入口数').onChange(regenerate);
fFront.add(cfg, 'signband').name('看板帯').onChange(regenerate);
fFront.add(cfg, 'signbandH', 0.6, 2.5, 0.1).name('看板帯 高さ').onChange(regenerate);
fFront.add(cfg, 'wallSign').name('壁面看板').onChange(regenerate);
fFront.add(cfg, 'bladeSign').name('袖看板').onChange(regenerate);
fFront.add(cfg, 'windowAwnings').name('窓オーニング').onChange(regenerate);
fFront.add(cfg, 'entranceGable').name('妻屋根ポーチ').onChange(regenerate);

const fSign = gui.addFolder('Signage / Features');
fSign.add(cfg, 'signPylon').name('サインポール').onChange(regenerate);
fSign.add(cfg, 'pylonHeight', 3, 12, 0.5).name('ポール高さ').onChange(regenerate);
fSign.add(cfg, 'rooftopSign').name('屋上看板(陸屋根/ランダム)').onChange(regenerate);
fSign.add({ logo: 'auto' }, 'logo', ['auto', ...Array.from({ length: LOGO_VARIANT_COUNT }, (_, i) => String(i)) ])
  .name('ロゴ (auto=シード/0..N)').onChange((v: string) => { cfg.logoStyle = v === 'auto' ? -1 : Number(v); regenerate(); });
fSign.add(cfg, 'driveThrough').name('ドライブスルー').onChange(regenerate);
fSign.add(cfg, 'serviceYard').name('荷捌きヤード').onChange(regenerate);
fSign.add(cfg, 'carts').name('カート置き場').onChange(regenerate);
fSign.add(cfg, 'flags').name('幟/旗').onChange(regenerate);
fSign.addColor(cfg, 'brandColor').name('ブランド色').onChange(regenerate);

// boot
frameCamera();
applyPreset('big-box');
