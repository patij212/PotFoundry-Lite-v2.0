/**
 * verify_worstTriangle.test.ts — HIGHER-FIDELITY diagnosis: localize and
 * classify the worst chord-error triangle in the real export.
 *
 * verify_chordConvergence found clean crest-flank cells are only ~0.19mm but the
 * real L7 mesh has a 3.4mm worst triangle — so the worst is NOT a flank cell. A
 * 3.4mm chord error means a flat triangle spanning a sharp cusp, i.e. a crest/
 * valley locus passing through the triangle's INTERIOR (the feature is NOT a
 * clean mesh edge there) — the snap/insertion failing locally. This probe finds
 * the worst triangle, dense-measures it, and classifies every >0.1mm triangle as
 * STRADDLE (a feature locus crosses its (u,t) interior) vs FLANK (feature on an
 * edge / nearby) vs OTHER.
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import { extractAnalyticFeatures, sfRf } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { clipFeaturesToBox } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import type { QuadLeaf } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import type { QuadtreeLike } from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import { SfbWallSampler, SFB1_PACKED, SFB_DIMS, SFB_UBIAS } from './snapPlacementAudit';
import { sfClosedFormParamRidge, solveParamRidgeByBisection } from './crestLateralDeviation';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);
type V3 = readonly [number, number, number];
const P = (u: number, t: number): V3 => exact.position(u, t);

function chordDense(ua: number, ta: number, ub: number, tb: number, uc: number, tc: number, N: number): { max: number; au: number; at: number } {
  const Va = P(ua, ta), Vb = P(ub, tb), Vc = P(uc, tc);
  let m = 0, au = ua, at = ta;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) {
    const a = i / N, b = j / N, c = 1 - a - b;
    const su = a * ua + b * ub + c * uc, st = a * ta + b * tb + c * tc;
    const tr = P(su, st);
    const d = Math.hypot(a * Va[0] + b * Vb[0] + c * Vc[0] - tr[0], a * Va[1] + b * Vb[1] + c * Vc[1] - tr[1], a * Va[2] + b * Vb[2] + c * Vc[2] - tr[2]);
    if (d > m) { m = d; au = su; at = st; }
  }
  return { max: m, au, at };
}

function uniformAnisoQuadtree(level: number, uBias: number): QuadtreeLike {
  const uSpan = 1 << (level + uBias), tSpan = 1 << level;
  const leaves: QuadLeaf[] = [];
  for (let it = 0; it < tSpan; it++) for (let iu = 0; iu < uSpan; iu++) leaves.push({ u0: iu / uSpan, t0: it / tSpan, level });
  return { leaves: () => leaves, uBias: () => uBias };
}

/** All feature loci u(t) — crests (closed form) + valleys (generic solver). */
function lociAt(t: number): number[] {
  const out: number[] = [];
  const cf = sfClosedFormParamRidge(p);
  for (const br of cf.branches) {
    const pts = br.points;
    if (t < pts[0].t || t > pts[pts.length - 1].t) continue;
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].t <= t) lo = mid; else hi = mid; }
    const f = (t - pts[lo].t) / Math.max(1e-9, pts[hi].t - pts[lo].t);
    out.push(pts[lo].u + (pts[hi].u - pts[lo].u) * f);
  }
  return out;
}

