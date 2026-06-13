/**
 * verify_task3_curvatureFloor.test.ts — DE-RISK the (1a) fix BEFORE wiring it
 * into production (audit-first): does an ANALYTIC curvatureFloor (the dormant
 * MetricSizingField hook, MetricSizingField.ts:49) actually drive the sizing
 * field to refine crest FLANKS to the sag tolerance, where the band-limited
 * bilinear-256 sampler cannot?
 *
 * Re-baseline (verify_rebaseline_realpath PART B): production sizing reads the
 * bilinear-256 sampler -> crest flank implied sag 0.48mm median / 5.3mm p99 vs
 * the 0.05mm target (100% over); a denser SAMPLER barely helps (+0.55 quadtree
 * levels @1024) because a finite grid flattens the cusp. The HYPOTHESIS: the
 * lever is ANALYTIC curvature (curvatureFloor), capped at maxKappa so the cusp
 * TIP (an inserted EDGE, Tasks 4-7) doesn't force the budget to infinity.
 *
 * WIRING NOTE (verified): PeriodicBalancedQuadtree.shouldRefine refines on
 * `max(physW,physH) > field.edgeLength(uc,tc)` — the curvature-driven target
 * comes from the FIELD (which curvatureFloor lowers); the sampler only supplies
 * first-order √E,√G. So flooring the FIELD propagates to quadtree refinement
 * with no other change — exactly what Task 3 wires into ConformingWall.
 *
 * Measures crest-FLANK implied sag (the cell beside the crest edge; the singular
 * TIP is excluded — it's an edge), floored vs unfloored, + the realized quadtree
 * crest-band refinement and its leaf-count cost. Pure CPU, read-only, no
 * production change (uses the EXISTING hook).
 */
import { describe, it, expect } from 'vitest';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { MetricSizingField } from '../renderers/webgpu/parametric/conforming/MetricSizingField';
import { PeriodicBalancedQuadtree } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import { principalCurvatureMax } from '../renderers/webgpu/parametric/conforming/SurfaceMetricTensor';
import type { SurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { QuadLeaf } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import { SfbWallSampler, SFB1_PACKED, SFB_UBIAS } from './snapPlacementAudit';
import { sfClosedFormParamRidge } from './crestLateralDeviation';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p) as unknown as SurfaceSampler; // analytic surface (has .position)
type V3 = readonly [number, number, number];

const HIGH = { maxSagMm: 0.05, minEdgeMm: 0.1, maxEdgeMm: 1, gradeRatio: 2, resU: 128, resT: 128 };
// maxKappa = the curvature at which minEdge already achieves tol: 8*maxSag/minEdge^2.
// Above it, refining further is futile (would force sub-minEdge) — that regime is
// the cusp TIP, captured by the inserted crest EDGE, not a cell.
const MAX_KAPPA = (8 * HIGH.maxSagMm) / (HIGH.minEdgeMm * HIGH.minEdgeMm); // = 40 mm^-1
const FINE = 1 / 8192; // analytic FD step (no quantization to de-noise)

const kappaTrue = (u: number, t: number): number => principalCurvatureMax(exact, u, t, FINE, FINE);
const curvatureFloor = (u: number, t: number): number => Math.min(MAX_KAPPA, kappaTrue(u, t));

function buildBilinear(res: number): GpuSurfaceSampler {
  const grid = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) {
    const tVal = row / (res - 1);
    for (let col = 0; col < res; col++) {
      const q = exact.position(col / res, tVal) as V3;
      grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2];
    }
  }
  return new GpuSurfaceSampler(grid, res, res);
}

