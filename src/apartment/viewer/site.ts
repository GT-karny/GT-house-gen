// ============================================================================
// 集合住宅 敷地描画(M1 簡易)— 地面ゾーン、駐車マス(区画線 + 駐車車両 + 車いす用)、
// 駐輪ラック / ゴミ置場 / 集合郵便受け / ベンチ / 植栽 / ポール灯、外周フェンス、敷地外形。
// 純 AptSitePlan を消費。駐車マス描画は store と同型(store の ParkingField を再利用)。
// ============================================================================

import * as THREE from 'three';
import type { AptSitePlan, AptSiteRect, AptProp, FenceSpan, Vec2, AptZoneKind } from '../gen/types';
import type { ParkingStall } from '../gen/types';
import {
  zoneMaterial, stripeMaterial, carPaintMaterial, carGlassMaterial, tireMaterial,
  poleMaterial, metalMaterial, lampMaterial, foliageMaterial, trunkMaterial, curbMaterial,
  propMaterial, accentMaterial, shelterRoofMaterial,
} from './materials';
import { accessibleMaterial } from '../../store/viewer/materials';

const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

const ZONE_Z: Record<AptZoneKind, number> = {
  leftover: 0.005, landscape: 0.02, bike: 0.024, refuse: 0.026,
  parking: 0.03, aisle: 0.028, drive: 0.032, plaza: 0.04, approach: 0.04, pad: 0.05,
};

function orient(mesh: THREE.Object3D, cx: number, cy: number, z: number, uDir: Vec2) {
  const up = new THREE.Vector3(0, 1, 0);
  const xA = new THREE.Vector3(uDir.x, 0, -uDir.y).normalize();
  const zA = new THREE.Vector3().crossVectors(xA, up).normalize();
  const m = new THREE.Matrix4().makeBasis(xA, up, zA);
  m.setPosition(toThree(cx, cy, z));
  mesh.applyMatrix4(m);
}

/** yawDeg(+Z 周り、world XY)→ 単位方向ベクトル。prop 個別の向きに使う。 */
const dirYaw = (yawDeg: number): Vec2 => ({ x: Math.cos((yawDeg * Math.PI) / 180), y: Math.sin((yawDeg * Math.PI) / 180) });

export function aptSiteMeshes(site: AptSitePlan): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const axisU = site.pad.axisU, axisV = site.pad.axisV;
  for (const z of site.zones) out.push(groundMesh(z));
  for (const s of site.parking.stalls) stallMeshes(s).forEach((m) => out.push(m));
  for (const p of site.props) out.push(propMesh(p, axisU, axisV));
  for (const f of site.fences) { const m = fenceMesh(f); if (m) out.push(m); }
  out.push(lotOutline(site.lotRing));
  return out;
}

function groundMesh(z: AptSiteRect): THREE.Mesh {
  const shape = new THREE.Shape();
  z.ring.forEach((pt, i) => (i === 0 ? shape.moveTo(pt.x, pt.y) : shape.lineTo(pt.x, pt.y)));
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geom, zoneMaterial(z.kind));
  mesh.position.y = ZONE_Z[z.kind];
  mesh.receiveShadow = true;
  return mesh;
}

function stallMeshes(s: ParkingStall): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const yaw = (s.yawDeg * Math.PI) / 180;
  const vDir = { x: Math.cos(yaw), y: Math.sin(yaw) };
  const uDir = { x: vDir.y, y: -vDir.x };
  const edgeX = s.center.x - uDir.x * s.halfU, edgeY = s.center.y - uDir.y * s.halfU;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(s.halfV * 2 * 0.92, 0.02, 0.12), stripeMaterial());
  orient(stripe, edgeX, edgeY, 0.05, vDir);
  out.push(stripe);
  if (s.accessible) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(s.halfU * 2 * 0.9, 0.02, s.halfV * 2 * 0.9), accessibleMaterial());
    orient(pad, s.center.x, s.center.y, 0.045, uDir);
    out.push(pad);
  } else if (s.occupied) {
    out.push(carMesh(s.center.x, s.center.y, vDir, s.color ?? 0x888888));
  }
  return out;
}

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

function propMesh(p: AptProp, axisU: Vec2, axisV: Vec2): THREE.Object3D {
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
    lamp.position.set(base.x, p.h - 0.18, base.z); g.add(lamp);
    return g;
  }
  if (p.kind === 'bikeshelter') return bikeShelterMesh(p);
  if (p.kind === 'bikerack') {
    // ラック床 + 数本の車輪ガイド(簡易)。向きは prop 個別(駐輪ストリップ沿い)。
    const uDir = p.yawDeg !== undefined ? dirYaw(p.yawDeg) : axisU;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(p.halfU * 2, 0.06, p.halfV * 2), propMaterial(0x9aa0a6));
    orient(pad, p.center.x, p.center.y, 0.03, uDir);
    g.add(pad);
    const nBars = Math.max(2, Math.round(p.halfU * 2 / 0.5));
    for (let i = 0; i < nBars; i++) {
      const off = -p.halfU + (p.halfU * 2 * (i + 0.5)) / nBars;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, p.halfV * 1.4), metalMaterial());
      const cx = p.center.x + uDir.x * off, cy = p.center.y + uDir.y * off;
      orient(bar, cx, cy, 0.25, uDir);
      g.add(bar);
    }
    return g;
  }
  // 箱もの: refuse / mailbox / bench / transformer / watertank。向きは prop 個別(無指定は pad.axisU)。
  const uDir = p.yawDeg !== undefined ? dirYaw(p.yawDeg) : axisU;
  const color = p.kind === 'refuse' ? 0x6f7378 : p.kind === 'mailbox' ? 0x4a5560 : p.kind === 'bench' ? 0x8a7a5a : 0x9aa0a6;
  const mat = p.kind === 'mailbox' ? accentMaterial(color) : propMaterial(color);
  const box = new THREE.Mesh(new THREE.BoxGeometry(p.halfU * 2, p.h, p.halfV * 2), mat);
  orient(box, p.center.x, p.center.y, p.h / 2, uDir);
  box.castShadow = true; box.receiveShadow = true;
  void axisV;
  return box;
}

