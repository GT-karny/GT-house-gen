// ============================================================================
// 集合住宅ファサード。店舗の「面 role × ベイ走査」を拡張し、住戸単位の split-grammar
// にする。バー(BarFrame)の前面=バルコニー面、背面=共用廊下面、両端=妻面。住戸割付
// (units)・コア(cores)を各面へ写像し、基準階を全階へスタック(位置ハッシュで縦整列)。
//   balcony(前面): 各住戸に掃き出し窓 + 張出しバルコニースラブ + 左右の隔て板。
//   corridor(背面): 各住戸に玄関ドア + MB扉 + 小窓、全長の共用廊下/外廊下スラブ。
//   gable(妻面): 各階小窓1。
//   entrance(1F前面): 共用エントランス1つ。
// 外階段時は階段室窓を省略(コアは開放鉄骨階段になるため)。純ロジック(描画非依存)。
// ============================================================================

import type { AptConfig } from './config';
import { resolveBalconyForm, resolveWindowMix, resolveGableStyle } from './config';
import type {
  AptPanel, Balcony, BalconyForm, BalconyPartition, BarFrame, CorePlacement, CorridorSlab, CorridorSpec, Unit, Vec2, WindowSize,
} from './types';
import { add, scale } from '../../shared/vec';
import { rand01 } from '../../shared/rng';

const yawOf = (n: Vec2) => (Math.atan2(n.y, n.x) * 180) / Math.PI;

// 玄関ドアの makeDoorModule 用サイズ。W×0.44=leaf(≈0.86m)、H×0.78=開口高(≈2.03m)。
// render 側はドアパネルの w/h からモジュールを組むので、ここが唯一の情報源。
export const DOOR_MODULE_W = 1.95;
export const DOOR_MODULE_H = 2.6;

export interface AptFacade {
  panels: AptPanel[];
  balconies: Balcony[];
  corridors: CorridorSlab[];
  partitions: BalconyPartition[];
}

