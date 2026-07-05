import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_STORE_CONFIG, STORE_PRESETS, type StoreConfig, type StorePresetName } from '../gen/config';
import { generateStore } from '../gen/building';
import { makeSampleStoreLot, type LotShape } from '../gen/lot';
import { renderStore } from './render';

const PRESETS: StorePresetName[] = ['big-box', 'convenience', 'family-restaurant', 'drive-through'];
const cfgOf = (p: StorePresetName, seed: number): StoreConfig => ({
  ...structuredClone(DEFAULT_STORE_CONFIG), ...structuredClone(STORE_PRESETS[p]), seed,
});

describe('renderStore (headless)', () => {
  it('builds a non-empty group for every preset across seeds', () => {
    for (const preset of PRESETS) {
      for (let seed = 0; seed < 6; seed++) {
        const cfg = cfgOf(preset, seed);
        const lot = makeSampleStoreLot(cfg.lotWidth, cfg.lotDepth);
        const { plan, roofs, site } = generateStore(lot, cfg);
        const g = renderStore(plan, roofs, site, { brandColor: cfg.brandColor, showSite: true });
        expect(g).toBeInstanceOf(THREE.Group);
        expect(g.children.length).toBeGreaterThan(0);
      }
    }
  });

  it('renders every lot shape (clipped zones build cleanly)', () => {
    const shapes: LotShape[] = ['rectangle', 'irregular-quad', 'rounded-corner', 'chamfered'];
    for (const shape of shapes) {
      for (let seed = 0; seed < 4; seed++) {
        const cfg = cfgOf('big-box', seed);
        const lot = makeSampleStoreLot(cfg.lotWidth, cfg.lotDepth, shape, seed);
        const { plan, roofs, site } = generateStore(lot, cfg);
        const g = renderStore(plan, roofs, site, { brandColor: cfg.brandColor, showSite: true });
        expect(g.children.length).toBeGreaterThan(0);
      }
    }
  });

  it('every textured mesh carries UV coordinates (roofs included, all forms)', () => {
    const forms = ['flat', 'gable', 'hip', 'mono', 'mansard'] as const;
    for (const roofForm of forms) {
      for (const preset of PRESETS) {
        const cfg = cfgOf(preset, 3);
        const lot = makeSampleStoreLot(cfg.lotWidth, cfg.lotDepth);
        const { plan, roofs, site } = generateStore(lot, cfg, { roofForm });
        const g = renderStore(plan, roofs, site, {
          brandColor: cfg.brandColor, showSite: true, windowAwnings: true, entranceGable: true,
        });
        g.traverse((o) => {
          const mesh = o as THREE.Mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
          if (mesh.geometry && mat && mat.map) {
            expect(mesh.geometry.getAttribute('uv'), `${preset}/${roofForm} textured mesh missing uv`).toBeTruthy();
          }
        });
      }
    }
  });

  it('every mesh has finite geometry (no NaN positions)', () => {
    const cfg = cfgOf('big-box', 2);
    const lot = makeSampleStoreLot(cfg.lotWidth, cfg.lotDepth);
    const { plan, roofs, site } = generateStore(lot, cfg);
    const g = renderStore(plan, roofs, site, { brandColor: cfg.brandColor, showSite: true });
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const pos = mesh.geometry?.getAttribute?.('position');
      if (pos) {
        for (let i = 0; i < pos.count * 3; i++) expect(Number.isFinite((pos.array as ArrayLike<number>)[i])).toBe(true);
      }
    });
  });
});
