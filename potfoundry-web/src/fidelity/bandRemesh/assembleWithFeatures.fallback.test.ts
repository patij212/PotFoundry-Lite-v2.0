/**
 * assembleWithFeatures.fallback.test.ts — the paver-crash fallback must stay WATERTIGHT.
 *
 * `assembleWatertightWithFeatures` builds the complement WITH `bandRegions` (excluded
 * feature cells = HOLES), then fills the holes via `corridorPaveMulti`. If the paver
 * throws (e.g. the measured cdt2d 'upperIds' crash on a dense crossing PSLG), the catch
 * must NOT return the holed complement (non-watertight) — it must re-assemble WITHOUT
 * `bandRegions` (byte-identical to the no-feature path) so the export is always watertight.
 *
 * This pins the corrected fallback: a forced paver crash ⇒ 0 boundary / 0 non-manifold /
 * 0 T-junction AND byte-identical to plain `assembleWatertight`. Pure CPU (analytic).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { styleSampler } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { makeReliefIndicator } from '../../renderers/webgpu/parametric/conforming/featureGraph/groundTruth';
import {
  assembleWatertight,
  type WatertightAssemblyResult,
} from '../../renderers/webgpu/parametric/conforming/WatertightAssembly';
import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { auditWatertight, type Mesh3 } from './audit';

// Force the paver to throw so the fallback path is exercised (mirrors the cdt2d crash).
vi.mock('./corridorPave', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./corridorPave')>();
  return {
    ...orig,
    corridorPaveMulti: () => {
      throw new Error('forced paver failure (test) — simulates the cdt2d upperIds crash');
    },
  };
});

import { assembleWatertightWithFeatures } from './assembleWithFeatures';

const DIMS = { H: 100, tBottom: 6, rDrain: 0 };
const STYLE_DIMS = { H: 100, Rt: 40, Rb: 30, expn: 1 };
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

describe('assembleWatertightWithFeatures — paver-crash fallback', () => {
  // Build the (forced-crash) fallback + the plain reference ONCE — both are expensive.
  const sampler = styleSampler('Voronoi', {}, STYLE_DIMS); // produces features → bandRegions holes
  let fallback: WatertightAssemblyResult;
  let plain: WatertightAssemblyResult;
  beforeAll(() => {
    fallback = assembleWatertightWithFeatures(sampler, smoothInner(), DIMS, {
      ...BASE, featureLevel: 7, detectOptions: PROD_DETECT(sampler), corridorWidthMm: 3,
    });
    plain = assembleWatertight(sampler, smoothInner(), DIMS, { ...BASE });
  }, 600_000);

  it('a forced paver crash falls back to a WATERTIGHT (hole-free) assembly', () => {
    const audit = auditWatertight(evalAssembly(sampler, fallback), {});
    // eslint-disable-next-line no-console
    console.log(`[fallback] boundaryEdges=${audit.boundaryEdges} nonManifold=${audit.nonManifoldEdges} tJunctions=${audit.tJunctions}`);
    expect(audit.boundaryEdges, 'no unfilled excluded holes').toBe(0);
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.tJunctions).toBe(0);
  });

  it('the crash fallback is byte-identical to plain assembleWatertight (no bandRegions)', () => {
    expect(fallback.vertices).toEqual(plain.vertices);
    expect(fallback.indices).toEqual(plain.indices);
  });
});
