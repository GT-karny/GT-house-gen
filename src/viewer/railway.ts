// Detailed Japanese 1,067 mm railway and automatic class-1 level crossing.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type {
  CrossingDevice, FenceSpan, RailStrip, RailwayPlan, TracksideCabinet, TracksidePost,
} from '../env/railway';
import type { Vec2 } from '../env/streetscape';
import { pbr } from './textures';
import { upgradeCrossingEquipment } from './railwayAssets';

const asphalt = pbr('asphalt', 1 / 3, { color: 0x3a3b3d, roughness: 1, side: THREE.DoubleSide });
const rubber = new THREE.MeshStandardMaterial({ color: 0x292b2d, roughness: 0.95, side: THREE.DoubleSide });
const ballastMat = pbr('gravel', 1 / 1.2, { color: 0x8a857b, roughness: 1 });
const concrete = pbr('concrete', 1 / 1.4, { color: 0xb8b5ad, roughness: 1 });
const poleConcrete = new THREE.MeshStandardMaterial({ color: 0xaaa9a4, roughness: 0.92 });
const cabinetMat = pbr('metal', 2.2, { color: 0xc3c4bc, roughness: 0.72, metalness: 0.72, metalnessMap: true, normalScale: 0.35 });
const darkMetal = pbr('metal', 2.6, { color: 0x242729, roughness: 0.55, metalness: 0.78, metalnessMap: true, normalScale: 0.42 });
const railRust = new THREE.MeshStandardMaterial({ color: 0x625047, roughness: 0.72, metalness: 0.62 });
const railHead = new THREE.MeshStandardMaterial({ color: 0xa7aaac, roughness: 0.28, metalness: 0.92 });
const whitePaint = new THREE.MeshStandardMaterial({ color: 0xe9e5d9, roughness: 0.8, side: THREE.DoubleSide });
const seamMat = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 1, side: THREE.DoubleSide });
const yellow = pbr('metal', 2.8, { color: 0xe4aa14, roughness: 0.59, metalness: 0.62, metalnessMap: true, normalScale: 0.32 });
const black = pbr('metal', 2.8, { color: 0x151719, roughness: 0.60, metalness: 0.70, metalnessMap: true, normalScale: 0.32 });
const redReflector = new THREE.MeshStandardMaterial({ color: 0xd5231d, emissive: 0x5f0400, emissiveIntensity: 0.9 });
const amber = new THREE.MeshStandardMaterial({ color: 0xffbd24, emissive: 0x8a4b00, emissiveIntensity: 1.5 });
const fenceMat = new THREE.MeshStandardMaterial({ color: 0x73797a, roughness: 0.65, metalness: 0.72 });
const fenceMeshMat = new THREE.MeshBasicMaterial({ color: 0x778080, wireframe: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
const ivoryPaint = pbr('metal', 2.4, { color: 0xe5e1d5, roughness: 0.54, metalness: 0.58, metalnessMap: true, normalScale: 0.28 });
const clearCover = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, transmission: 0.78, transparent: true, opacity: 0.38, thickness: 0.018 });
const stripeTexture = makeWarningStripeTexture();
const warningStripe = new THREE.MeshStandardMaterial({ map: stripeTexture, roughness: 0.52, metalness: 0.24 });
const signalPaint = pbr('metal', 2.8, { color: 0xffffff, roughness: 0.58, metalness: 0.68, metalnessMap: true, normalScale: 0.30 });
signalPaint.vertexColors = true;
const ledOff = new THREE.MeshPhysicalMaterial({ color: 0x350403, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06 });

function makeWarningStripeTexture(): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const yellowBand = ((x + y * 1.35) % 48) < 24;
    const i = (y * size + x) * 4;
    const c = yellowBand ? [226, 178, 25] : [19, 21, 22];
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Turn a pure plan into detailed track, crossing surfaces and Japanese safety equipment. */
export function railwayGroup(p: RailwayPlan): THREE.Group {
  const g = new THREE.Group();
  g.name = 'japanese-level-crossing';

  g.add(ballastBed(p.ballast));
  addSleepersAndFasteners(g, p);
  addCrossingSurface(g, p);
  for (const rail of p.rails) g.add(railProfile(rail));
  for (const check of p.checkRails) g.add(lineBox({ ...check, height: 0.045 }, 0.238, darkMetal));
  for (const line of p.stopLines) g.add(flatStrip(line, 0.030, whitePaint));
  g.add(cableTrough(p.cableTrough));
  for (const fence of p.fences) g.add(boundaryFence(fence));
  for (const cabinet of p.cabinets) g.add(tracksideCabinet(cabinet));
  for (const post of p.posts) g.add(tracksidePost(post, p.centerX, p.warningActive));
  if (p.electrified) g.add(catenaryWires(p));
  const fallbackDevices = p.devices.map((d) => crossingDevice(d, p.centerX));
  g.add(...fallbackDevices);
  upgradeCrossingEquipment(g, p.devices, fallbackDevices);

  return g;
}

