// ============================================================================
// Japanese railway / level crossing scenery plan. Pure TypeScript: no Three.js.
//
// The default represents a common automatic class-1 level crossing on a
// 1,067 mm conventional line. Dimensions are visualisation defaults in metres,
// based on MLIT/JRTT technical material; this is not a construction drawing.
// The road runs along +X and the railway crosses it at 90 degrees along +Y.
// ============================================================================

import type { Vec2 } from './streetscape';

export interface RailwayConfig {
  seed: number;
  gauge: number;
  sleeperSpacing: number;
  sleeperLength: number;
  ballastWidth: number;
  crossingOffset: number;
  crossingSide: 'left' | 'right';
  trackRunoff: number;
  barrierClosed: boolean;
  warningActive: boolean;
  electrified: boolean;
  sleeperType: 'pc' | 'wood';
  safetyEquipment: 'basic' | 'full';
}

export const DEFAULT_RAILWAY: RailwayConfig = {
  seed: 0,
  gauge: 1.067,
  sleeperSpacing: 0.60,
  sleeperLength: 2.0,
  ballastWidth: 3.2,
  crossingOffset: 7.0,
  crossingSide: 'right',
  trackRunoff: 24,
  barrierClosed: false,
  warningActive: false,
  electrified: true,
  sleeperType: 'pc',
  safetyEquipment: 'full',
};

export interface RailwayBounds {
  xMin: number;
  xMax: number;
  frontY: number;
  rearY: number;
  roadNearY: number;
  roadFarY: number;
  farEdgeY: number;
}

export interface RailStrip {
  a: Vec2;
  b: Vec2;
  width: number;
  height: number;
}

export interface SleeperInstance {
  center: Vec2;
  length: number;
  width: number;
  height: number;
}

export interface CrossingDevice {
  /** Independent warning mast / lamps position. */
  center: Vec2;
  /** Independent electric gate machine position, on its own foundation. */
  gateCenter: Vec2;
  /** Direction from the roadside post into the carriageway in generation XY. */
  armDirY: -1 | 1;
  mastHeight: number;
  armLength: number;
  barrierClosed: boolean;
  warningActive: boolean;
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
  height: number;
  side: -1 | 1;
  kind: 'catenary' | 'detector' | 'special-signal' | 'lamp';
}

export interface FenceSpan {
  a: Vec2;
  b: Vec2;
  height: number;
}

export interface RailwayPlan {
  centerX: number;
  gauge: number;
  ballast: RailStrip;
  rails: [RailStrip, RailStrip];
  sleepers: SleeperInstance[];
  crossingDeck: Vec2[];
  deckMinY: number;
  deckMaxY: number;
  stopLines: RailStrip[];
  devices: [CrossingDevice, CrossingDevice];
  checkRails: [RailStrip, RailStrip];
  cableTrough: RailStrip;
  fences: FenceSpan[];
  cabinets: TracksideCabinet[];
  posts: TracksidePost[];
  sleeperType: 'pc' | 'wood';
  electrified: boolean;
  safetyEquipment: 'basic' | 'full';
  warningActive: boolean;
}

