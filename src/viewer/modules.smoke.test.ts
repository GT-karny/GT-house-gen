import { describe, it, expect } from 'vitest';
import { makeWindowModule, makeDoorModule } from './modules';
import type { WindowSize } from '../gen/types';

function check(mod: { geometry: any; materials: any[] }) {
  expect(mod.geometry.getAttribute('position').count).toBeGreaterThan(0);
  expect(mod.geometry.groups.length).toBe(mod.materials.length);
}

describe('opening module assembly', () => {
  for (const size of ['small', 'medium', 'large'] as WindowSize[]) {
    it(`window (${size}) builds a non-empty, group/material-consistent mesh`, () => {
      check(makeWindowModule(1.82, 2.9, size));
    });
  }
  it('door builds correctly across styles / canopy / recess / sidelight', () => {
    for (const style of ['panel', 'glass', 'flush'] as const) {
      check(makeDoorModule(1.82, 2.9, { style }));
      check(makeDoorModule(1.82, 2.9, { style, canopy: true }));
      check(makeDoorModule(1.82, 2.9, { style, recessed: true })); // 奥まった玄関
      check(makeDoorModule(1.82, 2.9, { style, sidelight: true })); // 袖ガラス
    }
  });
});
