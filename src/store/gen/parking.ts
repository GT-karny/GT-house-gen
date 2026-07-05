// ============================================================================
// Parking field generator — the store site's protagonist. Fills a rectangular
// region with double-loaded parking: repeating [stall row][aisle][stall row]
// modules, each row diced into `stallW` stalls. Dimensions follow JP practice
// (web-researched): stall 2.5×5.0 m; 90° two-way aisle 5.5–6.0 m; a double-
// loaded module ≈ 5+6+5 = 16 m.
//
// Orientation-agnostic: the region is described in abstract (a,b) coords —
// a = ROW axis (stalls sit side-by-side along it, one stall = `stallW`),
// b = DEPTH axis (stall length + aisle stack along it, b1 = inner edge). An
// injected `W(a,b)→world` maps back, so the SAME code lays out the front field
// (rows ∥ street) and the side fields (rows ∥ depth) correctly. Pure logic
// (renderer-agnostic parking planner). Determinism via rand01.
// ============================================================================

import type { StoreConfig } from './config';
import type { ParkingField, ParkingStall, SiteRect, Vec2 } from './types';
import { rand01 } from '../../shared/rng';

/** One region to fill, in abstract row/depth (a,b) coordinates. Car facing is
 *  derived per row from the b axis (nose into the adjacent aisle), so the frame
 *  only needs the extents + the (a,b)→world mapping. */
export interface RegionFrame {
  a0: number; // row-axis start
  a1: number; // row-axis end
  b0: number; // depth-axis outer edge
  b1: number; // depth-axis inner edge (near the building); modules stack b1 → b0
  W: (a: number, b: number) => Vec2; // (row, depth) → world XY
}

const CAR_COLORS = [0xe8e8ea, 0x1b1d21, 0x8f949b, 0x35435a, 0x7a2f2f, 0x2f4a37, 0xb7a98f];


/** A depth band in abstract b coords: a stall row (with its facing sign) or a drive aisle. */
type Band =
  | { kind: 'row'; bLo: number; bHi: number; face: number }
  | { kind: 'aisle'; bLo: number; bHi: number };

/** Fill one region with a self-connected parking layout (JP/US practice: no
 *  dead-end stalls; aisles link up and meet the entry drive).
 *
 *  Layout, outer edge (b0, road/perimeter) → inner (b1, building):
 *   - an ENTRY AISLE spans the outer edge — the field's connection to the site
 *     drive network (the entrance aligns to it);
 *   - then double-loaded rows: each stall's REAR faces its aisle and its NOSE +
 *     wheel stop face the deep end (away from the aisle), so paired rows meet
 *     nose-to-nose and every row backs into an aisle — none is boxed in;
 *   - a perpendicular CROSS-AISLE along one end links all the parallel aisles
 *     (and the entry aisle) so no aisle is a dead end.
 *
 *  A region shallower than entryAisle+one row gets no stalls (kept as paving)
 *  rather than an unreachable row. Orientation-agnostic via the (a,b)→world map. */
