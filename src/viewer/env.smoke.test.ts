import { describe, it, expect } from 'vitest';
import { planStreetscape, DEFAULT_STREET } from '../env/streetscape';
import { streetscapeGroup } from './env';

const BOUNDS = { xMin: -18, xMax: 18, frontY: -8 };

describe('streetscape plan', () => {
  it('is deterministic for the same seed', () => {
    const a = planStreetscape(BOUNDS, DEFAULT_STREET);
    const b = planStreetscape(BOUNDS, DEFAULT_STREET);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('lays road + walk bands entirely on the road side (Y < frontY)', () => {
    const s = planStreetscape(BOUNDS, DEFAULT_STREET);
    expect(s.zones.some((z) => z.kind === 'road')).toBe(true);
    for (const z of s.zones) for (const p of z.ring) expect(p.y).toBeLessThanOrEqual(BOUNDS.frontY + 1e-9);
  });

  it('drops all poles with 0 spacing', () => {
    const s = planStreetscape(BOUNDS, { ...DEFAULT_STREET, poleSpacing: 0 });
    expect(s.props.length).toBe(0);
  });

  it('builds a non-empty Three group headlessly', () => {
    const g = streetscapeGroup(planStreetscape(BOUNDS, DEFAULT_STREET));
    expect(g.children.length).toBeGreaterThan(0);
  });
});
