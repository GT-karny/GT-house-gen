// ============================================================================
// 集合住宅フットプリント。M1 は I 型(単一バー)に限定(L/U は M2)。pad から棟の
// 矩形マスを整数ベイ格子上に置き、shared の rasterize→boundary-trace で ring 化する
// (壁長=gridModule 整数倍を保証)。基準階を全階へスタックするので tier は floor 0 の
// 1枚のみ(塔屋 PH と上層セットバックは別途)。facade/roof が使う BarFrame を返す。
// 純ロジック(描画非依存)。
// ============================================================================

import type { AptConfig } from './config';
import type { AptMass, AptPad, BarFrame, Vec2 } from './types';
import { rasterizeRects, traceBoundary, type GridRect } from '../../shared/geom2d';
import { add, scale } from '../../shared/vec';

export interface AptFootprint {
  ring: Vec2[]; // 地上 union ring, world XY CCW
  tiers: { floor: number; ring: Vec2[] }[];
  masses: AptMass[];
  bar: BarFrame;
}

export function generateAptFootprint(cfg: AptConfig, pad: AptPad, lengthBays?: number): AptFootprint {
  const gm = cfg.gridModule;
  // 実棟長(placeCores が住戸間口 w の倍数へ量子化した totalBays)。未指定時は pad 幅。
  const L = Math.max(1, Math.min(lengthBays ?? pad.maxWidthBays, pad.maxWidthBays));
  const D = Math.max(1, pad.maxDepthBays);
  const { axisU, axisV } = pad;

  // (u,v) ベイ → ワールド。origin=(u=0,v=0)=前面左コーナー、v は前面→背面(道路から離れる)。
  const worldOf = (gu: number, gv: number): Vec2 =>
    add(pad.originWorld, add(scale(axisU, gu * gm), scale(axisV, gv * gm)));

  const rects: GridRect[] = [{ x0: 0, y0: 0, x1: L, y1: D }];
  const ring = traceBoundary(rasterizeRects(rects)).map((p) => worldOf(p.x, p.y));
  const tiers = [{ floor: 0, ring }];

  const masses: AptMass[] = [
    {
      obb: {
        center: worldOf(L / 2, D / 2),
        axisU,
        axisV,
        halfU: (L * gm) / 2,
        halfV: (D * gm) / 2,
      },
      floors: cfg.floors,
    },
  ];

  const bar: BarFrame = { origin: pad.originWorld, axisU, axisV, lengthBays: L, depthBays: D, gridModule: gm };
  return { ring, tiers, masses, bar };
}