/** 駐輪場の屋根(サイクルポート): 鉄骨角柱 + 長さ方向の桁 + 片流れのポリカ屋根。
 *  幅(halfU)方向に緩勾配で流し、長さ(halfV)方向に一定ピッチで支柱を建てる。半透明ポリカ板。
 *  向きは prop 個別(yawDeg=長さ方向)。駐輪ストリップが建物軸と異なる region でも正しく向く。 */
function bikeShelterMesh(p: AptProp): THREE.Object3D {
  const g = new THREE.Group();
  const hu = p.halfU, hv = p.halfV;
  const eaveLow = Math.max(2.0, p.h - 0.05); // 水下(低い)側
  const rise = Math.min(0.7, Math.max(0.35, hu * 0.22)); // 幅に応じた片流れの立ち上がり
  const eaveHigh = eaveLow + rise; // 水上(高い)側
  const lenDir = dirYaw(p.yawDeg ?? 0);            // 長さ(棟)方向 = halfV
  const widDir = { x: lenDir.y, y: -lenDir.x };    // 幅(勾配)方向 = halfU
  const uDir3 = new THREE.Vector3(widDir.x, 0, -widDir.y).normalize(); // 幅方向(勾配)
  const vDir3 = new THREE.Vector3(lenDir.x, 0, -lenDir.y).normalize(); // 長さ方向(ストリップ沿い)
  const up = new THREE.Vector3(0, 1, 0);
  const c = toThree(p.center.x, p.center.y, 0);
  const sec = 0.09;

  // 支柱: 左右(±hu)× 長さ方向に一定ピッチ。水下側=eaveLow / 水上側=eaveHigh。
  const nPost = Math.max(2, Math.round((hv * 2) / 3.2) + 1);
  for (let s = -1; s <= 1; s += 2) {
    const uOff = (hu - 0.12) * s;
    const eave = s < 0 ? eaveLow : eaveHigh;
    for (let i = 0; i < nPost; i++) {
      const t = nPost === 1 ? 0.5 : i / (nPost - 1);
      const vOff = -hv + 0.15 + (hv * 2 - 0.3) * t;
      const post = new THREE.Mesh(new THREE.BoxGeometry(sec, eave, sec), poleMaterial());
      post.position.set(c.x + uDir3.x * uOff + vDir3.x * vOff, eave / 2, c.z + uDir3.z * uOff + vDir3.z * vOff);
      post.castShadow = true; g.add(post);
    }
  }
  // 桁(eave beam): 両側に長さ方向の梁。
  for (let s = -1; s <= 1; s += 2) {
    const uOff = (hu - 0.12) * s;
    const eave = s < 0 ? eaveLow : eaveHigh;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, hv * 2 + 0.2), metalMaterial());
    const M = new THREE.Matrix4().makeBasis(uDir3, up, vDir3);
    M.setPosition(new THREE.Vector3(c.x + uDir3.x * uOff, eave - 0.06, c.z + uDir3.z * uOff));
    beam.applyMatrix4(M); beam.castShadow = true; g.add(beam);
  }
  // ポリカ片流れ屋根: vDir3 まわりに傾け、幅方向の勾配に沿わせる(軒の出 0.25)。
  const Lslope = Math.hypot(hu * 2, rise);
  const sDir = uDir3.clone().multiplyScalar((hu * 2) / Lslope).add(up.clone().multiplyScalar(rise / Lslope)).normalize();
  const nrm = new THREE.Vector3().crossVectors(vDir3, sDir).normalize();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(Lslope + 0.5, 0.05, hv * 2 + 0.5), shelterRoofMaterial());
  const Mr = new THREE.Matrix4().makeBasis(sDir, nrm, vDir3);
  Mr.setPosition(new THREE.Vector3(c.x, (eaveLow + eaveHigh) / 2 + 0.05, c.z));
  roof.applyMatrix4(Mr); roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
  return g;
}

function fenceMesh(f: FenceSpan): THREE.Object3D | null {
  if (f.kind === 'open' || f.height <= 0) return null;
  const a = toThree(f.a.x, f.a.y, 0), b = toThree(f.b.x, f.b.y, 0);
  const along = new THREE.Vector3().subVectors(b, a);
  const L = along.length() || 1;
  const t = f.kind === 'hedge' ? 0.6 : f.kind === 'wall' ? 0.2 : 0.08;
  const mat = f.kind === 'hedge' ? foliageMaterial() : curbMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(L, f.height, t), mat);
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
