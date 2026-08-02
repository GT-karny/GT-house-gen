import * as THREE from 'three';
import { planarBoxUV, roundedBox } from '../../viewer/modules';
import type { FactoryBay, FactoryPlan, FactoryProp } from '../gen/types';
import { upgradeFactoryAssets } from './factoryAssets';
import {
  asphaltMaterial, cleanCladdingMaterial, concreteMaterial, factoryCladdingMaterial, fenceMaterial, glassMaterial,
  interiorMaterial, paintedSteelMaterial, redPaintMaterial, roofSheetMaterial, rubberMaterial,
  safetyMaterial, shutterMaterial, steelMaterial, timberMaterial, warmLightMaterial, whitePaintMaterial,
} from './materials';

const toZ = (y: number) => -y;
function meshBox(w: number, h: number, d: number, material: THREE.Material, tile = 1) {
  const geom = new THREE.BoxGeometry(w, h, d); planarBoxUV(geom, w, h, d, tile);
  const mesh = new THREE.Mesh(geom, material); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
function meshRounded(w: number, h: number, d: number, material: THREE.Material, bevel = 0.08) {
  const mesh = new THREE.Mesh(roundedBox(w, h, d, 1, bevel), material); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T { o.position.set(x, z, toZ(y)); return o; }
function cylinder(r: number, h: number, material: THREE.Material, sides = 18) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, sides), material); m.castShadow = true; return m; }
function claddingFor(p: FactoryPlan) { return p.archetype === 'rental-garage' ? cleanCladdingMaterial() : factoryCladdingMaterial(p.weathering); }

export function renderFactory(p: FactoryPlan): THREE.Group {
  const root = new THREE.Group(); root.name = `factory-${p.archetype}`;
  addStreetContext(root, p); addSite(root, p); addParking(root, p); addBuilding(root, p); addRoof(root, p); addAnnexes(root, p); addUtilities(root, p); addSignage(root, p);
  const fallbacks = new Map<number, THREE.Group>();
  p.props.forEach((prop, i) => { const fallback = propMeshes(prop); fallbacks.set(i, fallback); root.add(fallback); });
  if (p.fence) addFence(root, p);
  upgradeFactoryAssets(root, p.props, fallbacks);
  return root;
}

function addStreetContext(g: THREE.Group, p: FactoryPlan) {
  const w = p.lot.width;
  // Distribution pole, transformer/cross-arms and sagging overhead wires.
  const poleX = w / 2 + 2.1, poleY = -1.1, poleH = 8.2;
  g.add(at(cylinder(0.13, poleH, paintedSteelMaterial(0x55514a), 16), poleX, poleY, poleH / 2));
  for (const z of [6.9, 7.45]) g.add(at(meshBox(2.0, 0.11, 0.13, paintedSteelMaterial(0x494744), 1), poleX, poleY, z));
  g.add(at(meshBox(0.65, 0.9, 0.45, paintedSteelMaterial(0x696d69), 1), poleX, poleY, 6.1));
  for (const dz of [0, 0.32, 0.64]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 18; i++) { const t = i / 18, x = -w - 8 + t * (w * 2 + 16), sag = Math.sin(t * Math.PI) * 0.62; pts.push(new THREE.Vector3(x, 7.55 - dz - sag, -poleY)); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x292b2b })); g.add(line);
  }
}

function addSite(g: THREE.Group, p: FactoryPlan) {
  const w = p.lot.width;
  g.add(lotGround(p));
  // Street edge, mountable curb and the ubiquitous grated drainage channel.
  g.add(at(meshBox(w + 10, 0.07, 7, asphaltMaterial(), 4), 0, -3.5, -0.02));
  const frontA = p.lot.ring[0], frontB = p.lot.ring[1], frontW = Math.hypot(frontB.x - frontA.x, frontB.y - frontA.y), frontX = (frontA.x + frontB.x) / 2;
  g.add(at(meshBox(frontW, 0.13, 0.42, concreteMaterial(), 1), frontX, 0.24, 0.08));
  g.add(at(meshBox(frontW * 0.9, 0.035, 0.34, steelMaterial(), 1), frontX, 0.23, 0.17));
  for (let x = frontX - frontW * 0.43; x < frontX + frontW * 0.43; x += 0.38) g.add(at(meshBox(0.025, 0.045, 0.34, paintedSteelMaterial(), 1), x, 0.22, 0.2));
  // Faded lane marks.
  if (p.archetype === 'service-garage') for (const bay of p.bays) g.add(at(meshBox(0.075, 0.012, 5.2, whitePaintMaterial(), 1), bay.centerX - bay.width * 0.42, 3.0, 0.11));
}

