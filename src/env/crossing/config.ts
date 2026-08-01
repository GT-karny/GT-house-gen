import type { RailwayConfig } from './types';

export const DEFAULT_RAILWAY: RailwayConfig = {
  seed: 0,
  placement: {
    crossingOffsetM: 7,
    crossingSide: 'right',
    crossingAngleDeg: 90,
    trackRunoffM: 24,
  },
  railway: {
    trackCount: 1,
    gaugeM: 1.067,
    trackCenterSpacingM: 3.8,
    sleeperSpacingM: 0.60,
    sleeperLengthM: 2.0,
    ballastWidthM: 3.2,
    electrification: 'overhead',
    sleeperType: 'pc',
  },
  surface: {
    deckType: 'rubber',
    flangewayWidthM: 0.075,
  },
  protection: {
    protectionClass: 'class1',
    gateLayout: 'half-road',
    warningLayout: 'two-mast',
    equipmentLevel: 'full',
  },
  operational: {
    trainSpeedKph: 100,
    trainsPerHour: 8,
    vehiclesPerDay: 4000,
    pedestriansPerDay: 500,
    heavyVehicleRatio: 0.08,
    history: 'modern',
  },
  runtime: {
    barrierClosed: false,
    warningActive: false,
  },
};

export function cloneRailwayConfig(source: RailwayConfig = DEFAULT_RAILWAY): RailwayConfig {
  return structuredClone(source);
}
