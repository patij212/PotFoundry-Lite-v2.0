/* eslint-disable no-console */
// _pfCloseDsConeFanCheck.test.ts — DEV-ONLY (autonomous session 2026-07-23).
// The audit's DS/ON uses the CONE-FAN (buildDsConeFanWallGeometric, adds per-apex scale-tip cones) and measured
// 0.823mm. The ring-strip (no cones) also floors ~0.82 (both rulers agree). Q: does the CONE-FAN in ISOLATION (Node)
// close DS to ≤0.01 MAX (⇒ audit's 0.82 = a CPU↔GPU pipeline divergence) or does it ALSO floor ~0.82 (⇒ DS genuinely
// not closed at MAX)? Measured with BOTH rulers (they agreed on the ring-strip). Also report where the worst facet is.
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfCloseDsConeFanCheck.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';
import { buildDsConeFanWallGeometric } from '../../src/renderers/webgpu/parametric/conforming/tierC';
import { perFaceTrue3DSag } from './labkit';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };

describe('DragonScales cone-fan — isolated MAX check (mesh vs pipeline)', () => {
  it('does the cone-fan close DS to <=0.01 MAX in isolation?', async () => {
    const rA = buildAnalyticRadiusFn('DragonScales', {}, DIMS);
    for (const nU of [1024, 2048]) {
      const wall = buildDsConeFanWallGeometric(rA, DIMS.H, nU);
      const mesh = { vertices: wall.vertices, indices: wall.indices };
      const pm = await measureProjectorMax(mesh, rA, { H: DIMS.H, tolMm: 0.01, nTheta: 2048, nZ: 1024 });
      const t3 = perFaceTrue3DSag(wall.ut, wall.indices, rA, DIMS.H);
      console.log(
        `[DSCF] cone-fan nU=${nU} tris=${wall.indices.length / 3} | projMax=${pm.maxMm.toFixed(5)} ` +
          `chord=${pm.chordMaxMm.toFixed(5)} vtx=${pm.vertexMaxMm.toFixed(5)} | perFaceTrue3D=${t3.worstMm.toFixed(5)} ` +
          `| ${Math.max(pm.maxMm, t3.worstMm) <= 0.01 ? 'CLOSES ≤0.01 MAX' : 'FLOORS >' + Math.min(pm.maxMm, t3.worstMm).toFixed(3)}`,
      );
    }
    expect(true).toBe(true);
  }, 2400000);
});
