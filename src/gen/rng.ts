// ============================================================================
// Re-export shim. The canonical deterministic RNG now lives in src/shared/rng.ts
// so both the house and roadside-store generators share one implementation.
// Existing house code imports './rng' — kept working via this re-export.
// ============================================================================

export * from '../shared/rng';
