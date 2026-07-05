// ============================================================================
// Roadside-store data model — PURE, no Three.js. Renderer-agnostic core, mirrors the
// house-gen data model (src/gen/types.ts) but for commercial roadside sites:
// the site's protagonist is the PARKING FIELD (rows + aisles), and the building
// is a big box with a STOREFRONT (glazing + entrance + signage band) rather than
// residential windows/doors. Units: meters, world plane XY, up is +Z (Z-up conv).
// To Three: toThree(x,y,z) = (x, z, -y).
// ============================================================================

import type { Vec2 } from '../../shared/vec';

export type { Vec2 };

/** Oriented bounding box / rectangular mass. AxisU is the long/frontage axis. */
export interface OBB {
  center: Vec2;
  axisU: Vec2;
  axisV: Vec2;
  halfU: number;
  halfV: number;
}

/** Input lot / parcel. Same shape as the house Lot so the block→lot feed is
 *  shared. u = street-parallel (longestEdgeDir), v = depth from road (v=0 at the
 *  frontage). Building sits at the rear, parking fills the front. */
export interface StoreLot {
  ring: Vec2[]; // CCW closed ring (world XY, meters)
  baseZ: number;
  areaM2: number;
  centroid: Vec2;
  longestEdgeDir: Vec2; // street-parallel long axis
  primaryRoadId: number;
  adjacentRoadIds: number[];
  roadDir: Vec2; // unit, from lot toward its primary road
}

// ---- building --------------------------------------------------------------

/** Storefront module classes (the retail analogue of house wall/window/door).
 *  glazing = カーテンウォール/ショーウィンドウ, entrance = 自動ドア+風除室,
 *  signband = パラペット下の看板帯, shutter = 搬入シャッター. */
export type StorefrontModule = 'wall' | 'glazing' | 'entrance' | 'signband' | 'shutter';

/** Which way a wall faces, driving how open it is. frontage = 道路/駐車場側の
 *  主正面 (open), flank = 側面 (semi), service = 背面 (closed, loading). */
export type FaceRole = 'frontage' | 'flank' | 'service';

/** A rectangular mass tagged with its storey count (service wing = 1). */
export interface StoreMass {
  obb: OBB;
  floors: number;
}

/** One placed storefront panel. All share the wall's panelW footprint; `type`
 *  and (h,z) differ. These become instanced-mesh transforms on the renderer side. */
export interface StorePanel {
  type: StorefrontModule;
  faceIndex: number;
  floor: number; // 0 = ground floor
  bay: number;
  pos: Vec2; // panel center on the wall plane (world XY)
  z: number; // panel center height
  yawDeg: number; // rotation about +Z so the board faces outward
  w: number; // panel width (m)
  h: number; // panel height (m) — signband is a thin band
}

/** One outer wall segment, pre-diced into an integer bay count. */
export interface WallFace {
  index: number;
  a: Vec2;
  b: Vec2;
  normal: Vec2; // unit outward normal
  length: number;
  bays: number;
  isPrimary: boolean; // faces the primary road (entrance candidate)
  role: FaceRole;
}

/** An open flat roof on posts: entrance 車寄せ or fuel-station キャノピー. */
export interface Canopy {
  ring: Vec2[]; // footprint (world XY, CCW)
  height: number; // clear height to the underside (m)
  z: number; // base z
}

export interface StoreBuildingPlan {
  masses: StoreMass[];
  footprintRing: Vec2[]; // ground union ring, world XY CCW
  faces: WallFace[];
  floors: number;
  floorHeight: number;
  panels: StorePanel[];
  canopies: Canopy[];
  signs: SignInstance[]; // building-mounted signage (wall / blade / rooftop)
  logoId: number; // the store's brand-logo id (for the fascia plate + parity with signs)
  archetype: string;
}

// ---- site ------------------------------------------------------------------

/** A patch of ground with a role, driving its material.
 *  parking=マス群, aisle=車路, drive=出入口切り下げ, drivethrough=DTレーン,
 *  approach=歩行者動線, landscape=緑地/植栽帯, serviceyard=荷捌き,
 *  outdoor-display=屋外展示/資材, plaza=店頭広場, pad=建物下地, leftover=残余舗装. */
