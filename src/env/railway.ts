// Compatibility entry point. The implementation lives in env/crossing so the
// pure planner can grow independently from the Three.js railway renderer.
export { DEFAULT_RAILWAY, cloneRailwayConfig } from './crossing/config';
export { planRailway } from './crossing/plan';
export { resolveCrossingScenario } from './crossing/scenario';
export type {
  CrossingAssessment, CrossingDevice, CrossingGenerationInput, CrossingIssue,
  CrossingIssueCode, CrossingOverrides, CrossingScenario, DeckType, FenceSpan, GateLayout,
  ProtectionClass, RailStrip, RailwayBounds, RailwayConfig, RailwayPlan,
  ResolvedCrossingScenario, RoadCrossSectionConfig, SleeperInstance, TrackPlan,
  TracksideCabinet, TracksidePost, WarningLayout,
} from './crossing/types';
