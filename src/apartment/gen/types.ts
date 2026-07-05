// ============================================================================
// 集合住宅(アパート・マンション)データモデル — PURE, no Three.js. 描画非依存の移植可能コア。
// house-gen / store-gen と同系だが、主役は「可変幅の住戸ユニットを整数ベイ上に
// 線形タイリング + アクセス型に応じたコア(階段室/EV)差し込み + 基準階の垂直
// スタック」。単位: メートル、ワールド平面 XY、上は +Z(Z-up 準拠)。
// To Three: toThree(x,y,z) = (x, z, -y)。lot-local: u=街路平行 / v=道路からの奥行。
// ============================================================================

import type { Vec2 } from '../../shared/vec';

export type { Vec2 };
// 駐車フィールドは store の生成器(parking.ts)を無改変で再利用するため、その型を再輸出。
export type { ParkingField, ParkingStall, SiteRect } from '../../store/gen/types';

/** Oriented bounding box / 矩形マス。axisU が長辺(棟の長さ方向)。 */
export interface OBB {
  center: Vec2;
  axisU: Vec2;
  axisV: Vec2;
  halfU: number;
  halfV: number;
}

/** 入力敷地。house/store の Lot と同形(block→lot フィードを共有)。
 *  u = street-parallel(longestEdgeDir)、v = 道路からの奥行(v=0 が接道)。 */
export interface AptLot {
  ring: Vec2[]; // CCW closed ring (world XY, meters)
  baseZ: number;
  areaM2: number;
  centroid: Vec2;
  longestEdgeDir: Vec2;
  primaryRoadId: number;
  adjacentRoadIds: number[];
  roadDir: Vec2; // unit, 敷地→前面道路
}

// ---- 住戸・コア・タイリング(建物骨格) --------------------------------------

/** 住戸タイプ。面積→部屋数は間口ベイ(unitBays)へ単調に写像する。 */
export type UnitType = '1R' | '1K' | '1LDK' | '2LDK' | '3LDK' | '4LDK';

/** 基準階に置かれた1住戸。棟の長さ方向(u)のベイ座標で表す。 */
export interface Unit {
  type: UnitType;
  startBay: number; // 棟原点(u=0)からのベイ
  bays: number; // 間口ベイ数(壁長=bays×gridModule を保証)
}

/** 循環コアの種別。stair=階段室のみ / stair-ev=階段+EV。 */
export type CoreKind = 'stair' | 'stair-ev';

export interface CorePlacement {
  kind: CoreKind;
  startBay: number;
  bays: number;
}

/** 棟の長さ方向の順序分割スロット。core か、住戸で埋める segment。ベイ総和=棟長。 */
export type Slot =
  | { kind: 'core'; startBay: number; bays: number; core: CoreKind }
  | { kind: 'segment'; startBay: number; bays: number; nUnits: number };

/** 共用廊下仕様。片廊下型のとき rear(奥側=道路の反対面)に生成。階段室型は present:false。 */
export interface CorridorSpec {
  present: boolean;
  side: 'rear';
  widthM: number;
}

/** 棟の解析フレーム(ワールド)。v=0 が前面(道路/バルコニー面)、v=depthBays が背面
 *  (共用廊下面)。footprint が算出し facade/roof が住戸割付に使う。 */
export interface BarFrame {
  origin: Vec2; // (u=0, v=0) = 前面左コーナーのワールド座標
  axisU: Vec2; // 棟長方向(街路平行、単位)
  axisV: Vec2; // 前面→背面(道路から離れる向き、単位)
  lengthBays: number;
  depthBays: number;
  gridModule: number;
}

// ---- 立面(ファサード) -----------------------------------------------------

/** 面の役割。balcony=バルコニー面(道路/南), corridor=共用廊下面, gable=妻面(戸境側),
 *  entrance=1F 共用エントランス。 */
export type FaceRole = 'balcony' | 'corridor' | 'gable' | 'entrance';

/** 立面モジュール。sashwindow=掃き出し窓, mb=メーターボックス扉, stairwin=階段室窓。 */
export type AptModule = 'wall' | 'window' | 'sashwindow' | 'door' | 'mb' | 'stairwin' | 'entrance';

export type WindowSize = 'small' | 'medium' | 'large';

/** 1枚の配置パネル。描画側では instanced-mesh のトランスフォームになる。 */
export interface AptPanel {
  type: AptModule;
  faceRole: FaceRole;
  floor: number; // 0 = 1階
  pos: Vec2; // 壁面上のパネル中心(world XY)
  z: number; // パネル中心高さ
  yawDeg: number; // +Z 周りの回転(板が外を向く)
  w: number;
  h: number;
  size?: WindowSize;
  grille?: boolean; // 面格子
}

/** 前面(バルコニー面)に張り出す開放スラブ。§10.2: form が立面リズムを支配。
 *  continuous=隣戸と連続 / inset=彫込(loggia、張出し僅少)/ box=戸ごと独立(左右袖壁+戸境外壁)。 */
export type BalconyForm = 'continuous' | 'inset' | 'box';
export interface Balcony {
  a: Vec2;
  b: Vec2;
  normal: Vec2; // 外向き単位法線
  z: number; // スラブ上端 z
  depth: number;
  form: BalconyForm;
}