function lotGround(p: FactoryPlan) {
  const shape = new THREE.Shape();
  p.lot.ring.forEach((point, i) => i === 0 ? shape.moveTo(point.x, point.y) : shape.lineTo(point.x, point.y)); shape.closePath();
  const geom = new THREE.ShapeGeometry(shape);
  const pos = geom.getAttribute('position') as THREE.BufferAttribute, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / 4; uv[i * 2 + 1] = pos.getY(i) / 4; }
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(geom, asphaltMaterial()); mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.035; mesh.receiveShadow = true; return mesh;
}

function addParking(g: THREE.Group, p: FactoryPlan) {
  for (const stall of p.parking) {
    const halfW = stall.width / 2, halfD = stall.depth / 2;
    for (const x of [-halfW, halfW]) g.add(at(meshBox(0.065, 0.014, stall.depth, whitePaintMaterial(), 1), stall.x + x, stall.y, 0.115));
    g.add(at(meshBox(stall.width, 0.014, 0.065, whitePaintMaterial(), 1), stall.x, stall.y - halfD, 0.115));
    g.add(at(meshBox(1.65, 0.11, 0.16, concreteMaterial(), 1), stall.x, stall.y + halfD - 0.62, 0.17));
  }
}

function addAnnexes(g: THREE.Group, p: FactoryPlan) {
  for (const office of p.annexes) {
    const front = office.y - office.depth / 2, material = cleanCladdingMaterial();
    g.add(at(meshBox(office.width + 0.18, 0.2, office.depth + 0.18, concreteMaterial(), 1.5), office.x, office.y, 0.1));
    g.add(at(meshBox(office.width, office.height, office.depth, material, 1), office.x, office.y, office.height / 2 + 0.18));
    g.add(at(meshBox(office.width + 0.48, 0.18, office.depth + 0.48, roofSheetMaterial(), 1.2), office.x, office.y, office.height + 0.28));
    const doorX = office.x + office.width * 0.27;
    g.add(at(meshBox(0.92, 2.15, 0.13, paintedSteelMaterial(0x39464b), 1), doorX, front - 0.09, 1.25));
    g.add(at(meshBox(0.5, 0.72, 0.04, glassMaterial(), 1), doorX, front - 0.18, 1.65));
    const winW = Math.max(1.1, office.width * 0.42), winX = office.x - office.width * 0.2;
    g.add(at(meshBox(winW, 1.18, 0.07, glassMaterial(), 1), winX, front - 0.1, 1.48));
    for (const x of [-winW / 2, 0, winW / 2]) g.add(at(meshBox(0.045, 1.24, 0.11, steelMaterial(), 1), winX + x, front - 0.15, 1.48));
    g.add(at(makeTextSign('事務所', Math.min(2.2, office.width * 0.55), 0.48, 0xe8e5dc, 0x273c46), office.x, front - 0.16, office.height - 0.45));
    // Exterior condenser stays inside the office footprint projection.
    addACAt(g, office.x - office.width / 2 + 0.55, office.y + office.depth / 2 - 0.28, 0.2);
  }
}

