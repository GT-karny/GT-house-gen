import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CrossingDevice } from '../env/railway';

const ASSET_URL = 'models/jp_crossing_equipment.glb';
// The authored pole is the 4.27 m SC-4 assembly. Runtime scaling starts from
// this real product length rather than from a rounded modelling dimension.
const BASE_ARM_LENGTH = 4.27;
// GateArmMesh is authored 0.34 m off the GateMachine origin in local Z. After
// near/far gates are rotated in opposite directions this becomes a +/-X shift.
// Move the machine root oppositely so all opposing arm centre-lines coincide.
const AUTHORED_ARM_LATERAL_OFFSET = 0.34;
let templatePromise: Promise<THREE.Group> | null = null;

function loadTemplate(): Promise<THREE.Group> {
  templatePromise ??= new Promise((resolve, reject) => {
    new GLTFLoader().load(ASSET_URL, (gltf) => resolve(gltf.scene), undefined, reject);
  });
  return templatePromise;
}

function cloneRoot(template: THREE.Group, name: string): THREE.Object3D {
  const source = template.getObjectByName(name);
  if (!source) throw new Error(`Crossing GLB is missing node: ${name}`);
  const clone = source.clone(true);
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  clone.scale.set(1, 1, 1);
  clone.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Each generated crossing owns its resources, so normal disposal remains safe.
    mesh.geometry = mesh.geometry.clone();
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => material.clone())
      : mesh.material.clone();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return clone;
}

function emissiveMaterial(mesh: THREE.Mesh, intensity: number) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    material.emissive.set(0xff1308);
    material.emissiveIntensity = intensity;
  }
}

function configureWarning(root: THREE.Object3D, active: boolean) {
  const upper: THREE.Mesh[] = [];
  const lower: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    if (object.name.startsWith('Warning_DirectionArrow_')) {
      emissiveMaterial(mesh, active ? 2.6 : 0.04);
      return;
    }
    if (!object.name.startsWith('Warning_LED')) return;
    emissiveMaterial(mesh, active ? 3.6 : 0.08);
    (mesh.position.y > 3.2 ? upper : lower).push(mesh);
  });
  if (!active || upper.length === 0) return;
  const driver = upper[0];
  driver.onBeforeRender = () => {
    const upperLit = Math.floor(performance.now() / 430) % 2 === 0;
    for (const mesh of upper) mesh.visible = upperLit;
    for (const mesh of lower) mesh.visible = !upperLit;
  };
}

function configureGate(root: THREE.Object3D, device: CrossingDevice) {
  const pivot = root.getObjectByName('GateArmPivot');
  const armMesh = root.getObjectByName('GateArmMesh');
  if (!pivot || !armMesh) throw new Error('Crossing GLB gate nodes are incomplete');
  armMesh.scale.x = device.armLength / BASE_ARM_LENGTH;
  const raised = THREE.MathUtils.degToRad(72);
  const from = device.barrierClosed ? raised : 0;
  const to = device.barrierClosed ? 0 : raised;
  pivot.rotation.z = from;
  const driver = armMesh.getObjectByProperty('type', 'Mesh') as THREE.Mesh | undefined;
  if (!driver) return;
  const start = performance.now();
  driver.onBeforeRender = () => {
    const duration = device.barrierClosed ? 6000 : 4800;
    const t = Math.min(1, (performance.now() - start) / duration);
    const eased = t * t * (3 - 2 * t);
    pivot.rotation.z = THREE.MathUtils.lerp(from, to, eased);
  };
}

/** The authored gate arm extends along local +X. Rotate it so the arm points
 *  from either roadside foundation into the carriageway. This must follow the
 *  near/far road side, not the device's west/east placement: split-entry-exit
 *  layouts contain two gates on the same west/east side with opposite arms. */
export function gateYawForDevice(device: Pick<CrossingDevice, 'armDirY'>): number {
  return device.armDirY < 0 ? -Math.PI / 2 : Math.PI / 2;
}

export function gatePlacementForDevice(device: Pick<CrossingDevice, 'armDirY' | 'gateCenter'>): {
  x: number;
  z: number;
  yaw: number;
} {
  const yaw = gateYawForDevice(device);
  return {
    x: device.gateCenter.x - Math.sin(yaw) * AUTHORED_ARM_LATERAL_OFFSET,
    z: -device.gateCenter.y,
    yaw,
  };
}

/** Replace procedural fallback devices with authored Blender equipment when loaded. */
export function upgradeCrossingEquipment(
  parent: THREE.Group,
  devices: readonly CrossingDevice[],
  fallbacks: readonly THREE.Group[],
) {
  if (typeof document === 'undefined') return;
  void loadTemplate().then((template) => {
    if (parent.userData.disposed) return;
    devices.forEach((device, index) => {
      const faceDirX = device.center.x < device.gateCenter.x ? -1 : 1;
      const yaw = faceDirX > 0 ? Math.PI / 2 : -Math.PI / 2;
      const dirZ = -device.armDirY;

      const replacements: THREE.Object3D[] = [];
      if (device.hasWarning) {
        const warning = cloneRoot(template, 'WarningAssembly');
        warning.name = 'blender-warning-assembly';
        warning.position.set(device.center.x, 0, -device.center.y);
        warning.rotation.y = yaw;
        configureWarning(warning, device.warningActive);
        replacements.push(warning);

        const emergency = cloneRoot(template, 'EmergencyButton');
        emergency.name = 'blender-emergency-button';
        emergency.position.set(device.center.x, 0, -device.center.y - dirZ * 0.62);
        emergency.rotation.y = yaw;
        replacements.push(emergency);
      }
      if (device.hasGate) {
        const gate = cloneRoot(template, 'GateMachine');
        const placement = gatePlacementForDevice(device);
        gate.name = 'blender-gate-machine';
        gate.position.set(placement.x, 0, placement.z);
        gate.rotation.y = placement.yaw;
        configureGate(gate, device);
        replacements.push(gate);
      }

      fallbacks[index].visible = false;
      parent.add(...replacements);
    });
  }).catch((error) => {
    console.warn('Blender crossing equipment failed to load; keeping procedural fallback.', error);
  });
}