function ballastBed(s: RailStrip): THREE.Mesh {
  const length = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  const top = s.width - 0.55, bottom = s.width + 0.45, h = 0.08;
  const shape = new THREE.Shape();
  shape.moveTo(-bottom / 2, 0);
  shape.lineTo(bottom / 2, 0);
  shape.lineTo(top / 2, h);
  shape.lineTo(-top / 2, h);
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  geom.translate(0, 0, -length / 2);
  const mesh = new THREE.Mesh(geom, ballastMat);
  mesh.position.set((s.a.x + s.b.x) / 2, 0.008, -(s.a.y + s.b.y) / 2);
  mesh.rotation.y = Math.atan2(s.b.x - s.a.x, s.b.y - s.a.y);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addSleepersAndFasteners(g: THREE.Group, p: RailwayPlan) {
  if (p.sleepers.length === 0) return;
  const s0 = p.sleepers[0];
  const sleeperMat = p.sleeperType === 'pc'
    ? new THREE.MeshStandardMaterial({ color: 0xb6b3aa, roughness: 0.93 })
    : new THREE.MeshStandardMaterial({ color: 0x55473b, roughness: 0.95 });
  const visibleSleeperH = Math.min(s0.height, 0.10);
  const sleeperGeom = new THREE.BoxGeometry(s0.length, visibleSleeperH, s0.width);
  const sleepers = new THREE.InstancedMesh(sleeperGeom, sleeperMat, p.sleepers.length);
  const matrix = new THREE.Matrix4();
  p.sleepers.forEach((s, i) => {
    matrix.makeTranslation(s.center.x, 0.085, -s.center.y);
    sleepers.setMatrixAt(i, matrix);
  });
  sleepers.castShadow = true;
  sleepers.receiveShadow = true;
  g.add(sleepers);

  const plates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.20, 0.025, 0.16), darkMetal, p.sleepers.length * 2);
  const clips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.045, 0.10), darkMetal, p.sleepers.length * 4);
  let pi = 0, ci = 0;
  for (const s of p.sleepers) {
    for (const rail of p.rails) {
      const rx = rail.a.x;
      matrix.makeTranslation(rx, 0.147, -s.center.y);
      plates.setMatrixAt(pi++, matrix);
      for (const side of [-1, 1]) {
        matrix.makeTranslation(rx + side * 0.085, 0.176, -s.center.y);
        clips.setMatrixAt(ci++, matrix);
      }
    }
  }
  plates.castShadow = true;
  clips.castShadow = true;
  g.add(plates, clips);
}

function addCrossingSurface(g: THREE.Group, p: RailwayPlan) {
  g.add(groundMesh(p.crossingDeck, 0.235, asphalt));
  const x0 = p.crossingDeck[0].x, x1 = p.crossingDeck[1].x;
  const panelInset = 0.16;
  g.add(groundMesh([
    { x: x0 + panelInset, y: p.deckMinY }, { x: x1 - panelInset, y: p.deckMinY },
    { x: x1 - panelInset, y: p.deckMaxY }, { x: x0 + panelInset, y: p.deckMaxY },
  ], 0.238, rubber));
  g.add(approachRamp(x0 - 1.8, x0, p.deckMinY, p.deckMaxY, 0.022, 0.235));
  g.add(approachRamp(x1, x1 + 1.8, p.deckMinY, p.deckMaxY, 0.235, 0.022));

  // Panel joints and black wheel-flange grooves are crucial visual cues.
  for (let y = p.deckMinY + 0.65; y < p.deckMaxY; y += 0.72) {
    g.add(flatStrip({ a: { x: x0 + 0.1, y }, b: { x: x1 - 0.1, y }, width: 0.025, height: 0.01 }, 0.241, seamMat));
  }
  for (const rail of p.rails) {
    g.add(flatStrip({
      a: { x: rail.a.x + (rail.a.x < p.centerX ? 0.075 : -0.075), y: p.deckMinY },
      b: { x: rail.a.x + (rail.a.x < p.centerX ? 0.075 : -0.075), y: p.deckMaxY },
      width: 0.075, height: 0.01,
    }, 0.243, seamMat));
  }

  // Restore road edge/centre markings over the crossing panels.
  const roadMid = p.stopLines[0].a.y;
  const near = p.stopLines[0].b.y;
  const far = p.stopLines[1].a.y;
  for (const y of [near, far]) {
    g.add(flatStrip({ a: { x: x0, y }, b: { x: x1, y }, width: 0.10, height: 0.01 }, 0.245, whitePaint));
  }
  const dashHalf = Math.min(0.55, (x1 - x0) * 0.22);
  g.add(flatStrip({ a: { x: p.centerX - dashHalf, y: roadMid }, b: { x: p.centerX + dashHalf, y: roadMid }, width: 0.09, height: 0.01 }, 0.245, whitePaint));
}

function railProfile(s: RailStrip): THREE.Group {
  const g = new THREE.Group();
  g.add(lineBox({ ...s, width: 0.13, height: 0.020 }, 0.157, railRust));
  g.add(lineBox({ ...s, width: 0.025, height: 0.060 }, 0.197, railRust));
  g.add(lineBox({ ...s, width: s.width, height: 0.045 }, 0.249, railHead));
  return g;
}

function approachRamp(x0: number, x1: number, y0: number, y1: number, h0: number, h1: number): THREE.Mesh {
  const vertices = new Float32Array([
    x0, h0, -y0, x1, h1, -y0, x1, h1, -y1, x0, h0, -y1,
  ]);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geom.setIndex([0, 1, 2, 0, 2, 3]);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, asphalt);
  mesh.receiveShadow = true;
  return mesh;
}

