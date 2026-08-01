import { rand01 } from '../../shared/rng';
import { cloneRailwayConfig } from './config';
import type {
  CrossingAssessment, CrossingGenerationInput, CrossingScenario,
  RailwayConfig, ResolvedCrossingScenario, RoadCrossSectionConfig,
} from './types';

const choose = <T>(items: readonly T[], seed: number, key: number): T =>
  items[Math.floor(rand01(seed, key) * items.length)];

function roadFor(scenario: CrossingScenario, seed: number): RoadCrossSectionConfig {
  const laneWidth = scenario.roadClass === 'arterial' ? 3.25 : scenario.roadClass === 'collector' ? 3 : 2.75;
  const laneCount = scenario.roadClass === 'footpath' ? 1
    : scenario.roadClass === 'local' ? 2
      : scenario.roadClass === 'collector' ? 2
        : choose([3, 4] as const, seed, 201);
  const lanes = Array.from({ length: laneCount }, (_, i) => ({
    widthM: scenario.roadClass === 'footpath' ? 2 : laneWidth,
    direction: (i < Math.ceil(laneCount / 2) ? 'forward' : 'backward') as 'forward' | 'backward',
  }));
  const urban = scenario.context === 'urban';
  const suburban = scenario.context === 'suburban';
  return {
    lanes,
    leftShoulderM: scenario.roadClass === 'footpath' ? 0.25 : 0.5,
    rightShoulderM: scenario.roadClass === 'footpath' ? 0.25 : 0.5,
    leftSidewalkM: urban ? 2.5 : suburban ? 1.5 : 0,
    rightSidewalkM: urban ? 2.5 : suburban ? choose([0, 1.5] as const, seed, 202) : 0,
    medianWidthM: scenario.roadClass === 'arterial' && laneCount === 4 ? 1.0 : 0,
    bicycleFacility: urban && scenario.roadClass === 'arterial' ? 'both' : 'none',
  };
}

function applyOverrides(base: RailwayConfig, input: CrossingGenerationInput): RailwayConfig {
  const out = structuredClone(base);
  const o = input.overrides;
  if (!o) return out;
  if (o.placement) Object.assign(out.placement, o.placement);
  if (o.railway) Object.assign(out.railway, o.railway);
  if (o.surface) Object.assign(out.surface, o.surface);
  if (o.protection) Object.assign(out.protection, o.protection);
  if (o.operational) Object.assign(out.operational, o.operational);
  return out;
}

function assess(config: RailwayConfig, road: RoadCrossSectionConfig): CrossingAssessment {
  const roadWidth = road.lanes.reduce((sum, lane) => sum + lane.widthM, 0)
    + road.leftShoulderM + road.rightShoulderM + road.leftSidewalkM + road.rightSidewalkM + road.medianWidthM;
  const outerRailsM = config.railway.gaugeM
    + (config.railway.trackCenterSpacingsM ?? []).reduce((sum, spacing) => sum + spacing, 0);
  const crossingLengthM = outerRailsM / Math.sin(config.placement.crossingAngleDeg * Math.PI / 180) + 2;
  const crossingTimeS = crossingLengthM / (road.lanes.length === 1 ? 1.2 : 5.5);
  const exposureIndex = config.operational.trainsPerHour * config.operational.vehiclesPerDay * Math.max(1, crossingTimeS) / 1000;
  const reasons: string[] = [];
  let recommendedDisposition: CrossingAssessment['recommendedDisposition'] = 'level-crossing';
  if (config.operational.history === 'modern' && (config.placement.crossingAngleDeg < 45 || config.operational.trainSpeedKph > 160)) {
    recommendedDisposition = 'close-or-consolidate';
    reasons.push('Modern level-crossing geometry or train speed is outside the supported envelope.');
  } else if (exposureIndex > 1800 || roadWidth > 16 || config.railway.trackCount > 3) {
    recommendedDisposition = 'grade-separated';
    reasons.push('Traffic exposure, road width, or track count warrants grade-separation review.');
  }
  return { crossingTimeS, exposureIndex, recommendedDisposition, reasons };
}

