// ============================================================================
// Top-level generator: lot + config → BuildingPlan. Pipeline:
// footprint composition (with per-mass storeys) → per-storey facade →
// roles → openings + balconies. Roofs step per mass.
// ============================================================================

import type { GenConfig } from './config';
import type { BuildingPlan, Lot, SitePlan } from './types';
import { generateFootprint } from './footprint';
import { buildFaces, generateFacade } from './facade';
import { buildRoofs, type RoofMass, type RoofStyle } from './roof';
import { planSite } from './site';

export interface GenerateOptions {
  roofStyle?: RoofStyle;
  roofPitch?: number;
}

export interface HouseResult {
  plan: BuildingPlan;
  roofs: RoofMass[];
  site: SitePlan;
}

export function generateHouse(lot: Lot, cfg: GenConfig, opts: GenerateOptions = {}): HouseResult {
  const site = planSite(lot, cfg); // lay out the lot; the pad fits the house into it
  const fp = generateFootprint(lot, cfg, site.pad);
  const { panels, balconies } = generateFacade(fp.tiers, cfg, lot, lot.baseZ);
  const roofs = buildRoofs(fp.masses, lot.baseZ, cfg.panelH, opts.roofStyle ?? 'flat', opts.roofPitch ?? 0.6);

  const plan: BuildingPlan = {
    masses: fp.masses,
    footprintRing: fp.ring,
    faces: buildFaces(fp.ring, cfg, lot), // ground faces for HUD/debug
    floors: cfg.floors,
    floorHeight: cfg.panelH,
    panels,
    balconies,
    archetype: fp.archetype,
  };
  return { plan, roofs, site };
}
