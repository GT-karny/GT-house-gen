// ============================================================================
// Store viewer materials (M2, photoreal). Ground/wall/roof/metal/foliage surfaces
// are CC0 PBR (diffuse+normal+rough(+metal)) via the house `pbr()` pipeline —
// most maps are shared with house-gen (asphalt/concrete/grass/plaster/metal/
// foliage/bark); the roadside-commercial cladding (角波金属パネル) is the new
// `ribbed` set. Glass/paint/emissive stay as tuned MeshStandardMaterials so they
// catch the HDRI environment. All cached so regeneration doesn't leak GPU
// resources. (Viewer layer only — NOT part of the portable core.)
// ============================================================================

import * as THREE from 'three';
import { pbr } from '../../viewer/textures';
import { wallMaterial as houseWallMaterial, type WallVariant } from '../../viewer/materials';
import type { StoreZoneKind, StorefrontModule } from '../gen/types';

const cache = new Map<string, THREE.Material>();
function memo<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const m = make();
  cache.set(key, m);
  return m;
}
function std(key: string, opts: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return memo(key, () => new THREE.MeshStandardMaterial(opts));
}

// --- ground zones -----------------------------------------------------------
// Each zone → [CC0 texture, tile metres, tint]. Store ground ShapeGeometry UVs
// are in world metres (like house-gen), so pbr repeat = 1/tileMetres.
const ZONE_TEX: Record<StoreZoneKind, { tex: string; tile: number; color: number; rough: number }> = {
  parking: { tex: 'asphalt', tile: 4.0, color: 0x8a8d93, rough: 1 },
  aisle: { tex: 'asphalt', tile: 4.0, color: 0x7c7f85, rough: 1 },
  drive: { tex: 'asphalt', tile: 4.0, color: 0x828589, rough: 1 },
  drivethrough: { tex: 'asphalt', tile: 4.0, color: 0x76797f, rough: 1 },
  approach: { tex: 'concrete', tile: 2.5, color: 0xcfcabf, rough: 0.95 },
  plaza: { tex: 'concrete', tile: 2.5, color: 0xc7c1b4, rough: 0.9 },
  landscape: { tex: 'grass', tile: 3.0, color: 0x93b06f, rough: 1 },
  serviceyard: { tex: 'concrete', tile: 3.0, color: 0x9a9890, rough: 1 },
  'outdoor-display': { tex: 'asphalt', tile: 4.0, color: 0x9a9da3, rough: 1 },
  leftover: { tex: 'asphalt', tile: 4.0, color: 0x82858b, rough: 1 },
  pad: { tex: 'concrete', tile: 3.0, color: 0xb2ada2, rough: 1 },
};
export const zoneMaterial = (k: StoreZoneKind) => {
  const z = ZONE_TEX[k];
  return memo(`zone:${k}`, () => pbr(z.tex, 1 / z.tile, { color: z.color, roughness: z.rough, side: THREE.DoubleSide }));
};

// --- building walls ---------------------------------------------------------
// Store cladding uses the SAME variant palette + materials as the house wall
// (plaster/plaster2, siding×3, stone×2, brick×2, concrete, dark) so both share
// one CC0 wall look and scale (WALL_TILE = 1 m, UVs baked in render.ts), plus two
// store-only options: `ribbed` (角波金属パネル, warehouse/HC/service) and
// `redbrick` (赤レンガ — the shared brick PBR at a saturated red tint).
export type StoreWallVariant = WallVariant | 'ribbed' | 'redbrick';
export function storeWallMaterial(v: StoreWallVariant): THREE.Material {
  return memo(`wall:${v}`, () => {
    if (v === 'ribbed') return pbr('ribbed', 1, { color: 0xd7d9db, roughness: 0.6, metalness: 1, metalnessMap: true, normalScale: 1.1 });
    if (v === 'redbrick') return pbr('brick', 1, { color: 0xa8402f, roughness: 1, normalScale: 1.1 }); // 赤レンガ
    return houseWallMaterial(v);
  });
}

