// _scaleColGraph.ts — DEV-ONLY (research/ only; src/ NEVER imports this). E-2026-07-03-SCALECOL generalization fix.
// The committed _structColLib.buildRidgeGraph tracks slots by nearest-u top->down and treats every count DROP going
// down as a genuine BIRTH (retired slot), which fillConstantCount/rasterizer then PINS to the SEAM. That is correct
// for SFB (births ARE monotone + at the seam) but WRONG for styles whose extrema count OSCILLATES with t (a marginal
// boundary extremum flickers in/out — HarmonicRipple crest count wobbles 19<->20 46 times). The flicker fools the
// tracker into 46 spurious seam-births => 80mm chain drift => 61mm facets (DIAGNOSED _scaleColDiag).
//
// FIX (style-agnostic, no committed-lib edit): DE-FLICKER the per-row extrema to a CONSTANT count = the DOMINANT
// (mode/robust-max) count, so every row carries the SAME slot set. Where a marginal extremum is transiently missing
// on a row, its u is INTERPOLATED from the nearest rows that DO have it (the ridge continues smoothly through the
// degenerate row). A GENUINE birth (a persistent count step that stays for a run of rows, e.g. SFB's 4 petal births)
// is NOT flicker and is preserved: we detect persistence (a count level held for >= persistRows) and only track the
// slots present on a persistent level, so SFB's monotone births still produce the NaN-below-birth chains the seam
// pinning expects.
//
// Produces the SAME RidgeGraph shape as buildRidgeGraph so the committed rasterizeColumnsSquare / buildStructWall*
// consume it unchanged.

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import { rowExtrema } from './_structColLib';
import type { RidgeGraph } from './_structColLib';

const TAU = 2 * Math.PI;
function cyc(a: number, b: number): number { let d = Math.abs(a - b); if (d > 0.5) d = 1 - d; return d; }

/** robust dominant count = the value that is present on the MOST rows (mode). Ties -> the larger. */
function dominantCount(counts: number[]): number {
  const hist = new Map<number, number>();
  for (const c of counts) hist.set(c, (hist.get(c) ?? 0) + 1);
  let best = counts[0] ?? 0, bestN = -1;
  for (const [c, n] of hist) if (n > bestN || (n === bestN && c > best)) { best = c; bestN = n; }
  return best;
}

export interface DeflickerGraphResult extends RidgeGraph {
  /** diagnostics: crest/valley dominant count, how many rows were flicker-filled, whether genuine births were kept. */
  diag: { crestDominant: number; valleyDominant: number; crestFilledRows: number; valleyFilledRows: number; crestGenuineBirths: number; valleyGenuineBirths: number };
}

/** does a count level HOLD for a persistent run (>= persistRows consecutive smoothed rows)? A genuine birth creates a
 * NEW level that holds; a flicker never holds. Returns the set of levels that persist (sorted asc). */
