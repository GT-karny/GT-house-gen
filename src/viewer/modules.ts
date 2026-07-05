// ============================================================================
// Module geometry factories. Each opening module is a small assembly built to
// fill exactly one PANEL_W x PANEL_H cell (so the modular grid is preserved),
// but with real depth: a wall surround with a punched opening, a recessed
// frame, glass/leaf, sill/threshold, mullions and a handle. Parts are grouped
// by material and merged so each module is still ONE InstancedMesh.
//
// Local frame: x = width (along wall), y = height, z = outward normal.
// Front (outward) face is +z, matching the render basis.
// ============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MODULE_COLOR, glassMaterial, doorMaterial } from './materials';
import type { WindowSize } from '../gen/types';

const T = 0.18; // wall thickness
/** Shared wall thickness — the plain wall board must use the SAME value so its
 *  front/back faces line up with the window/door surrounds (no step at joints). */
export const WALL_THICKNESS = T;

/** Metres per texture tile on walls. Every wall surface (plain board + the boxes
 *  that make up window/door surrounds) is UV-mapped at THIS constant scale, so a
 *  narrow jamb and a wide wall show the texture at the same size (no stretching).
 *  Wall materials therefore use texture.repeat = 1. */
export const WALL_TILE = 1.0;

// BoxGeometry face order (+X,−X,+Y,−Y,+Z,−Z) → which box dims span (u, v).
const FACE_DIMS: [('w' | 'h' | 'd'), ('w' | 'h' | 'd')][] = [
  ['d', 'h'], ['d', 'h'], ['w', 'd'], ['w', 'd'], ['w', 'h'], ['w', 'h'],
];

/** Rescale a box's per-face 0..1 UVs to real-world metres/WALL_TILE so texture
 *  scale is uniform regardless of the box's size. */
export function planarBoxUV(g: THREE.BufferGeometry, w: number, h: number, d: number, tile = WALL_TILE): void {
  const dim = { w, h, d };
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const su = dim[FACE_DIMS[f][0]] / tile, sv = dim[FACE_DIMS[f][1]] / tile;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
}

/** Default edge bevel (m). A real arris / trim edge is ~1–2 cm, enough to catch a
 *  highlight so edges don't read as razor-sharp CG. Walls pass a smaller value. */
export const EDGE_BEVEL = 0.015;

/** Planar (world-metre) UV straight from each vertex's normal: project the vertex
 *  position onto the axis-pair least aligned with its normal, /tile. Works on ANY
 *  geometry that carries normals — including RoundedBoxGeometry — so a bevelled box
 *  keeps the SAME uniform texel scale that planarBoxUV gives a plain box. Axis
 *  choice matches FACE_DIMS (±X→d,h · ±Y→w,d · ±Z→w,h). */
export function planarNormalUV(g: THREE.BufferGeometry, tile = WALL_TILE): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    let u: number, v: number;
    if (ny >= nx && ny >= nz) { u = px; v = pz; }        // horizontal face → (w,d)
    else if (nx >= nz) { u = pz; v = py; }               // ±X face → (d,h)
    else { u = px; v = py; }                             // ±Z face → (w,h)
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** A box with subtly bevelled edges + world-scale planar UVs — a drop-in for the
 *  plain `BoxGeometry + planarBoxUV` combo. The bevel radius auto-clamps to the
 *  thinnest dimension so slim trim/slats stay valid (never self-intersects). */
export function roundedBox(w: number, h: number, d: number, tile = WALL_TILE, bevel = EDGE_BEVEL): THREE.BufferGeometry {
  const w2 = Math.max(w, 1e-3), h2 = Math.max(h, 1e-3), d2 = Math.max(d, 1e-3);
  const r = Math.max(1e-4, Math.min(bevel, 0.49 * Math.min(w2, h2, d2)));
  const g = new RoundedBoxGeometry(w2, h2, d2, 1, r) as THREE.BufferGeometry;
  planarNormalUV(g, tile); // uniform texel scale, matches plain-box faces
  return g;
}