export function generateAptFacade(
  cfg: AptConfig,
  bar: BarFrame,
  units: Unit[],
  cores: CorePlacement[],
  corridor: CorridorSpec,
  baseZ: number,
  floors: number,
  coreStyle: 'blank' | 'windows' | 'glazed'
): AptFacade {
  const panels: AptPanel[] = [];
  const balconies: Balcony[] = [];
  const corridors: CorridorSlab[] = [];
  const partitions: BalconyPartition[] = [];
  const gm = bar.gridModule;
  const H = cfg.panelH;
  const barLenM = bar.lengthBays * gm;
  const barDepM = bar.depthBays * gm;

  // 立面バリエーション(§10)を seed で解決。建物ごとに一貫。
  const balconyForm: BalconyForm = resolveBalconyForm(cfg, floors);
  const windowMix = resolveWindowMix(cfg);
  const gableStyle = resolveGableStyle(cfg);
  // box/inset は戸境に袖壁/隙間を残す(連続は隣戸と接続)。inset は張出しを浅く。
  const edgeInset = balconyForm === 'continuous' ? 0.05 : 0.18;
  const balconyDepth = balconyForm === 'inset' ? Math.min(cfg.balconyDepth, 0.7) : cfg.balconyDepth;

  const uAt = (bays: number) => bays * gm;
  // 前面(v=0)/背面(v=depth)の壁面上の点。normal は外向き。
  const frontPt = (u: number): Vec2 => add(bar.origin, scale(bar.axisU, u));
  const rearPt = (u: number): Vec2 => add(add(bar.origin, scale(bar.axisU, u)), scale(bar.axisV, barDepM));
  const nFront = scale(bar.axisV, -1); // 前面=道路/バルコニー側
  const nRear = bar.axisV; // 背面=廊下側
  const nLeft = scale(bar.axisU, -1);
  const nRight = bar.axisU;
  const yFront = yawOf(nFront);
  const yRear = yawOf(nRear);

  // 隔て板を立てる住戸境界(u ベイ)。各住戸の両端を集めて重複を除く → 隣戸間は1枚。
  const edgeSet = new Set<number>();
  for (const u of units) { edgeSet.add(u.startBay); edgeSet.add(u.startBay + u.bays); }
  const edges = [...edgeSet];

  for (let f = 0; f < floors; f++) {
    const zc = baseZ + f * H + H / 2; // パネル中心高さ
    const zFloor = baseZ + f * H; // 床レベル(スラブ/手摺基準)

    // ---- 住戸: 前面=掃き出し窓+バルコニー / 背面=玄関ドア+MB+小窓 ----
    for (const u of units) {
      const u0 = uAt(u.startBay);
      const u1 = uAt(u.startBay + u.bays);
      const uc = (u0 + u1) / 2;
      const uw = u1 - u0;

      // 開口: single=住戸全幅の掃き出し窓1枚 / mixed=掃き出し窓+腰窓(幅広住戸のみ、位置ハッシュで左右)。
      if (windowMix === 'mixed' && uw > 2.2) {
        const sashW = Math.max(1.4, uw * 0.52);
        const koshiW = Math.max(0.8, uw * 0.3);
        const leftSash = rand01(cfg.seed, 0x5a51, u.startBay) < 0.5;
        const sashU = leftSash ? u0 + sashW / 2 + 0.15 : u1 - sashW / 2 - 0.15;
        const koshiU = leftSash ? u1 - koshiW / 2 - 0.15 : u0 + koshiW / 2 + 0.15;
        panels.push({
          type: 'sashwindow', faceRole: 'balcony', floor: f,
          pos: frontPt(sashU), z: zc, yawDeg: yFront, w: sashW, h: H * 0.74, size: 'large',
        });
        panels.push({
          type: 'window', faceRole: 'balcony', floor: f,
          pos: frontPt(koshiU), z: zFloor + H * 0.62, yawDeg: yFront, w: koshiW, h: H * 0.38, size: 'medium',
        });
      } else {
        panels.push({
          type: 'sashwindow', faceRole: 'balcony', floor: f,
          pos: frontPt(uc), z: zc, yawDeg: yFront,
          w: Math.max(1.2, uw - 0.5), h: H * 0.72, size: 'large',
        });
      }
      balconies.push({
        a: frontPt(u0 + edgeInset), b: frontPt(u1 - edgeInset), normal: nFront,
        z: zFloor, depth: balconyDepth, form: balconyForm,
      });

      // 背面: 玄関ドア + MB扉 + 小窓(面格子)。玄関ドアは実寸(leaf≈0.86m・開口高≈2.03m)。
      // makeDoorModule は leaf=W×0.44 / 開口=H×0.78 / 開口下端=中心−H/2 なので、下端が床に来るよう
      // W/H を渡し z=zFloor+H/2 に置く(階高に依らず一定の適正ドアサイズ)。
      const doorU = u0 + Math.min(0.7, uw * 0.22);
      panels.push({
        type: 'door', faceRole: 'corridor', floor: f,
        pos: rearPt(doorU), z: zFloor + DOOR_MODULE_H / 2, yawDeg: yRear, w: DOOR_MODULE_W, h: DOOR_MODULE_H,
      });
      if (uw > 1.6) {
        panels.push({
          type: 'mb', faceRole: 'corridor', floor: f,
          pos: rearPt(doorU + 0.7), z: zFloor + H * 0.55, yawDeg: yRear, w: 0.5, h: H * 0.68,
        });
      }
      const winU = u1 - Math.min(0.7, uw * 0.3);
      panels.push({
        type: 'window', faceRole: 'corridor', floor: f,
        pos: rearPt(winU), z: zc, yawDeg: yRear, w: 0.9, h: H * 0.4, size: 'small' as WindowSize, grille: true,
      });
    }

    // ---- バルコニー隔て板(隣戸境界)----
    for (const e of edges) {
      partitions.push({ pos: frontPt(uAt(e)), outward: nFront, z: zFloor, depth: cfg.balconyDepth, height: 1.8 });
    }

    // ---- コア(階段室)立面: blank=無地 / windows=窓列 / glazed=全面ガラス ----
    if (coreStyle !== 'blank') {
      for (const c of cores) {
        const cc = uAt(c.startBay + c.bays / 2);
        const cw = Math.max(0.8, c.bays * gm - 0.6);
        const h = coreStyle === 'glazed' ? H * 0.85 : H * 0.5;
        const size: WindowSize = coreStyle === 'glazed' ? 'large' : 'medium';
        panels.push({ type: 'stairwin', faceRole: 'gable', floor: f, pos: frontPt(cc), z: zc, yawDeg: yFront, w: cw, h, size });
        panels.push({ type: 'stairwin', faceRole: 'gable', floor: f, pos: rearPt(cc), z: zc, yawDeg: yRear, w: cw, h, size });
      }
    }

    // ---- 共用廊下/外廊下スラブ(両アクセス型、背面全長)----
    if (corridor.present) {
      corridors.push({
        a: rearPt(0.05), b: rearPt(barLenM - 0.05), normal: nRear,
        z: zFloor, depth: corridor.widthM, floor: f,
      });
    }

    // ---- 妻面(両端)小窓 — blank は無地(実物で多数)。windows のみ各階小窓 ----
    if (gableStyle === 'windows') {
      const leftMid = add(bar.origin, scale(bar.axisV, barDepM * 0.5));
      const rightMid = add(add(bar.origin, scale(bar.axisU, barLenM)), scale(bar.axisV, barDepM * 0.5));
      panels.push({ type: 'window', faceRole: 'gable', floor: f, pos: leftMid, z: zc, yawDeg: yawOf(nLeft), w: 0.9, h: H * 0.4, size: 'small' });
      panels.push({ type: 'window', faceRole: 'gable', floor: f, pos: rightMid, z: zc, yawDeg: yawOf(nRight), w: 0.9, h: H * 0.4, size: 'small' });
    }
  }

  // ---- 1F 共用エントランス(前面、道路側の端に近いコア u に配置)----
  if (floors > 0) {
    const entU = cores.length ? uAt(cores[0].startBay + cores[0].bays / 2) : uAt(bar.lengthBays * 0.5);
    panels.push({
      type: 'entrance', faceRole: 'entrance', floor: 0,
      pos: frontPt(entU), z: baseZ + H * 0.5, yawDeg: yFront,
      w: Math.min(3.2, barLenM * 0.5), h: H * 0.9,
    });
  }

  return { panels, balconies, corridors, partitions };
}
