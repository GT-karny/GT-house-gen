// ============================================================================
// Site rendering — the ground zones (parking / approach / garden / yard), the
// perimeter fence (solid 塀 + 門扉, open driveway mouth left as a gap), and the
// lot boundary outline. Pure Three.js; consumes the gen-side SitePlan.
// ============================================================================

import * as THREE from 'three';
import type { SitePlan, SiteRect, SiteProp, FenceSpan, Vec2 } from '../gen/types';
import type { FenceStyle } from './render';
import { roundedBox } from './modules';
import { zoneMaterial, stripeMaterial, woodFenceMaterial, lotLineMaterial, propMaterial, foliageMaterial, trunkMaterial, carPaintMaterial, glassMaterial, hedgeMaterial, metalMaterial, fenceMeshMaterial, blockFenceMaterial, capMaterial, type FenceMeshTex, type BlockVariant, type WoodFenceTex } from './materials';

/** Per-house fence/塀 render settings (resolved from the seed in main.ts). */
export interface SiteRenderParams {
  color: number; // 塀色
  style: FenceStyle; // ブロック / 木塀 / メッシュ / 生垣
  meshTex: FenceMeshTex; // メッシュ塀の見え方
  block: BlockVariant; // ブロック塀の面材
  wood: WoodFenceTex; // 木塀の板
}

// gen XY (Z up) → three (Y up): same map as render.ts
const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

// draw zones at slightly increasing heights so later ones win the depth test.
const ZONE_Z: Record<SiteRect['kind'], number> = {
  yard: 0.010, planting: 0.016, garden: 0.020, service: 0.024, bike: 0.026, parking: 0.030, approach: 0.038,
};

const DEFAULT_FENCE: SiteRenderParams = { color: 0xcac3b4, style: 'block', meshTex: 'fence', block: 'concrete', wood: 'siding' };

/** Build every site mesh (zones + props + fence + lot outline) for one lot. */
export function siteMeshes(site: SitePlan, fp: SiteRenderParams = DEFAULT_FENCE): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];

  for (const z of site.zones) {
    if (z.ring.length < 3) continue;
    out.push(groundMesh(z.ring, ZONE_Z[z.kind], zoneMaterial(z.kind)));
    if (z.kind === 'parking' && z.ring.length === 4) out.push(...parkingStripes(z.ring, site.cars));
  }

  for (const p of site.props) {
    if (p.kind === 'tree' || p.kind === 'shrub') out.push(plantMesh(p));
    else if (p.kind === 'car') out.push(carMesh(p, site.pad.axisU, site.pad.axisV));
    else out.push(propBox(p, site.pad.axisU, site.pad.axisV));
  }
  if (site.carport) out.push(...carportMeshes(site.carport));

  for (const f of site.fences) {
    if (f.kind === 'open') continue; // driveway mouth: no fence
    if (f.kind === 'gate') { out.push(gateMeshes(f, fp)); continue; } // 門柱 + 門扉(縦格子)
    out.push(...fenceSpanMeshes(f, fp)); // 塀本体は種類で分岐
  }

  out.push(lotOutline(site.lotRing));
  return out;
}

/** A plant: trunk + layered canopy (tree) or a low blob (shrub). */
function plantMesh(p: SiteProp): THREE.Object3D {
  const g = new THREE.Group();
  const base = toThree(p.center.x, p.center.y, 0);
  const r = p.halfU;
  if (p.kind === 'tree') {
    const trunkH = p.h * 0.4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.14, r * 0.18, trunkH, 6), trunkMaterial());
    trunk.position.set(base.x, trunkH / 2, base.z);
    trunk.castShadow = true;
    g.add(trunk);
    const foliage = foliageMaterial();
    for (let i = 0; i < 3; i++) {
      const rr = r * (1 - i * 0.22);
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 0), foliage);
      blob.position.set(base.x, trunkH + p.h * 0.28 + i * r * 0.5, base.z);
      blob.castShadow = true;
      g.add(blob);
    }
  } else {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), foliageMaterial());
    blob.scale.set(1, 0.65, 1);
    blob.position.set(base.x, p.h * 0.5, base.z);
    blob.castShadow = true;
    g.add(blob);
  }
  return g;
}

