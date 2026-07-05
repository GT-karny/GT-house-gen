// ============================================================================
// 集合住宅 viewer マテリアル(M1 簡易)。地面ゾーン/壁/屋根/金属/植栽は house の
// pbr() パイプライン + store のマテリアルを再利用し、集合住宅固有(手摺ガラス、
// アクセント帯、玄関ドア)だけ追加する。すべてキャッシュ。viewer 層のみ(移植対象外)。
// ============================================================================

import * as THREE from 'three';
import { pbr } from '../../viewer/textures';
import type { AptZoneKind } from '../gen/types';

// store のマテリアル群を流用(壁/金属/ポール/ランプ/植栽/車/縁石/パラペット/屋根 等)
export {
  storeWallMaterial, poleMaterial, lampMaterial, metalMaterial, foliageMaterial, trunkMaterial,
  curbMaterial, carPaintMaterial, carGlassMaterial, tireMaterial, stripeMaterial, propMaterial,
  mullionMaterial, glassMaterial, parapetMaterial, roofMaterial,
} from '../../store/viewer/materials';
export type { StoreWallVariant } from '../../store/viewer/materials';

const cache = new Map<string, THREE.Material>();
function memo<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const m = make();
  cache.set(key, m);
  return m;
}
const std = (key: string, o: THREE.MeshStandardMaterialParameters) =>
  memo(key, () => new THREE.MeshStandardMaterial(o));

// --- 地面ゾーン(AptZoneKind → CC0 texture, tile[m], tint)---------------------
const ZONE_TEX: Record<AptZoneKind, { tex: string; tile: number; color: number; rough: number }> = {
  parking: { tex: 'asphalt', tile: 4.0, color: 0x8a8d93, rough: 1 },
  aisle: { tex: 'asphalt', tile: 4.0, color: 0x7c7f85, rough: 1 },
  drive: { tex: 'asphalt', tile: 4.0, color: 0x828589, rough: 1 },
  approach: { tex: 'concrete', tile: 2.5, color: 0xcfcabf, rough: 0.95 },
  plaza: { tex: 'concrete', tile: 2.5, color: 0xc7c1b4, rough: 0.9 },
  landscape: { tex: 'grass', tile: 3.0, color: 0x93b06f, rough: 1 },
  bike: { tex: 'concrete', tile: 2.0, color: 0xb0ada4, rough: 0.95 },
  refuse: { tex: 'concrete', tile: 2.0, color: 0x9a9890, rough: 1 },
  leftover: { tex: 'asphalt', tile: 4.0, color: 0x82858b, rough: 1 },
  pad: { tex: 'concrete', tile: 3.0, color: 0xb2ada2, rough: 1 },
};
export const zoneMaterial = (k: AptZoneKind) => {
  const z = ZONE_TEX[k];
  return memo(`aptzone:${k}`, () => pbr(z.tex, 1 / z.tile, { color: z.color, roughness: z.rough, side: THREE.DoubleSide }));
};

// --- 集合住宅固有 -----------------------------------------------------------
/** 掃き出し窓/居室窓のガラス — HDRI を拾う反射ガラス。 */
export const windowGlassMaterial = () =>
  std('apt:winglass', { color: 0x1c2a35, roughness: 0.06, metalness: 0.9, envMapIntensity: 1.3, emissive: 0x0a1218, emissiveIntensity: 0.7 });
/** バルコニー手摺のガラスパネル(半透過)。 */
export const railGlassMaterial = () =>
  std('apt:railglass', { color: 0x9fb4c2, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.32, envMapIntensity: 1.2, side: THREE.DoubleSide });
/** 手摺笠木 / 庇 / 帯などのアクセント(seed 色)。 */
export const accentMaterial = (c: number) => std(`apt:accent:${c}`, { color: c, roughness: 0.5, metalness: 0.5, envMapIntensity: 1 });
/** 玄関ドア(共用廊下側)。 */
export const doorMaterial = () => std('apt:door', { color: 0x6b5a48, roughness: 0.6, metalness: 0.2 });
/** メーターボックス扉。 */
export const mbMaterial = () => std('apt:mb', { color: 0xb9bcc0, roughness: 0.5, metalness: 0.7 });
/** 駐輪場屋根(サイクルポート)のポリカ波板 — 半透明の乳白ブルー。 */
export const shelterRoofMaterial = () =>
  std('apt:shelterroof', { color: 0xdce3e8, roughness: 0.32, metalness: 0.0, transparent: true, opacity: 0.5, side: THREE.DoubleSide, envMapIntensity: 1.1 });