function addBuilding(g: THREE.Group, p: FactoryPlan) {
  const b = p.building, front = b.y - b.depth / 2, rear = b.y + b.depth / 2;
  const cladding = claddingFor(p), concrete = concreteMaterial(), steel = paintedSteelMaterial(0x596064);
  // Raised slab and concrete wainscot are separate from the steel skin.
  g.add(at(meshBox(b.width + 0.25, 0.22, b.depth + 0.25, concrete, 1.8), b.x, b.y, 0.11));
  g.add(at(meshBox(b.width, 0.75, 0.22, concrete, 1.4), b.x, rear, 0.47));
  g.add(at(meshBox(b.width, b.height - 0.65, 0.16, cladding, 1), b.x, rear, b.height / 2 + 0.33));
  for (const side of [-1, 1]) {
    g.add(at(meshBox(0.18, 0.75, b.depth, concrete, 1.5), b.x + side * b.width / 2, b.y, 0.47));
    g.add(at(meshBox(0.14, b.height - 0.65, b.depth, cladding, 1), b.x + side * b.width / 2, b.y, b.height / 2 + 0.33));
  }
  // Dark but readable workshop volume: back wall, floor, overhead fluorescent rows.
  g.add(at(meshBox(b.width - 0.6, b.height - 0.55, 0.1, interiorMaterial(), 1), b.x, rear - 0.32, b.height / 2));
  g.add(at(meshBox(b.width - 0.35, 0.06, b.depth - 0.25, concrete, 2), b.x, b.y, 0.24));
  for (let y = front + 2.4; y < rear - 1; y += 3.2) for (const x of [-b.width * 0.23, b.width * 0.23]) g.add(at(meshBox(1.65, 0.055, 0.16, warmLightMaterial(), 1), b.x + x, y, b.height - 0.4));

  const openH = openingHeight(p), top = b.height - openH;
  for (const bay of p.bays) {
    const left = bay.centerX - bay.width / 2;
    // Structural front frame and cladding above every bay.
    g.add(at(meshBox(0.18, b.height, 0.24, steel, 1), left, front, b.height / 2));
    if (b.floors > 1 && top > 2.0) addUpperWindowBay(g, bay, b.height, openH, front, cladding, steel);
    else g.add(at(meshBox(bay.width - 0.16, top, 0.15, cladding, 1), bay.centerX, front, openH + top / 2));
    addBay(g, p, bay, front, openH);
  }
  g.add(at(meshBox(0.18, b.height, 0.24, steel, 1), b.x + b.width / 2, front, b.height / 2));
  // Horizontal eave beam makes the steel shed construction legible.
  g.add(at(meshBox(b.width + 0.2, 0.22, 0.28, steel, 1), b.x, front, b.height - 0.12));
}

function addUpperWindowBay(g: THREE.Group, bay: FactoryBay, buildingH: number, openH: number, front: number, cladding: THREE.Material, frame: THREE.Material) {
  const floorH = buildingH / 2, winH = 1.15, winW = bay.width * 0.58, winZ = floorH + 1.4;
  const winBottom = winZ - winH / 2, winTop = winZ + winH / 2, bayW = bay.width - 0.16;
  const bottomH = Math.max(0.05, winBottom - openH), topH = Math.max(0.05, buildingH - winTop), sideW = Math.max(0.08, (bayW - winW) / 2);
  g.add(at(meshBox(bayW, bottomH, 0.15, cladding, 1), bay.centerX, front, openH + bottomH / 2));
  g.add(at(meshBox(bayW, topH, 0.15, cladding, 1), bay.centerX, front, winTop + topH / 2));
  for (const side of [-1, 1]) g.add(at(meshBox(sideW, winH, 0.15, cladding, 1), bay.centerX + side * (winW / 2 + sideW / 2), front, winZ));
  g.add(at(meshBox(winW, winH, 0.07, glassMaterial(), 1), bay.centerX, front - 0.1, winZ));
  for (const x of [-winW / 2, 0, winW / 2]) g.add(at(meshBox(0.045, winH + 0.08, 0.12, frame, 1), bay.centerX + x, front - 0.15, winZ));
  for (const z of [winBottom, winTop]) g.add(at(meshBox(winW + 0.08, 0.045, 0.12, frame, 1), bay.centerX, front - 0.15, z));
}