function box(w: number, h: number, d: number, cx: number, cy: number, cz: number): THREE.BufferGeometry {
  // NOT bevelled: facade panels + opening surrounds tile face-flush, so a bevel
  // would open wedge gaps at panel joints and building corners. Keep them sharp.
  const w2 = Math.max(w, 1e-4), h2 = Math.max(h, 1e-4), d2 = Math.max(d, 1e-4);
  const g = new THREE.BoxGeometry(w2, h2, d2);
  planarBoxUV(g, w2, h2, d2); // world-scale UVs so wall texture is uniform
  g.translate(cx, cy, cz);
  return g;
}

/** 4 wall boxes tiling a panel minus a rectangular opening centred at (0, oy). */
function wallSurround(W: number, H: number, ow: number, oh: number, oy: number, floored: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const left = (W - ow) / 2;
  const right = (W - ow) / 2;
  parts.push(box(left, H, T, -(W / 2) + left / 2, 0, 0)); // left jamb
  parts.push(box(right, H, T, (W / 2) - right / 2, 0, 0)); // right jamb
  const topH = H / 2 - (oy + oh / 2);
  if (topH > 1e-3) parts.push(box(ow, topH, T, 0, (oy + oh / 2) + topH / 2, 0)); // lintel band
  if (!floored) {
    const botH = (oy - oh / 2) - -H / 2;
    if (botH > 1e-3) parts.push(box(ow, botH, T, 0, -H / 2 + botH / 2, 0)); // sill band
  }
  return mergeGeometries(parts, false)!;
}

export interface ModuleMesh {
  geometry: THREE.BufferGeometry; // merged, grouped by material
  materials: THREE.Material[]; // parallel to groups
}

const wallMat = () => new THREE.MeshStandardMaterial({ color: MODULE_COLOR.wall, roughness: 0.9 });

interface WindowSpec {
  ow: number; // opening width
  oh: number; // opening height
  sill: number; // opening bottom above the panel floor (m); 0 = 掃き出し
  mullionsV: number; // vertical mullions (引き違い panels − 1)
}

/** Opening dimensions per size class, clamped to the panel and JP typicals. */
function windowSpec(W: number, H: number, size: WindowSize): WindowSpec {
  switch (size) {
    case 'large': // 掃き出し窓 — reaches the floor, wide 2-panel slider
      return { ow: Math.min(W * 0.92, 1.69), oh: Math.min(H * 0.72, 2.0), sill: 0.02, mullionsV: 1 };
    case 'small': // 小窓 — high, ~900mm, single/half panel
      return { ow: Math.min(W * 0.5, 0.9), oh: Math.min(H * 0.32, 0.9), sill: Math.min(H * 0.45, 1.3), mullionsV: 0 };
    case 'medium': // 腰窓 — waist height, sill ~850mm
    default:
      return { ow: Math.min(W * 0.92, 1.69), oh: Math.min(H * 0.42, 1.15), sill: Math.min(H * 0.3, 0.85), mullionsV: 1 };
  }
}

export interface WindowOpts {
  grille?: boolean; // 面格子
  shutter?: boolean; // シャッターボックス
  protrude?: boolean; // 出窓 — box juts out from the wall
}

const BAY_OUT = 0.4; // 出窓 protrusion depth

/** Window: wall surround + recessed frame + mullions + sill + glass, plus
 *  optional 面格子 (grille bars) and シャッターボックス (shutter housing). */
