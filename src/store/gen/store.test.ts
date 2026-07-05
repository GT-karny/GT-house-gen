import { describe, it, expect } from 'vitest';
import { DEFAULT_STORE_CONFIG, STORE_PRESETS, type StoreConfig, type StorePresetName } from './config';
import { generateStore } from './building';
import { makeSampleStoreLot, type LotShape } from './lot';
import type { StoreLot, Vec2 } from './types';
import type { BuildingDepth, BuildingSide } from './config';

const cfgOf = (preset?: StorePresetName, over: Partial<StoreConfig> = {}): StoreConfig => ({
  ...structuredClone(DEFAULT_STORE_CONFIG),
  ...(preset ? structuredClone(STORE_PRESETS[preset]) : {}),
  ...over,
});

const lotOf = (cfg: StoreConfig): StoreLot => makeSampleStoreLot(cfg.lotWidth, cfg.lotDepth);

const norm = (a: Vec2): Vec2 => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
function toLocal(lot: StoreLot, p: Vec2): { u: number; v: number } {
  const aU = norm(lot.longestEdgeDir), aV = { x: -aU.y, y: aU.x };
  const dx = p.x - lot.centroid.x, dy = p.y - lot.centroid.y;
  return { u: dx * aU.x + dy * aU.y, v: dx * aV.x + dy * aV.y };
}
function pointInRing(pt: Vec2, ring: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const PRESETS: StorePresetName[] = ['big-box', 'convenience', 'family-restaurant', 'drive-through'];

describe('store determinism', () => {
  it('same seed → identical output for every preset', () => {
    for (const preset of PRESETS) {
      for (let seed = 0; seed < 12; seed++) {
        const cfg = cfgOf(preset, { seed });
        const a = generateStore(lotOf(cfg), cfg);
        const b = generateStore(lotOf(cfg), cfg);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }
    }
  });
});

describe('parking field', () => {
  it('stalls never overlap (touching edges allowed)', () => {
    for (const preset of PRESETS) {
      for (let seed = 0; seed < 20; seed++) {
        const cfg = cfgOf(preset, { seed });
        const lot = lotOf(cfg);
        const aU = norm(lot.longestEdgeDir);
        const stalls = generateStore(lot, cfg).site.parking.stalls.map((s) => {
          // stall halfU/halfV are in the stall's own (across/along) frame; project
          // to lot U/V using the facing yaw so the AABB test is orientation-correct.
          const yaw = (s.yawDeg * Math.PI) / 180;
          const alongU = Math.abs(Math.cos(yaw) * aU.x + Math.sin(yaw) * aU.y) > 0.5;
          return {
            ...toLocal(lot, s.center),
            hu: alongU ? s.halfV : s.halfU, // lot-U extent
            hv: alongU ? s.halfU : s.halfV, // lot-V extent
          };
        });
        for (let i = 0; i < stalls.length; i++) {
          for (let j = i + 1; j < stalls.length; j++) {
            const A = stalls[i], B = stalls[j];
            const overlapU = Math.abs(A.u - B.u) < A.hu + B.hu - 1e-6;
            const overlapV = Math.abs(A.v - B.v) < A.hv + B.hv - 1e-6;
            expect(overlapU && overlapV).toBe(false);
          }
        }
      }
    }
  });

  it('produces reachable stalls for every preset across seeds', () => {
    for (const preset of PRESETS) {
      for (let seed = 0; seed < 12; seed++) {
        const cfg = cfgOf(preset, { seed });
        // every emitted stall survived the drive-network reachability prune, so a
        // positive count means there is reachable parking (never a dead-end field).
        expect(generateStore(lotOf(cfg), cfg).site.parking.count).toBeGreaterThan(0);
      }
    }
  });

  it('double-loaded rows nose into a shared aisle (opposite facings, never all one way)', () => {
    const deg = (y: number) => Math.round((((y % 360) + 360) % 360));
    let sawOpposite = false, sawAisle = false;
    for (let seed = 0; seed < 6; seed++) {
      const cfg = cfgOf('big-box', { seed }); // wide/deep lot → multi-row fields
      const { parking } = generateStore(lotOf(cfg), cfg).site;
      if (parking.aisles.length > 0) sawAisle = true;
      const yaws = new Set(parking.stalls.map((s) => deg(s.yawDeg)));
      for (const y of yaws) if (yaws.has(deg(y + 180))) sawOpposite = true;
    }
    expect(sawAisle).toBe(true); // every stalled field keeps a drive aisle
    expect(sawOpposite).toBe(true); // rows face both ways → back-to-back, not all same
  });

  it('no stall overlaps the building footprint (even partially)', () => {
    // separating-axis test: two convex rings overlap unless some edge normal separates them
    const sepAxis = (P: Vec2[], Q: Vec2[]) => {
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        let nx = -(b.y - a.y), ny = b.x - a.x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        let pMin = Infinity, pMax = -Infinity, qMin = Infinity, qMax = -Infinity;
        for (const v of P) { const d = v.x * nx + v.y * ny; pMin = Math.min(pMin, d); pMax = Math.max(pMax, d); }
        for (const v of Q) { const d = v.x * nx + v.y * ny; qMin = Math.min(qMin, d); qMax = Math.max(qMax, d); }
        if (pMin - qMax > 0.05 || qMin - pMax > 0.05) return true;
      }
      return false;
    };
    const stallRing = (s: { center: Vec2; halfU: number; halfV: number; yawDeg: number }): Vec2[] => {
      const y = (s.yawDeg * Math.PI) / 180, al = { x: Math.cos(y), y: Math.sin(y) }, ac = { x: al.y, y: -al.x }, c = s.center;
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) =>
        ({ x: c.x + ac.x * su * s.halfU + al.x * sv * s.halfV, y: c.y + ac.y * su * s.halfU + al.y * sv * s.halfV }));
    };
    for (const preset of PRESETS) {
      for (let seed = 0; seed < 12; seed++) {
        const cfg = cfgOf(preset, { seed });
        const { plan, site } = generateStore(lotOf(cfg), cfg);
        const massRings = plan.masses.map((m) => {
          const o = m.obb, U = o.axisU, V = o.axisV, c = o.center;
          return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) =>
            ({ x: c.x + U.x * su * o.halfU + V.x * sv * o.halfV, y: c.y + U.y * su * o.halfU + V.y * sv * o.halfV }));
        });
        for (const s of site.parking.stalls) {
          const sr = stallRing(s);
          for (const mr of massRings) expect(!sepAxis(sr, mr) && !sepAxis(mr, sr)).toBe(false);
        }
      }
    }
  });

  it('no stall sits on the entry driveway (entrance stays clear)', () => {
    for (const preset of PRESETS) {
      for (let seed = 0; seed < 8; seed++) {
        const cfg = cfgOf(preset, { seed });
        const { site } = generateStore(lotOf(cfg), cfg);
        const drive = site.zones.find((z) => z.kind === 'drive');
        if (!drive) continue;
        for (const s of site.parking.stalls) expect(pointInRing(s.center, drive.ring)).toBe(false);
      }
    }
  });

  it('accessible stalls follow JP バリアフリー法 (≥3.5 m wide)', () => {
    for (const preset of PRESETS) {
      const cfg = cfgOf(preset, { seed: 3, accessibleStalls: 2 });
      const acc = generateStore(lotOf(cfg), cfg).site.parking.stalls.filter((s) => s.accessible);
      expect(acc.length).toBeGreaterThan(0);
      for (const s of acc) {
        expect(s.halfU * 2).toBeGreaterThanOrEqual(3.5 - 1e-6); // 車椅子使用者用 width
        expect(s.occupied).toBe(false); // kept clear
      }
    }
  });

  it('stall centers lie inside the lot', () => {
    for (const preset of PRESETS) {
      for (let seed = 0; seed < 10; seed++) {
        const cfg = cfgOf(preset, { seed });
        const lot = lotOf(cfg);
        for (const s of generateStore(lot, cfg).site.parking.stalls) {
          expect(pointInRing(s.center, lot.ring)).toBe(true);
        }
      }
    }
  });
});