function openingHeight(p: FactoryPlan) { return Math.min(p.building.height * 0.73, p.archetype === 'rental-garage' ? 2.45 : p.archetype === 'service-garage' ? 4.35 : 3.65); }
function addBay(g: THREE.Group, p: FactoryPlan, bay: FactoryBay, front: number, h: number) {
  const w = bay.width * 0.84, frame = paintedSteelMaterial(0x303638);
  if (bay.module === 'shutter') {
    // Real void: there is deliberately no facade polygon behind the shutter.
    // The workshop floor, distant rear wall, lights and equipment remain visible.
    for (const sx of [-1, 1]) g.add(at(meshBox(0.12, h + 0.16, 0.23, frame, 1), bay.centerX + sx * (w / 2 + 0.06), front - 0.02, h / 2));
    g.add(at(meshBox(w + 0.36, 0.34, 0.42, shutterMaterial(), 1), bay.centerX, front - 0.02, h + 0.2));
    const visible = Math.max(0.14, h * (1 - bay.shutterOpen));
    const shutter = at(meshBox(w, visible, 0.095, shutterMaterial(), 0.45), bay.centerX, front - 0.14, h - visible / 2);
    g.add(shutter);
    const grooves = Math.max(2, Math.floor(visible / 0.16));
    for (let i = 1; i < grooves; i++) g.add(at(meshBox(w - 0.04, 0.012, 0.018, paintedSteelMaterial(0x777d7e), 1), bay.centerX, front - 0.2, h - visible + (visible * i) / grooves));
    if (bay.shutterOpen > 0.5) addWorkshopDetail(g, bay.centerX, front + 1.35, p.archetype);
  } else {
    // Office front with an actual framed window/door composition.
    g.add(at(meshBox(w, h, 0.12, claddingFor(p), 1), bay.centerX, front, h / 2));
    const doorW = bay.module === 'personnel-door' ? 0.92 : 0;
    if (doorW) {
      g.add(at(meshBox(doorW, 2.15, 0.13, paintedSteelMaterial(0x35434a), 1), bay.centerX + w * 0.22, front - 0.1, 1.08));
      g.add(at(meshBox(0.5, 0.68, 0.035, glassMaterial(), 1), bay.centerX + w * 0.22, front - 0.18, 1.55));
    }
    const winW = doorW ? w * 0.42 : w * 0.67;
    const wx = doorW ? bay.centerX - w * 0.21 : bay.centerX;
    g.add(at(meshBox(winW, 1.18, 0.08, glassMaterial(), 1), wx, front - 0.11, 1.47));
    for (const x of [-winW / 2, 0, winW / 2]) g.add(at(meshBox(0.045, 1.25, 0.12, frame, 1), wx + x, front - 0.16, 1.47));
    g.add(at(meshBox(winW + 0.16, 0.08, 0.22, frame, 1), wx, front - 0.16, 0.84));
  }
}

function addWorkshopDetail(g: THREE.Group, x: number, y: number, archetype: FactoryPlan['archetype']) {
  if (archetype === 'service-garage') return;
  // Workbench, vice and material stock visible through an open town-factory bay.
  g.add(at(meshBox(1.65, 0.12, 0.72, steelMaterial(), 1), x, y, 0.88));
  for (const sx of [-0.72, 0.72]) g.add(at(meshBox(0.07, 0.82, 0.07, steelMaterial(), 1), x + sx, y, 0.43));
  g.add(at(meshBox(0.23, 0.24, 0.18, safetyMaterial(), 1), x + 0.45, y - 0.05, 1.06));
  for (let i = 0; i < 5; i++) { const pipe = cylinder(0.035, 2.1, paintedSteelMaterial(0x777c79), 10); pipe.rotation.z = Math.PI / 2; g.add(at(pipe, x - 0.55 + i * 0.13, y + 0.24, 1.25 + i * 0.06)); }
}

function addRoof(g: THREE.Group, p: FactoryPlan) {
  const b = p.building, e = 0.48, mat = roofSheetMaterial();
  if (p.roof === 'flat') { g.add(at(meshBox(b.width + e, 0.24, b.depth + e, mat, 1.5), b.x, b.y, b.height + 0.12)); addGutters(g, p, b.height + 0.12); return; }
  if (p.roof === 'sawtooth') {
    const teeth = Math.max(2, Math.round(b.depth / 4.5)), d = b.depth / teeth;
    for (let i = 0; i < teeth; i++) {
      const roof = meshBox(b.width + e * 2, 0.16, d * 1.03, mat, 1.2); roof.rotation.x = -Math.atan(p.roofPitch); g.add(at(roof, b.x, b.y - b.depth / 2 + d * (i + 0.5), b.height + d * p.roofPitch * 0.45));
      g.add(at(meshBox(b.width, d * p.roofPitch * 0.78, 0.08, glassMaterial(), 1), b.x, b.y - b.depth / 2 + d * (i + 1), b.height + d * p.roofPitch * 0.38));
    }
    addGutters(g, p, b.height); return;
  }
  const half = b.depth / 2 + e, rise = p.roof === 'mono' ? b.depth * p.roofPitch : half * p.roofPitch;
  if (p.roof === 'mono') {
    addMonoEndWalls(g, p, rise);
    const run = b.depth + e * 2, slope = Math.hypot(run, rise);
    const roof = meshBox(b.width + e * 2, 0.18, slope, mat, 1.5); roof.rotation.x = -Math.atan2(rise, run); g.add(at(roof, b.x, b.y, b.height + rise / 2));
  } else {
    addGableEndWalls(g, p, rise);
    const slope = Math.hypot(half, rise);
    for (const side of [-1, 1]) {
      const roof = meshBox(b.width + e * 2, 0.18, slope, mat, 1.5);
      // Three local +Z points toward plan -Y. The front half therefore needs
      // positive X rotation; using the opposite sign creates an inverted V and
      // leaves the visible wall/roof gap reported in the browser.
      roof.rotation.x = -side * Math.atan2(rise, half);
      g.add(at(roof, b.x, b.y + side * half / 2, b.height + rise / 2));
    }
  }
  addGutters(g, p, b.height + 0.02);
}

