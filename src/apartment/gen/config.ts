// ============================================================================
// 集合住宅ジェネレータのパラメータ。全 tunable の単一情報源(GUI と将来の移植先が共有)。
// 業態プリセットは Partial<AptConfig> を DEFAULT に spread(house/store と同機構、
// レジストリ無し)。長さはメートル。
//
// 設計方針(docs/apartment-gen-research.md):
//  - accessType が最上位パラメータ(棟奥行き・面・コア数・廊下を連鎖決定)。
//  - structure がゲート(最大階数・スパン・屋根・耐火の有効域をクランプ)。
//  - 既存規約(座標系/rand01 決定論/整数ベイ格子/Partialプリセット)を完全踏襲。
// ============================================================================

import { rand01 } from '../../shared/rng';
import type { UnitType } from './types';

/** アクセス型。M1 は stair-access(階段室型)/ single-corridor(片廊下型)の2型。
 *  double-corridor(中廊下)/ core-tower(コア型)は M2 以降。 */
export type AccessType = 'stair-access' | 'single-corridor' | 'auto';

/** 構造形式(規模帯・スパン・屋根・耐火をゲートする)。 */
export type StructureType = 'wood' | 'rc-wall' | 'rc-frame' | 'steel';

export type AptRoofForm = 'flat' | 'gable' | 'hip' | 'mono';
export type WallStyle = 'auto' | 'tile' | 'concrete' | 'siding' | 'twotone';

/** バルコニー形状。continuous=連続張出しスラブ / inset=彫込(loggia)/ box=戸ごと独立箱型。
 *  §10.2: 実物で立面リズムを支配する最大の識別要素。 */
export type BalconyForm = 'auto' | 'continuous' | 'inset' | 'box';
/** バルコニー面の開口構成。single=住戸全幅の掃き出し窓1枚 / mixed=掃き出し窓+腰窓。 */
export type WindowMix = 'auto' | 'single' | 'mixed';
/** 外壁ツートンの分節方向。horizontal=水平ボーダー帯 / vertical=戸境の縦帯 / none=単一。 */
export type WallPattern = 'auto' | 'horizontal' | 'vertical' | 'none';
/** 妻面の開口。blank=無地(実物で多数) / windows=各階小窓。 */
export type GableStyle = 'auto' | 'blank' | 'windows';

export interface AptConfig {
  seed: number;

  // --- 骨格 ---
  accessType: AccessType;
  structure: StructureType;
  floors: number;
  floorsRandom: boolean; // true: seed で floorsMin..floorsMax から抽選(構造上限でクランプ)
  floorsMin: number;
  floorsMax: number;

  // --- 住戸(専有部)---
  unitMix: Record<UnitType, number>; // weightedPick 用の抽選重み
  unitBays: Record<UnitType, number>; // 各タイプの間口ベイ数(壁長=整数ベイ保証の基礎)
  minUnitBays: number; // 1住戸の最小間口ベイ(端数吸収で潰れない下限)
  gridModule: number; // =panelW 相当。視覚的な幅を確保するため尺/メーターの約1.5倍(1.35基準)を採用
  gridModuleRandom: boolean; // true: 建物ごとに gridModule(左右のパネル幅)を seed で振る(§10.6)
  panelH: number; // 階高
  unitDepth: number; // 住戸奥行(=棟奥行、廊下/バルコニーは別途張出し)
  unitDepthRandom: boolean; // true: 建物ごとに unitDepth(前後の奥行)を seed で振る

  // --- アクセス・コア ---
  corridorWidth: number; // 片廊下≈1.2〜1.5 / 階段室型=0。法定下限クリップは placeCores 側
  balconyDepth: number; // 標準 0.9〜1.5(§4.3 補正)
  buildingLengthBays: number; // 棟長の目標ベイ(pad 幅でクランプ)
  buildingLengthRandom: boolean; // true: 建物ごとに棟長を seed で振る(シルエットの主レバー §10.6)
  stairSpacingUnits: number; // 階段室型で1コアが受け持つ住戸数
  elevator: boolean | 'auto'; // 'auto' = floors>=4 で真
  penthouse: boolean; // 屋上塔屋 PH
  exteriorStair: boolean | 'auto'; // 'auto' = floors<=exteriorStairMaxFloors(低層は鉄骨外階段)
  exteriorStairMaxFloors: number;
  stairPlacement: 'rear' | 'gable' | 'auto'; // 外階段の位置: 背面(各コア) / 妻側(建物端部) / seed 二択
  coreStyle: 'auto' | 'blank' | 'windows' | 'glazed'; // コア(階段室)立面: 無地 / 窓列 / 全面ガラス

