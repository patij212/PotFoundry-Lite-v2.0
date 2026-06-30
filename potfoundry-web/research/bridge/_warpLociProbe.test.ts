// _warpLociProbe.test.ts — DEV-ONLY (env PF_WARPLOCI=1). D1 discriminator for E-2026-06-30-FEAT-CONFORM-WARP.
//
// MEASURE-ONLY (no mesh build, no src/ edits). Classifies WHY the warp/weave/hash family (BasketWeave,
// CelticKnot) regresses under feature-conforming: (a) bilinear styleSampler under-resolution of the loci
// LOCATION, (b) the 1D axis-aligned perpendicular extremum refinement landing the injected/constraint vertex
// off the TRUE local radial extremum, or (c) an analytic-rA-vs-warp surface mismatch.
//
// (c) is refuted BY CONSTRUCTION in the lab: the metric rA (buildRadiusFn) and the loci-source sampler
// (styleSampler) both evaluate the SAME STYLE_FUNCTIONS[styleId]. This probe MEASURES (a) and (b) directly:
//
//   For each style, extract the dense loci (denseFeatureGroundTruth via styleSampler), then for every locus
//   sample:
//     • refine1D move  = the existing makeRefiner.refine move (mm) — how far the bilinear loci sat off the
//       1D-axis-aligned-perpendicular extremum.
//     • residual2D     = |r(refined1D) − r(localExtremum2D)| where localExtremum2D is found by a small dense
//       2D (u,t) grid search + golden polish around the loci point on the RAW rA. If refine1D landed on the
//       true extremum, residual2D ≈ 0; if it converged to the WRONG extremum (adjacent strand / along-strand),
//       residual2D is LARGE. residual2D > tol on a material fraction ⇒ (b) is real.
//     • move2D         = |refined2D − loci| (mm) — how far the 2D search moved the loci (the fix's reach).
//   And the (a) probe: re-extract loci at truthRes 384→768 / gridRes 1024→2048 and measure the median nearest
//   (u,t) shift of the loci in mm (a large shift ⇒ the loci LOCATION is sampler-resolution-bound = (a)).
//
// Run: PF_WARPLOCI=1 npx vitest run research/bridge/_warpLociProbe.test.ts
import { describe, it, expect } from 'vitest';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildFeatureTruth } from './featureLocalizedFidelity';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };

// Styles: the 2 warp representatives + 2 clean-win controls (where conforming HELPS) + GothicArches (the
// genuine thin-ridge, also helps). If (b) is the cause, ONLY the warp styles show large residual2D.
const STYLES: StyleId[] = ['BasketWeave', 'CelticKnot', 'GyroidManifold', 'BambooSegments', 'GothicArches', 'LowPolyFacet'];

/** raw rA radius at (u,t) with periodic u + clamped t. */
function makeRadAt(rA: AnalyticRadiusFn, H: number): (u: number, t: number) => number {
  return (u: number, t: number): number => {
    let uu = u - Math.floor(u); if (uu < 0) uu += 1;
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    return rA(TAU * uu, tc * H);
  };
}

/** Per-t-row mean radius (256 u-samples), memoized — the crest/valley sign reference. */
function makeRowMean(rA: AnalyticRadiusFn, H: number): (t: number) => number {
  const cache = new Map<number, number>();
  return (t: number): number => {
    const key = Math.round(t * 4096);
    const c = cache.get(key); if (c !== undefined) return c;
    const z = t * H; let s = 0; const N = 256;
    for (let i = 0; i < N; i++) s += rA(TAU * (i / N), z);
    const m = s / N; cache.set(key, m); return m;
  };
}

/** Shortest periodic du in [-0.5,0.5). */
function periodicDu(u1: number, u0: number): number {
  let du = u1 - u0; if (du > 0.5) du -= 1; else if (du < -0.5) du += 1; return du;
}

