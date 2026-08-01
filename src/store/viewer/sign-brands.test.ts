import { describe, expect, it } from 'vitest';
import { PILOT_BRANDS, pilotBrandFor } from './sign-brands';

describe('pilot store brand system', () => {
  it('reserves three stable ids for the reference brands', () => {
    expect(PILOT_BRANDS.map((brand) => brand.id)).toEqual([2, 3, 7]);
    expect(new Set(PILOT_BRANDS.map((brand) => brand.name)).size).toBe(3);
  });

  it('keeps the two former Port brands distinct by name', () => {
    expect(pilotBrandFor(3)?.name).toBe('まちポート');
    expect(pilotBrandFor(7)?.name).toBe('グリルバンズ');
  });

  it('gives every pilot brand a complete physical-sign palette', () => {
    for (const brand of PILOT_BRANDS) {
      for (const colour of [brand.primary, brand.secondary, brand.accent, brand.surface, brand.casing]) {
        expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(brand.name.length).toBeGreaterThan(1);
      expect(brand.category.length).toBeGreaterThan(2);
      expect(brand.latin.length).toBeGreaterThan(3);
    }
  });
});
