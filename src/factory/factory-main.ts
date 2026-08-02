import GUI from 'lil-gui';
import * as THREE from 'three';
import { createViewer } from '../viewer/scene';
import { DEFAULT_FACTORY_CONFIG, FACTORY_PRESETS } from './gen/config';
import { generateFactory } from './gen/building';
import type { FactoryArchetype, FactoryConfig } from './gen/types';
import { disposeFactory, renderFactory } from './viewer/render';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const viewer = createViewer(canvas);
viewer.scene.children.filter((o) => o.type === 'GridHelper').forEach((o) => o.visible = false);
const cfg: FactoryConfig = structuredClone(DEFAULT_FACTORY_CONFIG);
let current: THREE.Group | null = null;
function frame() { const l = Math.max(cfg.lotWidth, cfg.lotDepth); viewer.camera.position.set(l * 0.65, l * 0.48, l * 0.78); viewer.controls.target.set(0, 2.8, -cfg.lotDepth * 0.42); }
function regenerate() {
  const plan = generateFactory(cfg), next = renderFactory(plan);
  if (current) { viewer.content.remove(current); disposeFactory(current); }
  viewer.content.add(next); current = next;
  const used = plan.building.width * plan.building.depth + plan.annexes.reduce((sum, a) => sum + a.width * a.depth, 0) + plan.parking.reduce((sum, s) => sum + s.width * s.depth, 0);
  hud.textContent = `${plan.archetype}  seed:${cfg.seed}  roof:${plan.roof}\nlot ${plan.lot.shape} ${plan.lot.area.toFixed(0)}㎡ / utilization ${(used / plan.lot.area * 100).toFixed(0)}% / building ${plan.building.width.toFixed(1)}×${plan.building.depth.toFixed(1)}m\n${plan.bays.length} bays / parking ${plan.parking.length} / annex ${plan.annexes.length} / props ${plan.props.length}`;
}
function preset(v: FactoryArchetype) { const seed = cfg.seed; Object.assign(cfg, structuredClone(DEFAULT_FACTORY_CONFIG), structuredClone(FACTORY_PRESETS[v]), { archetype: v, seed }); gui.controllersRecursive().forEach((c) => c.updateDisplay()); frame(); regenerate(); }
const gui = new GUI({ title: 'Factory-Gen' });
gui.add(cfg, 'archetype', ['town-factory', 'service-garage', 'rental-garage']).name('★ 業態').onChange(preset);
gui.add(cfg, 'seed', 0, 9999, 1).onChange(regenerate);
gui.add({ next: () => { cfg.seed = (cfg.seed + 1) % 10000; gui.controllersRecursive().forEach((c) => c.updateDisplay()); regenerate(); } }, 'next').name('▶ next seed');
const lot = gui.addFolder('敷地 / 配置');
lot.add(cfg, 'lotWidth', 10, 80, 1).name('間口').onChange(regenerate); lot.add(cfg, 'lotDepth', 14, 80, 1).name('奥行').onChange(regenerate); lot.add(cfg, 'lotShape', ['rectangle', 'chamfered', 'trapezoid', 'irregular']).name('敷地形状').onChange(regenerate); lot.add(cfg, 'sideSetback', 0.5, 5, 0.2).name('境界離隔').onChange(regenerate); lot.add(cfg, 'fence').name('境界フェンス').onChange(regenerate);
const layout = gui.addFolder('敷地内レイアウト');
layout.add(cfg, 'randomizeLayout').name('seedで規模/配置を変化').onChange(regenerate);
layout.add(cfg, 'depthPlacement', ['front', 'center', 'rear']).name('主棟 前後').onChange(regenerate);
layout.add(cfg, 'sidePlacement', ['left', 'center', 'right']).name('主棟 左右').onChange(regenerate);
layout.add(cfg, 'parkingCount', 0, 16, 1).name('駐車マス数').onChange(regenerate);
layout.add(cfg, 'detachedOffice').name('独立事務所棟').onChange(regenerate);
layout.add(cfg, 'officeWidth', 3, 9, 0.5).name('事務所 間口').onChange(regenerate);
layout.add(cfg, 'officeDepth', 3.5, 10, 0.5).name('事務所 奥行').onChange(regenerate);
const building = gui.addFolder('建物');
building.add(cfg, 'buildingWidth', 5, 50, 0.5).name('建物間口').onChange(regenerate); building.add(cfg, 'buildingDepth', 5, 35, 0.5).name('建物奥行').onChange(regenerate); building.add(cfg, 'clearHeight', 2.7, 8, 0.1).name('軒高').onChange(regenerate); building.add(cfg, 'floors', [1, 2]).name('階数').onChange(regenerate); building.add(cfg, 'roof', ['gable', 'mono', 'sawtooth', 'flat']).name('屋根').onChange(regenerate); building.add(cfg, 'roofPitch', 0.05, 0.5, 0.01).name('屋根勾配').onChange(regenerate); building.add(cfg, 'weathering', 0, 1, 0.05).name('経年/汚れ').onChange(regenerate);
const bays = gui.addFolder('ベイ / 開口');
bays.add(cfg, 'unitCount', 1, 12, 1).name('ベイ数').onChange(regenerate); bays.add(cfg, 'unitWidth', 2.4, 7, 0.1).name('基準ベイ幅').onChange(regenerate); bays.add(cfg, 'shutterOpenRate', 0, 1, 0.05).name('シャッター開率').onChange(regenerate); bays.add(cfg, 'officeRatio', 0, 0.5, 0.05).name('事務所比率').onChange(regenerate); bays.add(cfg, 'equipmentDensity', 0, 1, 0.05).name('設備密度').onChange(regenerate);
preset(cfg.archetype);
