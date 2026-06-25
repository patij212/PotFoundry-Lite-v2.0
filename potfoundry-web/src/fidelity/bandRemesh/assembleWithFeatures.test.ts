/**
 * assembleWithFeatures.test.ts — Task 2 of the production feature mesher.
 *
 * Proves, BY INDEX AUDIT on CPU-evaluated positions, that grafting the proven
 * corridor FILL onto the FULL production assembly (which already holds the outer
 * wall with holes) welds watertight: FL7 AND FL11 full-pot tJunctions===0 +
 * nonManifoldEdges===0; every feature-chain segment is a mesh edge; a NON-VACUOUS
 * INDEX-crack control cracks topology (clean 0 → cracked >0); and flag-OFF
 * (smooth featureless sampler) is byte-identical to plain assembleWatertight.
 *
 * Pure CPU, analytic samplers — safe for Vitest/jsdom (NO WebGPU/DOM).
 */
import { describe, it, expect } from 'vitest';
import { styleSampler } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { makeReliefIndicator } from '../../renderers/webgpu/parametric/conforming/featureGraph/groundTruth';
import {
  assembleWatertight,
  type WatertightAssemblyResult,
} from '../../renderers/webgpu/parametric/conforming/WatertightAssembly';
import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { auditWatertight, type Mesh3 } from './audit';
import {
  assembleWatertightWithFeatures,
  assembleWatertightWithFeaturesDebug,
} from './assembleWithFeatures';

const DIMS = { H: 100, tBottom: 6, rDrain: 0 };
const STYLE_DIMS = { H: 100, Rt: 40, Rb: 30, expn: 1 }; // H MATCHES DIMS.H (no 100/120 mismatch)
const BASE = {
  maxSagMm: 0.05, maxEdgeMm: 1, minEdgeMm: 0.1, gradeRatio: 2,
  maxLevel: 12, resU: 128, resT: 128, nRing: 1024,
  targetTriangles: 6_000_000, budgetMode: 'cap' as const,
};
const PROD_DETECT = (s: SurfaceSampler) => ({
  coarseRes: 40, fineRes: 120, minStrength: 1.0, minAngleDeg: 28,
  creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
  reliefIndicator: makeReliefIndicator(s),
});
function smoothInner(): SurfaceSampler {
  return { position(u, t) {
    const theta = u * 2 * Math.PI; const r = 36;
    const z = DIMS.tBottom + t * (DIMS.H - DIMS.tBottom);
    return [r * Math.cos(theta), r * Math.sin(theta), z];
  } };
}
function evalAssembly(sampler: SurfaceSampler, asm: WatertightAssemblyResult): Mesh3 {
  const n = asm.vertices.length / 3;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = asm.vertices[i * 3], t = asm.vertices[i * 3 + 1];
    const p = sampler.position(((u % 1) + 1) % 1, t);
    positions[i * 3] = p[0]; positions[i * 3 + 1] = p[1]; positions[i * 3 + 2] = p[2];
  }
  return { positions, indices: asm.indices };
}