function cableTrough(s: RailStrip): THREE.Group {
  const g = new THREE.Group();
  const total = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  const count = Math.max(1, Math.floor(total / 0.58));
  const geom = new THREE.BoxGeometry(s.width, s.height, total / count - 0.018);
  const slabs = new THREE.InstancedMesh(geom, concrete, count);
  const ux = (s.b.x - s.a.x) / total, uy = (s.b.y - s.a.y) / total;
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const d = (i + 0.5) * total / count;
    matrix.makeTranslation(s.a.x + ux * d, 0.025 + s.height / 2, -(s.a.y + uy * d));
    slabs.setMatrixAt(i, matrix);
  }
  slabs.castShadow = true;
  slabs.receiveShadow = true;
  g.add(slabs);
  return g;
}

function boundaryFence(f: FenceSpan): THREE.Group {
  const g = new THREE.Group();
  const dx = f.b.x - f.a.x, dy = f.b.y - f.a.y;
  const length = Math.hypot(dx, dy);
  const cx = (f.a.x + f.b.x) / 2, cz = -(f.a.y + f.b.y) / 2;
  const angle = Math.atan2(dx, dy);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(length, f.height, Math.max(2, Math.ceil(length / 0.35)), 4), fenceMeshMat);
  panel.rotation.y = angle + Math.PI / 2;
  panel.position.set(cx, f.height / 2 + 0.08, cz);
  g.add(panel);
  const posts = Math.max(2, Math.ceil(length / 2) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, f.height + 0.18, 0.07), fenceMat);
    post.position.set(f.a.x + dx * t, (f.height + 0.18) / 2, -(f.a.y + dy * t));
    post.castShadow = true;
    g.add(post);
  }
  for (const h of [0.12, f.height]) {
    g.add(segmentBox(f.a, f.b, 0.045, 0.045, h, fenceMat));
  }
  return g;
}

function tracksideCabinet(c: TracksideCabinet): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(c.width + 0.18, 0.10, c.depth + 0.16), concrete);
  base.position.set(c.center.x, 0.05, -c.center.y);
  base.receiveShadow = true;
  g.add(base);
  const body = new THREE.Mesh(new THREE.BoxGeometry(c.width, c.height, c.depth), cabinetMat);
  body.position.set(c.center.x, 0.10 + c.height / 2, -c.center.y);
  body.castShadow = true;
  g.add(body);
  const frontX = c.center.x - c.width / 2 - 0.006;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.018, c.height * 0.78, c.depth * 0.82), cabinetMat);
  door.position.set(frontX, 0.12 + c.height / 2, -c.center.y);
  g.add(door);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.12, 0.025), darkMetal);
  handle.position.set(frontX - 0.018, 0.12 + c.height * 0.52, -c.center.y - c.depth * 0.27);
  g.add(handle);
  for (let i = -2; i <= 2; i++) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.018, c.depth * 0.48), darkMetal);
    vent.position.set(frontX - 0.014, 0.28 + (i + 2) * 0.045, -c.center.y);
    g.add(vent);
  }
  if (c.kind === 'power') {
    const warning = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.18, 0.16), yellow);
    warning.position.set(frontX - 0.018, 0.72, -c.center.y);
    g.add(warning);
  }
  return g;
}

function tracksidePost(p: TracksidePost, railX: number, warningActive: boolean): THREE.Group {
  if (p.kind === 'catenary') return catenaryMast(p, railX);
  if (p.kind === 'detector') return obstacleDetector(p, railX);
  if (p.kind === 'special-signal') return specialSignal(p, warningActive);
  return crossingLamp(p, railX);
}

function catenaryMast(p: TracksidePost, railX: number): THREE.Group {
  const g = new THREE.Group();
  const x = p.center.x, z = -p.center.y;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, p.height, 10), poleConcrete);
  pole.position.set(x, p.height / 2, z);
  pole.castShadow = true;
  g.add(pole);
  const armH = 6.45;
  const armEnd = railX + p.side * 0.15;
  g.add(segmentBox({ x, y: p.center.y }, { x: armEnd, y: p.center.y }, 0.07, 0.08, armH, darkMetal));
  const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(armEnd - x, 0.75), 8), darkMetal);
  const dx = armEnd - x;
  brace.position.set((x + armEnd) / 2, armH + 0.36, z);
  brace.rotation.z = Math.atan2(dx, 0.75);
  g.add(brace);
  for (const ix of [railX - 0.56, railX + 0.56]) {
    const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 8), new THREE.MeshStandardMaterial({ color: 0x73654d, roughness: 0.6 }));
    ins.position.set(ix, armH - 0.14, z);
    g.add(ins);
  }
  return g;
}

function catenaryWires(p: RailwayPlan): THREE.Group {
  const g = new THREE.Group();
  const y0 = p.ballast.a.y, y1 = p.ballast.b.y;
  const messenger = new THREE.MeshStandardMaterial({ color: 0x353637, roughness: 0.45, metalness: 0.75 });
  g.add(segmentBox({ x: p.centerX, y: y0 }, { x: p.centerX, y: y1 }, 0.018, 0.018, 6.05, messenger));
  g.add(segmentBox({ x: p.centerX, y: y0 }, { x: p.centerX, y: y1 }, 0.014, 0.014, 5.35, messenger));
  for (let y = Math.ceil(y0 / 4.5) * 4.5; y <= y1; y += 4.5) {
    const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.70, 6), messenger);
    drop.position.set(p.centerX, 5.70, -y);
    g.add(drop);
  }
  return g;
}

