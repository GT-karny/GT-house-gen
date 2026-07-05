// ============================================================================
// 集合住宅ジェネレータ 純ロジック不変条件テスト(docs/apartment-gen-research.md §8.6)。
// 決定論 / 整数ベイ壁 / 住戸数整合 / 最小間口 / スロット厳密分割 / コア・廊下整合 /
// 隔て板 / 外階段 / 階数レンジ / 附置義務 / フットプリント・スタルの敷地内収まり。
// ============================================================================

import { describe, it, expect } from 'vitest';
import { generateApartment } from './building';
import { makeSampleAptLot } from './lot';
import { DEFAULT_APT_CONFIG, APT_PRESETS, resolveUnitBays, type AptConfig, type AptPresetName } from './config';
import { placeCores } from './cores';
import { tileUnits } from './units';
import { pointInPolygon } from '../../shared/poly';

const cfgOf = (over: Partial<AptConfig> = {}): AptConfig => ({ ...structuredClone(DEFAULT_APT_CONFIG), ...structuredClone(over) });
const lotOf = (cfg: AptConfig) => makeSampleAptLot(cfg.lotWidth, cfg.lotDepth, 'rectangle', cfg.seed);

const PRESETS = Object.keys(APT_PRESETS) as AptPresetName[];
const CASES: { name: string; cfg: (seed: number) => AptConfig }[] = [
  { name: 'default', cfg: (seed) => cfgOf({ seed }) },
  ...PRESETS.map((p) => ({ name: p, cfg: (seed: number) => cfgOf({ ...APT_PRESETS[p], seed }) })),
];
const SEEDS = [1, 2, 7, 42, 123];

