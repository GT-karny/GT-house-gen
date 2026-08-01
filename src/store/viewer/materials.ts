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
import { drawPilotBrand, pilotBrandFor, type StoreSignRole } from './sign-brands';

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
/** White-painted structural steel commonly used by Japanese roadside pylons. */
export const pylonPoleMaterial = () => std('pylon-pole', { color: 0xd8d7d1, roughness: 0.58, metalness: 0.62, envMapIntensity: 0.75 });
/** Dark anodised-aluminium mullion / storefront frame. */
export const mullionMaterial = () => std('mullion', { color: 0x2b2e33, roughness: 0.35, metalness: 0.9, envMapIntensity: 1.1 });
/** A lit fixture head (parking pole / storefront flood) — emissive so it reads. */
export const lampMaterial = () => std('lamp', { color: 0xf6efd6, roughness: 0.3, emissive: 0xffe9b0, emissiveIntensity: 1.4 });

// --- site props -------------------------------------------------------------
export const carPaintMaterial = (c: number) => std(`car:${c}`, { color: c, roughness: 0.3, metalness: 0.6, envMapIntensity: 1.2 });
export const carGlassMaterial = () => std('carglass', { color: 0x12181d, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.3 });
export const glassMaterial = () => moduleMaterial('glazing');
export const tireMaterial = () => std('tire', { color: 0x181a1c, roughness: 0.85, metalness: 0 });
export const signBoxMaterial = (c: number) => std(`signbox:${c}`, { color: c, roughness: 0.46, metalness: 0.68, envMapIntensity: 0.8 });

// --- Japanese roadside-store sign systems (procedural; VIEWER-ONLY) ---------
// Real Japanese roadside branding is predominantly typographic: a large shop
// name and a compact identification mark on a strong fascia colour. Road-facing
// identity signs deliberately omit operational and product/service copy so the
// brand remains legible at driving distance.
// The pure generator still emits only a stable logoId; this viewer maps it to a
// fictional brand family and renders the appropriate aspect ratio for each sign.
type Ctx2D = CanvasRenderingContext2D;
export type { StoreSignRole } from './sign-brands';
interface BrandSpec {
  name: string;
  short: string;
  font: string;
  weight: number;
  eyebrow: string;
  latin: string;
  services: string;
  /** Exterior accent and the dominant colour in this brand's sign system. */
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  signStyle: 'inverse' | 'fresh' | 'hardware' | 'tricolor' | 'daily' | 'framed' | 'split' | 'burger';
}

