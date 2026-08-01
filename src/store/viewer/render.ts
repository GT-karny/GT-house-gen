// ============================================================================
// Store building rendering (M2, photoreal) — storefront panels on the wall
// plane: CC0-PBR wall/shutter boards (real-scale UVs), reflective glazing with a
// mullion grid, framed entrances with a slim awning, and a continuous emissive
// signage fascia. Flat/gable roofs and entrance canopies per mass. Site is
// delegated to ./site. Consumes the pure plan/roofs/site; env/IBL from scene.ts.
// ============================================================================

import * as THREE from 'three';
import type { StoreBuildingPlan, StoreSitePlan, Canopy, Vec2, StorePanel, SignInstance, WallFace } from '../gen/types';
import type { StoreRoofMass } from '../gen/roof';
import { planarBoxUV, WALL_TILE } from '../../viewer/modules';
import {
  moduleMaterial, storeWallMaterial, mullionMaterial, roofMaterial, flatRoofDeckMaterial, parapetMaterial, poleMaterial, metalMaterial,
  mansardMaterial, awningMaterial, signFaceMaterial, posterMaterial, fasciaPanelMaterial, fasciaVisual,
  type StoreWallVariant,
} from './materials';
import { storeSiteMeshes } from './site';
import { signBoard } from './sign-board';

const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);
const dir3 = (x: number, y: number) => new THREE.Vector3(x, 0, -y).normalize();
const PANEL_T = 0.22;
const AWNING_CREAM = 0xf1ede1;
const ROOF_TILE = 3.5; // metres of clay-tile roof per texture image (matches the house)
const MANSARD_TILE = 2.4; // finer tiling on the steep mansard band / entrance gable

/** Per-triangle planar UV (world metres) for a NON-INDEXED triangle soup: each
 *  triangle projects onto the world axis-pair least aligned with its normal, so
 *  sloped roof faces tile without smearing. Materials must use texture.repeat = 1
 *  (the /tile division here carries the real-world scale). Mirrors the house. */