function endTriangle(x: number, points: Array<[number, number]>, material: THREE.Material, reverse: boolean) {
  const order = reverse ? [0, 2, 1] : [0, 1, 2];
  const positions: number[] = [];
  for (const index of order) { const [planY, z] = points[index]; positions.push(x, z, -planY); }
  const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
function addGableEndWalls(g: THREE.Group, p: FactoryPlan, rise: number) {
  const b = p.building, front = b.y - b.depth / 2, rear = b.y + b.depth / 2, material = claddingFor(p);
  for (const side of [-1, 1]) g.add(endTriangle(b.x + side * b.width / 2, [[front, b.height], [rear, b.height], [b.y, b.height + rise]], material, side < 0));
}
function addMonoEndWalls(g: THREE.Group, p: FactoryPlan, rise: number) {
  const b = p.building, front = b.y - b.depth / 2, rear = b.y + b.depth / 2, material = claddingFor(p);
  for (const side of [-1, 1]) g.add(endTriangle(b.x + side * b.width / 2, [[front, b.height], [rear, b.height], [front, b.height + rise]], material, side < 0));
  // The mono roof rises at the road-facing edge; close that rectangular head wall.
  g.add(at(meshBox(b.width, rise, 0.14, material, 1), b.x, front, b.height + rise / 2));
}

function addGutters(g: THREE.Group, p: FactoryPlan, z: number) {
  const b = p.building, front = b.y - b.depth / 2 - 0.48;
  g.add(at(meshBox(b.width + 0.8, 0.16, 0.18, paintedSteelMaterial(0x444b4d), 1), b.x, front, z));
  for (const x of [b.x - b.width / 2 + 0.25, b.x + b.width / 2 - 0.25]) {
    const pipe = cylinder(0.075, Math.max(1, z - 0.35), paintedSteelMaterial(0x555d5f), 14); g.add(at(pipe, x, front, (z - 0.35) / 2));
    const elbow = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 8, 14, Math.PI / 2), paintedSteelMaterial(0x555d5f)); elbow.rotation.z = Math.PI / 2; g.add(at(elbow, x, front - 0.12, 0.17));
  }
}

function addUtilities(g: THREE.Group, p: FactoryPlan) {
  const b = p.building, side = b.x - b.width / 2 - 0.12;
  // Surface-mounted conduits and meters are a strong Japanese light-industrial cue.
  for (const [i, z] of [0.9, 1.25, 1.6].entries()) {
    const pipe = cylinder(0.025, b.depth * 0.55, paintedSteelMaterial(0x6c7170), 10); pipe.rotation.x = Math.PI / 2; g.add(at(pipe, side - i * 0.035, b.y + 0.8, z));
  }
  g.add(at(meshBox(0.48, 0.62, 0.2, whitePaintMaterial(), 1), side - 0.06, b.y - 1.1, 1.25));
  const fan = cylinder(0.42, 0.18, paintedSteelMaterial(0x4b5253), 24); fan.rotation.z = Math.PI / 2; g.add(at(fan, b.x + b.width / 2 + 0.12, b.y + 1.4, b.height * 0.63));
  for (let i = 0; i < 5; i++) { const blade = meshBox(0.08, 0.46, 0.05, paintedSteelMaterial(0x767c7b), 1); blade.rotation.z = i * Math.PI / 2.5; g.add(at(blade, b.x + b.width / 2 + 0.23, b.y + 1.4, b.height * 0.63)); }
}

