// ============================================================================
// 集合住宅屋根 + 塔屋(PH)。RC は陸屋根(flat)+パラペット(描画側で厚み付け)、木造
// は勾配(gable/hip)。屋根マス生成は store の buildStoreRoofs をそのまま再利用。塔屋は
// 屋上のコア位置(EV コア優先)に載る小マス。純ロジック。
// ============================================================================

import type { AptConfig } from './config';
import type { AptMass, BarFrame, CorePlacement, Penthouse } from './types';
import { buildStoreRoofs, type StoreRoofMass, type StoreRoofStyle } from '../../store/gen/roof';
import { add, scale } from '../../shared/vec';

export type { StoreRoofMass as AptRoofMass };

export function buildAptRoofs(
  masses: AptMass[],
  baseZ: number,
  floorHeight: number,
  style: StoreRoofStyle,
  pitch: number
): StoreRoofMass[] {
  return buildStoreRoofs(masses, baseZ, floorHeight, style, pitch);
}

/** 屋上塔屋(PH)。EV コア(無ければ中央コア)に階段室/EV機械室の小マスを載せる。 */
export function buildPenthouses(cfg: AptConfig, bar: BarFrame, cores: CorePlacement[], baseZ: number): Penthouse[] {
  if (!cfg.penthouse || cores.length === 0 || bar.depthBays < 2) return [];
  const gm = bar.gridModule;
  const evCore = cores.find((c) => c.kind === 'stair-ev') ?? cores[Math.floor(cores.length / 2)];
  const uc = (evCore.startBay + evCore.bays / 2) * gm;
  const phDepthBays = Math.min(bar.depthBays, Math.max(2, Math.ceil(3 / gm)));
  const center = add(add(bar.origin, scale(bar.axisU, uc)), scale(bar.axisV, bar.depthBays * gm * 0.5));
  return [
    {
      obb: {
        center,
        axisU: bar.axisU,
        axisV: bar.axisV,
        halfU: (evCore.bays * gm) / 2,
        halfV: (phDepthBays * gm) / 2,
      },
      z: baseZ + cfg.floors * cfg.panelH,
      height: cfg.panelH * 0.9,
      kind: evCore.kind,
    },
  ];
}
