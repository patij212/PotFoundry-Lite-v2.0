// inhouseKernel.test.ts — validate the IN-HOUSE metric-Delaunay kernel (the src/fidelity/spike, shipped
// delaunator + true-3D-angle Lawson flips) against the gmsh oracle. (PF_INHOUSE=1.) This is the first lab
// milestone of the kernel rebuild: does our own code (no gmsh) reach the oracle's quality on a smooth style
// AND on the tangled Gyroid? The spike uses ONE global anisotropy scale s=median(√E/√G); the session's
// finding is a per-node surface metric — this harness measures the gap that motivates that upgrade.
import { describe, it, expect } from 'vitest';
import { metricDelaunayRefine, type SurfaceOracle } from '../../src/fidelity/spike/metricDelaunayRefine';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = 2 * Math.PI;
// One smooth + one tangled style — the spike is documented to handle smooth but not tangled.
const STYLES: StyleId[] = ['HarmonicRipple', 'GyroidManifold'] as StyleId[];

describe('in-house metric-Delaunay kernel vs oracle', () => {
  it.skipIf(!process.env.PF_INHOUSE)('spike quality + chord on smooth vs tangled', () => {
    for (const style of STYLES) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const oracle: SurfaceOracle = {
        pos(u: number, t: number) { const th = TAU * u, z = t * DIMS.H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z] as const; },
      };
      const res = metricDelaunayRefine(
        oracle,
        { uMin: 0, uMax: 1, tMin: 0, tMax: 1 },
        { minAngleDeg: 25, maxChordMm: 0.1 },
        { seedN: 10, chordSamples: 4, maxPoints: 20000, maxRounds: 120, flips: true },
      );
      // independent re-measure with the lab instruments (lift uv → 3D), apples-to-apples with gmsh runs
      const lifted = liftUtToRadial(Array.from(res.uv), rA, DIMS.H);
      const idx = Uint32Array.from(res.tris);
      const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: idx });
      const dev = perpendicular3DDeviation({ vertices: lifted.vertices, indices: idx }, lifted.utFlat, rA, { H: DIMS.H, tolMm: 0.1, seamExclU: 0, denseN: 6 });
      // eslint-disable-next-line no-console
      console.log(`${String(style).padEnd(15)} pts=${res.points} tris=${res.triangles} rounds=${res.rounds} hitBudget=${res.hitBudget} | spike: worstAng=${res.worstMinAngleDeg.toFixed(1)} %<25=${res.pctBelowAngle.toFixed(1)} worstChord=${res.worstChordMm.toFixed(3)} | relabel: worst=${q.minAngleDeg.toFixed(1)} p5=${q.p5MinAngleDeg.toFixed(1)} mean=${q.meanMinAngleDeg.toFixed(1)} %<20=${q.pctBelow20.toFixed(1)} rms=${dev.rmsDevMm.toFixed(3)} p99=${dev.p99DevMm.toFixed(3)}`);
      expect(res.triangles).toBeGreaterThan(0);
    }
  }, 20 * 60 * 1000);
});
