// inhouseOptimize.test.ts — close the in-house spike's tangled-style gap with a mesh-OPTIMIZATION pass that
// it lacks (gmsh has it): iterated [on-surface vertex relocation + true-3D-angle Lawson flip] = CVT/ODT-lite.
// (PF_OPT=1.) Hypothesis: optimization lifts Gyroid mean 35.9→~45 and cuts %<20 12%→low, toward the oracle.
import { describe, it, expect } from 'vitest';
import { metricDelaunayRefine, metricFlipPasses, type SurfaceOracle } from '../../src/fidelity/spike/metricDelaunayRefine';
import { smoothSurfaceOnRadial } from './surfaceSmoothing';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = 2 * Math.PI;

describe('in-house kernel — optimization pass closes the tangled gap', () => {
  it.skipIf(!process.env.PF_OPT)('Gyroid: refine then iterate [smooth + flip]', () => {
    const style = 'GyroidManifold' as StyleId;
    const rA = buildRadiusFn(style, {}, DIMS);
    const oracle: SurfaceOracle = { pos(u, t) { const th = TAU * u, z = t * DIMS.H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z] as const; } };
    const measure = (uv: number[], tris: Uint32Array, tag: string): void => {
      const lifted = liftUtToRadial(uv, rA, DIMS.H);
      const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: tris });
      const dev = perpendicular3DDeviation({ vertices: lifted.vertices, indices: tris }, lifted.utFlat, rA, { H: DIMS.H, tolMm: 0.1, seamExclU: 0, denseN: 6 });
      // eslint-disable-next-line no-console
      console.log(`${tag.padEnd(14)} tris=${tris.length / 3} worst=${q.minAngleDeg.toFixed(1)} p5=${q.p5MinAngleDeg.toFixed(1)} mean=${q.meanMinAngleDeg.toFixed(1)} %<20=${q.pctBelow20.toFixed(1)} rms=${dev.rmsDevMm.toFixed(3)} p99=${dev.p99DevMm.toFixed(3)}`);
    };

    const res = metricDelaunayRefine(oracle, { uMin: 0, uMax: 1, tMin: 0, tMax: 1 }, { minAngleDeg: 25, maxChordMm: 0.1 }, { seedN: 10, chordSamples: 4, maxPoints: 20000, maxRounds: 120, flips: true });
    let uv = Array.from(res.uv);
    let tris = res.tris;
    measure(uv, tris, 'refine-only');

    // optimization sweeps: relocate interior vertices on the surface, then re-flip to the true-3D Delaunay
    for (let k = 0; k < 8; k++) {
      uv = smoothSurfaceOnRadial(uv, tris, rA, DIMS.H, { iterations: 3, relax: 0.5 });
      tris = metricFlipPasses(uv, tris, oracle, 10);
      if (k === 2 || k === 7) measure(uv, tris, `+opt×${k + 1}`);
    }
    expect(tris.length).toBeGreaterThan(0);
  }, 20 * 60 * 1000);
});