function addSoupPlanarUV(geom: THREE.BufferGeometry, tile: number): void {
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    ab.subVectors(b, a); ac.subVectors(c, a); n.crossVectors(ab, ac);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
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

const ROOF_T = 0.25; // roof slab thickness (fascia / 鼻隠し depth)

/** Give a roof triangle-soup real thickness: a bottom skin offset straight down
 *  by `t`, plus a fascia strip around every BOUNDARY edge (eaves + rakes, used by
 *  one triangle — not the shared ridge). So the roof reads as a solid slab and
 *  occludes anything below it, instead of a paper-thin see-through surface.
 *  Mirrors the house `thicken`. */
function thicken(pos: number[], t: number): number[] {
  const out: number[] = [...pos];
  for (let i = 0; i < pos.length; i += 9) {
    const a = [pos[i], pos[i + 1], pos[i + 2]], b = [pos[i + 3], pos[i + 4], pos[i + 5]], c = [pos[i + 6], pos[i + 7], pos[i + 8]];
    out.push(a[0], a[1] - t, a[2], c[0], c[1] - t, c[2], b[0], b[1] - t, b[2]); // bottom skin (reversed)
  }
  const edges = new Map<string, { n: number; p: number[]; q: number[] }>();
  const key = (p: number[]) => `${Math.round(p[0] * 1e3)},${Math.round(p[1] * 1e3)},${Math.round(p[2] * 1e3)}`;
  const addEdge = (p: number[], q: number[]) => {
    const ka = key(p), kb = key(q), k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    const e = edges.get(k);
    if (e) e.n++; else edges.set(k, { n: 1, p, q });
  };
  for (let i = 0; i < pos.length; i += 9) {
    const a = [pos[i], pos[i + 1], pos[i + 2]], b = [pos[i + 3], pos[i + 4], pos[i + 5]], c = [pos[i + 6], pos[i + 7], pos[i + 8]];
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
  }
  for (const { n, p, q } of edges.values()) {
    if (n !== 1) continue; // interior edge (ridge/hip) — no fascia
    out.push(p[0], p[1], p[2], q[0], q[1], q[2], q[0], q[1] - t, q[2]);
    out.push(p[0], p[1], p[2], q[0], q[1] - t, q[2], p[0], p[1] - t, p[2]);
  }
  return out;
}

export interface StoreRenderParams {
  brandColor: number;
  showSite: boolean;
  // seed-resolved cladding (main.ts), mirroring the house: `base` clads the
  // ground floor (腰壁/two-tone), `main` the upper floors. Default plaster.
  wallMain?: StoreWallVariant;
  wallBase?: StoreWallVariant;
  windowAwnings?: boolean; // striped hoods over frontage ground glazing
  entranceGable?: boolean; // gabled porte-cochère over the entrance
}

export function renderStore(
  plan: StoreBuildingPlan,
  roofs: StoreRoofMass[],
  site: StoreSitePlan,
  p: StoreRenderParams
): THREE.Group {
  const g = new THREE.Group();
  if (p.showSite) for (const o of storeSiteMeshes(site, p.brandColor)) g.add(o);
  const wallMain: StoreWallVariant = p.wallMain ?? 'plaster';
  const wallBase: StoreWallVariant = p.wallBase ?? wallMain;
  const frontageFaces = new Set(plan.faces.filter((f) => f.role === 'frontage').map((f) => f.index));
  // a window awning is skipped where a wall sign already occupies that bay
  const wallSigns = plan.signs.filter((s) => s.kind === 'wall');
  const underWallSign = (panel: StorePanel) =>
    wallSigns.some((s) => Math.hypot(panel.pos.x - s.pos.x, panel.pos.y - s.pos.y) < s.w / 2 + panel.w / 2 + 0.2);

  // storefront panels — wall/shutter as UV-baked PBR boards, glazing/entrance as
  // reflective glass assemblies. Sign-band cells remain separate physical panels;
  // only the narrow brand rails run continuously across their joints.
  const bandByFace = new Map<number, StorePanel[]>();
  const entrancesByFace = new Map<number, StorePanel[]>();
  for (const panel of plan.panels) if (panel.type === 'entrance') {
    const entries = entrancesByFace.get(panel.faceIndex) ?? [];
    entries.push(panel); entrancesByFace.set(panel.faceIndex, entries);
  }
  for (const panel of plan.panels) {
    if (panel.type === 'signband') {
      const cells = bandByFace.get(panel.faceIndex) ?? [];
      cells.push(panel); bandByFace.set(panel.faceIndex, cells);
      continue;
    }
    if (panel.type === 'glazing' || panel.type === 'entrance') {
      g.add(glazedPanel(panel, panel.type, plan.logoId));
      // striped 日除けテント over frontage ground glazing (family-restaurant look),
      // skipping bays taken by the wall sign
      if (p.windowAwnings && panel.type === 'glazing' && panel.floor === 0 && frontageFaces.has(panel.faceIndex) && !underWallSign(panel))
        g.add(awningMesh(panel, p.brandColor));
      // gabled 車寄せ porch over each frontage entrance
      if (p.entranceGable && panel.type === 'entrance' && frontageFaces.has(panel.faceIndex))
        entrancePorch(panel, p.brandColor).forEach((m) => g.add(m));
    } else g.add(boardPanel(panel, panel.floor === 0 ? wallBase : wallMain)); // wall / shutter
  }
  // Continuous branded fascia per frontage/flank face. The horizontal band itself
  // is the identity, as on ordinary Japanese convenience and roadside chains.
  for (const [faceIndex, panels] of bandByFace) {
    const face = plan.faces.find((f) => f.index === faceIndex);
    if (!face) continue;
    g.add(bandMesh(face, panels, p.brandColor, plan.logoId, entrancesByFace.get(faceIndex) ?? []));
  }

  for (const r of roofs) roofMeshes(r).forEach((mesh) => g.add(mesh));
  for (const c of plan.canopies) canopyMeshes(c).forEach((mesh) => g.add(mesh));
  for (const s of plan.signs) g.add(buildingSignMesh(s)); // 壁面/袖看板
  return g;
}

/** Local→world basis for a panel: local +x along the wall, +y up, +z outward. */
function panelMatrix(panel: StorePanel): THREE.Matrix4 {
  const up = new THREE.Vector3(0, 1, 0);
  const zAxis = dir3(Math.cos((panel.yawDeg * Math.PI) / 180), Math.sin((panel.yawDeg * Math.PI) / 180));
  const xAxis = new THREE.Vector3().crossVectors(up, zAxis).normalize();
  const m = new THREE.Matrix4().makeBasis(xAxis, up, zAxis);
  m.setPosition(toThree(panel.pos.x, panel.pos.y, panel.z));
  return m;
}

/** A solid wall or loading-shutter board — CC0 PBR with real-scale (planar) UVs
 *  at the SAME WALL_TILE metre scale as the house wall. */
function boardPanel(panel: StorePanel, wallV: StoreWallVariant): THREE.Mesh {
  const geom = new THREE.BoxGeometry(panel.w, panel.h, PANEL_T);
  planarBoxUV(geom, panel.w, panel.h, PANEL_T, WALL_TILE);
  const mat = panel.type === 'shutter' ? moduleMaterial('shutter') : storeWallMaterial(wallV);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.applyMatrix4(panelMatrix(panel));
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

/** A glazed span: recessed reflective glass + a dark mullion grid, and for the
 *  entrance a perimeter frame + a slim brand awning. Built in panel-local space
 *  (x across, y up, z out) then oriented. */
function glazedPanel(panel: StorePanel, kind: 'glazing' | 'entrance', logoId: number): THREE.Group {
  const grp = new THREE.Group();
  const w = panel.w, h = panel.h;
  const glassT = 0.06, mZ = PANEL_T / 2 - 0.02; // mullions sit just proud of the recessed glass
  const mullMat = mullionMaterial();

  // recessed glass
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, h * 0.96, glassT), moduleMaterial(kind));
  glass.position.set(0, 0, PANEL_T / 2 - 0.12);
  grp.add(glass);

  // perimeter frame
  const fr = 0.09;
  const frameBar = (bw: number, bh: number, x: number, y: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.1), mullMat);
    b.position.set(x, y, mZ); grp.add(b);
  };
  frameBar(w, fr, 0, h / 2 - fr / 2); frameBar(w, fr, 0, -h / 2 + fr / 2);
  frameBar(fr, h, -w / 2 + fr / 2, 0); frameBar(fr, h, w / 2 - fr / 2, 0);

  // vertical mullions on a ~1.4 m rhythm
  const bays = Math.max(1, Math.round(w / 1.4));
  for (let i = 1; i < bays; i++) {
    const x = -w / 2 + (w * i) / bays;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, h - 2 * fr, 0.09), mullMat);
    b.position.set(x, 0, mZ); grp.add(b);
  }
  // horizontal transom (entrance head height, else mid)
  const ty = kind === 'entrance' ? Math.min(h / 2 - fr, -h / 2 + 2.3) : 0;
  const transom = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * fr, 0.08, 0.09), mullMat);
  transom.position.set(0, ty, mZ); grp.add(transom);

  // A sparse campaign poster behind the glass gives the storefront a second
  // information scale without generating an interior. One in four bays keeps
  // both geometry and texture count modest on mass-generated stores.
  if (kind === 'glazing' && panel.floor === 0 && panel.bay % 4 === 1) {
    const maxH = Math.min(1.12, h * 0.5);
    const pw = Math.min(0.72, w * 0.44, maxH * (2 / 3));
    const ph = pw * 1.5;
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      posterMaterial(logoId),
    );
    poster.position.set(w * 0.2, -h * 0.15, PANEL_T / 2 - 0.075);
    grp.add(poster);
  }

  // entrance gets a slim flat awning at DOOR-HEAD height (just above the transom),
  // so it stays clear below the signage band rather than colliding with it.
  if (kind === 'entrance') {
    const awn = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.14, 1.3), metalMaterial());
    awn.position.set(0, ty + 0.18, PANEL_T / 2 + 0.6); awn.castShadow = true;
    grp.add(awn);
  }

  grp.applyMatrix4(panelMatrix(panel));
  grp.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  return grp;
}

