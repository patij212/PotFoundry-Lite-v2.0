/* eslint-disable no-console */
// _pfCloseDsSmooth.test.ts — DEV-ONLY (autonomous session 2026-07-23).
// Bamboo's smooth complement closed (0.0045) once its t-band treads were excluded ⇒ the 0.86 was rA-ruler tread
// inflation. DS has the same mechanism but 2D scale-boundary risers (not t-bands), so use a GEOMETRIC tread filter:
// a face whose vertex-RADIUS spread (max|xy| − min|xy|) is large is a near-vertical riser/tread rA cannot score.
// Exclude those, measure the smooth remainder vs rA. If ≤0.01 ⇒ DS closes (treads faithful, 0.82 was inflation).
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfCloseDsSmooth.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';
import { buildDsConeFanWallGeometric } from '../../src/renderers/webgpu/parametric/conforming/tierC';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };

describe('DragonScales — geometric smooth-complement (radial-riser faces excluded)', () => {
  it('excludes large-radius-spread faces and measures the smooth remainder', async () => {
    const rA = buildAnalyticRadiusFn('DragonScales', {}, DIMS);
    const nU = 1024;
    const wall = buildDsConeFanWallGeometric(rA, DIMS.H, nU);
    const V = wall.vertices, I = wall.indices;
    const radial = (vi: number): number => Math.hypot(V[3 * vi], V[3 * vi + 1]);
    // Sweep the radius-spread threshold: how much of the 0.82 is riser faces?
    for (const thr of [0.2, 0.1, 0.05]) {
      const keep: number[] = [];
      let risers = 0;
      for (let f = 0; f + 2 < I.length; f += 3) {
        const a = I[f], b = I[f + 1], c = I[f + 2];
        const ra = radial(a), rb = radial(b), rc = radial(c);
        const spread = Math.max(ra, rb, rc) - Math.min(ra, rb, rc);
        if (spread > thr) risers++;
        else keep.push(a, b, c);
      }
      const r = await measureProjectorMax({ vertices: V, indices: new Uint32Array(keep) }, rA, { H: DIMS.H, tolMm: 0.01, nTheta: 2048, nZ: 1024 });
      console.log(
        `[DSS] nU=${nU} thr=${thr}mm risers=${risers}/${I.length / 3} kept=${keep.length / 3} | ` +
          `SMOOTH max=${r.maxMm.toFixed(5)} chord=${r.chordMaxMm.toFixed(5)} vtx=${r.vertexMaxMm.toFixed(5)} p99=${r.p99Mm.toFixed(5)} | ` +
          `${r.maxMm <= 0.01 ? 'CLOSES' : 'floors'}`,
      );
    }
    expect(true).toBe(true);
  }, 2400000);
});