  // --- 敷地 / 外構 ---
  lotWidth: number; // 間口(街路平行)
  lotDepth: number; // 奥行(道路から)
  sideSetback: number;
  rearSetback: number;
  frontSetback: number; // 前面後退 / アプローチ(駐車と建物の間)
  edgeLandscape: number; // 外周緑地帯

  // --- 駐車(store の parking.ts 生成器を無改変で再利用)---
  stallW: number;
  stallL: number;
  aisleW: number;
  occupancy: number; // 0..1 駐車率
  parkingRatioPerUnit: number; // 附置義務: 台/戸(郊外〜0.3 都心)
  bicycleRatioPerUnit: number; // 駐輪附置: 台/戸
  refuseStation: boolean; // ゴミ置場

  // --- 屋根 / 外装 ---
  roofForm: AptRoofForm;
  roofPitch: number;
  wallStyle: WallStyle; // seed 解決
  accentColor: number; // 手摺 / 庇 / 帯

  // --- 立面バリエーション(§10: seed 由来 'auto' 解決)---
  balconyForm: BalconyForm; // バルコニー形状(連続/彫込/独立箱)
  windowMix: WindowMix; // バルコニー面 開口構成(全幅1枚/掃き出し+腰窓)
  wallPattern: WallPattern; // ツートン分節(水平帯/縦帯/単一)
  gableStyle: GableStyle; // 妻面(無地/窓)
}

export const DEFAULT_APT_CONFIG: AptConfig = {
  seed: 1,

  accessType: 'auto',
  structure: 'rc-frame',
  floors: 5,
  floorsRandom: true,
  floorsMin: 3,
  floorsMax: 7,

  unitMix: { '1R': 0, '1K': 0.5, '1LDK': 1.0, '2LDK': 1.0, '3LDK': 0.5, '4LDK': 0 },
  unitBays: { '1R': 2, '1K': 2, '1LDK': 3, '2LDK': 4, '3LDK': 5, '4LDK': 6 },
  minUnitBays: 2,
  gridModule: 1.35,
  gridModuleRandom: true,
  panelH: 2.9,
  unitDepth: 10.0,
  unitDepthRandom: true,

  corridorWidth: 1.4,
  balconyDepth: 1.5,
  buildingLengthBays: 18,
  buildingLengthRandom: true,
  stairSpacingUnits: 2,
  elevator: 'auto',
  penthouse: true,
  exteriorStair: 'auto',
  exteriorStairMaxFloors: 3,
  stairPlacement: 'auto',
  coreStyle: 'auto',

  lotWidth: 26,
  lotDepth: 30,
  sideSetback: 0.7,
  rearSetback: 2.5,
  frontSetback: 3.0,
  edgeLandscape: 1.5,

  stallW: 2.5,
  stallL: 5.0,
  aisleW: 6.0,
  occupancy: 0.5,
  parkingRatioPerUnit: 0.7,
  bicycleRatioPerUnit: 1.5,
  refuseStation: true,

  roofForm: 'flat',
  roofPitch: 0.5,
  wallStyle: 'auto',
  accentColor: 0x8a6d5a,

  balconyForm: 'auto',
  windowMix: 'auto',
  wallPattern: 'auto',
  gableStyle: 'auto',
};

/**
 * 木造アパート: 2階建・階段室型(外階段)・ワンルーム偏重・勾配屋根・サイディング。
 * 塔屋/EV なし。小さな敷地。
 */
