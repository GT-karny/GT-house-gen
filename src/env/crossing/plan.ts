import { add, scale } from '../../shared/vec';
import type { Vec2 } from '../../shared/vec';
import type {
  CrossingDevice, CrossingIssue, FenceSpan, RailStrip, RailwayBounds, RailwayConfig,
  RailwayPlan, SleeperInstance, TrackPlan, TracksidePost,
} from './types';

const RAIL_HEAD_WIDTH = 0.07;
const EPS = 1e-9;

const point = (origin: Vec2, dir: Vec2, normal: Vec2, s: number, n: number): Vec2 =>
  add(origin, add(scale(dir, s), scale(normal, n)));

function atY(origin: Vec2, dir: Vec2, normal: Vec2, y: number, n: number): Vec2 {
  const s = (y - origin.y - normal.y * n) / dir.y;
  return point(origin, dir, normal, s, n);
}

const projection = (p: Vec2, origin: Vec2, axis: Vec2) =>
  (p.x - origin.x) * axis.x + (p.y - origin.y) * axis.y;

function resolvedConfig(cfg: RailwayConfig): { cfg: RailwayConfig; issues: CrossingIssue[] } {
  const out = structuredClone(cfg);
  const issues: CrossingIssue[] = [];
  const requestedAngle = out.placement.crossingAngleDeg;
  if (!Number.isFinite(out.railway.trackCount) || out.railway.trackCount < 1) {
    issues.push({ code: 'INVALID_TRACK_COUNT', severity: 'error', message: 'trackCount must be at least 1' });
  }
  out.railway.trackCount = Math.min(4, Math.max(1, Math.round(out.railway.trackCount || 1)));
  const suppliedSpacings = out.railway.trackCenterSpacingsM;
  if (suppliedSpacings && suppliedSpacings.length !== out.railway.trackCount - 1) {
    issues.push({ code: 'INVALID_TRACK_SPACING', severity: 'error', message: 'trackCenterSpacingsM length must equal trackCount - 1' });
    out.railway.trackCenterSpacingsM = undefined;
  }
  if (!(out.railway.trackCenterSpacingM > out.railway.gaugeM)) {
    issues.push({ code: 'INVALID_TRACK_SPACING', severity: 'error', message: 'track center spacing must exceed gauge' });
    out.railway.trackCenterSpacingM = Math.max(out.railway.gaugeM + 0.5, 3.0);
  }
  const spacings = out.railway.trackCenterSpacingsM
    ?? Array.from({ length: out.railway.trackCount - 1 }, () => out.railway.trackCenterSpacingM);
  if (spacings.some((spacing) => !(spacing > out.railway.gaugeM))) {
    issues.push({ code: 'INVALID_TRACK_SPACING', severity: 'error', message: 'every track center spacing must exceed gauge' });
    out.railway.trackCenterSpacingsM = spacings.map((spacing) =>
      spacing > out.railway.gaugeM ? spacing : Math.max(out.railway.gaugeM + 0.5, 3.0));
  } else {
    out.railway.trackCenterSpacingsM = spacings;
  }
  if (!(out.placement.crossingAngleDeg >= 30 && out.placement.crossingAngleDeg <= 90)) {
    issues.push({ code: 'INVALID_CROSSING_ANGLE', severity: 'error', message: 'crossing angle must be between 30 and 90 degrees' });
    out.placement.crossingAngleDeg = Math.min(90, Math.max(30, out.placement.crossingAngleDeg || 90));
  }
  if (out.operational.history === 'modern' && requestedAngle >= 30 && requestedAngle < 45) {
    issues.push({ code: 'MODERN_ANGLE_BELOW_MINIMUM', severity: 'error', message: 'modern crossings require an angle of at least 45 degrees' });
  }
  if (out.operational.history === 'legacy' && out.protection.protectionClass === 'class4') {
    issues.push({ code: 'LEGACY_PROTECTION', severity: 'warning', message: 'class-4 is retained only to reproduce a legacy existing crossing' });
  }
  return { cfg: out, issues };
}

