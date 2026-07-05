import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, JP_TRACT_PRESET, type GenConfig } from './config';
import { generateHouse } from './building';
import { makeSampleLot } from './lot';
import { len, sub } from './vec';

const lot = makeSampleLot();

function cfg(overrides: Partial<GenConfig> = {}): GenConfig {
  return { ...structuredClone(DEFAULT_CONFIG), ...overrides };
}

describe('footprint', () => {
  it('every wall length is an integer multiple of panelW (grid never fractures)', () => {
    for (let seed = 0; seed < 40; seed++) {
      const c = cfg({ seed });
      const { plan } = generateHouse(lot, c);
      const ring = plan.footprintRing;
      for (let i = 0; i < ring.length; i++) {
        const l = len(sub(ring[(i + 1) % ring.length], ring[i]));
        const bays = l / c.panelW;
        expect(Math.abs(bays - Math.round(bays))).toBeLessThan(1e-6);
      }
    }
  });

  it('produces a non-degenerate closed ring', () => {
    const { plan } = generateHouse(lot, cfg({ seed: 7 }));
    expect(plan.footprintRing.length).toBeGreaterThanOrEqual(4);
  });
});

describe('deterministic', () => {
  it('same seed → identical panel layout', () => {
    const a = generateHouse(lot, cfg({ seed: 3 })).plan.panels;
    const b = generateHouse(lot, cfg({ seed: 3 })).plan.panels;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('facade split-grammar', () => {
  it('corner bays never carry a window (openings stay off the corners)', () => {
    const c = cfg({ seed: 5, cornerMarginBays: 1 });
    const { plan } = generateHouse(lot, c);
    const byFace = new Map<number, typeof plan.panels>();
    for (const p of plan.panels) {
      if (!byFace.has(p.faceIndex)) byFace.set(p.faceIndex, []);
      byFace.get(p.faceIndex)!.push(p);
    }
    for (const face of plan.faces) {
      for (const p of byFace.get(face.index) ?? []) {
        if (p.bay < c.cornerMarginBays || p.bay >= face.bays - c.cornerMarginBays) {
          expect(p.type).not.toBe('window'); // a door may sit near a corner; a window may not
        }
      }
    }
  });

  it('doors appear only on the ground floor and only on the primary (road) face', () => {
    const { plan } = generateHouse(lot, cfg({ seed: 2, doorFacesRoadOnly: true }));
    const doors = plan.panels.filter((p) => p.type === 'door');
    expect(doors.length).toBeGreaterThan(0);
    for (const d of doors) {
      expect(d.floor).toBe(0);
      const face = plan.faces.find((f) => f.index === d.faceIndex)!;
      expect(face.isPrimary).toBe(true);
    }
  });

  it('windows never clump — a solid pier always sits between window columns', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { plan } = generateHouse(lot, cfg({ seed, windowDensity: 1, windowJitter: 0.5 }));
      for (const face of plan.faces) {
        const winBays = new Set(
          plan.panels.filter((p) => p.faceIndex === face.index && p.type === 'window').map((p) => p.bay)
        );
        for (const b of winBays) {
          expect(winBays.has(b + 1)).toBe(false); // no two adjacent window columns
        }
      }
    }
  });

  it('byFloor sizing: every ground-floor window is large, none upstairs', () => {
    const { plan } = generateHouse(lot, cfg({ seed: 4, floors: 2, windowSizeMode: 'byFloor', windowDensity: 0.8 }));
    for (const p of plan.panels.filter((x) => x.type === 'window')) {
      expect(p.size).toBe(p.floor === 0 ? 'large' : 'medium');
    }
  });

  it('jp-tract preset produces a size mix incl. 掃き出し窓(large) across seeds', () => {
    let large = 0;
    let small = 0;
    for (let seed = 0; seed < 30; seed++) {
      const c: GenConfig = { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_TRACT_PRESET), seed };
      const win = generateHouse(lot, c).plan.panels.filter((p) => p.type === 'window');
      large += win.filter((p) => p.size === 'large').length;
      small += win.filter((p) => p.size === 'small').length;
      expect(win.every((p) => p.size !== undefined)).toBe(true);
    }
    expect(large).toBeGreaterThan(0); // 掃き出し窓 appear
    expect(small).toBeGreaterThan(0); // 小窓 accents appear
  });

  it('掃き出し窓 face the garden side (left/right), never the ground-floor street', () => {
    let gardenLarge = 0;
    for (let seed = 0; seed < 30; seed++) {
      const c: GenConfig = { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_TRACT_PRESET), seed };
      const { plan } = generateHouse(lot, c);
      const streetIdx = new Set(plan.faces.filter((f) => f.role === 'street').map((f) => f.index));
      const gardenIdx = new Set(plan.faces.filter((f) => f.role === 'garden').map((f) => f.index));
      const g0 = plan.panels.filter((p) => p.type === 'window' && p.floor === 0);
      // no big 掃き出し窓 on the ground-floor street elevation (privacy)
      expect(g0.some((p) => streetIdx.has(p.faceIndex) && p.size === 'large')).toBe(false);
      gardenLarge += g0.filter((p) => gardenIdx.has(p.faceIndex) && p.size === 'large').length;
    }
    expect(gardenLarge).toBeGreaterThan(0); // the garden side does get them
  });

  it('balcony fronts a visible face (street or a side), spanning 掃き出し窓; never the back', () => {
    let seen = 0;
    let onStreet = 0;
    let onSide = 0;
    for (let seed = 0; seed < 40; seed++) {
      const c: GenConfig = { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_TRACT_PRESET), seed };
      const { plan } = generateHouse(lot, c);
      if (plan.balconies.length === 0) continue;
      seen++;
      const large = plan.panels.filter((p) => p.type === 'window' && p.size === 'large' && p.floor >= 1);
      expect(large.length).toBeGreaterThan(0);
      // balcony must front a street or garden(=side) face, i.e. its outward
      // normal is not the pure "back" (+axisV = away from road = (0,1) here)
      for (const b of plan.balconies) expect(b.normal.y).toBeLessThan(0.9);
    }
    expect(seen).toBeGreaterThan(0);
    // with 'auto' across seeds we should see both front and side placements
    for (let seed = 0; seed < 40; seed++) {
      const c: GenConfig = { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_TRACT_PRESET), seed };
      const { plan } = generateHouse(lot, c);
      for (const b of plan.balconies) (Math.abs(b.normal.x) > 0.7 ? () => onSide++ : () => onStreet++)();
    }
    expect(onStreet).toBeGreaterThan(0);
    expect(onSide).toBeGreaterThan(0);
  });

  it('the ground-floor street face always has a window (never just a door)', () => {
    for (let seed = 0; seed < 40; seed++) {
      const c: GenConfig = { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_TRACT_PRESET), seed };
      const { plan } = generateHouse(lot, c);
      const streetIdx = new Set(plan.faces.filter((f) => f.role === 'street').map((f) => f.index));
      const g0 = plan.panels.filter((p) => p.floor === 0 && streetIdx.has(p.faceIndex));
      const hasDoor = g0.some((p) => p.type === 'door');
      const wideEnough = plan.faces.some((f) => f.role === 'street' && f.bays >= 2);
      if (hasDoor && wideEnough) {
        expect(g0.some((p) => p.type === 'window')).toBe(true);
      }
    }
  });

  it('windows can reach the wall ends when cornerMargin is 0', () => {
    let edgeHits = 0;
    for (let seed = 0; seed < 30; seed++) {
      const c: GenConfig = { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_TRACT_PRESET), seed, cornerMarginBays: 0 };
      const { plan } = generateHouse(lot, c);
      for (const f of plan.faces) {
        const onFace = plan.panels.filter((p) => p.type === 'window' && p.faceIndex === f.index);
        if (onFace.some((p) => p.bay === 0 || p.bay === f.bays - 1)) edgeHits++;
      }
    }
    expect(edgeHits).toBeGreaterThan(0); // windows do sit at bay 0 / last bay
  });

  it('block protrusions appear on BOTH left and right sides (RNG not biased)', () => {
    let left = 0, right = 0;
    for (let seed = 0; seed < 60; seed++) {
      const c: GenConfig = { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_TRACT_PRESET), seed };
      const { plan } = generateHouse(lot, c);
      const areas = plan.masses.map((m) => m.obb.halfU * m.obb.halfV);
      const coreI = areas.indexOf(Math.max(...areas));
      const core = plan.masses[coreI];
      plan.masses.forEach((m, i) => {
        if (i === coreI) return;
        const du = m.obb.center.x - core.obb.center.x;
        const dv = m.obb.center.y - core.obb.center.y;
        if (Math.abs(du) > Math.abs(dv)) (du < 0 ? () => left++ : () => right++)();
        expect(dv).toBeLessThan(0.5); // never protrudes to the back
      });
    }
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
  });

  it('recessed entrance carves a ground-floor 凹 that the upper floor cantilevers over', () => {
    const c: GenConfig = {
      ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_TRACT_PRESET),
      seed: 1, downWings: false, recessedEntrance: true,
      // force a flat-fronted rect so the notch is applied
      archetypeWeights: { rect: 1, lshape: 0, tshape: 0, ushape: 0, garage: 0 },
      coreWidthBays: 6, coreDepthBays: 4,
    };
    const { plan } = generateHouse(lot, c);
    // a plain rect is a 4-vertex ring; the notch adds a concave bite → >4 verts
    expect(plan.footprintRing.length).toBeGreaterThan(4);
    // and the door sits on the ground-floor front (a window-less entrance still exists)
    expect(plan.panels.some((p) => p.type === 'door' && p.floor === 0)).toBe(true);
  });

  it('recessed entrance is optional: some seeds notch, some do not', () => {
    let notched = 0, flat = 0;
    for (let seed = 0; seed < 30; seed++) {
      const c: GenConfig = {
        ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_TRACT_PRESET), seed,
        archetypeWeights: { rect: 1, lshape: 0, tshape: 0, ushape: 0, garage: 0 },
        coreWidthBays: 6, coreDepthBays: 4, downWings: false,
      };
      (generateHouse(lot, c).plan.footprintRing.length > 4 ? () => notched++ : () => flat++)();
    }
    expect(notched).toBeGreaterThan(0);
    expect(flat).toBeGreaterThan(0);
  });

  it('下屋: a stepped wing yields masses of differing storey counts + fewer upper walls', () => {
    const c: GenConfig = {
      ...structuredClone(DEFAULT_CONFIG),
      ...structuredClone(JP_TRACT_PRESET),
      seed: 3,
      downWings: true,
      floors: 2,
      archetypeWeights: { rect: 0, lshape: 1, tshape: 0, ushape: 0, garage: 0 }, // force L
    };
    const { plan } = generateHouse(lot, c);
    const floorsSet = new Set(plan.masses.map((m) => m.floors));
    expect(floorsSet.has(1)).toBe(true); // 下屋
    expect(floorsSet.has(2)).toBe(true); // 総二階
    const g = plan.panels.filter((p) => p.floor === 0).length;
    const u = plan.panels.filter((p) => p.floor === 1).length;
    expect(u).toBeLessThan(g); // upper storey has a smaller footprint
  });

  it('window columns are vertically aligned across floors', () => {
    const c = cfg({ seed: 9, floors: 3, windowDensity: 0.6 });
    const { plan } = generateHouse(lot, c);
    // for each (face,bay) that has a window on any non-door floor, all non-door
    // floors in that column must be windows (same column decision).
    for (const face of plan.faces) {
      const cells = plan.panels.filter((p) => p.faceIndex === face.index);
      const bays = new Set(cells.map((p) => p.bay));
      for (const bay of bays) {
        const col = cells.filter((p) => p.bay === bay && p.type !== 'door');
        const anyWindow = col.some((p) => p.type === 'window');
        if (anyWindow) {
          for (const p of col) expect(p.type).toBe('window');
        }
      }
    }
  });
});