export function fillParkingRegion(
  fr: RegionFrame,
  cfg: StoreConfig,
  seed: number,
  salt: number,
  b0Drive = false, // b0 edge already abuts an external drive → skip the entry aisle
  accN = 0 // 車椅子使用者用 stalls to place in the building-nearest row (JP バリアフリー法)
): { stalls: ParkingStall[]; aisles: SiteRect[]; rows: SiteRect[] } {
  const stalls: ParkingStall[] = [];
  const aisles: SiteRect[] = [];
  const rows: SiteRect[] = [];

  const { stallW, stallL, aisleW } = cfg;
  const { a0, a1, b0, b1, W } = fr;
  const AW = a1 - a0; // row length available
  if (AW < stallW || b1 - b0 < (b0Drive ? stallL : aisleW + stallL)) return { stalls, aisles, rows };

  // ---- pass 1: depth bands (entry aisle + rows + shared aisles), b0 → b1. Every
  // row backs into an aisle (or the b0 external drive) so none is boxed in. ----
  const bands: Band[] = [];
  let cursor = b0;
  if (!b0Drive) { bands.push({ kind: 'aisle', bLo: b0, bHi: b0 + aisleW }); cursor = b0 + aisleW; } // entry drive
  for (;;) {
    if (b1 - cursor < stallL) break;
    bands.push({ kind: 'row', bLo: cursor, bHi: cursor + stallL, face: +1 }); // backs toward −b
    cursor += stallL;
    if (b1 - cursor >= stallL + aisleW) { // nose-to-nose partner + its shared aisle
      bands.push({ kind: 'row', bLo: cursor, bHi: cursor + stallL, face: -1 });
      cursor += stallL;
      bands.push({ kind: 'aisle', bLo: cursor, bHi: cursor + aisleW });
      cursor += aisleW;
    } else break; // lone last row backs into the aisle / drive below it
  }
  if (!bands.some((b) => b.kind === 'row')) return { stalls, aisles, rows };
  // A lone single row (b0Drive field with no interior aisle) would otherwise cluster
  // at the b0 edge, leaving an empty strip in front of the store. Pull it to the far
  // edge (店の眼の前) and make the gap its access drive (which touches the b0 drive).
  if (b0Drive && bands.length === 1) {
    const row = bands[0], gapHi = b1 - stallL;
    if (gapHi - b0 > 0.5) { bands.unshift({ kind: 'aisle', bLo: b0, bHi: gapHi }); row.bLo = gapHi; row.bHi = b1; cursor = b1; }
  }
  const nAisles = bands.filter((b) => b.kind === 'aisle').length;

  // justify: spread the bands to fill [b0,b1] so rows reach toward BOTH edges
  // (端から生成) rather than clustering with an empty strip; the leftover depth
  // widens the interior aisles (店前/主車路) and shifts a trailing row out to the
  // far edge. Aisles stay in the reachability network, so nothing dead-ends.
  {
    const slack = b1 - cursor;
    if (slack > 0.05 && nAisles > 0) {
      const add = slack / nAisles;
      let shift = 0;
      for (const b of bands) {
        b.bLo += shift; b.bHi += shift;
        if (b.kind === 'aisle') { b.bHi += add; shift += add; }
      }
    }
  }

  // ---- reserve a perpendicular cross-aisle so every parallel aisle links back to
  // the entry drive. Only needed when an aisle does NOT touch the b0 edge: if the
  // first band is a row (b0Drive stack), the interior aisles sit behind it and need
  // linking; if the first band is an aisle (entry drive at b0), extras need it. ----
  const needCross = bands[0].kind === 'row' ? nAisles >= 1 : nAisles >= 2;
  const cross = needCross && AW - aisleW >= stallW * 2 ? aisleW : 0;
  const aRowLo = a0 + cross; // stalls start after the reserved cross lane
  const AWm = a1 - aRowLo;
  const nPerRow = Math.floor(AWm / stallW);
  if (nPerRow < 1) return { stalls, aisles, rows };
  const aStart = aRowLo + (AWm - nPerRow * stallW) / 2; // center the stall block

  // World direction of increasing b (depth axis) from the frame mapping, so a row
  // can face ±b regardless of how (a,b) is oriented in the world.
  const aMid = (a0 + a1) / 2;
  const p0 = W(aMid, b0), p1 = W(aMid, b1);
  let bx = p1.x - p0.x, by = p1.y - p0.y;
  const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
  const yawOf = (sign: number) => (Math.atan2(sign * by, sign * bx) * 180) / Math.PI;

  const rect = (aLo: number, bLo: number, aHi: number, bHi: number): Vec2[] => [
    W(aLo, bLo), W(aHi, bLo), W(aHi, bHi), W(aLo, bHi),
  ];

  // ---- pass 2: emit stalls + aisle patches ----
  const ACC_W = 3.5; // 車椅子使用者用駐車施設 width (JP バリアフリー法 ≥3.5 m)
  const aRowHi = aStart + nPerRow * stallW;
  const innerRow = [...bands].reverse().find((b) => b.kind === 'row'); // nearest the building entrance
  let rowIdx = 0;
  for (const bd of bands) {
    if (bd.kind === 'aisle') { aisles.push({ ring: rect(a0, bd.bLo, a1, bd.bHi), kind: 'aisle' }); continue; }
    rows.push({ ring: rect(aStart, bd.bLo, aRowHi, bd.bHi), kind: 'parking' });
    const bC = (bd.bLo + bd.bHi) / 2;
    const yawDeg = yawOf(bd.face);
    // the building-nearest row leads with wide accessible stalls (near the entrance)
    const nAcc = bd === innerRow ? Math.min(accN, Math.floor((aRowHi - aStart) / ACC_W)) : 0;
    let aC = aStart, i = 0;
    for (let k = 0; k < nAcc; k++, i++) {
      stalls.push({ center: W(aC + ACC_W / 2, bC), halfU: ACC_W / 2, halfV: stallL / 2, yawDeg, occupied: false, accessible: true });
      aC += ACC_W;
    }
    for (; aC + stallW <= aRowHi + 1e-6; aC += stallW, i++) {
      const gi = rowIdx * 1000 + i;
      const occupied = rand01(seed, salt, 1, gi) < cfg.occupancy;
      stalls.push({
        center: W(aC + stallW / 2, bC),
        halfU: stallW / 2, // across (⊥ to facing)
        halfV: stallL / 2, // length (∥ to facing)
        yawDeg,
        occupied,
        accessible: false,
        color: occupied ? CAR_COLORS[Math.floor(rand01(seed, salt, 2, gi) * CAR_COLORS.length)] : undefined,
      });
    }
    rowIdx++;
  }
  if (cross > 0) aisles.push({ ring: rect(a0, b0, aRowLo, b1), kind: 'aisle' }); // perpendicular link

  return { stalls, aisles, rows };
}

/** Combine several filled regions into one ParkingField. */
export function mergeParking(
  cfg: StoreConfig,
  parts: { stalls: ParkingStall[]; aisles: SiteRect[]; rows: SiteRect[] }[]
): ParkingField {
  const stalls = parts.flatMap((p) => p.stalls);
  const aisles = parts.flatMap((p) => p.aisles);
  const rows = parts.flatMap((p) => p.rows);
  return { stalls, aisles, rows, stallW: cfg.stallW, stallL: cfg.stallL, count: stalls.length };
}