function persistentLevels(smooth: number[], persistRows: number): number[] {
  const segs: Array<{ count: number; len: number }> = [];
  for (const c of smooth) { if (segs.length === 0 || segs[segs.length - 1].count !== c) segs.push({ count: c, len: 1 }); else segs[segs.length - 1].len++; }
  const set = new Set<number>();
  for (const s of segs) if (s.len >= persistRows) set.add(s.count);
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Build a ridge graph robust to extrema-count FLICKER. `persistFrac` = a count level must hold for >= persistFrac of
 * the rows to be a GENUINE level (else it is flicker and is de-flickered to the dominant count). For a style whose
 * count is essentially constant (HarmonicRipple, LowPolyFacet), the dominant level wins everywhere => constant-count
 * strips => trivially clean. For a style with genuine births (SFB), each PERSISTENT level is its own tracked segment
 * and the below-birth chains are pinned to the seam by the caller exactly as buildRidgeGraph did.
 */
export function buildRidgeGraphDeflicker(
  rA: AnalyticRadiusFn, H: number, ts: number[], scanN: number,
  opts: { persistFrac?: number } = {},
): DeflickerGraphResult {
  const nR = ts.length;
  const persistRows = Math.max(2, Math.floor((opts.persistFrac ?? 0.06) * nR));
  const crestRows: number[][] = ts.map((t) => rowExtrema(rA, t * H, 1, scanN));
  const valleyRows: number[][] = ts.map((t) => rowExtrema(rA, t * H, -1, scanN));

  const build = (rows: number[][]): { slotU: Float64Array[]; birthRow: number[]; birthU: number[]; nSlot: number; dominant: number; filled: number; genuineBirths: number } => {
    const counts = rows.map((r) => r.length);
    // find PERSISTENT count levels (held for >= persistRows consecutively). These are genuine births/deaths.
    // Smooth the count series by a running MODE over a window, then keep only levels that persist. A transient higher
    // count (a marginal boundary extremum that flickers in for 1-2 rows — HarmonicRipple's 20th crest) is NOT a
    // persistent level => it is dropped: nSlot is capped at the max PERSISTENT level, and each row is pickN'd down to
    // its persistent count. This makes a smooth ~constant-count style track a CONSTANT slot set => clean strips.
    const win = persistRows;
    const smoothRaw = counts.map((_, i) => {
      const lo = Math.max(0, i - win), hi = Math.min(nR - 1, i + win);
      return dominantCount(counts.slice(lo, hi + 1));
    });
    const levels = persistentLevels(smoothRaw, persistRows);
    const maxLevel = levels.length ? levels[levels.length - 1] : dominantCount(counts);
    // clamp the smoothed series to the nearest persistent level <= it (so a transient spike above maxLevel is dropped
    // to maxLevel; a persistent birth to a higher level is kept). If no persistent levels, use the dominant count.
    const smooth = smoothRaw.map((c) => {
      let best = levels.length ? levels[0] : dominantCount(counts);
      for (const L of levels) if (L <= c) best = L;
      if (!levels.length) best = dominantCount(counts);
      return best;
    });
    // segments of constant clamped-smoothed count
    const segs: Array<{ lo: number; hi: number; count: number }> = [];
    for (let i = 0; i < nR; i++) {
      if (segs.length === 0 || segs[segs.length - 1].count !== smooth[i]) segs.push({ lo: i, hi: i, count: smooth[i] });
      else segs[segs.length - 1].hi = i;
    }
    const dominant = dominantCount(counts);
    const genuineBirths = segs.length - 1;

    // TRACK: max clamped-smoothed count = number of slots. Track top->down by nearest-u greedy on the RAW extrema;
    // where the raw row has FEWER than its clamped count (flicker-out) we CARRY the above-u; where MORE (flicker-in),
    // pickN drops the extras. NaN only where the clamped count says the slot should not exist (below a genuine birth).
    const nSlot = maxLevel;
    const slotU: Float64Array[] = Array.from({ length: nR }, () => new Float64Array(nSlot).fill(NaN));
    // seed the top row from the smoothed-max row (the last row whose smoothed count == nSlot, nearest the top).
    let topSeedRow = nR - 1; for (let r = nR - 1; r >= 0; r--) if (smooth[r] === nSlot && rows[r].length >= nSlot) { topSeedRow = r; break; }
    const seedFeats = rows[topSeedRow].slice().sort((a, b) => a - b);
    // if the seed row has MORE raw extrema than nSlot (extra flicker), take the nSlot with the largest persistence —
    // approximate by evenly picking nSlot of them (they are sorted; drop the closest-pair extras).
    const seed = seedFeats.length === nSlot ? seedFeats : pickN(seedFeats, nSlot);
    for (let s = 0; s < nSlot; s++) slotU[topSeedRow][s] = seed[s];
    // fill rows ABOVE the seed (r > topSeedRow) and BELOW (r < topSeedRow) by nearest-u carry.
    const carry = (fromR: number, toR: number, step: number): void => {
      for (let r = fromR + step; step > 0 ? r <= toR : r >= toR; r += step) {
        const above = slotU[r - step];
        const activeSlots: number[] = []; for (let s = 0; s < nSlot; s++) if (!Number.isNaN(above[s])) activeSlots.push(s);
        // is this row below a genuine birth? slots beyond smooth[r] should be NaN (retired going down).
        const allowed = smooth[r];
        // raw extrema for this row, DROPPED to the allowed count (flicker-in extras removed by pickN so a transient
        // 20th crest never gets its own slot). If the raw row has FEWER than allowed (flicker-out) we carry below.
        let feats = rows[r];
        if (feats.length > allowed) feats = pickN(feats.slice().sort((a, b) => a - b), allowed);
        // greedy nearest-u match feats->activeSlots
        const usedSlot = new Array(nSlot).fill(false); const featUsed = new Array(feats.length).fill(false);
        const trip: Array<{ fi: number; s: number; d: number }> = [];
        for (let fi = 0; fi < feats.length; fi++) for (const s of activeSlots) trip.push({ fi, s, d: cyc(feats[fi], above[s]) });
        trip.sort((x, y) => x.d - y.d);
        for (const { fi, s } of trip) { if (featUsed[fi] || usedSlot[s]) continue; featUsed[fi] = true; usedSlot[s] = true; slotU[r][s] = feats[fi]; }
        // slots not matched this row: if we are still within the allowed count (flicker-out), CARRY the above-u
        // (the ridge continues through the degenerate row). If beyond allowed (genuine death going down), leave NaN.
        let activeKept = activeSlots.filter((s) => !Number.isNaN(slotU[r][s])).length;
        for (const s of activeSlots) {
          if (!Number.isNaN(slotU[r][s])) continue;
          if (activeKept < allowed) { slotU[r][s] = above[s]; activeKept++; } // flicker fill (carry)
          // else: genuine death — leave NaN (retired below here, going down)
        }
      }
    };
    carry(topSeedRow, nR - 1, +1); // upward (toward t=1)
    carry(topSeedRow, 0, -1);      // downward (toward t=0)

    // birthRow per slot = the LOWEST row index where the slot is non-NaN (first alive going up from the bottom).
    const birthRow = new Array<number>(nSlot).fill(0);
    for (let s = 0; s < nSlot; s++) { let br = 0; for (let r = 0; r < nR; r++) { if (!Number.isNaN(slotU[r][s])) { br = r; break; } } birthRow[s] = br; }
    const birthU = new Array<number>(nSlot).fill(NaN);
    for (let s = 0; s < nSlot; s++) birthU[s] = slotU[birthRow[s]][s];
    // count flicker-filled rows (rows whose raw count < nSlot but were filled)
    let filled = 0; for (let r = 0; r < nR; r++) if (rows[r].length < smooth[r]) filled++;
    return { slotU, birthRow, birthU, nSlot, dominant, filled, genuineBirths };
  };

  const c = build(crestRows), v = build(valleyRows);
  return {
    ts, nCrest: c.nSlot, nValley: v.nSlot,
    crestU: c.slotU, valleyU: v.slotU,
    crestBirthRow: c.birthRow, valleyBirthRow: v.birthRow,
    crestBirthU: c.birthU, valleyBirthU: v.birthU,
    diag: { crestDominant: c.dominant, valleyDominant: v.dominant, crestFilledRows: c.filled, valleyFilledRows: v.filled, crestGenuineBirths: c.genuineBirths, valleyGenuineBirths: v.genuineBirths },
  };
}

/** pick n of the sorted array, dropping the closest-pair extras (keep the most-spread n). */
function pickN(sorted: number[], n: number): number[] {
  const a = sorted.slice();
  while (a.length > n) {
    // drop the element that is closest (cyclically) to a neighbour
    let bi = 1, bd = Infinity;
    for (let i = 0; i < a.length; i++) { const d = cyc(a[i], a[(i + 1) % a.length]); if (d < bd) { bd = d; bi = (i + 1) % a.length; } }
    a.splice(bi, 1);
  }
  while (a.length < n) a.push(a[a.length - 1]); // pad (shouldn't happen)
  return a.sort((x, y) => x - y);
}
