// ============================================================================
// 住戸タイリング(このジェネレータの主役)。placeCores が棟長を core / segment
// スロットへ順序分割し、tileUnits が各 segment を「可変幅住戸のビンパッキング」で
// 埋める。整数ベイ格子上で正確に充填(端数吸収)し、壁長が必ず gridModule の整数倍に
// なることを保証する — 戸建の archetype 合成・店舗の単一箱に無い制約。純ロジック。
// ============================================================================

import type { AptConfig } from './config';
import type { Slot, Unit, UnitType } from './types';

/** total を parts 個へできるだけ均等分割(差は高々1)。総和は必ず total。 */
export function evenSplit(total: number, parts: number): number[] {
  const p = Math.max(1, parts);
  const base = Math.floor(total / p);
  const rem = total - base * p;
  const out: number[] = [];
  for (let i = 0; i < p; i++) out.push(base + (i < rem ? 1 : 0));
  return out;
}

/** unitMix 加重の平均間口ベイ(コア個数・segment 戸数の見積りに使う)。 */
export function weightedAvgUnitBays(cfg: AptConfig): number {
  let s = 0;
  let w = 0;
  for (const t of Object.keys(cfg.unitBays) as UnitType[]) {
    const m = Math.max(0, cfg.unitMix[t]);
    s += m * cfg.unitBays[t];
    w += m;
  }
  return w > 0 ? s / w : 3;
}

/** ベイ幅 w に最も近い住戸タイプを選ぶ(mix 重みでタイブレーク)。決定論。 */
export function typeForBays(cfg: AptConfig, w: number): UnitType {
  const all = Object.keys(cfg.unitBays) as UnitType[];
  const pool = all.filter((t) => cfg.unitMix[t] > 0);
  const cands = pool.length ? pool : all;
  let best = cands[0];
  let bestScore = Infinity;
  for (const t of cands) {
    // |ベイ差| を主、mix 重みで僅かに優遇 → 同距離なら人気タイプを選ぶ
    const score = Math.abs(cfg.unitBays[t] - w) - 0.001 * Math.max(0, cfg.unitMix[t]);
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/**
 * 各 segment スロットを住戸で充填する。segment.bays は placeCores が w(建物一律の住戸間口)の倍数へ
 * 量子化済みなので、各 segment を bays/w 個へ均等割り = 全住戸が厳密に幅 w。建物全体で同幅・過小分割
 * なし(§10.6)。壁長=整数ベイ倍・総和=segment ベイ・各住戸 >= w は不変。
 */
export function tileUnits(cfg: AptConfig, slots: Slot[], w: number): Unit[] {
  const units: Unit[] = [];
  const uw = Math.max(1, Math.floor(w));
  for (const s of slots) {
    if (s.kind !== 'segment') continue;
    const n = Math.max(1, Math.round(s.bays / uw));
    let cur = s.startBay;
    for (const bw of evenSplit(s.bays, n)) {
      units.push({ type: typeForBays(cfg, bw), startBay: cur, bays: bw });
      cur += bw;
    }
  }
  return units;
}