function addSignage(g: THREE.Group, p: FactoryPlan) {
  if (p.archetype === 'rental-garage') {
    p.bays.forEach((b) => g.add(at(makeTextSign(`${String(b.index + 1).padStart(2, '0')}`, 0.55, 0.28, 0x27333a, 0xf4f0e7), b.centerX, p.building.y - p.building.depth / 2 - 0.2, openingHeight(p) + 0.55)));
    return;
  }
  const names = p.archetype === 'service-garage' ? ['東和モータース', '山城自動車整備', '日の出オート'] : ['山崎精工', '東栄金属工業', '田中製作所'];
  const name = names[Math.abs(Math.round(p.weathering * 10) + p.bays.length) % names.length];
  const sign = makeTextSign(name, Math.min(5.8, p.building.width * 0.38), 0.86, 0xe7e2d6, p.archetype === 'service-garage' ? 0x174f78 : 0x283b43);
  g.add(at(sign, p.building.x - p.building.width * 0.2, p.building.y - p.building.depth / 2 - 0.21, p.building.height - 0.62));
}

function makeTextSign(text: string, w: number, h: number, bg: number, fg: number) {
  if (typeof document === 'undefined') return meshBox(w, h, 0.09, paintedSteelMaterial(bg), 1);
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 160;
  const c = canvas.getContext('2d')!; c.fillStyle = `#${bg.toString(16).padStart(6, '0')}`; c.fillRect(0, 0, canvas.width, canvas.height);
  c.strokeStyle = '#6b6b64'; c.lineWidth = 7; c.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  c.fillStyle = `#${fg.toString(16).padStart(6, '0')}`; c.font = '900 80px "Yu Gothic", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, canvas.width / 2, canvas.height / 2 + 3);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.09), [paintedSteelMaterial(), paintedSteelMaterial(), paintedSteelMaterial(), paintedSteelMaterial(), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }), paintedSteelMaterial()]); sign.castShadow = true; return sign;
}

function propMeshes(p: FactoryProp) {
  const group = new THREE.Group(); group.name = `fallback-${p.kind}`;
  if (p.kind === 'car') addCar(group);
  else if (p.kind === 'lift') { for (const x of [-1.3, 1.3]) { group.add(at(meshBox(0.2, 3.25, 0.34, safetyMaterial(), 1), x, 0, 1.63)); group.add(at(meshBox(0.62, 0.12, 0.78, steelMaterial(), 1), x, 0, 0.06)); } group.add(at(meshBox(2.8, 0.2, 0.22, safetyMaterial(), 1), 0, 0, 3.25)); }
  else if (p.kind === 'oil-drum') { group.add(at(cylinder(0.3, 0.88, redPaintMaterial(), 24), 0, 0, 0.44)); for (const z of [0.09, 0.44, 0.79]) group.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.018, 7, 24), steelMaterial()), 0, 0, z)); }
  else if (p.kind === 'tire-rack') addTireRack(group);
  else if (p.kind === 'pallet') { for (let i = 0; i < 6; i++) group.add(at(meshBox(0.18, 0.1, 1.05, timberMaterial(), 0.8), -0.52 + i * 0.21, 0, 0.16)); for (const x of [-0.48, 0, 0.48]) group.add(at(meshBox(0.16, 0.12, 0.82, timberMaterial(), 0.8), x, 0, 0.05)); }
  else if (p.kind === 'vending') addVending(group);
  else if (p.kind === 'ac') addAC(group);
  else if (p.kind === 'bollard') { group.add(at(cylinder(0.075, 0.82, safetyMaterial(), 16), 0, 0, 0.41)); group.add(at(cylinder(0.16, 0.05, steelMaterial(), 18), 0, 0, 0.025)); }
  else if (p.kind === 'sign') { group.add(at(meshBox(1.7, 0.8, 0.12, paintedSteelMaterial(0x22608a), 1), 0, 0, 2.7)); group.add(at(meshBox(0.1, 2.4, 0.1, steelMaterial(), 1), 0, 0, 1.2)); }
  group.position.set(p.x, p.z, toZ(p.y)); group.rotation.y = -THREE.MathUtils.degToRad(p.yawDeg); group.scale.setScalar(p.scale); return group;
}

