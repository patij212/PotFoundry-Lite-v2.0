/* eslint-disable no-console */
// _pfCloseBambooCheck.test.ts — DEV-ONLY (autonomous session 2026-07-23).
// The audit's Bamboo/ON returned generateMesh null: buildConformingWall requires nRing (= the emitter's emergent
// rim = nU) to be a power of two, but BAMBOO_RING_STRIP_DEFAULT_NU=1408 is not. FIX candidate: nU=2048 (pow2, ≥ the
// closing density). Verify: (1) the rim is pow2 at nU=2048, (2) Bamboo actually closes ≤0.01 MAX at nU=2048 (via the
// campaign's perFaceTrue3DSag truth ruler — DS taught us the "closure" claims can be p99-scoped).
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfCloseBambooCheck.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';
import { buildBambooRingStripWallGeometric } from '../../src/renderers/webgpu/parametric/conforming/tierC';
import { perFaceTrue3DSag } from './labkit';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const isPow2 = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;

describe('BambooSegments — pow2 nU fix + MAX closure check', () => {
  it('nU=2048 gives a pow2 rim and (does it?) closes ≤0.01 MAX', async () => {
    const rA = buildAnalyticRadiusFn('BambooSegments', {}, DIMS);
    for (const nU of [1408, 2048]) {
      const wall = buildBambooRingStripWallGeometric(rA, DIMS.H, nU, { sagTolMm: 0.004, nodeCount: 5 });
      const t3 = perFaceTrue3DSag(wall.ut, wall.indices, rA, DIMS.H);
      const pm = await measureProjectorMax({ vertices: wall.vertices, indices: wall.indices }, rA, { H: DIMS.H, tolMm: 0.01, nTheta: 2048, nZ: 1024 });
      console.log(
        `[BB] nU=${nU} rim=${wall.bottomRing.length} pow2=${isPow2(wall.bottomRing.length)} tris=${wall.indices.length / 3} | ` +
          `perFaceTrue3D=${t3.worstMm.toFixed(5)} projMax=${pm.maxMm.toFixed(5)} vtx=${pm.vertexMaxMm.toFixed(5)} | ` +
          `${Math.max(t3.worstMm, pm.maxMm) <= 0.01 ? 'CLOSES ≤0.01 MAX' : 'FLOORS >' + Math.min(t3.worstMm, pm.maxMm).toFixed(3)}`,
      );
    }
    expect(true).toBe(true);
  }, 1800000);
});
