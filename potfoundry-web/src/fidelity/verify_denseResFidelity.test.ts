/**
 * verify_denseResFidelity.test.ts — the actionable fix lever for the user's goal
 * ("represent the true surface, no error"): how dense must the surface sampler be
 * (or must vertices be evaluated EXACTLY) to bring the export's deviation from the
 * TRUE surface below print resolution?
 *
 * Production evaluates conforming vertex positions via a bilinear GpuSurfaceSampler
 * at DENSE_RES=256 (ParametricExportComputer.ts:2294,2301-2325); the gpuResnap step
 * fixes only the feature vertex U, not the position — so sharp crests are flattened
 * by the 256-grid. This sweeps sampler resolution {256,512,1024,2048} + EXACT and
 * measures the real level-7 feature-inserted mesh's deviation from the true surface
 * (seam EXCLUDED — the seam strip is an out-of-scope ~150mm chord artifact).
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { clipFeaturesToBox } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { QuadLeaf } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import type { QuadtreeLike } from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import type { PositionSampler } from './metrics';
import { SfbWallSampler, SFB1_PACKED, SFB_DIMS, SFB_UBIAS } from './snapPlacementAudit';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);

function buildBilinear(res: number): GpuSurfaceSampler {
  const grid = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) {
    const tVal = row / (res - 1);
    for (let col = 0; col < res; col++) {
      const q = exact.position(col / res, tVal);
      grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2];
    }
  }
  return new GpuSurfaceSampler(grid, res, res);
}

type V3 = [number, number, number];
function uniformAnisoQuadtree(level: number, uBias: number): QuadtreeLike {
  const uSpan = 1 << (level + uBias), tSpan = 1 << level;
  const leaves: QuadLeaf[] = [];
  for (let it = 0; it < tSpan; it++) for (let iu = 0; iu < uSpan; iu++) leaves.push({ u0: iu / uSpan, t0: it / tSpan, level });
  return { leaves: () => leaves, uBias: () => uBias };
}

function deviationsSeamExcl(verts: Float32Array, idx: Uint32Array | number[], surf: PositionSampler, seamMargin: number): number[] {
  const out: number[] = [];
  const P = (u: number, t: number): V3 => surf.position(u, t) as unknown as V3;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const ua = verts[a * 3], ta = verts[a * 3 + 1];
    const ub = verts[b * 3], tb = verts[b * 3 + 1];
    const uc = verts[c * 3], tc = verts[c * 3 + 1];
    const cu = (((ua + ub + uc) / 3) % 1 + 1) % 1;
    if (cu < seamMargin || cu > 1 - seamMargin) continue; // seam out of scope
    // also skip triangles that wrap the seam in u (span > 0.5 => wrapped chord)
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) continue;
    const Va = P(ua, ta), Vb = P(ub, tb), Vc = P(uc, tc);
    const samples: Array<[number, number, V3]> = [
      [(ua + ub + uc) / 3, (ta + tb + tc) / 3, [(Va[0] + Vb[0] + Vc[0]) / 3, (Va[1] + Vb[1] + Vc[1]) / 3, (Va[2] + Vb[2] + Vc[2]) / 3]],
      [(ua + ub) / 2, (ta + tb) / 2, [(Va[0] + Vb[0]) / 2, (Va[1] + Vb[1]) / 2, (Va[2] + Vb[2]) / 2]],
      [(ub + uc) / 2, (tb + tc) / 2, [(Vb[0] + Vc[0]) / 2, (Vb[1] + Vc[1]) / 2, (Vb[2] + Vc[2]) / 2]],
      [(ua + uc) / 2, (ta + tc) / 2, [(Va[0] + Vc[0]) / 2, (Va[1] + Vc[1]) / 2, (Va[2] + Vc[2]) / 2]],
    ];
    let dmax = 0;
    for (const [su, st, flat] of samples) {
      const tru = exact.position(su, st);
      const d = Math.hypot(flat[0] - tru[0], flat[1] - tru[1], flat[2] - tru[2]);
      if (d > dmax) dmax = d;
    }
    out.push(dmax);
  }
  return out;
}

function summary(v: number[], tol: number): string {
  const s = [...v].sort((x, y) => x - y);
  const n = s.length;
  let above = 0;
  for (const x of s) if (x > tol) above++;
  const max = n ? s[n - 1] : 0, p99 = n ? s[Math.floor(0.99 * n)] : 0, med = n ? s[Math.floor(0.5 * n)] : 0;
  return `max ${max.toFixed(3)}mm p99 ${p99.toFixed(3)}mm median ${med.toFixed(4)}mm  >${tol}mm: ${(100 * above / Math.max(1, n)).toFixed(2)}%`;
}

describe('VERIFY surface-sampler density vs true-surface fidelity (user goal, seam excluded)', () => {
  it('sweeps DENSE_RES {256,512,1024,2048} + EXACT on the real level-7 mesh', () => {
    const level = 7;
    const cornerSnap = 0.06 / (1 << level);
    const uMargin = 1.5 / (1 << level);
    const tMargin = 1 / 1024;
    const graph = extractAnalyticFeatures('SuperformulaBlossom', p, { H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb });
    const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);
    const mesh = triangulateQuadtreeWithFeatures(uniformAnisoQuadtree(level, SFB_UBIAS), clipped, { cornerSnap });
    const seam = 1.5 / (1 << (level + SFB_UBIAS));
    const TOL = 0.1;

    /* eslint-disable no-console */
    console.log('\n===== SURFACE FIDELITY vs sampler density (real L7 mesh, seam excluded, tol 0.1mm) =====');
    for (const res of [256, 512, 1024, 2048]) {
      const d = deviationsSeamExcl(mesh.vertices, mesh.indices, buildBilinear(res), seam);
      console.log(`  DENSE_RES=${res}\t: ${summary(d, TOL)}`);
    }
    const dE = deviationsSeamExcl(mesh.vertices, mesh.indices, exact, seam);
    console.log(`  EXACT (analytic)\t: ${summary(dE, TOL)}`);
    console.log('  (note: EXACT residual = pure chord/faceting error at L7 density; reduced by MORE TRIANGLES, not sampler res)');
    console.log('=====================================================================================\n');
    /* eslint-enable no-console */

    expect(dE.length).toBeGreaterThan(1000);
  });
});