/** Deterministic plan for a single-track railway and a Japanese class-1 crossing. */
export function planRailway(b: RailwayBounds, cfg: RailwayConfig = DEFAULT_RAILWAY): RailwayPlan {
  const gauge = Math.max(0.75, cfg.gauge);
  const spacing = Math.max(0.35, cfg.sleeperSpacing);
  const ballastWidth = Math.max(cfg.sleeperLength + 0.8, cfg.ballastWidth);
  const centerX = cfg.crossingSide === 'right'
    ? b.xMax + Math.max(3, cfg.crossingOffset)
    : b.xMin - Math.max(3, cfg.crossingOffset);
  const yMin = b.farEdgeY - Math.max(8, cfg.trackRunoff);
  const yMax = b.rearY + Math.max(8, cfg.trackRunoff);
  const railHeadWidth = 0.07;

  const ballast: RailStrip = {
    a: { x: centerX, y: yMin }, b: { x: centerX, y: yMax }, width: ballastWidth, height: 0.10,
  };
  // Gauge is measured between the inner rail-head faces.
  const railCenterOffset = gauge / 2 + railHeadWidth / 2;
  const rails: [RailStrip, RailStrip] = [
    { a: { x: centerX - railCenterOffset, y: yMin }, b: { x: centerX - railCenterOffset, y: yMax }, width: railHeadWidth, height: 0.15 },
    { a: { x: centerX + railCenterOffset, y: yMin }, b: { x: centerX + railCenterOffset, y: yMax }, width: railHeadWidth, height: 0.15 },
  ];

  const deckMinY = b.farEdgeY;
  const deckMaxY = b.frontY;
  const sleepers: SleeperInstance[] = [];
  const first = Math.ceil(yMin / spacing) * spacing;
  for (let y = first; y <= yMax + 1e-9; y += spacing) {
    // Crossing panels cover the sleepers through the public-road envelope.
    if (y > deckMinY - 0.15 && y < deckMaxY + 0.15) continue;
    sleepers.push({ center: { x: centerX, y }, length: cfg.sleeperLength, width: 0.22, height: 0.14 });
  }

  const halfDeck = ballastWidth / 2;
  const crossingDeck: Vec2[] = [
    { x: centerX - halfDeck, y: deckMinY },
    { x: centerX + halfDeck, y: deckMinY },
    { x: centerX + halfDeck, y: deckMaxY },
    { x: centerX - halfDeck, y: deckMaxY },
  ];
  const checkOffset = gauge / 2 - 0.12;
  const checkRails: [RailStrip, RailStrip] = [
    { a: { x: centerX - checkOffset, y: deckMinY - 0.35 }, b: { x: centerX - checkOffset, y: deckMaxY + 0.35 }, width: 0.045, height: 0.09 },
    { a: { x: centerX + checkOffset, y: deckMinY - 0.35 }, b: { x: centerX + checkOffset, y: deckMaxY + 0.35 }, width: 0.045, height: 0.09 },
  ];

  const roadMidY = (b.roadNearY + b.roadFarY) / 2;
  const stopOffset = halfDeck + 1.8;
  const stopLines: RailStrip[] = [
    { a: { x: centerX - stopOffset, y: roadMidY }, b: { x: centerX - stopOffset, y: b.roadNearY }, width: 0.30, height: 0.02 },
    { a: { x: centerX + stopOffset, y: b.roadFarY }, b: { x: centerX + stopOffset, y: roadMidY }, width: 0.30, height: 0.02 },
  ];

  const deviceOffsetX = halfDeck + 1.25;
  const gateOffsetX = halfDeck + 0.28;
  const roadShoulderInset = 0.38;
  const armLength = Math.max(2.2, Math.abs(b.roadNearY - b.roadFarY) / 2 + 0.35);
  const devices: [CrossingDevice, CrossingDevice] = [
    {
      center: { x: centerX - deviceOffsetX, y: b.roadNearY + roadShoulderInset },
      gateCenter: { x: centerX - gateOffsetX, y: b.roadNearY + roadShoulderInset },
      armDirY: -1, mastHeight: 4.6, armLength, barrierClosed: cfg.barrierClosed, warningActive: cfg.warningActive,
    },
    {
      center: { x: centerX + deviceOffsetX, y: b.roadFarY - roadShoulderInset },
      gateCenter: { x: centerX + gateOffsetX, y: b.roadFarY - roadShoulderInset },
      armDirY: 1, mastHeight: 4.6, armLength, barrierClosed: cfg.barrierClosed, warningActive: cfg.warningActive,
    },
  ];

  const rowSide: -1 | 1 = cfg.crossingSide === 'right' ? -1 : 1;
  const outerSide: -1 | 1 = rowSide === 1 ? -1 : 1;
  const trackEdge = ballastWidth / 2;
  const cableX = centerX + rowSide * (trackEdge + 0.28);
  const cableTrough: RailStrip = {
    a: { x: cableX, y: yMin }, b: { x: cableX, y: yMax }, width: 0.34, height: 0.12,
  };

  const fenceGap = 0.65;
  const fences: FenceSpan[] = [];
  for (const side of [-1, 1] as const) {
    const x = centerX + side * (trackEdge + 0.72);
    fences.push(
      { a: { x, y: yMin }, b: { x, y: deckMinY - fenceGap }, height: 1.15 },
      { a: { x, y: deckMaxY + fenceGap }, b: { x, y: yMax }, height: 1.15 },
    );
  }

  const cabinets: TracksideCabinet[] = cfg.safetyEquipment === 'full' ? [
    { center: { x: centerX + outerSide * (trackEdge + 1.15), y: deckMaxY + 2.3 }, width: 0.95, depth: 0.55, height: 1.35, kind: 'relay' },
    { center: { x: centerX + outerSide * (trackEdge + 1.10), y: deckMaxY + 3.25 }, width: 0.62, depth: 0.45, height: 0.90, kind: 'power' },
  ] : [];

  const posts: TracksidePost[] = [];
  if (cfg.safetyEquipment === 'full') {
    for (const y of [deckMinY - 0.75, deckMaxY + 0.75]) {
      posts.push(
        { center: { x: centerX - trackEdge - 0.36, y }, height: 0.95, side: -1, kind: 'detector' },
        { center: { x: centerX + trackEdge + 0.36, y }, height: 0.95, side: 1, kind: 'detector' },
      );
    }
    posts.push(
      { center: { x: centerX + outerSide * (trackEdge + 0.95), y: deckMaxY + 8.0 }, height: 3.4, side: outerSide, kind: 'special-signal' },
      { center: { x: centerX + outerSide * (trackEdge + 0.90), y: deckMinY - 2.2 }, height: 4.2, side: outerSide, kind: 'lamp' },
    );
  }
  if (cfg.electrified) {
    const mastSpacing = 18;
    let i = 0;
    for (let y = Math.ceil(yMin / mastSpacing) * mastSpacing; y <= yMax; y += mastSpacing, i++) {
      if (y > deckMinY - 4 && y < deckMaxY + 4) continue;
      const side = (i % 2 === 0 ? rowSide : outerSide) as -1 | 1;
      posts.push({ center: { x: centerX + side * (trackEdge + 1.25), y }, height: 7.2, side, kind: 'catenary' });
    }
  }

  return {
    centerX, gauge, ballast, rails, sleepers, crossingDeck, deckMinY, deckMaxY,
    stopLines, devices, checkRails, cableTrough, fences, cabinets, posts,
    sleeperType: cfg.sleeperType, electrified: cfg.electrified, safetyEquipment: cfg.safetyEquipment,
    warningActive: cfg.warningActive,
  };
}