/** Pure deterministic planner for a straight Japanese level crossing. */
export function planRailway(bounds: RailwayBounds, input: RailwayConfig): RailwayPlan {
  const resolved = resolvedConfig(input);
  const cfg = resolved.cfg;
  const angle = cfg.placement.crossingAngleDeg * Math.PI / 180;
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -dir.y, y: dir.x };
  const center = {
    x: cfg.placement.crossingSide === 'right'
      ? bounds.xMax + Math.max(3, cfg.placement.crossingOffsetM)
      : bounds.xMin - Math.max(3, cfg.placement.crossingOffsetM),
    y: (bounds.roadNearY + bounds.roadFarY) / 2,
  };

  const railCfg = cfg.railway;
  const gauge = Math.max(0.75, railCfg.gaugeM);
  const trackCount = railCfg.trackCount;
  const trackCenterSpacingsM = railCfg.trackCenterSpacingsM
    ?? Array.from({ length: trackCount - 1 }, () => railCfg.trackCenterSpacingM);
  const centerSpan = trackCenterSpacingsM.reduce((sum, spacing) => sum + spacing, 0);
  const singleBallastWidth = Math.max(railCfg.sleeperLengthM + 0.8, railCfg.ballastWidthM);
  const corridorWidth = centerSpan + singleBallastWidth;
  const corridorHalf = corridorWidth / 2;
  const yMin = bounds.farEdgeY - Math.max(8, cfg.placement.trackRunoffM);
  const yMax = bounds.rearY + Math.max(8, cfg.placement.trackRunoffM);
  const sMin = (yMin - center.y) / dir.y;
  const sMax = (yMax - center.y) / dir.y;
  const s0 = Math.min(sMin, sMax);
  const s1 = Math.max(sMin, sMax);

  const stripAt = (n: number, width: number, height: number, trackIndex?: number): RailStrip => ({
    a: point(center, dir, normal, s0, n),
    b: point(center, dir, normal, s1, n),
    width, height, trackIndex,
  });
  const ballast = stripAt(0, corridorWidth, 0.10);

  const tracks: TrackPlan[] = [];
  const sleepers: SleeperInstance[] = [];
  const sleeperSpacing = Math.max(0.35, railCfg.sleeperSpacingM);
  const sleeperYaw = Math.atan2(normal.y, normal.x);
  const trackOffsets = [-centerSpan / 2];
  for (const spacing of trackCenterSpacingsM) trackOffsets.push(trackOffsets[trackOffsets.length - 1] + spacing);
  for (let i = 0; i < trackCount; i++) {
    const trackOffset = trackOffsets[i];
    const railOffset = gauge / 2 + RAIL_HEAD_WIDTH / 2;
    const rails: [RailStrip, RailStrip] = [
      stripAt(trackOffset - railOffset, RAIL_HEAD_WIDTH, 0.15, i),
      stripAt(trackOffset + railOffset, RAIL_HEAD_WIDTH, 0.15, i),
    ];
    const checkOffset = gauge / 2 - 0.12;
    const deckS = Math.max(...[
      atY(center, dir, normal, bounds.frontY, -corridorHalf),
      atY(center, dir, normal, bounds.frontY, corridorHalf),
      atY(center, dir, normal, bounds.farEdgeY, -corridorHalf),
      atY(center, dir, normal, bounds.farEdgeY, corridorHalf),
    ].map((p) => Math.abs(projection(p, center, dir)))) + 0.35;
    const checkRails: [RailStrip, RailStrip] = [
      { a: point(center, dir, normal, -deckS, trackOffset - checkOffset), b: point(center, dir, normal, deckS, trackOffset - checkOffset), width: 0.045, height: 0.09, trackIndex: i },
      { a: point(center, dir, normal, -deckS, trackOffset + checkOffset), b: point(center, dir, normal, deckS, trackOffset + checkOffset), width: 0.045, height: 0.09, trackIndex: i },
    ];
    tracks.push({ index: i, centerLine: stripAt(trackOffset, 0, 0, i), rails, checkRails });

    const first = Math.ceil(s0 / sleeperSpacing) * sleeperSpacing;
    for (let s = first; s <= s1 + EPS; s += sleeperSpacing) {
      const sleeperCenter = point(center, dir, normal, s, trackOffset);
      if (sleeperCenter.y > bounds.farEdgeY - 0.45 && sleeperCenter.y < bounds.frontY + 0.45) continue;
      sleepers.push({
        center: sleeperCenter,
        length: railCfg.sleeperLengthM,
        width: 0.22,
        height: 0.14,
        yawRad: sleeperYaw,
        fastenerCenters: [point(center, dir, normal, s, trackOffset - railOffset), point(center, dir, normal, s, trackOffset + railOffset)],
      });
    }
  }

  const crossingDeck = [
    atY(center, dir, normal, bounds.frontY, -corridorHalf),
    atY(center, dir, normal, bounds.frontY, corridorHalf),
    atY(center, dir, normal, bounds.farEdgeY, corridorHalf),
    atY(center, dir, normal, bounds.farEdgeY, -corridorHalf),
  ];

  const halfXAtY = corridorHalf / Math.max(Math.abs(dir.y), EPS);
  const centerXAtY = (y: number) => center.x + dir.x * (y - center.y) / dir.y;
  const roadMidY = (bounds.roadNearY + bounds.roadFarY) / 2;
  const leftX = centerXAtY(roadMidY) - halfXAtY;
  const rightX = centerXAtY(roadMidY) + halfXAtY;
  const stopOffset = 1.8;
  const stopLines: RailStrip[] = [
    { a: { x: leftX - stopOffset, y: roadMidY }, b: { x: leftX - stopOffset, y: bounds.roadNearY }, width: 0.30, height: 0.02 },
    { a: { x: rightX + stopOffset, y: bounds.roadFarY }, b: { x: rightX + stopOffset, y: roadMidY }, width: 0.30, height: 0.02 },
  ];
  const lanes = Math.min(4, Math.max(1, Math.round(bounds.roadLaneCount ?? 2)));
  const roadMarkings: RailStrip[] = [];
  for (let i = 1; i < lanes; i++) {
    const y = bounds.roadNearY - (bounds.roadNearY - bounds.roadFarY) * i / lanes;
    const x = centerXAtY(y);
    roadMarkings.push({ a: { x: x - halfXAtY, y }, b: { x: x + halfXAtY, y }, width: 0.10, height: 0.01 });
  }

  const devices: CrossingDevice[] = [];
  const protection = cfg.protection;
  const gateEnabled = protection.protectionClass === 'class1' && protection.gateLayout !== 'none';
  const warningEnabled = protection.protectionClass !== 'class4' && protection.warningLayout !== 'none';
  if (gateEnabled || warningEnabled) {
    // Keep foundations and cabinets out of the pedestrian clear width. The
    // bounds' front/far edges are the OUTER edges of the two sidewalk bands.
    const equipmentOutsideClearance = 0.55;
    const nearEquipmentY = bounds.frontY + equipmentOutsideClearance;
    const farEquipmentY = bounds.farEdgeY - equipmentOutsideClearance;
    const makeDevice = (west: boolean, oppositeSide = false): CrossingDevice => {
      const y = west
        ? (oppositeSide ? farEquipmentY : nearEquipmentY)
        : (oppositeSide ? nearEquipmentY : farEquipmentY);
      const xEdge = centerXAtY(y) + (west ? -halfXAtY : halfXAtY);
      const armLength = Math.max(2.2, Math.abs(y - roadMidY) + 0.25);
      return {
        center: { x: xEdge + (west ? -1.25 : 1.25), y },
        gateCenter: { x: xEdge + (west ? -0.28 : 0.28), y },
        armDirY: (y > roadMidY ? -1 : 1),
        mastHeight: 4.6,
        armLength,
        barrierClosed: cfg.runtime.barrierClosed,
        warningActive: cfg.runtime.warningActive,
        hasWarning: warningEnabled && (!oppositeSide || protection.warningLayout === 'four-mast'),
        hasGate: gateEnabled,
        hasDirectionIndicator: trackCount >= 2,
      };
    };
    devices.push(makeDevice(true), makeDevice(false));
    if (gateEnabled && protection.gateLayout === 'split-entry-exit') {
      devices.push(makeDevice(true, true), makeDevice(false, true));
    } else if (protection.warningLayout === 'four-mast') {
      const a = makeDevice(true, true); a.hasGate = false;
      const b = makeDevice(false, true); b.hasGate = false;
      devices.push(a, b);
    }
  }

  const hasGate = devices.some((device) => device.hasGate);
  const hasWarning = devices.some((device) => device.hasWarning);
  const protectionClass = hasGate ? 'class1' : hasWarning ? 'class3' : 'class4';
  if (protectionClass !== protection.protectionClass || (hasGate && !hasWarning)) {
    resolved.issues.push({
      code: 'PROTECTION_CLASS_MISMATCH', severity: 'error',
      message: `requested ${protection.protectionClass}, but installed devices classify as ${protectionClass}`,
    });
  }

  const deckSValues = crossingDeck.map((p) => projection(p, center, dir));
  const deckSMin = Math.min(...deckSValues);
  const deckSMax = Math.max(...deckSValues);
  const rowSide: -1 | 1 = cfg.placement.crossingSide === 'right' ? -1 : 1;
  const outerSide: -1 | 1 = rowSide === 1 ? -1 : 1;
  const cableN = rowSide * (corridorHalf + 0.28);
  const cableTrough = stripAt(cableN, 0.34, 0.12);

  const fences: FenceSpan[] = [];
  const fenceGap = 0.65;
  for (const side of [-1, 1] as const) {
    const n = side * (corridorHalf + 0.72);
    fences.push(
      { a: point(center, dir, normal, s0, n), b: point(center, dir, normal, deckSMin - fenceGap, n), height: 1.15 },
      { a: point(center, dir, normal, deckSMax + fenceGap, n), b: point(center, dir, normal, s1, n), height: 1.15 },
    );
  }

  const outerN = outerSide * (corridorHalf + 1.15);
  const cabinets = protection.equipmentLevel === 'full' ? [
    { center: point(center, dir, normal, deckSMax + 2.3, outerN), width: 0.95, depth: 0.55, height: 1.35, kind: 'relay' as const },
    { center: point(center, dir, normal, deckSMax + 3.25, outerN), width: 0.62, depth: 0.45, height: 0.90, kind: 'power' as const },
  ] : [];

  const posts: TracksidePost[] = [];
  if (protection.equipmentLevel === 'full' && protection.protectionClass !== 'class4') {
    for (const s of [deckSMin - 0.75, deckSMax + 0.75]) {
      for (const side of [-1, 1] as const) {
        const p = point(center, dir, normal, s, side * (corridorHalf + 0.36));
        posts.push({ center: p, target: point(center, dir, normal, s, 0), height: 0.95, side, kind: 'detector' });
      }
    }
    posts.push(
      { center: point(center, dir, normal, deckSMax + 8, outerN), height: 3.4, side: outerSide, kind: 'special-signal' },
      { center: point(center, dir, normal, deckSMin - 2.2, outerN), target: point(center, dir, normal, deckSMin - 2.2, 0), height: 4.2, side: outerSide, kind: 'lamp' },
    );
  }
  if (railCfg.electrification === 'overhead') {
    const mastSpacing = 18;
    let i = 0;
    for (let s = Math.ceil(s0 / mastSpacing) * mastSpacing; s <= s1; s += mastSpacing, i++) {
      if (s > deckSMin - 4 && s < deckSMax + 4) continue;
      const side = (i % 2 === 0 ? rowSide : outerSide) as -1 | 1;
      const p = point(center, dir, normal, s, side * (corridorHalf + 1.25));
      posts.push({ center: p, target: point(center, dir, normal, s, 0), height: 7.2, side, kind: 'catenary' });
    }
  }

  const rails = tracks.flatMap((track) => track.rails);
  const checkRails = tracks.flatMap((track) => track.checkRails);
  const allX = [...crossingDeck.map((p) => p.x), ...devices.flatMap((d) => [d.center.x, d.gateCenter.x])];
  return {
    center, railDirection: dir, railNormal: normal, crossingAngleDeg: cfg.placement.crossingAngleDeg,
    gauge, ballast, tracks, trackCenterSpacingsM, rails, sleepers, crossingDeck, stopLines, roadMarkings, devices, checkRails,
    cableTrough, fences, cabinets, posts, sleeperType: railCfg.sleeperType,
    electrified: railCfg.electrification === 'overhead', protectionClass,
    equipmentLevel: protection.equipmentLevel, warningActive: cfg.runtime.warningActive,
    deckType: cfg.surface.deckType, flangewayWidthM: Math.max(0.04, cfg.surface.flangewayWidthM),
    roadNearY: bounds.roadNearY, roadFarY: bounds.roadFarY,
    roadOuterNearY: bounds.frontY, roadOuterFarY: bounds.farEdgeY,
    equipmentEnvelope: { xMin: Math.min(...allX) - 0.8, xMax: Math.max(...allX) + 0.8 },
    validationIssues: resolved.issues,
  };
}
