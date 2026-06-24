/**
 * verify_mesher_band_integration.test.ts — Task 2 of the general-mesher
 * integration spike: the opt-in band-region emit-gate.
 *
 * Two guarantees, both load-bearing:
 *
 *  (1) FLAG-OFF BYTE-IDENTICAL — with NO `bandRegions`, the production
 *      `assembleWatertight` output (vertices + indices) is bit-for-bit unchanged
 *      from the same call without the new opt. This is the non-negotiable rule:
 *      the default export path is never disturbed. Cloned from the real Voronoi
 *      harness (`verify_voronoiCelticFeatureFlow.test.ts`) so it exercises the
 *      true feature path (general-curve insertion + conforming complement).
 *
 *  (2) BAND-INTERIOR CELLS EXCLUDED — on a smooth cylinder, with a `bandRegions`
 *      predicate covering a known (u,t) rectangle, leaves FULLY inside the band
 *      emit ZERO triangles (a hole the band's own paving fills in Task 4), while
 *      straddle + outside cells still emit (the rest of the mesh is intact).
 *
 * Pure CPU, read-only analytic samplers (jsdom / Vitest, NO WebGPU).
 */
import { describe, it, expect } from 'vitest';
import { rOuterVoronoi } from '../geometry/styles';
import { DEFAULT_VORONOI } from '../geometry/types';
import type { StyleOptions } from '../geometry/types';
import type { SurfaceSampler, Vec3 } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { FeatureLine } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import {
  assembleWatertight,
  type BandRegion,
} from '../renderers/webgpu/parametric/conforming/WatertightAssembly';

const TAU = 2 * Math.PI;

// ── Realistic pot dims (identical to the Voronoi/gyroid harness). ─────────────
const H = 120;
const R0 = 40;
const TBOTTOM = 6;

