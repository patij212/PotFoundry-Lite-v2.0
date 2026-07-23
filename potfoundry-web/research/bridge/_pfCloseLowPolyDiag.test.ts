/* eslint-disable no-console */
// _pfCloseLowPolyDiag.test.ts — DEV-ONLY diagnosis (autonomous session 2026-07-23).
// The real-pipeline audit found LowPolyFacet/ON = `generateMesh returned null` (while OFF holds 0.00102).
// Reproduce the smooth-grid emitter path (facet-aligned alignNU=24, exactly what the production dispatch adds)
// in ISOLATION to localize the null: is it NaN/degenerate vertices from LowPoly's rA, an empty grid, or fine
// (⇒ the null is in the assembly/GPU layer, not the emitter)?
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfCloseLowPolyDiag.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { buildSmoothGridOuterWall, deriveSmoothGridDensity } from '../../src/renderers/webgpu/parametric/conforming/tierC';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };

describe('LowPolyFacet smooth-grid emitter — null diagnosis', () => {
  it('builds the facet-aligned smooth-grid wall and checks for NaN / degeneracy', async () => {
    const rA = buildAnalyticRadiusFn('LowPolyFacet', {}, DIMS);
    // Probe rA directly for NaN/Inf across the domain (the suspect: facet edges / rim floor() at t=1).
    let rNaN = 0, rInf = 0, rMin = Infinity, rMax = -Infinity;
    for (let j = 0; j <= 200; j++) {
      const z = (j / 200) * DIMS.H;
      for (let i = 0; i < 200; i++) {
        const r = rA((i / 200) * Math.PI * 2, z);
        if (Number.isNaN(r)) rNaN++;
        else if (!Number.isFinite(r)) rInf++;
        else { if (r < rMin) rMin = r; if (r > rMax) rMax = r; }
      }
    }
    console.log(`[LP] rA probe: NaN=${rNaN} Inf=${rInf} rMin=${rMin.toFixed(3)} rMax=${rMax.toFixed(3)}`);

    const dens = deriveSmoothGridDensity(rA, DIMS.H, 0.01, { alignNU: 24 });
    console.log(`[LP] derived density (alignNU=24): nU=${dens.nU} nT=${dens.nT} → ~${(dens.nU * dens.nT * 2 / 1e6).toFixed(2)}M tris`);

    let wall: ReturnType<typeof buildSmoothGridOuterWall> | null = null;
    let threw = '';
    try {
      wall = buildSmoothGridOuterWall({ analyticRA: rA, H: DIMS.H, tolMm: 0.01, density: { alignNU: 24 } });
    } catch (e) {
      threw = String(e).slice(0, 160);
    }
    console.log(`[LP] buildSmoothGridOuterWall: ${threw ? 'THREW ' + threw : 'ok'}`);
    if (wall) {
      const V = wall.vertices;
      let vNaN = 0;
      for (let i = 0; i < V.length; i++) if (!Number.isFinite(V[i])) vNaN++;
      console.log(`[LP] wall: verts=${V.length / 3} tris=${wall.indices.length / 3} gridVtx=${wall.gridVertexCount} bottomRing=${wall.bottomRing.length} topRing=${wall.topRing.length} nonFiniteScalars=${vNaN}`);
    }
    void measureProjectorMax; // fidelity deferred — this probe is about the null, not the chord
    expect(true).toBe(true);
  }, 1800000);
});
