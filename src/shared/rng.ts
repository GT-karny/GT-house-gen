// ============================================================================
// Shared deterministic hash-based RNG — used by BOTH the house generator
// (src/gen) and the roadside-store generator (src/store). Same inputs → same
// output, so generation is stable across regenerations and grammars can be
// seeded per-cell without threading state. A deterministic positional hash,
// engine-agnostic. This is the canonical implementation; src/gen/rng.ts
// re-exports from here so existing house code and tests are unchanged.
// ============================================================================

/** 32-bit integer hash (mulberry-ish mix). Order-sensitive over the args. */
export function hashInts(...ints: number[]): number {
  let h = 2166136261 >>> 0; // FNV offset basis
  for (const n of ints) {
    h ^= n | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 15;
  }
  // final avalanche
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Deterministic float in [0,1) from an integer key set. */
export function rand01(...ints: number[]): number {
  return hashInts(...ints) / 4294967296;
}

/** A small stateful stream for sequential draws (footprint composition). */
export class Rng {
  private state: number;
  constructor(seed: number) {
    // Avalanche the seed first — sequential seeds (0,1,2,…) share too many bits
    // for a raw xorshift to decorrelate in a couple of draws, which biased early
    // draws (e.g. a left/right coin always landing the same way).
    this.state = hashInts(seed, 0x9e3779b9) | 0 || 1;
    this.next();
    this.next();
  }
  next(): number {
    // xorshift32
    let x = this.state | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    return (x >>> 0) / 4294967296;
  }
  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  /** Float in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }
  pick<T>(items: T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}

/** Weighted pick from a {key: weight} record. */
export function weightedPick<K extends string>(
  weights: Record<K, number>,
  r: number
): K {
  const keys = Object.keys(weights) as K[];
  let total = 0;
  for (const k of keys) total += Math.max(0, weights[k]);
  let acc = r * total;
  for (const k of keys) {
    acc -= Math.max(0, weights[k]);
    if (acc < 0) return k;
  }
  return keys[keys.length - 1];
}