const JP_FONT = '"Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif';
const FONT_KAKU = '"Zen Kaku Gothic New", "Yu Gothic", sans-serif';
const FONT_ROUNDED = '"M PLUS Rounded 1c", "Yu Gothic", sans-serif';
const FONT_DISPLAY = '"Dela Gothic One", "Yu Gothic", sans-serif';
const BRANDS: BrandSpec[] = [
  { name: '光星デンキ', short: '光星', font: FONT_KAKU, weight: 900, eyebrow: '暮らしと家電の大型専門店', latin: 'KOSEI DENKI', services: '家電  パソコン  リフォーム', primary: '#c52e2b', secondary: '#ffffff', accent: '#ffffff', surface: '#fffdfa', signStyle: 'inverse' },
  { name: 'みのり', short: 'みのり', font: FONT_ROUNDED, weight: 800, eyebrow: 'フレッシュマート', latin: 'MINORI MARKET', services: '生鮮  惣菜  ベーカリー', primary: '#21603a', secondary: '#efb82e', accent: '#8cad39', surface: '#fffdf3', signStyle: 'fresh' },
  { name: 'くらし館', short: 'くらし館', font: FONT_KAKU, weight: 900, eyebrow: 'ホームセンター', latin: 'KURASHIKAN', services: 'DIY  園芸  資材  日用品', primary: '#d95d24', secondary: '#1d3138', accent: '#f0b13d', surface: '#f2eadb', signStyle: 'hardware' },
  { name: 'まちポート', short: 'まち', font: FONT_ROUNDED, weight: 800, eyebrow: 'コンビニエンスストア', latin: 'MACHI PORT', services: '24H  ATM  酒  たばこ', primary: '#165ca8', secondary: '#2f9b61', accent: '#35a7cf', surface: '#f8faf8', signStyle: 'tricolor' },
  { name: 'デイリーワン', short: 'デイリー1', font: FONT_DISPLAY, weight: 400, eyebrow: '毎日に、ちょうどいい。', latin: 'DAILY ONE', services: 'お弁当  ATM  宅配便  24H', primary: '#a92832', secondary: '#f1b52d', accent: '#fff8e7', surface: '#fffaf0', signStyle: 'daily' },
  { name: 'こもれび', short: 'こもれび', font: FONT_ROUNDED, weight: 800, eyebrow: 'ファミリーレストラン', latin: 'RESTAURANT KOMOREBI', services: 'ハンバーグ  パスタ  デザート', primary: '#315941', secondary: '#8b403a', accent: '#d9b46b', surface: '#fbf2df', signStyle: 'framed' },
  { name: 'キッチンひだまり', short: 'ひだまり', font: FONT_ROUNDED, weight: 800, eyebrow: '洋食とごはん', latin: 'HIDAMARI KITCHEN', services: 'モーニング  ランチ  ドリンクバー', primary: '#dd6b21', secondary: '#573a2b', accent: '#f3bd45', surface: '#fff4d9', signStyle: 'split' },
  { name: 'グリルバンズ', short: 'バンズ', font: FONT_DISPLAY, weight: 400, eyebrow: 'バーガー＆カフェ', latin: 'GRILL BUNS', services: 'ドライブスルー  お持ち帰り', primary: '#8e2830', secondary: '#e1a637', accent: '#f7ead0', surface: '#fbf1dc', signStyle: 'burger' },
];
export const LOGO_VARIANT_COUNT = BRANDS.length;
export function storeBrandColor(logoId: number): number {
  const i = ((logoId % LOGO_VARIANT_COUNT) + LOGO_VARIANT_COUNT) % LOGO_VARIANT_COUNT;
  const colour = pilotBrandFor(i)?.primary ?? BRANDS[i].primary;
  return Number.parseInt(colour.slice(1), 16);
}
const PROMO_IMAGE: Partial<Record<number, string>> = {
  7: '/textures/store-signage/drive-menu.png',
};
const BRAND_MARK_IMAGE = [
  '/textures/store-signage/logos/kosei.png',
  '/textures/store-signage/logos/minori.png',
  '/textures/store-signage/logos/kurashikan.png',
  '/textures/store-signage/logos/machi-port.png',
  '/textures/store-signage/logos/daily-one.png',
  '/textures/store-signage/logos/komorebi.png',
  '/textures/store-signage/logos/hidamari.png',
  '/textures/store-signage/logos/burger-port.png',
] as const;

function fitFont(ctx: Ctx2D, text: string, maxW: number, start: number, min = 24, font = JP_FONT, weight = 900): number {
  let px = start;
  do { ctx.font = `${weight} ${px}px ${font}`; if (ctx.measureText(text).width <= maxW) return px; px -= 2; } while (px > min);
  return min;
}

function drawVerticalName(ctx: Ctx2D, b: BrandSpec, w: number, top: number, areaH: number) {
  const split = b.short.length >= 5 ? Math.ceil(b.short.length / 2) : 0;
  const lines = split ? [b.short.slice(0, split), b.short.slice(split)] : [b.short];
  const lineH = areaH / lines.length;
  for (let i = 0; i < lines.length; i++) {
    fitFont(ctx, lines[i], w * .9, lineH * .88, 40, b.font, b.weight);
    ctx.fillText(lines[i], w / 2, top + lineH * (i + .5));
  }
}

function drawLogoMark(ctx: Ctx2D, colour: string, cx: number, cy: number, size: number, img?: HTMLImageElement) {
  const x = cx - size / 2, y = cy - size / 2;
  if (!img || typeof document === 'undefined') return;
  // Generated artwork supplies the distinctive silhouette; the sign system
  // chooses its normal or reversed ink depending on the physical sign face.
  const side = Math.max(1, Math.ceil(size));
  const layer = document.createElement('canvas'); layer.width = side; layer.height = side;
  const lctx = layer.getContext('2d')!;
  lctx.drawImage(img, 0, 0, side, side);
  lctx.globalCompositeOperation = 'source-in';
  lctx.fillStyle = colour; lctx.fillRect(0, 0, side, side);
  ctx.drawImage(layer, x, y, size, size);
}