function addCar(g: THREE.Group) {
  const paint = paintedSteelMaterial(0x365f79);
  g.add(at(meshRounded(1.82, 0.52, 4.28, paint, 0.16), 0, 0, 0.56));
  g.add(at(meshRounded(1.7, 0.3, 3.35, paint, 0.12), 0, 0.05, 0.86));
  const cabin = meshRounded(1.48, 0.62, 2.02, glassMaterial(), 0.16); g.add(at(cabin, 0, 0.05, 1.2));
  g.add(at(meshRounded(1.5, 0.08, 1.5, paint, 0.04), 0, 0.05, 1.53));
  for (const x of [-0.88, 0.88]) for (const y of [-1.3, 1.3]) { const wheel = cylinder(0.31, 0.18, rubberMaterial(), 18); wheel.rotation.z = Math.PI / 2; g.add(at(wheel, x, y, 0.34)); }
  for (const x of [-0.52, 0.52]) g.add(at(meshBox(0.36, 0.14, 0.04, warmLightMaterial(), 1), x, -2.1, 0.61));
  for (const x of [-0.58, 0.58]) g.add(at(meshBox(0.3, 0.13, 0.04, redPaintMaterial(), 1), x, 2.15, 0.59));
}
function addTireRack(g: THREE.Group) {
  for (const x of [-0.8, 0.8]) for (const y of [-0.3, 0.3]) g.add(at(meshBox(0.06, 1.8, 0.06, steelMaterial(), 1), x, y, 0.9));
  for (const z of [0.5, 1.18]) for (const x of [-0.58, -0.2, 0.2, 0.58]) { const tire = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.085, 8, 20), rubberMaterial()); tire.rotation.x = Math.PI / 2; g.add(at(tire, x, 0, z)); }
}
function addVending(g: THREE.Group) {
  g.add(at(meshBox(0.88, 1.88, 0.66, whitePaintMaterial(), 1), 0, 0, 0.94));
  g.add(at(meshBox(0.7, 0.92, 0.035, glassMaterial(), 1), 0, -0.35, 1.25));
  for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) g.add(at(meshBox(0.065, 0.13, 0.03, col % 2 ? whitePaintMaterial() : redPaintMaterial(), 1), -0.28 + col * 0.112, -0.375, 0.98 + row * 0.25));
  g.add(at(meshBox(0.5, 0.06, 0.04, redPaintMaterial(), 1), 0, -0.38, 1.78));
}
function addAC(g: THREE.Group) {
  g.add(at(meshBox(0.86, 0.62, 0.34, whitePaintMaterial(), 1), 0, 0, 0.34));
  const fan = cylinder(0.22, 0.035, paintedSteelMaterial(0x8a8f8e), 24); fan.rotation.z = Math.PI / 2; g.add(at(fan, 0, -0.19, 0.36));
}
function addACAt(g: THREE.Group, x: number, y: number, yawDeg: number) {
  const group = new THREE.Group(); addAC(group); group.position.set(x, 0, -y); group.rotation.y = -THREE.MathUtils.degToRad(yawDeg); g.add(group);
}

function addFence(g: THREE.Group, p: FactoryPlan) {
  const h = 1.45, material = fenceMaterial(), posts = paintedSteelMaterial(0x666d6e), ring = p.lot.ring;
  // Edge 0 is the road frontage and remains open; every other boundary follows
  // the actual parcel polygon rather than an enclosing rectangle.
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), yaw = Math.atan2(dy, dx);
    const panel = meshBox(len, h, 0.06, material, 1); panel.rotation.y = yaw; g.add(at(panel, (a.x + b.x) / 2, (a.y + b.y) / 2, h / 2));
    const count = Math.max(1, Math.ceil(len / 2));
    for (let j = 0; j <= count; j++) { const t = j / count; g.add(at(meshBox(0.07, h + 0.15, 0.07, posts, 1), a.x + dx * t, a.y + dy * t, (h + 0.15) / 2)); }
  }
}

export function disposeFactory(g: THREE.Group) {
  g.userData.disposed = true;
  g.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const materials = Array.isArray(m.material) ? m.material : [m.material]; materials.forEach((x) => { if (x && !['MeshStandardMaterial'].includes(x.name)) { /* cached materials intentionally live across regenerations */ } }); });
}
