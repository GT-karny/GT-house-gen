// ============================================================================
// Store site rendering (M1, simple) — ground zones, parking stalls (stripes +
// parked cars + accessible pads), freestanding signage, props (light poles /
// trees / carts / truck / flags), perimeter curb, and the lot outline. Consumes
// the pure StoreSitePlan; flat-colored meshes (photoreal PBR is M2).
// ============================================================================

import * as THREE from 'three';
import type { StoreSitePlan, SiteRect, StoreProp, FenceSpan, SignInstance, ParkingStall, Vec2, StoreZoneKind } from '../gen/types';
import {
  zoneMaterial, stripeMaterial, accessibleMaterial, carPaintMaterial, carGlassMaterial, tireMaterial,
  poleMaterial, pylonPoleMaterial, signBoxMaterial, signFaceMaterial, metalMaterial, lampMaterial, foliageMaterial, trunkMaterial, propMaterial, curbMaterial,
} from './materials';
import { signBoard } from './sign-board';

const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

const ZONE_Z: Record<StoreZoneKind, number> = {
  leftover: 0.005, landscape: 0.02, serviceyard: 0.02, 'outdoor-display': 0.024,
  parking: 0.03, aisle: 0.028, drivethrough: 0.03, drive: 0.032, plaza: 0.04, approach: 0.04, pad: 0.05,
};

/** Orient a centered mesh: local +x along `uDir` (world XY), +y up. */
function orient(mesh: THREE.Object3D, cx: number, cy: number, z: number, uDir: Vec2) {
  const up = new THREE.Vector3(0, 1, 0);
  const xA = new THREE.Vector3(uDir.x, 0, -uDir.y).normalize();
  const zA = new THREE.Vector3().crossVectors(xA, up).normalize();
  const m = new THREE.Matrix4().makeBasis(xA, up, zA);
  m.setPosition(toThree(cx, cy, z));
  mesh.applyMatrix4(m);
}

export function storeSiteMeshes(site: StoreSitePlan, _brand: number): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const axisU = site.pad.axisU, axisV = site.pad.axisV;

  for (const z of site.zones) out.push(groundMesh(z));
  for (const s of site.parking.stalls) stallMeshes(s).forEach((m) => out.push(m));
  for (const sg of site.signs) out.push(signMesh(sg));
  for (const p of site.props) out.push(propMesh(p, axisU, axisV));
  for (const f of site.fences) { const m = fenceMesh(f); if (m) out.push(m); }
  out.push(lotOutline(site.lotRing));
  return out;
}

/** A flat ground patch (any vertex count) at a small per-kind height. */
function groundMesh(z: SiteRect): THREE.Mesh {
  const shape = new THREE.Shape();
  z.ring.forEach((pt, i) => (i === 0 ? shape.moveTo(pt.x, pt.y) : shape.lineTo(pt.x, pt.y)));
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2); // gen XY → ground XZ
  const mesh = new THREE.Mesh(geom, zoneMaterial(z.kind));
  mesh.position.y = ZONE_Z[z.kind];
  mesh.receiveShadow = true;
  return mesh;
}

/** One parking stall: a divider stripe, plus an accessible pad or a parked car. */
function stallMeshes(s: ParkingStall): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const yaw = (s.yawDeg * Math.PI) / 180;
  const vDir = { x: Math.cos(yaw), y: Math.sin(yaw) }; // stall length direction (axisV)
  const uDir = { x: vDir.y, y: -vDir.x }; // across (axisU)

  // divider stripe on the −U edge
  const edgeX = s.center.x - uDir.x * s.halfU;
  const edgeY = s.center.y - uDir.y * s.halfU;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(s.halfV * 2 * 0.92, 0.02, 0.12), stripeMaterial());
  orient(stripe, edgeX, edgeY, 0.05, vDir);
  out.push(stripe);

  // wheel stop (輪留め): a low block near the nose end (+V), across the stall
  const wsX = s.center.x + vDir.x * (s.halfV - 0.7);
  const wsY = s.center.y + vDir.y * (s.halfV - 0.7);
  const ws = new THREE.Mesh(new THREE.BoxGeometry(s.halfU * 1.2, 0.12, 0.14), curbMaterial());
  orient(ws, wsX, wsY, 0.06, uDir);
  out.push(ws);

  if (s.accessible) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(s.halfU * 2 * 0.9, 0.02, s.halfV * 2 * 0.9), accessibleMaterial());
    orient(pad, s.center.x, s.center.y, 0.045, uDir);
    out.push(pad);
  } else if (s.occupied) {
    out.push(carMesh(s.center.x, s.center.y, vDir, s.color ?? 0x888888));
  }
  return out;
}

