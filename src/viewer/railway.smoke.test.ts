import { describe, expect, it } from 'vitest';
import { DEFAULT_RAILWAY, planRailway } from '../env/railway';
import { railwayGroup } from './railway';

const bounds = {
  xMin: -18, xMax: 18, frontY: -8, rearY: 8,
  roadNearY: -9.6, roadFarY: -14.6, farEdgeY: -15.8,
};

describe('Japanese level-crossing renderer', () => {
  it('builds finite geometry across detailed and basic variants', () => {
    const variants = [
      { ...DEFAULT_RAILWAY, barrierClosed: false, warningActive: false, sleeperType: 'pc' as const },
      { ...DEFAULT_RAILWAY, barrierClosed: true, warningActive: true, sleeperType: 'wood' as const },
      { ...DEFAULT_RAILWAY, safetyEquipment: 'basic' as const, electrified: false },
    ];
    for (const cfg of variants) {
      const g = railwayGroup(planRailway(bounds, cfg));
      expect(g.children.length).toBeGreaterThan(8);
      expect(g.getObjectsByProperty('name', 'crossing-warning-assembly')).toHaveLength(2);
      expect(g.getObjectsByProperty('name', 'crossing-gate-machine')).toHaveLength(2);
      expect(g.getObjectsByProperty('name', 'sc-gate-cabinet')).toHaveLength(2);
      g.updateMatrixWorld(true);
      g.traverse((o) => {
        expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true);
      });
    }
  });
});
