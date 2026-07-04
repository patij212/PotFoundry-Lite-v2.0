// _pf_race_surfnative.test.ts — DEV-ONLY (PF_SN_RACE=1). E-2026-07-04-RACE-SURFNATIVE.
//
// SURFACE-NATIVE (restricted-Delaunay / protected-crest-1-feature) single-cusp PROXY vs the flat-UV paradigm, on ONE
// worst Gothic rib-crest cusp. See _pf_race_surfnativeLib.ts for the mechanism. The decisive discriminator (task):
// the flat-UV paradigm's worst-facet interior deviation is FLOORED (~0.080mm bridge chord, flank-pitch-INVARIANT,
// proven P0/P1/P2 = 0.0799/0.0801/0.0793). SURFACE-NATIVE predicts a QUALITATIVELY DIFFERENT SIGN: as the crest node
// count halves the pitch, the worst crest-adjacent interior deviation DECREASES monotonically (convergent), because
// the two flanks MEET at the apex and each interior is a smooth-flank chord that shrinks with size (NO bridging).
//
// KILL (pre-registered): interior ruler = max over a dense bary stencil of true-3D dist (bruteNearestOnRadialSurface).
//   CONFIRM iff (a) surface-native worst-N interior p50 <= 0.012 at baseline K, AND (b) slope strictly negative across
//   K x1->x2->x4 (each step >= 15% drop). Outliers-after -> 0.
//   REFUTE (Gothic definitively steep-EXCLUDE from the DOMAIN side too, corroborating E-GF-GOTHIC) iff surface-native
//   floors > 0.02 with |slope| < 10% across the 4x sweep => even a facet meeting AT the apex cannot get its flank
//   interior below tol in ANY domain => genuine designed-sharp feature, not a representation limit.
//   NO-OP iff it matches the flat-UV floor to within 10% (the split buys nothing).
// A clean refutation is a valid, valuable result. Do NOT force a pass.
//
// ISOLATION: NEW files only. Reuses labkit rulers + _pf_race_surfnativeLib READ-ONLY. Writes ONLY
// research/exchange/_pf_race_surfnative/. Env sub-gate + row-exists skip => resumable; checkpoint each row INSTANTLY.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, type AnalyticRadiusFn } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import {
  findSharpestCrest, buildFlatUvGrid, buildSurfaceNativeNoBridge, buildSurfaceNativeGraded, scoreInterior, type CuspWindow,
} from './_pf_race_surfnativeLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const STYLE = 'GothicArches' as StyleId;
const R_MEAN = 48;
const TOL = 0.01;
const WORST_N = 40; // worst-N crest-adjacent facets for the slope statistic (patch is small => 40 not 200)
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_race_surfnative');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');

