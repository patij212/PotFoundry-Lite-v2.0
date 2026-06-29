// onDemandMetric.test.ts — does ON-DEMAND fine curvature (no grid band-limit) close the Gyroid crease chord?
// (PF_ONDEMAND=1.) Crease-aligned mesh with the grid metric vs the on-demand metric (fine fdStep), + iso baseline.
import { describe, it, expect } from 'vitest';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildCreaseAlignedMesh, metricMinAngleDeg } from './creaseAlignedMesh';
import { creaseMetricAt } from './onDemandMetric';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GyroidManifold' as StyleId;
const TOL = 0.006, HMIN = 0.02, HMAX = 1.0;

describe('on-demand curvature closes the crease chord?', () => {
  it.skipIf(!process.env.PF_ONDEMAND)('Gyroid: grid crease vs on-demand crease vs iso', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const metricFn = (fd: number) => (u: number, t: number): [number, number, number] => creaseMetricAt(rA, DIMS.H, u, t, { tolMm: TOL, hMin: HMIN, hMax: HMAX, fdStep: fd });
    const report = (label: string, ut: number[], idx: Uint32Array, mAt: (u: number, t: number) => [number, number, number]): void => {
      const lifted = liftUtToRadial(ut, rA, DIMS.H);
      const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: idx });
      const dev = perpendicular3DDeviation({ vertices: lifted.vertices, indices: idx }, lifted.utFlat, rA, { H: DIMS.H, tolMm: TOL, seamExclU: 0, denseN: 3 });
      let mSum = 0, mBelow = 0, n = 0;
      for (let t = 0; t < idx.length; t += 3) { const ma = metricMinAngleDeg(ut, idx[t], idx[t + 1], idx[t + 2], mAt); if (ma <= 0) continue; mSum += ma; if (ma < 20) mBelow++; n++; }
      // eslint-disable-next-line no-console
      console.log(`${label.padEnd(18)} tris=${(idx.length / 3).toString().padStart(7)} | chord rms=${dev.rmsDevMm.toFixed(4)} p99=${dev.p99DevMm.toFixed(4)} | ISO-3D mean=${q.meanMinAngleDeg.toFixed(1)} %<20=${q.pctBelow20.toFixed(1)} | IN-METRIC mean=${(mSum / n).toFixed(1)} %<20=${(100 * mBelow / n).toFixed(1)}`);
    };

    const MP = 700_000;
    const iso = buildInhouseMetricMesh(rA, DIMS.H, { tolMm: TOL, hMin: HMIN, hMax: HMAX, sizeRes: 256, gradeBeta: 0.2, seedN: 12, maxPoints: MP, splitThresh: 1.5, optimizeSweeps: 3 });
    report('iso (grid256)', iso.ut, iso.indices, metricFn(1e-3));
    for (const res of [256, 512, 768]) {
      const g = buildCreaseAlignedMesh(rA, DIMS.H, { tolMm: TOL, hMin: HMIN, hMax: HMAX, sizeRes: res, seedN: 12, maxPoints: MP, splitThresh: 1.5 });
      report(`crease grid${res}`, g.ut, g.indices, metricFn(1e-3));
    }
    // on-demand (no grid band-limit) reference — slow per query, so a SMALL budget just to read the chord trend
    const od = buildCreaseAlignedMesh(rA, DIMS.H, { tolMm: TOL, hMin: HMIN, hMax: HMAX, seedN: 12, maxPoints: 180_000, splitThresh: 1.5, metricFn: metricFn(1e-3) });
    report('crease ondemand180k', od.ut, od.indices, metricFn(1e-3));
    expect(od.indices.length).toBeGreaterThan(0);
  }, 25 * 60 * 1000);
});
