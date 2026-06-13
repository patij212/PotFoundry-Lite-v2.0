/**
 * verify_edgeVsFlank_adaptive.test.ts — DECISIVE edge-vs-sizing split on the REAL
 * ADAPTIVE production mesh (not the uniform-L7 simplification of PART C).
 *
 * Question (user, audit-first): on the real adaptive conforming mesh, is EVERY
 * >0.1mm triangle a STRADDLE (a feature locus crosses its interior = an EDGE
 * problem, Tasks 4-7) — confirming edges are the SOLE residual — or do FLANK
 * (no-feature) cells also exceed tol (a SIZING problem, Task 3)?
 *
 * Faithful adaptive mesh (production 'high' opts): real MetricSizingField(256) →
 * PeriodicBalancedQuadtree(maxLevel 12, uBias, featureRefine level 7) →
 * triangulateQuadtreeWithFeatures(real extracted features). targetScale=1 (the
 * sag floor) is the production mesh for SFB@1 (~381k tris, well under the 6M cap,
 * so no cap-coarsening). Exact SfbWallSampler eval, seam excluded.
 *
 * `segHitsBox` + `buildFeatureIntersector` are replicated verbatim from
 * ConformingWall.ts (not exported) so the featureRefine matches production.
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import { extractAnalyticFeatures, sfRf } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { clipFeaturesToBox } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import { MetricSizingField } from '../renderers/webgpu/parametric/conforming/MetricSizingField';
import { PeriodicBalancedQuadtree } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { SfbWallSampler, SFB1_PACKED, SFB_DIMS, SFB_UBIAS } from './snapPlacementAudit';
import { sfClosedFormParamRidge, solveParamRidgeByBisection } from './crestLateralDeviation';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);
type V3 = readonly [number, number, number];
const P = (u: number, t: number): V3 => exact.position(u, t);

const HIGH = { maxSagMm: 0.05, minEdgeMm: 0.1, maxEdgeMm: 1, gradeRatio: 2, resU: 128, resT: 128 };

// ---- replicated verbatim from ConformingWall.ts (segHitsBox + intersector) ----
function segHitsBox(au: number, at: number, bu: number, bt: number, u0: number, u1: number, t0: number, t1: number): boolean {
  const du = bu - au, dt = bt - at; let lo = 0, hi = 1;
  const edges: Array<[number, number]> = [[-du, au - u0], [du, u1 - au], [-dt, at - t0], [dt, t1 - at]];
  for (const [pp, q] of edges) {
    if (Math.abs(pp) < 1e-300) { if (q < 0) return false; continue; }
    const r = q / pp;
    if (pp < 0) { if (r > hi) return false; if (r > lo) lo = r; } else { if (r < lo) return false; if (r < hi) hi = r; }
  }
  return lo < hi;
}
type FLine = { points: Array<{ u: number; t: number }> };
function buildFeatureIntersector(features: FLine[]): (u0: number, t0: number, size: number) => boolean {
  const BUCKET = 64;
  const buckets = new Map<number, Array<[number, number, number, number]>>();
  const key = (bu: number, bt: number): number => bt * BUCKET + bu;
  const clampB = (x: number): number => Math.max(0, Math.min(BUCKET - 1, Math.floor(x * BUCKET)));
  for (const line of features) {
    const pts = line.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const bu0 = clampB(Math.min(a.u, b.u)), bu1 = clampB(Math.max(a.u, b.u));
      const bt0 = clampB(Math.min(a.t, b.t)), bt1 = clampB(Math.max(a.t, b.t));
      const seg: [number, number, number, number] = [a.u, a.t, b.u, b.t];
      for (let bt = bt0; bt <= bt1; bt++) for (let bu = bu0; bu <= bu1; bu++) {
        const k = key(bu, bt); let arr = buckets.get(k); if (!arr) { arr = []; buckets.set(k, arr); } arr.push(seg);
      }
    }
  }
  return (u0, t0, size) => {
    const u1 = u0 + size, t1 = t0 + size;
    const bu0 = clampB(u0), bu1 = clampB(u1 - 1e-12), bt0 = clampB(t0), bt1 = clampB(t1 - 1e-12);
    for (let bt = bt0; bt <= bt1; bt++) for (let bu = bu0; bu <= bu1; bu++) {
      const arr = buckets.get(key(bu, bt)); if (!arr) continue;
      for (const [au, at, bvu, bvt] of arr) if (segHitsBox(au, at, bvu, bvt, u0, u1, t0, t1)) return true;
    }
    return false;
  };
}
// -------------------------------------------------------------------------------

/** All feature loci u(t): crests (closed form, incl. born) + valleys (generic). */
const cf = sfClosedFormParamRidge(p);
const valley = solveParamRidgeByBisection({ value: (u: number, t: number) => sfRf(u, t, p), periodicU: false });
function interp(branch: { points: Array<{ u: number; t: number }> }, t: number): number | null {
  const pts = branch.points;
  if (t < pts[0].t || t > pts[pts.length - 1].t) return null;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].t <= t) lo = mid; else hi = mid; }
  const f = (t - pts[lo].t) / Math.max(1e-9, pts[hi].t - pts[lo].t);
  return pts[lo].u + (pts[hi].u - pts[lo].u) * f;
}
/** Feature loci at t, tagged born (crest branch born above the base, t0>0.15) vs full. */
function lociAt(t: number): Array<{ u: number; born: boolean; kind: 'crest' | 'valley' }> {
  const out: Array<{ u: number; born: boolean; kind: 'crest' | 'valley' }> = [];
  for (const br of cf.branches) { const u = interp(br, t); if (u !== null) out.push({ u, born: br.points[0].t > 0.15, kind: 'crest' }); }
  for (const br of valley.branches) { if (br.kind !== 'valley') continue; const u = interp(br, t); if (u !== null) out.push({ u, born: br.points[0].t > 0.15, kind: 'valley' }); }
  return out;
}

