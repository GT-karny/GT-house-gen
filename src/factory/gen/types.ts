// Pure generator data. Ground plane XY, +Z up; no Three.js dependency.
export interface Vec2 { x: number; y: number }
export type FactoryArchetype = 'town-factory' | 'service-garage' | 'rental-garage';
export type FactoryRoof = 'gable' | 'mono' | 'sawtooth' | 'flat';
export type FactoryDepthPlacement = 'front' | 'center' | 'rear';
export type FactorySidePlacement = 'left' | 'center' | 'right';
export type FactoryLotShape = 'rectangle' | 'chamfered' | 'trapezoid' | 'irregular';
export type FactoryModule = 'shutter' | 'personnel-door' | 'window' | 'wall';
export type FactoryPropKind = 'car' | 'lift' | 'tire-rack' | 'oil-drum' | 'pallet' | 'vending' | 'ac' | 'bollard' | 'sign';

export interface FactoryConfig {
  seed: number;
  archetype: FactoryArchetype;
  lotWidth: number;
  lotDepth: number;
  lotShape: FactoryLotShape;
  buildingWidth: number;
  buildingDepth: number;
  clearHeight: number;
  floors: 1 | 2;
  unitWidth: number;
  unitCount: number;
  frontYardDepth: number;
  sideSetback: number;
  randomizeLayout: boolean;
  depthPlacement: FactoryDepthPlacement;
  sidePlacement: FactorySidePlacement;
  detachedOffice: boolean;
  officeWidth: number;
  officeDepth: number;
  parkingCount: number;
  roof: FactoryRoof;
  roofPitch: number;
  shutterOpenRate: number;
  officeRatio: number;
  equipmentDensity: number;
  weathering: number;
  fence: boolean;
}

export interface FactoryBay {
  index: number;
  centerX: number;
  width: number;
  module: FactoryModule;
  shutterOpen: number;
}

export interface FactoryProp {
  kind: FactoryPropKind;
  x: number; y: number; z: number;
  yawDeg: number;
  scale: number;
}

export interface FactoryAnnex {
  kind: 'office';
  x: number; y: number; width: number; depth: number; height: number;
}

export interface FactoryParkingStall {
  x: number; y: number; width: number; depth: number; yawDeg: number; occupied: boolean;
}

export interface FactoryPlan {
  archetype: FactoryArchetype;
  roof: FactoryRoof;
  roofPitch: number;
  lot: { width: number; depth: number; shape: FactoryLotShape; ring: Vec2[]; area: number };
  building: { x: number; y: number; width: number; depth: number; height: number; floors: number };
  yardDepth: number;
  bays: FactoryBay[];
  annexes: FactoryAnnex[];
  parking: FactoryParkingStall[];
  props: FactoryProp[];
  fence: boolean;
  weathering: number;
}