function crestLociAt(t: number): number[] {
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

const pctl = (arr: number[], q: number): number => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const median = (a: number[]): number => pctl(a, 0.5);

describe('VERIFY Task 3 de-risk — analytic curvatureFloor refines crest flanks to tol', () => {
  it('floored vs unfloored sizing: crest-FLANK implied sag (tip excluded)', () => {
    const s256 = buildBilinear(256);
    const fieldNo = new MetricSizingField(s256, HIGH);
    const fieldFloor = new MetricSizingField(s256, { ...HIGH, curvatureFloor, maxKappa: MAX_KAPPA });

    // Flank band: |Δu| in [tipGuard, flankReach] around each crest locus. The tip
    // (|Δu| < tipGuard) is the inserted EDGE (Tasks 4-7), excluded here.
    const tipGuard = 0.0008, flankReach = 0.004;
    const sagNo: number[] = [], sagFloor: number[] = [];
    for (let itr = 1; itr < 200; itr++) {
      const t = itr / 200;
      for (const uc of crestLociAt(t)) {
        if (uc < 0.02 || uc > 0.98) continue; // seam excluded
        for (const du of [-flankReach, -0.002, -tipGuard, tipGuard, 0.002, flankReach]) {
          const u = uc + du;
          if (u <= 0 || u >= 1) continue;
          const k = Math.max(kappaTrue(u, t), 1e-6); // TRUE flank curvature (uncapped)
          sagNo.push((fieldNo.edgeLength(u, t) ** 2 * k) / 8);
          sagFloor.push((fieldFloor.edgeLength(u, t) ** 2 * k) / 8);
        }
      }
    }
    const overNo = 100 * sagNo.filter((s) => s > HIGH.maxSagMm).length / sagNo.length;
    const overFloor = 100 * sagFloor.filter((s) => s > HIGH.maxSagMm).length / sagFloor.length;
    /* eslint-disable no-console */
    console.log('\n===== TASK 3 DE-RISK — crest-FLANK implied sag (tip excluded), floored vs unfloored sizing =====');
    console.log(`  UNFLOORED (production): median ${median(sagNo).toFixed(3)}mm  p99 ${pctl(sagNo, 0.99).toFixed(3)}mm  over-${HIGH.maxSagMm}mm ${overNo.toFixed(0)}%`);
    console.log(`  FLOORED (analytic κ):  median ${median(sagFloor).toFixed(3)}mm  p99 ${pctl(sagFloor, 0.99).toFixed(3)}mm  over-${HIGH.maxSagMm}mm ${overFloor.toFixed(0)}%`);
    console.log(`  => analytic curvatureFloor cuts crest-flank over-tol fraction ${overNo.toFixed(0)}% -> ${overFloor.toFixed(0)}%`);
    console.log('  (maxKappa caps the cusp TIP, which is an inserted edge; flank curvature ≤ maxKappa is sized to tol by the sagitta law)');
    console.log('=============================================================================================\n');
    /* eslint-enable no-console */
    expect(sagNo.length).toBeGreaterThan(50);
    // DECISION (refuted hypothesis): the production adaptive flank sizing is ALREADY
    // adequate (the cusp tip is an inserted edge, not a cell), and the analytic
    // curvatureFloor does NOT materially change it ⇒ Task 3 (analytic sizing) is
    // NOT the lever; EDGES (Tasks 4-7) are.
    expect(overNo).toBeLessThan(5);                       // production flank already ~at tol
    expect(Math.abs(overFloor - overNo)).toBeLessThan(2); // floor changes it < 2pp (no payoff)
  }, 180000);

  it('realized quadtree refinement + leaf-count cost (floored vs unfloored, 256 sampler)', () => {
    const s256 = buildBilinear(256);
    const mk = (floor: boolean): PeriodicBalancedQuadtree =>
      new PeriodicBalancedQuadtree(
        new MetricSizingField(s256, floor ? { ...HIGH, curvatureFloor, maxKappa: MAX_KAPPA } : HIGH),
        s256,
        { maxLevel: 12, uBias: SFB_UBIAS },
      );
    const crestBand = (qt: PeriodicBalancedQuadtree): { leaves: number; crestLeaves: number; meanCrestLevel: number; maxCrestLevel: number } => {
      const ls = qt.leaves() as QuadLeaf[];
      let crestLeaves = 0, levelSum = 0, maxLvl = 0;
      for (const lf of ls) {
        const tMid = lf.t0 + (1 / (1 << lf.level)) / 2;
        const uSize = 1 / (1 << (lf.level + qt.uBias() + (lf.uExtra ?? 0)));
        if (crestLociAt(tMid).some((uc) => uc >= lf.u0 - uSize && uc <= lf.u0 + 2 * uSize && uc > 0.02 && uc < 0.98)) {
          crestLeaves++; levelSum += lf.level; maxLvl = Math.max(maxLvl, lf.level);
        }
      }
      return { leaves: ls.length, crestLeaves, meanCrestLevel: levelSum / Math.max(1, crestLeaves), maxCrestLevel: maxLvl };
    };
    const no = crestBand(mk(false)), fl = crestBand(mk(true));
    /* eslint-disable no-console */
    console.log('\n===== TASK 3 DE-RISK — realized quadtree refinement (256 sampler, floored vs unfloored) =====');
    console.log(`  UNFLOORED: total leaves ${no.leaves}, crest-band leaves ${no.crestLeaves}, mean crest level ${no.meanCrestLevel.toFixed(2)}, max ${no.maxCrestLevel}`);
    console.log(`  FLOORED:   total leaves ${fl.leaves}, crest-band leaves ${fl.crestLeaves}, mean crest level ${fl.meanCrestLevel.toFixed(2)}, max ${fl.maxCrestLevel}`);
    console.log(`  => analytic floor adds ${(fl.meanCrestLevel - no.meanCrestLevel).toFixed(2)} crest levels (vs +0.55 from a denser SAMPLER); total-leaf cost x${(fl.leaves / Math.max(1, no.leaves)).toFixed(2)} (budget impact)`);
    console.log('===========================================================================================\n');
    /* eslint-enable no-console */
    // The analytic floor adds only a MARGINAL crest refinement (< 1 level) at a
    // real leaf-count cost ⇒ corroborates that Task 3 is not the lever.
    expect(fl.meanCrestLevel - no.meanCrestLevel).toBeLessThan(1);
  }, 600000);
});
