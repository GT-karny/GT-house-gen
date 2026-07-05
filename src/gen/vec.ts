// ============================================================================
// Re-export shim. The canonical 2D vector math now lives in src/shared/vec.ts so
// both the house and roadside-store generators share one implementation.
// Existing house code imports './vec' — kept working via this re-export. (Note:
// house code imports the Vec2 *type* from './types', which is structurally
// identical to shared/vec's Vec2, so nothing changes for callers.)
// ============================================================================

export * from '../shared/vec';
