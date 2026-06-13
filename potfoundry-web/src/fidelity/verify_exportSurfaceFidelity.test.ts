/**
 * verify_exportSurfaceFidelity.test.ts — the USER'S ACTUAL METRIC (2026-06-13):
 * "represent the true surface perfectly smoothly with no error" (slivers OK).
 *
 * So the success criterion is GEOMETRIC FIDELITY = how far the exported mesh
 * deviates from the TRUE mathematical surface (in mm), NOT triangle min-angle.
 * Two error sources:
 *   (V) VERTEX SAMPLING ERROR — production evaluates wall vertices via a bilinear
 *       256x256 GpuSurfaceSampler (ParametricExportComputer DENSE_RES=256). At
 *       sharp crests this flattens the cusp; vertices sit OFF the true surface.
 *   (C) CHORD/FACETING ERROR — flat triangles deviate from the curved surface
 *       between vertices; reduced by density.
 *
 * This runs the REAL triangulator (crests inserted as edges = current path) and
 * measures the deviation of the EMITTED mesh from the TRUE (exact f64) surface,
 * for CURRENT (bilinear-256 vertex eval) vs FIXED (exact vertex eval), at two
 * along-densities. Deviation per triangle = max over {centroid, 3 edge mids} of
 * |exact.position(sample u,t) - barycentric-interp of the triangle's 3D verts|.
 * That captures BOTH vertex error and chord error vs the true surface.
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

interface Dist { n: number; max: number; p99: number; median: number; aboveTol: number }
function distOf(v: number[], tolMm: number): Dist {
  const s = [...v].sort((x, y) => x - y);
  const n = s.length;
  let above = 0;
  for (const x of s) if (x > tolMm) above++;
  return { n, max: n ? s[n - 1] : 0, p99: n ? s[Math.floor(0.99 * n)] : 0, median: n ? s[Math.floor(0.5 * n)] : 0, aboveTol: n ? 100 * above / n : 0 };
}

/** Deviation (mm) of each emitted triangle from the TRUE surface, vertices
 *  evaluated via `surf`. Sampled at centroid + 3 edge mids (barycentric on the
 *  3 evaluated verts vs exact.position at the same (u,t)). */
function deviations(meshVerts: Float32Array, idx: Uint32Array | number[], surf: PositionSampler): number[] {
  const out: number[] = [];
  const P = (u: number, t: number): V3 => surf.position(u, t) as unknown as V3;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const ua = meshVerts[a * 3], ta = meshVerts[a * 3 + 1];
    const ub = meshVerts[b * 3], tb = meshVerts[b * 3 + 1];
    const uc = meshVerts[c * 3], tc = meshVerts[c * 3 + 1];
    const Va = P(ua, ta), Vb = P(ub, tb), Vc = P(uc, tc);
    // sample points: centroid + 3 edge mids, each as (u,t) and barycentric 3D.
    const samples: Array<[number, number, V3]> = [
      [(ua + ub + uc) / 3, (ta + tb + tc) / 3, [(Va[0] + Vb[0] + Vc[0]) / 3, (Va[1] + Vb[1] + Vc[1]) / 3, (Va[2] + Vb[2] + Vc[2]) / 3]],
      [(ua + ub) / 2, (ta + tb) / 2, [(Va[0] + Vb[0]) / 2, (Va[1] + Vb[1]) / 2, (Va[2] + Vb[2]) / 2]],
      [(ub + uc) / 2, (tb + tc) / 2, [(Vb[0] + Vc[0]) / 2, (Vb[1] + Vc[1]) / 2, (Vb[2] + Vc[2]) / 2]],
      [(ua + uc) / 2, (ta + tc) / 2, [(Va[0] + Vc[0]) / 2, (Va[1] + Vc[1]) / 2, (Va[2] + Vc[2]) / 2]],
    ];
    let dmax = 0;
    for (const [su, st, flat] of samples) {
      const tru = exact.position(su, st); // TRUE surface (always exact)
      const d = Math.hypot(flat[0] - tru[0], flat[1] - tru[1], flat[2] - tru[2]);
      if (d > dmax) dmax = d;
    }
    out.push(dmax);
  }
  return out;
}

describe('VERIFY export SURFACE FIDELITY vs the true surface (user metric: slivers OK, no surface error)', () => {
  const TOL = 0.1; // mm — print-resolution-class "no error" bar
  for (const level of [7, 8]) {
    it(`level ${level}: deviation from true surface, bilinear-256 vs exact vertex eval`, () => {
      const cornerSnap = 0.06 / (1 << level);
      const uMargin = 1.5 / (1 << level);
      const tMargin = 1 / 1024;
      const graph = extractAnalyticFeatures('SuperformulaBlossom', p, { H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb });
      const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);
      const mesh = triangulateQuadtreeWithFeatures(uniformAnisoQuadtree(level, SFB_UBIAS), clipped, { cornerSnap });
      const bilinear = buildBilinear(256);

      const dCurrent = distOf(deviations(mesh.vertices, mesh.indices, bilinear), TOL); // bilinear-256 verts (production)
      const dFixed = distOf(deviations(mesh.vertices, mesh.indices, exact), TOL);       // exact verts (the fix)

      /* eslint-disable no-console */
      console.log(`\n===== EXPORT SURFACE FIDELITY vs TRUE surface, level ${level} (tol ${TOL}mm) =====`);
      console.log(`  CURRENT (bilinear-256 vertex eval): max ${dCurrent.max.toFixed(3)}mm p99 ${dCurrent.p99.toFixed(3)}mm median ${dCurrent.median.toFixed(4)}mm  >${TOL}mm: ${dCurrent.aboveTol.toFixed(1)}%`);
      console.log(`  FIXED   (exact vertex eval)       : max ${dFixed.max.toFixed(3)}mm p99 ${dFixed.p99.toFixed(3)}mm median ${dFixed.median.toFixed(4)}mm  >${TOL}mm: ${dFixed.aboveTol.toFixed(1)}%`);
      console.log('  (deviation = max{centroid,edge-mids} |true surface - flat triangle|; chord+vertex error combined)');
      console.log('===============================================================================\n');
      /* eslint-enable no-console */

      expect(dCurrent.n).toBeGreaterThan(1000);
    });
  }
});