export const WOOD_APART_PRESET: Partial<AptConfig> = {
  structure: 'wood',
  floors: 2,
  floorsMin: 2,
  floorsMax: 3,
  accessType: 'stair-access',
  unitMix: { '1R': 0.6, '1K': 1.0, '1LDK': 0.4, '2LDK': 0.1, '3LDK': 0, '4LDK': 0 },
  gridModule: 1.37,
  panelH: 2.8,
  unitDepth: 7.5,
  corridorWidth: 0,
  balconyDepth: 1.2,
  buildingLengthBays: 12,
  stairSpacingUnits: 2,
  elevator: false,
  penthouse: false,
  lotWidth: 16,
  lotDepth: 20,
  rearSetback: 1.5,
  parkingRatioPerUnit: 0.8,
  bicycleRatioPerUnit: 1.0,
  roofForm: 'gable',
  roofPitch: 0.45,
  wallStyle: 'siding',
  // テラスハウス系の見た目: 彫込バルコニー + 戸境の縦帯 + 無地妻面。
  balconyForm: 'inset',
  wallPattern: 'vertical',
  gableStyle: 'blank',
};

/**
 * 低層壁式RCマンション: 4階建・階段室型・ファミリー中心・陸屋根+塔屋・タイル。
 * 柱梁が出ないフラット面(壁式)。
 */
export const LOWRISE_WALL_RC_PRESET: Partial<AptConfig> = {
  structure: 'rc-wall',
  floors: 4,
  floorsMin: 3,
  floorsMax: 5,
  accessType: 'stair-access',
  unitMix: { '1R': 0, '1K': 0.2, '1LDK': 0.5, '2LDK': 1.0, '3LDK': 1.0, '4LDK': 0.2 },
  gridModule: 1.35,
  panelH: 2.95,
  unitDepth: 10.5,
  corridorWidth: 0,
  balconyDepth: 1.5,
  buildingLengthBays: 16,
  stairSpacingUnits: 2,
  elevator: 'auto',
  penthouse: true,
  lotWidth: 24,
  lotDepth: 28,
  rearSetback: 2.5,
  parkingRatioPerUnit: 0.8,
  roofForm: 'flat',
  wallStyle: 'tile',
  // 昭和団地〜低層壁式: 戸ごと独立の箱型バルコニー、妻面ブランク。
  balconyForm: 'box',
  gableStyle: 'blank',
};

/**
 * 中層片廊下RCマンション: 7階建・片廊下型(外部開放廊下)・1LDK/2LDK・EV+塔屋・
 * タイル。最頻出のギャラリーアクセス板状。
 */
export const MIDRISE_GALLERY_RC_PRESET: Partial<AptConfig> = {
  structure: 'rc-frame',
  floors: 7,
  floorsMin: 6,
  floorsMax: 10,
  accessType: 'single-corridor',
  unitMix: { '1R': 0, '1K': 0.3, '1LDK': 1.0, '2LDK': 1.0, '3LDK': 0.5, '4LDK': 0 },
  gridModule: 1.35,
  panelH: 3.0,
  unitDepth: 11.0,
  corridorWidth: 1.4,
  balconyDepth: 1.5,
  buildingLengthBays: 22,
  elevator: true,
  penthouse: true,
  lotWidth: 30,
  lotDepth: 34,
  rearSetback: 3.0,
  parkingRatioPerUnit: 0.6,
  bicycleRatioPerUnit: 1.5,
  roofForm: 'flat',
  wallStyle: 'tile',
  // 板状ギャラリーアクセス: バルコニーは seed で連続/箱を振る(実物も両方ある)。
  balconyForm: 'auto',
};

export type AptPresetName = 'wood-apart' | 'lowrise-wall-rc' | 'midrise-gallery-rc';

export const APT_PRESETS: Record<AptPresetName, Partial<AptConfig>> = {
  'wood-apart': WOOD_APART_PRESET,
  'lowrise-wall-rc': LOWRISE_WALL_RC_PRESET,
  'midrise-gallery-rc': MIDRISE_GALLERY_RC_PRESET,
};

// ---- seed 由来の 'auto' 解決(building / site / main が共有)-----------------

