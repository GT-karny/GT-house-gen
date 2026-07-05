// ============================================================================
// Sample lot factory. In the real pipeline the Lot comes from an upstream
// block→lot subdivision (any CONVEX polygon); here we synthesize a few shapes so
// the prototype can exercise non-rectangular parcels too: a plain rectangle, an
// irregular (skewed/trapezoidal) quad, a rounded-corner lot (交差点の丸角), and a
// chamfered lot (隅切り). Orientation is fixed (long axis = +X, road to the south
// / -Y) so the interesting variation stays in the footprint + facade + siting.
//
// The shape factory is SHARED with the store/apartment generators
// (`makeSampleStoreLot`); StoreLot is structurally identical to Lot, so we reuse
// it and expose the same LotShape union. The generator itself accepts ANY convex
// `Lot.ring` — the site planner fits/clips to the actual polygon.
// ============================================================================

import type { Lot } from './types';
import { makeSampleStoreLot, type LotShape } from '../store/gen/lot';

export type { LotShape };

export function makeSampleLot(
  width = 14,
  depth = 16,
  shape: LotShape = 'rectangle',
  seed = 1,
): Lot {
  // StoreLot has the same fields as Lot (ring/baseZ/areaM2/centroid/
  // longestEdgeDir/primaryRoadId/adjacentRoadIds/roadDir), so it maps straight
  // across. The default (rectangle) reproduces the previous sample lot exactly.
  return makeSampleStoreLot(width, depth, shape, seed) as unknown as Lot;
}