interface SignPalette { mark: string; word: string }
function drawSignField(ctx: Ctx2D, w: number, h: number, b: BrandSpec, role: StoreSignRole): SignPalette {
  const fascia = role === 'fascia' || role === 'wall' || role === 'rooftop';
  switch (b.signStyle) {
    case 'inverse':
      ctx.fillStyle = b.primary; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(0, 0, w, h * .035); ctx.fillRect(0, h * .965, w, h * .035);
      return { mark: b.secondary, word: b.secondary };
    case 'fresh':
      ctx.fillStyle = b.surface; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = b.secondary; ctx.fillRect(0, h * (fascia ? .78 : .84), w, h * (fascia ? .1 : .07));
      ctx.fillStyle = b.accent; ctx.fillRect(0, h * .88, w, h * .12);
      return { mark: b.primary, word: b.primary };
    case 'hardware':
      ctx.fillStyle = b.primary; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = b.secondary; ctx.fillRect(0, h * (fascia ? .8 : .86), w, h * (fascia ? .2 : .14));
      return { mark: b.accent, word: b.accent };
    case 'tricolor': {
      ctx.fillStyle = b.surface; ctx.fillRect(0, 0, w, h);
      // Convenience-store fascia: broad colour rails are part of the identity,
      // not a hairline decoration. The white centre keeps the name legible.
      ctx.fillStyle = b.secondary; ctx.fillRect(0, 0, w, h * (fascia ? .1 : .07));
      ctx.fillStyle = b.accent; ctx.fillRect(0, h * (fascia ? .82 : .88), w, h * (fascia ? .06 : .045));
      ctx.fillStyle = b.primary; ctx.fillRect(0, h * (fascia ? .88 : .925), w, h * (fascia ? .12 : .075));
      return { mark: b.primary, word: b.primary };
    }
    case 'daily':
      ctx.fillStyle = b.primary; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = b.secondary; ctx.fillRect(0, h * (fascia ? .84 : .89), w, h * (fascia ? .16 : .11));
      return { mark: b.accent, word: b.accent };
    case 'framed': {
      ctx.fillStyle = b.surface; ctx.fillRect(0, 0, w, h);
      const outer = Math.max(5, Math.min(w, h) * .045);
      ctx.strokeStyle = b.primary; ctx.lineWidth = outer; ctx.strokeRect(outer / 2, outer / 2, w - outer, h - outer);
      ctx.strokeStyle = b.secondary; ctx.lineWidth = Math.max(2, outer * .32); ctx.strokeRect(outer * 1.45, outer * 1.45, w - outer * 2.9, h - outer * 2.9);
      return { mark: b.primary, word: b.primary };
    }
    case 'split':
      ctx.fillStyle = b.surface; ctx.fillRect(0, 0, w, h);
      return { mark: b.surface, word: b.secondary };
    case 'burger':
      ctx.fillStyle = b.primary; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = b.secondary; ctx.fillRect(0, h * (fascia ? .85 : .9), w, h * (fascia ? .15 : .1));
      return { mark: b.accent, word: b.accent };
  }
}