/** accessType 'auto' を解決。木造は階段室型、低層は seed で二択、中高層は片廊下。 */
export function resolveAccessType(cfg: AptConfig): 'stair-access' | 'single-corridor' {
  if (cfg.accessType !== 'auto') return cfg.accessType;
  if (cfg.structure === 'wood') return 'stair-access';
  if (cfg.floors <= 4) return rand01(cfg.seed, 0xacc) < 0.5 ? 'stair-access' : 'single-corridor';
  return 'single-corridor';
}

/** EV 有無を解決(実務標準: 4階以上で1基必須)。 */
export function resolveElevator(cfg: AptConfig): boolean {
  return cfg.elevator === 'auto' ? cfg.floors >= 4 : cfg.elevator;
}

/** 構造形式ごとの実用最大階数(木造3/壁式RC5/S造6/ラーメンRC15)。 */
function structureFloorCap(s: StructureType): number {
  return s === 'wood' ? 3 : s === 'rc-wall' ? 5 : s === 'steel' ? 6 : 15;
}

/** 階数を解決。floorsRandom なら seed で [floorsMin, floorsMax] から抽選し、構造上限で
 *  クランプ。非ランダム時も構造上限でクランプ(木造20階等の破綻を防ぐ)。 */
export function resolveFloors(cfg: AptConfig): number {
  const cap = structureFloorCap(cfg.structure);
  if (!cfg.floorsRandom) return Math.max(2, Math.min(cfg.floors, cap));
  const lo = Math.max(2, Math.min(cfg.floorsMin, cap));
  const hi = Math.max(lo, Math.min(cfg.floorsMax, cap));
  return lo + Math.floor(rand01(cfg.seed, 0xf100) * (hi - lo + 1));
}

/** 外階段(鉄骨)を使うか。'auto' は低層(floors<=exteriorStairMaxFloors)で真。 */
export function resolveExteriorStair(cfg: AptConfig, floors: number): boolean {
  return cfg.exteriorStair === 'auto' ? floors <= cfg.exteriorStairMaxFloors : cfg.exteriorStair;
}

/** 外階段の配置。'auto' は seed で背面/妻側を二択。 */
export function resolveStairPlacement(cfg: AptConfig): 'rear' | 'gable' {
  if (cfg.stairPlacement !== 'auto') return cfg.stairPlacement;
  return rand01(cfg.seed, 0x57a1) < 0.5 ? 'rear' : 'gable';
}

/** コア(階段室)立面。'auto' は seed で blank/windows/glazed を抽選。 */
export function resolveCoreStyle(cfg: AptConfig): 'blank' | 'windows' | 'glazed' {
  if (cfg.coreStyle !== 'auto') return cfg.coreStyle;
  const styles = ['blank', 'windows', 'glazed'] as const;
  return styles[Math.floor(rand01(cfg.seed, 0xc0e5) * styles.length)];
}

/** バルコニー形状(§10.2)。'auto' は構造・階数で傾向を付け seed で抽選。木造/低層は彫込・箱を
 *  多めに、中高層は連続を主に。 */
export function resolveBalconyForm(cfg: AptConfig, floors: number): 'continuous' | 'inset' | 'box' {
  if (cfg.balconyForm !== 'auto') return cfg.balconyForm;
  const r = rand01(cfg.seed, 0xba1f);
  // 低層(木造・S造の低層帯)は彫込/箱が実物で多数。中高層は連続が主。
  if (cfg.structure === 'wood' || floors <= 3) return r < 0.5 ? 'inset' : r < 0.8 ? 'box' : 'continuous';
  return r < 0.6 ? 'continuous' : r < 0.85 ? 'box' : 'inset';
}

/** バルコニー面の開口構成(§10.3)。'auto' は seed 二択(mixed 寄り)。 */
export function resolveWindowMix(cfg: AptConfig): 'single' | 'mixed' {
  if (cfg.windowMix !== 'auto') return cfg.windowMix;
  return rand01(cfg.seed, 0x7d0e) < 0.65 ? 'mixed' : 'single';
}

