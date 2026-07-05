// ============================================================================
// Store roof (per mass). Big boxes are flat (陸屋根 + パラペット, drawn on the
// render side); family-restaurant masses can be gable/hip. Each mass caps at its
// own storey count so a single-storey service wing steps below the main box.
// Mirrors src/gen/roof.ts. Pure logic.
// ============================================================================

import type { StoreMass } from './types';

export type StoreRoofStyle = 'flat' | 'gable' | 'hip' | 'mono' | 'mansard';

export interface StoreRoofMass {
  obb: StoreMass['obb'];
  eaveZ: number;
  ridgeZ: number;
  style: StoreRoofStyle;
}

export function buildStoreRoofs(
  masses: StoreMass[],
  baseZ: number,
  floorHeight: number,
  style: StoreRoofStyle,
  pitch: number
): StoreRoofMass[] {
  return masses.map((m) => {
    const eaveZ = baseZ + m.floors * floorHeight;
    // mansard: a shallow decorative band (~1.2–2.6 m) wrapping the wall top, NOT a
    // full pitch — the flat plateau above it is hidden. Others rise by pitch.
    const rise =
      style === 'flat'
        ? 0
        : style === 'mansard'
          ? Math.max(1.2, Math.min(2.6, Math.min(m.obb.halfU, m.obb.halfV) * pitch))
          : Math.min(m.obb.halfU, m.obb.halfV) * pitch;
    return { obb: m.obb, eaveZ, ridgeZ: eaveZ + rise, style };
  });
}
