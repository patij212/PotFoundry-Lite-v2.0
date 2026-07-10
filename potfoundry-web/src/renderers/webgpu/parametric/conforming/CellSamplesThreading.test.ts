/**
 * CellSamplesThreading.test.ts — E-2026-07-10-CAD-LEVER-COMPLETION Stage A.
 *
 * The crease-seeing refiner (`PeriodicBalancedQuadtree.cellSamples`, k×k interior
 * metric samples in shouldRefine, default 1 = centre-only) shipped in 92fca543 with
 * the threading NEVER COMPLETED: `AssemblyWallOptions.cellSamples` reaches wallOpts
 * but `ConformingWallOptions` had no such field and `buildQuadtreeAtScale` dropped
 * it. Three gates:
 *   1. the quadtree-level effect exists at these params (independent of threading —
 *      guards the other two tests against a vacuous config);
 *   2. THE THREADING: buildConformingWall(cellSamples 2) ≠ (cellSamples 1) — RED
 *      while the link is missing, GREEN once ConformingWall threads it;
 *   3. INERTNESS (the byte-identity contract): absent ≡ undefined ≡ 1, hash-equal —
 *      must stay green forever (production default is untouched by the wiring).
 *
 * Surface: analytic rippled cylinder (amp 1.5, k=24) — √E swings ~1.35× within each
 * half-wavelength, so at the terminal level physW straddles the sizing target with
 * the sample PHASE deciding the split: exactly the centre-miss class the refiner
 * exists for.
 */
import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import { MetricSizingField } from './MetricSizingField';
import { PeriodicBalancedQuadtree } from './PeriodicBalancedQuadtree';
import { buildConformingWall, type ConformingWallOptions } from './ConformingWall';
import { hashMesh } from './tierC/__testutil';

const sampler = new SyntheticCylinderSampler(40, 100, 1.5, 24);

const SIZING = { maxSagMm: 0.05, minEdgeMm: 0.1, maxEdgeMm: 4, gradeRatio: 2, resU: 128, resT: 128 };

const WALL: ConformingWallOptions = {
  ...SIZING,
  maxLevel: 9,
  nRing: 64,
  surfaceId: 0,
};

describe('cellSamples threading (E-2026-07-10-CAD-LEVER-COMPLETION Stage A)', () => {
  it('quadtree-level effect exists at these params (config non-vacuous)', () => {
    const field = new MetricSizingField(sampler, SIZING);
    const cs1 = new PeriodicBalancedQuadtree(field, sampler, { maxLevel: 9, cellSamples: 1 }).leafCount();
    const cs2 = new PeriodicBalancedQuadtree(field, sampler, { maxLevel: 9, cellSamples: 2 }).leafCount();
    expect(cs2, 'k×k sampling must refine a strict superset here').toBeGreaterThan(cs1);
  });

  it('THREADING: buildConformingWall passes cellSamples through to the quadtree', () => {
    const cs1 = buildConformingWall(sampler, { ...WALL, cellSamples: 1 });
    const cs2 = buildConformingWall(sampler, { ...WALL, cellSamples: 2 });
    expect(cs2.indices.length / 3, 'cellSamples=2 must change the built wall').toBeGreaterThan(
      cs1.indices.length / 3,
    );
  });

  it('INERTNESS: absent ≡ undefined ≡ 1 (byte-identical wall — the production default)', () => {
    const absent = buildConformingWall(sampler, { ...WALL });
    const explicitUndefined = buildConformingWall(sampler, { ...WALL, cellSamples: undefined });
    const one = buildConformingWall(sampler, { ...WALL, cellSamples: 1 });
    expect(hashMesh(explicitUndefined)).toBe(hashMesh(absent));
    expect(hashMesh(one)).toBe(hashMesh(absent));
  });
});