// --- storefront modules -----------------------------------------------------
// glazing/entrance = reflective dark glass (opaque; reads better than alpha and
// avoids sort artefacts). signband = emissive brand fascia. shutter = ribbed
// metal (UV-baked in render.ts). wall handled by storeWallMaterial().
export function moduleMaterial(k: StorefrontModule, brand?: number): THREE.Material {
  switch (k) {
    case 'glazing':
      return std('glazing', {
        color: 0x1b2833, roughness: 0.05, metalness: 0.92, envMapIntensity: 1.4, emissive: 0x070c11, emissiveIntensity: 1,
      });
    case 'entrance':
      return std('entrance', {
        color: 0x24333d, roughness: 0.08, metalness: 0.85, envMapIntensity: 1.3, emissive: 0x0a1116, emissiveIntensity: 1,
      });
    case 'signband':
      return memo(`signband:${brand ?? 'd0332e'}`, () => new THREE.MeshStandardMaterial({
        color: brand ?? 0xd0332e, roughness: 0.42, metalness: 0.1,
        emissive: brand ?? 0xd0332e, emissiveIntensity: 0.55,
      }));
    case 'shutter':
      return memo('shutter', () => pbr('ribbed', 1, { color: 0x9a9ea3, roughness: 0.55, metalness: 1, metalnessMap: true, normalScale: 1.2 }));
    case 'wall':
    default:
      return storeWallMaterial('plaster');
  }
}

// --- roof / trim ------------------------------------------------------------
// flat = 陸屋根メンブレン (dark smooth), pitched = clay-tile PBR reused from house.
// pitched = clay-tile PBR (planar world-metre UVs baked in render.ts → repeat 1);
// flat/hidden = plain dark membrane (solid, no map — used for the mansard plateau).
export function roofMaterial(pitched = false): THREE.Material {
  return pitched
    ? memo('roof:pitched', () => pbr('roof', 1, { color: 0x8a7d6e, roughness: 0.85, side: THREE.DoubleSide, normalScale: 1.2 }))
    : std('roof:flat', { color: 0x3b3e43, roughness: 0.95 });
}
/** 陸屋根の防水デッキ — matte grey concrete/membrane, planar-UV'd at real scale. */
export const flatRoofDeckMaterial = () => memo('roof:deck', () => pbr('concrete', 1, { color: 0x70726f, roughness: 0.96, normalScale: 0.7 }));
export const parapetMaterial = () => std('parapet', { color: 0xc9c7c0, roughness: 0.85 });
/** 腰折れ屋根の化粧帯 — a deep-toned shingle fascia (clay-tile PBR at a dark tint),
 *  the family-restaurant crown. Planar world-metre UVs baked in render.ts (repeat
 *  1). DoubleSide so the inward slope reads from below. */
export const mansardMaterial = () => memo('mansard', () => pbr('roof', 1, { color: 0x4d3f34, roughness: 0.8, side: THREE.DoubleSide, normalScale: 1.3 }));
/** ストライプの日除けテント fabric — matte cloth; brand and off-white slats alternate. */
export const awningMaterial = (c: number) => std(`awning:${c}`, { color: c, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });

// --- metals / poles / frames ------------------------------------------------
export const metalMaterial = () => memo('metal', () => pbr('metal', 1, { metalness: 1, roughness: 0.85, metalnessMap: true, normalScale: 0.6 }));
export const poleMaterial = () => std('pole', { color: 0x34383e, roughness: 0.45, metalness: 0.85, envMapIntensity: 1 });
/** Dark anodised-aluminium mullion / storefront frame. */
export const mullionMaterial = () => std('mullion', { color: 0x2b2e33, roughness: 0.35, metalness: 0.9, envMapIntensity: 1.1 });
/** A lit fixture head (parking pole / storefront flood) — emissive so it reads. */
export const lampMaterial = () => std('lamp', { color: 0xf6efd6, roughness: 0.3, emissive: 0xffe9b0, emissiveIntensity: 1.4 });

// --- site props -------------------------------------------------------------
export const carPaintMaterial = (c: number) => std(`car:${c}`, { color: c, roughness: 0.3, metalness: 0.6, envMapIntensity: 1.2 });
export const carGlassMaterial = () => std('carglass', { color: 0x12181d, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.3 });
export const glassMaterial = () => moduleMaterial('glazing');
export const tireMaterial = () => std('tire', { color: 0x181a1c, roughness: 0.85, metalness: 0 });
export const signBoxMaterial = (c: number) => std(`signbox:${c}`, { color: c, roughness: 0.4, metalness: 0.1, emissive: c, emissiveIntensity: 0.35 });