/** A parked car: tapered two-tier body + glasshouse + four tyres, length along vDir. */
function carMesh(cx: number, cy: number, vDir: Vec2, color: number): THREE.Object3D {
  const g = new THREE.Group();
  const paint = carPaintMaterial(color);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.55, 1.82), paint);
  lower.position.y = 0.45; lower.castShadow = true; g.add(lower);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.35, 1.72), paint);
  upper.position.set(-0.1, 0.85, 0); upper.castShadow = true; g.add(upper);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 1.6), carGlassMaterial());
  cabin.position.set(-0.15, 1.25, 0); cabin.castShadow = true; g.add(cabin);
  const tyre = tireMaterial();
  for (const ax of [1.35, -1.35]) for (const az of [0.82, -0.82]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 12), tyre);
    w.rotation.x = Math.PI / 2; w.position.set(ax, 0.34, az); g.add(w);
  }
  orient(g, cx, cy, 0, vDir);
  return g;
}

/** A pylon (pole + brand box) or a drive-through menu board (post + panel). */
function signMesh(s: SignInstance): THREE.Object3D {
  const g = new THREE.Group();
  const yaw = (s.yawDeg * Math.PI) / 180;
  const face = { x: Math.cos(yaw), y: Math.sin(yaw) };
  const tangent = { x: -face.y, y: face.x };
  if (s.kind === 'pylon') {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.4, s.poleH, 0.4), pylonPoleMaterial());
    pole.position.y = s.poleH / 2; pole.castShadow = true; g.add(pole);
    const board = signBoard(s.w, s.h, 0.3, signFaceMaterial(s.color, s.logoId, 'pylon', s.w / s.h), { frame: 0.035 });
    board.position.y = s.poleH + s.h / 2; g.add(board);
    // Older Japanese home centres and roadside shops often light tall pylons
    // externally from a small rail above the cabinet. This also makes the sign
    // read as installed equipment rather than a texture on a box.
    const top = s.poleH + s.h;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(s.w * 0.88, 0.055, 0.055), metalMaterial());
    rail.position.set(0, top + 0.28, 0); g.add(rail);
    const lights = s.w >= 2.8 ? [-0.32, 0, 0.32] : [-0.28, 0.28];
    for (const u of lights) {
      const x = u * s.w;
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.3, 0.045), metalMaterial());
      upright.position.set(x, top + 0.15, 0); g.add(upright);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.34), metalMaterial());
      arm.position.set(x, top + 0.3, 0.14); g.add(arm);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.14), metalMaterial());
      housing.position.set(x, top + 0.25, 0.32); housing.rotation.x = -0.35; g.add(housing);
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.065), lampMaterial());
      lens.position.set(x, top + 0.22, 0.39); lens.rotation.x = -0.35; g.add(lens);
    }
  } else {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, s.poleH + s.h, 0.15), poleMaterial());
    post.position.y = (s.poleH + s.h) / 2; g.add(post);
    const panel = signBoard(s.w, s.h, 0.12, signFaceMaterial(s.color, s.logoId, 'menu', s.w / s.h), { frame: 0.045 });
    panel.position.y = s.poleH + s.h / 2; g.add(panel);
  }
  orient(g, s.pos.x, s.pos.y, s.z, tangent);
  return g;
}