/** Resolve a coherent crossing from scenario conditions + seed. Safety-critical equipment is not randomized. */
export function resolveCrossingScenario(input: CrossingGenerationInput): ResolvedCrossingScenario {
  const scenario: CrossingScenario = {
    railwayClass: input.railwayClass,
    roadClass: input.roadClass,
    context: input.context,
    history: input.history,
  };
  const base = cloneRailwayConfig();
  base.seed = input.seed;
  base.operational.history = scenario.history;
  base.placement.crossingAngleDeg = scenario.history === 'legacy'
    ? choose([30, 45, 60] as const, input.seed, 101)
    : choose([45, 60, 75, 90] as const, input.seed, 101);

  if (scenario.railwayClass === 'branch') {
    base.railway.trackCount = 1;
    base.railway.electrification = choose(['none', 'overhead'] as const, input.seed, 102);
    base.railway.sleeperType = choose(['pc', 'wood'] as const, input.seed, 103);
    Object.assign(base.operational, { trainSpeedKph: 70, trainsPerHour: 2 });
  } else if (scenario.railwayClass === 'regional') {
    base.railway.trackCount = choose([1, 2] as const, input.seed, 104);
    Object.assign(base.operational, { trainSpeedKph: 100, trainsPerHour: 6 });
  } else if (scenario.railwayClass === 'suburban') {
    base.railway.trackCount = 2;
    Object.assign(base.operational, { trainSpeedKph: 120, trainsPerHour: 14 });
  } else {
    base.railway.trackCount = choose([2, 3, 4] as const, input.seed, 105);
    Object.assign(base.operational, { trainSpeedKph: 140, trainsPerHour: 20 });
  }
  base.railway.trackCenterSpacingsM = Array.from({ length: base.railway.trackCount - 1 }, () =>
    scenario.railwayClass === 'trunk' ? 4.2 : 3.8,
  );

  const road = roadFor(scenario, input.seed);
  const traffic = scenario.roadClass === 'footpath' ? 0 : scenario.roadClass === 'local' ? 1200 : scenario.roadClass === 'collector' ? 6000 : 18000;
  Object.assign(base.operational, {
    vehiclesPerDay: traffic,
    pedestriansPerDay: scenario.context === 'urban' ? 5000 : scenario.context === 'suburban' ? 900 : 80,
    heavyVehicleRatio: scenario.roadClass === 'arterial' ? 0.16 : 0.06,
  });

  if (scenario.history === 'legacy') {
    Object.assign(base.protection, { protectionClass: 'class4', gateLayout: 'none', warningLayout: 'none', equipmentLevel: 'basic' });
    base.railway.electrification = 'none';
  } else if (scenario.railwayClass === 'branch' && scenario.roadClass === 'footpath' && scenario.context === 'rural') {
    Object.assign(base.protection, { protectionClass: 'class3', gateLayout: 'none', warningLayout: 'two-mast', equipmentLevel: 'basic' });
  } else {
    const highExposure = scenario.context === 'urban' || scenario.roadClass === 'arterial';
    Object.assign(base.protection, {
      protectionClass: 'class1',
      gateLayout: highExposure ? 'split-entry-exit' : 'half-road',
      warningLayout: highExposure ? 'four-mast' : 'two-mast',
      equipmentLevel: highExposure || base.operational.trainSpeedKph > 130 ? 'full' : base.protection.equipmentLevel,
    });
  }

  const config = applyOverrides(base, input);
  const resolvedRoad = { ...road, ...input.overrides?.road, lanes: input.overrides?.road?.lanes ?? road.lanes };
  const spacings = config.railway.trackCenterSpacingsM;
  if (!spacings || spacings.length !== config.railway.trackCount - 1) {
    config.railway.trackCenterSpacingsM = Array.from({ length: Math.max(0, config.railway.trackCount - 1) }, () => config.railway.trackCenterSpacingM);
  }
  return { input: structuredClone(input), scenario, config, road: resolvedRoad, assessment: assess(config, resolvedRoad) };
}