/** Bay-jointed fascia panels plus continuous brand rails and a separate logo box.
 *  The layered construction matches how Japanese convenience-store fascias are
 *  fabricated, rather than baking the entire elevation into one canvas texture. */
function bandMesh(face: WallFace, panels: StorePanel[], brand: number, logoId: number, entrances: StorePanel[]): THREE.Group {
  const grp = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);
  const { a, b, normal } = face;
  const A = toThree(a.x, a.y, 0), B = toThree(b.x, b.y, 0);
  const L = new THREE.Vector3().subVectors(B, A).length() || 1;
  const EXT = PANEL_T / 2;
  const DEPTH = 0.075;
  const zAxis = dir3(normal.x, normal.y);
  const xAxis = new THREE.Vector3().crossVectors(up, zAxis).normalize();
  const cells = [...panels].sort((p, q) => p.bay - q.bay);
  const h = cells[0]?.h ?? 0.9;
  const zc = cells.reduce((sum, p) => sum + p.z, 0) / Math.max(1, cells.length);
  const bayCount = Math.max(1, cells.length || face.bays);
  const bayW = L / bayCount;
  const palette = fasciaVisual(logoId, brand);

  // dark backing is visible only in the 14 mm construction joints
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(L + 2 * EXT, h + 0.035, DEPTH),
    fasciaPanelMaterial(palette.casing),
  );
  backing.position.z = -0.012; grp.add(backing);
  const joint = Math.min(0.014, bayW * 0.018);
  for (let i = 0; i < bayCount; i++) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.08, bayW - joint), h, DEPTH * 0.72),
      fasciaPanelMaterial(palette.panel),
    );
    panel.position.set(-L / 2 + bayW * (i + 0.5), 0, DEPTH * 0.42);
    grp.add(panel);
  }

  // Rails are independent continuous extrusions: panel joints stop at them.
  for (const rail of palette.rails) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(L + 2 * EXT, h * rail.h, DEPTH * 0.74),
      fasciaPanelMaterial(rail.color),
    );
    strip.position.set(0, h * rail.y, DEPTH * 0.82); grp.add(strip);
  }

  if (face.role === 'frontage') {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const tangent = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const entryX = entrances.length
      ? entrances.reduce((sum, p) => sum + (p.pos.x - mid.x) * tangent.x + (p.pos.y - mid.y) * tangent.y, 0) / entrances.length
      : 0;
    const logoW = Math.min(L * 0.52, Math.max(bayW * 3.35, h * 4.8));
    const logoH = h * 0.9;
    const safeX = THREE.MathUtils.clamp(entryX, -L / 2 + logoW / 2 + 0.08, L / 2 - logoW / 2 - 0.08);
    const logo = signBoard(
      logoW, logoH, 0.105,
      signFaceMaterial(brand, logoId, 'wall', logoW / logoH),
      { doubleSided: false, frame: 0.022, casingColor: palette.casing, radius: 0.018 },
    );
    // Seat the cabinet directly on the panel face; no unexplained air gap.
    const panelFront = DEPTH * 0.78;
    logo.position.set(safeX, 0.025, panelFront + 0.105 / 2 - 0.002); grp.add(logo);

    // A small, separate service banner sits over another set of glazing bays.
    if (L >= 7) {
      const promoW = Math.min(L * 0.32, Math.max(2.8, bayW * 2.2));
      const promoH = Math.min(0.48, h * 0.48);
      const target = safeX > 0 ? -L * 0.23 : L * 0.23;
      const promoX = THREE.MathUtils.clamp(target, -L / 2 + promoW / 2, L / 2 - promoW / 2);
      const promo = signBoard(
        promoW, promoH, 0.065,
        signFaceMaterial(brand, logoId, 'promo', promoW / promoH),
        { doubleSided: false, frame: 0.018, casingColor: palette.casing, radius: 0.012 },
      );
      const promoY = -h / 2 - promoH / 2 - 0.015;
      promo.position.set(promoX, promoY, DEPTH + 0.025); grp.add(promo);
      // two short hangers make the lower cabinet visibly part of the fascia
      for (const x of [promoX - promoW * 0.36, promoX + promoW * 0.36]) {
        const hanger = new THREE.Mesh(
          new THREE.BoxGeometry(0.045, 0.09, 0.045),
          fasciaPanelMaterial(palette.casing),
        );
        hanger.position.set(x, -h / 2 - 0.015, DEPTH * 0.5); grp.add(hanger);
      }
    }
  }

  const offset = PANEL_T / 2 + 0.055;
  const displayZ = zc - Math.min(0.2, h * 0.14);
  const pos = toThree((a.x + b.x) / 2, (a.y + b.y) / 2, displayZ).add(zAxis.clone().multiplyScalar(offset));
  const m = new THREE.Matrix4().makeBasis(xAxis, up, zAxis);
  m.setPosition(pos);
  grp.applyMatrix4(m);
  grp.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  return grp;
}

