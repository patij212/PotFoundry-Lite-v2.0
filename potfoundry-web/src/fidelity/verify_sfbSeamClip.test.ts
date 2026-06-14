/**
 * verify_sfbSeamClip.test.ts — does the SFB 0.873mm MAX close if the born crests
 * are NOT clipped away from the seam? The worst (verify_worstResidual) is a born
 * crest at u≈0.99 STRADDLED because clipFeaturesToBox(uMargin≈0.0117) strips the
 * crest at u>0.988, so its seam-end is not a mesh edge. Sweep uMargin and measure
 * the worst chord (immediate seam u>0.997 excluded) + folded (watertight proxy).
 *
 * If a smaller uMargin drops the 0.873 -> the clip is the cause (a born-crest clip
 * fix closes it). If it plateaus -> irreducible cusp / genuinely the seam zone.
 * Pure CPU, read-only, no production change.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { clipFeaturesToBox } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import { MetricSizingField } from '../renderers/webgpu/parametric/conforming/MetricSizingField';
import { PeriodicBalancedQuadtree } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { SfbWallSampler, SFB1_PACKED, SFB_DIMS, SFB_UBIAS } from './snapPlacementAudit';
import { countFoldedTriangles } from './fidelityGate';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);
type V3 = readonly [number, number, number];
const P = (u: number, t: number): V3 => exact.position(u, t);
const lever = (): { __pfSfbBornCrests?: boolean } => globalThis as unknown as { __pfSfbBornCrests?: boolean };
afterEach(() => { delete lever().__pfSfbBornCrests; });
const HIGH = { maxSagMm: 0.05, minEdgeMm: 0.1, maxEdgeMm: 1, gradeRatio: 2, resU: 128, resT: 128 };
function segHits(au: number, at: number, bu: number, bt: number, u0: number, u1: number, t0: number, t1: number): boolean {
  const du = bu - au, dt = bt - at; let lo = 0, hi = 1;
  for (const [pp, q] of [[-du, au - u0], [du, u1 - au], [-dt, at - t0], [dt, t1 - at]] as Array<[number, number]>) {
    if (Math.abs(pp) < 1e-300) { if (q < 0) return false; continue; }
    const r = q / pp; if (pp < 0) { if (r > hi) return false; if (r > lo) lo = r; } else { if (r < lo) return false; if (r < hi) hi = r; }
  }
  return lo < hi;
}
let SAMPLER: GpuSurfaceSampler | null = null;
function sampler(): GpuSurfaceSampler {
  if (SAMPLER) return SAMPLER;
  const res = 256, grid = new Float32Array(res * res * 3); let w = 0;
  for (let row = 0; row < res; row++) { const tv = row / (res - 1); for (let col = 0; col < res; col++) { const q = P(col / res, tv); grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2]; } }
  SAMPLER = new GpuSurfaceSampler(grid, res, res); return SAMPLER;
}
type FLine = { points: Array<{ u: number; t: number }> };
function worstChord(uMargin: number): { max: number; au: number; at: number; folded: number; feats: number } {
  lever().__pfSfbBornCrests = true;
  const level = 7, cornerSnap = 0.06 / (1 << level), tMargin = 1 / 1024;
  const graph = extractAnalyticFeatures('SuperformulaBlossom', p, { H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb });
  const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin) as unknown as FLine[];
  const s = sampler();
  const intersects = (u0: number, t0: number, size: number): boolean => {
    const u1 = u0 + size, t1 = t0 + size;
    for (const ln of clipped) for (let i = 0; i + 1 < ln.points.length; i++) { if (segHits(ln.points[i].u, ln.points[i].t, ln.points[i + 1].u, ln.points[i + 1].t, u0, u1, t0, t1)) return true; }
    return false;
  };
  const qt = new PeriodicBalancedQuadtree(new MetricSizingField(s, HIGH), s, { maxLevel: 12, uBias: SFB_UBIAS, featureRefine: { level: 11, intersects } });
  const m = triangulateQuadtreeWithFeatures(qt, clipped as never, { cornerSnap });
  const v = m.vertices, idx = m.indices, seam = 1.5 / (1 << (level + SFB_UBIAS));
  let worst = { d: 0, au: 0, at: 0 };
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const ua = v[a * 3], ub = v[b * 3], uc = v[c * 3];
    const cu = ((ua + ub + uc) / 3 % 1 + 1) % 1;
    if (cu < seam || cu > 1 - seam || Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) continue;
    const ta = v[a * 3 + 1], tb = v[b * 3 + 1], tc = v[c * 3 + 1];
    const Va = P(ua, ta), Vb = P(ub, tb), Vc = P(uc, tc), trC = P(cu, (ta + tb + tc) / 3);
    const dC = Math.hypot((Va[0] + Vb[0] + Vc[0]) / 3 - trC[0], (Va[1] + Vb[1] + Vc[1]) / 3 - trC[1], (Va[2] + Vb[2] + Vc[2]) / 3 - trC[2]);
    if (dC <= 0.3) continue; // only chase the big one
    const N = 12; let dmax = 0, au = cu, at = (ta + tb + tc) / 3;
    for (let ii = 0; ii <= N; ii++) for (let jj = 0; jj <= N - ii; jj++) {
      const aa = ii / N, bb = jj / N, cc = 1 - aa - bb; const su = aa * ua + bb * ub + cc * uc, st = aa * ta + bb * tb + cc * tc;
      const tr = P(su, st); const d = Math.hypot(aa * Va[0] + bb * Vb[0] + cc * Vc[0] - tr[0], aa * Va[1] + bb * Vb[1] + cc * Vc[1] - tr[1], aa * Va[2] + bb * Vb[2] + cc * Vc[2] - tr[2]);
      if (d > dmax) { dmax = d; au = su; at = st; }
    }
    if (dmax > worst.d) worst = { d: dmax, au, at };
  }
  const folded = countFoldedTriangles({ vertices: v, indices: idx }, (u, t) => P(u, t), seam);
  return { max: worst.d, au: worst.au, at: worst.at, folded, feats: graph.lines.length };
}

describe('SFB 0.873 seam-clip: does extending born crests to the seam close it?', () => {
  it('sweeps uMargin (born-crest clip) and measures the worst chord + folded', () => {
    /* eslint-disable no-console */
    console.log('\n===== SFB worst chord vs born-crest u-clip margin (born ON, adaptive, seam u>0.997 excl) =====');
    console.log('  uMargin (u-clip)      | worst mm | at (u,t)            | folded | feats');
    const results: Array<{ um: number; max: number }> = [];
    for (const um of [1.5 / 128, 1.5 / 512, 1.5 / 2048]) {
      const r = worstChord(um);
      results.push({ um, max: r.max });
      console.log(`  ${um.toFixed(5)} (1.5/${(1.5 / um).toFixed(0)}) | ${r.max.toFixed(3).padStart(8)} | (${r.au.toFixed(4)},${r.at.toFixed(4)}) | ${String(r.folded).padStart(6)} | ${r.feats}`);
    }
    const base = results[0].max, tight = results[results.length - 1].max;
    console.log(`  => uMargin ${(1.5 / 128).toFixed(4)}->${(1.5 / 2048).toFixed(5)}: worst ${base.toFixed(2)}->${tight.toFixed(2)}mm. If it DROPS, the born-crest clip is the cause (fix = don't clip born crests off the seam). If it PLATEAUS, irreducible / seam zone.`);
    console.log('=============================================================================================\n');
    /* eslint-enable no-console */
    expect(results.length).toBe(3);
  }, 600000);
});
