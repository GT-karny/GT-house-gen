import * as THREE from 'three';
import type { BuildingPlan, PanelInstance, SitePlan, Vec2, WindowSize } from '../gen/types';
import type { RoofMass } from '../gen/roof';
import { roofMaterial, slabMaterial, wallMaterial, doorMaterial, type WallVariant, type DoorLeafVariant, type FenceMeshTex, type BlockVariant, type WoodFenceTex } from './materials';
import { makeWindowModule, makeDoorModule, planarBoxUV, roundedBox, WALL_TILE, WALL_THICKNESS, type ModuleMesh, type DoorStyle } from './modules';
import { siteMeshes } from './site';
import { resolveWindowAppearance, windowAppearanceMaterial, type WindowAppearanceKey, type WindowLightingMode } from './windowSurfaces';

// gen uses XY ground plane with +Z up; three uses +Y up. One consistent map:
const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);
const dir3 = (x: number, y: number) => new THREE.Vector3(x, 0, -y).normalize();

const PANEL_THICKNESS = WALL_THICKNESS; // match the opening surrounds → flush joints

export interface RenderParams {
  seed: number;
  windowLighting: WindowLightingMode;
  windowInteriorMapping: boolean;
  panelW: number;
  panelH: number;
  showFootprint: boolean;
  showMasses: boolean;
  doorCanopy: boolean;
  eaveOverhang: number;
  roofType: RoofType;
  ridgeAxis: 'U' | 'V'; // ridge along the long (U) or short (V) axis (gable/mono)
  wallMain: WallVariant; // 外壁(主) — upper floors
  wallBase: WallVariant; // 外壁(腰) — ground floor (two-tone); === wallMain when single-tone
  doorStyle: DoorStyle; // 玄関ドアの形状 (framed / half-glass / flush)
  doorLeaf: DoorLeafVariant; // ドア面材 (wood / painted)
  doorSidelight: boolean; // 袖ガラス
  roofColor: number; // 屋根色 (randomised per seed)
  fenceColor: number; // 塀色 (randomised per seed)
  fenceStyle: FenceStyle;
  fenceMeshTex: FenceMeshTex; // メッシュ塀の見え方 (fence / fence2 / fence3)
  blockVariant: BlockVariant; // ブロック塀の面材 (concrete / brick / stone …)
  woodTex: WoodFenceTex; // 木塀の板 (siding / planks)
  showSite: boolean;
}

/** 屋根形状: 陸屋根 / 切妻 / 寄棟 / 片流れ. */
export type RoofType = 'flat' | 'gable' | 'hip' | 'mono';
/** 外壁の出し方: 白塗り壁 / サイディング / 2トーン(1F石貼り+2F塗り壁). */
export type WallStyle = 'plaster' | 'siding' | 'twotone';
/** 塀の種類: ブロック塀 / 木塀(板塀) / メッシュ(アルミ)フェンス / 生垣. */
export type FenceStyle = 'block' | 'wood' | 'mesh' | 'hedge';