function drawBrand(ctx: Ctx2D, w: number, h: number, b: BrandSpec, role: StoreSignRole, logoId: number, mark?: HTMLImageElement) {
  if (drawPilotBrand(ctx, w, h, logoId, role)) return;
  const palette = drawSignField(ctx, w, h, b, role);
  // Slightly imperfect illuminated-sheet surface, without looking dirty.
  const sheen = ctx.createLinearGradient(0, 0, 0, h);
  sheen.addColorStop(0, 'rgba(255,255,255,.16)'); sheen.addColorStop(.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,.08)');
  ctx.fillStyle = sheen; ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'middle';

  if (role === 'fascia' || role === 'wall' || role === 'rooftop') {
    // The mark is recognized first at road speed; keep it visibly larger than
    // the shop-name letter height even on a long fascia/roof board.
    const split = b.signStyle === 'split';
    const markSize = h * (split ? .74 : .78);
    const gap = h * .18;
    ctx.fillStyle = palette.word; ctx.textAlign = 'left';
    const fontPx = fitFont(ctx, b.name, w - markSize - gap - w * .08, h * .56, h * .34, b.font, b.weight);
    const nameW = ctx.measureText(b.name).width;
    const groupW = markSize + gap + nameW;
    const left = Math.max(w * .04, (w - groupW) / 2);
    if (split) {
      const panelW = Math.min(w * .32, markSize + h * .34);
      ctx.fillStyle = b.primary; ctx.fillRect(0, 0, panelW, h);
      drawLogoMark(ctx, palette.mark, panelW / 2, h * .46, markSize, mark);
      ctx.fillStyle = palette.word; ctx.textAlign = 'left';
      ctx.font = `${b.weight} ${fontPx}px ${b.font}`;
      ctx.fillText(b.name, panelW + h * .2, h * .48);
      ctx.fillStyle = b.accent; ctx.fillRect(panelW, h * .82, w - panelW, h * .18);
      return;
    }
    drawLogoMark(ctx, palette.mark, left + markSize / 2, h * .47, markSize, mark);
    ctx.fillStyle = palette.word; ctx.textAlign = 'left';
    ctx.font = `${b.weight} ${fontPx}px ${b.font}`;
    ctx.fillText(b.name, left + markSize + gap, h * .51);
    return;
  }

  ctx.textAlign = 'center'; ctx.fillStyle = palette.word;
  // Pylons and blade signs are read as silhouettes first. Maximise the square
  // mark against the usable sign width, then place only the shop name in the
  // remaining area immediately below it.
  const split = b.signStyle === 'split';
  const markSize = Math.min(w * .9, h * (split ? .5 : .62));
  const markTop = h * .035;
  const markY = markTop + markSize / 2;
  if (split) {
    const panelH = Math.min(h * .61, markSize + h * .08);
    ctx.fillStyle = b.primary; ctx.fillRect(0, 0, w, panelH);
    drawLogoMark(ctx, palette.mark, w / 2, panelH / 2, markSize, mark);
    ctx.fillStyle = b.accent; ctx.fillRect(0, panelH, w, h * .04);
    ctx.fillStyle = palette.word; ctx.textAlign = 'center';
    drawVerticalName(ctx, b, w, panelH + h * .055, h - panelH - h * .07);
    return;
  }
  drawLogoMark(ctx, palette.mark, w / 2, markY, markSize, mark);
  ctx.fillStyle = palette.word; ctx.textAlign = 'center';
  const nameTop = markTop + markSize + h * .025;
  drawVerticalName(ctx, b, w, nameTop, Math.max(h * .16, h * .91 - nameTop));
}

function drawPromo(ctx: Ctx2D, w: number, h: number, b: BrandSpec, role: StoreSignRole, img: HTMLImageElement) {
  const menu = role === 'menu';
  const y = menu ? h * .12 : h * .28;
  const ph = menu ? h * .79 : h * .63;
  const srcAspect = img.width / img.height, dstAspect = w / ph;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (srcAspect > dstAspect) { sw = img.height * dstAspect; sx = (img.width - sw) / 2; }
  else { sh = img.width / dstAspect; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, 0, y, w, ph);
  ctx.fillStyle = b.surface; ctx.fillRect(0, 0, w, menu ? h * .12 : h * .28);
  ctx.fillStyle = b.primary; ctx.fillRect(0, 0, w, h * .025);
  ctx.fillStyle = b.primary; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (menu) {
    fitFont(ctx, b.short, w * .9, h * .09, 30, b.font, b.weight); ctx.fillText(b.short, w / 2, h * .066);
  } else {
    ctx.font = `800 ${h * .055}px ${JP_FONT}`; ctx.fillText(b.eyebrow, w / 2, h * .085);
    fitFont(ctx, b.short, w * .9, h * .14, 40, b.font, b.weight); ctx.fillText(b.short, w / 2, h * .19);
  }
  ctx.fillStyle = b.primary; ctx.fillRect(0, h * .91, w, h * .09);
  ctx.fillStyle = b.surface; ctx.font = `900 ${Math.max(22, w * .058)}px ${JP_FONT}`;
  ctx.fillText(menu ? 'おすすめメニュー' : b.services, w / 2, h * .955);
}

