// ============================================================================
// Top-level store generator: lot + config → StoreBuildingPlan + roofs + site.
// Mirrors house-gen generateHouse: planStoreSite → footprint → storefront →
// roofs, plus an optional entrance canopy. Pure logic (renderer-agnostic).
// ============================================================================

import type { StoreConfig } from './config';
import type { StoreBuildingPlan, StoreLot, StoreSitePlan, Canopy, SignInstance, Vec2 } from './types';
import { planStoreSite } from './site';
import { generateStoreFootprint } from './footprint';
import { buildStoreFaces, generateStorefront } from './facade';
import { buildStoreRoofs, type StoreRoofMass, type StoreRoofStyle } from './roof';
import { placeWallSign, placeBladeSign, placeRooftopSign, resolveLogoId } from './signage';
import { add, scale } from '../../shared/vec';

export interface StoreGenerateOptions {
  roofForm?: StoreRoofStyle;
  roofPitch?: number;
}

export interface StoreResult {
  plan: StoreBuildingPlan;
  roofs: StoreRoofMass[];
  site: StoreSitePlan;
}

export function generateStore(lot: StoreLot, cfg: StoreConfig, opts: StoreGenerateOptions = {}): StoreResult {
  const site = planStoreSite(lot, cfg);
  const fp = generateStoreFootprint(lot, cfg, site.pad);
  const panels = generateStorefront(fp.tiers, cfg, lot, lot.baseZ);
  const style = opts.roofForm ?? cfg.roofForm;
  const roofs = buildStoreRoofs(fp.masses, lot.baseZ, cfg.panelH, style, opts.roofPitch ?? cfg.roofPitch);

  // entrance canopy (車寄せ) for the box-canopy archetype: a flat slab on posts
  // spanning the middle of the frontage, projecting toward the road.
  // box-canopy's flat 車寄せ slab. Suppressed when a gabled entrance porch is on
  // (entranceGable) — otherwise the two canopies stack over the same entrance.
  const canopies: Canopy[] = [];
  if (fp.archetype === 'box-canopy' && !cfg.entranceGable) {
    const { pad } = site;
    const BW = pad.maxWidthBays * cfg.panelW;
    const BD = pad.maxDepthBays * cfg.panelW;
    const cw = Math.min(BW * 0.5, 10);
    const cd = 4.5;
    // pad.originWorld is the min-U rear corner; front-of-building is −axisV*BD.
    const cU0 = (BW - cw) / 2; // along U from the min-U corner
    const at = (du: number, dvFromRear: number): Vec2 =>
      add(pad.originWorld, add(scale(pad.axisU, du), scale(pad.axisV, -dvFromRear)));
    const ring = [at(cU0, BD), at(cU0 + cw, BD), at(cU0 + cw, BD + cd), at(cU0, BD + cd)];
    canopies.push({ ring, height: Math.min(cfg.panelH * 0.8, 3.6), z: lot.baseZ });
  }

  const faces = buildStoreFaces(fp.ring, cfg, lot);

  // building-mounted signage on the frontage: a wall logo box and/or a projecting
  // blade sign, hung off the tallest (main) mass. The discrete wall sign is
  // suppressed when a continuous signage band already brands that face (they'd
  // overlap); on a mansard it becomes a billboard on the decorative band.
  const signs: SignInstance[] = [];
  const frontage = faces.find((f) => f.role === 'frontage');
  if (frontage) {
    const mainRoof = roofs.reduce((a, b) => (b.eaveZ > a.eaveZ ? b : a), roofs[0]);
    const eaveZ = mainRoof ? mainRoof.eaveZ : lot.baseZ + cfg.floors * cfg.panelH;
    const bandH = mainRoof && mainRoof.style === 'mansard' ? mainRoof.ridgeZ - mainRoof.eaveZ : 0;
    if (cfg.wallSign && !cfg.signband) signs.push(placeWallSign(cfg, frontage, eaveZ, bandH, cfg.entranceGable));
    if (cfg.bladeSign) signs.push(placeBladeSign(cfg, frontage, lot.baseZ, eaveZ));

    // 屋上看板: flat roofs only — a seed-random cube/board on the main (tallest) mass.
    if (cfg.rooftopSign && style === 'flat' && mainRoof) {
      const mainMass = fp.masses.find((m) => m.obb === mainRoof.obb) ?? fp.masses[0];
      const rt = placeRooftopSign(cfg, mainMass.obb, mainRoof.eaveZ, frontage.normal);
      if (rt) signs.push(rt);
    }
  }

  const plan: StoreBuildingPlan = {
    masses: fp.masses,
    footprintRing: fp.ring,
    faces,
    floors: cfg.floors,
    floorHeight: cfg.panelH,
    panels,
    canopies,
    signs,
    logoId: resolveLogoId(cfg),
    archetype: fp.archetype,
  };
  return { plan, roofs, site };
}
