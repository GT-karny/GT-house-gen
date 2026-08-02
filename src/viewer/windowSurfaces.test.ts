import { describe, expect, it } from 'vitest';
import {
  resolveInteriorRoomVariant, resolveWindowAppearance, resolveWindowSurface,
  windowAppearanceMaterial, windowSurfaceMaterial,
} from './windowSurfaces';

describe('window surface assignment', () => {
  it('is deterministic for the same seed and panel key', () => {
    const a = resolveWindowSurface('mixed', 42, 'medium', 3, 1, 7);
    const b = resolveWindowSurface('mixed', 42, 'medium', 3, 1, 7);
    expect(a).toBe(b);
  });

  it('keeps day and night palettes separate', () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(resolveWindowSurface('day', seed, 'large', seed, 0)).not.toMatch(/-night$/);
      expect(resolveWindowSurface('night', seed, 'small', seed, 0)).toMatch(/-night$/);
    }
  });

  it('varies across seeds and positions', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      for (let bay = 0; bay < 8; bay++) {
        seen.add(resolveWindowSurface('mixed', seed, 'medium', 0, 0, bay));
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it('selects deterministic mapped-room variants with lighting kept separate', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const day = resolveInteriorRoomVariant('day', seed, seed, 3, 7);
      const night = resolveInteriorRoomVariant('night', seed, seed, 3, 7);
      expect(day).toMatch(/-off$/);
      expect(night).toMatch(/-on$/);
      seen.add(day); seen.add(night);
      expect(resolveInteriorRoomVariant('mixed', seed, 1, 2, 3))
        .toBe(resolveInteriorRoomVariant('mixed', seed, 1, 2, 3));
    }
    expect(seen.size).toBe(6);
    expect(resolveWindowAppearance(false, 'day', 4, 'large', 0, 0, 0))
      .toBe(`surface/${resolveWindowSurface('day', 4, 'large', 0, 0, 0)}`);
  });

  it('assigns roughly one third of mapped windows to rooms without curtains', () => {
    let empty = 0;
    const total = 1_000;
    for (let i = 0; i < total; i++) {
      if (resolveInteriorRoomVariant('mixed', 19, i, i % 7, i % 3).startsWith('empty-room')) empty++;
    }
    expect(empty / total).toBeGreaterThan(0.27);
    expect(empty / total).toBeLessThan(0.40);
  });

  it('keeps mapped variants opaque, separately cacheable, and lighting-aware', () => {
    const mapped = windowAppearanceMaterial('interior/curtain-offwhite-on');
    const unlit = windowAppearanceMaterial('interior/curtain-offwhite-off');
    const flat = windowSurfaceMaterial('curtain-warm-night');
    expect(mapped).not.toBe(flat);
    expect(mapped).not.toBe(unlit);
    expect(mapped.transparent).toBe(false);
    expect(mapped.emissiveIntensity).toBeGreaterThan(0);
    expect(unlit.emissiveIntensity).toBe(0);
    expect(mapped.customProgramCacheKey()).toContain('curtain-offwhite-on');
    expect(flat.customProgramCacheKey()).toContain('flat');
  });

  it('injects ray-box atlas sampling while retaining the Fresnel pass', () => {
    const material = windowAppearanceMaterial('interior/curtain-offwhite-on');
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <uv_vertex>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <map_pars_fragment>\n#include <map_fragment>\n#include <emissivemap_fragment>\n#include <opaque_fragment>',
    };
    material.onBeforeCompile(shader as never, {} as never);
    expect(shader.vertexShader).toContain('vWindowRayDir');
    expect(shader.fragmentShader).toContain('sampleWindowInterior');
    expect(shader.fragmentShader).toContain('roomDepth = 0.07');
    expect(shader.fragmentShader).toContain('windowFresnel');
  });

  it('keeps empty rooms deeper than curtain variants', () => {
    const material = windowAppearanceMaterial('interior/empty-room-off');
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <uv_vertex>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <map_pars_fragment>\n#include <map_fragment>\n#include <emissivemap_fragment>\n#include <opaque_fragment>',
    };
    material.onBeforeCompile(shader as never, {} as never);
    expect(shader.fragmentShader).toContain('roomDepth = 1.10');
  });
});
