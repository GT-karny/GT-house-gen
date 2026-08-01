import type { Vec2 } from '../../shared/vec';

export type ProtectionClass = 'class1' | 'class3' | 'class4';
export type GateLayout = 'none' | 'half-road' | 'split-entry-exit';
export type WarningLayout = 'none' | 'two-mast' | 'four-mast';
export type DeckType = 'asphalt' | 'concrete' | 'rubber';
export interface CrossingScenario {
  railwayClass: 'branch' | 'regional' | 'suburban' | 'trunk';
  roadClass: 'footpath' | 'local' | 'collector' | 'arterial';
  context: 'rural' | 'suburban' | 'urban';
  history: 'modern' | 'legacy';
}

export interface RoadCrossSectionConfig {
  lanes: Array<{ widthM: number; direction: 'forward' | 'backward' }>;
  leftShoulderM: number;
  rightShoulderM: number;
  leftSidewalkM: number;
  rightSidewalkM: number;
  medianWidthM: number;
  bicycleFacility: 'none' | 'lane-left' | 'lane-right' | 'both';
}

export interface CrossingOperationalConfig {
  trainSpeedKph: number;
  trainsPerHour: number;
  vehiclesPerDay: number;
  pedestriansPerDay: number;
  heavyVehicleRatio: number;
  history: 'modern' | 'legacy';
}

export interface CrossingPlacementConfig {
  crossingOffsetM: number;
  crossingSide: 'left' | 'right';
  crossingAngleDeg: number;
  trackRunoffM: number;
}

export interface RailwayCorridorConfig {
  trackCount: number;
  gaugeM: number;
  trackCenterSpacingM: number;
  /** Per-adjacent-track spacing. When omitted, trackCenterSpacingM is repeated. */
  trackCenterSpacingsM?: number[];
  sleeperSpacingM: number;
  sleeperLengthM: number;
  ballastWidthM: number;
  electrification: 'none' | 'overhead';
  sleeperType: 'pc' | 'wood';
}

export interface CrossingSurfaceConfig {
  deckType: DeckType;
  flangewayWidthM: number;
}

export interface CrossingProtectionConfig {
  /** Requested/expected class. The plan reports the class derived from devices. */
  protectionClass: ProtectionClass;
  gateLayout: GateLayout;
  warningLayout: WarningLayout;
  equipmentLevel: 'basic' | 'full';
}

export interface CrossingRuntimeConfig {
  barrierClosed: boolean;
  warningActive: boolean;
}

export interface RailwayConfig {
  seed: number;
  placement: CrossingPlacementConfig;
  railway: RailwayCorridorConfig;
  surface: CrossingSurfaceConfig;
  protection: CrossingProtectionConfig;
  operational: CrossingOperationalConfig;
  runtime: CrossingRuntimeConfig;
}

export interface CrossingOverrides {
  placement?: Partial<CrossingPlacementConfig>;
  railway?: Partial<RailwayCorridorConfig>;
  surface?: Partial<CrossingSurfaceConfig>;
  protection?: Partial<CrossingProtectionConfig>;
  operational?: Partial<CrossingOperationalConfig>;
  road?: Partial<Omit<RoadCrossSectionConfig, 'lanes'>> & { lanes?: RoadCrossSectionConfig['lanes'] };
}

export interface CrossingGenerationInput extends CrossingScenario {
  seed: number;
  overrides?: CrossingOverrides;
}

export interface CrossingAssessment {
  crossingTimeS: number;
  exposureIndex: number;
  recommendedDisposition: 'level-crossing' | 'grade-separated' | 'close-or-consolidate';
  reasons: string[];
}

export interface ResolvedCrossingScenario {
  input: CrossingGenerationInput;
  scenario: CrossingScenario;
  config: RailwayConfig;
  road: RoadCrossSectionConfig;
  assessment: CrossingAssessment;
}

export interface RailwayBounds {
  xMin: number;
  xMax: number;
  frontY: number;
  rearY: number;
  roadNearY: number;
  roadFarY: number;
  farEdgeY: number;
  roadLaneCount?: number;
}

export interface RailStrip {
  a: Vec2;
  b: Vec2;
  width: number;
  height: number;
  trackIndex?: number;
}

export interface TrackPlan {
  index: number;
  centerLine: RailStrip;
  rails: [RailStrip, RailStrip];
  checkRails: [RailStrip, RailStrip];
}

export interface SleeperInstance {
  center: Vec2;
  length: number;
  width: number;
  height: number;
  yawRad: number;
  fastenerCenters: [Vec2, Vec2];
}

export interface CrossingDevice {
  center: Vec2;
  gateCenter: Vec2;
  armDirY: -1 | 1;
  mastHeight: number;
  armLength: number;
  barrierClosed: boolean;
  warningActive: boolean;
  hasWarning: boolean;
  hasGate: boolean;
  hasDirectionIndicator: boolean;
}

export interface TracksideCabinet {
  center: Vec2;
  width: number;
  depth: number;
  height: number;
  kind: 'relay' | 'power';
}

export interface TracksidePost {
  center: Vec2;
  target?: Vec2;
  height: number;
  side: -1 | 1;
  kind: 'catenary' | 'detector' | 'special-signal' | 'lamp';
}

export interface FenceSpan {
  a: Vec2;
  b: Vec2;
  height: number;
}

export type CrossingIssueCode =
  | 'INVALID_TRACK_COUNT'
  | 'INVALID_TRACK_SPACING'
  | 'INVALID_CROSSING_ANGLE'
  | 'MODERN_ANGLE_BELOW_MINIMUM'
  | 'LEGACY_PROTECTION'
  | 'PROTECTION_CLASS_MISMATCH';

export interface CrossingIssue {
  code: CrossingIssueCode;
  severity: 'warning' | 'error';
  message: string;
}

export interface RailwayPlan {
  center: Vec2;
  railDirection: Vec2;
  railNormal: Vec2;
  crossingAngleDeg: number;
  gauge: number;
  ballast: RailStrip;
  tracks: TrackPlan[];
  trackCenterSpacingsM: number[];
  rails: RailStrip[];
  sleepers: SleeperInstance[];
  crossingDeck: Vec2[];
  stopLines: RailStrip[];
  roadMarkings: RailStrip[];
  devices: CrossingDevice[];
  checkRails: RailStrip[];
  cableTrough: RailStrip;
  fences: FenceSpan[];
  cabinets: TracksideCabinet[];
  posts: TracksidePost[];
  sleeperType: 'pc' | 'wood';
  electrified: boolean;
  protectionClass: ProtectionClass;
  equipmentLevel: 'basic' | 'full';
  warningActive: boolean;
  deckType: DeckType;
  flangewayWidthM: number;
  roadNearY: number;
  roadFarY: number;
  roadOuterNearY: number;
  roadOuterFarY: number;
  equipmentEnvelope: { xMin: number; xMax: number };
  validationIssues: CrossingIssue[];
}
