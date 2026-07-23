/* eslint-disable no-console */
// _pfCloseBambooSag.test.ts — DEV-ONLY (autonomous session 2026-07-23 evening).
// Pipeline Bamboo smoothMax=0.121 vs isolated bridge 0.0045. Decisive test: hold nU=2048 (the pipeline's pow2 rim) and
// the PRECISE t-band tread filter (exclude t=k/nodeCount — no geometric-filter confound), and sweep the emitter's
// sagTolMm. The pipeline passes sagTolMm = qMaxSag (the export surface-error slider, ~0.1 default). If 0.1 → ~0.12 and
// 0.004 → ~0.004, the ROOT CAUSE is the coarse default sag-tol (the emitter must tessellate to its OWN ≤0.01 tol, not
// the user's coarse quality slider). If all high, it is the tWarp/GPU, not the config.
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfCloseBambooSag.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';
import { buildBambooRingStripWallGeometric } from '../../src/renderers/webgpu/parametric/conforming/tierC';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const NODE_COUNT = 5;
const NU = 2048;

describe('BambooSegments — sag-tol sweep (root-cause the pipeline 0.12)', () => {
  it('smooth-complement MAX vs the emitter sagTolMm (t-band tread filter, nU=2048 fixed)', async () => {
    const rA = buildAnalyticRadiusFn('BambooSegments', {}, DIMS);
    const edges: number[] = [];
    for (let k = 1; k < NODE_COUNT; k++) edges.push(k / NODE_COUNT);
    for (const sag of [0.1, 0.05, 0.01, 0.004]) {
      const wall = buildBambooRingStripWallGeometric(rA, DIMS.H, NU, { sagTolMm: sag, nodeCount: NODE_COUNT });
      const ut = wall.ut, I = wall.indices;
      const tOf = (vi: number): number => ut[2 * vi + 1];
      const keep: number[] = [];
      for (let f = 0; f + 2 < I.length; f += 3) {
        const a = I[f], b = I[f + 1], c = I[f + 2];
        const lo = Math.min(tOf(a), tOf(b), tOf(c)), hi = Math.max(tOf(a), tOf(b), tOf(c));
        if (!edges.some((e) => lo < e - 1e-6 && hi > e + 1e-6)) keep.push(a, b, c);
      }
      const r = await measureProjectorMax({ vertices: wall.vertices, indices: new Uint32Array(keep) }, rA, { H: DIMS.H, tolMm: 0.01, nTheta: 2048, nZ: 1024 });
      console.log(`[BSAG] sagTolMm=${sag} tris=${I.length / 3} smoothMax=${r.maxMm.toFixed(5)} p99=${r.p99Mm.toFixed(5)} ${r.maxMm <= 0.01 ? 'CLOSES' : 'floors'}`);
    }
    expect(true).toBe(true);
  }, 2400000);
});
