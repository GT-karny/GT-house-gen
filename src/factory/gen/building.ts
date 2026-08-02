import { rand01 } from '../../shared/rng';
import type { FactoryAnnex, FactoryBay, FactoryConfig, FactoryParkingStall, FactoryPlan, FactoryProp, FactoryPropKind, Vec2 } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
interface Rect { x: number; y: number; width: number; depth: number }
const overlaps = (a: Rect, b: Rect, gap = 0) => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap && Math.abs(a.y - b.y) < (a.depth + b.depth) / 2 + gap;

export function generateFactory(input: FactoryConfig): FactoryPlan {
  const c = resolveSeedLayout(input), edge = Math.max(0.5, c.sideSetback);
  const ring = makeLotRing(c.lotWidth, c.lotDepth, c.lotShape, c.seed), lotArea = polygonArea(ring);
  const desiredWidth = c.randomizeLayout ? adaptiveWidth(c) : c.buildingWidth;
  const desiredDepth = c.randomizeLayout ? adaptiveDepth(c) : c.buildingDepth;
  const main = placeMain(c, ring, edge, desiredWidth, desiredDepth);
  const { x, y, width, depth } = main, yardDepth = Math.max(0, y - depth / 2);
  const maxUnits = Math.max(1, Math.floor(width / Math.max(2.4, c.unitWidth)));
  const desiredUnits = c.randomizeLayout ? Math.round(width / Math.max(2.7, c.unitWidth)) : Math.round(c.unitCount);
  const count = clamp(desiredUnits, 1, maxUnits), bayW = width / count;
  const bays: FactoryBay[] = [];
  for (let i = 0; i < count; i++) {
    const office = c.archetype !== 'rental-garage' && i === count - 1 && c.officeRatio > 0.05;
    bays.push({ index: i, centerX: x - width / 2 + bayW * (i + 0.5), width: bayW,
      module: office ? (rand01(c.seed, 20, i) < 0.45 ? 'personnel-door' : 'window') : 'shutter',
      shutterOpen: office ? 0 : (rand01(c.seed, 21, i) < c.shutterOpenRate ? 0.72 + rand01(c.seed, 22, i) * 0.28 : 0) });
  }

  const annexes = planOffice(c, main, ring, edge);
  if (c.randomizeLayout) {
    const residual = Math.max(0, lotArea - width * depth - annexes.reduce((sum, a) => sum + a.width * a.depth, 0));
    const fill = c.archetype === 'rental-garage' ? 0.62 : c.archetype === 'service-garage' ? 0.48 : 0.35;
    c.parkingCount = clamp(Math.max(c.parkingCount, Math.floor((residual * fill) / 18)), 0, 24);
  }
  const parking = planParking(c, [main, ...annexes], ring, edge);
  const props: FactoryProp[] = [];
  const add = (kind: FactoryPropKind, px: number, py: number, yawDeg = 0, scale = 1) => props.push({ kind, x: px, y: py, z: 0, yawDeg, scale });
  const front = y - depth / 2;
  for (const bay of bays) {
    const r = rand01(c.seed, 40, bay.index);
    if (bay.module === 'shutter' && r < c.equipmentDensity) {
      if (c.archetype === 'service-garage') add('lift', bay.centerX, front + Math.min(3, depth * 0.25), 0, 1);
      else if (c.archetype === 'town-factory') add(r < 0.35 ? 'pallet' : 'oil-drum', bay.centerX + bayW * 0.25, Math.max(edge + 0.6, front - 1.0), 0, 0.9);
    }
  }
  for (const stall of parking) if (stall.occupied) add('car', stall.x, stall.y, stall.yawDeg, 0.92);
  if (c.archetype === 'service-garage') { add('tire-rack', x - width / 2 + 1.1, front + 1.0, 0, 1); add('sign', x + width / 2 - 1.2, Math.max(edge + 0.4, front - 0.3), 0, 1); }
  if (c.archetype === 'town-factory') { add('vending', x + width / 2 - 0.6, Math.max(edge + 0.4, front - 0.45), 0, 0.9); add('ac', x - width / 2 - 0.35, y + depth * 0.15, 90, 1); }
  if (c.archetype === 'rental-garage') for (let i = 0; i < count; i += 2) add('bollard', bays[i].centerX - bayW * 0.42, Math.max(edge + 0.3, front - 0.4), 0, 1);

  return { archetype: c.archetype, roof: c.roof, roofPitch: clamp(c.roofPitch, 0.03, 0.6),
    lot: { width: c.lotWidth, depth: c.lotDepth, shape: c.lotShape, ring, area: lotArea },
    building: { x, y, width, depth, height: c.clearHeight * c.floors, floors: c.floors }, yardDepth, bays, annexes, parking, props, fence: c.fence, weathering: c.weathering };
}

