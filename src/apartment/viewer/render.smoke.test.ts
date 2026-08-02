import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_APT_CONFIG, APT_PRESETS, type AptConfig, type AptPresetName } from '../gen/config';
import { generateApartment } from '../gen/building';
import { makeSampleAptLot, type LotShape } from '../gen/lot';
import { renderApartment } from './render';

const PRESETS = Object.keys(APT_PRESETS) as AptPresetName[];
const cfgOf = (p: AptPresetName, seed: number): AptConfig => ({
  ...structuredClone(DEFAULT_APT_CONFIG), ...structuredClone(APT_PRESETS[p]), seed,
});
const rp = { seed: 1, windowLighting: 'mixed' as const, windowInteriorMapping: true, showSite: true, wallMain: 'stone' as const, wallBase: 'concrete' as const, accent: 0x8a6d5a, balconyRail: 'glass' as const, stairGuard: 'steel' as const, wallPattern: 'none' as const, stripe: 0x6b4f3a };

function assertFinite(g: THREE.Object3D) {
  g.traverse((o) => {
    const pos = (o as THREE.Mesh).geometry?.getAttribute?.('position');
    if (pos) for (let i = 0; i < pos.count * 3; i++) expect(Number.isFinite((pos.array as ArrayLike<number>)[i])).toBe(true);
  });
}

describe('renderApartment (headless)', () => {
  it('builds a non-empty group for every preset across seeds', () => {
    for (const preset of PRESETS) {
      for (let seed = 0; seed < 6; seed++) {
        const cfg = cfgOf(preset, seed);
        const lot = makeSampleAptLot(cfg.lotWidth, cfg.lotDepth);
        const { plan, roofs, site } = generateApartment(lot, cfg);
        const g = renderApartment(plan, roofs, site, rp);
        expect(g).toBeInstanceOf(THREE.Group);
        expect(g.children.length).toBeGreaterThan(0);
      }
    }
  });

  it('renders every lot shape (clipped zones build cleanly)', () => {
    const shapes: LotShape[] = ['rectangle', 'irregular-quad', 'rounded-corner', 'chamfered'];
    for (const shape of shapes) {
      for (let seed = 0; seed < 4; seed++) {
        const cfg = cfgOf('midrise-gallery-rc', seed);
        const lot = makeSampleAptLot(cfg.lotWidth, cfg.lotDepth, shape, seed);
        const { plan, roofs, site } = generateApartment(lot, cfg);
        const g = renderApartment(plan, roofs, site, rp);
        expect(g.children.length).toBeGreaterThan(0);
      }
    }
  });

  it('every mesh has finite geometry across balcony rail styles (no NaN)', () => {
    const rails = ['glass', 'bars', 'panel', 'concrete'] as const;
    for (const preset of PRESETS) {
      for (const rail of rails) {
        const cfg = cfgOf(preset, 3);
        const lot = makeSampleAptLot(cfg.lotWidth, cfg.lotDepth);
        const { plan, roofs, site } = generateApartment(lot, cfg);
        const g = renderApartment(plan, roofs, site, { ...rp, balconyRail: rail });
        assertFinite(g);
      }
    }
  });

  it('builds finite geometry across balcony forms × wall patterns (§10, no NaN)', () => {
    const forms = ['continuous', 'inset', 'box'] as const;
    const patterns = ['horizontal', 'vertical', 'none'] as const;
    for (const form of forms) {
      for (const pattern of patterns) {
        for (const seed of [2, 5]) {
          const cfg = { ...cfgOf('lowrise-wall-rc', seed), balconyForm: form, windowMix: 'mixed' as const, gableStyle: 'blank' as const };
          const { plan, roofs, site } = generateApartment(makeSampleAptLot(cfg.lotWidth, cfg.lotDepth), cfg);
          assertFinite(renderApartment(plan, roofs, site, { ...rp, wallPattern: pattern }));
        }
      }
    }
  });

  it('exterior stairs build finite geometry across guard styles × placement (no NaN)', () => {
    const guards = ['steel', 'white', 'wall'] as const;
    const placements = ['rear', 'gable'] as const;
    for (const guard of guards) {
      for (const placement of placements) {
        for (const seed of [1, 3, 8]) {
          // wood-apart は低層=外階段。placement/seed を振って外階段ジオメトリを網羅。
          const cfg = { ...cfgOf('wood-apart', seed), stairPlacement: placement };
          const { plan, roofs, site } = generateApartment(makeSampleAptLot(cfg.lotWidth, cfg.lotDepth), cfg);
          expect(plan.exteriorStairs.length).toBeGreaterThan(0);
          assertFinite(renderApartment(plan, roofs, site, { ...rp, stairGuard: guard }));
        }
      }
    }
  });
});
