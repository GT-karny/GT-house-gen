import { describe, expect, it } from 'vitest';
import { planRailway } from './plan';
import { resolveCrossingScenario } from './scenario';
import type { CrossingGenerationInput, CrossingScenario, RailwayBounds } from './types';

const SCENARIOS: CrossingScenario[] = [
  { railwayClass: 'branch', roadClass: 'footpath', context: 'rural', history: 'modern' },
  { railwayClass: 'branch', roadClass: 'local', context: 'rural', history: 'modern' },
  { railwayClass: 'regional', roadClass: 'collector', context: 'suburban', history: 'modern' },
  { railwayClass: 'suburban', roadClass: 'collector', context: 'urban', history: 'modern' },
  { railwayClass: 'trunk', roadClass: 'arterial', context: 'urban', history: 'modern' },
  { railwayClass: 'branch', roadClass: 'footpath', context: 'rural', history: 'legacy' },
];
const BOUNDS: RailwayBounds = {
  xMin: -20, xMax: 20, frontY: -8, rearY: 8,
  roadNearY: -9.6, roadFarY: -15.6, farEdgeY: -17.1, roadLaneCount: 2,
};

const inputFor = (scenario: CrossingScenario, seed: number): CrossingGenerationInput => ({ ...scenario, seed });

describe('crossing scenario resolver', () => {
  it('is deterministic and produces complete adjacent-track spacing arrays', () => {
    for (const scenario of SCENARIOS) {
      const input = inputFor(scenario, 42);
      const a = resolveCrossingScenario(input);
      const b = resolveCrossingScenario(input);
      expect(a).toEqual(b);
      expect(a.config.railway.trackCenterSpacingsM).toHaveLength(a.config.railway.trackCount - 1);
      expect(a.road.lanes.length).toBeGreaterThan(0);
      expect(Number.isFinite(a.assessment.crossingTimeS)).toBe(true);
    }
  });

  it('never removes safety-critical equipment merely because the seed changes', () => {
    for (const scenario of SCENARIOS.filter((value) => value.history !== 'legacy')) {
      const signatures = new Set<string>();
      for (let seed = 0; seed < 20; seed++) {
        const resolved = resolveCrossingScenario(inputFor(scenario, seed));
        signatures.add(JSON.stringify({
          protectionClass: resolved.config.protection.protectionClass,
          gateLayout: resolved.config.protection.gateLayout,
          warningLayout: resolved.config.protection.warningLayout,
        }));
      }
      expect(signatures.size).toBe(1);
    }
  });

  it('only legacy history creates class-4 and reports its safety warning', () => {
    for (const scenario of SCENARIOS) {
      const resolved = resolveCrossingScenario(inputFor(scenario, 7));
      const plan = planRailway(BOUNDS, resolved.config);
      if (scenario.history === 'legacy') {
        expect(plan.protectionClass).toBe('class4');
        expect(plan.validationIssues.some((issue) => issue.code === 'LEGACY_PROTECTION')).toBe(true);
      } else {
        expect(plan.protectionClass).not.toBe('class4');
      }
    }
  });

  it('honors explicit structural overrides and reports inconsistent protection', () => {
    const resolved = resolveCrossingScenario({
      railwayClass: 'suburban', roadClass: 'collector', context: 'suburban', history: 'modern', seed: 4,
      overrides: {
        railway: { trackCount: 3, trackCenterSpacingsM: [3.7, 4.1] },
        protection: { protectionClass: 'class1', gateLayout: 'none' },
      },
    });
    const plan = planRailway(BOUNDS, resolved.config);
    expect(plan.trackCenterSpacingsM).toEqual([3.7, 4.1]);
    expect(plan.tracks).toHaveLength(3);
    expect(plan.protectionClass).toBe('class3');
    expect(plan.validationIssues.some((issue) => issue.code === 'PROTECTION_CLASS_MISMATCH')).toBe(true);
  });
});
