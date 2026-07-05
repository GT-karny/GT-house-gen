// ============================================================================
// Generation parameters. All tunables live here so the GUI and any future port
// share one source of truth. Lengths in meters.
// ============================================================================

export type ArchetypeName = 'rect' | 'lshape' | 'tshape' | 'ushape' | 'garage';

/**
 * How window opening sizes are chosen per cell.
 *  - 'medium'  : every window is a waist-height 腰窓 (uniform).
 *  - 'byFloor' : ground floor large (掃き出し), upper floors medium.
 *  - 'japan'   : ground garden-face large 掃き出し窓, ground street medium,
 *                upper 腰窓 with occasional 小窓 accents (water rooms).
 */
export type WindowSizeMode = 'medium' | 'byFloor' | 'japan';

/** Target number of parking stalls. 'auto' = derive from buildable frontage width. */
export type ParkingTarget = 'auto' | 0 | 1 | 2;

export interface GenConfig {
  seed: number;

  // --- panel grid ---
  panelW: number; // module board width  → wall lengths snap to multiples of this
  panelH: number; // module board height → floor height

  // --- lot / site ---
  lotWidth: number; // frontage (street-parallel), meters
  lotDepth: number; // depth (away from road), meters
  sideSetback: number; // side boundary offset (民法境界), meters
  rearSetback: number; // rear boundary offset, meters
  fillRatio: number; // 0..1 how much of the usable width the house takes (rest → garden)
  coverageRatio: number; // 建蔽率目安: target house-footprint ÷ lot area (caps house depth)
  parkingTarget: ParkingTarget; // desired stall count (auto = by frontage)

  // --- minimum building footprint (狭小住宅の下限, Web調査ベース) ---
  minBuildingWidth: number; // 最小間口 (m)
  minBuildingDepth: number; // 最小奥行 (m)
  minBuildingArea: number; // 最小建築面積 (m²)

  // --- footprint ---
  /** Weighted archetype selection. Higher = more likely. */
  archetypeWeights: Record<ArchetypeName, number>;
  coreWidthBays: number; // nominal core width in bays (long axis)
  coreDepthBays: number; // nominal core depth in bays (short axis)
  wingSizeRatio: number; // wing extent as a fraction of the core (0..1)
  dimJitterBays: number; // +/- random bays applied to core dims
  notch: boolean; // carve a corner notch to break the box silhouette

  // --- storeys ---
  floors: number;
  downWings: boolean; // wings become single-storey 下屋 (stepped roof)

  // --- facade split-grammar ---
  cornerMarginBays: number; // both end bays of each wall are forced solid
  windowDensity: number; // 0..1 → how many of the usable bays carry windows
  windowJitter: number; // 0..1 chance each window nudges +/-1 bay (organic variation)
  windowSizeMode: WindowSizeMode; // how opening sizes are assigned
  streetOpenness: number; // 0..1 density multiplier for the road-facing wall (privacy)
  doorFacesRoadOnly: boolean; // door only on the primary (road-facing) facade

  // --- Japanese detailing ---
  grilles: boolean; // 面格子 over small ground-floor windows
  shutterBoxes: boolean; // シャッターボックス above medium/large windows
  balcony: boolean; // 2F balcony with a 掃き出し窓
  balconyFace: 'auto' | 'street' | 'garden'; // 'auto' = front or the (left/right) side, by seed
  bayWindows: boolean; // 出窓 — protruding window boxes on the visible (street/garden) faces
  recessedEntrance: boolean; // some houses set the 玄関 back into a niche (by seed)
}

export const DEFAULT_CONFIG: GenConfig = {
  seed: 1,

  panelW: 2.0,
  panelH: 3.0,

  lotWidth: 14,
  lotDepth: 16,
  sideSetback: 0.5,
  rearSetback: 0.8,
  fillRatio: 0.8,
  coverageRatio: 0.5,
  parkingTarget: 'auto',

  // 狭小住宅の下限: 実用最小間口≈3.6m(2間), 奥行≈4m, 建築面積≈25m²(2階で延床~50)
  minBuildingWidth: 3.6,
  minBuildingDepth: 4.0,
  minBuildingArea: 25,

  archetypeWeights: {
    rect: 1.0,
    lshape: 2.0,
    tshape: 1.5,
    ushape: 1.0,
    garage: 1.5,
  },
  coreWidthBays: 6,
  coreDepthBays: 4,
  wingSizeRatio: 0.55,
  dimJitterBays: 1,
  notch: false,

  floors: 2,
  downWings: false,

  cornerMarginBays: 1,
  windowDensity: 0.6,
  windowJitter: 0.25,
  windowSizeMode: 'byFloor',
  streetOpenness: 1.0,
  doorFacesRoadOnly: true,

  grilles: false,
  shutterBoxes: false,
  balcony: false,
  balconyFace: 'street',
  bayWindows: false,
  recessedEntrance: false,
};

/**
 * 建売・郊外型 (p01): 総二階 + 前面下屋 + 切妻ダーク屋根。街路側は小窓中心で
 * 閉じ、庭側に掃き出し窓 + 2F バルコニー。面格子・シャッターボックスあり。
 */
export const JP_TRACT_PRESET: Partial<GenConfig> = {
  panelW: 1.82,
  panelH: 2.9,
  lotWidth: 11, // 建売の間口はやや狭め
  lotDepth: 15,
  fillRatio: 0.85,
  coverageRatio: 0.6, // 建売は敷地を高めに使う
  parkingTarget: 'auto',
  coreWidthBays: 4,
  coreDepthBays: 3,
  wingSizeRatio: 0.6,
  dimJitterBays: 1,
  floors: 2,
  downWings: true,
  archetypeWeights: { rect: 1.0, lshape: 2.5, tshape: 1.5, ushape: 0.3, garage: 2.0 },
  cornerMarginBays: 0, // allow windows to reach the wall ends
  windowDensity: 0.55,
  windowJitter: 0.2,
  windowSizeMode: 'japan',
  streetOpenness: 0.45,
  doorFacesRoadOnly: true,
  grilles: true,
  shutterBoxes: true,
  balcony: true,
  balconyFace: 'auto', // 正面 or 左右いずれか(シード依存)
  bayWindows: true,
  recessedEntrance: true, // 玄関が奥まる家もある(シード依存)
};

/**
 * モダンキューブ型 (p00): 陸屋根 + パラペットの箱。黒サッシ、開口は大きめ、
 * 街路側もそこそこ開く。下屋なし・シャッター/面格子ひかえめ。
 */
export const JP_CUBE_PRESET: Partial<GenConfig> = {
  panelW: 1.82,
  panelH: 2.9,
  lotWidth: 13,
  lotDepth: 14,
  fillRatio: 0.9, // 総二階の箱は敷地を目一杯使う
  coverageRatio: 0.55,
  parkingTarget: 'auto',
  coreWidthBays: 4,
  coreDepthBays: 4,
  wingSizeRatio: 0.5,
  dimJitterBays: 1,
  floors: 2,
  downWings: false,
  archetypeWeights: { rect: 3.0, lshape: 1.5, tshape: 0.5, ushape: 0.3, garage: 1.0 },
  cornerMarginBays: 0, // allow windows to reach the wall ends
  windowDensity: 0.5,
  windowJitter: 0.3,
  windowSizeMode: 'japan',
  streetOpenness: 0.6,
  doorFacesRoadOnly: true,
  grilles: false,
  shutterBoxes: false,
  balcony: true,
  balconyFace: 'auto',
  bayWindows: false,
  recessedEntrance: true, // モダン系は玄関を引っ込めることが多い
};