/** 外壁ツートン分節(§10.4)。'auto' は seed で horizontal/vertical/none を抽選。 */
export function resolveWallPattern(cfg: AptConfig): 'horizontal' | 'vertical' | 'none' {
  if (cfg.wallPattern !== 'auto') return cfg.wallPattern;
  const styles = ['horizontal', 'vertical', 'none'] as const;
  return styles[Math.floor(rand01(cfg.seed, 0x2a11) * styles.length)];
}

/** 妻面(§10.3)。'auto' は seed 二択(ブランク寄り=実物で多数)。 */
export function resolveGableStyle(cfg: AptConfig): 'blank' | 'windows' {
  if (cfg.gableStyle !== 'auto') return cfg.gableStyle;
  return rand01(cfg.seed, 0x9a3c) < 0.6 ? 'blank' : 'windows';
}

const clampNum = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** パネル幅(左右=街路平行のベイ幅)を建物ごとに解決。gridModuleRandom 時、cfg.gridModule を
 *  中心に ±約8% 振り、尺(0.91)〜メーター(1.0)の実在レンジ [0.82, 1.05] にクランプ。
 *  整数ベイ格子は不変(ベイ数×このメートル幅=壁長)。異なる seed で棟の粒度・窓割リズムが変わる。 */
export function resolveGridModule(cfg: AptConfig): number {
  if (!cfg.gridModuleRandom) return cfg.gridModule;
  const f = 0.94 + rand01(cfg.seed, 0x6d0d) * 0.12; // 0.94..1.06
  return clampNum(cfg.gridModule * f, 1.1, 1.7);
}

/** 住戸奥行(前後=道路からの奥行)を建物ごとに解決。unitDepthRandom 時、cfg.unitDepth を中心に
 *  ±15% 振り [6, 13]m にクランプ。棟の前後寸法・アスペクト比が seed で変わる。 */
export function resolveUnitDepth(cfg: AptConfig): number {
  if (!cfg.unitDepthRandom) return cfg.unitDepth;
  const f = 0.85 + rand01(cfg.seed, 0x0de9) * 0.3; // 0.85..1.15
  return clampNum(cfg.unitDepth * f, 6, 13);
}

/** 棟長(左右=街路平行のベイ数)を建物ごとに解決。シルエットの主レバー。buildingLengthRandom 時、
 *  cfg.buildingLengthBays を等倍〜2倍で seed 抽選(実際の棟長は site 側で敷地=lenCap にクランプ)。
 *  短いスタッビーな棟〜長い板状まで振れ、住戸数・窓割リズムが大きく変わる(§10.6)。 */
export function resolveBuildingLengthBays(cfg: AptConfig): number {
  if (!cfg.buildingLengthRandom) return cfg.buildingLengthBays;
  const f = 1.0 + rand01(cfg.seed, 0x1b7a); // 1.0..2.0
  return Math.max(6, Math.round(cfg.buildingLengthBays * f));
}

/** 建物一律の住戸間口(ベイ)を解決。unitMix 加重で1回だけ抽選し、過小分割(1.8m 等)を避けるため
 *  下限3ベイでクランプ。placeCores がこの w でセグメントを w の倍数に量子化するので、同一建物内の
 *  全住戸が厳密に同幅になる(§10.6)。seed で建物ごとに間口=窓割ピッチが変わる。 */
export function resolveUnitBays(cfg: AptConfig): number {
  const all = Object.keys(cfg.unitBays) as UnitType[];
  const pool = all.filter((t) => cfg.unitMix[t] > 0);
  const cands = pool.length ? pool : all;
  const weight = (t: UnitType) => (pool.length ? Math.max(0, cfg.unitMix[t]) : 1);
  const total = cands.reduce((s, t) => s + weight(t), 0) || cands.length;
  let r = rand01(cfg.seed, 0x3f01) * total;
  let picked = cands[cands.length - 1];
  for (const t of cands) { r -= weight(t); if (r <= 0) { picked = t; break; } }
  return clampNum(Math.max(3, cfg.unitBays[picked]), 3, 8);
}
