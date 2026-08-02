import * as THREE from 'three';
import { pbr } from '../../viewer/textures';

const cache = new Map<string, THREE.Material>();
const memo = <T extends THREE.Material>(key: string, make: () => T): T => {
  const hit = cache.get(key); if (hit) return hit as T;
  const value = make(); cache.set(key, value); return value;
};
const std = (key: string, p: THREE.MeshStandardMaterialParameters) => memo(key, () => new THREE.MeshStandardMaterial(p));

export const factoryCladdingMaterial = (weathering: number) => memo(`cladding:${Math.round(weathering * 4)}`, () => pbr('ribbed', 1, {
  color: weathering > 0.72 ? 0xb3b7b7 : weathering > 0.42 ? 0xd0d4d4 : 0xf1f3f3,
  roughness: 0.55 + weathering * 0.32, metalness: 1, metalnessMap: true, normalScale: 1.35,
}));
export const cleanCladdingMaterial = () => std('cladding:clean', { color: 0xcfd3d4, roughness: 0.52, metalness: 0.78, envMapIntensity: 0.9 });
export const shutterMaterial = () => memo('shutter', () => pbr('ribbed', 1, { color: 0xb9bdbe, roughness: 0.48, metalness: 1, metalnessMap: true, normalScale: 1.4 }));
export const roofSheetMaterial = () => memo('roof', () => pbr('metal', 1, { color: 0x4c5659, roughness: 0.72, metalness: 1, metalnessMap: true, normalScale: 0.75, side: THREE.DoubleSide }));
export const concreteMaterial = () => memo('concrete', () => pbr('concrete2', 0.5, { color: 0xb5b2aa, roughness: 1, normalScale: 0.75 }));
export const asphaltMaterial = () => memo('asphalt', () => pbr('asphalt', 0.25, { color: 0x777a7a, roughness: 1, normalScale: 0.7 }));
export const steelMaterial = () => memo('steel', () => pbr('metal', 1, { color: 0x343b3e, roughness: 0.62, metalness: 1, metalnessMap: true }));
export const paintedSteelMaterial = (c = 0x596164) => std(`painted:${c}`, { color: c, roughness: 0.58, metalness: 0.72, envMapIntensity: 1 });
export const glassMaterial = () => std('glass', { color: 0x17262c, roughness: 0.06, metalness: 0.9, envMapIntensity: 1.5, emissive: 0x071015, emissiveIntensity: 0.7 });
export const interiorMaterial = () => std('interior', { color: 0x202523, roughness: 0.92 });
export const warmLightMaterial = () => std('light', { color: 0xfff4d5, roughness: 0.25, emissive: 0xffd98e, emissiveIntensity: 2.2 });
export const safetyMaterial = () => std('safety', { color: 0xe4a91e, roughness: 0.55, metalness: 0.45 });
export const rubberMaterial = () => std('rubber', { color: 0x17191a, roughness: 0.88 });
export const whitePaintMaterial = () => std('white', { color: 0xe5e4df, roughness: 0.5, metalness: 0.22 });
export const redPaintMaterial = () => std('red', { color: 0x9d2e28, roughness: 0.46, metalness: 0.42 });
export const timberMaterial = () => memo('timber', () => pbr('siding3', 1, { color: 0x8b6b44, roughness: 0.9 }));
export const fenceMaterial = () => memo('fence', () => pbr('fence2', 1, { color: 0x7e8585, roughness: 0.82, metalness: 1, metalnessMap: true, alphaMap: true, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
