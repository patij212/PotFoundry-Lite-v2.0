import { describe, it, expect } from 'vitest';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import { refineToZeroOutliers } from './noBridgeRefine';
import { DEFAULT_RULER, scoreWholeMesh, radialSurfaceFromSampler } from './interiorRuler';

// DEV DIAGNOSTIC (PF_GSPROBE=1): time the GeoStar Tier-C build stages at a
// SMALL domain + low nTheta to localize where the full gate spends its time.
const GO = process.env.PF_GSPROBE === '1';

describe.skipIf(!GO)('GeoStar Tier-C stage timing', () => {
  it('build complex + one small refine — timed', () => {
    const t0 = Date.now();
    const sampler = styleSampler('GeometricStar', {}, { H: 120, Rt: 50, Rb: 40 });
    // eslint-disable-next-line no-console
    console.log(`[gsprobe] sampler built ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    const t1 = Date.now();
    const complex = buildProtectedComplex(sampler, 'GeometricStar');
    // eslint-disable-next-line no-console
    console.log(
      `[gsprobe] complex built ${((Date.now() - t1) / 1000).toFixed(1)}s ` +
        `verts=${complex.vertices.length / 2} edges=${complex.edges.length} ` +
        `residualCrossings=${complex.residualCrossings}`,
    );
    expect(complex.residualCrossings).toBe(0);

    // A TINY domain + low nTheta to see the loop progress at all.
    const t2 = Date.now();
    const refined = refineToZeroOutliers(
      sampler,
      complex,
      { uLo: 0, uHi: 0.05, tLo: 0.45, tHi: 0.55 },
      {
        tolMm: 0.01,
        maxPass: 8,
        bulkPasses7pt: 3,
        bgArcMm: 0.6,
        ruler: { ...DEFAULT_RULER, nTheta: 256, thetaWindowRad: 0.5 },
      },
      (s) => {
        // eslint-disable-next-line no-console
        console.log(
          `[gsprobe pass ${s.pass}${s.dense ? ' DENSE' : ' 7pt'}] tris=${s.nTris} ` +
            `out=${s.outliers} worst=${s.worstMm.toFixed(5)} inserted=${s.inserted} ` +
            `brute=${s.bruteCalls} ${(s.ms / 1000).toFixed(1)}s`,
        );
      },
    );
    // eslint-disable-next-line no-console
    console.log(
      `[gsprobe] refine done ${((Date.now() - t2) / 1000).toFixed(1)}s ` +
        `capped=${refined.capped} tris=${refined.tris.length / 3}`,
    );

    const surface = radialSurfaceFromSampler(sampler);
    const score = scoreWholeMesh(sampler, surface, refined, 0.01, {
      ...DEFAULT_RULER,
      nTheta: 256,
    });
    // eslint-disable-next-line no-console
    console.log(
      `[gsprobe] whole-mesh guard: nFacets=${score.nFacets} outliers=${score.outliers} max=${score.maxMm.toFixed(5)}`,
    );
    expect(refined.tris.length).toBeGreaterThan(0);
  }, 15 * 60 * 1000);
});