function resolveSeedLayout(input: FactoryConfig): FactoryConfig {
  const c = { ...input };
  if (!c.randomizeLayout) return c;
  const depthChoices = c.archetype === 'rental-garage' ? ['rear', 'rear', 'center'] as const : ['front', 'center', 'rear'] as const;
  const sideChoices = ['left', 'center', 'right'] as const;
  c.depthPlacement = depthChoices[Math.floor(rand01(c.seed, 201) * depthChoices.length)];
  c.sidePlacement = sideChoices[Math.floor(rand01(c.seed, 202) * sideChoices.length)];
  c.clearHeight *= 0.9 + rand01(c.seed, 205) * 0.2;
  const shapeScale = c.lotShape === 'rectangle' ? 1 : c.lotShape === 'chamfered' ? 0.96 : 0.9;
  c.officeWidth = clamp(c.lotWidth * (0.13 + rand01(c.seed, 207) * 0.05) * shapeScale, 3.2, 8.5);
  c.officeDepth = clamp(c.lotDepth * (0.14 + rand01(c.seed, 208) * 0.08) * shapeScale, 4, 9.5);
  c.parkingCount = Math.max(0, Math.round(c.parkingCount * (0.6 + rand01(c.seed, 209) * 0.8)));
  return c;
}

function adaptiveWidth(c: FactoryConfig) {
  const ranges = c.archetype === 'rental-garage' ? [0.68, 0.88] : c.archetype === 'service-garage' ? [0.58, 0.76] : [0.56, 0.74];
  const shapeScale = c.lotShape === 'rectangle' ? 1 : c.lotShape === 'chamfered' ? 0.96 : c.lotShape === 'trapezoid' ? 0.94 : 0.88;
  return c.lotWidth * (ranges[0] + rand01(c.seed, 203) * (ranges[1] - ranges[0])) * shapeScale;
}
function adaptiveDepth(c: FactoryConfig) {
  const ranges = c.archetype === 'rental-garage' ? [0.28, 0.4] : c.archetype === 'service-garage' ? [0.42, 0.58] : [0.45, 0.62];
  const shapeScale = c.lotShape === 'rectangle' ? 1 : c.lotShape === 'chamfered' ? 0.97 : c.lotShape === 'trapezoid' ? 0.94 : 0.9;
  return c.lotDepth * (ranges[0] + rand01(c.seed, 204) * (ranges[1] - ranges[0])) * shapeScale;
}

function placeMain(c: FactoryConfig, ring: Vec2[], edge: number, desiredW: number, desiredD: number): Rect {
  let width = clamp(desiredW, 5, c.lotWidth - edge * 2), depth = clamp(desiredD, 5, c.lotDepth - edge * 2);
  for (let attempt = 0; attempt < 20; attempt++) {
    const left = -c.lotWidth / 2 + edge + width / 2;
    const right = c.lotWidth / 2 - edge - width / 2;
    const front = edge + depth / 2;
    const rear = c.lotDepth - edge - depth / 2;
    const xs = c.sidePlacement === 'left' ? [left, 0, right] : c.sidePlacement === 'right' ? [right, 0, left] : [0, left, right];
    const ys = c.depthPlacement === 'front' ? [front, c.lotDepth / 2, rear] : c.depthPlacement === 'rear' ? [rear, c.lotDepth / 2, front] : [c.lotDepth / 2, rear, front];
    for (const py of ys) for (const px of xs) {
      const rect = { x: px, y: py, width, depth };
      if (rectInsideLot(rect, ring, 0.02)) return rect;
    }
    width = Math.max(5, width * 0.96); depth = Math.max(5, depth * 0.96);
  }
  // Conservative centred fallback for extremely narrow/irregular inputs.
  let fallback: Rect = { x: 0, y: c.lotDepth / 2, width: Math.min(width, c.lotWidth * 0.55), depth: Math.min(depth, c.lotDepth * 0.55) };
  while (!rectInsideLot(fallback, ring, 0.02) && fallback.width > 3.2 && fallback.depth > 3.2) fallback = { ...fallback, width: fallback.width * 0.92, depth: fallback.depth * 0.92 };
  return fallback;
}

