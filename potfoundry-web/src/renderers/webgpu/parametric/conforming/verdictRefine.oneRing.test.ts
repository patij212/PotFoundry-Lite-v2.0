/**
 * verdictRefine.oneRing.test.ts — TDD unit test for the T3 escalation builder
 * (`buildOneRingLevelAt` in `verdictRefine.ts`).
 *
 * Research P2.5c proved that escalating only the single outlier cell leaves a
 * 2:1-balance transition-apron sliver on a NEIGHBOUR (worst 0.0108, minAngle
 * 2.31 deg); escalating the outlier's 1-ring lands the apron in the smooth
 * zone. `buildOneRingLevelAt` turns `OutlierCell[]` (from the T2 scorer) into
 * a `featureLevelAt`-shaped `(u0,t0,size) => level` command covering each
 * outlier cell AND its 8-neighbour 1-ring, keyed on the SAME (iu,it) grid the
 * T2 scorer and the production quadtree use: u at `1<<(featureLevel+uBias)`
 * (periodic-wrapped), t at `1<<featureLevel` (clamped, not periodic).
 *
 * Four checks (brief `task-R2bT3-brief.md`):
 *   1. 1-RING FOOTPRINT + T-CLAMP + U-WRAP: one outlier at (iu=0, it=0) — the
 *      u=0 edge (so iu-1 must periodic-wrap to the max u index) AND the t=0
 *      edge (so it-1 must clamp/drop, not wrap) simultaneously — commands
 *      `featureLevel+1` on its 6-cell footprint (3 u-cells x 2 valid t-cells)
 *      and 0 everywhere else.
 *   2. MAXLEVEL CAP: an outlier already at `maxLevel` commands no deeper than
 *      `maxLevel` (not `maxLevel+1`).
 *   3. MERGE: two u-adjacent outliers' overlapping 1-rings union (not sum) —
 *      the marked-cell count is the union size, and overlap cells still
 *      report the single commanded level (never double-applied).
 *   4. PERIODIC WRAP on the OTHER u seam: an outlier at the top u index
 *      (`uCellRes-1`) wraps `iu+1` back to `iu=0`.
 *
 * Cell-footprint queries use `size = 1/tCellRes` (the t-cell width) so that
 * `qU1 - qU0 == size/(1<<uBias) == 1/uCellRes` exactly — i.e. the query box
 * exactly covers one (iu,it) cell at the escalation-builder's own resolution
 * (see `verdictRefine.ts`'s `buildOneRingLevelAt` / P2.5c's `makeSparseLevelAt`
 * query-scaling convention, mirrored here — not re-derived).
 */
import { describe, it, expect } from 'vitest';
import { buildOneRingLevelAt, type OutlierCell } from './verdictRefine';

const FEATURE_LEVEL = 2;
const U_BIAS = 1;
const U_CELL_RES = 1 << (FEATURE_LEVEL + U_BIAS); // 8
const T_CELL_RES = 1 << FEATURE_LEVEL; // 4

/** Query the escalation `levelAt` for exactly one (iu,it) cell footprint at
 * the builder's own (featureLevel,uBias) resolution — see file header. */
function levelAtCell(
  levelAt: (u0: number, t0: number, size: number) => number,
  iu: number,
  it: number,
): number {
  const size = 1 / T_CELL_RES;
  return levelAt(iu / U_CELL_RES, it / T_CELL_RES, size);
}