function obstacleDetector(p: TracksidePost, railX: number): THREE.Group {
  const g = new THREE.Group();
  const x = p.center.x, z = -p.center.y;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, p.height, 8), cabinetMat);
  pole.position.set(x, p.height / 2, z);
  g.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.20, 0.18), cabinetMat);
  head.position.set(x, p.height, z);
  head.rotation.y = x < railX ? -0.25 : 0.25;
  head.castShadow = true;
  g.add(head);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 12), black);
  lens.rotation.z = Math.PI / 2;
  lens.position.set(x + (x < railX ? 0.13 : -0.13), p.height, z);
  g.add(lens);
  return g;
}

function specialSignal(p: TracksidePost, warningActive: boolean): THREE.Group {
  const g = new THREE.Group();
  const x = p.center.x, z = -p.center.y;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, p.height, 9), cabinetMat);
  pole.position.set(x, p.height / 2, z);
  g.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.82, 0.13), black);
  head.position.set(x, p.height - 0.30, z);
  g.add(head);
  const positions = [[0, 0.22], [-0.17, 0.05], [0.17, 0.05], [-0.11, -0.18], [0.11, -0.18]];
  for (const [px, py] of positions) {
    const signalMat = new THREE.MeshStandardMaterial({ color: 0x68100e, emissive: 0xff1008, emissiveIntensity: warningActive ? 2.8 : 0.03 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 12), signalMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(x + px, p.height - 0.30 + py, z - 0.08);
    if (warningActive) {
      lamp.onBeforeRender = () => { signalMat.emissiveIntensity = Math.floor(performance.now() / 420) % 2 === 0 ? 3.2 : 0.04; };
    }
    g.add(lamp);
  }
  return g;
}

function crossingLamp(p: TracksidePost, railX: number): THREE.Group {
  const g = new THREE.Group();
  const x = p.center.x, z = -p.center.y;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, p.height, 8), cabinetMat);
  pole.position.set(x, p.height / 2, z);
  g.add(pole);
  const endX = railX;
  g.add(segmentBox({ x, y: p.center.y }, { x: endX, y: p.center.y }, 0.06, 0.06, p.height - 0.18, cabinetMat));
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.28), darkMetal);
  lamp.position.set(endX, p.height - 0.25, z);
  lamp.rotation.z = -0.25;
  g.add(lamp);
  return g;
}

function crossingDevice(d: CrossingDevice, railX: number): THREE.Group {
  const g = new THREE.Group();
  const x = d.center.x, z = -d.center.y;
  const facesWest = x < railX;
  const faceDirX = facesWest ? -1 : 1;
  const dirZ = -d.armDirY;

  g.add(warningAssembly(d, faceDirX));
  g.add(gateMachineAssembly(d, faceDirX));
  g.add(warningFence(x - faceDirX * 0.50, z + dirZ * 0.78, faceDirX));
  return g;
}

function warningAssembly(d: CrossingDevice, faceDirX: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'crossing-warning-assembly';
  const x = d.center.x, z = -d.center.y;
  const dirZ = -d.armDirY;

  const foundation = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.15, 0.48), concrete);
  foundation.position.set(x, 0.075, z);
  g.add(foundation);
  stripedMast(g, x, z, d.mastHeight, faceDirX);

  const lampY = d.mastHeight - 1.28;
  for (const [index, dy] of [0.23, -0.23].entries()) {
    g.add(gooseneckBracket(x, lampY + dy, z, faceDirX));
    g.add(warningLamp(x + faceDirX * 0.31, lampY + dy, z, faceDirX, index, d.warningActive));
  }

  g.add(warningHorn(x, d.mastHeight - 0.04, z, faceDirX));
  g.add(directionIndicator(x + faceDirX * 0.11, d.mastHeight - 2.05, z, faceDirX, d.warningActive));
  g.add(crossbuck(x, d.mastHeight - 0.42, z));
  g.add(emergencyButton(x, z - dirZ * 0.55, faceDirX));

  const mastCable = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.52, 8), black);
  mastCable.position.set(x - faceDirX * 0.095, 0.82, z);
  g.add(mastCable);
  return g;
}