export function makeWindowModule(W: number, H: number, size: WindowSize = 'medium', opts: WindowOpts = {}, wallMatOverride?: THREE.Material): ModuleMesh {
  const spec = windowSpec(W, H, size);
  const ow = spec.ow;
  const oh = spec.oh;
  // opening centre from panel centre, honouring the sill height above the floor
  let oy = -H / 2 + spec.sill + oh / 2;
  const maxTop = H / 2 - 0.16; // keep a lintel band
  if (oy + oh / 2 > maxTop) oy = maxTop - oh / 2;
  const floored = spec.sill <= 0.05;
  const fw = 0.06; // frame bar width
  const out = opts.protrude ? BAY_OUT : 0; // front plane of the opening
  const front = T / 2 + out;
  const zFrame = front - 0.03; // frame sits just inside the front plane
  const zGlass = front - 0.09; // glass recessed deeper

  const wallParts: THREE.BufferGeometry[] = [wallSurround(W, H, ow, oh, oy, floored)];
  const top = oy + oh / 2, bot = oy - oh / 2;

  // 出窓 — a siding-clad box jutting out, with a little top roof + base
  if (opts.protrude) {
    const midZ = T / 2 + out / 2;
    wallParts.push(box(0.06, oh, out, -ow / 2, oy, midZ)); // left cheek
    wallParts.push(box(0.06, oh, out, ow / 2, oy, midZ)); // right cheek
    wallParts.push(box(ow + 0.14, 0.08, out + 0.08, 0, top + 0.02, midZ)); // roof
    wallParts.push(box(ow + 0.14, 0.1, out + 0.08, 0, bot - 0.02, midZ)); // base
  }
  const wall = mergeGeometries(wallParts, false)!;

  const frameParts: THREE.BufferGeometry[] = [];
  frameParts.push(box(ow + fw, fw, 0.06, 0, top, zFrame)); // head
  frameParts.push(box(ow + fw, fw, 0.06, 0, bot, zFrame)); // sill line
  frameParts.push(box(fw, oh, 0.06, -ow / 2, oy, zFrame)); // left
  frameParts.push(box(fw, oh, 0.06, ow / 2, oy, zFrame)); // right
  for (let i = 1; i <= spec.mullionsV; i++) {
    const mx = -ow / 2 + (ow * i) / (spec.mullionsV + 1);
    frameParts.push(box(fw * 0.7, oh, 0.04, mx, oy, zFrame)); // vertical mullion(s) — 引き違い
  }
  if (size !== 'small') frameParts.push(box(ow, fw * 0.7, 0.04, 0, oy, zFrame)); // horizontal mullion
  if (!opts.protrude) frameParts.push(box(ow + fw * 2.2, 0.09, 0.14, 0, bot - 0.02, T / 2 + 0.02)); // protruding sill

  // detailing only on flush windows (a 出窓 carries neither)
  if (!opts.protrude && opts.shutter) {
    frameParts.push(box(ow + fw * 3, 0.16, 0.14, 0, top + 0.12, T / 2 + 0.03)); // シャッターボックス
  }
  if (!opts.protrude && opts.grille) {
    const bars = Math.max(3, Math.round(ow / 0.12));
    for (let i = 0; i < bars; i++) {
      const gx = -ow / 2 + (ow * (i + 0.5)) / bars;
      frameParts.push(box(0.02, oh * 0.9, 0.02, gx, oy, T / 2 + 0.05)); // 面格子
    }
  }
  const frame = mergeGeometries(frameParts, false)!;

  const glass = box(ow - fw, oh - fw, 0.02, 0, oy, zGlass);

  const geometry = mergeGeometries([wall, frame, glass], true)!;
  return {
    geometry,
    materials: [
      wallMatOverride ?? wallMat(),
      new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.4, metalness: 0.6, envMapIntensity: 1 }), // dark frame
      glassMaterial(), // reflective glass
    ],
  };
}

/** 玄関ドアの見え方 — panel=框戸(2枚パネル), glass=半ガラス採光ドア,
 *  flush=フラットドア(縦バーハンドル). flush は袖ガラス(sidelight)を伴いやすい。 */
export type DoorStyle = 'panel' | 'glass' | 'flush';
export interface DoorOpts {
  canopy?: boolean; // 玄関庇
  recessed?: boolean; // ポーチに奥まらせる
  style?: DoorStyle;
  sidelight?: boolean; // 袖ガラス (幅に余裕があるとき)
}

const LEAF_T = 0.05; // door leaf thickness
const STILE = 0.11; // 框(縦框・横桟)の見付

/** Door assembly: wall surround (floored opening) + metal frame/threshold +
 *  detailed leaf (panelled / half-glazed / flush) + handle, plus optional
 *  袖ガラス sidelight, 庇 canopy and 玄関ポーチ recess. Grouped by material:
 *  [wall, metal(frame+handle), leaf(timber/painted), glass]. */