// ---------------------------------------------------------------------------
// EXISTING 1D refiner (copy of makeRefiner.refine semantics from featureConformingMesh.ts) — so the probe
// measures EXACTLY what the conforming pass does today, without importing the private factory.
// ---------------------------------------------------------------------------
function refine1D(
  radAt: (u: number, t: number) => number, uToMm: number, tToMm: number, searchHalfMm: number,
  u0: number, t0: number, perpU: number, perpT: number, seekMax: boolean,
): { u: number; t: number; moveMm: number } {
  const pxMm = perpU * uToMm, pyMm = perpT * tToMm;
  const pl = Math.hypot(pxMm, pyMm) || 1;
  const duPerMm = perpU / pl, dtPerMm = perpT / pl;
  const f = (sMm: number): number => { const v = radAt(u0 + duPerMm * sMm, t0 + dtPerMm * sMm); return seekMax ? v : -v; };
  const GR = (Math.sqrt(5) - 1) / 2;
  const STEPS = 16;
  let bestS = 0, bestV = f(0);
  for (let k = -STEPS; k <= STEPS; k++) { const sMm = (k / STEPS) * searchHalfMm; const v = f(sMm); if (v > bestV) { bestV = v; bestS = sMm; } }
  const w = searchHalfMm / STEPS;
  let a = bestS - w, b = bestS + w;
  let c = b - GR * (b - a), d = a + GR * (b - a);
  let fc = f(c), fd = f(d);
  for (let it = 0; it < 24; it++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - GR * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + GR * (b - a); fd = f(d); }
    if (b - a < 1e-4) break;
  }
  const sBest = (a + b) / 2;
  let uN = u0 + duPerMm * sBest, tN = t0 + dtPerMm * sBest;
  uN -= Math.floor(uN); tN = tN < 0 ? 0 : tN > 1 ? 1 : tN;
  return { u: uN, t: tN, moveMm: Math.abs(sBest) };
}

// ---------------------------------------------------------------------------
// 2D LOCAL extremum search on raw rA: dense (u,t) grid scan within ±halfMm (mm) in BOTH directions, then a few
// coordinate-descent golden polishes. crest = max radius, valley = min radius (by rowMean sign at the seed).
// This is the GROUND TRUTH for "where the true local feature is" — the fix's target.
// ---------------------------------------------------------------------------
function extremum2D(
  radAt: (u: number, t: number) => number, uToMm: number, tToMm: number, halfMm: number,
  u0: number, t0: number, seekMax: boolean,
): { u: number; t: number; r: number; moveMm: number } {
  const sgn = seekMax ? 1 : -1;
  const duMm = 1 / uToMm, dtMm = 1 / tToMm; // (u,t) per mm
  const G = 9; // 19x19 dense grid over ±halfMm
  let bu = u0, bt = t0, bv = sgn * radAt(u0, t0);
  for (let iu = -G; iu <= G; iu++) {
    for (let it = -G; it <= G; it++) {
      const u = u0 + duMm * (iu / G) * halfMm, t = t0 + dtMm * (it / G) * halfMm;
      const v = sgn * radAt(u, t);
      if (v > bv) { bv = v; bu = u; bt = t; }
    }
  }
  // coordinate-descent golden polish (alternate u, t), small window around the grid best.
  const GR = (Math.sqrt(5) - 1) / 2;
  const polish = (axisU: boolean): void => {
    const stepMm = (halfMm / G) * 1.5;
    let a = (axisU ? bu : bt) - (axisU ? duMm : dtMm) * stepMm;
    let b = (axisU ? bu : bt) + (axisU ? duMm : dtMm) * stepMm;
    const at = (x: number): number => sgn * radAt(axisU ? x : bu, axisU ? bt : x);
    let c = b - GR * (b - a), d = a + GR * (b - a);
    let fc = at(c), fd = at(d);
    for (let i = 0; i < 20; i++) {
      if (fc > fd) { b = d; d = c; fd = fc; c = b - GR * (b - a); fc = at(c); }
      else { a = c; c = d; fc = fd; d = a + GR * (b - a); fd = at(d); }
      if (Math.abs(b - a) < (axisU ? duMm : dtMm) * 1e-3) break;
    }
    const xb = (a + b) / 2;
    if (axisU) bu = xb; else bt = xb;
    bv = sgn * radAt(bu, bt);
  };
  for (let r = 0; r < 3; r++) { polish(true); polish(false); }
  let uN = bu - Math.floor(bu); const tN = bt < 0 ? 0 : bt > 1 ? 1 : bt;
  void uN;
  const dU = periodicDu(bu, u0) * uToMm, dT = (bt - t0) * tToMm;
  return { u: bu - Math.floor(bu), t: tN, r: sgn * bv, moveMm: Math.hypot(dU, dT) };
}

interface ProbeRow {
  style: string; loci: number; samples: number;
  // refine1D stats
  move1D_mean: number; move1D_p99: number;
  // 2D-vs-1D residual: how far the 1D-refined point's radius is BELOW the true 2D local extremum (mm).
  // crest: r2D − r1D ≥ 0 (1D under-shoots the true peak). valley: r1D − r2D ≥ 0.
  resid2D_mean: number; resid2D_p99: number; resid2D_frac_gt_floor: number;
  // 2D move from the bilinear loci (the fix's reach)
  move2D_mean: number; move2D_p99: number;
  // (a) loci-shift under sampler resolution doubling
  lociShift_median_mm: number; lociShift_p90_mm: number;
}

