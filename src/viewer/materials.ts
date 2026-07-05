import * as THREE from 'three';
import type { Module } from '../gen/types';
import { pbr } from './textures';

export const MODULE_COLOR: Record<Module, number> = {
  wall: 0xe9e3d7, // warm off-white plaster
  window: 0x3fa9d6, // glass
  door: 0x8a5a3b, // timber
};

export function moduleMaterials(): Record<Module, THREE.Material> {
  return { wall: wallMaterial('plaster'), window: glassMaterial(), door: doorMaterial() };
}

/** 外壁 variant. Each maps to a CC0 PBR surface (diffuse+normal+rough), tinted.
 *  plaster/plaster2=塗り壁, siding/siding2/siding3=木・サイディング,
 *  stone/stone2=石貼り(玄関・腰壁), brick/brick2=レンガ, concrete=打放し,
 *  dark=濃色サイディング(下屋アクセント). */
export type WallVariant =
  | 'plaster' | 'plaster2'
  | 'siding' | 'siding2' | 'siding3'
  | 'stone' | 'stone2'
  | 'brick' | 'brick2'
  | 'concrete' | 'dark';

// wall UVs are baked to real metres (WALL_TILE), so texture.repeat = 1 here and
// every wall surface — plain board, window/door surround, gable — shares scale.
const WALL_SPEC: Record<WallVariant, { tex: string; color: number; rough: number }> = {
  plaster: { tex: 'plaster', color: 0xe9e3d7, rough: 1 },
  plaster2: { tex: 'plaster2', color: 0xe6ddcd, rough: 1 },
  siding: { tex: 'siding', color: 0xb9ac97, rough: 0.9 },
  siding2: { tex: 'siding2', color: 0xc7b79c, rough: 0.85 },
  siding3: { tex: 'siding3', color: 0xb5a488, rough: 0.85 },
  stone: { tex: 'stone', color: 0xffffff, rough: 1 },
  stone2: { tex: 'stone2', color: 0xcbc3b6, rough: 1 },
  brick: { tex: 'brick', color: 0xb08670, rough: 1 },
  brick2: { tex: 'brick2', color: 0xa97f66, rough: 1 },
  concrete: { tex: 'concrete2', color: 0xcac6bd, rough: 0.95 },
  dark: { tex: 'siding', color: 0x3e4249, rough: 0.85 },
};

export function wallMaterial(v: WallVariant): THREE.Material {
  const s = WALL_SPEC[v] ?? WALL_SPEC.plaster;
  return pbr(s.tex, 1, { color: s.color, roughness: s.rough });
}

/** 反射するガラス (uses scene.environment for reflections). */
export function glassMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: 0x1c2630, roughness: 0.06, metalness: 0.9, envMapIntensity: 1.3, emissive: 0x060a0e,
  });
}

/** 玄関ドアの面材 (leaf). wood_a/b/c=木目3種, painted=塗装ドア(色付け),
 *  dark=マットな金属/樹脂ドア. CC0 PBR wood, tinted per variant. */
export type DoorLeafVariant = 'wood_a' | 'wood_b' | 'wood_c' | 'painted' | 'dark';
export function doorMaterial(v: DoorLeafVariant = 'wood_a', color?: number): THREE.Material {
  switch (v) {
    case 'wood_b':
      return pbr('door_b', 1, { color: 0x7c5838, roughness: 0.5, metalness: 0.04 });
    case 'wood_c':
      return pbr('door_c', 1, { color: 0x5a4130, roughness: 0.5, metalness: 0.04 });
    case 'painted':
      return pbr('door_paint', 1, { color: color ?? 0x2c3a44, roughness: 0.45, metalness: 0.05 });
    case 'dark':
      return new THREE.MeshStandardMaterial({ color: color ?? 0x2a2c30, roughness: 0.4, metalness: 0.25, envMapIntensity: 1 });
    default:
      return pbr('door_a', 1, { color: 0x6b4a33, roughness: 0.5, metalness: 0.04 });
  }
}

/** 車の塗装 — glossy paint that catches the environment. */
export function carPaintMaterial(color: number): THREE.Material {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.55, envMapIntensity: 1.2 });
}

export function roofMaterial(color = 0x6b6560): THREE.Material {
  // clay-tile CC0 PBR, tinted toward the (randomisable) colour of a modern JP roof
  return pbr('roof', 1, { color, roughness: 0.85, side: THREE.DoubleSide, normalScale: 1.2 });
}

export function slabMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: 0xb9b3a6, roughness: 1.0, side: THREE.DoubleSide });
}

// --- site (敷地) ground zones + fence -------------------------------------
import type { ZoneKind } from '../gen/types';