function gateMachineAssembly(d: CrossingDevice, faceDirX: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'crossing-gate-machine';
  const gateX = d.gateCenter.x, gateZ = -d.gateCenter.y;
  const dirZ = -d.armDirY;

  const foundation = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.16, 0.62), concrete);
  foundation.position.set(gateX, 0.08, gateZ);
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  g.add(foundation);

  const cabinet = stripedCabinet(faceDirX);
  cabinet.position.set(gateX, 0, gateZ);
  g.add(cabinet);

  const pivotY = 1.08;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.64, 32), darkMetal);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.set(gateX, pivotY, gateZ);
  shaft.castShadow = true;
  g.add(shaft);
  for (const side of [-1, 1]) {
    const bearing = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.023, 10, 32), cabinetMat);
    bearing.rotation.y = Math.PI / 2;
    bearing.position.set(gateX + side * 0.26, pivotY, gateZ);
    g.add(bearing);
  }

  // Arm, crank and counterweight rotate as one mechanical output assembly.
  const drive = new THREE.Group();
  drive.name = 'gate-output-crank';
  drive.position.set(gateX, pivotY, gateZ);
  const arm = stripedBarrier(d.armLength, d.armDirY, faceDirX);
  drive.add(arm);
  const crank = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.14, 0.62, 4, 0.035), darkMetal);
  crank.position.z = -dirZ * 0.28;
  drive.add(crank);
  const counterweight = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.32, 0.24, 5, 0.045), darkMetal);
  counterweight.position.set(0, -0.05, -dirZ * 0.55);
  counterweight.castShadow = true;
  drive.add(counterweight);
  const crankPin = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.18, 16), cabinetMat);
  crankPin.rotation.z = Math.PI / 2;
  crankPin.position.set(faceDirX * 0.10, 0, -dirZ * 0.42);
  drive.add(crankPin);

  const raisedAngle = -dirZ * THREE.MathUtils.degToRad(72);
  const fromAngle = d.barrierClosed ? raisedAngle : 0;
  const toAngle = d.barrierClosed ? 0 : raisedAngle;
  drive.rotation.x = fromAngle;
  const animationStart = performance.now();
  const animationDriver = arm.children[0] as THREE.Mesh;
  animationDriver.onBeforeRender = () => {
    const duration = d.barrierClosed ? 6000 : 4800;
    const t = Math.min(1, (performance.now() - animationStart) / duration);
    const eased = t * t * (3 - 2 * t);
    drive.rotation.x = THREE.MathUtils.lerp(fromAngle, toAngle, eased);
  };
  g.add(drive);

  // External limit linkage and flexible electrical conduit.
  const linkage = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.42, 0.055, 3, 0.012), darkMetal);
  linkage.position.set(gateX + faceDirX * 0.24, 0.83, gateZ - dirZ * 0.16);
  linkage.rotation.x = dirZ * 0.38;
  g.add(linkage);
  const conduitCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(gateX - faceDirX * 0.18, 0.16, gateZ + 0.20),
    new THREE.Vector3(gateX - faceDirX * 0.32, 0.25, gateZ + 0.24),
    new THREE.Vector3(gateX - faceDirX * 0.27, 0.55, gateZ + 0.22),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(conduitCurve, 20, 0.018, 8, false), black));

  // A short guard rail protects the completely separate drive foundation.
  const guard = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.70, 0.06, 3, 0.015), yellow);
  guard.position.set(gateX - faceDirX * 0.48, 0.35, gateZ - dirZ * 0.32);
  g.add(guard);
  return g;
}

function stripedMast(g: THREE.Group, x: number, z: number, height: number, faceDirX: number) {
  const mast = new THREE.Mesh(bandedCylinderGeometry(0.076, 0.092, height, 15), signalPaint);
  mast.position.set(x, height / 2, z);
  mast.castShadow = true;
  g.add(mast);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.21, 0.42, 24), black);
  pedestal.position.set(x, 0.30, z);
  pedestal.castShadow = true;
  g.add(pedestal);
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.045, 24), darkMetal);
  flange.position.set(x, 0.13, z);
  g.add(flange);
  for (const [bx, bz] of [[-0.12, -0.10], [-0.12, 0.10], [0.12, -0.10], [0.12, 0.10]]) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.035, 8), darkMetal);
    bolt.position.set(x + bx, 0.145, z + bz);
    g.add(bolt);
  }
  // Maintenance ladder, fixing collars and exposed conduit visible on Japanese masts.
  const ladderX = x - faceDirX * 0.13;
  const ladderHeight = height - 0.72;
  for (const dz of [-0.17, 0.17]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, ladderHeight, 8), cabinetMat);
    rail.position.set(ladderX, 0.28 + ladderHeight / 2, z + dz);
    g.add(rail);
  }
  for (let y = 0.38; y <= height - 0.48; y += 0.27) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 8), cabinetMat);
    rung.rotation.x = Math.PI / 2;
    rung.position.set(ladderX, y, z);
    g.add(rung);
  }
  for (const y of [0.72, height - 2.05, height - 1.28, height - 0.42]) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.090, 0.012, 6, 20), darkMetal);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(x, y, z);
    g.add(collar);
  }
}

