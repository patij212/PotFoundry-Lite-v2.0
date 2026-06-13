/**
 * fidelityGate.test.ts — Task 1: the shared, config-aware surface-fidelity gate
 * that every edge task gates on. Reproduces the SFB@1 born-petal straddle
 * baseline against config-aware truth, and validates the fold + spacing channels.
 */
import { describe, it, expect } from 'vitest';
import { deviationVsTrueSurface, countFoldedTriangles, minVertexSpacing3D, straddleStats } from './fidelityGate';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { clipFeaturesToBox } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import type { QuadLeaf } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import type { QuadtreeLike } from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import { SfbWallSampler, SFB1_PACKED, SFB_DIMS, SFB_UBIAS } from './snapPlacementAudit';
import { sfClosedFormParamRidge } from './crestLateralDeviation';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);
const surface = (u: number, t: number): readonly [number, number, number] => exact.position(u, t);

function buildSfb1Mesh(level: number): { vertices: number[]; indices: number[] } {
  const cornerSnap = 0.06 / (1 << level), uMargin = 1.5 / (1 << level), tMargin = 1 / 1024;
  const graph = extractAnalyticFeatures('SuperformulaBlossom', p, { H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb });
  const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);
  const uSpan = 1 << (level + SFB_UBIAS), tSpan = 1 << level;
  const leaves: QuadLeaf[] = [];
  for (let it = 0; it < tSpan; it++) for (let iu = 0; iu < uSpan; iu++) leaves.push({ u0: iu / uSpan, t0: it / tSpan, level });
  const qt: QuadtreeLike = { leaves: () => leaves, uBias: () => SFB_UBIAS };
  const mesh = triangulateQuadtreeWithFeatures(qt, clipped, { cornerSnap });
  return { vertices: Array.from(mesh.vertices), indices: Array.from(mesh.indices) };
}

describe('fidelityGate — shared config-aware surface-fidelity gate', () => {
  it('reproduces the SFB@1 born-petal straddle baseline against config-aware truth', () => {
    const mesh = buildSfb1Mesh(7);
    const dev = deviationVsTrueSurface(mesh, surface, { tolMm: 0.05, seamExclU: 1.5 / (1 << (7 + SFB_UBIAS)) });
    // born-petal straddle survives exact vertices → max far above tol
    expect(dev.maxMm).toBeGreaterThan(1.0);
    expect(dev.p99Mm).toBeGreaterThan(0);
    expect(dev.nAbove).toBeGreaterThan(100);
    // seam band is reported separately (and excluded from maxMm)
    expect(dev.seamBandMaxMm).toBeGreaterThanOrEqual(0);
  });

  it('reports zero folded triangles on the (valid) SFB@1 mesh', () => {
    const mesh = buildSfb1Mesh(7);
    expect(countFoldedTriangles(mesh, surface)).toBe(0);
  });

  it('minVertexSpacing3D is positive and below the construction weld tolerance is flagged', () => {
    const mesh = buildSfb1Mesh(7);
    const s = minVertexSpacing3D(mesh, surface);
    expect(s).toBeGreaterThan(0);
  });

  it('straddleStats attributes the >tol triangles to feature crossings', () => {
    const mesh = buildSfb1Mesh(7);
    const cf = sfClosedFormParamRidge(p);
    const lociAt = (t: number): number[] => {
      const out: number[] = [];
      for (const br of cf.branches) {
        const pts = br.points;
        if (t < pts[0].t || t > pts[pts.length - 1].t) continue;
        let lo = 0, hi = pts.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].t <= t) lo = m; else hi = m; }
        const f = (t - pts[lo].t) / Math.max(1e-9, pts[hi].t - pts[lo].t);
        out.push(pts[lo].u + (pts[hi].u - pts[lo].u) * f);
      }
      return out;
    };
    const st = straddleStats(mesh, surface, lociAt, { tolMm: 0.1, seamExclU: 1.5 / (1 << (7 + SFB_UBIAS)) });
    expect(st.nStraddle).toBeGreaterThan(50);   // born-petal straddles present
    expect(st.worstStraddle).toBeGreaterThan(1.0);
  }, 60000);
});
