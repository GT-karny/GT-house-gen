import { describe, it, expect } from 'vitest';
import { planSite } from './site';
import { generateHouse } from './building';
import { DEFAULT_CONFIG, JP_TRACT_PRESET, type GenConfig } from './config';
import { makeSampleLot } from './lot';
import type { Vec2 } from './types';

// The sample lot is axis-aligned: centered at origin, u = X (+half..−half),
// v = Y + depth/2 (road at y = −depth/2, so v=0 at the road edge).
function cfgOf(over: Partial<GenConfig> = {}): GenConfig {
  return { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_TRACT_PRESET), ...over };
}
const local = (p: Vec2, w: number, d: number) => ({ u: p.x + w / 2, v: p.y + d / 2 });
const extent = (ring: Vec2[], w: number, d: number) => {
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const p of ring) {
    const { u, v } = local(p, w, d);
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  return { uMin, uMax, vMin, vMax, uw: uMax - uMin, vd: vMax - vMin };
};

describe('planSite — lot layout', () => {
  it('house pad + footprint stay inside the lot minus setbacks, at the REAR', () => {
    for (let seed = 0; seed < 16; seed++) {
      const cfg = cfgOf({ seed, lotWidth: 12, lotDepth: 16 });
      const lot = makeSampleLot(cfg.lotWidth, cfg.lotDepth);
      const { plan, site } = generateHouse(lot, cfg);
      const e = extent(plan.footprintRing, cfg.lotWidth, cfg.lotDepth);
      // within side + rear setbacks (small epsilon for float)
      expect(e.uMin).toBeGreaterThanOrEqual(cfg.sideSetback - 1e-6);
      expect(e.uMax).toBeLessThanOrEqual(cfg.lotWidth - cfg.sideSetback + 1e-6);
      expect(e.vMax).toBeLessThanOrEqual(cfg.lotDepth - cfg.rearSetback + 1e-6);
      // house is pushed to the back: its rear edge sits at the rear setback line
      expect(e.vMax).toBeGreaterThan(cfg.lotDepth - cfg.rearSetback - cfg.panelW);
      // and its front never intrudes into the reserved front zone
      expect(e.vMin).toBeGreaterThanOrEqual(site.pad.frontV - 1e-6);
    }
  });

  it('parking is at least 1 car on a buildable lot, sized ~2.5m/stall, touching the road', () => {
    for (let seed = 0; seed < 16; seed++) {
      const cfg = cfgOf({ seed, lotWidth: 12, lotDepth: 16, parkingTarget: 'auto' });
      const lot = makeSampleLot(cfg.lotWidth, cfg.lotDepth);
      const { site } = generateHouse(lot, cfg);
      expect(site.cars).toBeGreaterThanOrEqual(1); // BW = 11 ≥ 2.5 → guaranteed
      const park = site.zones.find((z) => z.kind === 'parking')!;
      expect(park).toBeTruthy();
      const e = extent(park.ring, cfg.lotWidth, cfg.lotDepth);
      expect(e.uw).toBeCloseTo(site.cars * 2.5 + (site.cars - 1) * 0.5, 3); // stall(s) + gap
      expect(e.vd).toBeCloseTo(5.0, 3); // stall depth (deep lot)
      expect(e.vMin).toBeCloseTo(0, 3); // opens onto the road
    }
  });

  it('perimeter is fenced (back+sides solid); front has a gate and an open driveway', () => {
    const cfg = cfgOf({ seed: 3, lotWidth: 12, lotDepth: 16 });
    const lot = makeSampleLot(cfg.lotWidth, cfg.lotDepth);
    const { site } = generateHouse(lot, cfg);
    const kinds = site.fences.map((f) => f.kind);
    expect(kinds.filter((k) => k === 'solid').length).toBeGreaterThanOrEqual(3); // back + L + R
    expect(kinds).toContain('gate'); // 玄関アプローチの門扉
    if (site.cars > 0) expect(kinds).toContain('open'); // driveway mouth
  });

  it('garden area scales with free space (more coverage/fill → less garden)', () => {
    const gardenArea = (cfg: GenConfig) => {
      const { site } = generateHouse(makeSampleLot(cfg.lotWidth, cfg.lotDepth), cfg);
      return site.zones
        .filter((z) => z.kind === 'garden')
        .reduce((a, z) => a + (() => { const e = extent(z.ring, cfg.lotWidth, cfg.lotDepth); return e.uw * e.vd; })(), 0);
    };
    // same seed → same arrangement, so the only variable is how much the house takes
    const maxed = gardenArea(cfgOf({ seed: 1, lotWidth: 12, lotDepth: 14, fillRatio: 1.0, coverageRatio: 0.8 }));
    const roomy = gardenArea(cfgOf({ seed: 1, lotWidth: 12, lotDepth: 14, fillRatio: 0.6, coverageRatio: 0.4 }));
    expect(roomy).toBeGreaterThan(maxed);
    expect(roomy).toBeGreaterThan(5); // several m² of garden on a roomy lot
  });

  it('tiles the whole lot with no gaps (every interior point lands in a zone)', () => {
    const pointInRing = (px: number, py: number, ring: Vec2[]) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    };
    for (const seed of [0, 3, 7, 11]) {
      const cfg = cfgOf({ seed, lotWidth: 13, lotDepth: 16 });
      const { site } = generateHouse(makeSampleLot(cfg.lotWidth, cfg.lotDepth), cfg);
      const W = cfg.lotWidth, D = cfg.lotDepth;
      let uncovered = 0, total = 0;
      for (let gx = 1; gx < 40; gx++) {
        for (let gy = 1; gy < 40; gy++) {
          const px = -W / 2 + (W * gx) / 40, py = -D / 2 + (D * gy) / 40; // sample world XY inside the lot
          total++;
          if (!site.zones.some((z) => pointInRing(px, py, z.ring))) uncovered++;
        }
      }
      expect(uncovered / total).toBeLessThan(0.02); // essentially full coverage (edge rounding only)
    }
  });

  it('keeps 2-car parking a minority on a normal lot (space-efficient)', () => {
    let two = 0, n = 0;
    for (let seed = 0; seed < 60; seed++) {
      const cfg = cfgOf({ seed, lotWidth: 12, lotDepth: 16, parkingTarget: 'auto' });
      const { site } = generateHouse(makeSampleLot(cfg.lotWidth, cfg.lotDepth), cfg);
      if (site.cars === 2) two++;
      n++;
    }
    expect(two / n).toBeLessThan(0.5); // used to be ~0.65; now capped ~0.29 here
  });

  it('fills leftover space with a garden and/or utility zones+props', () => {
    // a roomy lot with a modest house should not read as empty ground
    let filled = 0;
    for (let seed = 0; seed < 12; seed++) {
      const cfg = cfgOf({ seed, lotWidth: 14, lotDepth: 18, coverageRatio: 0.45 });
      const { site } = generateHouse(makeSampleLot(cfg.lotWidth, cfg.lotDepth), cfg);
      const amenities = site.zones.filter((z) => z.kind === 'garden' || z.kind === 'service' || z.kind === 'bike');
      if (amenities.length > 0 || site.props.length > 0) filled++;
    }
    expect(filled).toBe(12);
  });

  it('never plants a tree/shrub inside the parking, and count varies with garden size', () => {
    const inRing = (px: number, py: number, ring: Vec2[]) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    };
    let maxPlants = 0;
    for (let seed = 0; seed < 24; seed++) {
      const cfg = cfgOf({ seed, lotWidth: 15, lotDepth: 18, coverageRatio: 0.45 });
      const { site } = generateHouse(makeSampleLot(cfg.lotWidth, cfg.lotDepth), cfg);
      const plants = site.props.filter((p) => p.kind === 'tree' || p.kind === 'shrub');
      maxPlants = Math.max(maxPlants, plants.length);
      const park = site.zones.find((z) => z.kind === 'parking');
      if (park) for (const pl of plants) expect(inRing(pl.center.x, pl.center.y, park.ring)).toBe(false);
    }
    expect(maxPlants).toBeGreaterThan(1); // no longer a fixed single tree
  });

  it('enforces the minimum building size even at low coverage/fill', () => {
    const cfg = cfgOf({ seed: 4, lotWidth: 12, lotDepth: 16, fillRatio: 0.4, coverageRatio: 0.1 });
    const { site } = generateHouse(makeSampleLot(cfg.lotWidth, cfg.lotDepth), cfg);
    const w = site.pad.maxWidthBays * cfg.panelW;
    const d = site.pad.maxDepthBays * cfg.panelW;
    // min is enforced on the continuous pad; the bay grid floors each dim (≈−1 bay)
    expect(w).toBeGreaterThanOrEqual(cfg.minBuildingWidth - cfg.panelW - 1e-6); // 最小間口
    expect(d).toBeGreaterThanOrEqual(cfg.minBuildingDepth - cfg.panelW - 1e-6); // 最小奥行
    expect(w * d).toBeGreaterThanOrEqual(cfg.minBuildingArea * 0.35); // 最小建築面積(丸め考慮)
  });

  it('parks cars only inside the parking rect, count ≤ stalls, and sometimes present', () => {
    const inRing = (px: number, py: number, ring: Vec2[]) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    };
    let anyCar = false;
    for (let seed = 0; seed < 24; seed++) {
      const cfg = cfgOf({ seed, lotWidth: 13, lotDepth: 17 });
      const { site } = generateHouse(makeSampleLot(cfg.lotWidth, cfg.lotDepth), cfg);
      const cars = site.props.filter((p) => p.kind === 'car');
      expect(cars.length).toBeLessThanOrEqual(site.cars);
      const park = site.zones.find((z) => z.kind === 'parking');
      if (cars.length) anyCar = true;
      if (park) for (const c of cars) expect(inRing(c.center.x, c.center.y, park.ring)).toBe(true);
    }
    expect(anyCar).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const cfg = cfgOf({ seed: 7 });
    const lot = makeSampleLot(cfg.lotWidth, cfg.lotDepth);
    expect(JSON.stringify(planSite(lot, cfg))).toEqual(JSON.stringify(planSite(lot, cfg)));
  });

  it('drops parking when the lot is too shallow for a full stall', () => {
    for (let seed = 0; seed < 8; seed++) {
      const cfg = cfgOf({ seed, lotWidth: 12, lotDepth: 5 }); // availD ≈ 4.2 < 5m stall
      const lot = makeSampleLot(cfg.lotWidth, cfg.lotDepth);
      const { site } = generateHouse(lot, cfg);
      expect(site.cars).toBe(0);
      expect(site.zones.some((z) => z.kind === 'parking')).toBe(false);
      expect(site.fences.some((f) => f.kind === 'open')).toBe(false);
    }
  });

  it('respects an explicit parkingTarget of 0 (no parking, no open span)', () => {
    const cfg = cfgOf({ seed: 2, parkingTarget: 0 });
    const lot = makeSampleLot(cfg.lotWidth, cfg.lotDepth);
    const { site } = generateHouse(lot, cfg);
    expect(site.cars).toBe(0);
    expect(site.zones.some((z) => z.kind === 'parking')).toBe(false);
    expect(site.fences.some((f) => f.kind === 'open')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Non-rectangular lots (台形 / 丸角 / 隅切り). Same generator, arbitrary convex
// `Lot.ring`; the site planner must FIT the house and CLIP zones/props/fences to
// the real polygon so nothing spills past a slanted or cut edge.
// ---------------------------------------------------------------------------
import { pointInPolygon, distToBoundary } from '../shared/poly';
import type { LotShape } from './lot';

const SHAPES: LotShape[] = ['irregular-quad', 'rounded-corner', 'chamfered'];
// a point counts as inside if it's within the polygon, or on an edge (clip output
// vertices sit exactly on the lot boundary → distToBoundary ≈ 0).
const insideOrOn = (p: Vec2, ring: Vec2[], tol = 0.05) =>
  pointInPolygon(p, ring) || distToBoundary(p, ring) <= tol;

describe('planSite — non-rectangular lots', () => {
  it('house footprint stays inside the actual lot polygon (all shapes/seeds)', () => {
    for (const shape of SHAPES) {
      for (let seed = 0; seed < 12; seed++) {
        const cfg = cfgOf({ seed, lotWidth: 16, lotDepth: 18 });
        const lot = makeSampleLot(cfg.lotWidth, cfg.lotDepth, shape, seed);
        const { plan } = generateHouse(lot, cfg, undefined);
        for (const p of plan.footprintRing) {
          expect(insideOrOn(p, lot.ring, 0.15)).toBe(true);
        }
      }
    }
  });

  it('every ground zone is clipped to the lot (no vertex outside the polygon)', () => {
    for (const shape of SHAPES) {
      for (let seed = 0; seed < 12; seed++) {
        const cfg = cfgOf({ seed, lotWidth: 16, lotDepth: 18 });
        const lot = makeSampleLot(cfg.lotWidth, cfg.lotDepth, shape, seed);
        const { site } = generateHouse(lot, cfg);
        for (const z of site.zones) {
          for (const p of z.ring) expect(insideOrOn(p, lot.ring, 0.05)).toBe(true);
        }
      }
    }
  });

  it('all props (plantings / cars / shed) sit inside the lot polygon', () => {
    for (const shape of SHAPES) {
      for (let seed = 0; seed < 12; seed++) {
        const cfg = cfgOf({ seed, lotWidth: 16, lotDepth: 18 });
        const lot = makeSampleLot(cfg.lotWidth, cfg.lotDepth, shape, seed);
        const { site } = generateHouse(lot, cfg);
        for (const p of site.props) expect(pointInPolygon(p.center, lot.ring)).toBe(true);
      }
    }
  });

  it('fence endpoints lie on/inside the lot; still has a gate (and a drive mouth when parked)', () => {
    for (const shape of SHAPES) {
      const cfg = cfgOf({ seed: 5, lotWidth: 16, lotDepth: 18 });
      const lot = makeSampleLot(cfg.lotWidth, cfg.lotDepth, shape, 5);
      const { site } = generateHouse(lot, cfg);
      for (const f of site.fences) {
        expect(insideOrOn(f.a, lot.ring, 0.05)).toBe(true);
        expect(insideOrOn(f.b, lot.ring, 0.05)).toBe(true);
      }
      expect(site.fences.some((f) => f.kind === 'gate')).toBe(true);
      if (site.cars > 0) expect(site.fences.some((f) => f.kind === 'open')).toBe(true);
    }
  });

  it('keeps the driveway OFF a rounded/chamfered corner (fully inside → not clipped)', () => {
    // A driveway that sits clear of the cut corners lies wholly inside the lot, so
    // clipping leaves it untouched: the zone stays a 4-vertex rectangle, and every
    // corner keeps real clearance from the boundary (not hugging the rounded edge).
    for (const shape of ['rounded-corner', 'chamfered'] as LotShape[]) {
      for (let seed = 0; seed < 16; seed++) {
        const cfg = cfgOf({ seed, lotWidth: 16, lotDepth: 18 });
        const lot = makeSampleLot(cfg.lotWidth, cfg.lotDepth, shape, seed);
        const { site } = generateHouse(lot, cfg);
        const park = site.zones.find((z) => z.kind === 'parking');
        if (!park) continue;
        expect(park.ring.length).toBe(4); // uncut by clipConvex ⇒ not overlapping a corner
        for (const p of park.ring) expect(insideOrOn(p, lot.ring, 0.05)).toBe(true);
      }
    }
  });

  it('is deterministic per shape/seed', () => {
    for (const shape of SHAPES) {
      const cfg = cfgOf({ seed: 8, lotWidth: 16, lotDepth: 18 });
      const lot = makeSampleLot(cfg.lotWidth, cfg.lotDepth, shape, 8);
      expect(JSON.stringify(planSite(lot, cfg))).toEqual(JSON.stringify(planSite(lot, cfg)));
    }
  });
});
