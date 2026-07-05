// ============================================================================
// Texture cache — loads the CC0 (Poly Haven, public-domain) JPGs from
// /public/textures and returns tiling THREE.Textures. Keyed by name+repeat so
// the same file at a different tile density is a distinct cached instance.
// See public/textures/CREDITS.txt for attribution.
// ============================================================================

import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();
const inBrowser = typeof document !== 'undefined';

/** A repeating texture. `repeat` multiplies UVs: for ground (ShapeGeometry UVs
 *  are world metres) repeat = 1/tileMetres; for panels (UV 0..1) it's the number
 *  of tiles across the board. `srgb` must be FALSE for data maps (normal/rough).
 *  Falls back to a blank texture in headless (test) environments. */
export function tex(name: string, repeat = 1, srgb = true): THREE.Texture {
  const key = `${name}@${repeat}@${srgb}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const t = inBrowser ? loader.load(`textures/${name}.jpg`) : new THREE.Texture();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** A full PBR MeshStandardMaterial from a CC0 surface: diffuse + normal +
 *  roughness (+ optional metalness `_m` and alpha `_o`) maps at a shared tile
 *  density, plus optional tint/metalness/transparency. */
export function pbr(
  name: string,
  repeat: number,
  opts: {
    color?: number; metalness?: number; roughness?: number; side?: THREE.Side; normalScale?: number;
    metalnessMap?: boolean; alphaMap?: boolean; transparent?: boolean; alphaTest?: number;
  } = {}
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: tex(name, repeat, true),
    normalMap: tex(`${name}_n`, repeat, false),
    normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1),
    roughnessMap: tex(`${name}_r`, repeat, false),
    metalnessMap: opts.metalnessMap ? tex(`${name}_m`, repeat, false) : null,
    alphaMap: opts.alphaMap ? tex(`${name}_o`, repeat, false) : null,
    transparent: opts.transparent ?? false,
    alphaTest: opts.alphaTest ?? 0,
    color: opts.color ?? 0xffffff,
    metalness: opts.metalness ?? 0,
    roughness: opts.roughness ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
}
