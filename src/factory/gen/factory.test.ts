import { DEFAULT_FACTORY_CONFIG, FACTORY_PRESETS } from './config';
import { generateFactory, pointInFactoryLot } from './building';
import type { FactoryArchetype } from './types';

describe('factory generator', () => {
  for (const archetype of Object.keys(FACTORY_PRESETS) as FactoryArchetype[]) {
    it(`${archetype} stays on the lot and has valid bays`, () => {
      const cfg = { ...DEFAULT_FACTORY_CONFIG, ...FACTORY_PRESETS[archetype], archetype };
      const p = generateFactory(cfg);
      expect(p.building.width).toBeLessThanOrEqual(cfg.lotWidth - cfg.sideSetback * 2 + 1e-6);
      expect(p.building.depth).toBeLessThanOrEqual(cfg.lotDepth);
      expect(p.bays.length).toBeGreaterThan(0);
      expect(p.bays.every((b) => b.width >= 2.4)).toBe(true);
      for (const a of p.annexes) {
        expect(a.x - a.width / 2).toBeGreaterThanOrEqual(-cfg.lotWidth / 2 - 1e-6);
        expect(a.x + a.width / 2).toBeLessThanOrEqual(cfg.lotWidth / 2 + 1e-6);
        expect(a.y - a.depth / 2).toBeGreaterThanOrEqual(-1e-6);
        expect(a.y + a.depth / 2).toBeLessThanOrEqual(cfg.lotDepth + 1e-6);
      }
      for (const s of p.parking) {
        expect(s.x - s.width / 2).toBeGreaterThanOrEqual(-cfg.lotWidth / 2 - 1e-6);
        expect(s.x + s.width / 2).toBeLessThanOrEqual(cfg.lotWidth / 2 + 1e-6);
        expect(s.y - s.depth / 2).toBeGreaterThanOrEqual(-1e-6);
        expect(s.y + s.depth / 2).toBeLessThanOrEqual(cfg.lotDepth + 1e-6);
        for (const b of [p.building, ...p.annexes]) {
          const separated = Math.abs(s.x - b.x) >= (s.width + b.width) / 2 || Math.abs(s.y - b.y) >= (s.depth + b.depth) / 2;
          expect(separated).toBe(true);
        }
      }
      for (let i = 0; i < p.parking.length; i++) for (let j = i + 1; j < p.parking.length; j++) {
        const a = p.parking[i], b = p.parking[j];
        expect(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 || Math.abs(a.y - b.y) >= (a.depth + b.depth) / 2).toBe(true);
      }
    });
  }
  it('is deterministic', () => {
    expect(generateFactory(DEFAULT_FACTORY_CONFIG)).toEqual(generateFactory(DEFAULT_FACTORY_CONFIG));
  });
  it('keeps every layout variant inside the lot and buildings separated', () => {
    for (const depthPlacement of ['front', 'center', 'rear'] as const) for (const sidePlacement of ['left', 'center', 'right'] as const) {
      const p = generateFactory({ ...DEFAULT_FACTORY_CONFIG, randomizeLayout: false, depthPlacement, sidePlacement, detachedOffice: true, parkingCount: 8 });
      const all = [p.building, ...p.annexes];
      for (const b of all) {
        expect(b.x - b.width / 2).toBeGreaterThanOrEqual(-p.lot.width / 2 - 1e-6);
        expect(b.x + b.width / 2).toBeLessThanOrEqual(p.lot.width / 2 + 1e-6);
        expect(b.y - b.depth / 2).toBeGreaterThanOrEqual(-1e-6);
        expect(b.y + b.depth / 2).toBeLessThanOrEqual(p.lot.depth + 1e-6);
      }
      if (p.annexes[0]) {
        const a = p.annexes[0], b = p.building;
        expect(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 || Math.abs(a.y - b.y) >= (a.depth + b.depth) / 2).toBe(true);
      }
    }
  });
  it('varies building, office and site layout across seeds in auto mode', () => {
    const variants = new Set<string>();
    for (let seed = 0; seed < 24; seed++) {
      const p = generateFactory({ ...DEFAULT_FACTORY_CONFIG, seed, randomizeLayout: true });
      const office = p.annexes[0];
      variants.add([p.building.x.toFixed(2), p.building.y.toFixed(2), p.building.width.toFixed(2), p.building.depth.toFixed(2), office?.width.toFixed(2), office?.depth.toFixed(2), p.parking.length].join('/'));
    }
    expect(variants.size).toBeGreaterThan(16);
  });
  it('adapts useful area and keeps all rectangle corners inside every lot shape', () => {
    for (const lotShape of ['rectangle', 'chamfered', 'trapezoid', 'irregular'] as const) for (const [lotWidth, lotDepth] of [[18, 24], [36, 48], [64, 60]] as const) {
      const p = generateFactory({ ...DEFAULT_FACTORY_CONFIG, seed: 41, lotShape, lotWidth, lotDepth, randomizeLayout: true });
      const rectangles = [p.building, ...p.annexes, ...p.parking];
      for (const r of rectangles) for (const x of [r.x - r.width / 2, r.x + r.width / 2]) for (const y of [r.y - r.depth / 2, r.y + r.depth / 2]) expect(pointInFactoryLot({ x, y }, p.lot.ring)).toBe(true);
      const usedArea = p.building.width * p.building.depth + p.annexes.reduce((sum, a) => sum + a.width * a.depth, 0) + p.parking.reduce((sum, s) => sum + s.width * s.depth, 0);
      expect(usedArea / p.lot.area, `${lotShape} ${lotWidth}×${lotDepth}`).toBeGreaterThan(0.24);
      expect(p.building.width * p.building.depth / p.lot.area).toBeLessThan(0.68);
    }
  });
});