function planOffice(c: FactoryConfig, main: Rect, ring: Vec2[], edge: number): FactoryAnnex[] {
  if (!c.detachedOffice) return [];
  const width = clamp(c.officeWidth, 3, Math.max(3, c.lotWidth - edge * 2)), depth = clamp(c.officeDepth, 3.5, Math.max(3.5, c.lotDepth - edge * 2));
  const left = -c.lotWidth / 2 + edge + width / 2, right = c.lotWidth / 2 - edge - width / 2;
  const front = edge + depth / 2, rear = c.lotDepth - edge - depth / 2;
  const sideOrder = c.sidePlacement === 'left' ? [right, left] : c.sidePlacement === 'right' ? [left, right] : [left, right];
  const candidates: Rect[] = [...sideOrder.map((px) => ({ x: px, y: main.y, width, depth })), ...sideOrder.map((px) => ({ x: px, y: front, width, depth })), ...sideOrder.map((px) => ({ x: px, y: rear, width, depth }))];
  const chosen = candidates.find((r) => rectInsideLot(r, ring, 0.02) && !overlaps(r, main, 0.7));
  return chosen ? [{ kind: 'office', ...chosen, height: 3.15 }] : [];
}

function planParking(c: FactoryConfig, blocked: Rect[], ring: Vec2[], edge: number): FactoryParkingStall[] {
  const target = Math.max(0, Math.round(c.parkingCount)), width = 2.5, depth = 5.0, out: FactoryParkingStall[] = [];
  for (let row = 0; row < Math.max(1, Math.floor((c.lotDepth - edge * 2) / (depth + 0.75))); row++) {
    const y = edge + depth / 2 + row * (depth + 0.75);
    for (let x = -c.lotWidth / 2 + edge + width / 2; x <= c.lotWidth / 2 - edge - width / 2 + 1e-6; x += 0.25) {
      const rect = { x, y, width, depth };
      if (!rectInsideLot(rect, ring, 0.02) || blocked.some((b) => overlaps(rect, b, 0.2)) || out.some((s) => overlaps(rect, s, 0.15))) continue;
      out.push({ ...rect, yawDeg: 0, occupied: rand01(c.seed, 90, out.length) < (c.archetype === 'rental-garage' ? 0.35 : 0.55) });
      if (out.length >= target) return out;
    }
  }
  return out;
}

export function makeLotRing(width: number, depth: number, shape: FactoryConfig['lotShape'], seed: number): Vec2[] {
  const l = -width / 2, r = width / 2;
  if (shape === 'chamfered') { const cut = Math.min(width, depth) * (0.14 + rand01(seed, 301) * 0.08); return [{ x: l, y: 0 }, { x: r - cut, y: 0 }, { x: r, y: cut }, { x: r, y: depth }, { x: l, y: depth }]; }
  if (shape === 'trapezoid') { const inset = width * (0.1 + rand01(seed, 302) * 0.08), shift = (rand01(seed, 303) - 0.5) * width * 0.08; return [{ x: l, y: 0 }, { x: r, y: 0 }, { x: r - inset + shift, y: depth }, { x: l + inset + shift, y: depth }]; }
  if (shape === 'irregular') { const a = width * 0.1, s = (rand01(seed, 304) - 0.5) * width * 0.08; return [{ x: l, y: 0 }, { x: r - a * 0.35, y: 0 }, { x: r, y: depth * 0.38 }, { x: r - a + s, y: depth }, { x: l + a * 1.2 + s, y: depth }, { x: l, y: depth * 0.52 }]; }
  return [{ x: l, y: 0 }, { x: r, y: 0 }, { x: r, y: depth }, { x: l, y: depth }];
}

export function pointInFactoryLot(p: Vec2, ring: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    if (Math.abs(cross) < 1e-7 && p.x >= Math.min(a.x, b.x) - 1e-7 && p.x <= Math.max(a.x, b.x) + 1e-7 && p.y >= Math.min(a.y, b.y) - 1e-7 && p.y <= Math.max(a.y, b.y) + 1e-7) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function rectInsideLot(rect: Rect, ring: readonly Vec2[], margin = 0) {
  const hw = rect.width / 2 + margin, hd = rect.depth / 2 + margin;
  return [{ x: rect.x - hw, y: rect.y - hd }, { x: rect.x + hw, y: rect.y - hd }, { x: rect.x + hw, y: rect.y + hd }, { x: rect.x - hw, y: rect.y + hd }].every((p) => pointInFactoryLot(p, ring));
}
function polygonArea(ring: readonly Vec2[]) { let sum = 0; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; sum += a.x * b.y - b.x * a.y; } return Math.abs(sum) / 2; }