describe('VERIFY worst chord-error triangle — localize + classify', () => {
  it('finds and diagnoses the worst triangle in the real L7 mesh', () => {
    const level = 7;
    const cornerSnap = 0.06 / (1 << level), uMargin = 1.5 / (1 << level), tMargin = 1 / 1024;
    const graph = extractAnalyticFeatures('SuperformulaBlossom', p, { H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb });
    const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);
    const mesh = triangulateQuadtreeWithFeatures(uniformAnisoQuadtree(level, SFB_UBIAS), clipped, { cornerSnap });
    const v = mesh.vertices, idx = mesh.indices;
    const seam = 1.5 / (1 << (level + SFB_UBIAS));

    // generic valleys (closed form is crest-only) — for completeness in straddle test
    const valley = solveParamRidgeByBisection({ value: (u: number, t: number) => sfRf(u, t, p), periodicU: false });

    let nAbove = 0, nStraddle = 0, nFlank = 0;
    let worst = { d: 0, i: -1, au: 0, at: 0 };
    const cand: number[] = [];
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const ua = v[a * 3], ub = v[b * 3], uc = v[c * 3];
      const cu = ((ua + ub + uc) / 3 % 1 + 1) % 1;
      if (cu < seam || cu > 1 - seam) continue;
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) continue;
      // cheap centroid chord to find candidates
      const ta = v[a * 3 + 1], tb = v[b * 3 + 1], tc = v[c * 3 + 1];
      const ct = (ta + tb + tc) / 3;
      const Va = P(ua, ta), Vb = P(ub, tb), Vc = P(uc, tc);
      const tr = P(cu, ct);
      const dC = Math.hypot((Va[0] + Vb[0] + Vc[0]) / 3 - tr[0], (Va[1] + Vb[1] + Vc[1]) / 3 - tr[1], (Va[2] + Vb[2] + Vc[2]) / 3 - tr[2]);
      if (dC > 0.05) cand.push(i);
    }
    // dense-measure candidates; classify >0.1mm.
    for (const i of cand) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const ua = v[a * 3], ta = v[a * 3 + 1], ub = v[b * 3], tb = v[b * 3 + 1], uc = v[c * 3], tc = v[c * 3 + 1];
      const dd = chordDense(ua, ta, ub, tb, uc, tc, 20);
      if (dd.max <= 0.1) continue;
      nAbove++;
      // straddle test: does a feature locus fall strictly within the triangle's u-extent at the worst-sample t?
      const uLo = Math.min(ua, ub, uc), uHi = Math.max(ua, ub, uc);
      const loci = [...lociAt(dd.at), ...valley.branches.filter((br) => br.kind === 'valley' && dd.at >= br.points[0].t && dd.at <= br.points[br.points.length - 1].t).map((br) => {
        const pts = br.points; let lo = 0, hi = pts.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].t <= dd.at) lo = mid; else hi = mid; }
        const f = (dd.at - pts[lo].t) / Math.max(1e-9, pts[hi].t - pts[lo].t); return pts[lo].u + (pts[hi].u - pts[lo].u) * f;
      })];
      const straddles = loci.some((ul) => ul > uLo + 1e-6 && ul < uHi - 1e-6);
      if (straddles) nStraddle++; else nFlank++;
      if (dd.max > worst.d) worst = { d: dd.max, i, au: dd.au, at: dd.at };
    }

    const wi = worst.i;
    const a = idx[wi], b = idx[wi + 1], c = idx[wi + 2];
    const uSpanMm = (Math.max(v[a * 3], v[b * 3], v[c * 3]) - Math.min(v[a * 3], v[b * 3], v[c * 3])) * 2 * Math.PI * 75;
    const tSpanMm = (Math.max(v[a * 3 + 1], v[b * 3 + 1], v[c * 3 + 1]) - Math.min(v[a * 3 + 1], v[b * 3 + 1], v[c * 3 + 1])) * SFB_DIMS.H;
    const wLoci = lociAt(worst.at);
    let nearF = Infinity;
    const wcu = ((v[a * 3] + v[b * 3] + v[c * 3]) / 3 % 1 + 1) % 1;
    for (const ul of wLoci) nearF = Math.min(nearF, Math.abs(ul - wcu));

    /* eslint-disable no-console */
    console.log('\n===== WORST CHORD-ERROR TRIANGLE DIAGNOSIS (real L7, exact eval, seam excl) =====');
    console.log(`  >0.1mm triangles: ${nAbove}  |  STRADDLE (feature crosses interior): ${nStraddle} (${(100 * nStraddle / Math.max(1, nAbove)).toFixed(0)}%)  FLANK/other: ${nFlank}`);
    console.log(`  WORST: ${worst.d.toFixed(3)}mm at (u=${worst.au.toFixed(4)}, t=${worst.at.toFixed(4)})`);
    console.log(`    triangle (u,t): A(${v[a * 3].toFixed(4)},${v[a * 3 + 1].toFixed(4)}) B(${v[b * 3].toFixed(4)},${v[b * 3 + 1].toFixed(4)}) C(${v[c * 3].toFixed(4)},${v[c * 3 + 1].toFixed(4)})`);
    console.log(`    (u,t) extent: ${uSpanMm.toFixed(3)}mm circ x ${tSpanMm.toFixed(3)}mm height; nearest crest locus ${(nearF * 2 * Math.PI * 75).toFixed(3)}mm`);
    console.log('=================================================================================\n');
    /* eslint-enable no-console */
    expect(nAbove).toBeGreaterThan(0);
  });
});