/** A parked car: painted body + glass cabin + wheels, oriented into the lot frame. */
function carMesh(p: SiteProp, axisU: Vec2, axisV: Vec2): THREE.Object3D {
  const g = new THREE.Group();
  const paint = carPaintMaterial(p.color ?? 0x888888);
  const glass = glassMaterial();
  const tire = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
  const Wd = p.halfU * 2, L = p.halfV * 2;
  const body = new THREE.Mesh(roundedBox(Wd, 0.55, L * 0.98, 1, 0.14), paint); // rounded car body
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(roundedBox(Wd * 0.92, 0.5, L * 0.5, 1, 0.12), glass);
  cabin.position.set(0, 1.02, -L * 0.02); cabin.castShadow = true; g.add(cabin);
  const roof = new THREE.Mesh(roundedBox(Wd * 0.86, 0.08, L * 0.46, 1, 0.04), paint);
  roof.position.set(0, 1.27, -L * 0.02); g.add(roof);
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wheel = new THREE.Mesh(wheelGeo, tire);
    wheel.rotation.z = Math.PI / 2; // spin axis along the car width
    wheel.position.set(sx * (Wd / 2 - 0.02), 0.32, sz * (L * 0.32));
    wheel.castShadow = true; g.add(wheel);
  }
  const xA = new THREE.Vector3(axisU.x, 0, -axisU.y).normalize();
  const zA = new THREE.Vector3(axisV.x, 0, -axisV.y).normalize();
  const m = new THREE.Matrix4().makeBasis(xA, new THREE.Vector3(0, 1, 0), zA);
  m.setPosition(toThree(p.center.x, p.center.y, 0));
  g.applyMatrix4(m);
  return g;
}

/** Carport: アルミ支柱 + 梁/母屋フレーム + 半透明ポリカ屋根 + 雨樋.
 *  Built in a lot-local frame (x along one edge, z along the other) so it
 *  follows a rotated lot. Mid posts appear on long spans. */
function carportMeshes(cp: import('../gen/types').Carport): THREE.Object3D[] {
  const r = cp.ring;
  // corners in Three space (y up); ring is world XY with Three z = -y
  const P = r.map((c) => new THREE.Vector3(c.x, 0, -c.y));
  const dirA = P[1].clone().sub(P[0]); const LA = dirA.length(); dirA.normalize();
  const dirB = P[3].clone().sub(P[0]); const LB = dirB.length(); dirB.normalize();
  const center = P.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / P.length);

  const g = new THREE.Group();
  g.applyMatrix4(new THREE.Matrix4().makeBasis(dirA, new THREE.Vector3(0, 1, 0), dirB));
  g.position.copy(center);

  const alu = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.35, metalness: 0.85, envMapIntensity: 1.1 });
  const poly = new THREE.MeshPhysicalMaterial({ // ポリカ波板 (スモーク)
    color: 0x9fb0bd, roughness: 0.22, metalness: 0, transparent: true, opacity: 0.4,
    transmission: 0.55, thickness: 0.02, ior: 1.4, side: THREE.DoubleSide, envMapIntensity: 1.2, depthWrite: false,
  });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, shadow = true) => {
    const m = new THREE.Mesh(roundedBox(w, h, d), mat); // bevelled aluminium members
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; g.add(m);
  };

  const hx = LA / 2, hz = LB / 2;
  const clearH = cp.height, beamH = 0.16, top = clearH + beamH; // top of frame
  const longAlongX = LA >= LB;

  // --- posts (square aluminium tube), corners + mid post on long spans ------
  for (const px of [-hx, hx]) for (const pz of [-hz, hz]) box(0.11, top, 0.11, px, top / 2, pz, alu);
  if (longAlongX && LA > 5.5) for (const z of [-hz, hz]) box(0.11, top, 0.11, 0, top / 2, z, alu);
  if (!longAlongX && LB > 5.5) for (const x of [-hx, hx]) box(0.11, top, 0.11, x, top / 2, 0, alu);

  // --- perimeter beam frame (梁) at the top -------------------------------
  const by = clearH + beamH / 2;
  box(LA + 0.06, beamH, 0.14, 0, by, hz, alu);
  box(LA + 0.06, beamH, 0.14, 0, by, -hz, alu);
  box(0.14, beamH, LB - 0.28, hx, by, 0, alu);
  box(0.14, beamH, LB - 0.28, -hx, by, 0, alu);

  // --- rafters (母屋) spanning the short direction, spaced along the long ---
  const ry = top + 0.04;
  if (longAlongX) {
    const n = Math.max(2, Math.round(LA / 0.6));
    for (let i = 0; i <= n; i++) box(0.05, 0.09, LB, -hx + (LA * i) / n, ry, 0, alu);
    box(LA, 0.03, LB, 0, ry + 0.07, 0, poly, false); // ポリカ屋根
  } else {
    const n = Math.max(2, Math.round(LB / 0.6));
    for (let i = 0; i <= n; i++) box(LA, 0.09, 0.05, 0, ry, -hz + (LB * i) / n, alu);
    box(LA, 0.03, LB, 0, ry + 0.07, 0, poly, false);
  }

  // --- gutter (雨樋) along one long front edge + downpipe -------------------
  if (longAlongX) box(LA + 0.1, 0.09, 0.09, 0, clearH + beamH - 0.02, hz + 0.08, alu);
  else box(0.09, 0.09, LB + 0.1, hx + 0.08, clearH + beamH - 0.02, 0, alu);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, clearH, 8), alu);
  pipe.position.set(longAlongX ? hx : hx + 0.08, clearH / 2, longAlongX ? hz + 0.08 : hz);
  pipe.castShadow = true; g.add(pipe);

  return [g];
}

