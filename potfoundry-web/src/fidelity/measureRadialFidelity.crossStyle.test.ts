/**
 * measureRadialFidelity.crossStyle.test.ts — demonstrates the unified ruler is
 * genuinely SHAPE-AGNOSTIC (one code path across smooth / ridge / tangled-lattice
 * styles) and that the globally-correct projector is UNIVERSALLY SAFE: on every
 * single-valued style it never materially overstates the single-seed projector,
 * while on tangled lattices it materially REDUCES the reported chord MAX (removing
 * the wrong-well overstatement). Property/regression guard over existing code.
 *
 * Multi-valued styles (BasketWeave/CelticKnot/CelticTriquetra/DragonScales rings)
 * are intentionally excluded — a single-valued rA reference is the wrong reference
 * for an over/under wall (compendium §3), so measuring them here would score a
 * reference artifact, not the mesh.
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { measureRadialFidelity } from './measureRadialFidelity';
import { buildAnalyticRadiusFn } from '../geometry/analyticRadius';
import type { StyleId } from '../geometry/types';

const TAU = 2 * Math.PI;
const H = 120;
const DIMS = { H, Rb: 40, Rt: 50 };

// A spread across the single-valued shape spectrum: smooth → sharp ridge → tangled lattice.
const STYLES: StyleId[] = [
  'HarmonicRipple',   // smooth
  'GothicArches',     // sharp thin ridge
  'SpiralRidges',     // helical ridge
  'GyroidManifold',   // tangled lattice (wrong-well bait)
  'Voronoi',          // tangled cellular lattice
] as unknown as StyleId[];

function buildGridMesh(nu: number, nt: number, rA: (t: number, z: number) => number): {
  mesh: { vertices: Float32Array; indices: Uint32Array }; ut: Float32Array;
} {
  const nUv = nu + 1, nTv = nt + 1;
  const ut: number[] = [], v: number[] = [];
  for (let it = 0; it < nTv; it++) {
    const t = it / nt;
    for (let iu = 0; iu < nUv; iu++) {
      const u = iu / nu, th = TAU * u, z = t * H, r = rA(th, z);
      ut.push(u, t, 0);
      v.push(r * Math.cos(th), r * Math.sin(th), z);
    }
  }
  const idx: number[] = [];
  for (let it = 0; it < nt; it++) for (let iu = 0; iu < nu; iu++) {
    const a = it * nUv + iu, b = a + 1, c = a + nUv, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  return { mesh: { vertices: Float32Array.from(v), indices: Uint32Array.from(idx) }, ut: Float32Array.from(ut) };
}

describe('measureRadialFidelity — shape-agnostic across styles; global projector universally safe', () => {
  it('runs one code path over every single-valued style; global ≤ single-seed everywhere', () => {
    let bestReduction = 0;
    for (const style of STYLES) {
      const rA = buildAnalyticRadiusFn(style, {}, DIMS);
      const { mesh, ut } = buildGridMesh(16, 16, rA); // coarse ⇒ facets chord across features
      const opts = { H, tolMm: 0.01, denseN: 3 };

      const global = measureRadialFidelity(mesh, ut, rA, { ...opts, globalProjector: true });
      const single = measureRadialFidelity(mesh, ut, rA, { ...opts, globalProjector: false });

      // Shape-agnostic: the report is well-formed for EVERY style.
      expect(Number.isFinite(global.maxMm)).toBe(true);
      expect(global.maxMm).toBeCloseTo(Math.max(global.chordMaxMm, global.vertexMaxMm), 9);
      expect(global.nonFiniteCount).toBe(0);
      expect(typeof global.certified).toBe('boolean');

      // Universally SAFE: the global projector never materially overstates single-seed
      // (equal on smooth styles; strictly lower where the wrong-well bites). Tolerance
      // absorbs GN-convergence noise (~µm) between the two seedings.
      expect(global.chordMaxMm).toBeLessThanOrEqual(single.chordMaxMm + 0.002);

      bestReduction = Math.max(bestReduction, single.chordMaxMm - global.chordMaxMm);
    }
    // And it MATERIALLY helps somewhere: at least one style's wrong-well overstatement
    // is removed by the global projector (the whole point of the fix).
    expect(bestReduction).toBeGreaterThan(0.05);
  }, 180000);
});