// --- sample signage logos (procedural; VIEWER-ONLY) -------------------------
// The pure layer stamps every sign with a `logoId` (see gen/signage resolveLogoId);
// here it selects one brand-logo VARIANT via `id % LOGO_VARIANTS.length`. This is
// the throwaway Three renderer of that contract — a different renderer would map
// the same logoId to its own logo asset instead.
//
//   • ADD A VARIATION  → append one entry to LOGO_VARIANTS.
//   • SWAP IN A REAL LOGO → setLogoImage(id, dataUri) overrides a slot with an
//     imported PNG/SVG data-URI (drawn on load; no external fetch, CSP-safe).
//
// Headless (no `document`) → null, and callers fall back to a plain colour panel.
type Ctx2D = CanvasRenderingContext2D;
interface LogoVariant {
  word: string;
  /** the emblem, centred at (cx,cy) radius r; used on the wide fascia strip */
  emblem: (ctx: Ctx2D, cx: number, cy: number, r: number, hex: string) => void;
  /** the full 512² square logo (badge/roundel/…); `letter` is the brand initial */
  square: (ctx: Ctx2D, hex: string, letter: string, word: string) => void;
}

function rrect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const centred = (ctx: Ctx2D) => { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; };

const LOGO_VARIANTS: LogoVariant[] = [
  { // 0 — white badge on a brand field
    word: 'STORE',
    emblem: (c, cx, cy, r, hex) => { c.fillStyle = hex; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); },
    square: (c, hex, letter, word) => {
      c.fillStyle = hex; c.fillRect(0, 0, 512, 512);
      c.fillStyle = '#fff'; rrect(c, 96, 84, 320, 244, 40); c.fill();
      centred(c); c.fillStyle = hex; c.font = 'bold 210px sans-serif'; c.fillText(letter, 256, 214);
      c.fillStyle = '#fff'; c.font = 'bold 82px sans-serif'; c.fillText(word, 256, 410);
    },
  },
  { // 1 — brand ring roundel on white
    word: 'MART',
    emblem: (c, cx, cy, r, hex) => { c.strokeStyle = hex; c.lineWidth = r * 0.28; c.beginPath(); c.arc(cx, cy, r * 0.8, 0, Math.PI * 2); c.stroke(); },
    square: (c, hex, letter, word) => {
      c.fillStyle = '#fff'; c.fillRect(0, 0, 512, 512);
      c.strokeStyle = hex; c.lineWidth = 34; c.beginPath(); c.arc(256, 214, 150, 0, Math.PI * 2); c.stroke();
      centred(c); c.fillStyle = hex; c.font = 'bold 190px sans-serif'; c.fillText(letter, 256, 220);
      c.font = 'bold 84px sans-serif'; c.fillText(word, 256, 430);
    },
  },
  { // 2 — two-tone bar (brand top / white bottom)
    word: 'SHOP',
    emblem: (c, cx, cy, r, hex) => { c.fillStyle = hex; rrect(c, cx - r, cy - r, r * 2, r * 2, r * 0.4); c.fill(); },
    square: (c, hex, letter, word) => {
      c.fillStyle = hex; c.fillRect(0, 0, 512, 512);
      c.fillStyle = '#fff'; c.fillRect(0, 300, 512, 212);
      centred(c); c.fillStyle = '#fff'; c.font = 'bold 220px sans-serif'; c.fillText(letter, 256, 165);
      c.fillStyle = hex; c.font = 'bold 100px sans-serif'; c.fillText(word, 256, 406);
    },
  },
  { // 3 — big monogram + underline on a brand field
    word: 'PLAZA',
    emblem: (c, cx, cy, r, hex) => { c.fillStyle = hex; c.beginPath(); c.moveTo(cx - r, cy + r); c.lineTo(cx, cy - r); c.lineTo(cx + r, cy + r); c.closePath(); c.fill(); },
    square: (c, hex, letter, word) => {
      c.fillStyle = hex; c.fillRect(0, 0, 512, 512);
      centred(c); c.fillStyle = '#fff'; c.font = 'bold 300px sans-serif'; c.fillText(letter, 256, 200);
      c.fillRect(150, 350, 212, 20);
      c.font = 'bold 78px sans-serif'; c.fillText(word, 256, 430);
    },
  },
];
export const LOGO_VARIANT_COUNT = LOGO_VARIANTS.length;

