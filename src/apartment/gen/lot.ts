// ============================================================================
// サンプル集合住宅敷地ファクトリ。実パイプラインでは上流の block→lot 分割から敷地
// リング(任意凸ポリゴン)が来る。ここでは store の敷地ファクトリを再利用し、AptLot
// 形へ渡すだけ(StoreLot と AptLot は構造的に同一)。生成器自体は任意の凸 ring を受ける。
// ============================================================================

import type { AptLot } from './types';
import { makeSampleStoreLot, type LotShape } from '../../store/gen/lot';

export type { LotShape };

export function makeSampleAptLot(
  width = 26,
  depth = 30,
  shape: LotShape = 'rectangle',
  seed = 1
): AptLot {
  // StoreLot は AptLot と同一フィールド(ring/baseZ/areaM2/centroid/longestEdgeDir/
  // primaryRoadId/adjacentRoadIds/roadDir)なので構造的にそのまま使える。
  return makeSampleStoreLot(width, depth, shape, seed) as AptLot;
}
