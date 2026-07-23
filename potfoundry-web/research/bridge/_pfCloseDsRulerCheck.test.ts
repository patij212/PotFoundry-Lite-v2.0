/* eslint-disable no-console */
// _pfCloseDsRulerCheck.test.ts — DEV-ONLY ruler verification (autonomous session 2026-07-23).
// The real-pipeline audit reported DragonScales/ON = 0.823mm (≈ OFF 0.820) despite the cone-fan emitter running.
// HYPOTHESIS: measureProjectorMax under-resolves the DS ring RISERS — its radial-projector grid (nZ) can't represent
// the steep ring transition, so the vertical tread facets read ~half-step (~0.8mm) INFLATION (the ArtDeco riser trap),
// masking the true ~0.005mm fidelity. VERIFY on a DS tread mesh (ring-strip, same tread class as cone-fan) by comparing:
//   (a) measureProjectorMax nZ=512  → should reproduce the audit's ~0.82 inflation
//   (b) measureProjectorMax nZ=4096 → if it DROPS, the 0.82 is a projector-resolution artifact
//   (c) perFaceTrue3DSag (labkit — the ruler the campaign validated DS cone-fan 0.005 with) → the truth
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfCloseDsRulerCheck.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';
import { buildDsRingStripWallGeometric } from '../../src/renderers/webgpu/parametric/conforming/tierC';
import { perFaceTrue3DSag } from './labkit';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };

describe('DragonScales ruler check — riser inflation in measureProjectorMax vs perFaceTrue3DSag', () => {
  it('compares the two rulers on a DS tread mesh', async () => {
    const rA = buildAnalyticRadiusFn('DragonScales', {}, DIMS);
    const nU = 256;
    const wall = buildDsRingStripWallGeometric(rA, DIMS.H, nU);
    const mesh = { vertices: wall.vertices, indices: wall.indices };
    console.log(`[DSRC] DS ring-strip nU=${nU} tris=${wall.indices.length / 3}`);

    const pmCoarse = await measureProjectorMax(mesh, rA, { H: DIMS.H, tolMm: 0.01, nTheta: 2048, nZ: 512 });
    console.log(`[DSRC] measureProjectorMax nZ=512 : max=${pmCoarse.maxMm.toFixed(5)} chord=${pmCoarse.chordMaxMm.toFixed(5)} vtx=${pmCoarse.vertexMaxMm.toFixed(5)}`);

    const pmFine = await measureProjectorMax(mesh, rA, { H: DIMS.H, tolMm: 0.01, nTheta: 2048, nZ: 4096 });
    console.log(`[DSRC] measureProjectorMax nZ=4096: max=${pmFine.maxMm.toFixed(5)} chord=${pmFine.chordMaxMm.toFixed(5)} vtx=${pmFine.vertexMaxMm.toFixed(5)}`);

    const t3 = perFaceTrue3DSag(wall.ut, wall.indices, rA, DIMS.H);
    console.log(`[DSRC] perFaceTrue3DSag (labkit)  : worstMm=${t3.worstMm.toFixed(5)}`);

    console.log(
      `[DSRC] VERDICT: ${
        pmCoarse.maxMm > 5 * t3.worstMm
          ? 'measureProjectorMax INFLATES DS risers (nZ=512 ' + pmCoarse.maxMm.toFixed(3) + ' vs true ' + t3.worstMm.toFixed(3) + ') — audit DS/Bamboo ON numbers are ruler artifacts'
          : 'rulers agree — measureProjectorMax is honest on DS'
      }`,
    );
    expect(Number.isFinite(t3.worstMm)).toBe(true);
  }, 1800000);
});
