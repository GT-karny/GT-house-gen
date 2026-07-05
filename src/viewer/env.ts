// ============================================================================
// Streetscape rendering — turns the pure `Streetscape` plan (src/env) into
// Three.js meshes: asphalt carriageway, concrete gutter/sidewalk strips, painted
// road markings, and utility poles. Pure Three.js; consumes only src/env data.
//
// Kept OUT of viewer/site.ts (which draws the per-house 敷地) so the public realm
// and the private lot stay visually and structurally separate — matching the
// gen-side split (src/env vs src/gen). See src/env/streetscape.ts header.
// ============================================================================

import * as THREE from 'three';
import type { Streetscape, EnvMarking, EnvProp, Vec2 } from '../env/streetscape';
import { pbr } from './textures';

// gen XY (Z up) → three (Y up): same map as render.ts / site.ts
const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

// draw heights (three Y). Road sits lowest; concrete strips a hair above so the
// curb reads without a z-fight; markings float just over the asphalt.
const H = { road: 0.008, walk: 0.02, gutter: 0.006, mark: 0.016 };

function roadMaterial(): THREE.Material {
  return pbr('asphalt', 1 / 4, { color: 0x6f7379, roughness: 1, side: THREE.DoubleSide });
}
function walkMaterial(): THREE.Material {
  return pbr('concrete', 1 / 2.5, { color: 0xb7b1a6, roughness: 1, side: THREE.DoubleSide });
}
function gutterMaterial(): THREE.Material {
  return pbr('concrete', 1 / 1.2, { color: 0x8d8880, roughness: 1, side: THREE.DoubleSide });
}
function paintMaterial(color: 'white' | 'yellow'): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: color === 'white' ? 0xdedbd0 : 0xcaa53a, roughness: 0.8, side: THREE.DoubleSide,
  });
}

/** Build every streetscape mesh (zones + markings + gutters + poles). */
export function streetscapeGroup(s: Streetscape): THREE.Group {
  const g = new THREE.Group();

  const roadMat = roadMaterial();
  const walkMat = walkMaterial();
  for (const z of s.zones) {
    if (z.ring.length < 3) continue;
    g.add(groundMesh(z.ring, z.kind === 'road' ? H.road : H.walk, z.kind === 'road' ? roadMat : walkMat));
  }

  const gutMat = gutterMaterial();
  for (const c of s.gutters) g.add(stripMesh(c.a, c.b, c.width, H.gutter, gutMat));

  for (const m of s.markings) markingMeshes(m).forEach((mesh) => g.add(mesh));

  for (const p of s.props) if (p.kind === 'pole') g.add(poleMesh(p));

  return g;
}

/** A polygon (world XY) laid flat at height `h`. Triangulated via ShapeGeometry. */
function groundMesh(ring: Vec2[], h: number, mat: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  ring.forEach((pt, i) => (i === 0 ? shape.moveTo(pt.x, pt.y) : shape.lineTo(pt.x, pt.y)));
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2); // gen XY → ground XZ, matches toThree
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = h;
  mesh.receiveShadow = true;
  return mesh;
}

/** A thin flat band of the given width from a→b (world XY) at height `h`. */
function stripMesh(a: Vec2, b: Vec2, width: number, h: number, mat: THREE.Material): THREE.Mesh {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (width / 2), ny = (dx / len) * (width / 2);
  const ring: Vec2[] = [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
  return groundMesh(ring, h, mat);
}

/** Road paint — one band for a solid line, or a run of dashes. */
function markingMeshes(m: EnvMarking): THREE.Mesh[] {
  const mat = paintMaterial(m.color);
  if (!m.dash) return [stripMesh(m.a, m.b, m.width, H.mark, mat)];
  const dx = m.b.x - m.a.x, dy = m.b.y - m.a.y;
  const total = Math.hypot(dx, dy) || 1;
  const ux = dx / total, uy = dy / total;
  const step = m.dash.on + m.dash.off;
  const out: THREE.Mesh[] = [];
  for (let d = 0; d + m.dash.on <= total; d += step) {
    const a = { x: m.a.x + ux * d, y: m.a.y + uy * d };
    const b = { x: m.a.x + ux * (d + m.dash.on), y: m.a.y + uy * (d + m.dash.on) };
    out.push(stripMesh(a, b, m.width, H.mark, mat));
  }
  return out;
}

/** A 電柱: tapered concrete pole + a crossarm + a small transformer drum. */
function poleMesh(p: EnvProp): THREE.Object3D {
  const g = new THREE.Group();
  const base = toThree(p.center.x, p.center.y, 0);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9c9a95, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3c3d40, roughness: 0.6, metalness: 0.4 });

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, p.h, 10), concrete);
  pole.position.set(base.x, p.h / 2, base.z);
  pole.castShadow = true;
  g.add(pole);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.09), dark);
  arm.position.set(base.x, p.h - 0.6, base.z);
  arm.castShadow = true;
  g.add(arm);
  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.08), dark);
  arm2.position.set(base.x, p.h - 1.05, base.z);
  arm2.castShadow = true;
  g.add(arm2);

  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 10), dark);
  drum.position.set(base.x + 0.28, p.h - 1.7, base.z);
  drum.castShadow = true;
  g.add(drum);

  return g;
}

/** Dispose every geometry under a streetscape group (materials are shared/cached). */
export function disposeStreetscape(group: THREE.Group) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}
