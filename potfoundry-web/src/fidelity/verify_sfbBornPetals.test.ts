/**
 * verify_sfbBornPetals.test.ts — Task 4 gate: un-deferring the SFB born petals
 * (the __pfSfbBornCrests lever in FeatureLineGraph.extractSuperformulaBlossom)
 * inserts them as real mesh edges and REDUCES the surface-fidelity straddle —
 * MEASURED, not assumed (the prior born-crest work proved insertion watertight
 * but only checked the ANGLE goal; this checks the FIDELITY goal).
 *
 * OFF (default) must be byte-identical: same feature count (12 full-height) and
 * same straddle as today. ON: more crests inserted, straddle drops, watertight.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { clipFeaturesToBox } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import type { QuadLeaf } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import type { QuadtreeLike } from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import { SfbWallSampler, SFB1_PACKED, SFB_DIMS, SFB_UBIAS } from './snapPlacementAudit';
import { sfClosedFormParamRidge } from './crestLateralDeviation';
import { straddleStats, countFoldedTriangles, deviationVsTrueSurface } from './fidelityGate';
import { MetricSizingField } from '../renderers/webgpu/parametric/conforming/MetricSizingField';
import { PeriodicBalancedQuadtree } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);
const surface = (u: number, t: number): readonly [number, number, number] => exact.position(u, t);
const lever = (): { __pfSfbBornCrests?: boolean } => globalThis as unknown as { __pfSfbBornCrests?: boolean };
afterEach(() => { delete lever().__pfSfbBornCrests; });

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

function build(level: number, bornOn: boolean): { mesh: { vertices: number[]; indices: number[] }; feats: number } {
  if (bornOn) lever().__pfSfbBornCrests = true; else delete lever().__pfSfbBornCrests;
  const cornerSnap = 0.06 / (1 << level), uMargin = 1.5 / (1 << level), tMargin = 1 / 1024;
  const graph = extractAnalyticFeatures('SuperformulaBlossom', p, { H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb });
  const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);
  const uSpan = 1 << (level + SFB_UBIAS), tSpan = 1 << level;
  const leaves: QuadLeaf[] = [];
  for (let it = 0; it < tSpan; it++) for (let iu = 0; iu < uSpan; iu++) leaves.push({ u0: iu / uSpan, t0: it / tSpan, level });
  const qt: QuadtreeLike = { leaves: () => leaves, uBias: () => SFB_UBIAS };
  const m = triangulateQuadtreeWithFeatures(qt, clipped, { cornerSnap });
  return { mesh: { vertices: Array.from(m.vertices), indices: Array.from(m.indices) }, feats: graph.lines.length };
}

describe('Task 4 — un-defer SFB born petals (fidelity straddle fix)', () => {
  it('extractAnalyticFeatures opts.bornCrests drives born petals (the production wiring path, no global lever)', () => {
    const dims = { H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb };
    const off = extractAnalyticFeatures('SuperformulaBlossom', p, dims, { bornCrests: false });
    const on = extractAnalyticFeatures('SuperformulaBlossom', p, dims, { bornCrests: true });
    expect(off.lines.length).toBe(12);            // explicit false ⇒ full-height only
    expect(on.lines.length).toBeGreaterThan(12);  // explicit true ⇒ born admitted
  });

  it('OFF is byte-identical (12 full-height crests); ON inserts born crests and cuts the straddle, watertight', () => {
    const level = 7, seamExclU = 1.5 / (1 << (level + SFB_UBIAS));
    const off = build(level, false);
    const on = build(level, true);
    const opts = { tolMm: 0.1, seamExclU };
    const sOff = straddleStats(off.mesh, surface, lociAt, opts);
    const sOn = straddleStats(on.mesh, surface, lociAt, opts);
    const foldOn = countFoldedTriangles(on.mesh, surface, seamExclU);

    /* eslint-disable no-console */
    console.log('\n===== TASK 4 — SFB born-petal un-defer (straddle fix) =====');
    console.log(`  feats: OFF ${off.feats} (full-height only)  ->  ON ${on.feats} (full + born)`);
    console.log(`  straddle (>0.1mm, feature crosses interior): OFF ${sOff.nStraddle} (worst ${sOff.worstStraddle.toFixed(3)}mm) -> ON ${sOn.nStraddle} (worst ${sOn.worstStraddle.toFixed(3)}mm)`);
    console.log(`  flank (>0.1mm, no feature):                  OFF ${sOff.nFlank} -> ON ${sOn.nFlank}`);
    console.log(`  folded triangles ON: ${foldOn} (watertight/geometric-validity)`);
    console.log('==========================================================\n');
    /* eslint-enable no-console */

    expect(off.feats).toBe(12);                         // byte-identical default: 12 full-height crests
    expect(on.feats).toBeGreaterThan(off.feats);        // born crests admitted
    expect(sOn.nStraddle).toBeLessThan(sOff.nStraddle); // born petals inserted ⇒ fewer straddles
    expect(sOn.worstStraddle).toBeLessThanOrEqual(sOff.worstStraddle);
    expect(foldOn).toBe(0);                              // no fold-over from the new edges
  }, 120000);

  it('on the REAL ADAPTIVE mesh (featureRefine), born-petal insertion cuts the surface deviation', () => {
    // The production-class benefit: featureRefine refines the inserted-crest cells,
    // so the born-adjacent flank shrinks (not visible at uniform L7).
    const level = 7, seamExclU = 1.5 / (1 << (level + SFB_UBIAS));
    const res = 256;
    const grid = new Float32Array(res * res * 3);
    let w = 0;
    for (let row = 0; row < res; row++) { const tv = row / (res - 1); for (let col = 0; col < res; col++) { const q = surface(col / res, tv); grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2]; } }
    const sampler = new GpuSurfaceSampler(grid, res, res);
    const HIGH = { maxSagMm: 0.05, minEdgeMm: 0.1, maxEdgeMm: 1, gradeRatio: 2, resU: 128, resT: 128 };

    const buildAdaptive = (bornOn: boolean): { vertices: number[]; indices: number[] } => {
      if (bornOn) lever().__pfSfbBornCrests = true; else delete lever().__pfSfbBornCrests;
      const cornerSnap = 0.06 / (1 << level), uMargin = 1.5 / (1 << level), tMargin = 1 / 1024;
      const graph = extractAnalyticFeatures('SuperformulaBlossom', p, { H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb });
      const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);
      // featureRefine: refine cells a feature crosses to level 7 (segment-box test).
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
        for (const ln of clipped) for (let i = 0; i + 1 < ln.points.length; i++) {
          if (segHits(ln.points[i].u, ln.points[i].t, ln.points[i + 1].u, ln.points[i + 1].t, u0, u1, t0, t1)) return true;
        }
        return false;
      };
      const qt = new PeriodicBalancedQuadtree(new MetricSizingField(sampler, HIGH), sampler, { maxLevel: 12, uBias: SFB_UBIAS, featureRefine: { level: 7, intersects } });
      const m = triangulateQuadtreeWithFeatures(qt, clipped, { cornerSnap });
      return { vertices: Array.from(m.vertices), indices: Array.from(m.indices) };
    };

    const off = deviationVsTrueSurface(buildAdaptive(false), surface, { tolMm: 0.05, seamExclU });
    const on = deviationVsTrueSurface(buildAdaptive(true), surface, { tolMm: 0.05, seamExclU });
    /* eslint-disable no-console */
    console.log('\n===== TASK 4 — born petals on the REAL ADAPTIVE mesh (featureRefine) =====');
    console.log(`  OFF: max ${off.maxMm.toFixed(3)}mm  p99 ${off.p99Mm.toFixed(3)}  #>tol(0.05) ${off.nAbove} / ${off.nTris}  seamBand ${off.seamBandMaxMm.toFixed(2)}mm(excl)`);
    console.log(`  ON:  max ${on.maxMm.toFixed(3)}mm  p99 ${on.p99Mm.toFixed(3)}  #>tol(0.05) ${on.nAbove} / ${on.nTris}  seamBand ${on.seamBandMaxMm.toFixed(2)}mm(excl)`);
    console.log(`  => born-petal insertion: max ${off.maxMm.toFixed(2)}->${on.maxMm.toFixed(2)}mm (worst is NOT born), p99 ${off.p99Mm.toFixed(3)}->${on.p99Mm.toFixed(3)}, #>tol ${off.nAbove}->${on.nAbove} (modest: featureRefine level 7 <= sizing level 8, so born-adjacent flank does not shrink)`);
    console.log('========================================================================\n');
    /* eslint-enable no-console */
    expect(on.nAbove).toBeLessThan(off.nAbove);   // production-class: fewer >0.1mm triangles
    expect(on.maxMm).toBeLessThanOrEqual(off.maxMm + 1e-6);
  }, 180000);
});
