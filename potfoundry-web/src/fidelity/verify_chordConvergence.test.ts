/**
 * verify_chordConvergence.test.ts — does triangle density drive the export's
 * deviation from the TRUE surface below tolerance (user goal), and HIGHER-
 * FIDELITY measurement of it.
 *
 * Two upgrades over verify_exportSurfaceFidelity (which sampled only 4 points
 * /triangle and under-reported the max):
 *   - DENSE barycentric interior sampling (N=16 => 153 pts/triangle) of the
 *     worst triangles => the TRUE max chord deviation, not a 4-point estimate.
 *   - exact f64 vertex eval (isolates CHORD error from the sampler error already
 *     characterised), seam + u-wrap chords excluded (the ~150mm out-of-scope
 *     artifact).
 *
 * PART A: real triangulator mesh at L7 + L8 — true (dense) max chord deviation,
 *         with the 4-point estimate alongside (shows the fidelity gain).
 * PART B: across-crest convergence — at the steepest crest, sweep the cross-crest
 *         cell width du=1/2^k and dense-measure the flank chord error, to read the
 *         convergence rate (cusp ~linear vs smooth ~quadratic) and whether it
 *         reaches <0.1mm at feasible density.
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { clipFeaturesToBox } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import type { QuadLeaf } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import type { QuadtreeLike } from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import { SfbWallSampler, SFB1_PACKED, SFB_DIMS, SFB_UBIAS } from './snapPlacementAudit';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);
type V3 = readonly [number, number, number];
const P = (u: number, t: number): V3 => exact.position(u, t);
function mOf(t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return p[1] + (p[2] - p[1]) * Math.pow(tc, Math.max(p[3], 1e-4));
}

/** 4-point chord deviation (cheap rank): max{centroid,3 edge-mids}. */
function chord4(ua: number, ta: number, ub: number, tb: number, uc: number, tc: number): number {
  const Va = P(ua, ta), Vb = P(ub, tb), Vc = P(uc, tc);
  const pts: Array<[number, number, V3]> = [
    [(ua + ub + uc) / 3, (ta + tb + tc) / 3, [(Va[0] + Vb[0] + Vc[0]) / 3, (Va[1] + Vb[1] + Vc[1]) / 3, (Va[2] + Vb[2] + Vc[2]) / 3]],
    [(ua + ub) / 2, (ta + tb) / 2, [(Va[0] + Vb[0]) / 2, (Va[1] + Vb[1]) / 2, (Va[2] + Vb[2]) / 2]],
    [(ub + uc) / 2, (tb + tc) / 2, [(Vb[0] + Vc[0]) / 2, (Vb[1] + Vc[1]) / 2, (Vb[2] + Vc[2]) / 2]],
    [(ua + uc) / 2, (ta + tc) / 2, [(Va[0] + Vc[0]) / 2, (Va[1] + Vc[1]) / 2, (Va[2] + Vc[2]) / 2]],
  ];
  let m = 0;
  for (const [su, st, fl] of pts) { const tr = P(su, st); const d = Math.hypot(fl[0] - tr[0], fl[1] - tr[1], fl[2] - tr[2]); if (d > m) m = d; }
  return m;
}
/** Dense barycentric chord deviation (N inner divisions => (N+1)(N+2)/2 pts). */
function chordDense(ua: number, ta: number, ub: number, tb: number, uc: number, tc: number, N: number): number {
  const Va = P(ua, ta), Vb = P(ub, tb), Vc = P(uc, tc);
  let m = 0;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N - i; j++) {
      const a = i / N, b = j / N, c = 1 - a - b;
      const su = a * ua + b * ub + c * uc, st = a * ta + b * tb + c * tc;
      const fx = a * Va[0] + b * Vb[0] + c * Vc[0], fy = a * Va[1] + b * Vb[1] + c * Vc[1], fz = a * Va[2] + b * Vb[2] + c * Vc[2];
      const tr = P(su, st);
      const d = Math.hypot(fx - tr[0], fy - tr[1], fz - tr[2]);
      if (d > m) m = d;
    }
  }
  return m;
}

function uniformAnisoQuadtree(level: number, uBias: number): QuadtreeLike {
  const uSpan = 1 << (level + uBias), tSpan = 1 << level;
  const leaves: QuadLeaf[] = [];
  for (let it = 0; it < tSpan; it++) for (let iu = 0; iu < uSpan; iu++) leaves.push({ u0: iu / uSpan, t0: it / tSpan, level });
  return { leaves: () => leaves, uBias: () => uBias };
}

