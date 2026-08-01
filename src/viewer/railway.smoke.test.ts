import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cloneRailwayConfig, planRailway } from '../env/railway';
import { railwayGroup, segmentYawToThree, xAxisYawToThree } from './railway';
import { gatePlacementForDevice, gateYawForDevice } from './railwayAssets';

const bounds = {
  xMin: -18, xMax: 18, frontY: -8, rearY: 8,
  roadNearY: -9.6, roadFarY: -14.6, farEdgeY: -15.8,
};

describe('Japanese level-crossing renderer', () => {
  it('maps generation XY directions to Three XZ without mirroring skew lines', () => {
    const a = { x: -2, y: -3 };
    const b = { x: 4, y: 5 };
    const expected = new THREE.Vector3(b.x - a.x, 0, -(b.y - a.y)).normalize();
    const localZ = new THREE.Vector3(0, 0, 1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0), segmentYawToThree(a, b),
    );
    const localX = new THREE.Vector3(1, 0, 0).applyAxisAngle(
      new THREE.Vector3(0, 1, 0), xAxisYawToThree(a, b),
    );
    expect(localZ.dot(expected)).toBeCloseTo(1, 8);
    expect(localX.dot(expected)).toBeCloseTo(1, 8);
  });

  it('rotates near- and far-side authored gate arms toward the road', () => {
    expect(gateYawForDevice({ armDirY: -1 })).toBeCloseTo(-Math.PI / 2);
    expect(gateYawForDevice({ armDirY: 1 })).toBeCloseTo(Math.PI / 2);
  });

  it('cancels the authored 0.34 m arm offset for opposing gates', () => {
    const gateCenter = { x: 12, y: -8 };
    for (const armDirY of [-1, 1] as const) {
      const placement = gatePlacementForDevice({ gateCenter, armDirY });
      const worldArmX = placement.x + Math.sin(placement.yaw) * 0.34;
      expect(worldArmX).toBeCloseTo(gateCenter.x, 8);
    }
  });

  it('builds finite geometry across structural variants', () => {
    const variants = [];
    for (const angle of [90, 60, 30]) {
      const cfg = cloneRailwayConfig();
      cfg.placement.crossingAngleDeg = angle;
      cfg.railway.trackCount = angle === 90 ? 1 : angle === 60 ? 2 : 4;
      variants.push(cfg);
    }
    const class3 = cloneRailwayConfig();
    class3.protection.protectionClass = 'class3';
    class3.railway.electrification = 'none';
    variants.push(class3);
    const class4 = cloneRailwayConfig();
    class4.protection.protectionClass = 'class4';
    variants.push(class4);

    for (const cfg of variants) {
      const plan = planRailway(bounds, cfg);
      const g = railwayGroup(plan);
      expect(g.children.length).toBeGreaterThan(4);
      expect(g.getObjectsByProperty('name', 'crossing-warning-assembly')).toHaveLength(
        plan.devices.filter((d) => d.hasWarning).length,
      );
      expect(g.getObjectsByProperty('name', 'crossing-gate-machine')).toHaveLength(
        plan.devices.filter((d) => d.hasGate).length,
      );
      g.updateMatrixWorld(true);
      g.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
  });
});
