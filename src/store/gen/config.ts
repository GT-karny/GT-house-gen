// ============================================================================
// Roadside-store generation parameters. Single source of truth for all tunables
// (GUI + any future port read from here). Business type (業態) is expressed as a
// Partial<StoreConfig> preset spread over DEFAULT_STORE_CONFIG — the same
// mechanism as the house-gen JP presets, no registry. Lengths in meters.
// ============================================================================

/** Building mass archetypes. box=単純箱, box-service=箱+背面荷捌き下屋,
 *  box-canopy=箱+エントランス車寄せ, pitched=勾配屋根の中規模棟(ファミレス). */
export type StoreArchetype = 'box' | 'box-service' | 'box-canopy' | 'pitched';

/** Where the parking field goes. front=道路側前面のみ, wrap=前面+側面。 */
export type ParkingLayout = 'front' | 'wrap';

// mansard = 腰折れ屋根: a steep decorative fascia band wrapping the wall top with a
// hidden flat plateau — the signature roadside-family-restaurant crown.
export type StoreRoofForm = 'flat' | 'gable' | 'hip' | 'mono' | 'mansard';

/** Building placement as two independent axes (each 'auto' = seed-random).
 *  depth: front=道路側 / rear=奥。 side: left / center / right。Frontage always
 *  faces the road regardless of placement. */
export type BuildingDepth = 'front' | 'rear' | 'auto';
export type BuildingSide = 'left' | 'center' | 'right' | 'auto';

export interface StoreConfig {
  seed: number;

  // --- storefront module grid ---
  panelW: number; // storefront bay width → wall lengths snap to multiples
  panelH: number; // floor height

  // --- lot / site ---
  lotWidth: number; // frontage (street-parallel), meters
  lotDepth: number; // depth (away from road), meters
  edgeLandscape: number; // perimeter green belt (m)
  frontSetback: number; // road-side setback / 沿道緑化 (m)
  approachGap: number; // walkway gap between parking and the storefront (m)

  // --- building ---
  buildTargetWidth: number; // desired frontage width (m)
  buildTargetDepth: number; // desired depth (m)
  floors: number;
  minBuildWidth: number;
  minBuildDepth: number;
  archetypeWeights: Record<StoreArchetype, number>;
  buildingDepth: BuildingDepth; // 道路側 / 奥 (each 'auto' = seed-random)
  buildingSide: BuildingSide; // 左 / 中央 / 右
  roofForm: StoreRoofForm;
  roofPitch: number;

  // --- parking ---
  stallW: number; // one stall width (2.5 std)
  stallL: number; // stall length (5.0 std)
  aisleW: number; // drive aisle between double-loaded rows (5.5–6.0)
  parkingLayout: ParkingLayout;
  accessibleStalls: number; // 身障者用マス near the entrance
  occupancy: number; // 0..1 fraction of stalls holding a parked car

  // --- storefront grammar ---
  glazingRatio: number; // 0..1 of frontage ground bays that are glazing
  entranceCount: number; // number of entrances on the frontage
  signband: boolean; // continuous signage band across the frontage top
  signbandH: number; // band height (m)

  // --- building-mounted signage & storefront detail ---
  wallSign: boolean; // 壁面看板 (logo box mounted on the frontage wall)
  bladeSign: boolean; // 袖看板 (double-sided sign projecting from a frontage corner)
  windowAwnings: boolean; // 窓オーニング (striped fabric hoods over frontage glazing)
  entranceGable: boolean; // エントランスの妻屋根ポーチ (gabled porte-cochère over the entrance)

  // --- freestanding signage ---
  signPylon: boolean;
  pylonHeight: number; // pole height to the underside of the sign box (m)
  rooftopSign: boolean; // 陸屋根に屋上看板(キューブ/板型)を載せる候補にする (seed-random, flat roofs only)
  logoStyle: number; // brand-logo variant: -1 = auto (seed-derived), ≥0 = explicit id

  // --- parking-lot lighting ---
  lightPoleHeight: number; // pole-light mounting height (m); JP平面駐車場 ≈4.5–6

  // --- features ---
  driveThrough: boolean; // 周回DTレーン + メニュー看板
  serviceYard: boolean; // 背面荷捌きヤード + トラック
  outdoorDisplay: boolean; // 屋外展示/資材ヤード (中古車・HC)
  carts: boolean; // カート置き場 (スーパー等)
  flags: boolean; // 幟/旗 (中古車・飲食)

  brandColor: number; // signage / accent color
}

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  seed: 1,

  panelW: 3.0,
  panelH: 4.5,

  lotWidth: 60,
  lotDepth: 70,
  edgeLandscape: 2.0,
  frontSetback: 3.0,
  approachGap: 2.5,

  buildTargetWidth: 36,
  buildTargetDepth: 30,
  floors: 1,
  minBuildWidth: 9,
  minBuildDepth: 9,
  archetypeWeights: { box: 1.0, 'box-service': 1.5, 'box-canopy': 0.6, pitched: 0.0 },
  buildingDepth: 'auto',
  buildingSide: 'auto',
  roofForm: 'flat',
  roofPitch: 0.5,

  stallW: 2.5,
  stallL: 5.0,
  aisleW: 6.0,
  parkingLayout: 'front',
  accessibleStalls: 2,
  occupancy: 0.55,

  glazingRatio: 0.7,
  entranceCount: 1,
  signband: true,
  signbandH: 1.1,

  wallSign: true,
  bladeSign: false,
  windowAwnings: false,
  entranceGable: false,

  signPylon: true,
  pylonHeight: 6.0,
  rooftopSign: true,
  logoStyle: -1, // auto (seed-derived)

  lightPoleHeight: 5.0,

  driveThrough: false,
  serviceYard: true,
  outdoorDisplay: false,
  carts: false,
  flags: false,

  brandColor: 0xd0332e,
};