/** 背面(共用廊下面)に張り出す開放廊下スラブ(片廊下型)。 */
export interface CorridorSlab {
  a: Vec2;
  b: Vec2;
  normal: Vec2;
  z: number;
  depth: number;
  floor: number;
}

/** バルコニーの左右仕切り(隔て板)。隣戸境界に立つ、避難時に蹴破れる薄板(H≈1.8m)。 */
export interface BalconyPartition {
  pos: Vec2; // 前面壁の住戸境界 u 位置(world)
  outward: Vec2; // バルコニー外向き法線(板の見付け方向)
  z: number; // 床レベル
  depth: number; // バルコニー奥行(= 板の張出し長さ)
  height: number; // 隔て板高さ
}

/** 屋外鉄骨階段(低層時)。背面=アクセス側の壁から外へ張り出す折り返し(コの字)。
 *  走り(フライト)は棟長方向 along(u)に取り、奥行 spanV は2フライトぶんに収める
 *  (浅い背面後退でも勾配が破綻しない)。踊場で 180° 折り返す。 */
export type StairKind = 'switchback' | 'straight';
export interface ExteriorStair {
  base: Vec2; // 背面壁の取付点(world、コア u 中心)
  outward: Vec2; // 投影方向(建物から外へ = +axisV, 単位)
  along: Vec2; // 走り方向(axisU, 単位)
  z: number; // baseZ
  floors: number;
  floorHeight: number;
  runU: number; // 走り方向(along)の footprint 長さ(フライト走り + 踊場)
  spanV: number; // 奥行(outward、2フライト側並び)
  offsetV: number; // 背面壁からの外側オフセット(=廊下幅。階段を外廊下の外に出し、廊下に接続)
  kind: StairKind;
}

export interface AptMass {
  obb: OBB;
  floors: number;
}

/** 塔屋(PH: EV機械室/階段室)。屋上コア位置に載る小マス。 */
export interface Penthouse {
  obb: OBB;
  z: number; // 屋上スラブ z
  height: number;
  kind: CoreKind;
}

export interface AptBuildingPlan {
  masses: AptMass[];
  footprintRing: Vec2[]; // 地上 union ring, world XY CCW
  tiers: { floor: number; ring: Vec2[] }[];
  bar: BarFrame;
  slots: Slot[];
  units: Unit[]; // 基準階の住戸
  cores: CorePlacement[];
  corridor: CorridorSpec;
  floors: number;
  floorHeight: number;
  panels: AptPanel[];
  balconies: Balcony[];
  corridors: CorridorSlab[];
  partitions: BalconyPartition[]; // バルコニー隔て板
  penthouses: Penthouse[];
  exteriorStairs: ExteriorStair[]; // 屋外鉄骨階段(低層時)
  unitCount: number; // 総戸数(基準階戸数 × 階数)
  accessType: string;
  structure: string;
}

// ---- 敷地(外構) -----------------------------------------------------------

/** 地面パッチの役割(マテリアル駆動)。bike=駐輪場, refuse=ゴミ置場, pad=建物下地。 */
export type AptZoneKind =
  | 'parking'
  | 'aisle'
  | 'drive'
  | 'approach'
  | 'landscape'
  | 'bike'
  | 'refuse'
  | 'pad'
  | 'leftover'
  | 'plaza';

export interface AptSiteRect {
  ring: Vec2[];
  kind: AptZoneKind;
}

export type AptPropKind =
  | 'car'
  | 'lightpole'
  | 'tree'
  | 'shrub'
  | 'bikerack'
  | 'bikeshelter'
  | 'refuse'
  | 'mailbox'
  | 'bench'
  | 'transformer'
  | 'watertank';

export interface AptProp {
  kind: AptPropKind;
  center: Vec2;
  halfU: number;
  halfV: number;
  h: number;
  yawDeg?: number;
  color?: number;
}

export type FenceKind = 'fence' | 'hedge' | 'wall' | 'open';
export interface FenceSpan {
  a: Vec2;
  b: Vec2;
  normal: Vec2;
  kind: FenceKind;
  height: number;
}

/** 建物の収まる矩形。footprint は originWorld(前面左コーナー)から +U/+V に住棟を張る。 */
export interface AptPad {
  originWorld: Vec2; // 前面左コーナー(u=0,v=0)のワールド
  axisU: Vec2; // 街路平行(単位)
  axisV: Vec2; // 前面→背面 / 道路から離れる(単位)
  anchor: 'front' | 'rear';
  frontV: number; // 前面線の lot-local v
  maxWidthBays: number; // = 棟長ベイ(確定値)
  maxDepthBays: number; // = 棟奥行ベイ(確定値)
}

export interface AptSitePlan {
  lotRing: Vec2[];
  pad: AptPad;
  parking: import('../../store/gen/types').ParkingField;
  parkingRequired: number; // 附置義務台数(ceil 総戸数×比率)
  parkingShort: boolean; // 物理容量が要求に満たない(無音違反しないためのフラグ)
  bikeRequired: number; // 駐輪附置台数
  zones: AptSiteRect[];
  props: AptProp[];
  fences: FenceSpan[];
  entrances: { pos: Vec2; width: number }[];
}