describe('site zoning', () => {
  it('covers the lot with <2% uncovered', () => {
    for (const preset of PRESETS) {
      const cfg = cfgOf(preset, { seed: 5 });
      const lot = lotOf(cfg);
      const zones = generateStore(lot, cfg).site.zones;
      const N = 36;
      let inLot = 0, covered = 0;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const x = -cfg.lotWidth / 2 + (cfg.lotWidth * (i + 0.5)) / N;
          const y = -cfg.lotDepth / 2 + (cfg.lotDepth * (j + 0.5)) / N;
          const p = { x, y };
          if (!pointInRing(p, lot.ring)) continue;
          inLot++;
          if (zones.some((z) => z.ring.length >= 3 && pointInRing(p, z.ring))) covered++;
        }
      }
      expect((inLot - covered) / inLot).toBeLessThan(0.02);
    }
  });
});

describe('building', () => {
  it('wall lengths are integer multiples of panelW', () => {
    for (const preset of PRESETS) {
      for (let seed = 0; seed < 15; seed++) {
        const cfg = cfgOf(preset, { seed });
        const plan = generateStore(lotOf(cfg), cfg).plan;
        for (const f of plan.faces) {
          const bays = f.length / cfg.panelW;
          expect(Math.abs(bays - Math.round(bays))).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('footprint stays inside the lot and meets minimum size', () => {
    for (const preset of PRESETS) {
      for (let seed = 0; seed < 10; seed++) {
        const cfg = cfgOf(preset, { seed });
        const lot = lotOf(cfg);
        const { plan } = generateStore(lot, cfg);
        let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
        for (const p of plan.footprintRing) {
          const l = toLocal(lot, p);
          uMin = Math.min(uMin, l.u); uMax = Math.max(uMax, l.u);
          vMin = Math.min(vMin, l.v); vMax = Math.max(vMax, l.v);
          expect(pointInRing(p, lot.ring)).toBe(true);
        }
        expect(uMax - uMin).toBeGreaterThanOrEqual(cfg.minBuildWidth - 1e-6);
        expect(vMax - vMin).toBeGreaterThanOrEqual(cfg.minBuildDepth - 1e-6);
      }
    }
  });

  it('frontage has an entrance; service (when present) has a shutter', () => {
    for (const preset of PRESETS) {
      for (let seed = 0; seed < 10; seed++) {
        const cfg = cfgOf(preset, { seed });
        const { plan } = generateStore(lotOf(cfg), cfg);
        const entrances = plan.panels.filter((p) => p.type === 'entrance');
        expect(entrances.length).toBeGreaterThanOrEqual(1);
        const hasService = plan.faces.some((f) => f.role === 'service');
        if (hasService && cfg.serviceYard) {
          // a service face exists on the ground ring → expect at least one shutter
          const shutters = plan.panels.filter((p) => p.type === 'shutter');
          expect(shutters.length).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});

const SHAPES: LotShape[] = ['rectangle', 'irregular-quad', 'rounded-corner', 'chamfered'];
const DEPTHS: BuildingDepth[] = ['front', 'rear'];
const SIDES: BuildingSide[] = ['left', 'center', 'right'];

describe('arbitrary polygon lots', () => {
  it('building footprint stays inside every lot shape', () => {
    for (const shape of SHAPES) {
      for (let seed = 0; seed < 12; seed++) {
        const cfg = cfgOf('big-box', { seed });
        const lot = makeSampleStoreLot(cfg.lotWidth, cfg.lotDepth, shape, seed);
        for (const p of generateStore(lot, cfg).plan.footprintRing) {
          expect(pointInRing(p, lot.ring)).toBe(true);
        }
      }
    }
  });

  it('parking stalls stay inside every lot shape (no spill on rounded/chamfered)', () => {
    for (const shape of SHAPES) {
      for (let seed = 0; seed < 12; seed++) {
        const cfg = cfgOf('big-box', { seed });
        const lot = makeSampleStoreLot(cfg.lotWidth, cfg.lotDepth, shape, seed);
        for (const s of generateStore(lot, cfg).site.parking.stalls) {
          expect(pointInRing(s.center, lot.ring)).toBe(true);
        }
      }
    }
  });

  it('zones cover each lot shape (<2% uncovered)', () => {
    for (const shape of SHAPES) {
      const cfg = cfgOf('big-box', { seed: 5 });
      const lot = makeSampleStoreLot(cfg.lotWidth, cfg.lotDepth, shape, 5);
      const zones = generateStore(lot, cfg).site.zones;
      const N = 40;
      let inLot = 0, covered = 0;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const p = { x: -cfg.lotWidth / 2 + (cfg.lotWidth * (i + 0.5)) / N, y: -cfg.lotDepth / 2 + (cfg.lotDepth * (j + 0.5)) / N };
          if (!pointInRing(p, lot.ring)) continue;
          inLot++;
          if (zones.some((z) => z.ring.length >= 3 && pointInRing(p, z.ring))) covered++;
        }
      }
      expect((inLot - covered) / inLot).toBeLessThan(0.02);
    }
  });

  it('is deterministic for every shape', () => {
    for (const shape of SHAPES) {
      for (let seed = 0; seed < 8; seed++) {
        const cfg = cfgOf('big-box', { seed });
        const lot = makeSampleStoreLot(cfg.lotWidth, cfg.lotDepth, shape, seed);
        expect(JSON.stringify(generateStore(lot, cfg))).toBe(JSON.stringify(generateStore(lot, cfg)));
      }
    }
  });
});

describe('building placement (2 axes)', () => {
  it('places the building per depth×side and keeps it inside the lot', () => {
    for (const depth of DEPTHS) {
      for (const side of SIDES) {
        for (let seed = 0; seed < 6; seed++) {
          const cfg = cfgOf('big-box', { seed, buildingDepth: depth, buildingSide: side });
          const lot = makeSampleStoreLot(cfg.lotWidth, cfg.lotDepth);
          const { plan } = generateStore(lot, cfg);
          let uMin = Infinity, uMax = -Infinity, vMin = Infinity;
          for (const p of plan.footprintRing) {
            expect(pointInRing(p, lot.ring)).toBe(true);
            const l = toLocal(lot, p);
            uMin = Math.min(uMin, l.u); uMax = Math.max(uMax, l.u); vMin = Math.min(vMin, l.v);
          }
          const uc = (uMin + uMax) / 2;
          if (side === 'left') expect(uc).toBeLessThan(0);
          if (side === 'right') expect(uc).toBeGreaterThan(0);
          if (depth === 'front') expect(vMin).toBeLessThan(cfg.lotDepth * 0.2);
        }
      }
    }
  });

  it("'auto' axes vary the placement across seeds", () => {
    const centers = new Set<string>();
    for (let seed = 0; seed < 24; seed++) {
      const cfg = cfgOf('big-box', { seed, buildingDepth: 'auto', buildingSide: 'auto' });
      const lot = makeSampleStoreLot(cfg.lotWidth, cfg.lotDepth);
      const ring = generateStore(lot, cfg).plan.footprintRing;
      let u = 0, v = 0;
      for (const p of ring) { const l = toLocal(lot, p); u += l.u; v += l.v; }
      centers.add(`${Math.round(u / ring.length)},${Math.round(v / ring.length)}`);
    }
    expect(centers.size).toBeGreaterThan(3); // seed-random placement really moves
  });
});

describe('signage', () => {
  it('pylon (when enabled) sits inside the lot', () => {
    for (const preset of PRESETS) {
      for (let seed = 0; seed < 8; seed++) {
        const cfg = cfgOf(preset, { seed });
        const lot = lotOf(cfg);
        const pylons = generateStore(lot, cfg).site.signs.filter((s) => s.kind === 'pylon');
        for (const s of pylons) expect(pointInRing(s.pos, lot.ring)).toBe(true);
      }
    }
  });

  it('building-mounted signs sit on the frontage (inside the lot) at a valid height', () => {
    for (const preset of PRESETS) {
      for (let seed = 0; seed < 8; seed++) {
        const cfg = cfgOf(preset, { seed });
        const lot = lotOf(cfg);
        const { plan } = generateStore(lot, cfg);
        const eaveZ = lot.baseZ + cfg.floors * cfg.panelH;
        for (const s of plan.signs) {
          expect(['wall', 'blade', 'roof-cube', 'roof-board']).toContain(s.kind);
          expect(pointInRing(s.pos, lot.ring)).toBe(true);
          expect(s.z).toBeGreaterThan(lot.baseZ);
          // blade stays clear UNDER the eave (its top, projecting past a pitched
          // roof's fascia, must not poke above it); a mansard wall sign rides the
          // band above the eave; rooftop signs sit ON the roof (base ≈ eave)
          if (s.kind === 'blade') expect(s.z + s.h / 2).toBeLessThanOrEqual(eaveZ - 0.5 + 1e-6);
          const ceil = s.kind === 'blade' ? eaveZ : eaveZ + 2.6;
          expect(s.z).toBeLessThanOrEqual(ceil + 1e-6);
        }
      }
    }
  });

  it('every sign carries a logoId; one store shares one id; explicit logoStyle wins', () => {
    for (const preset of PRESETS) {
      for (let seed = 0; seed < 6; seed++) {
        const cfg = cfgOf(preset, { seed });
        const lot = lotOf(cfg);
        const { plan, site } = generateStore(lot, cfg);
        const all = [...plan.signs, ...site.signs];
        for (const s of all) expect(Number.isFinite(s.logoId)).toBe(true);
        // all signs of a store + the fascia plate share the same id
        const ids = new Set(all.map((s) => s.logoId));
        if (all.length) { expect(ids.size).toBe(1); expect([...ids][0]).toBe(plan.logoId); }
      }
    }
    // explicit logoStyle overrides the seed-derived id
    const cfg = cfgOf('convenience', { seed: 7, logoStyle: 2 });
    expect(generateStore(lotOf(cfg), cfg).plan.logoId).toBe(2);
  });

  it('family-restaurant carries both a wall sign and a blade sign', () => {
    for (let seed = 0; seed < 10; seed++) {
      const cfg = cfgOf('family-restaurant', { seed });
      const { plan } = generateStore(lotOf(cfg), cfg);
      expect(plan.signs.some((s) => s.kind === 'wall')).toBe(true);
      expect(plan.signs.some((s) => s.kind === 'blade')).toBe(true);
    }
  });

  it('rooftop signs appear only on flat roofs (cube/board) and are config-gated', () => {
    let flatWithSign = 0;
    for (let seed = 0; seed < 20; seed++) {
      const cfg = cfgOf('big-box', { seed, rooftopSign: true });
      const lot = lotOf(cfg);
      const onFlat = generateStore(lot, cfg, { roofForm: 'flat' }).plan.signs.filter((s) => s.kind.startsWith('roof-'));
      if (onFlat.length) { flatWithSign++; for (const s of onFlat) expect(pointInRing(s.pos, lot.ring)).toBe(true); }
      // a pitched roof never carries a rooftop sign
      const onGable = generateStore(lot, cfg, { roofForm: 'gable' }).plan.signs.filter((s) => s.kind.startsWith('roof-'));
      expect(onGable.length).toBe(0);
    }
    expect(flatWithSign).toBeGreaterThan(0); // some seeds roll one
    const base = cfgOf('big-box', { seed: 1, rooftopSign: false });
    const off = generateStore(lotOf(base), base, { roofForm: 'flat' }).plan.signs.filter((s) => s.kind.startsWith('roof-'));
    expect(off.length).toBe(0);
  });

  it('wallSign/bladeSign toggles gate the building signs', () => {
    const base = cfgOf('family-restaurant', { seed: 3 });
    const off = generateStore(lotOf(base), { ...base, wallSign: false, bladeSign: false }).plan;
    expect(off.signs.length).toBe(0);
  });
});

describe('roof', () => {
  it('mansard produces a bounded decorative band (eave < ridge, 1.2–2.6 m)', () => {
    for (let seed = 0; seed < 12; seed++) {
      const cfg = cfgOf('family-restaurant', { seed, roofForm: 'mansard' });
      const { roofs } = generateStore(lotOf(cfg), cfg);
      expect(roofs.length).toBeGreaterThan(0);
      for (const r of roofs) {
        expect(r.style).toBe('mansard');
        const band = r.ridgeZ - r.eaveZ;
        expect(band).toBeGreaterThanOrEqual(1.2 - 1e-6);
        expect(band).toBeLessThanOrEqual(2.6 + 1e-6);
      }
    }
  });

  it('flat roofs stay flat (ridge == eave)', () => {
    const cfg = cfgOf('big-box', { seed: 1, roofForm: 'flat' });
    for (const r of generateStore(lotOf(cfg), cfg).roofs) expect(r.ridgeZ).toBeCloseTo(r.eaveZ, 6);
  });
});
