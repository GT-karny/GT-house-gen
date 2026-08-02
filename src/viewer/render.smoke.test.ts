import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { renderHouse, type RenderParams, type RoofType, type FenceStyle } from './render';
import { generateHouse } from '../gen/building';
import { DEFAULT_CONFIG, JP_TRACT_PRESET, JP_CUBE_PRESET, type GenConfig } from '../gen/config';
import { makeSampleLot } from '../gen/lot';

const lot = makeSampleLot();

function rp(cfg: GenConfig, roofType: 'flat' | 'gable' | 'hip' | 'mono'): RenderParams {
  return {
    seed: cfg.seed, windowLighting: 'mixed', windowInteriorMapping: true,
    panelW: cfg.panelW, panelH: cfg.panelH, showFootprint: true, showMasses: false,
    doorCanopy: true, eaveOverhang: 0.7, roofType, ridgeAxis: 'U',
    wallMain: 'plaster', wallBase: 'stone', doorStyle: 'panel', doorLeaf: 'wood_a', doorSidelight: true,
    roofColor: 0x3b3d42, fenceColor: 0xcac3b4, fenceStyle: 'wood',
    fenceMeshTex: 'fence', blockVariant: 'concrete', woodTex: 'siding', showSite: true,
  };
}

describe('renderHouse (headless geometry build)', () => {
  it('jp-tract (gable + 下屋 + balcony) builds a non-empty group', () => {
    for (let seed = 0; seed < 8; seed++) {
      const cfg: GenConfig = { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_TRACT_PRESET), seed };
      const { plan, roofs } = generateHouse(lot, cfg, { roofStyle: 'gable', roofPitch: 0.45 });
      const g = renderHouse(plan, roofs, rp(cfg, 'gable'));
      expect(g.children.length).toBeGreaterThan(0);
    }
  });

  it('jp-cube (flat + parapet) builds a non-empty group', () => {
    for (let seed = 0; seed < 8; seed++) {
      const cfg: GenConfig = { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_CUBE_PRESET), seed };
      const { plan, roofs } = generateHouse(lot, cfg, { roofStyle: 'flat', roofPitch: 0 });
      const g = renderHouse(plan, roofs, rp(cfg, 'flat'));
      expect(g.children.length).toBeGreaterThan(0);
    }
  });

  it('every textured mesh carries UVs (no missing/degenerate mapping)', () => {
    const roofs: RoofType[] = ['flat', 'gable', 'hip', 'mono'];
    const fences: FenceStyle[] = ['block', 'wood', 'mesh', 'hedge'];
    for (let seed = 0; seed < 4; seed++) {
      const cfg: GenConfig = { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_TRACT_PRESET), seed };
      const built = generateHouse(lot, cfg, { roofStyle: 'gable', roofPitch: 0.45 });
      const params = { ...rp(cfg, roofs[seed % roofs.length]), fenceStyle: fences[seed % fences.length] };
      const g = renderHouse(built.plan, built.roofs, params, built.site);
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const geom = mesh.geometry;
        if (!geom || !('attributes' in geom)) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        const textured = mats.some((m) => (m as THREE.MeshStandardMaterial).map != null);
        if (textured) expect(geom.attributes.uv, `${o.type} with a texture must have UVs`).toBeDefined();
      });
    }
  });

  it('jp-tract emits at least some balconies across seeds', () => {
    let total = 0;
    for (let seed = 0; seed < 12; seed++) {
      const cfg: GenConfig = { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_TRACT_PRESET), seed };
      total += generateHouse(lot, cfg).plan.balconies.length;
    }
    expect(total).toBeGreaterThan(0);
  });

  it('renders every lot shape (clipped zones + per-edge fences build cleanly, no NaN)', () => {
    const shapes = ['irregular-quad', 'rounded-corner', 'chamfered'] as const;
    for (const shape of shapes) {
      for (let seed = 0; seed < 4; seed++) {
        const cfg: GenConfig = { ...structuredClone(DEFAULT_CONFIG), ...structuredClone(JP_TRACT_PRESET), seed, lotWidth: 16, lotDepth: 18 };
        const shapedLot = makeSampleLot(cfg.lotWidth, cfg.lotDepth, shape, seed);
        const { plan, roofs } = generateHouse(shapedLot, cfg, { roofStyle: 'gable', roofPitch: 0.45 });
        const g = renderHouse(plan, roofs, rp(cfg, 'gable'), generateHouse(shapedLot, cfg).site);
        expect(g.children.length).toBeGreaterThan(0);
        g.traverse((o) => {
          const geom = (o as THREE.Mesh).geometry;
          const pos = geom?.attributes?.position;
          if (pos) for (let i = 0; i < pos.count * 3; i++) expect(Number.isFinite((pos.array as ArrayLike<number>)[i])).toBe(true);
        });
      }
    }
  });
});