/** Orient a centered box: local +x along axisU (world XY), +z along axisV. */
function orientOBB(mesh: THREE.Object3D, cx: number, cy: number, z: number, axisU: Vec2, axisV: Vec2) {
  const up = new THREE.Vector3(0, 1, 0);
  const xA = new THREE.Vector3(axisU.x, 0, -axisU.y).normalize();
  const zA = new THREE.Vector3(axisV.x, 0, -axisV.y).normalize();
  const m = new THREE.Matrix4().makeBasis(xA, up, zA);
  m.setPosition(toThree(cx, cy, z));
  mesh.applyMatrix4(m);
}

function roofMeshes(r: StoreRoofMass): THREE.Mesh[] {
  const { obb, eaveZ, style } = r;
  const out: THREE.Mesh[] = [];
  if (style === 'flat') {
    const slabGeom = new THREE.BoxGeometry(obb.halfU * 2, 0.3, obb.halfV * 2);
    planarBoxUV(slabGeom, obb.halfU * 2, 0.3, obb.halfV * 2, 2.5); // real-scale membrane UVs
    const slab = new THREE.Mesh(slabGeom, flatRoofDeckMaterial());
    orientOBB(slab, obb.center.x, obb.center.y, eaveZ + 0.15, obb.axisU, obb.axisV);
    slab.castShadow = true; slab.receiveShadow = true; out.push(slab);
    const ph = 0.5;
    const bar = (alongU: boolean, offV: number) => {
      const geoW = alongU ? obb.halfU * 2 + 0.2 : 0.2;
      const geoD = alongU ? 0.2 : obb.halfV * 2 + 0.2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(geoW, ph, geoD), parapetMaterial());
      const cx = obb.center.x + obb.axisV.x * offV;
      const cy = obb.center.y + obb.axisV.y * offV;
      orientOBB(mesh, cx, cy, eaveZ + ph / 2, obb.axisU, obb.axisV);
      mesh.castShadow = true; out.push(mesh);
    };
    bar(true, obb.halfV); bar(true, -obb.halfV);
    const sbar = (offU: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, ph, obb.halfV * 2 + 0.2), parapetMaterial());
      const cx = obb.center.x + obb.axisU.x * offU;
      const cy = obb.center.y + obb.axisU.y * offU;
      orientOBB(mesh, cx, cy, eaveZ + ph / 2, obb.axisU, obb.axisV);
      mesh.castShadow = true; out.push(mesh);
    };
    sbar(obb.halfU); sbar(-obb.halfU);
    return out;
  }
  if (style === 'mansard') return mansardRoof(r);
  return gableRoof(r);
}