const _logoImg = new Map<number, string>(); // variant index → optional image override
/** Override a logo slot with an imported image (PNG/SVG data-URI). Call before
 *  first render (or re-render after). Clears the texture cache so it re-bakes. */
export function setLogoImage(variantIndex: number, dataUri: string): void {
  const i = ((variantIndex % LOGO_VARIANT_COUNT) + LOGO_VARIANT_COUNT) % LOGO_VARIANT_COUNT;
  _logoImg.set(i, dataUri); _logoTex.clear();
}

const _logoTex = new Map<string, THREE.Texture | null>();
function textureSize(role: StoreSignRole, aspect: number): { w: number; h: number } {
  const a = Math.max(0.25, Math.min(24, aspect));
  if (a >= 1) {
    const h = role === 'fascia' ? 192 : 384;
    return { w: Math.min(4096, Math.round(h * a)), h };
  }
  const w = role === 'menu' || role === 'pylon' || role === 'blade' ? 640 : 512;
  return { w, h: Math.min(2048, Math.round(w / a)) };
}

function logoTexture(logoId: number, role: StoreSignRole, aspect = 1): THREE.Texture | null {
  const aspectKey = Math.round(aspect * 20) / 20;
  const key = `${logoId}:${role}:${aspectKey}`;
  if (_logoTex.has(key)) return _logoTex.get(key)!;
  if (typeof document === 'undefined') { _logoTex.set(key, null); return null; }
  const i = ((logoId % LOGO_VARIANT_COUNT) + LOGO_VARIANT_COUNT) % LOGO_VARIANT_COUNT;
  const b = BRANDS[i];
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d')!;
  const size = textureSize(role, aspectKey);
  cv.width = size.w; cv.height = size.h;
  drawBrand(ctx, cv.width, cv.height, b, role, i);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  let markImg: HTMLImageElement | undefined;
  let promoImg: HTMLImageElement | undefined;
  let overrideImg: HTMLImageElement | undefined;
  const repaint = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (overrideImg) ctx.drawImage(overrideImg, 0, 0, cv.width, cv.height);
    else {
      drawBrand(ctx, cv.width, cv.height, b, role, i, markImg);
      if (promoImg) drawPromo(ctx, cv.width, cv.height, b, role, promoImg);
    }
    t.needsUpdate = true;
  };

  if (!pilotBrandFor(i)) {
    const mark = new Image();
    mark.onload = () => { markImg = mark; repaint(); };
    mark.src = BRAND_MARK_IMAGE[i];
  }

  const promo = PROMO_IMAGE[i];
  if (promo && role === 'menu') {
    const img = new Image();
    img.onload = () => { promoImg = img; repaint(); };
    img.src = promo;
  }
  const uri = _logoImg.get(i); // real-logo override: repaint on load
  if (uri) {
    const img = new Image();
    img.onload = () => { overrideImg = img; repaint(); };
    img.src = uri;
  }
  _logoTex.set(key, t); return t;
}

/** A sign face carrying the sample logo (emissive so it reads under IBL); falls
 *  back to a solid emissive brand panel when canvas is unavailable (headless). */
export function signFaceMaterial(brand: number, logoId = 0, role: StoreSignRole = 'square', aspect = 1): THREE.Material {
  const aspectKey = Math.round(aspect * 20) / 20;
  return memo(`signface:${brand}:${logoId}:${role}:${aspectKey}`, () => {
    const map = logoTexture(logoId, role, aspectKey);
    return new THREE.MeshStandardMaterial({
      color: map ? 0xffffff : brand, map: map ?? null,
      emissive: 0xffffff, emissiveMap: map ?? null, emissiveIntensity: map ? 0.06 : 0,
      roughness: 0.62, metalness: 0.02,
    });
  });
}