/** A utility prop (shed / AC / bike) as an oriented box on the ground. */
function propBox(p: SiteProp, axisU: Vec2, axisV: Vec2): THREE.Mesh {
  const geom = roundedBox(p.halfU * 2, p.h, p.halfV * 2);
  const xA = new THREE.Vector3(axisU.x, 0, -axisU.y).normalize();
  const zA = new THREE.Vector3(axisV.x, 0, -axisV.y).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4().makeBasis(xA, up, zA);
  const c = toThree(p.center.x, p.center.y, 0);
  c.y += p.h / 2;
  m.setPosition(c);
  const mesh = new THREE.Mesh(geom, propMaterial(p.kind));
  mesh.applyMatrix4(m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A simple polygon (world XY, any vertex count, possibly L/U shaped) as a flat
 *  ground patch at height `h`. Triangulated via ShapeGeometry (earcut). */
function groundMesh(ring: Vec2[], h: number, mat: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  ring.forEach((pt, i) => (i === 0 ? shape.moveTo(pt.x, pt.y) : shape.lineTo(pt.x, pt.y)));
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2); // gen XY → ground XZ (y → -z), matches toThree
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = h;
  mesh.receiveShadow = true;
  return mesh;
}

/** A flat rectangle (4 corners, world XY) rendered horizontally at height `h`. */
function flatQuad(ring: Vec2[], h: number, mat: THREE.Material): THREE.Mesh {
  const [p0, p1, p2, p3] = ring.map((p) => toThree(p.x, p.y, h));
  const pos = [
    p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z,
    p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z,
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** White bay-divider stripes across the parking rect (perpendicular to the road). */
function parkingStripes(ring: Vec2[], cars: number): THREE.Mesh[] {
  if (cars < 2) return [];
  const [a, b, c] = ring; // a=front-left, b=front-right, c=back-right (per site.rect order)
  const out: THREE.Mesh[] = [];
  for (let i = 1; i < cars; i++) {
    const t = i / cars;
    const f = lerp2(a, b, t); // front point of the divider
    const back = lerp2(f, addv(f, subv(c, b)), 1); // slide to the back edge
    out.push(stripe(f, back, 0.08));
  }
  return out;
}

const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const addv = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const subv = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

/** A thin flat stripe from a→b (world XY) at parking height. */
function stripe(a: Vec2, b: Vec2, width: number): THREE.Mesh {
  const dir = subv(b, a);
  const len = Math.hypot(dir.x, dir.y) || 1;
  const n = { x: (-dir.y / len) * (width / 2), y: (dir.x / len) * (width / 2) };
  const ring = [addv(a, n), subv(a, n), subv(b, n), addv(b, n)];
  return flatQuad(ring, ZONE_Z.parking + 0.004, stripeMaterial());
}

/** Orient local-space parts (x = along span, y = up from ground, z = outward) onto a fence span. */
function onSpan(f: FenceSpan, build: (g: THREE.Group, L: number) => void): THREE.Group {
  const a = toThree(f.a.x, f.a.y, 0), b = toThree(f.b.x, f.b.y, 0);
  const along = new THREE.Vector3().subVectors(b, a);
  const L = along.length() || 1;
  const xA = along.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const zA = new THREE.Vector3().crossVectors(xA, up).normalize();
  const g = new THREE.Group();
  build(g, L);
  const m = new THREE.Matrix4().makeBasis(xA, up, zA);
  m.setPosition(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return g;
}

/** A world-scale-UV box (so tiled PBR maps aren't stretched by the box size). */
function uvBox(w: number, h: number, d: number, tile = 1): THREE.BufferGeometry {
  return roundedBox(w, h, d, tile); // bevelled edges (塀・門柱・カーポート等) + world-scale UVs
}

/** A solid perimeter run rendered per fence style (block / wood / mesh / hedge). */
function fenceSpanMeshes(f: FenceSpan, fp: SiteRenderParams): THREE.Object3D[] {
  const h = f.height;
  const { style, color } = fp;

  if (style === 'block') return [onSpan(f, (g, L) => { // ブロック塀 (笠木 + 化粧柱)
    const bodyH = h - 0.06, t = 0.14;
    const body = new THREE.Mesh(uvBox(L, bodyH, t, 0.6), blockFenceMaterial(fp.block, color));
    body.position.y = bodyH / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
    const cap = new THREE.Mesh(uvBox(L + 0.04, 0.08, t + 0.06), capMaterial()); // 笠木
    cap.position.y = bodyH + 0.04; cap.castShadow = true; g.add(cap);
    for (const sx of [-1, 1]) { // 化粧柱 at each end (doubles into one at corners)
      const pillarH = h + 0.1;
      const post = new THREE.Mesh(uvBox(0.22, pillarH, t + 0.06, 0.6), blockFenceMaterial(fp.block, color));
      post.position.set(sx * (L / 2 - 0.11), pillarH / 2, 0); post.castShadow = true; g.add(post);
      const pc = new THREE.Mesh(uvBox(0.28, 0.07, t + 0.12), capMaterial());
      pc.position.set(sx * (L / 2 - 0.11), pillarH + 0.035, 0); g.add(pc);
    }
  })];

  if (style === 'hedge') return [onSpan(f, (g, L) => { // 生垣 (CC0 leaf PBR)
    const hh = h * 0.95;
    const hedge = new THREE.Mesh(uvBox(L, hh, 0.5, 0.6), hedgeMaterial());
    hedge.position.y = hh / 2; hedge.castShadow = true; hedge.receiveShadow = true; g.add(hedge);
  })];

  if (style === 'wood') return [onSpan(f, (g, L) => { // 木塀 / 板塀 (笠木付き)
    const slat = woodFenceMaterial(fp.wood);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.8 });
    const bays = Math.max(1, Math.round(L / 1.8)); // 支柱は約1.8m間隔
    for (let i = 0; i <= bays; i++) {
      const x = -L / 2 + 0.045 + (L - 0.09) * (i / bays);
      const p = new THREE.Mesh(uvBox(0.09, h, 0.12), postMat);
      p.position.set(x, h / 2, 0); p.castShadow = true; g.add(p);
      const cap = new THREE.Mesh(roundedBox(0.13, 0.05, 0.16), postMat); // 柱キャップ
      cap.position.set(x, h + 0.02, 0); g.add(cap);
    }
    const slatH = 0.16, gap = 0.06;
    const slatGeo = uvBox(L - 0.1, slatH, 0.04); // wood grain at real scale along the board
    for (let y = 0.1; y + slatH < h - 0.08; y += slatH + gap) {
      const s = new THREE.Mesh(slatGeo, slat);
      s.position.set(0, y + slatH / 2, 0.03); s.castShadow = true; g.add(s);
    }
    const rail = new THREE.Mesh(uvBox(L - 0.05, 0.08, 0.09), slat); // 天端の笠木レール
    rail.position.set(0, h - 0.05, 0.01); rail.castShadow = true; g.add(rail);
  })];

  return [onSpan(f, (g, L) => { // メッシュ / アルミフェンス (CC0 metal + alpha fence)
    const metal = metalMaterial();
    const bays = Math.max(1, Math.round(L / 2.0)); // 支柱は約2m間隔
    for (let i = 0; i <= bays; i++) {
      const x = -L / 2 + 0.03 + (L - 0.06) * (i / bays);
      const p = new THREE.Mesh(uvBox(0.06, h, 0.06), metal);
      p.position.set(x, h / 2, 0); p.castShadow = true; g.add(p);
    }
    for (const yy of [0.06, h - 0.06]) {
      const r = new THREE.Mesh(uvBox(L, 0.05, 0.05), metal);
      r.position.set(0, yy, 0); g.add(r);
    }
    const panel = new THREE.Mesh(uvBox(L - 0.06, h - 0.14, 0.02, 1.2), fenceMeshMaterial(fp.meshTex));
    panel.position.y = h / 2; g.add(panel); // see-through via opacity map
  })];
}

/** 門扉: two 門柱 posts flanking a metal gate with vertical 縦格子 pickets. */
function gateMeshes(f: FenceSpan, fp: SiteRenderParams): THREE.Group {
  return onSpan(f, (g, L) => {
    const metal = metalMaterial();
    const postW = 0.2, postH = f.height + 0.25;
    // 門柱 (masonry pillars) at both sides of the opening
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(uvBox(postW, postH, postW, 0.6), blockFenceMaterial(fp.block, fp.color));
      post.position.set(sx * (L / 2 - postW / 2), postH / 2, 0); post.castShadow = true; g.add(post);
      const cap = new THREE.Mesh(uvBox(postW + 0.06, 0.06, postW + 0.06), capMaterial());
      cap.position.set(sx * (L / 2 - postW / 2), postH + 0.03, 0); g.add(cap);
    }
    // gate leaf(s) between the posts — a framed grid of vertical pickets
    const clear = L - postW * 2;
    if (clear < 0.3) return;
    const gh = f.height * 0.86, gy = gh / 2 + 0.05;
    const half = clear / 2; // two swing leaves meeting at the centre
    for (const side of [-1, 1]) {
      const cx = side * clear / 4;
      for (const yy of [gy + gh / 2 - 0.03, gy - gh / 2 + 0.03]) { // top & bottom rails
        const r = new THREE.Mesh(roundedBox(half - 0.04, 0.05, 0.04), metal);
        r.position.set(cx, yy, 0.02); r.castShadow = true; g.add(r);
      }
      const n = Math.max(3, Math.round((half - 0.06) / 0.11)); // 縦格子
      for (let i = 0; i < n; i++) {
        const px = cx - (half - 0.08) / 2 + ((half - 0.08) * i) / (n - 1);
        const bar = new THREE.Mesh(roundedBox(0.025, gh - 0.06, 0.025), metal);
        bar.position.set(px, gy, 0.02); bar.castShadow = true; g.add(bar);
      }
      const handle = new THREE.Mesh(roundedBox(0.03, 0.18, 0.05), metal); // latch bar at the meeting stile
      handle.position.set(side * 0.05, gy, 0.06); g.add(handle);
    }
  });
}

/** Lot boundary as a thin line loop just above the ground. */
function lotOutline(ring: Vec2[]): THREE.LineLoop {
  const pts = ring.map((p) => toThree(p.x, p.y, 0.05));
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.LineLoop(geom, lotLineMaterial());
}
