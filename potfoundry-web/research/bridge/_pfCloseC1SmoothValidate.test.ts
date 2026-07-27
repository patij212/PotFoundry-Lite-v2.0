/* eslint-disable no-console */
// _pfCloseC1SmoothValidate.test.ts — WORKHORSE-THESIS validation. The now-fixed verify-bump density engine
// (deriveSmoothGridDensity, commit 354f258d) closes every C1-smooth style. Test the 3 "needs-mesher" styles that have
// EMPTY feature extractors (⇒ smooth, no C0 features) but were flagged as gaps at the low-density region-kernel:
// GyroidManifold (0.17), Crystalline (0.44, "radial-chord-irreducible" — SUSPECT single-valued-rA artifact),
// RippleInterference (0.019). If the smooth-grid emitter at verify-bump density closes them ≤0.01 true-3D, they are
// density-closable ⇒ just need wiring to SMOOTH_GRID_STYLES, NOT a new mesher.
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfCloseC1SmoothValidate.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { buildSmoothGridWall, deriveSmoothGridDensity } from '../../src/renderers/webgpu/parametric/conforming/tierC/smoothGrid';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };

describe('C1-smooth workhorse validation (density-closable ⇒ wire, not build)', () => {
  for (const style of ['RippleInterference', 'GyroidManifold', 'Crystalline']) {
    it(`${style} — smooth-grid at verify-bump density`, async () => {
      let rA;
      try { rA = buildAnalyticRadiusFn(style, {}, DIMS); }
      catch (e) { console.log(`[C1VAL] ${style} NO-analyticRA: ${String(e).slice(0, 120)}`); expect(true).toBe(true); return; }
      const { nU, nT } = deriveSmoothGridDensity(rA, DIMS.H, 0.01);
      const tris = nU * (nT - 1) * 2;
      if (tris > 18_000_000) { console.log(`[C1VAL] ${style} density nU=${nU} nT=${nT} tris=${(tris / 1e6).toFixed(1)}M — TOO-HEAVY-to-measure (density-hungry; note the ceiling)`); expect(true).toBe(true); return; }
      const wall = buildSmoothGridWall(rA, DIMS.H, nU, nT);
      const r = await measureProjectorMax({ vertices: wall.vertices, indices: wall.indices }, rA, { H: DIMS.H, tolMm: 0.01, nTheta: 2048, nZ: 1024 });
      console.log(`[C1VAL] ${style} nU=${nU} nT=${nT} tris=${(tris / 1e6).toFixed(2)}M MAX=${r.maxMm.toFixed(5)} p99=${r.p99Mm.toFixed(5)} vtx=${r.vertexMaxMm.toExponential(1)} ${r.maxMm <= 0.01 ? 'CLOSES-BY-DENSITY' : 'GAP'}`);
      expect(true).toBe(true);
    }, 1800000);
  }
});
