import { describe, expect, it } from 'vitest';
import { DEFAULT_RAILWAY, planRailway, type RailwayBounds } from './railway';

const BOUNDS: RailwayBounds = {
  xMin: -20,
  xMax: 20,
  frontY: -8,
  rearY: 8,
  roadNearY: -9.6,
  roadFarY: -14.6,
  farEdgeY: -15.8,
};

describe('Japanese railway plan', () => {
  it('uses Japanese conventional-line narrow gauge by default', () => {
    const p = planRailway(BOUNDS, DEFAULT_RAILWAY);
    expect(p.gauge).toBeCloseTo(1.067, 3);
    const innerGap = p.rails[1].a.x - p.rails[0].a.x - p.rails[0].width;
    expect(innerGap).toBeCloseTo(1.067, 3);
  });

  it('is deterministic and keeps the default track outside the housing row', () => {
    const a = planRailway(BOUNDS, DEFAULT_RAILWAY);
    const b = planRailway(BOUNDS, DEFAULT_RAILWAY);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.centerX - a.ballast.width / 2).toBeGreaterThan(BOUNDS.xMax);
  });

  it('places warning/barrier equipment on the left side of each approach', () => {
    const p = planRailway(BOUNDS, DEFAULT_RAILWAY);
    const [west, east] = p.devices;
    expect(west.center.x).toBeLessThan(p.centerX);
    expect(west.gateCenter.x).toBeGreaterThan(west.center.x);
    expect(Math.abs(west.gateCenter.x - west.center.x)).toBeGreaterThan(0.8);
    expect(west.center.y).toBeGreaterThan(BOUNDS.roadNearY);
    expect(west.armDirY).toBe(-1);
    expect(east.center.x).toBeGreaterThan(p.centerX);
    expect(east.gateCenter.x).toBeLessThan(east.center.x);
    expect(Math.abs(east.gateCenter.x - east.center.x)).toBeGreaterThan(0.8);
    expect(east.center.y).toBeLessThan(BOUNDS.roadFarY);
    expect(east.armDirY).toBe(1);
  });

  it('does not put exposed sleepers through the paved crossing deck', () => {
    const p = planRailway(BOUNDS, DEFAULT_RAILWAY);
    expect(p.sleepers.every((s) => s.center.y <= BOUNDS.farEdgeY || s.center.y >= BOUNDS.frontY)).toBe(true);
  });

  it('plans the equipment set of a well-equipped Japanese class-1 crossing', () => {
    const p = planRailway(BOUNDS, DEFAULT_RAILWAY);
    expect(p.cabinets.map((c) => c.kind)).toEqual(['relay', 'power']);
    expect(p.posts.filter((x) => x.kind === 'detector')).toHaveLength(4);
    expect(p.posts.some((x) => x.kind === 'special-signal')).toBe(true);
    expect(p.posts.some((x) => x.kind === 'lamp')).toBe(true);
    expect(p.posts.some((x) => x.kind === 'catenary')).toBe(true);
    expect(p.fences).toHaveLength(4);
  });

  it('keeps boundary fences out of the road crossing opening', () => {
    const p = planRailway(BOUNDS, DEFAULT_RAILWAY);
    for (const f of p.fences) {
      expect(f.b.y <= p.deckMinY || f.a.y >= p.deckMaxY).toBe(true);
    }
  });

  it('can reduce optional safety scenery without changing the core crossing', () => {
    const p = planRailway(BOUNDS, { ...DEFAULT_RAILWAY, safetyEquipment: 'basic', electrified: false });
    expect(p.cabinets).toHaveLength(0);
    expect(p.posts).toHaveLength(0);
    expect(p.devices).toHaveLength(2);
    expect(p.checkRails).toHaveLength(2);
  });
});
