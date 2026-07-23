/* eslint-disable no-console */
import { describe, expect, it } from 'vitest';
import { buildAnalyticRadiusFn } from '../geometry/analyticRadius';
import { measureProjectorMax, type ProjectorMaxReport } from './measureProjectorMax';
import type { AnalyticRadiusFn } from './analyticSurfaceGate';
import {
  buildDsRingStripWallGeometric,
  buildBambooRingStripWallGeometric,
  type DsRingStripWall,
} from '../renderers/webgpu/parametric/conforming/tierC';

/**
 * Cross-validation gate for the audit ruler `measureProjectorMax` (Task 2 of the
 * production-export-truth plan) on the two MULTI-VALUED styles (DragonScales rings,
 * BambooSegments treads) — the only place a single-valued radial reference could produce a
 * REFERENCE ARTIFACT (rA cannot store a genuine overhang ⇒ a large false deviation that is
 * the ruler, not the mesh — the BasketWeave vertexMax=2.0mm failure mode).
 *
 * Both emitters build their walls by evaluating a single-valued `analyticRA`, so the ruler is
 * honest iff:
 *   - vertexMax ≈ 0  ⇒ vertices land on the analytic surface (rA IS the right reference);
 *   - chordMax SHRINKS with circumferential density ⇒ the residual is real tessellation error
 *     the mesher reduces, not a fixed reference gap (a genuine value JUMP would floor).
 * Measured on the lighter ring-strip (same double-valued tread as the cone-fan, minus the
 * expensive per-tip fans) at small nU, so it stays a fast STANDING test. This is the
 * ruler-honesty gate, NOT the absolute ≤0.01mm closure (measured faithfully at production
 * density by the Task-5 GPU run).
 */
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const PROJ = { nTheta: 1024, nZ: 384, maxIter: 8 };

async function m(tag: string, wall: DsRingStripWall, rA: AnalyticRadiusFn): Promise<ProjectorMaxReport> {
  const t0 = Date.now();
  const r = await measureProjectorMax(
    { vertices: wall.vertices, indices: wall.indices },
    rA,
    { H: DIMS.H, tolMm: 0.01, ...PROJ },
  );
  console.log(
    `[crossval] ${tag}: tris=${wall.indices.length / 3} maxMm=${r.maxMm.toFixed(5)} ` +
      `chordMax=${r.chordMaxMm.toFixed(5)} vertexMax=${r.vertexMaxMm.toFixed(5)} ` +
      `nonFinite=${r.nonFiniteCount} ms=${Date.now() - t0}`,
  );
  return r;
}

describe('exportTruth ruler cross-validation (measureProjectorMax on the multi-valued styles)', () => {
  it('DragonScales ring-strip: on-surface vertices + density-responsive chord (no rA artifact)', async () => {
    const rA = buildAnalyticRadiusFn('DragonScales', {}, DIMS);
    const coarse = await m('DS/nU64', buildDsRingStripWallGeometric(rA, DIMS.H, 64), rA);
    const fine = await m('DS/nU128', buildDsRingStripWallGeometric(rA, DIMS.H, 128), rA);
    expect(coarse.nonFiniteCount).toBe(0);
    expect(fine.nonFiniteCount).toBe(0);
    expect(fine.vertexMaxMm).toBeLessThan(0.01); // vertices ON the analytic surface (no artifact)
    expect(Number.isFinite(fine.maxMm)).toBe(true);
    expect(fine.chordMaxMm).toBeLessThan(coarse.chordMaxMm); // real tessellation error → shrinks with density
  }, 180000);

  it('BambooSegments ring-strip: on-surface vertices + density-responsive chord (no rA artifact)', async () => {
    const rA = buildAnalyticRadiusFn('BambooSegments', {}, DIMS);
    const coarse = await m('BB/nU64', buildBambooRingStripWallGeometric(rA, DIMS.H, 64, { sagTolMm: 0.004, nodeCount: 5 }), rA);
    const fine = await m('BB/nU128', buildBambooRingStripWallGeometric(rA, DIMS.H, 128, { sagTolMm: 0.004, nodeCount: 5 }), rA);
    expect(coarse.nonFiniteCount).toBe(0);
    expect(fine.nonFiniteCount).toBe(0);
    expect(fine.vertexMaxMm).toBeLessThan(0.01);
    expect(Number.isFinite(fine.maxMm)).toBe(true);
    expect(fine.chordMaxMm).toBeLessThan(coarse.chordMaxMm);
  }, 180000);
});
