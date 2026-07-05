// ============================================================================
// コア配置(アクセス型 → 循環コア + 共用廊下仕様)。棟長を core / segment のスロット列
// へ「ベイ総和=棟長」で厳密分割する。
//
// 重要: 日本のアパートに「階段室(内部コア)」が必ずあるわけではない。外廊下+外階段型
// (低層で最頻)は内部コアを持たず住戸が棟全体に連続する。よって internalCore フラグで
//   - internalCore=false(外階段型): コア無し。住戸が棟全体を1 segment として連続。
//   - internalCore=true(内階段型): 階段室/EV コアを差し込む。位置は中央固定でなく可変。
// tileUnits が segment を住戸で充填。純ロジック。
// ============================================================================

import type { AptConfig } from './config';
import { resolveAccessType, resolveElevator } from './config';
import type { CoreKind, CorePlacement, CorridorSpec, Slot } from './types';
import { evenSplit } from './units';
import { rand01 } from '../../shared/rng';

export interface CoreLayout {
  slots: Slot[];
  cores: CorePlacement[];
  corridor: CorridorSpec;
  access: 'stair-access' | 'single-corridor';
  elevator: boolean;
  unitBays: number; // 建物一律の住戸間口(ベイ)
  totalBays: number; // 実棟長(= sum slots)。footprint はこの値でバーを立てる(pad 幅以下)
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * コア配置 + 住戸スロット割付。住戸間口 unitBays(=w)を「先に固定」し、各セグメントを w の倍数へ
 * 量子化することで、同一建物内の全住戸が厳密に同幅になる(過小分割・セグメント跨ぎの不均一を排除)。
 * セグメントは住戸数(整数)で表し、bays = 住戸数 × w。棟長 totalBays は pad 幅以下に収める(端数は棟を
 * 少し短くして吸収 → footprint がこの totalBays でバーを立てる)。
 */
export function placeCores(cfg: AptConfig, pad: { maxWidthBays: number }, internalCore: boolean, unitBays: number): CoreLayout {
  const w = Math.max(2, Math.floor(unitBays));
  const L = Math.max(w, pad.maxWidthBays);
  const gm = cfg.gridModule;
  const access = resolveAccessType(cfg);
  // 背面の共用廊下/外廊下は両アクセス型とも確保(玄関側の床)。
  const corridorW = access === 'single-corridor' ? Math.max(cfg.corridorWidth, 1.2) : 1.2;
  const corridor: CorridorSpec = { present: true, side: 'rear', widthM: corridorW };

  const singleSegment = (): CoreLayout => {
    const n = Math.max(1, Math.floor(L / w));
    return {
      slots: [{ kind: 'segment', startBay: 0, bays: n * w, nUnits: n }],
      cores: [], corridor, access, elevator: false, unitBays: w, totalBays: n * w,
    };
  };

  // ---- 外階段型: 内部コア無し。住戸が棟全体に連続(単一セグメント)----
  if (!internalCore) return singleSegment();

  // ---- 内階段型: 階段室/EV コアを差し込む ----
  const elevator = resolveElevator(cfg);
  const coreStair = Math.max(2, Math.ceil(2.7 / gm));
  const coreEv = Math.max(3, Math.ceil(5.0 / gm));
  const isStair = access === 'stair-access';
  const nSegFor = (k: number) => (isStair ? k : k + 1); // 階段室型=k, 片廊下型=k+1 セグメント
  const coreBaysFor = (k: number, evIdx: number) =>
    Array.from({ length: k }, (_, i) => (i === evIdx ? coreEv : coreStair));
  const evIdxFor = (k: number) => (elevator ? (isStair ? Math.floor((k - 1) / 2) : 0) : -1);

  // 各セグメントに住戸(w ベイ)が1戸以上入る最大の k。
  const feasible = (k: number) => {
    if (k < 1) return !isStair; // 片廊下は k=0(コア無し全長1セグ)可、階段室型は不可
    const C = sum(coreBaysFor(k, evIdxFor(k)));
    return L - C >= nSegFor(k) * w;
  };
  let k = isStair
    ? Math.max(1, Math.round(L / (coreStair + Math.max(1, cfg.stairSpacingUnits) * w)))
    : Math.max(L * gm > 40 ? 2 : 1, Math.round((L * gm) / 35));
  k = Math.max(isStair ? 1 : 0, k);
  while (k > (isStair ? 1 : 0) && !feasible(k)) k--;
  if (isStair && !feasible(k)) return singleSegment(); // 極小: コアを置く余地なし

  const coreBaysList = coreBaysFor(k, evIdxFor(k));
  const C = sum(coreBaysList);
  const nSeg = nSegFor(k);
  const totalUnits = Math.max(nSeg, Math.floor((L - C) / w));

  // 住戸数をセグメントへ配分(整数戸)。片廊下・単コアは seed で左右に寄せる。
  let counts: number[];
  if (!isStair && k === 1) {
    const fr = [0.3, 0.5, 0.7][Math.floor(rand01(cfg.seed, 0xc07e) * 3)];
    const before = clamp(Math.round(fr * totalUnits), 1, totalUnits - 1);
    counts = [before, totalUnits - before];
  } else {
    counts = evenSplit(totalUnits, nSeg);
  }

  const slots: Slot[] = [];
  const cores: CorePlacement[] = [];
  let cur = 0;
  const pushSeg = (ci: number) => {
    const b = counts[ci] * w;
    slots.push({ kind: 'segment', startBay: cur, bays: b, nUnits: counts[ci] });
    cur += b;
  };
  const pushCore = (i: number) => {
    const cb = coreBaysList[i];
    const kind: CoreKind = cb === coreEv ? 'stair-ev' : 'stair';
    slots.push({ kind: 'core', startBay: cur, bays: cb, core: kind });
    cores.push({ kind, startBay: cur, bays: cb });
    cur += cb;
  };
  if (isStair) {
    for (let i = 0; i < k; i++) { pushCore(i); pushSeg(i); } // [core][seg] × k
  } else {
    for (let i = 0; i < nSeg; i++) { pushSeg(i); if (i < k) pushCore(i); } // [seg][core]…[seg]
  }
  return { slots, cores, corridor, access, elevator, unitBays: w, totalBays: cur };
}
