import type { FactoryArchetype, FactoryConfig } from './types';

export const DEFAULT_FACTORY_CONFIG: FactoryConfig = {
  seed: 27, archetype: 'town-factory', lotWidth: 22, lotDepth: 28, lotShape: 'rectangle',
  buildingWidth: 17, buildingDepth: 14, clearHeight: 4.8, floors: 1,
  unitWidth: 3.6, unitCount: 4, frontYardDepth: 8, sideSetback: 1.2,
  randomizeLayout: true, depthPlacement: 'rear', sidePlacement: 'left', detachedOffice: true,
  officeWidth: 4.2, officeDepth: 5.2, parkingCount: 2,
  roof: 'gable', roofPitch: 0.24, shutterOpenRate: 0.18, officeRatio: 0.22,
  equipmentDensity: 0.6, weathering: 0.55, fence: true,
};

export const FACTORY_PRESETS: Record<FactoryArchetype, Partial<FactoryConfig>> = {
  'town-factory': { lotWidth: 22, lotDepth: 28, buildingWidth: 15, buildingDepth: 14, clearHeight: 4.8, unitWidth: 3.6, unitCount: 4, frontYardDepth: 8, depthPlacement: 'rear', sidePlacement: 'left', detachedOffice: true, officeWidth: 4.2, officeDepth: 5.2, parkingCount: 2, roof: 'gable', shutterOpenRate: 0.32, officeRatio: 0.15, equipmentDensity: 0.65, weathering: 0.6, fence: true },
  'service-garage': { lotWidth: 34, lotDepth: 38, buildingWidth: 24, buildingDepth: 18, clearHeight: 6.0, unitWidth: 5.2, unitCount: 4, frontYardDepth: 13, depthPlacement: 'rear', sidePlacement: 'left', detachedOffice: true, officeWidth: 5.5, officeDepth: 7, parkingCount: 5, roof: 'mono', roofPitch: 0.09, shutterOpenRate: 0.55, officeRatio: 0.12, equipmentDensity: 0.9, weathering: 0.3, fence: true },
  'rental-garage': { lotWidth: 30, lotDepth: 24, buildingWidth: 26, buildingDepth: 7, clearHeight: 3.1, unitWidth: 3.2, unitCount: 8, frontYardDepth: 10, depthPlacement: 'rear', sidePlacement: 'center', detachedOffice: false, parkingCount: 8, roof: 'flat', shutterOpenRate: 0.12, officeRatio: 0, equipmentDensity: 0.18, weathering: 0.18, fence: false },
};