describe('VERIFY edge-vs-sizing split on the REAL ADAPTIVE production mesh', () => {
  it('classifies every >0.1mm triangle: STRADDLE (edge) vs FLANK (sizing)', () => {
    const level = 7;
    const cornerSnap = 0.06 / (1 << level), uMargin = 1.5 / (1 << level), tMargin = 1 / 1024;
    const graph = extractAnalyticFeatures('SuperformulaBlossom', p, { H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb });
    const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin) as unknown as FLine[];

    // Build the REAL adaptive production quadtree (targetScale=1 = sag floor).
    const res = 256;
    const grid = new Float32Array(res * res * 3);
    let w = 0;
    for (let row = 0; row < res; row++) { const tv = row / (res - 1); for (let col = 0; col < res; col++) { const q = P(col / res, tv); grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2]; } }
    const sampler = new GpuSurfaceSampler(grid, res, res);
    const field = new MetricSizingField(sampler, HIGH);
    const qt = new PeriodicBalancedQuadtree(field, sampler, {
      maxLevel: 12, uBias: SFB_UBIAS, featureRefine: { level: 7, intersects: buildFeatureIntersector(clipped) },
    });
    const mesh = triangulateQuadtreeWithFeatures(qt, clipped, { cornerSnap });
    const v = mesh.vertices, idx = mesh.indices;
    const triCount = idx.length / 3, vCount = v.length / 3;
    const seam = 1.5 / (1 << (level + SFB_UBIAS));

    let nAbove = 0, nStraddle = 0, nFlank = 0, nBornStraddle = 0;
    let worstStraddle = 0, worstFlank = 0, worstFlankAt = { u: 0, t: 0 };
    // Flank localization: separate true in-scope sizing residual from edge/seam-attributable.
    let flankNearSeam = 0, flankNearFeature = 0, flankCleanBody = 0;
    let worstCleanBody = 0, worstCleanBodyAt = { u: 0, t: 0 };
    const NEAR_U = 0.006; // ~6 cells at L8 (1/1024) — "adjacent to a feature"
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const ua = v[a * 3], ub = v[b * 3], uc = v[c * 3];
      const cu = ((ua + ub + uc) / 3 % 1 + 1) % 1;
      if (cu < seam || cu > 1 - seam) continue;
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) continue;
      const ta = v[a * 3 + 1], tb = v[b * 3 + 1], tc = v[c * 3 + 1];
      // cheap centroid pre-filter
      const Va = P(ua, ta), Vb = P(ub, tb), Vc = P(uc, tc);
      const ctc = (ta + tb + tc) / 3;
      const trC = P(cu, ctc);
      const dC = Math.hypot((Va[0] + Vb[0] + Vc[0]) / 3 - trC[0], (Va[1] + Vb[1] + Vc[1]) / 3 - trC[1], (Va[2] + Vb[2] + Vc[2]) / 3 - trC[2]);
      if (dC <= 0.04) continue;
      // dense chord
      const N = 14; let dmax = 0, atW = ctc;
      for (let ii = 0; ii <= N; ii++) for (let jj = 0; jj <= N - ii; jj++) {
        const aa = ii / N, bb = jj / N, cc = 1 - aa - bb;
        const su = aa * ua + bb * ub + cc * uc, st = aa * ta + bb * tb + cc * tc;
        const tr = P(su, st);
        const d = Math.hypot(aa * Va[0] + bb * Vb[0] + cc * Vc[0] - tr[0], aa * Va[1] + bb * Vb[1] + cc * Vc[1] - tr[1], aa * Va[2] + bb * Vb[2] + cc * Vc[2] - tr[2]);
        if (d > dmax) { dmax = d; atW = st; }
      }
      if (dmax <= 0.1) continue;
      nAbove++;
      const uLo = Math.min(ua, ub, uc), uHi = Math.max(ua, ub, uc);
      const crossing = lociAt(atW).filter((L) => L.u > uLo + 1e-6 && L.u < uHi - 1e-6);
      if (crossing.length > 0) {
        nStraddle++;
        if (crossing.some((L) => L.born)) nBornStraddle++;
        if (dmax > worstStraddle) worstStraddle = dmax;
      } else {
        nFlank++;
        if (dmax > worstFlank) { worstFlank = dmax; worstFlankAt = { u: cu, t: atW }; }
        // localize: near-seam (out of scope) / near a feature locus incl. DROPPED
        // born (edge-attributable: Task 4 + its featureRefine shrinks these cells) /
        // clean body (a TRUE sizing residual that only Task 3 could fix).
        const all = lociAt(atW);
        let nearestU = Infinity;
        for (const L of all) nearestU = Math.min(nearestU, Math.abs(((L.u - cu + 0.5) % 1 + 1) % 1 - 0.5));
        if (cu > 0.95 || cu < 0.05) flankNearSeam++;
        else if (nearestU < NEAR_U) flankNearFeature++;
        else { flankCleanBody++; if (dmax > worstCleanBody) { worstCleanBody = dmax; worstCleanBodyAt = { u: cu, t: atW }; } }
      }
    }

    /* eslint-disable no-console */
    console.log('\n===== EDGE-vs-SIZING on the REAL ADAPTIVE mesh (SFB@1, high opts, exact eval, seam excl) =====');
    console.log(`  mesh: ${vCount} verts, ${triCount} tris (adaptive, targetScale=1)`);
    console.log(`  >0.1mm triangles: ${nAbove}`);
    console.log(`    STRADDLE (feature crosses interior = EDGE problem, Tasks 4-7): ${nStraddle} (${(100 * nStraddle / Math.max(1, nAbove)).toFixed(1)}%)  worst ${worstStraddle.toFixed(3)}mm`);
    console.log(`      of which a BORN petal/valley crosses (Task 4 = un-defer born): ${nBornStraddle}`);
    console.log(`    FLANK (no feature crosses): ${nFlank} (${(100 * nFlank / Math.max(1, nAbove)).toFixed(1)}%)  worst ${worstFlank.toFixed(3)}mm at (u=${worstFlankAt.u.toFixed(4)}, t=${worstFlankAt.t.toFixed(4)})`);
    console.log(`      FLANK localization:`);
    console.log(`        near-seam (u<0.05||u>0.95, OUT OF SCOPE): ${flankNearSeam}`);
    console.log(`        near a feature locus incl. DROPPED born (EDGE-attributable, Task 4 featureRefine shrinks these): ${flankNearFeature}`);
    console.log(`        CLEAN BODY (far from any feature = TRUE sizing residual, only Task 3): ${flankCleanBody}  worst ${worstCleanBody.toFixed(3)}mm at (u=${worstCleanBodyAt.u.toFixed(4)}, t=${worstCleanBodyAt.t.toFixed(4)})`);
    console.log(`  => DECISIVE: if CLEAN-BODY flank ~0, edges (Tasks 4-7) + seam(out of scope) explain ALL residual; sizing (Task 3) is adequate.`);
    console.log('============================================================================================\n');
    /* eslint-enable no-console */
    expect(nAbove).toBeGreaterThan(0);
  }, 600000);
});