/** Build a fresh group of meshes for one house. Caller disposes the old group. */
export function renderHouse(
  plan: BuildingPlan,
  roofs: RoofMass[],
  p: RenderParams,
  site?: SitePlan
): THREE.Group {
  const g = new THREE.Group();

  // --- site (敷地): ground zones + fence + lot outline, under the house ---
  if (site && p.showSite) {
    const fp = { color: p.fenceColor, style: p.fenceStyle, meshTex: p.fenceMeshTex, block: p.blockVariant, wood: p.woodTex };
    for (const o of siteMeshes(site, fp)) g.add(o);
  }

  // wall material variant per panel — a two-tone house shows a masonry/stone base
  // on the ground floor and the main wall above, like the reference photos.
  const wallVariant = (panel: PanelInstance): WallVariant => (panel.floor === 0 ? p.wallBase : p.wallMain);
  const wv = (s?: string): WallVariant => (s as WallVariant) ?? p.wallMain;

  // --- panels: one InstancedMesh per distinct module key (windows split by size + detailing) ---
  // The wall variant is part of EVERY key (incl. openings) so the surround around
  // a window/door uses the same wall material as the plain wall panels.
  const panelKey = (panel: PanelInstance) =>
    panel.type === 'window'
      ? `window:${panel.size ?? 'medium'}:${panel.grille ? 'g' : ''}${panel.shutter ? 's' : ''}${panel.protrude ? 'p' : ''}:${wallVariant(panel)}:${resolveWindowAppearance(p.windowInteriorMapping, p.windowLighting, p.seed, panel.size ?? 'medium', panel.faceIndex, panel.floor, panel.bay)}`
      : panel.type === 'wall'
        ? `wall:${wallVariant(panel)}`
        : `door:${wallVariant(panel)}:${p.doorStyle}:${p.doorLeaf}:${p.doorSidelight ? 's' : ''}`;

  const byKey = new Map<string, PanelInstance[]>();
  for (const panel of plan.panels) {
    const k = panelKey(panel);
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(panel);
  }

  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  const xAxis = new THREE.Vector3();

  // lazily build one detailed module per key (wall = plain board). NOT bevelled:
  // wall panels tile face-flush, so a bevel opens gaps at joints / building corners.
  const wallGeom = new THREE.BoxGeometry(p.panelW, p.panelH, PANEL_THICKNESS);
  planarBoxUV(wallGeom, p.panelW, p.panelH, PANEL_THICKNESS, WALL_TILE); // match the surround UV scale
  const moduleForKey = (key: string): { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] } => {
    if (key.startsWith('wall')) return { geometry: wallGeom, material: wallMaterial(wv(key.split(':')[1])) };
    if (key.startsWith('door')) {
      const [, variant, style, leaf, side] = key.split(':');
      const d: ModuleMesh = makeDoorModule(
        p.panelW, p.panelH,
        { canopy: p.doorCanopy, style: style as DoorStyle, sidelight: side === 's' },
        wallMaterial(wv(variant)),
        doorMaterial(leaf as DoorLeafVariant),
      );
      return { geometry: d.geometry, material: d.materials };
    }
    const [, size, flags, variant, appearance] = key.split(':');
    const w: ModuleMesh = makeWindowModule(p.panelW, p.panelH, size as WindowSize, {
      grille: flags.includes('g'),
      shutter: flags.includes('s'),
      protrude: flags.includes('p'),
    }, wallMaterial(wv(variant)), windowAppearanceMaterial(appearance as WindowAppearanceKey));
    return { geometry: w.geometry, material: w.materials };
  };

  byKey.forEach((list, key) => {
    if (list.length === 0) return;
    const { geometry: geom, material } = moduleForKey(key);
    const inst = new THREE.InstancedMesh(geom, material, list.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    list.forEach((panel, i) => {
      const zAxis = dir3(Math.cos((panel.yawDeg * Math.PI) / 180), Math.sin((panel.yawDeg * Math.PI) / 180));
      xAxis.crossVectors(up, zAxis).normalize();
      m.makeBasis(xAxis, up, zAxis);
      m.setPosition(toThree(panel.pos.x, panel.pos.y, panel.z));
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    g.add(inst);
  });

  // --- footprint slab (floor) ---
  if (p.showFootprint) {
    g.add(ringMesh(plan.footprintRing, 0.05, slabMaterial()));
  }

  // --- balconies (2F garden 掃き出し窓) ---
  for (const b of plan.balconies) balconyMeshes(b).forEach((mesh) => g.add(mesh));

  // --- roof (per mass, stepped by storey count) ---
  if (p.roofType === 'flat') {
    for (const r of roofs) flatRoofMeshes(r, p.roofColor).forEach((mesh) => g.add(mesh)); // 陸屋根 + パラペット
  } else {
    for (const r of roofs) buildRoof(r, p.roofType, p.ridgeAxis, p.eaveOverhang, p.roofColor, p.wallMain).forEach((mesh) => g.add(mesh));
  }

  return g;
}

const PARAPET_H = 0.45;

/** Flat roof (陸屋根): a slab cap + a low parapet band around the mass top. */
function flatRoofMeshes(r: RoofMass, roofColor = 0x6b6560): THREE.Mesh[] {
  const { obb, eaveZ } = r;
  const U = obb.axisU, V = obb.axisV, c = obb.center;
  const gp = (u: number, w: number, z: number) => toThree(c.x + U.x * u + V.x * w, c.y + U.y * u + V.y * w, z);
  const out: THREE.Mesh[] = [];

  // slab cap
  out.push(quadMesh([
    gp(+obb.halfU, +obb.halfV, eaveZ), gp(+obb.halfU, -obb.halfV, eaveZ),
    gp(-obb.halfU, -obb.halfV, eaveZ), gp(-obb.halfU, +obb.halfV, eaveZ),
  ], roofMaterial(roofColor), ROOF_TILE));

  // parapet — a low upstand along each of the four top edges
  const edges: [Vec2Like, Vec2Like][] = [
    [gp(+obb.halfU, +obb.halfV, eaveZ), gp(+obb.halfU, -obb.halfV, eaveZ)],
    [gp(+obb.halfU, -obb.halfV, eaveZ), gp(-obb.halfU, -obb.halfV, eaveZ)],
    [gp(-obb.halfU, -obb.halfV, eaveZ), gp(-obb.halfU, +obb.halfV, eaveZ)],
    [gp(-obb.halfU, +obb.halfV, eaveZ), gp(+obb.halfU, +obb.halfV, eaveZ)],
  ];
  for (const [a, b] of edges) out.push(prismBand(a, b, PARAPET_H, 0.08, roofMaterial(roofColor), ROOF_TILE));
  return out;
}

type Vec2Like = THREE.Vector3;

/** Per-triangle planar UV (world metres) for a NON-INDEXED triangle soup. Each
 *  triangle is projected onto the world axis-pair least aligned with its normal,
 *  so horizontal faces map by (x,z) while vertical faces keep their height in v
 *  (no vertical smearing on gables / fascias). Materials tiling this must use
 *  texture.repeat = 1/tile-in-metres (roof/wall use repeat 1 → 1 tile per metre). */
function addSoupPlanarUV(geom: THREE.BufferGeometry, tile = WALL_TILE): void {
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    ab.subVectors(b, a); ac.subVectors(c, a); n.crossVectors(ab, ac);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    // pick (u,v) = the two axes spanning the face's plane (drop the normal's axis)
    const uAxis: 'x' | 'z' = ay >= ax && ay >= az ? 'x' : ax >= az ? 'z' : 'x';
    const vAxis: 'y' | 'z' = ay >= ax && ay >= az ? 'z' : 'y';
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? a : k === 1 ? b : c;
      uv[(i + k) * 2] = p[uAxis] / tile;
      uv[(i + k) * 2 + 1] = p[vAxis] / tile;
    }
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** A vertical band (wall strip) of height `h`, thickness `t`, from a→b (in three space). */
function prismBand(a: THREE.Vector3, b: THREE.Vector3, h: number, t: number, mat: THREE.Material, tile = WALL_TILE): THREE.Mesh {
  const along = new THREE.Vector3().subVectors(b, a);
  const L = along.length();
  const geom = roundedBox(L, h, t, tile); // bevelled + world-scale UVs (parapet / balcony rails)
  const xA = along.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const zA = new THREE.Vector3().crossVectors(xA, up).normalize();
  const m = new THREE.Matrix4().makeBasis(xA, up, zA);
  const center = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  center.y += h / 2;
  m.setPosition(center);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.applyMatrix4(m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A flat quad (4 coplanar corners) as a double-sided mesh. */
function quadMesh(pts: THREE.Vector3[], mat: THREE.Material, tile = WALL_TILE): THREE.Mesh {
  const [p0, p1, p2, p3] = pts;
  const pos = [
    p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z,
    p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z,
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  addSoupPlanarUV(geom, tile); // world-scale UV so a textured cap (陸屋根) maps, not stretches
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Balcony: deck slab + top rail + balusters + side rails along a→b. */
function balconyMeshes(bal: import('../gen/types').Balcony): THREE.Mesh[] {
  const railMat = new THREE.MeshStandardMaterial({ color: 0x30333a, roughness: 0.5, metalness: 0.5 });
  const deckMat = slabMaterial();
  const a = toThree(bal.a.x, bal.a.y, bal.z);
  const b = toThree(bal.b.x, bal.b.y, bal.z);
  const outN = dir3(bal.normal.x, bal.normal.y).multiplyScalar(bal.depth);
  const aO = a.clone().add(outN);
  const bO = b.clone().add(outN);
  const out: THREE.Mesh[] = [];

  // deck slab (top surface at bal.z)
  out.push(quadMesh([a.clone().add(new THREE.Vector3(0, -0.06, 0)), b.clone().add(new THREE.Vector3(0, -0.06, 0)),
    bO.clone().add(new THREE.Vector3(0, -0.06, 0)), aO.clone().add(new THREE.Vector3(0, -0.06, 0))], deckMat));

  const RAIL_H = 1.05;
  // outer + two side rails as solid panels (glass/metal balustrade)
  out.push(prismBand(aO, bO, RAIL_H, 0.05, railMat)); // outer
  out.push(prismBand(a, aO, RAIL_H, 0.05, railMat)); // side 1
  out.push(prismBand(b, bO, RAIL_H, 0.05, railMat)); // side 2
  // top cap rail on the outer edge
  const topA = aO.clone(); topA.y += RAIL_H;
  const topB = bO.clone(); topB.y += RAIL_H;
  out.push(prismBand(topA, topB, 0.06, 0.08, railMat));
  return out;
}

/** A flat rectilinear ring rendered as a horizontal cap at `height`. */
function ringMesh(ring: Vec2[], height: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  ring.forEach((pt, i) => (i === 0 ? shape.moveTo(pt.x, pt.y) : shape.lineTo(pt.x, pt.y)));
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2); // XY plane → XZ ground plane (gen y → three -z)
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.y = height;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const ROOF_T = 0.2; // roof slab thickness (fascia / 鼻隠し depth)
/** Metres of real roof spanned by one `roof` texture image. The CC0
 *  clay_roof_tiles photo shows ~18 tile columns (working width ~0.2 m each),
 *  so one image ≈ 3.5 m of roof; mapping it at that scale makes each pantile
 *  render at a realistic size instead of tiny. (Wall/gable keep WALL_TILE.) */
const ROOF_TILE = 3.5;

/** Give a roof surface (triangle soup) real thickness: a top skin, a bottom skin
 *  offset straight down by `t`, and a fascia strip around every boundary edge
 *  (edges used by a single triangle — i.e. eaves + rakes, not the shared ridge).
 *  Winding is irrelevant since the roof material is double-sided. */
function thicken(pos: number[], t: number): number[] {
  const out: number[] = [...pos];
  for (let i = 0; i < pos.length; i += 9) {
    const a = [pos[i], pos[i + 1], pos[i + 2]], b = [pos[i + 3], pos[i + 4], pos[i + 5]], c = [pos[i + 6], pos[i + 7], pos[i + 8]];
    out.push(a[0], a[1] - t, a[2], c[0], c[1] - t, c[2], b[0], b[1] - t, b[2]); // bottom skin (reversed)
  }
  const edges = new Map<string, { n: number; p: number[]; q: number[] }>();
  const key = (p: number[]) => `${Math.round(p[0] * 1e3)},${Math.round(p[1] * 1e3)},${Math.round(p[2] * 1e3)}`;
  const add = (p: number[], q: number[]) => {
    const ka = key(p), kb = key(q), k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    const e = edges.get(k);
    if (e) e.n++; else edges.set(k, { n: 1, p, q });
  };
  for (let i = 0; i < pos.length; i += 9) {
    const a = [pos[i], pos[i + 1], pos[i + 2]], b = [pos[i + 3], pos[i + 4], pos[i + 5]], c = [pos[i + 6], pos[i + 7], pos[i + 8]];
    add(a, b); add(b, c); add(c, a);
  }
  for (const { n, p, q } of edges.values()) {
    if (n !== 1) continue; // interior edge (ridge/hip) — no fascia
    out.push(p[0], p[1], p[2], q[0], q[1], q[2], q[0], q[1] - t, q[2]);
    out.push(p[0], p[1], p[2], q[0], q[1] - t, q[2], p[0], p[1] - t, p[2]);
  }
  return out;
}

/** Build a mesh from a raw triangle-soup position list. Adds a per-face planar
 *  (world-metre) UV so tiled textures map correctly onto BOTH the sloped roof
 *  skins (→ x,z) and the vertical gable/fascia faces (→ keep height in v). */
function meshFrom(pos: number[], mat: THREE.Material, tile = WALL_TILE): THREE.Mesh {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  addSoupPlanarUV(geom, tile);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Pitched roof per mass — 切妻(gable) / 寄棟(hip) / 片流れ(mono). The sloped
 * SURFACES use the (dark) roof material; a gable's/mono's triangular END is
 * filled at the WALL plane in the WALL material (like a real house — the gable
 * triangle is siding, not roofing). `ridgeAxis` runs the ridge along U or V.
 */
function buildRoof(r: RoofMass, type: 'gable' | 'hip' | 'mono', ridgeAxis: 'U' | 'V', overhang: number, roofColor: number, gableVariant: WallVariant = 'plaster'): THREE.Mesh[] {
  const { obb, eaveZ, ridgeZ } = r;
  const alongU = ridgeAxis === 'U';
  const A = alongU ? obb.axisU : obb.axisV; // ridge direction
  const B = alongU ? obb.axisV : obb.axisU; // gable / slope direction
  const halfA = alongU ? obb.halfU : obb.halfV;
  const halfB = alongU ? obb.halfV : obb.halfU;
  const c = obb.center;
  const hoA = halfA + overhang, hoB = halfB + overhang;
  const eaveDropZ = eaveZ - overhang * 0.15;
  const rise = ridgeZ - eaveZ;
  const gp = (a: number, b: number, z: number) => toThree(c.x + A.x * a + B.x * b, c.y + A.y * a + B.y * b, z);

  const roof: number[] = [];
  const gable: number[] = []; // wall-material infill (gable / mono ends)
  const T = (out: number[], p: THREE.Vector3, q: THREE.Vector3, s: THREE.Vector3) =>
    out.push(p.x, p.y, p.z, q.x, q.y, q.z, s.x, s.y, s.z);
  const Q = (out: number[], p: THREE.Vector3, q: THREE.Vector3, s: THREE.Vector3, u: THREE.Vector3) => { T(out, p, q, s); T(out, p, s, u); };

  if (type === 'gable') {
    const r0 = gp(+hoA, 0, ridgeZ), r1 = gp(-hoA, 0, ridgeZ);
    Q(roof, gp(+hoA, +hoB, eaveDropZ), gp(-hoA, +hoB, eaveDropZ), r1, r0); // +B slope
    Q(roof, gp(+hoA, -hoB, eaveDropZ), r0, r1, gp(-hoA, -hoB, eaveDropZ)); // -B slope
    // gable-end triangles at the wall plane (A = ±halfA), WALL material.
    // Wound so the face normal points OUTWARD (away from the ridge) — the +A end
    // faces +A, the −A end faces −A — else the triangle renders inside-out.
    T(gable, gp(+halfA, -halfB, eaveZ), gp(+halfA, +halfB, eaveZ), gp(+halfA, 0, ridgeZ));
    T(gable, gp(-halfA, +halfB, eaveZ), gp(-halfA, -halfB, eaveZ), gp(-halfA, 0, ridgeZ));
  } else if (type === 'hip') {
    const ridgeHalf = Math.max(0, halfA - halfB); // shortened ridge (0 → 方形 pyramid)
    const ra0 = gp(+ridgeHalf, 0, ridgeZ), ra1 = gp(-ridgeHalf, 0, ridgeZ);
    const e0 = gp(+hoA, +hoB, eaveDropZ), e1 = gp(+hoA, -hoB, eaveDropZ);
    const e2 = gp(-hoA, -hoB, eaveDropZ), e3 = gp(-hoA, +hoB, eaveDropZ);
    Q(roof, e0, e3, ra1, ra0); // +B trapezoid
    Q(roof, e1, ra0, ra1, e2); // -B trapezoid
    T(roof, e0, ra0, e1); // +A hip end
    T(roof, e3, e2, ra1); // -A hip end
  } else {
    // mono / 片流れ: one plane, HIGH on -B, LOW on +B. No eave dip here (a dip
    // would drop the low eave below the flat wall top and the wall would poke
    // through). Every wall gap up to the roof plane is closed so the high side
    // isn't open and nothing punches through. zAt() = the roof's height at a
    // given B, so the infill tops sit exactly on the slope.
    const zAt = (b: number) => eaveZ + (rise * (hoB - b)) / (2 * hoB);
    const h0 = gp(+hoA, -hoB, eaveZ + rise), h1 = gp(-hoA, -hoB, eaveZ + rise); // high eave
    const l0 = gp(+hoA, +hoB, eaveZ), l1 = gp(-hoA, +hoB, eaveZ); // low eave
    Q(roof, h0, l0, l1, h1);
    const zLo = zAt(halfB), zHi = zAt(-halfB); // roof height at the ±B wall planes
    // ±A side walls: flat top (eaveZ) up to the sloped roof (a trapezoid)
    Q(gable, gp(+halfA, +halfB, eaveZ), gp(+halfA, -halfB, eaveZ), gp(+halfA, -halfB, zHi), gp(+halfA, +halfB, zLo));
    Q(gable, gp(-halfA, +halfB, eaveZ), gp(-halfA, -halfB, eaveZ), gp(-halfA, -halfB, zHi), gp(-halfA, +halfB, zLo));
    // high (−B) wall — this was the open hole
    Q(gable, gp(+halfA, -halfB, eaveZ), gp(-halfA, -halfB, eaveZ), gp(-halfA, -halfB, zHi), gp(+halfA, -halfB, zHi));
    // low (+B) sliver, only nonzero with an overhang
    if (zLo - eaveZ > 1e-3) Q(gable, gp(+halfA, +halfB, eaveZ), gp(-halfA, +halfB, eaveZ), gp(-halfA, +halfB, zLo), gp(+halfA, +halfB, zLo));
  }

  const out: THREE.Mesh[] = [meshFrom(thicken(roof, ROOF_T), roofMaterial(roofColor), ROOF_TILE)];
  if (gable.length) {
    const gm = wallMaterial(gableVariant) as THREE.MeshStandardMaterial; // 妻壁は外壁と同色
    gm.side = THREE.DoubleSide;
    out.push(meshFrom(gable, gm));
  }
  return out;
}

export function disposeGroup(group: THREE.Group) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}