const PILOT_POSTERS: Readonly<Partial<Record<number, string>>> = {
  2: '/textures/store/posters/kurashikan-gardening.webp',
  3: '/textures/store/posters/machiport-morning-set.webp',
  7: '/textures/store/posters/grillbuns-cheese-burger.webp',
};

/** Finished retail artwork for the three pilot brands. One cached texture is
 * shared by every instance; non-pilot brands retain the lightweight canvas
 * poster, and headless tests avoid browser image loading entirely. */
export function posterMaterial(logoId: number): THREE.Material {
  const src = PILOT_POSTERS[logoId];
  if (!src) return signFaceMaterial(0xffffff, logoId, 'poster', 2 / 3);
  return memo(`retail-poster:${logoId}`, () => {
    if (typeof document === 'undefined') {
      return new THREE.MeshStandardMaterial({ color: 0xf0eee7, roughness: 0.72, metalness: 0 });
    }
    const map = new THREE.TextureLoader().load(src);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return new THREE.MeshStandardMaterial({
      color: 0xffffff, map,
      emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.025,
      roughness: 0.72, metalness: 0,
    });
  });
}
/** The signage fascia (看板帯): a dark band carrying the wide sample logo strip. */
export function fasciaMaterial(brand: number, logoId = 0, aspect = 5): THREE.Material {
  const aspectKey = Math.round(aspect * 20) / 20;
  return memo(`fascia:${brand}:${logoId}:${aspectKey}`, () => {
    const map = logoTexture(logoId, 'fascia', aspectKey);
    return new THREE.MeshStandardMaterial({
      color: map ? 0xffffff : brand, map: map ?? null,
      emissive: 0xffffff, emissiveMap: map ?? null, emissiveIntensity: map ? 0.04 : 0,
      roughness: 0.64, metalness: 0.03,
    });
  });
}

export interface FasciaVisual {
  panel: number;
  casing: number;
  rails: ReadonlyArray<{ y: number; h: number; color: number }>;
}

/** Construction palette for a Japanese chain-store fascia. Positions are
 * normalized to the panel height, with y=0 at the panel centre. Keeping this
 * separate from the logo canvas lets the rails continue across panel joints. */
export function fasciaVisual(logoId: number, fallback = 0x39434a): FasciaVisual {
  if (logoId === 2) return {
    panel: 0xf2eee2, casing: 0x4a4e4f,
    rails: [{ y: -0.43, h: 0.14, color: 0xe97535 }],
  };
  if (logoId === 3) return {
    panel: 0xf4f6f3, casing: 0x4b5155,
    rails: [
      { y: 0.44, h: 0.1, color: 0x54b47a },
      { y: -0.405, h: 0.055, color: 0x28a9ca },
      { y: -0.475, h: 0.085, color: 0x1763aa },
    ],
  };
  if (logoId === 7) return {
    panel: 0xa82d39, casing: 0x282d32,
    rails: [{ y: -0.44, h: 0.12, color: 0xe7c452 }],
  };
  return { panel: fallback, casing: 0x2c3237, rails: [] };
}

/** Plain coated sign-panel material used behind separately modelled graphics. */
export function fasciaPanelMaterial(color: number): THREE.Material {
  return std(`fascia-panel:${color}`, {
    color, roughness: 0.57, metalness: 0.08, envMapIntensity: 0.72,
  });
}
export const foliageMaterial = () => memo('foliage', () => pbr('foliage', 2, { color: 0x86a55f, roughness: 1 }));
export const trunkMaterial = () => memo('trunk', () => pbr('bark', 1, { roughness: 0.9 }));
export const propMaterial = (c: number) => std(`prop:${c}`, { color: c, roughness: 0.7, metalness: 0.15 });
export const curbMaterial = () => std('curb', { color: 0xb7b3a8, roughness: 0.9 });

// --- parking paint ----------------------------------------------------------
export const stripeMaterial = () => std('stripe', { color: 0xecebe3, roughness: 0.85 });
export const accessibleMaterial = () => std('accessible', { color: 0x2f5fbf, roughness: 0.9 });
