// ============================================================================
// House-Gen data model — PURE, no Three.js. Renderer-agnostic core, meant to be
// portable to other runtimes. Units: meters. World plane is XY,
// up is +Z (Z-up world convention).
// ============================================================================

export interface Vec2 {
  x: number;
  y: number;
}

/** Oriented bounding box / rectangular mass. AxisU is the long/street-facing axis. */
export interface OBB {
  center: Vec2;
  axisU: Vec2; // unit, long axis (street frontage)
  axisV: Vec2; // unit, perpendicular
  halfU: number;
  halfV: number;
}

/**
 * Input lot / parcel. A stable attribute set so a port to another runtime can
 * consume the same fields by name.
 */
export interface Lot {
  ring: Vec2[]; // CCW closed ring (world XY, meters)
  baseZ: number;
  areaM2: number;
  centroid: Vec2;
  longestEdgeDir: Vec2; // street-facing long axis (the road-aligned OBB's U axis)
  primaryRoadId: number; // used to pick the entrance facade
  adjacentRoadIds: number[];
  /** Direction (unit) pointing from the lot toward its primary road — the entrance faces this way. */
  roadDir: Vec2;
}

export type Module = 'wall' | 'window' | 'door';

/** Window opening size class. large≈掃き出し窓, medium≈腰窓, small≈小窓. */
export type WindowSize = 'small' | 'medium' | 'large';

/** Which way a wall faces, driving how open/closed it is. */
export type FaceRole = 'street' | 'garden' | 'side';

/** A rectangular mass tagged with its storey count (下屋 = 1, main = floors). */
export interface MassInfo {
  obb: OBB;
  floors: number;
}

/** A 2nd-floor balcony run in front of a garden 掃き出し窓. */
export interface Balcony {
  a: Vec2; // start along the wall
  b: Vec2; // end along the wall
  normal: Vec2; // outward
  z: number; // floor level of the balcony deck
  depth: number; // how far it protrudes (m)
}

/**
 * One placed facade panel. All modules share the same PANEL_W x PANEL_H board
 * footprint; only `type` (and thus the mesh/material) differs. On the renderer
 * side these become instanced-mesh transforms.
 */
export interface PanelInstance {
  type: Module;
  faceIndex: number; // which outer wall segment
  floor: number; // 0 = ground floor
  bay: number; // column index within the wall (basis for vertical alignment)
  pos: Vec2; // panel center on the wall plane (world XY)
  z: number; // panel center height
  yawDeg: number; // rotation about +Z so the board faces outward
  size?: WindowSize; // only for type === 'window'
  grille?: boolean; // 面格子 over a small ground-floor window
  shutter?: boolean; // シャッターボックス above the window
  protrude?: boolean; // 出窓 — window box juts out from the wall
}

/** One outer wall segment of the footprint, pre-diced into an integer bay count. */
export interface WallFace {
  index: number;
  a: Vec2; // start (ring order → interior on the left, outward normal on the right)
  b: Vec2; // end
  normal: Vec2; // unit outward normal
  length: number;
  bays: number; // length / PANEL_W, integer
  isPrimary: boolean; // faces the primary road (door candidate)
  role: FaceRole; // street / garden / side
}

// ============================================================================
// Site plan — the LOT and everything on it around the house: parking, garden,
// approach path, and the perimeter fence. Pure data, renderer-agnostic and
// portable.
// ============================================================================

/** A patch of ground with a role, driving its material (asphalt/lawn/pavers).
 *  yard = gravel 犬走り / leftover, service = 勝手口サービスヤード (物置・室外機),
 *  bike = 駐輪スペース, planting = 前庭の植栽帯. */
export type ZoneKind = 'parking' | 'approach' | 'garden' | 'yard' | 'service' | 'bike' | 'planting';
export interface SiteRect {
  ring: Vec2[]; // world-XY rectangle (CCW)
  kind: ZoneKind;
}

/** A small placed object. Utility: shed / AC / bike. Planting: tree / shrub
 *  (for planting, halfU carries the canopy radius and halfV is unused).
 *  car = a parked vehicle in a stall (halfV = half length, faces the road). */
export type PropKind = 'shed' | 'ac' | 'bike' | 'tree' | 'shrub' | 'car';
export interface SiteProp {
  kind: PropKind;
  center: Vec2; // world XY
  halfU: number; // half-extent along the lot U axis (m) — or canopy radius for plants
  halfV: number; // half-extent along the lot V axis (m)
  h: number; // height (m)
  color?: number; // car paint colour
}

/** An open carport structure (posts + roof) over the driveway. */
export interface Carport {
  ring: Vec2[]; // footprint (the parking rect), world XY
  height: number; // clear height to the underside of the roof (m)
}

/** A run of perimeter boundary. 'solid'=wall/fence, 'gate'=門扉, 'open'=driveway mouth. */
export type FenceKind = 'solid' | 'gate' | 'open';
export interface FenceSpan {
  a: Vec2; // start along the lot edge
  b: Vec2; // end
  normal: Vec2; // outward unit normal
  kind: FenceKind;
  height: number; // m
}

/** Where (and how big) the house is allowed to sit inside the lot. The footprint
 *  generator composes its masses into bay-coords then anchors bay(0,0) to
 *  originWorld (the garden-side FRONT corner of the pad), +V pointing inward. */
export interface HousePad {
  originWorld: Vec2; // world pos of the anchor corner (min-U, at the anchored depth line)
  axisU: Vec2; // street-parallel (unit)
  axisV: Vec2; // away-from-road / inward (unit)
  anchor: 'front' | 'rear'; // which depth edge is pinned: 'rear' pushes the house to the back
  frontV: number; // depth (m) of the house-zone front line from the road (reference)
  maxWidthBays: number; // hard clamp on composed footprint width
  maxDepthBays: number; // hard clamp on composed footprint depth
}

export interface SitePlan {
  lotRing: Vec2[]; // world-XY lot boundary (CCW)
  arrangement: 'front' | 'beside'; // parking in front of vs beside the house
  cars: number;
  pad: HousePad;
  zones: SiteRect[]; // parking / approach / garden / yard patches
  props: SiteProp[]; // shed / AC units / bike / trees / parked cars
  carport?: Carport; // optional roofed structure over the drive
  fences: FenceSpan[]; // perimeter runs
}

export interface BuildingPlan {
  masses: MassInfo[]; // composed rectangular masses w/ storey count (roof + step)
  footprintRing: Vec2[]; // ground-floor union ring (full outline, CCW)
  faces: WallFace[]; // ground-floor faces (for HUD/debug)
  floors: number; // max storeys
  floorHeight: number;
  panels: PanelInstance[]; // instanced-mesh transforms on the renderer side
  balconies: Balcony[];
  archetype: string;
}