/** A site prop rendered per kind. */
function propMesh(p: StoreProp, axisU: Vec2, axisV: Vec2): THREE.Object3D {
  const g = new THREE.Group();
  const base = toThree(p.center.x, p.center.y, 0);
  if (p.kind === 'tree') {
    const trunkH = p.h * 0.4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, trunkH, 6), trunkMaterial());
    trunk.position.set(base.x, trunkH / 2, base.z); trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const rr = p.halfU * (1 - i * 0.22);
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 0), foliageMaterial());
      blob.position.set(base.x, trunkH + p.h * 0.28 + i * p.halfU * 0.5, base.z); blob.castShadow = true; g.add(blob);
    }
    return g;
  }
  if (p.kind === 'shrub') {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(p.halfU, 0), foliageMaterial());
    blob.scale.set(1, 0.6, 1); blob.position.set(base.x, p.h * 0.5, base.z); blob.castShadow = true; g.add(blob);
    return g;
  }
  if (p.kind === 'lightpole') {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, p.h, 0.18), poleMaterial());
    pole.position.set(base.x, p.h / 2, base.z); pole.castShadow = true; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.5), metalMaterial());
    arm.position.set(base.x, p.h - 0.08, base.z); g.add(arm);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.42), lampMaterial());
    lamp.position.set(base.x, p.h - 0.18, base.z); g.add(lamp); // lit lens (emissive)
    return g;
  }
  if (p.kind === 'floodlight') {
    // eave-mounted flood: housing at mount height p.h (world) with a lit lens below.
    const box = new THREE.Mesh(new THREE.BoxGeometry(p.halfU * 2, 0.2, p.halfV * 2), metalMaterial());
    box.position.set(base.x, p.h, base.z); box.castShadow = true; g.add(box);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(p.halfU * 2 * 0.7, 0.06, p.halfV * 2 * 0.7), lampMaterial());
    lens.position.set(base.x, p.h - 0.12, base.z); g.add(lens);
    return g;
  }
  if (p.kind === 'flag') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, p.h, 6), poleMaterial());
    pole.position.set(base.x, p.h / 2, base.z); g.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.6), signBoxMaterial(p.color ?? 0xcc3333));
    flag.position.set(base.x, p.h - 0.6, base.z + 0.35); g.add(flag);
    return g;
  }
  // boxy props: cart-corral / truck / trash / vending / bike-park / etc.
  const uDir = p.kind === 'truck' ? axisV : axisU;
  const box = new THREE.Mesh(new THREE.BoxGeometry(p.halfU * 2, p.h, p.halfV * 2), propMaterial(propColor(p.kind)));
  orient(box, p.center.x, p.center.y, p.h / 2, uDir);
  box.castShadow = true; box.receiveShadow = true;
  return box;
}

function propColor(kind: StoreProp['kind']): number {
  switch (kind) {
    case 'truck': return 0xdfe2e6;
    case 'cart-corral': return 0x9aa0a6;
    case 'trash': return 0x5a5e64;
    case 'vending': return 0xc0392b;
    default: return 0x8a8f96;
  }
}

/** A perimeter run: a low curb bar or a planting strip (open = skipped). */
function fenceMesh(f: FenceSpan): THREE.Object3D | null {
  if (f.kind === 'open' || f.height <= 0) return null;
  const a = toThree(f.a.x, f.a.y, 0), b = toThree(f.b.x, f.b.y, 0);
  const along = new THREE.Vector3().subVectors(b, a);
  const L = along.length() || 1;
  const geom = new THREE.BoxGeometry(L, f.height, f.kind === 'planting' ? 0.6 : 0.2);
  const mat = f.kind === 'planting' ? foliageMaterial() : curbMaterial();
  const mesh = new THREE.Mesh(geom, mat);
  const xA = along.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const zA = new THREE.Vector3().crossVectors(xA, up).normalize();
  const m = new THREE.Matrix4().makeBasis(xA, up, zA);
  const c = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5); c.y = f.height / 2;
  m.setPosition(c); mesh.applyMatrix4(m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function lotOutline(ring: Vec2[]): THREE.LineLoop {
  const pts = ring.map((p) => toThree(p.x, p.y, 0.06));
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.LineLoop(geom, new THREE.LineBasicMaterial({ color: 0x6a7078 }));
}