export function makeDoorModule(W: number, H: number, opts: DoorOpts = {}, wallMatOverride?: THREE.Material, leafMatOverride?: THREE.Material): ModuleMesh {
  const style = opts.style ?? 'panel';
  const recessed = !!opts.recessed;
  const dw = Math.min(W * 0.44, 1.0); // leaf width
  const dh = Math.min(H * 0.78, 2.25); // opening height (floored)
  // 袖ガラス only if the panel is wide enough to keep a wall margin
  const sw = opts.sidelight && dw + 0.06 + 0.3 <= W * 0.9 ? 0.3 : 0;
  const gap = sw > 0 ? 0.06 : 0;
  const owTot = dw + gap + sw; // total glazed+leaf opening
  const oy = -H / 2 + dh / 2;
  const top = oy + dh / 2, bot = oy - dh / 2;
  const fw = 0.08; // frame bar
  const rec = recessed ? 0.7 : 0;
  const zWall = T / 2;
  const zOpen = T / 2 - rec; // recessed door plane
  const zFrame = zOpen - 0.02;
  const zLeaf = zOpen - 0.06;
  const leafFront = zLeaf + LEAF_T / 2;
  const xLeaf = -owTot / 2 + dw / 2; // leaf sits on the hinge side of the opening
  const xSide = owTot / 2 - sw / 2; // sidelight on the far side

  // --- 1) wall surround + recess niche ---
  const wallParts: THREE.BufferGeometry[] = [wallSurround(W, H, owTot, dh, oy, true)];
  if (recessed) {
    const midZ = T / 2 - rec / 2;
    wallParts.push(box(0.06, dh, rec, -owTot / 2, oy, midZ)); // left return
    wallParts.push(box(0.06, dh, rec, owTot / 2, oy, midZ)); // right return
    wallParts.push(box(owTot + 0.12, 0.08, rec, 0, top, midZ)); // soffit
    wallParts.push(box(owTot + 0.12, 0.06, rec, 0, -H / 2 + 0.03, midZ)); // step
  }

  // --- 2) metal frame + threshold (+ mullion between leaf & sidelight) ---
  const metalParts: THREE.BufferGeometry[] = [];
  metalParts.push(box(owTot + fw, fw, 0.08, 0, top, zFrame)); // head
  metalParts.push(box(fw, dh, 0.08, -owTot / 2, oy, zFrame)); // left jamb
  metalParts.push(box(fw, dh, 0.08, owTot / 2, oy, zFrame)); // right jamb
  metalParts.push(box(owTot + fw * 2, 0.06, 0.16, 0, -H / 2 + 0.03, zWall + 0.02)); // threshold
  if (sw > 0) metalParts.push(box(fw * 0.8, dh, 0.07, xLeaf + dw / 2 + gap / 2, oy, zFrame)); // mullion

  // --- 3) leaf (per style) + its glazing ---
  const leafParts: THREE.BufferGeometry[] = [];
  const glassParts: THREE.BufferGeometry[] = [];
  const innerW = dw - 2 * STILE;
  if (style === 'panel') {
    leafParts.push(box(dw, dh, LEAF_T, xLeaf, oy, zLeaf)); // slab
    const pz = leafFront + 0.006, pd = 0.024; // raised 框 trim
    leafParts.push(box(STILE, dh, pd, xLeaf - dw / 2 + STILE / 2, oy, pz)); // left stile
    leafParts.push(box(STILE, dh, pd, xLeaf + dw / 2 - STILE / 2, oy, pz)); // right stile
    leafParts.push(box(innerW, STILE, pd, xLeaf, top - STILE / 2, pz)); // top rail
    leafParts.push(box(innerW, STILE, pd, xLeaf, oy, pz)); // lock rail → 2 panels
    leafParts.push(box(innerW, STILE, pd, xLeaf, bot + STILE / 2, pz)); // bottom rail
  } else if (style === 'glass') {
    const lowerH = dh * 0.42;
    const midY = bot + lowerH;
    leafParts.push(box(STILE, dh, LEAF_T, xLeaf - dw / 2 + STILE / 2, oy, zLeaf)); // left stile
    leafParts.push(box(STILE, dh, LEAF_T, xLeaf + dw / 2 - STILE / 2, oy, zLeaf)); // right stile
    leafParts.push(box(innerW, lowerH, LEAF_T, xLeaf, bot + lowerH / 2, zLeaf)); // lower panel
    leafParts.push(box(innerW, STILE, LEAF_T, xLeaf, top - STILE / 2, zLeaf)); // top rail
    leafParts.push(box(innerW, STILE, LEAF_T, xLeaf, midY + STILE / 2, zLeaf)); // mid rail
    const gTop = top - STILE, gBot = midY + STILE, gh = gTop - gBot;
    glassParts.push(box(innerW, gh, 0.02, xLeaf, (gTop + gBot) / 2, zLeaf));
    leafParts.push(box(0.03, gh, LEAF_T * 0.9, xLeaf, (gTop + gBot) / 2, zLeaf + 0.006)); // 方立
  } else {
    leafParts.push(box(dw, dh, LEAF_T, xLeaf, oy, zLeaf)); // flush slab
    leafParts.push(box(0.02, dh * 0.9, LEAF_T * 0.6, xLeaf + dw * 0.18, oy, leafFront + 0.004)); // slim reveal line
  }

  // --- sidelight glazing (袖ガラス) ---
  if (sw > 0) {
    glassParts.push(box(sw - 0.04, dh - 0.06, 0.02, xSide, oy, zLeaf));
    metalParts.push(box(sw, 0.05, 0.06, xSide, top - 0.02, zFrame)); // upper bar
    metalParts.push(box(sw, 0.05, 0.06, xSide, oy, zFrame)); // mid bar
    metalParts.push(box(sw, 0.05, 0.06, xSide, bot + 0.02, zFrame)); // lower bar
  }

  // --- handle ---
  if (style === 'panel') {
    const hy = -H / 2 + 1.0, hx = xLeaf + dw / 2 - 0.1; // lever, latch side
    metalParts.push(box(0.05, 0.14, 0.03, hx, hy, leafFront + 0.02)); // escutcheon
    metalParts.push(box(0.12, 0.03, 0.05, hx - 0.055, hy, leafFront + 0.05)); // lever
  } else {
    const hx = xLeaf + dw / 2 - 0.09, barH = Math.min(dh * 0.6, 1.15); // vertical bar pull
    metalParts.push(box(0.035, barH, 0.035, hx, oy, leafFront + 0.07));
    metalParts.push(box(0.035, 0.03, 0.09, hx, oy + barH / 2 - 0.02, leafFront + 0.035)); // top standoff
    metalParts.push(box(0.035, 0.03, 0.09, hx, oy - barH / 2 + 0.02, leafFront + 0.035)); // bottom standoff
  }

  // --- canopy (庇) — a recessed porch is already sheltered ---
  if (opts.canopy && !recessed) {
    const cw = owTot + 0.5;
    metalParts.push(box(cw, 0.07, 0.7, 0, top + 0.22, T / 2 + 0.3)); // slab
    metalParts.push(box(0.05, 0.22, 0.05, -cw / 2 + 0.05, top + 0.11, T / 2 + 0.55)); // bracket L
    metalParts.push(box(0.05, 0.22, 0.05, cw / 2 - 0.05, top + 0.11, T / 2 + 0.55)); // bracket R
  }

  // --- assemble grouped-by-material geometry ---
  const groups: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const push = (parts: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (parts.length) { groups.push(mergeGeometries(parts, false)!); materials.push(mat); }
  };
  push(wallParts, wallMatOverride ?? wallMat());
  push(metalParts, new THREE.MeshStandardMaterial({ color: 0x3a3a3d, roughness: 0.5, metalness: 0.6, envMapIntensity: 1 }));
  push(leafParts, leafMatOverride ?? doorMaterial());
  push(glassParts, glassMaterial());

  return { geometry: mergeGeometries(groups, true)!, materials };
}
