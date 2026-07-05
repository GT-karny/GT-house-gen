// ============================================================================
// トップレベル集合住宅ジェネレータ: lot + config → AptBuildingPlan + roofs + site。
// house/store の generateHouse/generateStore と同型の薄いオーケストレーション:
//   resolveFloors → planAptSite → placeCores → tileUnits → footprint → facade
//   → roofs/塔屋 or 外階段。純ロジック(描画非依存・移植可能)。
// ============================================================================

import type { AptConfig } from './config';
import {
  resolveFloors, resolveExteriorStair, resolveStairPlacement, resolveCoreStyle,
  resolveGridModule, resolveUnitDepth, resolveBuildingLengthBays, resolveUnitBays,
} from './config';
import type { AptBuildingPlan, AptLot, AptSitePlan } from './types';
import { planAptSite } from './site';
import { placeCores } from './cores';
import { tileUnits } from './units';
import { generateAptFootprint } from './footprint';
import { generateAptFacade } from './facade';
import { buildAptRoofs, buildPenthouses, type AptRoofMass } from './roof';
import { buildExteriorStairs } from './stairs';

export interface AptResult {
  plan: AptBuildingPlan;
  roofs: AptRoofMass[];
  site: AptSitePlan;
}

export function generateApartment(lot: AptLot, cfg: AptConfig): AptResult {
  // 階数・パネル幅(左右)・住戸奥行(前後)を seed で解決し、以降は解決済み値で一貫生成する。
  // gridModule/unitDepth を建物ごとに振ることで、棟の粒度・窓割リズム・前後アスペクトが seed で変わる(§10.6)。
  const floors = resolveFloors(cfg);
  const rc: AptConfig = {
    ...cfg, floors,
    gridModule: resolveGridModule(cfg),
    unitDepth: resolveUnitDepth(cfg),
    buildingLengthBays: resolveBuildingLengthBays(cfg),
  };
  const extStair = resolveExteriorStair(rc, floors);
  // 外階段型は内部コア(階段室)を持たず住戸が棟全体に連続。内階段型のみコアを差し込む。
  const internalCore = !extStair;

  const site = planAptSite(lot, rc);
  // 住戸間口 w を先に固定 → placeCores が各セグメントを w の倍数へ量子化 → 全住戸が厳密に同幅。
  // 実棟長 totalBays(≤ pad 幅)でバーを立てるので、端数は棟を少し短くして吸収する。
  const w = resolveUnitBays(rc);
  const { slots, cores, corridor, access, totalBays } = placeCores(rc, site.pad, internalCore, w);
  const fp = generateAptFootprint(rc, site.pad, totalBays);
  const units = tileUnits(rc, slots, w);

  const { panels, balconies, corridors, partitions } = generateAptFacade(
    rc, fp.bar, units, cores, corridor, lot.baseZ, floors, resolveCoreStyle(rc)
  );
  const roofs = buildAptRoofs(fp.masses, lot.baseZ, rc.panelH, rc.roofForm, rc.roofPitch);
  // 低層(外階段)は塔屋なし。中高層(内階段)のみ EV/階段室 PH を載せる。
  const penthouses = extStair ? [] : buildPenthouses(rc, fp.bar, cores, lot.baseZ);
  const exteriorStairs = extStair
    ? buildExteriorStairs(rc, fp.bar, corridor, lot.baseZ, floors, resolveStairPlacement(rc))
    : [];

  const unitCount = units.length * floors;

  // 附置義務は総戸数から確定(物理容量が不足なら無音違反せずフラグを立てる)
  site.parkingRequired = Math.ceil(unitCount * rc.parkingRatioPerUnit);
  site.parkingShort = site.parking.count < site.parkingRequired;
  site.bikeRequired = Math.ceil(unitCount * rc.bicycleRatioPerUnit);

  const plan: AptBuildingPlan = {
    masses: fp.masses,
    footprintRing: fp.ring,
    tiers: fp.tiers,
    bar: fp.bar,
    slots,
    units,
    cores,
    corridor,
    floors,
    floorHeight: rc.panelH,
    panels,
    balconies,
    corridors,
    partitions,
    penthouses,
    exteriorStairs,
    unitCount,
    accessType: access,
    structure: rc.structure,
  };
  return { plan, roofs, site };
}