const _logoImg = new Map<number, string>(); // variant index → real-logo data-URI override
/** Override a logo slot with an imported image (PNG/SVG data-URI). Call before
 *  first render (or re-render after). Clears the texture cache so it re-bakes. */
export function setLogoImage(variantIndex: number, dataUri: string): void {
  const i = ((variantIndex % LOGO_VARIANT_COUNT) + LOGO_VARIANT_COUNT) % LOGO_VARIANT_COUNT;
  _logoImg.set(i, dataUri); _logoTex.clear();
}

const _logoTex = new Map<string, THREE.Texture | null>();
function logoTexture(brand: number, logoId: number, wide: boolean): THREE.Texture | null {
  const key = `${brand}:${logoId}:${wide}`;
  if (_logoTex.has(key)) return _logoTex.get(key)!;
  if (typeof document === 'undefined') { _logoTex.set(key, null); return null; }
  const i = ((logoId % LOGO_VARIANT_COUNT) + LOGO_VARIANT_COUNT) % LOGO_VARIANT_COUNT;
  const v = LOGO_VARIANTS[i];
  const hex = '#' + (brand & 0xffffff).toString(16).padStart(6, '0');
  const letter = 'SMAKRTGN'[(brand >> 4) % 8];
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d')!;
  if (wide) {
    cv.width = 1024; cv.height = 192;
    ctx.fillStyle = '#17181b'; ctx.fillRect(0, 0, cv.width, cv.height); // dark fascia
    v.emblem(ctx, cv.height * 0.62, cv.height / 2, cv.height * 0.34, hex);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${cv.height * 0.5}px sans-serif`; ctx.fillText(v.word, cv.height * 1.15, cv.height / 2 + 2);
  } else {
    cv.width = 512; cv.height = 512;
    v.square(ctx, hex, letter, v.word);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const uri = _logoImg.get(i); // real-logo override: repaint on load
  if (uri) {
    const img = new Image();
    img.onload = () => { ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height); t.needsUpdate = true; };
    img.src = uri;
  }
  _logoTex.set(key, t); return t;
}

/** A sign face carrying the sample logo (emissive so it reads under IBL); falls
 *  back to a solid emissive brand panel when canvas is unavailable (headless). */
export function signFaceMaterial(brand: number, logoId = 0): THREE.Material {
  return memo(`signface:${brand}:${logoId}`, () => {
    const map = logoTexture(brand, logoId, false);
    return new THREE.MeshStandardMaterial({
      color: map ? 0xffffff : brand, map: map ?? null,
      emissive: 0xffffff, emissiveMap: map ?? null, emissiveIntensity: map ? 0.4 : 0,
      roughness: 0.5, metalness: 0.05,
    });
  });
}
/** The plain dark base of the signage fascia (看板帯) — matte charcoal. */
export const fasciaBaseMaterial = () => std('fascia:base', { color: 0x1b1c1f, roughness: 0.6, metalness: 0.12 });
/** The signage fascia (看板帯): a dark band carrying the wide sample logo strip. */
export function fasciaMaterial(brand: number, logoId = 0): THREE.Material {
  return memo(`fascia:${brand}:${logoId}`, () => {
    const map = logoTexture(brand, logoId, true);
    return new THREE.MeshStandardMaterial({
      color: map ? 0xffffff : brand, map: map ?? null,
      emissive: 0xffffff, emissiveMap: map ?? null, emissiveIntensity: map ? 0.35 : 0,
      roughness: 0.55, metalness: 0.1,
    });
  });
}
export const foliageMaterial = () => memo('foliage', () => pbr('foliage', 2, { color: 0x86a55f, roughness: 1 }));
export const trunkMaterial = () => memo('trunk', () => pbr('bark', 1, { roughness: 0.9 }));
export const propMaterial = (c: number) => std(`prop:${c}`, { color: c, roughness: 0.7, metalness: 0.15 });
export const curbMaterial = () => std('curb', { color: 0xb7b3a8, roughness: 0.9 });

// --- parking paint ----------------------------------------------------------
export const stripeMaterial = () => std('stripe', { color: 0xecebe3, roughness: 0.85 });
export const accessibleMaterial = () => std('accessible', { color: 0x2f5fbf, roughness: 0.9 });
