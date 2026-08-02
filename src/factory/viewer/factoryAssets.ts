import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FactoryProp } from '../gen/types';

const URL = '/models/factory/jp_factory_parts.glb';
const NODE: Partial<Record<FactoryProp['kind'], string>> = {
  lift: 'SM_Factory_TwoPostLift', 'tire-rack': 'SM_Factory_TireRack',
  'oil-drum': 'SM_Factory_OilDrum', bollard: 'SM_Factory_Bollard',
};
let templatePromise: Promise<THREE.Group> | null = null;
function load() { templatePromise ??= new Promise((resolve, reject) => new GLTFLoader().load(URL, (g) => resolve(g.scene), undefined, reject)); return templatePromise; }

function cloneAsset(source: THREE.Object3D) {
  const clone = source.clone(true); clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0); clone.scale.set(1, 1, 1);
  clone.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.geometry = m.geometry.clone(); m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone(); m.castShadow = true; m.receiveShadow = true; });
  return clone;
}

export function upgradeFactoryAssets(parent: THREE.Group, props: readonly FactoryProp[], fallbacks: ReadonlyMap<number, THREE.Group>) {
  if (typeof document === 'undefined') return;
  void load().then((template) => {
    if (parent.userData.disposed) return;
    props.forEach((p, index) => {
      const nodeName = NODE[p.kind]; if (!nodeName) return;
      const source = template.getObjectByName(nodeName); if (!source) return;
      const asset = cloneAsset(source); asset.name = `blender-${p.kind}`;
      asset.position.set(p.x, p.z, -p.y); asset.rotation.y = -THREE.MathUtils.degToRad(p.yawDeg); asset.scale.setScalar(p.scale);
      const fallback = fallbacks.get(index); if (fallback) fallback.visible = false;
      parent.add(asset);
    });
  }).catch((error) => console.warn('Factory Blender assets failed to load; keeping procedural fallbacks.', error));
}