export type StoreZoneKind =
  | 'parking'
  | 'aisle'
  | 'drive'
  | 'drivethrough'
  | 'approach'
  | 'landscape'
  | 'serviceyard'
  | 'outdoor-display'
  | 'plaza'
  | 'pad'
  | 'leftover';

export interface SiteRect {
  ring: Vec2[]; // world-XY polygon (CCW)
  kind: StoreZoneKind;
}

/** A small placed object on the site. */
export type StorePropKind =
  | 'car'
  | 'truck'
  | 'cart-corral'
  | 'lightpole'
  | 'floodlight'
  | 'bike-park'
  | 'vending'
  | 'tree'
  | 'shrub'
  | 'flag'
  | 'trash'
  | 'fuel-pump'
  | 'ev-charger';

export interface StoreProp {
  kind: StorePropKind;
  center: Vec2; // world XY
  halfU: number; // half-extent along the lot U axis (m) — or canopy radius for plants
  halfV: number; // half-extent along the lot V axis (m)
  h: number; // height (m)
  yawDeg?: number;
  color?: number;
}

/** One parking stall in the field. */
export interface ParkingStall {
  center: Vec2; // world XY
  halfU: number; // half stall width (across)
  halfV: number; // half stall length (nose→tail)
  yawDeg: number; // facing (car long axis)
  occupied: boolean;
  accessible: boolean; // 身障者用 (wider, near the building)
  color?: number; // car paint when occupied
}

/** The parking field: stalls + the aisle/row ground patches. */
export interface ParkingField {
  stalls: ParkingStall[];
  aisles: SiteRect[]; // 車路
  rows: SiteRect[]; // マス列の地面帯
  stallW: number;
  stallL: number;
  count: number;
}

/** A run of perimeter boundary. curb=縁石, planting=沿道緑化, open=出入口. */
export type FenceKind = 'curb' | 'planting' | 'open';
export interface FenceSpan {
  a: Vec2;
  b: Vec2;
  normal: Vec2; // outward unit normal
  kind: FenceKind;
  height: number; // m
}

/** A sign. Freestanding: pylon=自立サインポール, menu=DTメニュー看板. Building-
 *  mounted: wall=壁面看板 (logo box flush on the frontage), blade=袖看板
 *  (double-sided sign projecting perpendicular from a frontage corner). Rooftop
 *  (陸屋根のみ): roof-cube=キューブ型塔屋看板, roof-board=板型屋上看板. */
export type SignKind = 'pylon' | 'menu' | 'wall' | 'blade' | 'roof-cube' | 'roof-board';
export interface SignInstance {
  kind: SignKind;
  pos: Vec2; // world XY of the base
  z: number; // base z
  yawDeg: number;
  w: number; // sign box width
  h: number; // sign box height
  poleH: number; // pole height from base to the underside of the box (0 for menu)
  color: number;
  // Stable brand-logo identifier (renderer contract): the renderer maps it to a
  // logo asset — the Three prototype picks a canvas drawer.
  // Every sign of one store shares the same id.
  logoId: number;
}

/** Where (and how big) the building may sit. The footprint composes masses into
 *  bay coords then rear-anchors bay(maxY) to originWorld, +V pointing inward. */
export interface StorePad {
  originWorld: Vec2; // world pos of the min-U rear corner
  axisU: Vec2; // street-parallel (unit)
  axisV: Vec2; // away-from-road / inward (unit)
  anchor: 'front' | 'rear';
  frontV: number; // building-front line depth from the road (m)
  maxWidthBays: number;
  maxDepthBays: number;
}

export interface StoreSitePlan {
  lotRing: Vec2[];
  pad: StorePad;
  parking: ParkingField;
  zones: SiteRect[];
  props: StoreProp[];
  signs: SignInstance[];
  entrances: { pos: Vec2; width: number }[]; // driveway mouths onto the road
  fences: FenceSpan[];
}