// each zone → [CC0 texture, tile size in metres, tint]. ShapeGeometry UVs are in
// world metres, so repeat = 1/tileMetres.
const ZONE_TEX: Record<ZoneKind, { name: string; tile: number; color: number }> = {
  yard: { name: 'gravel', tile: 2.5, color: 0xb3ada0 }, // 犬走り砂利
  parking: { name: 'asphalt', tile: 3.0, color: 0x8f9298 }, // アスファルト
  approach: { name: 'concrete', tile: 2.5, color: 0xcfcabf }, // 土間/舗石
  garden: { name: 'grass', tile: 3.0, color: 0x9fbf7e }, // 芝
  service: { name: 'gravel', tile: 2.0, color: 0x8f9084 }, // サービスヤード
  bike: { name: 'concrete', tile: 2.0, color: 0xbdb6a8 }, // 駐輪
  planting: { name: 'grass', tile: 1.5, color: 0x7fa35f }, // 植込み
};

import type { PropKind } from '../gen/types';

const PROP_COLOR: Record<'shed' | 'ac' | 'bike', number> = {
  shed: 0x8a8f96, // 物置 (galvanised)
  ac: 0xcfd2d6, // エアコン室外機
  bike: 0x2f3236, // 自転車 (dark)
};

export function propMaterial(kind: PropKind): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: PROP_COLOR[kind as 'shed' | 'ac' | 'bike'] ?? 0x808080,
    roughness: kind === 'ac' ? 0.4 : 0.7,
    metalness: kind === 'bike' ? 0.6 : 0.2,
  });
}

/** 樹冠・低木の葉 — CC0 leafy PBR tiled on the canopy blobs. */
export function foliageMaterial(): THREE.Material {
  return pbr('foliage', 2, { color: 0x9fb87e, roughness: 1 });
}
/** 生垣の葉面 — same leaf PBR but at a box (world-metre) UV scale. */
export function hedgeMaterial(): THREE.Material {
  return pbr('foliage', 1, { color: 0x8faa66, roughness: 1 });
}
/** 幹 — CC0 bark PBR. */
export function trunkMaterial(): THREE.Material {
  return pbr('bark', 1, { roughness: 0.9 });
}
/** アルミ/金属 (支柱・レール・門扉) — CC0 metal PBR. */
export function metalMaterial(): THREE.Material {
  return pbr('metal', 1, { metalness: 1, roughness: 1, metalnessMap: true, normalScale: 0.6 });
}
/** メッシュ/アルミフェンス面 — CC0 fence PBR with an OPACITY map so you see through it.
 *  Three see-through patterns (fence / fence2 / fence3) picked per seed. */
export type FenceMeshTex = 'fence' | 'fence2' | 'fence3';
export function fenceMeshMaterial(name: FenceMeshTex = 'fence'): THREE.Material {
  return pbr(name, 1, {
    metalness: 1, roughness: 1, metalnessMap: true,
    alphaMap: true, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide,
  });
}

export function zoneMaterial(kind: ZoneKind): THREE.Material {
  const z = ZONE_TEX[kind];
  return pbr(z.name, 1 / z.tile, { color: z.color, roughness: 1, side: THREE.DoubleSide });
}

/** Parking bay stripe (thin white). */
export function stripeMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.9, side: THREE.DoubleSide });
}

/** 木塀/板塀の板 — wood CC0 PBR. Two board looks (siding / siding3-planks). */
export type WoodFenceTex = 'siding' | 'siding3';
export function woodFenceMaterial(name: WoodFenceTex = 'siding', color = 0x8a6b47): THREE.Material {
  return pbr(name, 1, { color, roughness: 0.8 });
}

/** 塀の面材 (masonry). ブロック塀 / レンガ塀 / 石積み塀 — CC0 PBR, world-metre UV.
 *  Body boxes are UV-baked in site.ts (planarBoxUV), so texture.repeat = 1 here. */
export type BlockVariant = 'concrete' | 'concrete2' | 'brick' | 'brick2' | 'stone' | 'stone2';
const BLOCK_SPEC: Record<BlockVariant, { tex: string; color: number }> = {
  concrete: { tex: 'concrete', color: 0xcac3b4 },
  concrete2: { tex: 'concrete2', color: 0xc4beb2 },
  brick: { tex: 'brick', color: 0xa9836c },
  brick2: { tex: 'brick2', color: 0x9c7561 },
  stone: { tex: 'stone', color: 0xd7cfc0 },
  stone2: { tex: 'stone2', color: 0xc6bdae },
};
export function blockFenceMaterial(v: BlockVariant = 'concrete', color?: number): THREE.Material {
  const s = BLOCK_SPEC[v] ?? BLOCK_SPEC.concrete;
  return pbr(s.tex, 1, { color: color ?? s.color, roughness: 0.95 });
}
/** 笠木 / コンクリート天端・門柱 — plain smooth concrete cap (no texture stretch). */
export function capMaterial(color = 0xbfb9ac): THREE.Material {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
}

export function fenceMaterial(kind: 'solid' | 'gate', solidColor = 0xcac3b4): THREE.Material {
  return kind === 'gate'
    ? metalMaterial() // 門扉(金属)
    : pbr('concrete', 0.5, { color: solidColor, roughness: 0.95 }); // ブロック塀
}

/** Lot boundary outline. */
export function lotLineMaterial(): THREE.Material {
  return new THREE.LineBasicMaterial({ color: 0x9aa0a8 });
}