/**
 * 大箱物販 (スーパー / 家電量販 / 衣料): 広い横長敷地、陸屋根の大箱、前面+側面
 * を駐車で巻く、壁面看板帯、背面荷捌き、カート置き場。
 */
export const BIG_BOX_PRESET: Partial<StoreConfig> = {
  panelW: 3.0,
  panelH: 5.0,
  lotWidth: 90,
  lotDepth: 100,
  edgeLandscape: 3.0,
  frontSetback: 4.0,
  buildTargetWidth: 54,
  buildTargetDepth: 45,
  floors: 1,
  archetypeWeights: { box: 1.0, 'box-service': 2.0, 'box-canopy': 0.5, pitched: 0.0 },
  roofForm: 'flat',
  parkingLayout: 'wrap',
  accessibleStalls: 4,
  occupancy: 0.5,
  glazingRatio: 0.55,
  entranceCount: 2,
  signband: true,
  signbandH: 1.6,
  signPylon: true,
  pylonHeight: 8.0,
  lightPoleHeight: 6.0,
  serviceYard: true,
  carts: true,
  brandColor: 0x1966b3,
};

/**
 * コンビニ: 小さな敷地、小箱・陸屋根、道路側前面に駐車、全面ガラス、大きな
 * サインポール。荷捌きヤードは無し。
 */
export const CONVENIENCE_PRESET: Partial<StoreConfig> = {
  panelW: 2.4,
  panelH: 4.0,
  // deep enough that the frontage fits an entry drive aisle + a nose-in row (so
  // every stall is reachable): frontage ≈ depth − building − approach − edges.
  lotWidth: 34,
  lotDepth: 32,
  edgeLandscape: 1.0,
  frontSetback: 1.5,
  buildTargetWidth: 14.4,
  buildTargetDepth: 12,
  floors: 1,
  archetypeWeights: { box: 2.0, 'box-service': 0.5, 'box-canopy': 0.0, pitched: 0.0 },
  roofForm: 'flat',
  parkingLayout: 'front',
  accessibleStalls: 1,
  occupancy: 0.45,
  glazingRatio: 0.85,
  entranceCount: 1,
  signband: true,
  signbandH: 1.0,
  signPylon: true,
  pylonHeight: 5.5,
  lightPoleHeight: 4.5,
  serviceYard: false,
  carts: false,
  brandColor: 0x1a8a4a,
};

/**
 * ファミレス: 中規模敷地、勾配屋根の中規模棟 + 車寄せ、独立サイン、店頭植栽。
 */
export const FAMILY_RESTAURANT_PRESET: Partial<StoreConfig> = {
  panelW: 2.5,
  panelH: 3.8,
  lotWidth: 38,
  lotDepth: 40,
  edgeLandscape: 1.5,
  frontSetback: 2.5,
  buildTargetWidth: 20,
  buildTargetDepth: 17.5,
  floors: 1,
  archetypeWeights: { box: 0.0, 'box-service': 0.4, 'box-canopy': 1.0, pitched: 2.0 },
  roofForm: 'mansard', // 腰折れ屋根 — the family-restaurant signature
  roofPitch: 0.55,
  parkingLayout: 'front',
  accessibleStalls: 2,
  occupancy: 0.5,
  glazingRatio: 0.6,
  entranceCount: 1,
  signband: false,
  wallSign: true, // 妻/正面の壁面ロゴ
  bladeSign: true, // 角の袖看板
  windowAwnings: true, // ストライプの日除けテント
  entranceGable: true, // 妻屋根の車寄せ
  signPylon: true,
  pylonHeight: 5.0,
  rooftopSign: false, // cottage-style; roofs are pitched/mansard, not flat
  lightPoleHeight: 4.5,
  serviceYard: true,
  carts: false,
  flags: false,
  brandColor: 0xb5472a,
};

/**
 * ファストフード / カフェ (ドライブスルー): 小箱 + 周回DTレーン、メニュー看板、
 * 大庇。前面駐車。
 */
export const DRIVE_THROUGH_PRESET: Partial<StoreConfig> = {
  panelW: 2.5,
  panelH: 4.0,
  lotWidth: 34,
  lotDepth: 46,
  edgeLandscape: 1.5,
  frontSetback: 2.5,
  buildTargetWidth: 15,
  buildTargetDepth: 15,
  floors: 1,
  archetypeWeights: { box: 1.0, 'box-service': 0.3, 'box-canopy': 1.2, pitched: 0.3 },
  roofForm: 'flat',
  parkingLayout: 'front',
  accessibleStalls: 1,
  occupancy: 0.5,
  glazingRatio: 0.7,
  entranceCount: 1,
  signband: true,
  signbandH: 1.2,
  signPylon: true,
  pylonHeight: 6.5,
  lightPoleHeight: 5.0,
  driveThrough: true,
  serviceYard: false,
  flags: true,
  brandColor: 0xd83b2a,
};

export type StorePresetName = 'big-box' | 'convenience' | 'family-restaurant' | 'drive-through';

export const STORE_PRESETS: Record<StorePresetName, Partial<StoreConfig>> = {
  'big-box': BIG_BOX_PRESET,
  convenience: CONVENIENCE_PRESET,
  'family-restaurant': FAMILY_RESTAURANT_PRESET,
  'drive-through': DRIVE_THROUGH_PRESET,
};
