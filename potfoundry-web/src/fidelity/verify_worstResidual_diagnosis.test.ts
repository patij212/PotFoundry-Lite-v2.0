/**
 * verify_worstResidual_diagnosis.test.ts — localize the 1.9mm MAX residual on the
 * SFB@1 born-ON adaptive mesh: what does the worst triangle straddle? A missing
 * crest, a valley, or the clip-margin boundary band (clipFeaturesToBox strips
 * features near t=0/1, so a boundary cell bridges the cusp even with full
 * extraction — the red-team's clip-margin finding)?
 *
 * Reports the worst triangle's (u,t), boundary/seam status, and distance to the
 * nearest TRUE crest and valley loci. Pure CPU, read-only, no production change.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import { extractAnalyticFeatures, sfRf } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { clipFeaturesToBox } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import { MetricSizingField } from '../renderers/webgpu/parametric/conforming/MetricSizingField';
import { PeriodicBalancedQuadtree } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { SfbWallSampler, SFB1_PACKED, SFB_DIMS, SFB_UBIAS } from './snapPlacementAudit';
import { sfClosedFormParamRidge, solveParamRidgeByBisection } from './crestLateralDeviation';
import { deviationVsTrueSurface } from './fidelityGate';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);
type V3 = readonly [number, number, number];
const P = (u: number, t: number): V3 => exact.position(u, t);
const lever = (): { __pfSfbBornCrests?: boolean } => globalThis as unknown as { __pfSfbBornCrests?: boolean };
afterEach(() => { delete lever().__pfSfbBornCrests; });

const cf = sfClosedFormParamRidge(p);
const valley = solveParamRidgeByBisection({ value: (u: number, t: number) => sfRf(u, t, p), periodicU: false });
function lociOf(branches: Array<{ kind?: string; points: Array<{ u: number; t: number }> }>, t: number, kindFilter?: string): number[] {
  const out: number[] = [];
  for (const br of branches) {
    if (kindFilter && br.kind !== kindFilter) continue;
    const pts = br.points;
    if (t < pts[0].t || t > pts[pts.length - 1].t) continue;
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].t <= t) lo = m; else hi = m; }
    const f = (t - pts[lo].t) / Math.max(1e-9, pts[hi].t - pts[lo].t);
    out.push(pts[lo].u + (pts[hi].u - pts[lo].u) * f);
  }
  return out;
}
const nearestU = (loci: number[], u: number): number => loci.reduce((m, ul) => Math.min(m, Math.abs(((ul - u + 0.5) % 1 + 1) % 1 - 0.5)), Infinity);

describe('Diagnose the 1.9mm MAX residual (SFB@1, born ON, adaptive)', () => {
  it('localizes the worst triangle and what it straddles', () => {
    lever().__pfSfbBornCrests = true;
    const level = 7, seamExclU = 1.5 / (1 << (level + SFB_UBIAS));
    const res = 256;
    const grid = new Float32Array(res * res * 3);
    let w = 0;
    for (let row = 0; row < res; row++) { const tv = row / (res - 1); for (let col = 0; col < res; col++) { const q = P(col / res, tv); grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2]; } }
    const sampler = new GpuSurfaceSampler(grid, res, res);
    const cornerSnap = 0.06 / (1 << level), uMargin = 1.5 / (1 << level), tMargin = 1 / 1024;
    const graph = extractAnalyticFeatures('SuperformulaBlossom', p, { H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb });
    const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);
    const segHits = (au: number, at: number, bu: number, bt: number, u0: number, u1: number, t0: number, t1: number): boolean => {
      const du = bu - au, dt = bt - at; let lo = 0, hi = 1;
      for (const [pp, q] of [[-du, au - u0], [du, u1 - au], [-dt, at - t0], [dt, t1 - at]] as Array<[number, number]>) {
        if (Math.abs(pp) < 1e-300) { if (q < 0) return false; continue; }
        const r = q / pp; if (pp < 0) { if (r > hi) return false; if (r > lo) lo = r; } else { if (r < lo) return false; if (r < hi) hi = r; }
      }
      return lo < hi;
    };
    const intersects = (u0: number, t0: number, size: number): boolean => {
      const u1 = u0 + size, t1 = t0 + size;
      for (const ln of clipped) for (let i = 0; i + 1 < ln.points.length; i++) { if (segHits(ln.points[i].u, ln.points[i].t, ln.points[i + 1].u, ln.points[i + 1].t, u0, u1, t0, t1)) return true; }
      return false;
    };
    const qt = new PeriodicBalancedQuadtree(new MetricSizingField(sampler, { maxSagMm: 0.05, minEdgeMm: 0.1, maxEdgeMm: 1, gradeRatio: 2, resU: 128, resT: 128 }), sampler, { maxLevel: 12, uBias: SFB_UBIAS, featureRefine: { level: 7, intersects } });
    const m = triangulateQuadtreeWithFeatures(qt, clipped, { cornerSnap });
    const v = m.vertices, idx = m.indices;

    // find the worst non-seam triangle (dense chord)
    let worst = { d: 0, i: -1, au: 0, at: 0, uLo: 0, uHi: 0 };
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const ua = v[a * 3], ub = v[b * 3], uc = v[c * 3];
      const cu = ((ua + ub + uc) / 3 % 1 + 1) % 1;
      if (cu < seamExclU || cu > 1 - seamExclU) continue;
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) continue;
      const ta = v[a * 3 + 1], tb = v[b * 3 + 1], tc = v[c * 3 + 1];
      const Va = P(ua, ta), Vb = P(ub, tb), Vc = P(uc, tc);
      const N = 12;
      for (let ii = 0; ii <= N; ii++) for (let jj = 0; jj <= N - ii; jj++) {
        const aa = ii / N, bb = jj / N, cc = 1 - aa - bb;
        const su = aa * ua + bb * ub + cc * uc, st = aa * ta + bb * tb + cc * tc;
        const tr = P(su, st);
        const d = Math.hypot(aa * Va[0] + bb * Vb[0] + cc * Vc[0] - tr[0], aa * Va[1] + bb * Vb[1] + cc * Vc[1] - tr[1], aa * Va[2] + bb * Vb[2] + cc * Vc[2] - tr[2]);
        if (d > worst.d) worst = { d, i, au: su, at: st, uLo: Math.min(ua, ub, uc), uHi: Math.max(ua, ub, uc) };
      }
    }
    const a = idx[worst.i], b = idx[worst.i + 1], c = idx[worst.i + 2];
    const tri = [[v[a * 3], v[a * 3 + 1]], [v[b * 3], v[b * 3 + 1]], [v[c * 3], v[c * 3 + 1]]];
    const crests = lociOf(cf.branches, worst.at);
    const valleys = lociOf(valley.branches, worst.at, 'valley');
    const dCrest = nearestU(crests, worst.au), dValley = nearestU(valleys, worst.au);
    const crestStraddle = crests.some((ul) => ul > worst.uLo + 1e-6 && ul < worst.uHi - 1e-6);
    const valleyStraddle = valleys.some((ul) => ul > worst.uLo + 1e-6 && ul < worst.uHi - 1e-6);
    const tMin = Math.min(tri[0][1], tri[1][1], tri[2][1]), tMax = Math.max(tri[0][1], tri[1][1], tri[2][1]);
    const atBoundary = tMin < tMargin * 3 || tMax > 1 - tMargin * 3;
    const nearRim = worst.at > 0.97, nearBase = worst.at < 0.03;

    /* eslint-disable no-console */
    console.log('\n===== WORST RESIDUAL DIAGNOSIS (SFB@1, born ON, adaptive) =====');
    console.log(`  WORST: ${worst.d.toFixed(3)}mm at (u=${worst.au.toFixed(4)}, t=${worst.at.toFixed(4)})`);
    console.log(`  triangle (u,t): (${tri[0][0].toFixed(4)},${tri[0][1].toFixed(4)}) (${tri[1][0].toFixed(4)},${tri[1][1].toFixed(4)}) (${tri[2][0].toFixed(4)},${tri[2][1].toFixed(4)})`);
    console.log(`  u-extent ${(worst.uHi - worst.uLo).toFixed(5)} (${((worst.uHi - worst.uLo) * 2 * Math.PI * 75).toFixed(2)}mm circ); t-extent ${(tMax - tMin).toFixed(5)}`);
    console.log(`  nearest TRUE crest ${(dCrest * 2 * Math.PI * 75).toFixed(3)}mm (straddle=${crestStraddle}); nearest TRUE valley ${(dValley * 2 * Math.PI * 75).toFixed(3)}mm (straddle=${valleyStraddle})`);
    console.log(`  at t-boundary(clip-margin)=${atBoundary}  nearRim(t>0.97)=${nearRim}  nearBase(t<0.03)=${nearBase}`);
    const diag = crestStraddle ? 'STRADDLES A CREST not inserted as an edge (extraction/clip gap)'
      : valleyStraddle ? 'STRADDLES A VALLEY not inserted (valley extraction gap)'
      : (nearRim || atBoundary) ? 'RIM/clip-margin band (clipFeaturesToBox strips features near the boundary)'
      : 'flank/other (no true feature crosses) — curvature/sizing near a cusp';
    console.log(`  => DIAGNOSIS: ${diag}`);
    console.log('  --- in-scope max vs seam-exclusion width (how much residual is the seam/born zone) ---');
    const mesh = { vertices: Array.from(v), indices: Array.from(idx) };
    for (const sx of [0.003, 0.02, 0.05, 0.1]) {
      const dv = deviationVsTrueSurface(mesh, P, { tolMm: 0.05, seamExclU: sx });
      console.log(`    seamExclU ${sx.toFixed(3)} (excl u<${sx.toFixed(3)}||u>${(1 - sx).toFixed(3)}): max ${dv.maxMm.toFixed(3)}mm  p99 ${dv.p99Mm.toFixed(3)}  #>tol ${dv.nAbove}/${dv.nTris} (${(100 * dv.fracAboveTol).toFixed(2)}%)`);
    }
    console.log('==============================================================\n');
    /* eslint-enable no-console */
    expect(worst.d).toBeGreaterThan(0.5);
  }, 180000);
});