describe('buildOneRingLevelAt — T3 sparse 1-ring escalation builder', () => {
  it('1-RING FOOTPRINT: outlier at the (iu=0, it=0) corner commands level+1 on its 3x2 footprint (u periodic-wrapped, t clamped) and 0 elsewhere', () => {
    const outliers: OutlierCell[] = [{ iu: 0, it: 0, worstMm: 0.02 }];
    const maxLevel = 6;
    const levelAt = buildOneRingLevelAt(outliers, FEATURE_LEVEL, U_BIAS, maxLevel);
    const expectedLevel = FEATURE_LEVEL + 1;

    // u-ring wraps: iu-1 -> U_CELL_RES-1 (7), iu=0, iu+1=1.
    const uRing = [U_CELL_RES - 1, 0, 1];
    // t-ring clamps: it-1=-1 dropped, it=0, it+1=1 (only 2 valid rows).
    const tRing = [0, 1];

    for (const iu of uRing) {
      for (const it of tRing) {
        expect(levelAtCell(levelAt, iu, it)).toBe(expectedLevel);
      }
    }

    // Off-target: outside both rings.
    expect(levelAtCell(levelAt, 3, 0)).toBe(0); // u far from ring
    expect(levelAtCell(levelAt, 0, 2)).toBe(0); // t far from ring (it-ring only reaches 1)
    expect(levelAtCell(levelAt, 4, 3)).toBe(0); // both far

    // t=-1 (the dropped/clamped row) never exists as a queryable cell index,
    // so its absence from tRing above already proves the clamp; no separate
    // query needed (it would be an invalid cell index).
  });

  it('MAXLEVEL CAP: an outlier already at maxLevel commands no deeper than maxLevel', () => {
    const maxLevel = 4;
    const outliers: OutlierCell[] = [{ iu: 2, it: 2, worstMm: 0.05 }];
    // featureLevel === maxLevel: featureLevel+1 would exceed the cap.
    const levelAt = buildOneRingLevelAt(outliers, maxLevel, U_BIAS, maxLevel);
    const uCellRes = 1 << (maxLevel + U_BIAS);
    const tCellRes = 1 << maxLevel;

    const q = (iu: number, it: number): number => levelAt(iu / uCellRes, it / tCellRes, 1 / tCellRes);

    expect(q(2, 2)).toBe(maxLevel); // capped: not maxLevel+1
    expect(q(1, 2)).toBe(maxLevel);
    expect(q(3, 2)).toBe(maxLevel);
    for (const [iu, it] of [[1, 1], [2, 1], [3, 1], [1, 3], [2, 3], [3, 3]]) {
      expect(q(iu, it)).toBeLessThanOrEqual(maxLevel);
      expect(q(iu, it)).toBe(maxLevel);
    }
    expect(q(6, 2)).toBe(0); // off-target
  });

  it('MERGE: two u-adjacent outliers union their 1-rings (no double-count, no over-escalation)', () => {
    const outliers: OutlierCell[] = [
      { iu: 3, it: 2, worstMm: 0.02 },
      { iu: 4, it: 2, worstMm: 0.03 },
    ];
    const maxLevel = 6;
    const levelAt = buildOneRingLevelAt(outliers, FEATURE_LEVEL, U_BIAS, maxLevel);
    const expectedLevel = FEATURE_LEVEL + 1;

    // Union footprint: iu in {2,3,4,5} (A gives {2,3,4}, B gives {3,4,5}),
    // it in {1,2,3} (both outliers share it=2 -> ring {1,2,3}).
    const uUnion = [2, 3, 4, 5];
    const tUnion = [1, 2, 3];
    let markedCount = 0;
    for (let iu = 0; iu < U_CELL_RES; iu++) {
      for (let it = 0; it < T_CELL_RES; it++) {
        const lvl = levelAtCell(levelAt, iu, it);
        if (lvl > 0) {
          markedCount++;
          expect(lvl).toBe(expectedLevel); // overlap cells still report ONE commanded level, not summed/doubled
          expect(uUnion).toContain(iu);
          expect(tUnion).toContain(it);
        }
      }
    }
    // Union size 4*3=12, NOT the naive sum 9+9=18.
    expect(markedCount).toBe(uUnion.length * tUnion.length);
    expect(markedCount).toBe(12);
  });

  it('PERIODIC WRAP (other seam): outlier at iu=uCellRes-1 wraps iu+1 back to iu=0', () => {
    const outliers: OutlierCell[] = [{ iu: U_CELL_RES - 1, it: 2, worstMm: 0.02 }];
    const maxLevel = 6;
    const levelAt = buildOneRingLevelAt(outliers, FEATURE_LEVEL, U_BIAS, maxLevel);
    const expectedLevel = FEATURE_LEVEL + 1;

    const uRing = [U_CELL_RES - 2, U_CELL_RES - 1, 0]; // iu+1 wraps to 0
    const tRing = [1, 2, 3];
    for (const iu of uRing) {
      for (const it of tRing) {
        expect(levelAtCell(levelAt, iu, it)).toBe(expectedLevel);
      }
    }
    expect(levelAtCell(levelAt, 1, 2)).toBe(0); // clearly off-ring, not reached by wrap
  });
});
