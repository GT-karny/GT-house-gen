# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

Procedural generator for Japanese detached houses, as a Three.js browser prototype. Given a lot, it plans the whole site (parking, approach, garden, fences) and the building (footprint mass → facade panels → roof), then renders it photorealistically with CC0 PBR textures + HDRI-based IBL.

**Design intent that drives the architecture:** all generation logic in `src/gen/` is pure TypeScript with **no Three.js dependency**, because it is meant to be ported wholesale to Unreal Engine (the `PCGOpenDRIVE` plugin). Keep `src/gen/` Three-free. Naming deliberately mirrors the UE side (`FBuildingPlan`, `BlockData`, `FOBB2D`, `PCGPlanSite`).

The stated future direction is to drop modular-panel/board assets in favor of fully procedural geometry (openings, trim, etc.) — see the README's "方針・今後の課題".

## Commands

Package manager is **pnpm**. Only `esbuild` is allowed to run its build script (`pnpm.onlyBuiltDependencies`); if a fresh install fails on esbuild, run `pnpm rebuild esbuild`.

```bash
pnpm dev          # Vite dev server → http://localhost:5173
pnpm build        # tsc typecheck + vite build → dist/
pnpm test         # vitest run (one-shot)
pnpm test:watch   # vitest watch
pnpm typecheck    # tsc --noEmit

pnpm vitest run src/gen/site.test.ts      # single test file
pnpm vitest run -t "no gaps"              # single test by name (substring)
```

CC0 assets live in `public/textures/` and `public/hdri/` (served by Vite at `/`).

## Architecture

Two layers plus GUI wiring, strictly separated:

- `src/gen/` — **pure generation logic, UE-port target, no Three.js.**
- `src/viewer/` — Three.js rendering (not ported).
- `src/main.ts` — lil-gui wiring; resolves `'auto'` controls (roof/wall/fence/color) deterministically from the seed.

### Generation pipeline — `src/gen/building.ts` `generateHouse(lot, cfg, opts)`

```
Lot ─► planSite ─► SitePlan{pad,zones,props,fences} ─► generateFootprint(lot,cfg,pad)
                                                          ─► tiers/masses ─► generateFacade ─► panels
                                                                          └─► buildRoofs
```

- **`site.ts` `planSite`** — tiles the lot with **no gaps** (rear / sides / front forecourt / building base). Lays out driveway + L-shaped approach first (real-world 外構 order), building at the back, garden fills the rest. Outputs a `HousePad` (the buildable rectangle + bay-count clamps) that the footprint generator must fit inside.
- **`footprint.ts` `generateFootprint`** — composes rectangular masses (core + wings → rect/L/T/U/garage archetypes) on an **integer bay grid**, so every wall length is an exact multiple of `panelW`. Per-mass storey counts (下屋 wings = 1 floor) produce **stepped tiers**. Clamps to and rear-anchors within the `HousePad`.
- **`facade.ts` `generateFacade`** — dices each wall into `floors × bays` and assigns modules (wall/window/door) via a **split grammar**. Wall role (street/garden/side) controls window density/size. Uses positional hash RNG so cells align vertically across floors.
- **`roof.ts` `buildRoofs`** — flat / gable / hip / mono; eave height varies per mass, so roofs step.

### Rendering — `src/viewer/`

- `scene.ts` — camera / lights / OrbitControls; CC0 HDRI as IBL env map; ACES tone mapping.
- `render.ts` — panels batched per type into `InstancedMesh`; roofs thickened. `RenderParams` (roof form/color, wall style, fence style/color) is resolved from the seed in `main.ts`.
- `materials.ts` / `textures.ts` — assemble CC0 diffuse+normal+rough(+metal/alpha) via `pbr()`.
- `modules.ts` — detailed window/door geometry. Walls use real-scale planar-box UVs (`planarBoxUV`, `WALL_TILE`); board thickness `WALL_THICKNESS`.
- `site.ts` — ground zones, fences (block/wood/mesh/hedge), props (shed/AC/bike/car/carport/plantings).

## Conventions that matter

- **Coordinate system:** generation side is XY ground plane, +Z up (UE convention). To Three: `toThree(x,y,z) = (x, z, -y)`. Lot-local axes: `u` = street-parallel, `v` = depth from road (`v=0` is the street frontage).
- **Determinism:** same `seed` → same output. All randomness goes through `rng.ts` (`rand01(...ints)` positional hash, or the `Rng` stream for sequential draws in footprint composition). `main.ts` `'auto'` resolutions are also seed-derived. Do not introduce `Math.random()`.
- **Single source of truth for tunables:** every generation parameter lives in `src/gen/config.ts` (`GenConfig`, `DEFAULT_CONFIG`, and the `JP_TRACT_PRESET` / `JP_CUBE_PRESET` style presets). The GUI and the future UE port both read from here.
- **Panel model:** all facade modules share one `panelW × panelH` board footprint; only `type` differs. In UE these become Instanced Static Mesh transforms (`PanelInstance`).

## Tests

- `src/gen/*.test.ts` — pure-logic invariants (gap-free lot coverage, minimum dimensions, parking/planting placement constraints, determinism).
- `src/viewer/*.smoke.test.ts` — headless geometry construction; textures fall back to empty `Texture` so no asset loading is needed.
