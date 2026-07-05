// ============================================================================
// Streetscape / 道路まわりの公共空間 — the PUBLIC realm in front of the row of
// houses: the carriageway (車道), the roadside gutter/sidewalk strips (側溝・歩
// 道), painted lane markings (外側線・センターライン), and utility poles (電柱).
//
// ⚠ DELIBERATELY SEPARATE from the house generator (src/gen) and its data model.
// This is PROTOTYPE SCENERY ONLY. In a real pipeline the road network comes from
// a separate road system, NOT from here — so NOTHING in `src/env` should travel
// with the house generator. Living in its own namespace (own types, own config,
// no import from src/gen) is exactly what keeps it from getting mixed into the
// house core.
//
// Pure TypeScript, no Three.js. World plane is XY, up is +Z (Z-up world convention), the
// same frame as src/gen. The street runs along +X in front of the row; the road
// side is −Y (matches makeSampleLot roadDir = (0,−1), i.e. frontage faces −Y).
// ============================================================================

/** Local 2D point — kept independent of src/gen/types on purpose (see header). */
export interface Vec2 {
  x: number;
  y: number;
}

/** A flat ground patch of the public realm. road=車道(asphalt), walk=歩道/路肩(concrete). */
export type EnvZoneKind = 'road' | 'walk';
export interface EnvZone {
  ring: Vec2[]; // world-XY rectangle (CCW-ish; rendered double-sided so winding is free)
  kind: EnvZoneKind;
}

/** A painted road line (外側線 / センターライン). `dash` undefined ⇒ solid. */
export interface EnvMarking {
  a: Vec2;
  b: Vec2;
  width: number; // m
  color: 'white' | 'yellow';
  dash?: { on: number; off: number }; // metres painted / skipped
}

/** A roadside gutter channel (側溝 / L字溝) — a recessed concrete band. */
export interface EnvGutter {
  a: Vec2;
  b: Vec2;
  width: number; // m across the channel
}

/** A placed street object. Only utility poles (電柱) for now. */
export type EnvPropKind = 'pole';
export interface EnvProp {
  kind: EnvPropKind;
  center: Vec2; // world XY
  h: number; // height (m)
}

/** The whole public realm around one row of houses. Pure data, renderer-agnostic. */
export interface Streetscape {
  zones: EnvZone[];
  markings: EnvMarking[];
  gutters: EnvGutter[];
  props: EnvProp[];
}

/** Tunables for the streetscape. Mirrors the src/gen "single source of truth"
 *  convention so a GUI (and any other consumer) reads from one place. */
export interface StreetscapeConfig {
  seed: number;
  roadWidth: number; // carriageway width (m) — JP 生活道路 ≈ 4–6 m
  walkWidth: number; // near-side gutter/歩道 strip against the lots (m)
  farWidth: number; // strip on the far side of the road (implies houses opposite, off-scene)
  runoff: number; // how far the street runs PAST the row ends (m), so it reads as a through road
  centerLine: boolean; // draw a dashed centre line
  poleSpacing: number; // m between utility poles (0 ⇒ none)
}

export const DEFAULT_STREET: StreetscapeConfig = {
  seed: 0,
  roadWidth: 5.0,
  walkWidth: 1.6,
  farWidth: 1.2,
  runoff: 30,
  centerLine: true,
  poleSpacing: 14,
};

/** Extent of the house row the street must front. Supplied by the viewer/main. */
export interface StreetBounds {
  xMin: number; // leftmost lot edge along the street (X)
  xMax: number; // rightmost lot edge along the street (X)
  frontY: number; // front boundary line of the row (gen Y; negative = road side)
}

/** Deterministic [0,1) hash — same positional-hash spirit as src/gen/rng.ts, so
 *  pole jitter is stable per seed and never uses Math.random(). */
function hash01(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h >>> 0) % 100000) / 100000;
}

/** Plan the public realm in front of a row of houses. Pure — same bounds+cfg
 *  ⇒ same streetscape. All rectangles are axis-aligned bands along +X. */
export function planStreetscape(b: StreetBounds, cfg: StreetscapeConfig = DEFAULT_STREET): Streetscape {
  const x0 = b.xMin - cfg.runoff;
  const x1 = b.xMax + cfg.runoff;

  // Depth stack, walking outward from the lots (−Y). `edge` is the property line.
  const edge = b.frontY;
  const yWalkIn = edge; // lot side of the near strip
  const yWalkOut = edge - cfg.walkWidth; // road side of the near strip = road edge
  const yRoadFar = yWalkOut - cfg.roadWidth; // far edge of the carriageway
  const yFarOut = yRoadFar - cfg.farWidth; // outer edge of the far strip

  const band = (yA: number, yB: number): Vec2[] => [
    { x: x0, y: yB },
    { x: x1, y: yB },
    { x: x1, y: yA },
    { x: x0, y: yA },
  ];

  const zones: EnvZone[] = [
    { ring: band(yWalkIn, yWalkOut), kind: 'walk' }, // near 歩道/路肩 against the lots
    { ring: band(yWalkOut, yRoadFar), kind: 'road' }, // 車道
    { ring: band(yRoadFar, yFarOut), kind: 'walk' }, // far strip (houses opposite, off-scene)
  ];

  // 外側線 (edge lines), inset a touch from each road edge, + optional centre line.
  const inset = 0.18;
  const markings: EnvMarking[] = [
    { a: { x: x0, y: yWalkOut - inset }, b: { x: x1, y: yWalkOut - inset }, width: 0.12, color: 'white' },
    { a: { x: x0, y: yRoadFar + inset }, b: { x: x1, y: yRoadFar + inset }, width: 0.12, color: 'white' },
  ];
  if (cfg.centerLine) {
    const yc = (yWalkOut + yRoadFar) / 2;
    markings.push({ a: { x: x0, y: yc }, b: { x: x1, y: yc }, width: 0.1, color: 'white', dash: { on: 3, off: 4 } });
  }

  // 側溝: a channel along the road edge on the near (property) side.
  const gutters: EnvGutter[] = [
    { a: { x: x0, y: yWalkOut + 0.15 }, b: { x: x1, y: yWalkOut + 0.15 }, width: 0.3 },
  ];

  // 電柱: line the near strip near the property line, spaced with a little jitter.
  const props: EnvProp[] = [];
  if (cfg.poleSpacing > 0) {
    const from = b.xMin - 6;
    const to = b.xMax + 6;
    const poleY = edge - Math.min(0.4, cfg.walkWidth * 0.3); // stand on the walk, near the lots
    let i = 0;
    for (let x = from; x <= to; x += cfg.poleSpacing, i++) {
      const jx = (hash01(cfg.seed ^ 0x9051, i) - 0.5) * 1.2;
      const h = 7.8 + hash01(cfg.seed ^ 0x70e5, i) * 1.2;
      props.push({ kind: 'pole', center: { x: x + jx, y: poleY }, h });
    }
  }

  return { zones, markings, gutters, props };
}
