import { describe, expect, it } from 'vitest';
import { cloneRailwayConfig, DEFAULT_RAILWAY, planRailway, type RailwayBounds } from './railway';

const BOUNDS: RailwayBounds = {
  xMin: -20, xMax: 20, frontY: -8, rearY: 8,
  roadNearY: -9.6, roadFarY: -14.6, farEdgeY: -15.8,
};

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);
const signedDistance = (p: { x: number; y: number }, origin: { x: number; y: number }, axis: { x: number; y: number }) =>
  (p.x - origin.x) * axis.x + (p.y - origin.y) * axis.y;

describe('parametric Japanese railway crossing plan', () => {
  it('uses Japanese narrow gauge and is deterministic by default', () => {
    const a = planRailway(BOUNDS, DEFAULT_RAILWAY);
    const b = planRailway(BOUNDS, DEFAULT_RAILWAY);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.gauge).toBeCloseTo(1.067, 3);
    expect(a.tracks).toHaveLength(1);
    expect(distance(a.tracks[0].rails[0].a, a.tracks[0].rails[1].a) - a.tracks[0].rails[0].width).toBeCloseTo(1.067, 3);
    expect(a.center.x - a.ballast.width / 2).toBeGreaterThan(BOUNDS.xMax);
  });

  it('supports one to four tracks with configured center spacing', () => {
    for (let count = 1; count <= 4; count++) {
      const cfg = cloneRailwayConfig();
      cfg.railway.trackCount = count;
      cfg.railway.trackCenterSpacingM = 3.8;
      const p = planRailway(BOUNDS, cfg);
      expect(p.tracks).toHaveLength(count);
      expect(p.rails).toHaveLength(count * 2);
      expect(p.checkRails).toHaveLength(count * 2);
      for (let i = 1; i < count; i++) {
        const a = p.tracks[i - 1].centerLine.a;
        const b = p.tracks[i].centerLine.a;
        expect(distance(a, b)).toBeCloseTo(3.8, 6);
      }
    }
  });

  it('makes the crossing deck longer as the crossing angle becomes more acute', () => {
    const lengths: number[] = [];
    for (const angle of [90, 60, 45, 30]) {
      const cfg = cloneRailwayConfig();
      cfg.placement.crossingAngleDeg = angle;
      const p = planRailway(BOUNDS, cfg);
      const xs = p.crossingDeck.map((v) => v.x);
      lengths.push(Math.max(...xs) - Math.min(...xs));
      expect(p.crossingDeck.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y))).toBe(true);
    }
    expect(lengths[1]).toBeGreaterThan(lengths[0]);
    expect(lengths[2]).toBeGreaterThan(lengths[1]);
    expect(lengths[3]).toBeGreaterThan(lengths[2]);
  });

  it('keeps sleepers out of the paved road and preserves their track orientation', () => {
    const cfg = cloneRailwayConfig();
    cfg.placement.crossingAngleDeg = 45;
    cfg.railway.trackCount = 3;
    const p = planRailway(BOUNDS, cfg);
    expect(p.sleepers.every((s) => s.center.y <= BOUNDS.farEdgeY - 0.45 || s.center.y >= BOUNDS.frontY + 0.45)).toBe(true);
    expect(p.sleepers.every((s) => Number.isFinite(s.yawRad))).toBe(true);
  });

  it('derives class-1, class-3 and class-4 equipment consistently', () => {
    const class1 = cloneRailwayConfig();
    class1.protection.protectionClass = 'class1';
    const p1 = planRailway(BOUNDS, class1);
    expect(p1.devices).toHaveLength(2);
    expect(p1.devices.every((d) => d.hasWarning && d.hasGate)).toBe(true);

    const class3 = cloneRailwayConfig();
    class3.protection.protectionClass = 'class3';
    const p3 = planRailway(BOUNDS, class3);
    expect(p3.devices).toHaveLength(2);
    expect(p3.devices.every((d) => d.hasWarning && !d.hasGate)).toBe(true);

    const class4 = cloneRailwayConfig();
    class4.protection.protectionClass = 'class4';
    const p4 = planRailway(BOUNDS, class4);
    expect(p4.devices).toHaveLength(0);
  });

  it('supports four-quadrant split gates and optional four-mast warnings', () => {
    const cfg = cloneRailwayConfig();
    cfg.protection.gateLayout = 'split-entry-exit';
    cfg.protection.warningLayout = 'four-mast';
    const p = planRailway(BOUNDS, cfg);
    expect(p.devices).toHaveLength(4);
    expect(p.devices.filter((d) => d.hasGate)).toHaveLength(4);
    expect(p.devices.filter((d) => d.hasWarning)).toHaveLength(4);
    const roadMidY = (BOUNDS.roadNearY + BOUNDS.roadFarY) / 2;
    for (const device of p.devices) {
      // Every barrier arm points from its near/far foundation into the road.
      expect(Math.sign(roadMidY - device.gateCenter.y)).toBe(device.armDirY);
      // Equipment foundations sit beyond the outer sidewalk edges, while the
      // longer arms still reach the road centre from there.
      expect(device.gateCenter.y > roadMidY
        ? device.gateCenter.y > BOUNDS.frontY
        : device.gateCenter.y < BOUNDS.farEdgeY).toBe(true);
      expect(device.armLength).toBeGreaterThan(Math.abs(device.gateCenter.y - roadMidY));
    }
  });

  it('keeps boundary fences outside the crossing opening at skew angles', () => {
    const cfg = cloneRailwayConfig();
    cfg.placement.crossingAngleDeg = 45;
    const p = planRailway(BOUNDS, cfg);
    for (const fence of p.fences) {
      const sa = signedDistance(fence.a, p.center, p.railDirection);
      const sb = signedDistance(fence.b, p.center, p.railDirection);
      const deckS = p.crossingDeck.map((v) => signedDistance(v, p.center, p.railDirection));
      expect(Math.max(sa, sb) <= Math.min(...deckS) || Math.min(sa, sb) >= Math.max(...deckS)).toBe(true);
    }
  });

  it('reports and repairs invalid structural inputs', () => {
    const cfg = cloneRailwayConfig();
    cfg.railway.trackCount = 0;
    cfg.placement.crossingAngleDeg = 5;
    cfg.railway.trackCenterSpacingM = 0.5;
    const p = planRailway(BOUNDS, cfg);
    expect(p.validationIssues.map((x) => x.code)).toEqual([
      'INVALID_TRACK_COUNT', 'INVALID_TRACK_SPACING', 'INVALID_CROSSING_ANGLE',
    ]);
    expect(p.tracks).toHaveLength(1);
    expect(p.crossingAngleDeg).toBe(30);
  });

  it('can reduce optional safety scenery without changing the crossing core', () => {
    const cfg = cloneRailwayConfig();
    cfg.protection.equipmentLevel = 'basic';
    cfg.railway.electrification = 'none';
    const p = planRailway(BOUNDS, cfg);
    expect(p.cabinets).toHaveLength(0);
    expect(p.posts).toHaveLength(0);
    expect(p.devices).toHaveLength(2);
    expect(p.checkRails).toHaveLength(2);
  });
});