/** 腰折れ屋根: a steep shingle fascia band wrapping the wall top (4 trapezoids
 *  sloping inward eaveZ→ridgeZ) capped by a hidden flat plateau + drip lip. */
function mansardRoof(r: StoreRoofMass): THREE.Mesh[] {
  const { obb, eaveZ, ridgeZ } = r;
  const U = obb.axisU, V = obb.axisV, c = obb.center;
  const hu = obb.halfU, hv = obb.halfV;
  const H = ridgeZ - eaveZ;
  const inset = Math.max(0.4, Math.min(H * 0.7, Math.min(hu, hv) - 0.6));
  const gp = (a: number, b: number, z: number) => toThree(c.x + U.x * a + V.x * b, c.y + U.y * a + V.y * b, z);

  const pos: number[] = [];
  const T = (p: THREE.Vector3, q: THREE.Vector3, s: THREE.Vector3) => pos.push(p.x, p.y, p.z, q.x, q.y, q.z, s.x, s.y, s.z);
  const Q = (p: THREE.Vector3, q: THREE.Vector3, s: THREE.Vector3, u: THREE.Vector3) => { T(p, q, s); T(p, s, u); };
  const iu = hu - inset, iv = hv - inset;
  // outer bottom (eaveZ) → inner top (ridgeZ) for each of the four sides
  Q(gp(hu, hv, eaveZ), gp(-hu, hv, eaveZ), gp(-iu, iv, ridgeZ), gp(iu, iv, ridgeZ)); // +V
  Q(gp(-hu, -hv, eaveZ), gp(hu, -hv, eaveZ), gp(iu, -iv, ridgeZ), gp(-iu, -iv, ridgeZ)); // -V
  Q(gp(hu, -hv, eaveZ), gp(hu, hv, eaveZ), gp(iu, iv, ridgeZ), gp(iu, -iv, ridgeZ)); // +U
  Q(gp(-hu, hv, eaveZ), gp(-hu, -hv, eaveZ), gp(-iu, -iv, ridgeZ), gp(-iu, iv, ridgeZ)); // -U
  // single steep surface (backed by the plateau + drip lip below) — no downward
  // thickening, which would hang a lip below the eave over the wall top
  const band = meshFromSoup(pos, mansardMaterial(), MANSARD_TILE);

  // hidden flat plateau just below the band top (dark membrane)
  const plateau = new THREE.Mesh(new THREE.BoxGeometry(iu * 2, 0.2, iv * 2), roofMaterial(false));
  orientOBB(plateau, c.x, c.y, ridgeZ - 0.1, U, V);
  plateau.receiveShadow = true;

  // metal drip/gutter lip along the outer eave
  const out: THREE.Mesh[] = [band, plateau];
  const lip = (alongU: boolean, offV: number, offU: number) => {
    const geoW = alongU ? hu * 2 + 0.24 : 0.24;
    const geoD = alongU ? 0.24 : hv * 2 + 0.24;
    const m = new THREE.Mesh(new THREE.BoxGeometry(geoW, 0.16, geoD), metalMaterial());
    const cx = c.x + V.x * offV + U.x * offU, cy = c.y + V.y * offV + U.y * offU;
    orientOBB(m, cx, cy, eaveZ + 0.02, U, V); m.castShadow = true; out.push(m);
  };
  lip(true, hv, 0); lip(true, -hv, 0); lip(false, 0, hu); lip(false, 0, -hu);
  return out;
}