function pctl(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * a.length))];
}
function mean(arr: number[]): number { if (!arr.length) return 0; let s = 0; for (const x of arr) s += x; return s / arr.length; }

describe('warp loci mis-location probe (D1)', () => {
  it.skipIf(process.env.PF_WARPLOCI !== '1')('classify (a) sampler-res vs (b) 1D-refine vs (c) surface mismatch', () => {
    const FLOOR_MM = 0.05; // a residual2D above this = the 1D refine landed materially off the true extremum
    const SEARCH_HALF_MM = 0.6; // same as the conforming pass default searchHalfMm
    const INJECT_STEP_MM = 0.08; // same as the all-20 screen injectStepMm
    const rows: ProbeRow[] = [];

    for (const style of STYLES) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const radAt = makeRadAt(rA, DIMS.H);
      const rowMean = makeRowMean(rA, DIMS.H);

      // --- loci at the production truthRes (384) ---
      const truth = buildFeatureTruth(style, {}, DIMS, 384);
      const uToMm = truth.uToMm, tToMm = DIMS.H;

      const move1D: number[] = [], resid2D: number[] = [], move2D: number[] = [];
      let nSamp = 0;
      // Cap total samples for tractability: stride the lines so heavy styles stay ~50k samples.
      const lineStride = Math.max(1, Math.ceil(truth.lines.length / 40000));
      let li = 0;
      for (const line of truth.lines) {
        if (li++ % lineStride !== 0) continue;
        const pts = line.points;
        for (let i = 0; i + 1 < pts.length; i++) {
          const u0 = pts[i].u, u1 = pts[i + 1].u, t0 = pts[i].t, t1 = pts[i + 1].t;
          const du = periodicDu(u1, u0), dt = t1 - t0;
          const lenMm = Math.hypot(du * uToMm, dt * tToMm);
          if (lenMm < 1e-9) continue;
          const txMm = du * uToMm, tyMm = dt * tToMm;
          const tl = Math.hypot(txMm, tyMm) || 1;
          const perpU = (-tyMm / tl) / uToMm, perpT = (txMm / tl) / tToMm;
          const n = Math.max(1, Math.ceil(lenMm / INJECT_STEP_MM));
          // sample only the MIDPOINT of each segment (the segments are short 1-cell edges) to bound cost.
          const ff = 0.5;
          let u = u0 + du * ff; u -= Math.floor(u);
          const t = t0 + dt * ff;
          const seekMax = radAt(u, t) >= rowMean(t);
          const r1 = refine1D(radAt, uToMm, tToMm, SEARCH_HALF_MM, u, t, perpU, perpT, seekMax);
          const e2 = extremum2D(radAt, uToMm, tToMm, SEARCH_HALF_MM, u, t, seekMax);
          const r1r = radAt(r1.u, r1.t);
          // residual2D: how much BETTER the 2D extremum is than the 1D-refined point (always ≥ 0 by def).
          const better = seekMax ? (e2.r - r1r) : (r1r - e2.r);
          move1D.push(r1.moveMm);
          resid2D.push(Math.max(0, better));
          move2D.push(e2.moveMm);
          nSamp++;
          void n;
        }
      }

      // --- (a) loci-shift: re-extract at higher sampler+truth res, measure nearest (u,t) shift in mm ---
      const truthHi = buildFeatureTruthHiRes(style);
      const shift = lociShiftMm(truth.lines, truthHi.lines, uToMm, tToMm);

      const residFrac = resid2D.length ? resid2D.filter((x) => x > FLOOR_MM).length / resid2D.length : 0;
      rows.push({
        style: String(style), loci: truth.lines.length, samples: nSamp,
        move1D_mean: mean(move1D), move1D_p99: pctl(move1D, 0.99),
        resid2D_mean: mean(resid2D), resid2D_p99: pctl(resid2D, 0.99), resid2D_frac_gt_floor: residFrac,
        move2D_mean: mean(move2D), move2D_p99: pctl(move2D, 0.99),
        lociShift_median_mm: shift.median, lociShift_p90_mm: shift.p90,
      });
    }

    // eslint-disable-next-line no-console
    console.log('\n=== D1 WARP LOCI PROBE (FLOOR_MM=0.05, searchHalf=0.6, step=0.08) ===\n');
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log(
        `${r.style.padEnd(16)} loci=${String(r.loci).padStart(6)} samp=${String(r.samples).padStart(6)} ` +
        `move1D=${r.move1D_mean.toFixed(3)}/${r.move1D_p99.toFixed(3)} ` +
        `RESID2D=${r.resid2D_mean.toFixed(3)}/${r.resid2D_p99.toFixed(3)} frac>${'0.05'}=${(100 * r.resid2D_frac_gt_floor).toFixed(1)}% ` +
        `move2D=${r.move2D_mean.toFixed(3)}/${r.move2D_p99.toFixed(3)} ` +
        `lociShift(384->768)=${r.lociShift_median_mm.toFixed(3)}/${r.lociShift_p90_mm.toFixed(3)}mm`,
      );
    }
    // eslint-disable-next-line no-console
    console.log('\n=== JSON ===\n' + JSON.stringify(rows, null, 1));
    expect(rows.length).toBe(STYLES.length);
  }, 60 * 60 * 1000);
});