describe('apartment generator invariants', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      it('is deterministic (same seed → identical output)', () => {
        const cfg = c.cfg(7);
        const a = generateApartment(lotOf(cfg), cfg);
        const b = generateApartment(lotOf(cfg), c.cfg(7));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      });

      for (const seed of SEEDS) {
        it(`seed ${seed}: structural invariants`, () => {
          const cfg = c.cfg(seed);
          const lot = lotOf(cfg);
          const { plan, site } = generateApartment(lot, cfg);

          // --- 階数: 2以上、ランダム時は [floorsMin, floorsMax] に収まる(構造上限クランプ後) ---
          expect(plan.floors).toBeGreaterThanOrEqual(2);
          if (cfg.floorsRandom) expect(plan.floors).toBeLessThanOrEqual(cfg.floorsMax);

          // --- 棟長 = スロットのベイ総和 = 整数 ---
          expect(Number.isInteger(plan.bar.lengthBays)).toBe(true);
          expect(plan.slots.reduce((s, sl) => s + sl.bays, 0)).toBe(plan.bar.lengthBays);

          // --- 住戸: 整数ベイ・最小間口・segment を隙間なく充填 ---
          expect(plan.units.length).toBeGreaterThan(0);
          for (const u of plan.units) {
            expect(Number.isInteger(u.bays)).toBe(true);
            expect(u.bays).toBeGreaterThanOrEqual(cfg.minUnitBays);
          }
          const unitBaySum = plan.units.reduce((s, u) => s + u.bays, 0);
          const segBaySum = plan.slots.filter((s) => s.kind === 'segment').reduce((s, sl) => s + sl.bays, 0);
          expect(unitBaySum).toBe(segBaySum);
          for (const u of plan.units) expect(u.startBay + u.bays).toBeLessThanOrEqual(plan.bar.lengthBays);

          // --- 総戸数整合 ---
          expect(plan.unitCount).toBe(plan.units.length * plan.floors);

          // --- コア: 外階段型=0(住戸連続) / 内階段型=1以上。棟内に収まる ---
          const wantExt = cfg.exteriorStair === 'auto' ? plan.floors <= cfg.exteriorStairMaxFloors : cfg.exteriorStair;
          if (wantExt) expect(plan.cores.length).toBe(0);
          else expect(plan.cores.length).toBeGreaterThanOrEqual(1);
          for (const core of plan.cores) {
            expect(core.startBay).toBeGreaterThanOrEqual(0);
            expect(core.startBay + core.bays).toBeLessThanOrEqual(plan.bar.lengthBays);
          }

          // --- 共用廊下/外廊下: 両アクセス型とも全長スラブ×階 ---
          expect(plan.corridor.present).toBe(true);
          expect(plan.corridors.length).toBe(plan.floors);

          // --- バルコニー: 各住戸×各階に1枚。form は3種のいずれかで全枚数一貫(§10.2) ---
          expect(plan.balconies.length).toBe(plan.units.length * plan.floors);
          const forms = new Set(plan.balconies.map((b) => b.form));
          for (const f of forms) expect(['continuous', 'inset', 'box']).toContain(f);
          expect(forms.size).toBe(1); // 建物ごとに1形状で一貫
          for (const b of plan.balconies) expect(b.depth).toBeGreaterThan(0);

          // --- 隔て板: 住戸境界(重複除く)× 各階 ---
          const edges = new Set<number>();
          for (const u of plan.units) { edges.add(u.startBay); edges.add(u.startBay + u.bays); }
          expect(plan.partitions.length).toBe(edges.size * plan.floors);
          expect(plan.partitions.length).toBeGreaterThan(0);

          // --- 外階段 ↔ 塔屋 の排他(低層=外階段/中高層=内階段+PH)---
          if (wantExt) {
            expect(plan.exteriorStairs.length).toBeGreaterThan(0); // 背面=コア数 / 妻側=端部1〜2
            expect(plan.penthouses.length).toBe(0);
            for (const st of plan.exteriorStairs) expect(st.offsetV).toBeGreaterThanOrEqual(0); // 廊下ぶん外に出す
          } else {
            expect(plan.exteriorStairs.length).toBe(0);
          }

          // --- 附置義務 ---
          expect(site.parkingRequired).toBe(Math.ceil(plan.unitCount * cfg.parkingRatioPerUnit));
          expect(site.parkingShort).toBe(site.parking.count < site.parkingRequired);
          expect(site.bikeRequired).toBe(Math.ceil(plan.unitCount * cfg.bicycleRatioPerUnit));

          // --- フットプリント ring・スタルが敷地内(凸敷地)---
          expect(plan.footprintRing.length).toBeGreaterThanOrEqual(4);
          for (const p of plan.footprintRing) expect(pointInPolygon(p, lot.ring)).toBe(true);
          for (const s of site.parking.stalls) expect(pointInPolygon(s.center, lot.ring)).toBe(true);
        });
      }
    });
  }

  it('both access types have a rear access deck; low-rise gets exterior stairs, mid-rise internal + PH', () => {
    const low = cfgOf({ ...APT_PRESETS['wood-apart'], seed: 3, floorsRandom: false, floors: 2 });
    const mid = cfgOf({ ...APT_PRESETS['midrise-gallery-rc'], seed: 3, floorsRandom: false, floors: 7 });
    const lp = generateApartment(lotOf(low), low).plan;
    const mp = generateApartment(lotOf(mid), mid).plan;
    expect(lp.corridors.length).toBe(lp.floors); // 外廊下
    expect(mp.corridors.length).toBe(mp.floors); // 片廊下
    expect(lp.exteriorStairs.length).toBeGreaterThan(0);
    for (const st of lp.exteriorStairs) expect(st.offsetV).toBeCloseTo(lp.corridor.widthM, 6); // 廊下ぶん外に出ている
    expect(lp.penthouses.length).toBe(0);
    expect(mp.exteriorStairs.length).toBe(0);
    expect(mp.penthouses.length).toBeGreaterThan(0);
  });

  it('randomized panel width (左右) / depth (前後) vary across seeds but keep integer bays', () => {
    const mods = new Set<number>();
    const depths = new Set<number>();
    for (let s = 0; s < 40; s++) {
      const cfg = cfgOf({ seed: s, gridModuleRandom: true, unitDepthRandom: true });
      const plan = generateApartment(lotOf(cfg), cfg).plan;
      // パネル幅は実効レンジ内(尺/メーターの約1.5倍)、整数ベイ格子は不変
      expect(plan.bar.gridModule).toBeGreaterThanOrEqual(1.1);
      expect(plan.bar.gridModule).toBeLessThanOrEqual(1.7);
      expect(Number.isInteger(plan.bar.lengthBays)).toBe(true);
      expect(Number.isInteger(plan.bar.depthBays)).toBe(true);
      for (const u of plan.units) expect(Number.isInteger(u.bays)).toBe(true);
      mods.add(Math.round(plan.bar.gridModule * 100));
      depths.add(plan.bar.depthBays);
    }
    expect(mods.size).toBeGreaterThan(3); // seed でパネル幅が振れる
    expect(depths.size).toBeGreaterThan(2); // seed で前後奥行が振れる
  });

  it('non-random dims are stable and equal the config center', () => {
    const cfg = cfgOf({ seed: 5, gridModule: 0.95, unitDepth: 9, gridModuleRandom: false, unitDepthRandom: false });
    const plan = generateApartment(lotOf(cfg), cfg).plan;
    expect(plan.bar.gridModule).toBeCloseTo(0.95, 6);
  });

  it('all units in a building are exactly the same width; the width and bar length vary across seeds', () => {
    const pitches = new Set<number>();
    const lengths = new Set<number>();
    for (const preset of PRESETS) {
      for (let s = 0; s < 30; s++) {
        const cfg = cfgOf({ ...APT_PRESETS[preset], seed: s });
        const plan = generateApartment(lotOf(cfg), cfg).plan;
        const ws = plan.units.map((u) => u.bays);
        // 同一建物内は厳密に同幅(過小分割・セグメント跨ぎの不均一なし)
        expect(Math.max(...ws)).toBe(Math.min(...ws));
        expect(Math.min(...ws)).toBeGreaterThanOrEqual(3); // 過小分割(2ベイ=1.8m)なし
        if (preset === 'midrise-gallery-rc') {
          pitches.add(ws[0]);
          lengths.add(Math.round(plan.bar.lengthBays * plan.bar.gridModule * 2)); // 0.5m バケットの実棟長(m)
        }
      }
    }
    expect(pitches.size).toBeGreaterThan(2); // seed で住戸間口(均等ピッチ)が変わる
    expect(lengths.size).toBeGreaterThan(3); // seed で実棟長(m)が変わる(パネル幅×住戸数×敷地クランプ)
  });

  it('randomized floors stay within [min, max] and vary across seeds', () => {
    const vals = new Set<number>();
    for (let s = 0; s < 40; s++) {
      const cfg = cfgOf({ seed: s, structure: 'rc-frame', floorsRandom: true, floorsMin: 3, floorsMax: 8 });
      const f = generateApartment(lotOf(cfg), cfg).plan.floors;
      expect(f).toBeGreaterThanOrEqual(3);
      expect(f).toBeLessThanOrEqual(8);
      vals.add(f);
    }
    expect(vals.size).toBeGreaterThan(1); // seed により変化する
  });

  it('overall site layout varies across seeds (building lateral position)', () => {
    const origins = new Set<string>();
    for (let s = 0; s < 24; s++) {
      const cfg = cfgOf({ seed: s });
      const { plan } = generateApartment(lotOf(cfg), cfg);
      origins.add(`${plan.bar.origin.x.toFixed(2)},${plan.bar.origin.y.toFixed(2)}`);
    }
    expect(origins.size).toBeGreaterThan(1); // 住棟の左右位置が seed で振れる
  });

  it('default lot gets a roofed bicycle shelter prop', () => {
    const cfg = cfgOf({ seed: 1 });
    const { site } = generateApartment(lotOf(cfg), cfg);
    expect(site.props.some((p) => p.kind === 'bikeshelter')).toBe(true);
  });

  it('building orientation varies across seeds on a balanced lot (棟長∥間口 / ∥奥行)', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 16; s++) {
      const cfg = cfgOf({ seed: s, lotWidth: 42, lotDepth: 34, floorsRandom: false, floors: 5 });
      const lot = lotOf(cfg);
      const { plan } = generateApartment(lot, cfg);
      const dotU = Math.abs(plan.bar.axisU.x * lot.longestEdgeDir.x + plan.bar.axisU.y * lot.longestEdgeDir.y);
      seen.add(dotU > 0.7 ? 'along-frontage' : 'along-depth');
    }
    expect(seen.size).toBe(2); // 両向きが seed で現れる(向きの自由化)
  });

  it('balcony facing varies over 前後左右 (4 directions) across seeds', () => {
    const dirs = new Set<string>();
    for (let s = 0; s < 28; s++) {
      const cfg = cfgOf({ seed: s, lotWidth: 36, lotDepth: 34, floorsRandom: false, floors: 5 });
      const n = generateApartment(lotOf(cfg), cfg).plan.balconies[0]?.normal;
      if (n) dirs.add(`${Math.round(n.x)},${Math.round(n.y)}`);
    }
    expect(dirs.size).toBeGreaterThanOrEqual(3); // 前後左右のうち少なくとも3方向が出る
  });

  it('wide shallow lot: the open side is filled with parking (not left empty)', () => {
    let best = 0;
    for (let s = 0; s < 8; s++) {
      const cfg = cfgOf({ seed: s, lotWidth: 46, lotDepth: 24, floorsRandom: false, floors: 5 });
      best = Math.max(best, generateApartment(lotOf(cfg), cfg).site.parking.count);
    }
    expect(best).toBeGreaterThanOrEqual(6); // 側方/コートの空地が駐車で埋まる
  });

  it('building footprint AND exterior stairs stay inside the lot (incl. small lots)', () => {
    const dims = [{ w: 14, d: 18 }, { w: 16, d: 20 }, { w: 20, d: 16 }, { w: 18, d: 32 }, { w: 40, d: 20 }, { w: 24, d: 24 }];
    for (const p of PRESETS) {
      for (const L of dims) {
        for (const seed of [1, 4, 7, 11]) {
          const cfg = cfgOf({ ...APT_PRESETS[p], seed, lotWidth: L.w, lotDepth: L.d });
          const lot = lotOf(cfg);
          const { plan } = generateApartment(lot, cfg);
          for (const pt of plan.footprintRing) expect(pointInPolygon(pt, lot.ring)).toBe(true);
          for (const st of plan.exteriorStairs) {
            for (const sa of [-st.runU / 2, st.runU / 2]) {
              for (const sb of [st.offsetV, st.offsetV + st.spanV]) {
                const c = { x: st.base.x + st.along.x * sa + st.outward.x * sb, y: st.base.y + st.along.y * sa + st.outward.y * sb };
                expect(pointInPolygon(c, lot.ring)).toBe(true); // 階段の外端まで敷地内
              }
            }
          }
        }
      }
    }
  });

  it('placeCores + tileUnits partition the bar exactly; all units share one width w', () => {
    for (const seed of SEEDS) {
      for (const internal of [true, false]) {
        const cfg = cfgOf({ seed });
        const { pad } = generateApartment(lotOf(cfg), cfg).site;
        const w = resolveUnitBays(cfg);
        const { slots, cores, totalBays } = placeCores(cfg, pad, internal, w);
        const units = tileUnits(cfg, slots, w);
        const segBays = slots.filter((s) => s.kind === 'segment').reduce((a, s) => a + s.bays, 0);
        expect(units.reduce((a, u) => a + u.bays, 0)).toBe(segBays);
        expect(slots.reduce((a, s) => a + s.bays, 0)).toBe(totalBays); // スロット総和 = 実棟長
        expect(totalBays).toBeLessThanOrEqual(pad.maxWidthBays); // 端数吸収で棟は pad 幅以下
        // 同一建物内は全住戸が厳密に同幅 w
        for (const u of units) expect(u.bays).toBe(w);
        if (!internal) expect(cores.length).toBe(0); // 外階段型は内部コア無し=住戸連続
      }
    }
  });
});
