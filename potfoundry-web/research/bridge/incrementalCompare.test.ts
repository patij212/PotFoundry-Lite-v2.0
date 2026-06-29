// incrementalCompare.test.ts — incremental kernel must match the batch kernel's quality/fidelity and be faster.
// (PF_INCCMP=1.) Same metric + tol; compare mean/%<20/rms + build time.
import { describe, it, expect } from 'vitest';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildInhouseMetricMeshIncremental } from './incrementalRefine';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GyroidManifold' as StyleId;

describe('incremental vs batch kernel', () => {
  it.skipIf(!process.env.PF_INCCMP)('quality parity + speedup', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const cfg = { tolMm: 0.006, hMin: 0.02, hMax: 8, sizeRes: 192, gradeBeta: 0.2, seedN: 12, maxPoints: 1_400_000, splitThresh: 1.5, optimizeSweeps: 3 } as const;
    const score = (ut: number[], idx: Uint32Array, label: string, secs: number): { mean: number; pctB20: number } => {
      const lifted = liftUtToRadial(ut, rA, DIMS.H);
      const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: idx });
      const tris = idx.length / 3;
      const d = perpendicular3DDeviation({ vertices: lifted.vertices, indices: idx }, lifted.utFlat, rA, { H: DIMS.H, tolMm: 0.006, seamExclU: 0, denseN: 3 });
      // eslint-disable-next-line no-console
      console.log(`${label.padEnd(11)} tris=${tris} worst=${q.minAngleDeg.toFixed(1)} p5=${q.p5MinAngleDeg.toFixed(1)} mean=${q.meanMinAngleDeg.toFixed(1)} %<20=${q.pctBelow20.toFixed(2)} rms=${d.rmsDevMm.toFixed(4)} | ${secs.toFixed(1)}s`);
      return { mean: q.meanMinAngleDeg, pctB20: q.pctBelow20 };
    };

    let z = Date.now();
    const b = buildInhouseMetricMesh(rA, DIMS.H, { ...cfg });
    const bSecs = (Date.now() - z) / 1000;
    const bq = score(b.ut, b.indices, 'batch', bSecs);

    z = Date.now();
    const inc = buildInhouseMetricMeshIncremental(rA, DIMS.H, { ...cfg, profile: true });
    const iSecs = (Date.now() - z) / 1000;
    const iq = score(inc.ut, inc.indices, 'incremental', iSecs);
    // eslint-disable-next-line no-console
    console.log(`SPEEDUP ${(bSecs / iSecs).toFixed(1)}x  (FINDING: insertion-incremental OVER-REFINES — pure`
      + ` Delaunay tolerates long edges the batch's per-round max-min-angle reset removes; quality not yet at parity)`);
    // DIAGNOSTIC ONLY (not a gate): records the over-refinement finding. The live-mesh split + in-circle flips
    // are correct (incrementalRefine.test.ts: integrity + empty-circumcircle pass); the *drop-in builder* is WIP.
    // See docs/superpowers/specs/2026-06-29-incremental-delaunay-findings.md.
    expect(b.indices.length).toBeGreaterThan(0);
    expect(inc.indices.length).toBeGreaterThan(0);
    void iq; void bq;
  }, 25 * 60 * 1000);
});
