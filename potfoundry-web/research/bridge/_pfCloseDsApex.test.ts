/* eslint-disable no-console */
// _pfCloseDsApex.test.ts — DEV-ONLY (autonomous session 2026-07-23).
// DS smooth complement floors at 0.096 MAX (nU1024) = the scale-tip cone apex. Classify it: does the apex chord
// DECREASE with circumferential density (⇒ resolvable, keep refining) or is it DENSITY-INVARIANT (⇒ a cone-apex
// singularity flat facets can't close — a finite-area-needle concession, same class as Gothic/GeoStar)?
// Also locate the worst face (radius) to confirm it is the apex.
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfCloseDsApex.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';
import { buildDsConeFanWallGeometric } from '../../src/renderers/webgpu/parametric/conforming/tierC';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };

describe('DragonScales — scale-tip apex density classification', () => {
  it('apex smooth-complement MAX vs circumferential density', async () => {
    const rA = buildAnalyticRadiusFn('DragonScales', {}, DIMS);
    const results: Array<{ nU: number; max: number }> = [];
    for (const nU of [512, 2048]) {
      const wall = buildDsConeFanWallGeometric(rA, DIMS.H, nU);
      const V = wall.vertices, I = wall.indices;
      const radial = (vi: number): number => Math.hypot(V[3 * vi], V[3 * vi + 1]);
      const keep: number[] = [];
      for (let f = 0; f + 2 < I.length; f += 3) {
        const a = I[f], b = I[f + 1], c = I[f + 2];
        const ra = radial(a), rb = radial(b), rc = radial(c);
        if (Math.max(ra, rb, rc) - Math.min(ra, rb, rc) <= 0.2) keep.push(a, b, c);
      }
      const r = await measureProjectorMax({ vertices: V, indices: new Uint32Array(keep) }, rA, { H: DIMS.H, tolMm: 0.01, nTheta: 2048, nZ: 1024 });
      results.push({ nU, max: r.maxMm });
      console.log(`[DSA] nU=${nU} smooth-tris=${keep.length / 3} MAX=${r.maxMm.toFixed(5)} p99=${r.p99Mm.toFixed(5)}`);
    }
    // With nU1024=0.096 known: if 512 > 1024 > 2048 (decreasing) ⇒ resolvable; if ~flat ⇒ singularity/concession.
    console.log(`[DSA] trend nU512=${results[0].max.toFixed(4)} (nU1024=0.0965) nU2048=${results[1].max.toFixed(4)} ⇒ ${results[1].max < 0.6 * results[0].max ? 'DECREASING (resolvable by density)' : 'DENSITY-INVARIANT (cone-apex singularity ⇒ finite-needle concession)'}`);
    expect(results.length).toBe(2);
  }, 2400000);
});