function bandedCylinderGeometry(topRadius: number, bottomRadius: number, height: number, bands: number): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 32, bands, false).toNonIndexed();
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const yellowColor = new THREE.Color(0xe1a817);
  const blackColor = new THREE.Color(0x121416);
  for (let triangle = 0; triangle < positions.count; triangle += 3) {
    const avgY = (positions.getY(triangle) + positions.getY(triangle + 1) + positions.getY(triangle + 2)) / 3;
    const band = Math.max(0, Math.min(bands - 1, Math.floor(((avgY + height / 2) / height) * bands)));
    const color = band % 2 === 0 ? blackColor : yellowColor;
    for (let v = 0; v < 3; v++) {
      colors[(triangle + v) * 3] = color.r;
      colors[(triangle + v) * 3 + 1] = color.g;
      colors[(triangle + v) * 3 + 2] = color.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function warningLamp(x: number, y: number, z: number, faceDirX: number, phase: number, active: boolean): THREE.Group {
  const g = new THREE.Group();
  const housing = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.35, 0.39, 5, 0.055), black);
  housing.position.set(x, y, z);
  housing.castShadow = true;
  g.add(housing);
  const frontX = x + faceDirX * 0.122;
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.139, 0.018, 10, 36), darkMetal);
  bezel.rotation.y = Math.PI / 2;
  bezel.position.set(frontX, y, z);
  g.add(bezel);
  const lampMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x6d100d, emissive: 0xff0800, emissiveIntensity: active ? 3.8 : 0.06,
    roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08,
  });
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.132, 0.030, 36), lampMaterial);
  lens.rotation.z = Math.PI / 2;
  lens.position.set(frontX + faceDirX * 0.012, y, z);
  g.add(lens);
  const pixels = new THREE.Group();
  for (let iy = -4; iy <= 4; iy++) for (let iz = -4; iz <= 4; iz++) {
    if (iy * iy + iz * iz > 17) continue;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 8, 6), ledOff);
    dot.position.set(frontX + faceDirX * 0.031, y + iy * 0.024, z + iz * 0.024);
    pixels.add(dot);
  }
  g.add(pixels);
  if (active) lens.onBeforeRender = () => {
    const lit = Math.floor(performance.now() / 430) % 2 === phase;
    lampMaterial.emissiveIntensity = lit ? 4.5 : 0.05;
    pixels.visible = lit;
  };
  const visor = new THREE.Mesh(new RoundedBoxGeometry(0.25, 0.060, 0.42, 3, 0.025), black);
  visor.position.set(x + faceDirX * 0.14, y + 0.185, z);
  visor.rotation.z = faceDirX * -0.08;
  g.add(visor);
  return g;
}

function gooseneckBracket(x: number, y: number, z: number, faceDirX: number): THREE.Group {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, y + 0.13, z),
    new THREE.Vector3(x + faceDirX * 0.12, y + 0.13, z),
    new THREE.Vector3(x + faceDirX * 0.17, y + 0.05, z),
    new THREE.Vector3(x + faceDirX * 0.20, y, z),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.018, 8, false), darkMetal));
  const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.013, 6, 20), darkMetal);
  clamp.rotation.x = Math.PI / 2;
  clamp.position.set(x, y + 0.13, z);
  g.add(clamp);
  return g;
}

function warningHorn(x: number, y: number, z: number, faceDirX: number): THREE.Group {
  const g = new THREE.Group();
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.155, 0.30, 24, 1, true), ivoryPaint);
  horn.rotation.z = Math.PI / 2;
  horn.position.set(x + faceDirX * 0.20, y, z);
  g.add(horn);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.158, 0.018, 24), ivoryPaint);
  cap.rotation.z = Math.PI / 2;
  cap.position.set(x + faceDirX * 0.35, y, z);
  g.add(cap);
  const bracket = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.035, 0.035, 2, 0.008), darkMetal);
  bracket.position.set(x + faceDirX * 0.07, y - 0.12, z);
  bracket.rotation.z = faceDirX * -0.65;
  g.add(bracket);
  return g;
}

function directionIndicator(x: number, y: number, z: number, faceDirX: number, active: boolean): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.38, 0.66, 3, 0.035), black);
  box.position.set(x, y, z);
  g.add(box);
  for (const dir of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.17, -0.045); shape.lineTo(0.05, -0.045); shape.lineTo(0.05, -0.11);
    shape.lineTo(0.19, 0); shape.lineTo(0.05, 0.11); shape.lineTo(0.05, 0.045); shape.lineTo(-0.17, 0.045); shape.closePath();
    const arrowMat = new THREE.MeshStandardMaterial({
      color: active ? 0xf1241b : 0x4b1712,
      emissive: 0xe5160e,
      emissiveIntensity: active ? 2.7 : 0.03,
      roughness: 0.35,
    });
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), arrowMat);
    arrow.rotation.y = faceDirX > 0 ? Math.PI / 2 : -Math.PI / 2;
    arrow.rotation.x = dir < 0 ? Math.PI : 0;
    arrow.position.set(x + faceDirX * 0.071, y + dir * 0.085, z);
    g.add(arrow);
  }
  return g;
}

function emergencyButton(x: number, z: number, faceDirX: number): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.045, 1.40, 10), cabinetMat);
  post.position.set(x, 0.70, z);
  g.add(post);
  const enclosure = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.58, 0.38, 4, 0.035), ivoryPaint);
  enclosure.position.set(x, 1.25, z);
  enclosure.castShadow = true;
  g.add(enclosure);
  const face = labelPlane(0.35, 0.53, faceDirX, emergencyLabelMaterial());
  face.position.set(x + faceDirX * 0.071, 1.25, z);
  g.add(face);
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.045, 24), redReflector);
  button.rotation.z = Math.PI / 2;
  button.position.set(x + faceDirX * 0.092, 1.18, z);
  g.add(button);
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.060, 32), clearCover);
  cover.rotation.z = Math.PI / 2;
  cover.position.set(x + faceDirX * 0.115, 1.18, z);
  g.add(cover);
  const status = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.025, 16), amber);
  status.rotation.z = Math.PI / 2;
  status.position.set(x + faceDirX * 0.088, 1.02, z);
  g.add(status);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.62, 8), black);
  cable.position.set(x - faceDirX * 0.065, 0.49, z);
  g.add(cable);
  return g;
}

