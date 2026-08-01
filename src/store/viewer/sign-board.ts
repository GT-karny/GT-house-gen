import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { signBoxMaterial } from './materials';

/**
 * Physical sign cabinet with separate, correctly UV'd display faces.
 * Local axes: +x = sign width, +y = up, +z = front/readable face.
 */
export function signBoard(
  width: number,
  height: number,
  depth: number,
  faceMaterial: THREE.Material,
  options: { doubleSided?: boolean; frame?: number; casingColor?: number; radius?: number } = {},
): THREE.Group {
  const g = new THREE.Group();
  const frame = Math.min(options.frame ?? 0.07, width * 0.08, height * 0.08);
  const radius = Math.min(options.radius ?? 0, width * 0.2, height * 0.2, depth * 0.45);
  const casing = new THREE.Mesh(
    radius > 0
      ? new RoundedBoxGeometry(width, height, depth, 3, radius)
      : new THREE.BoxGeometry(width, height, depth),
    signBoxMaterial(options.casingColor ?? 0x252a30),
  );
  casing.castShadow = true;
  g.add(casing);

  const fw = Math.max(0.05, width - frame * 2);
  const fh = Math.max(0.05, height - frame * 2);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), faceMaterial);
  front.position.z = depth / 2 + 0.006;
  g.add(front);

  if (options.doubleSided !== false) {
    const back = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), faceMaterial);
    back.rotation.y = Math.PI;
    back.position.z = -depth / 2 - 0.006;
    g.add(back);
  }
  return g;
}