const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); const line = `[${new Date().toISOString()}] ${msg}`; appendFileSync(PROG, line + '\n'); /* eslint-disable-next-line no-console */ console.log(line); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CHECKPOINT ${row.key}] ${JSON.stringify(row)}`); };

// Build the cusp window: sharpest crest in a representative rib row, +/- ~0.6 bay in u, short axial t-strip.
function makeWindow(rA: AnalyticRadiusFn): CuspWindow {
  const tMid = 0.62;
  const { uApex, nCrests } = findSharpestCrest(rA, tMid, H, R_MEAN);
  const bayDu = 1 / nCrests;
  const halfDu = bayDu * 0.55;               // reach toward both adjacent valleys
  // axial strip: 0.6mm tall in z => in t units, 0.6/H each side of tMid (a short rib segment; crest u nearly const)
  const dt = 0.6 / H;
  plog(`window: uApex=${uApex.toFixed(6)} nCrests=${nCrests} bayDu=${bayDu.toFixed(5)} halfDu=${halfDu.toFixed(5)} tBand=[${(tMid - dt).toFixed(5)},${(tMid + dt).toFixed(5)}]`);
  return { uApex, halfDu, t0: tMid - dt, t1: tMid + dt, rMean: R_MEAN, H };
}

// Node-budget-matched levels. K = crest node count (t-rows); the swept lever. nT/nFlank scale so BEFORE/AFTER have
// comparable node counts at each level. Levels double K each step to expose the slope sign.
interface Level { key: string; K: number; nFlank: number; nT: number; nU: number; }
const LEVELS: Level[] = [
  // baseline (x1), x2, x4 crest-node density. nU (flat-UV u-res) and nFlank (per-flank u-res) kept comparable across
  // the two meshes at each level so the comparison is at equal spatial budget; only the crest handling differs. Kept
  // moderate (patch mechanism-demo, not a full mesh) so the pre-filtered brute ruler stays tractable per level.
  { key: 'K1', K: 12, nFlank: 8, nT: 12, nU: 16 },
  { key: 'K2', K: 24, nFlank: 16, nT: 24, nU: 32 },
  { key: 'K4', K: 48, nFlank: 32, nT: 48, nU: 64 },
];

describe('sn-race: surface-native no-bridge vs flat-UV on one Gothic cusp', () => {
  // RULER: full-azimuth brute (2048x120, calibrated to agree with 4096x600 to 2e-5mm at 227ms/call — see
  // _pf_race_sn_time.test.ts). A narrow-window LOCAL ruler OVERSTATED by 0.016mm on this cusp (the flat-facet nearest
  // foot can lie several bays away), so brute is the only trusted anchor here.
  for (const lv of LEVELS) {
    it.skipIf(process.env.PF_SN_RACE !== '1')(`level ${lv.key}`, () => {
      if (rowExists(lv.key)) { plog(`${lv.key} exists, skip`); return; }
      const rA = buildRadiusFn(STYLE, {}, DIMS);
      const win = makeWindow(rA);

      // BEFORE — flat-UV uniform grid (triangles straddle the apex)
      const t0b = Date.now();
      const flat = buildFlatUvGrid(win, lv.nU, lv.nT);
      const flatScore = scoreInterior(rA, flat, H, TOL, WORST_N);
      plog(`${lv.key} FLAT: tris=${flat.tris.length / 3} outliers=${flatScore.nOutliers} p50=${flatScore.p50.toFixed(4)} p99=${flatScore.p99.toFixed(4)} max=${flatScore.maxMm.toFixed(4)} worstNp50=${flatScore.worstNp50.toFixed(4)} in ${((Date.now() - t0b) / 1000).toFixed(0)}s`);

      // AFTER — surface-native no-bridge (crest = protected 1-feature, flanks meet at apex)
      const t0a = Date.now();
      const sn = buildSurfaceNativeNoBridge(rA, win, lv.nFlank, lv.K);
      const snScore = scoreInterior(rA, sn, H, TOL, WORST_N);
      plog(`${lv.key} SN:   tris=${sn.tris.length / 3} outliers=${snScore.nOutliers} p50=${snScore.p50.toFixed(4)} p99=${snScore.p99.toFixed(4)} max=${snScore.maxMm.toFixed(4)} worstNp50=${snScore.worstNp50.toFixed(4)} in ${((Date.now() - t0a) / 1000).toFixed(0)}s`);

      const row = {
        key: lv.key, K: lv.K, nFlank: lv.nFlank, nT: lv.nT, nU: lv.nU, tolMm: TOL,
        flatTris: flat.tris.length / 3, flatOutliers: flatScore.nOutliers,
        flatP50: +flatScore.p50.toFixed(4), flatP99: +flatScore.p99.toFixed(4), flatMax: +flatScore.maxMm.toFixed(4), flatWorstNp50: +flatScore.worstNp50.toFixed(4),
        snTris: sn.tris.length / 3, snOutliers: snScore.nOutliers,
        snP50: +snScore.p50.toFixed(4), snP99: +snScore.p99.toFixed(4), snMax: +snScore.maxMm.toFixed(4), snWorstNp50: +snScore.worstNp50.toFixed(4),
      };
      checkpoint(row);
      expect(flat.tris.length).toBeGreaterThan(0);
      expect(sn.tris.length).toBeGreaterThan(0);
    }, 60 * 60 * 1000);
  }
});

// GRADED sweep: surface-native no-bridge with ARC-LENGTH-GRADED flank columns (density clustered where the flank is
// near-vertical — the restricted-Delaunay facet-interior-criterion proxy). The uniform-strip SN FLOORED at ~0.06 on
// the FIRST near-crest flank cell (SN-DIAG: 40/40 worst = flankNearCrest). This tests whether ADAPTIVE near-crest
// density crosses 0.012 — the true completion of the mechanism claim.
describe('sn-race-graded: arc-length-graded flank vs uniform', () => {
  for (const lv of LEVELS) {
    const gk = `G-${lv.key}`;
    it.skipIf(process.env.PF_SN_RACE !== '1')(`graded ${lv.key}`, () => {
      if (rowExists(gk)) { plog(`${gk} exists, skip`); return; }
      const rA = buildRadiusFn(STYLE, {}, DIMS);
      const win = makeWindow(rA);
      const t0 = Date.now();
      const g = buildSurfaceNativeGraded(rA, win, lv.nFlank, lv.K);
      const gs = scoreInterior(rA, g, H, TOL, WORST_N);
      plog(`${gk} GRADED: tris=${g.tris.length / 3} outliers=${gs.nOutliers} p50=${gs.p50.toFixed(4)} p99=${gs.p99.toFixed(4)} max=${gs.maxMm.toFixed(4)} worstNp50=${gs.worstNp50.toFixed(4)} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      checkpoint({
        key: gk, K: lv.K, nFlank: lv.nFlank, tolMm: TOL,
        gradedTris: g.tris.length / 3, gradedOutliers: gs.nOutliers,
        gradedP50: +gs.p50.toFixed(4), gradedP99: +gs.p99.toFixed(4), gradedMax: +gs.maxMm.toFixed(4), gradedWorstNp50: +gs.worstNp50.toFixed(4),
      });
      expect(g.tris.length).toBeGreaterThan(0);
    }, 60 * 60 * 1000);
  }
});