// Higher-resolution loci extraction (the (a) probe). styleSampler gridResU/T is hardcoded to 1024 inside
// buildFeatureTruth, so to double it we re-evaluate via a local copy that bumps both grids. Kept minimal.
import { styleSampler, type StyleSamplerDims } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { denseFeatureGroundTruth } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/groundTruth';
import { DEFAULT_STYLE_PARAMS } from '../../src/geometry/types';
import type { FeatureLine } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';

function buildFeatureTruthHiRes(styleId: StyleId): { lines: FeatureLine[]; uToMm: number } {
  const dims: StyleSamplerDims = { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb, expn: DIMS.expn, gridResU: 2048, gridResT: 2048 };
  const sampler = styleSampler(styleId, { ...DEFAULT_STYLE_PARAMS[styleId] }, dims);
  let circ = 0; const [x0, y0] = sampler.position(0, 0.5); let px = x0, py = y0; const N = 1024;
  for (let i = 1; i <= N; i++) { const [cx, cy] = sampler.position((i / N) % 1, 0.5); circ += Math.hypot(cx - px, cy - py); px = cx; py = cy; }
  const lines = denseFeatureGroundTruth(sampler, { res: 768, uToMm: circ, tToMm: DIMS.H });
  return { lines, uToMm: circ };
}

/** Median + p90 nearest-locus-point shift (mm) from the lo-res loci midpoints to the hi-res loci midpoints. */
function lociShiftMm(lo: FeatureLine[], hi: FeatureLine[], uToMm: number, tToMm: number): { median: number; p90: number } {
  // Build a coarse spatial hash of hi-res midpoints in mm (periodic u).
  const cell = 0.3;
  const grid = new Map<string, Array<{ xm: number; ym: number }>>();
  const mid = (line: FeatureLine): { u: number; t: number } | null => {
    const p = line.points; if (p.length < 2) return null;
    let du = p[1].u - p[0].u; if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
    let u = p[0].u + du * 0.5; u -= Math.floor(u);
    return { u, t: (p[0].t + p[1].t) / 2 };
  };
  for (const line of hi) {
    const m = mid(line); if (!m) continue;
    const xm = m.u * uToMm, ym = m.t * tToMm;
    const k = `${Math.floor(xm / cell)},${Math.floor(ym / cell)}`;
    const arr = grid.get(k); if (arr) arr.push({ xm, ym }); else grid.set(k, [{ xm, ym }]);
  }
  const wrapDx = (dx: number): number => { if (dx > uToMm / 2) dx -= uToMm; else if (dx < -uToMm / 2) dx += uToMm; return dx; };
  const dists: number[] = [];
  const stride = Math.max(1, Math.ceil(lo.length / 20000));
  let i = 0;
  for (const line of lo) {
    if (i++ % stride !== 0) continue;
    const m = mid(line); if (!m) continue;
    const xm = m.u * uToMm, ym = m.t * tToMm;
    const bx = Math.floor(xm / cell), by = Math.floor(ym / cell);
    let best = Infinity;
    for (let gx = bx - 2; gx <= bx + 2; gx++) for (let gy = by - 2; gy <= by + 2; gy++) {
      const arr = grid.get(`${gx},${gy}`); if (!arr) continue;
      for (const q of arr) { const dx = wrapDx(q.xm - xm), dy = q.ym - ym; const d = Math.hypot(dx, dy); if (d < best) best = d; }
    }
    if (isFinite(best)) dists.push(best);
  }
  dists.sort((a, b) => a - b);
  const median = dists.length ? dists[Math.floor(0.5 * dists.length)] : 0;
  const p90 = dists.length ? dists[Math.floor(0.9 * dists.length)] : 0;
  return { median, p90 };
}