/** A gable prism (ridge along axisU at v=0) with a proper 軒 overhang: the roof
 *  planes extend past the walls — eaves out by EAVE along ±V (dropping down-slope),
 *  verges out by RAKE along ±U — while a gable-end infill triangle stays on the
 *  wall plane (u=±hu) to close the wall. A slim fascia board (鼻隠し) trims each
 *  overhanging eave. */
function gableRoof(r: StoreRoofMass): THREE.Mesh[] {
  const { obb, eaveZ, ridgeZ } = r;
  const U = obb.axisU, V = obb.axisV, c = obb.center;
  const hu = obb.halfU, hv = obb.halfV;
  const EAVE = 0.6, RAKE = 0.5, LIP = 0.16; // 軒の出 / けらばの出 / eave sits just past
  // the wall FACE (not the wall plane) so the roof caps the thick panels' top edge
  const hvE = hv + LIP, huE = hu + LIP;
  const slope = (ridgeZ - eaveZ) / Math.max(hvE, 0.01);
  const ev = hvE + EAVE; // eave edge, past the wall
  const ru = huE + RAKE; // ridge/verge edge, past the gable wall
  const tipZ = eaveZ - slope * EAVE; // overhanging eave sits below the wall top
  const gp = (a: number, b: number, z: number) => toThree(c.x + U.x * a + V.x * b, c.y + U.y * a + V.y * b, z);
  const pos: number[] = [];
  const T = (p: THREE.Vector3, q: THREE.Vector3, s: THREE.Vector3) => pos.push(p.x, p.y, p.z, q.x, q.y, q.z, s.x, s.y, s.z);
  const Q = (p: THREE.Vector3, q: THREE.Vector3, s: THREE.Vector3, u: THREE.Vector3) => { T(p, q, s); T(p, s, u); };
  const r0 = gp(ru, 0, ridgeZ), r1 = gp(-ru, 0, ridgeZ);
  Q(gp(ru, ev, tipZ), gp(-ru, ev, tipZ), r1, r0); // +V slope (overhangs eave + verge)
  Q(gp(ru, -ev, tipZ), r0, r1, gp(-ru, -ev, tipZ)); // -V slope
  // gable wall infill closes the wall plane (u=±hu). Kept as a SEPARATE thin
  // sheet (not thickened) so only the sloping skins get a solid underside.
  const gableInfill: number[] = [];
  { const g = gableInfill;
    const P = (p: THREE.Vector3) => g.push(p.x, p.y, p.z);
    P(gp(hu, -hv, eaveZ)); P(gp(hu, hv, eaveZ)); P(gp(hu, 0, ridgeZ));
    P(gp(-hu, hv, eaveZ)); P(gp(-hu, -hv, eaveZ)); P(gp(-hu, 0, ridgeZ)); }

  const solid = thicken(pos, ROOF_T); // solid slab: bottom skin + eave/rake fascia
  const surface = meshFromSoup(solid, roofMaterial(true), ROOF_TILE);
  const infill = meshFromSoup(gableInfill, roofMaterial(true), ROOF_TILE);
  return [surface, infill];
}