function crossbuck(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  for (const angle of [-Math.PI / 4, Math.PI / 4]) {
    const board = new THREE.Group();
    const segmentCount = 7;
    const segmentLength = 0.165;
    for (let i = 0; i < segmentCount; i++) {
      const segment = new THREE.Mesh(
        new RoundedBoxGeometry(0.042, 0.155, segmentLength + 0.008, 3, 0.012),
        i % 2 === 0 ? yellow : black,
      );
      segment.position.z = (i - (segmentCount - 1) / 2) * segmentLength;
      segment.castShadow = true;
      board.add(segment);
    }
    board.rotation.x = angle;
    g.add(board);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.075, 20), yellow);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  const fastener = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.086, 10), darkMetal);
  fastener.rotation.z = Math.PI / 2;
  fastener.position.x = 0.006;
  g.add(fastener);
  return g;
}

function stripedCabinet(faceDirX: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sc-gate-cabinet';
  const w = 0.405, h = 1.065, d = 0.275;
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 6, 0.045), cabinetMat);
  body.position.y = 0.16 + h / 2;
  body.castShadow = true;
  g.add(body);
  const doorBack = new THREE.Mesh(new RoundedBoxGeometry(0.020, 0.84, d * 0.84, 3, 0.012), darkMetal);
  doorBack.position.set(faceDirX * (w / 2 + 0.010), 0.67, 0);
  g.add(doorBack);
  const door = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.80, d * 0.78, 3, 0.010), ivoryPaint);
  door.position.set(faceDirX * (w / 2 + 0.024), 0.67, 0);
  g.add(door);
  for (const y of [0.42, 0.91]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.085, 10), darkMetal);
    hinge.position.set(faceDirX * (w / 2 + 0.042), y, -d * 0.32);
    g.add(hinge);
  }
  const handle = new THREE.Mesh(new RoundedBoxGeometry(0.035, 0.13, 0.035, 2, 0.008), darkMetal);
  handle.position.set(faceDirX * (w / 2 + 0.045), 0.66, d * 0.22);
  g.add(handle);
  const gearbox = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.18, 0.24, 4, 0.045), darkMetal);
  gearbox.position.y = 1.13;
  gearbox.castShadow = true;
  g.add(gearbox);
  const manualRelease = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.025, 20), cabinetMat);
  manualRelease.rotation.z = Math.PI / 2;
  manualRelease.position.set(faceDirX * (w / 2 + 0.052), 0.39, 0.035);
  g.add(manualRelease);
  for (let i = -2; i <= 2; i++) {
    const rib = new THREE.Mesh(new RoundedBoxGeometry(0.018, 0.050, 0.19, 2, 0.006), darkMetal);
    rib.position.set(-faceDirX * (w / 2 + 0.013), 0.55 + i * 0.09, 0);
    g.add(rib);
  }
  // The high-visibility diagonal panel is a separate guard, not the machine enclosure.
  const hazardPlate = new THREE.Mesh(new RoundedBoxGeometry(0.030, 0.72, 0.34, 4, 0.025), warningStripe);
  hazardPlate.position.set(-faceDirX * (w / 2 + 0.080), 0.54, 0);
  hazardPlate.rotation.z = faceDirX * 0.12;
  hazardPlate.castShadow = true;
  g.add(hazardPlate);
  for (const y of [0.24, 0.84]) {
    const spacer = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 10), darkMetal);
    spacer.rotation.z = Math.PI / 2;
    spacer.position.set(-faceDirX * (w / 2 + 0.035), y, 0);
    g.add(spacer);
  }
  const idPlate = labelPlane(0.16, 0.08, faceDirX, simpleLabelMaterial('SC形', '#e8e6dc', '#222222'));
  idPlate.position.set(faceDirX * (w / 2 + 0.050), 0.91, 0);
  g.add(idPlate);
  for (const [bx, bz] of [[-0.27, -0.22], [-0.27, 0.22], [0.27, -0.22], [0.27, 0.22]]) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.035, 8), darkMetal);
    bolt.position.set(bx, 0.18, bz);
    g.add(bolt);
  }
  return g;
}

function stripedBarrier(length: number, armDirY: -1 | 1, faceDirX: number): THREE.Group {
  const g = new THREE.Group();
  const dirZ = -armDirY;
  const pieces = Math.max(10, Math.ceil(length / 0.30));
  const pieceL = length / pieces;
  for (let i = 0; i < pieces; i++) {
    const piece = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, pieceL + 0.010, 16), i % 2 === 0 ? yellow : black);
    piece.rotation.x = Math.PI / 2;
    piece.position.z = dirZ * (i + 0.5) * pieceL;
    piece.castShadow = true;
    g.add(piece);
    if (i > 0 && i % 2 === 0) {
      const reflector = new THREE.Mesh(new THREE.SphereGeometry(0.043, 12, 8), redReflector);
      reflector.position.set(faceDirX * 0.043, 0, dirZ * (i + 0.5) * pieceL);
      g.add(reflector);
    }
  }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.064, 16, 10), redReflector);
  tip.position.z = dirZ * length;
  g.add(tip);
  if (length > 1.6) {
    const signBox = new THREE.Mesh(new RoundedBoxGeometry(0.025, 0.18, 0.72, 3, 0.02), ivoryPaint);
    signBox.position.set(faceDirX * 0.062, -0.02, dirZ * Math.min(1.15, length * 0.38));
    g.add(signBox);
    const sign = labelPlane(0.68, 0.15, faceDirX, barrierLabelMaterial());
    sign.position.set(faceDirX * 0.078, -0.02, dirZ * Math.min(1.15, length * 0.38));
    g.add(sign);
  }
  return g;
}