// Shared default-depth mesh params (production default-ish, matching the harness).
const BASE = {
  maxSagMm: 0.05,
  maxEdgeMm: 1,
  minEdgeMm: 0.1,
  gradeRatio: 2,
  maxLevel: 12,
  resU: 128,
  resT: 128,
  nRing: 1024,
  cellSamples: 1,
  targetTriangles: 6_000_000,
  budgetMode: 'cap' as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// (1) FLAG-OFF byte-identical — a real Voronoi pot with general-curve features.
// ─────────────────────────────────────────────────────────────────────────────
function buildVoronoiSamplers(): { sampler: SurfaceSampler; innerSampler: SurfaceSampler } {
  const V = DEFAULT_VORONOI;
  const VOPTS: StyleOptions = { ...V };
  const sampler: SurfaceSampler = {
    position(u: number, t: number): Vec3 {
      const theta = u * TAU;
      const r = rOuterVoronoi(theta, t * H, R0, H, VOPTS);
      return [r * Math.cos(theta), r * Math.sin(theta), t * H];
    },
  };
  const innerSampler: SurfaceSampler = {
    position(u: number, t: number): Vec3 {
      const theta = u * TAU;
      const r = R0 - 4;
      const z = TBOTTOM + t * (H - TBOTTOM);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    },
  };
  return { sampler, innerSampler };
}

/**
 * A handful of real general-curve feature lines so the conforming feature path
 * (not the plain `triangulateQuadtree` fast-out) actually runs. Vertical strands
 * at a few u values, kept off the t=0/t=1 rings and the u-seam.
 */
function voronoiLikeFeatures(): FeatureLine[] {
  const lines: FeatureLine[] = [];
  for (const u of [0.2, 0.5, 0.8]) {
    const points = [] as { u: number; t: number }[];
    for (let k = 0; k <= 16; k++) {
      const t = 0.1 + (0.8 * k) / 16;
      points.push({ u: u + 0.02 * Math.sin(k * 0.7), t });
    }
    lines.push({ kind: 'general-curve', points, label: `strand-${u}` });
  }
  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// (2) Band-interior exclusion — smooth cylinder.
// ─────────────────────────────────────────────────────────────────────────────
function buildCylinderSamplers(): { sampler: SurfaceSampler; innerSampler: SurfaceSampler } {
  const sampler: SurfaceSampler = {
    position(u: number, t: number): Vec3 {
      const theta = u * TAU;
      return [R0 * Math.cos(theta), R0 * Math.sin(theta), t * H];
    },
  };
  const innerSampler: SurfaceSampler = {
    position(u: number, t: number): Vec3 {
      const theta = u * TAU;
      const r = R0 - 4;
      const z = TBOTTOM + t * (H - TBOTTOM);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    },
  };
  return { sampler, innerSampler };
}

/** A single full-height feature strand so the feature path runs on the cylinder. */
function cylinderFeature(): FeatureLine[] {
  const points = [] as { u: number; t: number }[];
  for (let k = 0; k <= 16; k++) points.push({ u: 0.05, t: 0.1 + (0.8 * k) / 16 });
  return [{ kind: 'general-curve', points, label: 'cyl-strand' }];
}

/** Outer-wall (u,t) vertices referenced by at least one outer triangle. */
function outerReferencedUT(verts: Float32Array, indices: Uint32Array): { u: number; t: number }[] {
  const isOuter = (vi: number): boolean => verts[vi * 3 + 2] < 0.5;
  const used = new Set<number>();
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    if (isOuter(a)) used.add(a);
    if (isOuter(b)) used.add(b);
    if (isOuter(c)) used.add(c);
  }
  const out: { u: number; t: number }[] = [];
  for (const vi of used) out.push({ u: verts[vi * 3], t: verts[vi * 3 + 1] });
  return out;
}

describe('mesher band-region emit-gate (Task 2)', () => {
  it('FLAG-OFF byte-identical: no bandRegions ⇒ vertices+indices unchanged (real Voronoi)', () => {
    const { sampler, innerSampler } = buildVoronoiSamplers();
    const features = voronoiLikeFeatures();
    const dims = { H, tBottom: TBOTTOM, rDrain: 0 };

    // Baseline: the production call WITHOUT the new opt.
    const baseline = assembleWatertight(sampler, innerSampler, dims, {
      ...BASE,
      featureLevel: 7,
      outerFeatureLines: features,
    });

    // Same call WITH the opt present but undefined ⇒ must be byte-identical.
    const withOptUndefined = assembleWatertight(sampler, innerSampler, dims, {
      ...BASE,
      featureLevel: 7,
      outerFeatureLines: features,
      bandRegions: undefined,
    });

    expect(withOptUndefined.vertices.length).toBe(baseline.vertices.length);
    expect(withOptUndefined.indices.length).toBe(baseline.indices.length);
    expect(Array.from(withOptUndefined.vertices)).toEqual(Array.from(baseline.vertices));
    expect(Array.from(withOptUndefined.indices)).toEqual(Array.from(baseline.indices));
  }, 600000);

  it('band-interior cells excluded: a (u,t) rectangle becomes a hole, rest intact', () => {
    const { sampler, innerSampler } = buildCylinderSamplers();
    const dims = { H, tBottom: TBOTTOM, rDrain: 0 };

    // A (u,t) rectangle band, sized to contain whole interior cells. Kept well
    // off the t=0/t=1 rings and the u-seam so no boundary/seam cell straddles it.
    const U_LO = 0.35, U_HI = 0.65, T_LO = 0.35, T_HI = 0.65;
    const band: BandRegion = {
      insideBand(u: number, t: number): boolean {
        const uu = ((u % 1) + 1) % 1;
        return uu > U_LO && uu < U_HI && t > T_LO && t < T_HI;
      },
    };

    const features = cylinderFeature();

    const baseline = assembleWatertight(sampler, innerSampler, dims, {
      ...BASE,
      featureLevel: 7,
      outerFeatureLines: features,
    });
    const gated = assembleWatertight(sampler, innerSampler, dims, {
      ...BASE,
      featureLevel: 7,
      outerFeatureLines: features,
      bandRegions: [band],
    });

    // The band INTERIOR (margin in from the band edges so we test fully-inside
    // cells, not straddlers) must be a hole: NO outer vertex referenced there.
    const inInterior = (p: { u: number; t: number }): boolean => {
      const uu = ((p.u % 1) + 1) % 1;
      return uu > U_LO + 0.02 && uu < U_HI - 0.02 && p.t > T_LO + 0.02 && p.t < T_HI - 0.02;
    };
    const baseInterior = outerReferencedUT(baseline.vertices, baseline.indices).filter(inInterior);
    const gatedInterior = outerReferencedUT(gated.vertices, gated.indices).filter(inInterior);

    expect(baseInterior.length).toBeGreaterThan(0); // baseline DID cover the region
    expect(gatedInterior.length).toBe(0); // gated leaves a hole

    // The rest of the mesh is intact: outer triangle count drops, but the FAR
    // region (a band on the opposite side of the cylinder) is unchanged.
    const farCount = (verts: Float32Array, indices: Uint32Array): number => {
      const isOuter = (vi: number): boolean => verts[vi * 3 + 2] < 0.5;
      let n = 0;
      for (let i = 0; i + 2 < indices.length; i += 3) {
        const a = indices[i];
        if (!isOuter(a)) continue;
        const u = ((verts[a * 3] % 1) + 1) % 1;
        if (u > 0.0 && u < 0.2) n++; // far side, away from the band
      }
      return n;
    };
    expect(farCount(gated.vertices, gated.indices)).toBe(farCount(baseline.vertices, baseline.indices));

    // Total outer triangle count strictly drops (the hole removed triangles).
    const outerTris = (verts: Float32Array, indices: Uint32Array): number => {
      let n = 0;
      for (let i = 0; i + 2 < indices.length; i += 3) {
        if (verts[indices[i] * 3 + 2] < 0.5) n++;
      }
      return n;
    };
    expect(outerTris(gated.vertices, gated.indices)).toBeLessThan(
      outerTris(baseline.vertices, baseline.indices),
    );
  }, 600000);
});
