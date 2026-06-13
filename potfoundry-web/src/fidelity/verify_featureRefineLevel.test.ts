/**
 * verify_featureRefineLevel.test.ts — does raising featureRefine.level ABOVE the
 * sizing level (which already refines SFB crests to ~8) shrink the surface
 * residual? Task-4 follow-up: born petals gave only -10% because featureRefine
 * (level 7) <= sizing (level 8) is a near-no-op. If deeper feature refinement
 * shrinks the max/residual, it is a GENERAL lever for every edge task.
 *
 * SFB@1, born petals ON, exact eval, seam excluded. Sweeps featureRefine.level.
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
import { deviationVsTrueSurface } from './fidelityGate';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);
const surface = (u: number, t: number): readonly [number, number, number] => exact.position(u, t);
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

describe('Task 4 follow-up — does deeper featureRefine shrink the residual?', () => {
  it('sweeps featureRefine.level {7,9,11} on the SFB born-ON adaptive mesh', () => {
    lever().__pfSfbBornCrests = true;
    const level = 7, seamExclU = 1.5 / (1 << (level + SFB_UBIAS));
    const res = 256;
    const grid = new Float32Array(res * res * 3);
    let w = 0;
    for (let row = 0; row < res; row++) { const tv = row / (res - 1); for (let col = 0; col < res; col++) { const q = surface(col / res, tv); grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2]; } }
    const sampler = new GpuSurfaceSampler(grid, res, res);
    const cornerSnap = 0.06 / (1 << level), uMargin = 1.5 / (1 << level), tMargin = 1 / 1024;
    const graph = extractAnalyticFeatures('SuperformulaBlossom', p, { H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb });
    const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);
    const intersects = (u0: number, t0: number, size: number): boolean => {
      const u1 = u0 + size, t1 = t0 + size;
      for (const ln of clipped) for (let i = 0; i + 1 < ln.points.length; i++) {
        if (segHits(ln.points[i].u, ln.points[i].t, ln.points[i + 1].u, ln.points[i + 1].t, u0, u1, t0, t1)) return true;
      }
      return false;
    };

    /* eslint-disable no-console */
    console.log('\n===== TASK 4 follow-up — featureRefine.level sweep (SFB@1, born ON, exact eval, seam excl) =====');
    console.log('  frLevel | tris    | max mm | p99 mm | #>tol(0.05)');
    const results: Array<{ lvl: number; max: number; nAbove: number; tris: number }> = [];
    for (const frLevel of [7, 9, 11]) {
      const field = new MetricSizingField(sampler, HIGH);
      const qt = new PeriodicBalancedQuadtree(field, sampler, { maxLevel: 12, uBias: SFB_UBIAS, featureRefine: { level: frLevel, intersects } });
      const m = triangulateQuadtreeWithFeatures(qt, clipped, { cornerSnap });
      const mesh = { vertices: Array.from(m.vertices), indices: Array.from(m.indices) };
      const dev = deviationVsTrueSurface(mesh, surface, { tolMm: 0.05, seamExclU });
      results.push({ lvl: frLevel, max: dev.maxMm, nAbove: dev.nAbove, tris: m.indices.length / 3 });
      console.log(`  ${String(frLevel).padStart(7)} | ${String(m.indices.length / 3).padStart(7)} | ${dev.maxMm.toFixed(3).padStart(6)} | ${dev.p99Mm.toFixed(3).padStart(6)} | ${dev.nAbove}`);
    }
    const base = results[0], deep = results[results.length - 1];
    console.log(`  => featureRefine 7->11: max ${base.max.toFixed(2)}->${deep.max.toFixed(2)}mm, #>tol ${base.nAbove}->${deep.nAbove}, tris x${(deep.tris / base.tris).toFixed(2)}`);
    console.log(`  VERDICT: ${deep.nAbove < base.nAbove * 0.5 ? 'DEEPER REFINE HELPS (general lever)' : deep.max < base.max - 0.3 ? 'helps the MAX (straddle-chord shrinks)' : 'NO/MARGINAL help => residual is a NON-inserted feature, not refinement-limited'}`);
    console.log('===============================================================================================\n');
    /* eslint-enable no-console */
    expect(results.length).toBe(3);
  }, 300000);
});