/** Build a double-sided mesh from a raw triangle-soup + world-metre planar UVs. */
function meshFromSoup(pos: number[], mat: THREE.Material, tile: number): THREE.Mesh {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  addSoupPlanarUV(geom, tile);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

/** Entrance canopy (車寄せ): a flat slab on 4 corner posts. */
function canopyMeshes(c: Canopy): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const topZ = c.z + c.height;
  const shape = new THREE.Shape();
  c.ring.forEach((pt, i) => (i === 0 ? shape.moveTo(pt.x, pt.y) : shape.lineTo(pt.x, pt.y)));
  const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false });
  geom.rotateX(-Math.PI / 2);
  const slab = new THREE.Mesh(geom, parapetMaterial());
  slab.position.y = topZ;
  slab.castShadow = true; out.push(slab);
  for (const p of c.ring) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, c.height, 0.25), poleMaterial());
    post.position.set(p.x, c.z + c.height / 2, -p.y);
    post.castShadow = true; out.push(post);
  }
  return out;
}

/** A striped 日除けテント over a glazing panel: a sloped hood of alternating
 *  brand/cream slats + a short vertical valance. Built panel-local, then oriented. */
function awningMesh(panel: StorePanel, brand: number): THREE.Group {
  const grp = new THREE.Group();
  const w = panel.w, h = panel.h;
  const P = 1.15, drop = 0.55, valance = 0.28; // projection / slope drop / front skirt
  // sit at window-head height (not the panel top) so it stays clear below the
  // roof eave / signage band rather than poking through it
  const yTop = h / 2 - 0.7, zAttach = PANEL_T / 2;
  const L = Math.hypot(P, drop), ang = Math.atan2(drop, P);
  const N = Math.max(3, Math.round(w / 0.35));
  const sw = w / N;
  for (let i = 0; i < N; i++) {
    const mat = awningMaterial(i % 2 === 0 ? brand : AWNING_CREAM);
    const cx = -w / 2 + (i + 0.5) * sw;
    // sloped slat (length along local z, tilted out+down)
    const slat = new THREE.Mesh(new THREE.BoxGeometry(sw * 0.96, 0.04, L), mat);
    slat.rotation.x = ang;
    slat.position.set(cx, yTop - drop / 2, zAttach + P / 2);
    slat.castShadow = true; grp.add(slat);
    // vertical valance skirt at the outer edge
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(sw * 0.96, valance, 0.04), mat);
    skirt.position.set(cx, yTop - drop - valance / 2, zAttach + P);
    skirt.castShadow = true; grp.add(skirt);
  }
  grp.applyMatrix4(panelMatrix(panel));
  return grp;
}

/** A gabled 車寄せ porch projecting over a frontage entrance: two front posts +
 *  a gable prism whose tympanum faces the road. Built in world coords. */
function entrancePorch(panel: StorePanel, _brand: number): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const baseZ = panel.z - panel.h / 2;
  const yaw = (panel.yawDeg * Math.PI) / 180;
  const n = { x: Math.cos(yaw), y: Math.sin(yaw) }; // outward
  const t = { x: -n.y, y: n.x }; // along wall
  const px = panel.pos.x, py = panel.pos.y;
  // keep the porch within the entrance bay (no spill into neighbour awning bays)
  // and its ridge below the wall eave (no poke through the roof/mansard band).
  const hw = (panel.w + 0.4) / 2, P = 2.2;
  // keep the porch peak below the main roof eave (it projects past it, so a tall
  // ridge would poke above the eave line)
  const eaveH = baseZ + Math.min(panel.h * 0.65, 2.4);
  const ridgeZ = eaveH + 0.8;
  const cw = (dn: number, dt: number, z: number) =>
    toThree(px + n.x * dn + t.x * dt, py + n.y * dn + t.y * dt, z);

  // gable prism (mansard-toned shingle to match the crown)
  const pos: number[] = [];
  const T = (p: THREE.Vector3, q: THREE.Vector3, s: THREE.Vector3) => pos.push(p.x, p.y, p.z, q.x, q.y, q.z, s.x, s.y, s.z);
  const Q = (p: THREE.Vector3, q: THREE.Vector3, s: THREE.Vector3, u: THREE.Vector3) => { T(p, q, s); T(p, s, u); };
  Q(cw(0, hw, eaveH), cw(P, hw, eaveH), cw(P, 0, ridgeZ), cw(0, 0, ridgeZ)); // +t slope
  Q(cw(P, -hw, eaveH), cw(0, -hw, eaveH), cw(0, 0, ridgeZ), cw(P, 0, ridgeZ)); // -t slope
  T(cw(P, hw, eaveH), cw(P, 0, ridgeZ), cw(P, -hw, eaveH)); // road-facing tympanum
  T(cw(0, -hw, eaveH), cw(0, 0, ridgeZ), cw(0, hw, eaveH)); // wall side
  const roof = meshFromSoup(thicken(pos, ROOF_T), mansardMaterial(), MANSARD_TILE); // solid gable
  out.push(roof);

  // eave fascia beam + two front posts
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, hw * 2 + 0.2), parapetMaterial());
  orientOBB(beam, px + n.x * P, py + n.y * P, eaveH - 0.15, n, t);
  out.push(beam);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, eaveH - baseZ, 0.22), poleMaterial());
    post.position.set(px + n.x * P + t.x * s * hw, baseZ + (eaveH - baseZ) / 2, -(py + n.y * P + t.y * s * hw));
    post.castShadow = true; out.push(post);
  }
  return out;
}

