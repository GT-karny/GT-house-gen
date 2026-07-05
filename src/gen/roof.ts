// ============================================================================
// Roof (per mass). Each source mass caps at its OWN storey count, so a 下屋
// wing gets a lower roof than the 総二階 core — the stepped silhouette real
// Japanese houses have. 'flat' → 陸屋根 (parapet drawn on the render side).
// ============================================================================

import type { MassInfo } from './types';

export type RoofStyle = 'flat' | 'gable' | 'hip' | 'mono';

export interface RoofMass {
  obb: MassInfo['obb'];
  eaveZ: number; // top-of-wall height for this mass
  ridgeZ: number; // ridge height (== eaveZ for flat)
  style: RoofStyle;
}

/** Build a roof descriptor per source mass, using each mass's storey count. */
export function buildRoofs(
  masses: MassInfo[],
  baseZ: number,
  floorHeight: number,
  style: RoofStyle,
  pitch: number
): RoofMass[] {
  return masses.map((m) => {
    const eaveZ = baseZ + m.floors * floorHeight;
    const rise = style === 'flat' ? 0 : Math.min(m.obb.halfU, m.obb.halfV) * pitch;
    return { obb: m.obb, eaveZ, ridgeZ: eaveZ + rise, style };
  });
}