describe('VERIFY chord convergence (dense, exact eval) vs the true surface', () => {
  it('PART A: real-mesh true (dense) max chord deviation, L7 + L8', () => {
    for (const level of [7, 8]) {
      const cornerSnap = 0.06 / (1 << level), uMargin = 1.5 / (1 << level), tMargin = 1 / 1024;
      const graph = extractAnalyticFeatures('SuperformulaBlossom', p, { H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb });
      const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);
      const mesh = triangulateQuadtreeWithFeatures(uniformAnisoQuadtree(level, SFB_UBIAS), clipped, { cornerSnap });
      const v = mesh.vertices, idx = mesh.indices;
      const seam = 1.5 / (1 << (level + SFB_UBIAS));
      // 4-point rank, seam/wrap excluded.
      const tris: Array<{ i: number; e4: number }> = [];
      let max4 = 0, above01_4 = 0, total = 0;
      for (let i = 0; i + 2 < idx.length; i += 3) {
        const a = idx[i], b = idx[i + 1], c = idx[i + 2];
        const ua = v[a * 3], ub = v[b * 3], uc = v[c * 3];
        const cu = ((ua + ub + uc) / 3 % 1 + 1) % 1;
        if (cu < seam || cu > 1 - seam) continue;
        if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) continue; // wrap chord
        const e4 = chord4(ua, v[a * 3 + 1], ub, v[b * 3 + 1], uc, v[c * 3 + 1]);
        tris.push({ i, e4 });
        total++;
        if (e4 > max4) max4 = e4;
        if (e4 > 0.1) above01_4++;
      }
      tris.sort((x, y) => y.e4 - x.e4);
      const K = Math.min(3000, tris.length);
      let maxDense = 0;
      for (let r = 0; r < K; r++) {
        const i = tris[r].i, a = idx[i], b = idx[i + 1], c = idx[i + 2];
        const d = chordDense(v[a * 3], v[a * 3 + 1], v[b * 3], v[b * 3 + 1], v[c * 3], v[c * 3 + 1], 16);
        if (d > maxDense) maxDense = d;
      }
      /* eslint-disable no-console */
      console.log(`\n[PART A] L${level} (exact eval, seam excl, n=${total} tris):`);
      console.log(`   4-point estimate: max ${max4.toFixed(3)}mm, >0.1mm ${(100 * above01_4 / total).toFixed(2)}%`);
      console.log(`   DENSE (true) max chord over worst ${K}: ${maxDense.toFixed(3)}mm  (4-pt under-reported by ${(maxDense - max4).toFixed(3)}mm)`);
      /* eslint-enable no-console */
      expect(total).toBeGreaterThan(1000);
    }
  });

  it('PART B: across-crest convergence — flank chord error vs cell width du', () => {
    // steepest crest band: t around 0.25; pick the fastest-sweeping crest there.
    const t0 = 0.25;
    const m0 = mOf(t0);
    // crest j nearest u=0.5 (mid, well clear of seam).
    let jBest = 1, best = 1;
    for (let j = 1; (2 * j - 1) / (2 * m0) < 0.95; j++) { const u = (2 * j - 1) / (2 * m0); if (Math.abs(u - 0.5) < Math.abs(best - 0.5)) { best = u; jBest = j; } }
    /* eslint-disable no-console */
    console.log(`\n[PART B] across-crest convergence at t=${t0}, crest j=${jBest} (u=${best.toFixed(4)}), exact eval, dense N=24:`);
    let prev = 0;
    for (let k = 9; k <= 15; k++) {
      const dt = 1 / 128; // fixed along-crest height (one L7 t-row)
      const du = 1 / (1 << k); // cross-crest cell width
      const t1 = t0 + dt;
      const uc0 = (2 * jBest - 1) / (2 * mOf(t0)), uc1 = (2 * jBest - 1) / (2 * mOf(t1));
      // +flank quad: crest edge (uc0,t0)-(uc1,t1), outer edge +du. Two triangles.
      const d1 = chordDense(uc0, t0, uc0 + du, t0, uc1 + du, t1, 24);
      const d2 = chordDense(uc0, t0, uc1 + du, t1, uc1, t1, 24);
      const dmax = Math.max(d1, d2);
      const ratio = prev > 0 ? prev / dmax : 0;
      console.log(`   du=1/2^${k} (${(du * 2 * Math.PI * 75).toFixed(3)}mm circ): flank chord ${dmax.toFixed(4)}mm` + (ratio ? `  (x${ratio.toFixed(2)} per halving => ${ratio > 3.4 ? 'quadratic/smooth' : 'sub-quadratic/cusp'})` : ''));
      prev = dmax;
    }
    /* eslint-enable no-console */
    expect(jBest).toBeGreaterThan(0);
  });
});
