// ============================================================================
// 屋外鉄骨階段(外階段型)。Web 調査(屋外用鉄骨階段廊下ユニット「段十廊」/「アパット」、
// 折り返し=踊場で180°折り返す「コの字」)に基づく。バルコニーの反対側=アクセス側
// (背面/外廊下側)で、走りを棟長方向(along/u)に取り、奥行は2フライト側並び(spanV)。
// **外廊下の外側(offsetV)に張り出して**廊下へ接続する。内部コアには依存せず、棟長から
// 位置を決める(gable=妻側1基 / rear=中央固定でない可変位置。長い棟は2基)。純ロジック。
// ============================================================================

import type { AptConfig } from './config';
import type { BarFrame, CorridorSpec, ExteriorStair } from './types';
import { add, scale } from '../../shared/vec';
import { rand01 } from '../../shared/rng';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** 折返し階段の奥行(2フライト側並び)。階段は廊下の外へ offsetV(=廊下幅)からこの寸法
 *  ぶん張り出す。site 側が敷地内に収める予約(廊下側リザーブ)に使用する。 */
export const EXT_STAIR_SPAN_V = 1.9;

export function buildExteriorStairs(
  cfg: AptConfig,
  bar: BarFrame,
  corridor: CorridorSpec,
  baseZ: number,
  floors: number,
  placement: 'rear' | 'gable'
): ExteriorStair[] {
  const gm = bar.gridModule;
  const barLenM = bar.lengthBays * gm;
  const barDepM = bar.depthBays * gm;
  const outward = bar.axisV;
  const along = bar.axisU;
  const halfRise = cfg.panelH / 2;
  const flightRun = halfRise / Math.tan((38 * Math.PI) / 180);
  const runU = Math.max(2.2, Math.min(3.4, flightRun + 0.8));
  const spanV = EXT_STAIR_SPAN_V;
  const offsetV = corridor.present ? corridor.widthM : 0;
  const lo = runU / 2, hi = Math.max(runU / 2, barLenM - runU / 2);

  const mk = (uc: number): ExteriorStair => {
    const base = add(add(bar.origin, scale(along, uc)), scale(outward, barDepM));
    return { base, outward, along, z: baseZ, floors, floorHeight: cfg.panelH, runU, spanV, offsetV, kind: 'switchback' };
  };

  const positions: number[] = [];
  if (placement === 'gable') {
    // 妻側1基。左右どちらかは seed。
    positions.push(rand01(cfg.seed, 0x57a3) < 0.5 ? lo : hi);
  } else {
    // 背面: 短い棟は1基(位置は中央固定でなく 0.3〜0.7 で可変)、長い棟は2基。
    const n = barLenM > 34 ? 2 : 1;
    if (n === 1) positions.push(clamp((0.3 + 0.4 * rand01(cfg.seed, 0x57a4)) * barLenM, lo, hi));
    else positions.push(clamp(barLenM * 0.28, lo, hi), clamp(barLenM * 0.72, lo, hi));
  }
  return positions.map(mk);
}