describe('assembleWatertightWithFeatures — production-frame corridor graft (Voronoi)', () => {
  for (const level of [7, 11]) {
    it(`FL${level}: full pot welds 0 tJunction / 0 nonManifold (CPU eval, by index)`, () => {
      const sampler = styleSampler('Voronoi', {}, STYLE_DIMS);
      const asm = assembleWatertightWithFeatures(sampler, smoothInner(), DIMS, {
        ...BASE, featureLevel: level, detectOptions: PROD_DETECT(sampler), corridorWidthMm: 3,
      });
      const audit = auditWatertight(evalAssembly(sampler, asm), {}); // by-index; tJunctions is the gate
      // eslint-disable-next-line no-console
      console.log(`[graft FL${level}] tJunctions=${audit.tJunctions} nonManifold=${audit.nonManifoldEdges} tris=${asm.indices.length / 3}`);
      expect(audit.tJunctions, `FL${level} tJunctions`).toBe(0);
      expect(audit.nonManifoldEdges, `FL${level} nonManifold`).toBe(0);
    }, 600000);
  }

  it('feature-followed: every consecutive corridor feature-chain pair is a mesh edge', () => {
    const sampler = styleSampler('Voronoi', {}, STYLE_DIMS);
    const { asm, featureChainAsmIds } = assembleWatertightWithFeaturesDebug(sampler);
    const meshEdges = new Set<string>();
    const ind = asm.indices;
    for (let k = 0; k + 2 < ind.length; k += 3) {
      const tri = [ind[k], ind[k + 1], ind[k + 2]];
      for (let e = 0; e < 3; e++) {
        const i = tri[e], j = tri[(e + 1) % 3];
        meshEdges.add(i < j ? `${i}:${j}` : `${j}:${i}`);
      }
    }
    let allEdges = true;
    for (const chain of featureChainAsmIds) {
      for (let i = 0; i + 1 < chain.length; i++) {
        const a = chain[i], b = chain[i + 1];
        if (!meshEdges.has(a < b ? `${a}:${b}` : `${b}:${a}`)) { allEdges = false; break; }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[graft feature-followed] chains=${featureChainAsmIds.length} allEdges=${allEdges}`);
    expect(allEdges, 'every feature-chain segment is a mesh edge').toBe(true);
  }, 600000);

  it('NON-VACUOUS control: cracking a corridor-shared seam vertex (INDEX) ⇒ tJunctions > 0', () => {
    const sampler = styleSampler('Voronoi', {}, STYLE_DIMS);
    const { asm, complementIndexEnd } = assembleWatertightWithFeaturesDebug(sampler);
    // A seam-shared vertex appears in BOTH a complement tri (< complementIndexEnd) and a fill tri.
    const inComplement = new Set<number>();
    for (let k = 0; k < complementIndexEnd; k++) inComplement.add(asm.indices[k]);
    let crackTri = -1, crackPos = -1, shared = -1;
    for (let k = complementIndexEnd; k + 2 < asm.indices.length && shared < 0; k += 3) {
      for (let e = 0; e < 3; e++) {
        const v = asm.indices[k + e];
        if (inComplement.has(v)) { shared = v; crackTri = k; crackPos = e; break; }
      }
    }
    expect(shared, 'a corridor-shared seam vertex exists').toBeGreaterThanOrEqual(0);
    // Clean: tJunctions 0.
    const cleanT = auditWatertight(evalAssembly(sampler, asm), {}).tJunctions;
    expect(cleanT).toBe(0);
    // Crack INDEX topology: append a duplicate of `shared`, re-point ONE fill incidence to it.
    const nV = asm.vertices.length / 3;
    const vertices = new Float32Array(asm.vertices.length + 3);
    vertices.set(asm.vertices);
    vertices[nV * 3] = asm.vertices[shared * 3];
    vertices[nV * 3 + 1] = asm.vertices[shared * 3 + 1];
    vertices[nV * 3 + 2] = asm.vertices[shared * 3 + 2];
    const indices = asm.indices.slice();
    indices[crackTri + crackPos] = nV;
    const cracked: WatertightAssemblyResult = { ...asm, vertices, indices };
    const crackedT = auditWatertight(evalAssembly(sampler, cracked), {}).tJunctions;
    // eslint-disable-next-line no-console
    console.log(`[graft control] sharedVtx=${shared} clean tJunctions=${cleanT} cracked tJunctions=${crackedT}`);
    expect(crackedT).toBeGreaterThan(0);
  }, 600000);

  it('flag-OFF parity: a smooth featureless sampler ⇒ byte-identical to plain assembleWatertight', () => {
    const smooth = smoothInner(); // no relief features
    const plain = assembleWatertight(smooth, smoothInner(), DIMS, { ...BASE, featureLevel: 7 });
    const withF = assembleWatertightWithFeatures(smooth, smoothInner(), DIMS, {
      ...BASE, featureLevel: 7, detectOptions: PROD_DETECT(smooth), corridorWidthMm: 3,
    });
    expect(withF.vertices).toEqual(plain.vertices);
    expect(withF.indices).toEqual(plain.indices);
  }, 600000);
});