function labelPlane(width: number, height: number, faceDirX: number, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.rotation.y = faceDirX > 0 ? Math.PI / 2 : -Math.PI / 2;
  return mesh;
}

function emergencyLabelMaterial(): THREE.Material {
  return canvasLabelMaterial(512, 768, (ctx, w, h) => {
    ctx.fillStyle = '#f2f0e7'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#cf1f18'; ctx.lineWidth = 22; ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.fillStyle = '#cf1f18'; ctx.fillRect(20, 20, w - 40, 190);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 82px "Yu Gothic", "Meiryo", sans-serif'; ctx.fillText('非常ボタン', w / 2, 112);
    ctx.fillStyle = '#111111'; ctx.font = 'bold 48px "Yu Gothic", "Meiryo", sans-serif';
    ctx.fillText('列車非常停止', w / 2, 268);
    ctx.font = 'bold 39px "Yu Gothic", "Meiryo", sans-serif'; ctx.fillText('強く押す', w / 2, 650);
    ctx.fillStyle = '#cf1f18';
    ctx.beginPath(); ctx.moveTo(w / 2, 592); ctx.lineTo(w / 2 - 42, 535); ctx.lineTo(w / 2 + 42, 535); ctx.closePath(); ctx.fill();
  }, 0xf2f0e7);
}

function barrierLabelMaterial(): THREE.Material {
  return canvasLabelMaterial(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f7f5ed'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d32720'; ctx.lineWidth = 18; ctx.strokeRect(9, 9, w - 18, h - 18);
    ctx.fillStyle = '#171717'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 82px "Yu Gothic", "Meiryo", sans-serif'; ctx.fillText('さおを押して脱出', w / 2, h / 2);
  }, 0xf7f5ed);
}

function simpleLabelMaterial(textValue: string, background: string, foreground: string): THREE.Material {
  return canvasLabelMaterial(512, 256, (ctx, w, h) => {
    ctx.fillStyle = background; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#4b4b49'; ctx.lineWidth = 12; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = foreground; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 112px "Yu Gothic", "Meiryo", sans-serif'; ctx.fillText(textValue, w / 2, h / 2);
  }, 0xe8e6dc);
}

function canvasLabelMaterial(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  fallbackColor: number,
): THREE.Material {
  if (typeof document === 'undefined') {
    const fallback = new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: 0.65, side: THREE.DoubleSide });
    fallback.userData.railwayDisposable = true;
    return fallback;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: 0.65, side: THREE.DoubleSide });
    fallback.userData.railwayDisposable = true;
    return fallback;
  }
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: false });
  mat.userData.railwayDisposable = true;
  return mat;
}

function warningFence(x: number, z: number, faceDirX: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = -1; i <= 1; i++) {
    const px = x + faceDirX * i * 0.35;
    for (let j = 0; j < 5; j++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.07), j % 2 === 0 ? yellow : black);
      seg.position.set(px, 0.08 + j * 0.16, z);
      g.add(seg);
    }
  }
  for (const h of [0.26, 0.65]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.06), yellow);
    rail.position.set(x, h, z);
    g.add(rail);
  }
  return g;
}

function lineBox(s: RailStrip, centerH: number, mat: THREE.Material): THREE.Mesh {
  return segmentBox(s.a, s.b, s.width, s.height, centerH, mat);
}

function segmentBox(a: Vec2, b: Vec2, width: number, height: number, centerH: number, mat: THREE.Material): THREE.Mesh {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), mat);
  mesh.position.set((a.x + b.x) / 2, centerH, -(a.y + b.y) / 2);
  mesh.rotation.y = Math.atan2(dx, dy);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function groundMesh(ring: Vec2[], h: number, mat: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  ring.forEach((pt, i) => (i === 0 ? shape.moveTo(pt.x, pt.y) : shape.lineTo(pt.x, pt.y)));
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = h;
  mesh.receiveShadow = true;
  return mesh;
}

function flatStrip(s: RailStrip, h: number, mat: THREE.Material): THREE.Mesh {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * s.width / 2, ny = (dx / length) * s.width / 2;
  return groundMesh([
    { x: s.a.x + nx, y: s.a.y + ny }, { x: s.b.x + nx, y: s.b.y + ny },
    { x: s.b.x - nx, y: s.b.y - ny }, { x: s.a.x - nx, y: s.a.y - ny },
  ], h, mat);
}

export function disposeRailway(group: THREE.Group) {
  group.userData.disposed = true;
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const mat of materials) if (mat.userData.railwayDisposable) {
      const mapped = mat as THREE.MeshBasicMaterial;
      if (mapped.map) mapped.map.dispose();
      mat.dispose();
    }
  });
}