/** Building-mounted sign: 壁面看板 / 袖看板 / 屋上看板 (cube or board), each
 *  carrying the sample logo texture. yawDeg encodes the road-facing outward
 *  normal; the sign is oriented so its logo face reads from the road. */
function buildingSignMesh(s: SignInstance): THREE.Object3D {
  const g = new THREE.Group();
  const yaw = (s.yawDeg * Math.PI) / 180;
  const n = { x: Math.cos(yaw), y: Math.sin(yaw) }; // outward (road-facing) normal
  const t = { x: -n.y, y: n.x };
  if (s.kind === 'wall') {
    const board = signBoard(s.w, s.h, 0.24, signFaceMaterial(s.color, s.logoId, 'wall', s.w / s.h), { frame: 0.035 });
    orientOBB(board, s.pos.x + n.x * (PANEL_T / 2 + 0.15), s.pos.y + n.y * (PANEL_T / 2 + 0.15), s.z, t, n);
    g.add(board);
  } else if (s.kind === 'blade') {
    // broad faces ‖ the wall (thin axis = tangent), projecting along n
    const D = 0.9;
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(PANEL_T / 2 + 0.2, 0.14, 0.14), metalMaterial());
    orientOBB(bracket, s.pos.x + n.x * (PANEL_T / 2 + 0.1), s.pos.y + n.y * (PANEL_T / 2 + 0.1), s.z + s.h / 2 - 0.2, n, t);
    g.add(bracket);
    const board = signBoard(D, s.h, 0.16, signFaceMaterial(s.color, s.logoId, 'blade', D / s.h), { frame: 0.025 });
    orientOBB(board, s.pos.x + n.x * (PANEL_T / 2 + 0.1 + D / 2), s.pos.y + n.y * (PANEL_T / 2 + 0.1 + D / 2), s.z, n, t);
    g.add(board);
  } else if (s.kind === 'roof-cube') {
    // 屋上キューブ: a cube on the roof, logo on all faces, facing the road
    const faceMat = signFaceMaterial(s.color, s.logoId, 'square', s.w / s.h);
    const cube = signBoard(s.w, s.h, s.w, faceMat, { frame: 0.08 });
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(s.w - 0.16, s.h - 0.16), faceMat);
      p.rotation.y = side * Math.PI / 2; p.position.x = side * (s.w / 2 + 0.006); cube.add(p);
    }
    orientOBB(cube, s.pos.x, s.pos.y, s.z + s.h / 2, t, n);
    g.add(cube);
  } else if (s.kind === 'roof-board') {
    // 屋上板型: an upright logo panel on short legs, broad face toward the road
    const legH = s.poleH;
    const panel = signBoard(s.w, s.h, 0.22, signFaceMaterial(s.color, s.logoId, 'rooftop', s.w / s.h), { frame: 0.035 });
    orientOBB(panel, s.pos.x, s.pos.y, s.z + legH + s.h / 2, t, n);
    g.add(panel);
    for (const sgn of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, legH, 0.16), poleMaterial());
      leg.position.set(s.pos.x + t.x * sgn * s.w * 0.35, s.z + legH / 2, -(s.pos.y + t.y * sgn * s.w * 0.35));
      g.add(leg);
    }
  }
  return g;
}

export function disposeGroup(group: THREE.Group) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}
