/**
 * verdictRefine.candidates.test.ts — TDD unit test for the T5 sparse-scan
 * SELECTOR (`selectCandidateFacets` in `verdictRefine.ts`).
 *
 * The two-pass verdict loop (T4) must NOT dense-scan the whole mesh with the
 * T2 scorer (`scoreCandidateFacets`) every pass — P2.5c's full scan took
 * minutes over 2.24M tris. `selectCandidateFacets` returns a cheap SUPERSET
 * of the potential outliers that the scorer then actually measures.
 *
 * On a synthetic feature-lined grid mesh this pins the three brief-mandated
 * properties:
 *   (a) CONTAINS a hand-placed OFF-contour near-band facet — one cell away
 *       from a band-edge `intersects` crossing, not itself crossed. This
 *       mirrors the real Gyroid knee's position: `contourCrossed=false` at
 *       `radial≈0.287`, i.e. just off the contour but inside the near-band
 *       reach that T1's `levelAt` decoupling exists to make reachable.
 *   (b) EXCLUDES a deep-smooth facet far from any feature/ridge.
 *   (c) is a SMALL fraction (<~5%) of total facets.
 * Plus one extra (non-brief-mandated, added for coverage) case exercising
 * the optional `sizingField` under-read path in isolation (no feature
 * contour at all).
 *
 * DEFERRED (per the T5 brief): the real-Gyroid "the knee facet at
 * (u,t)=(0.29138,0.71997) is in the candidate set" check needs the full
 * production outer-wall build (heavy — Newton/dense-arc-scale cost), so it
 * is NOT duplicated here in the fast suite. It belongs to T6's heavy
 * end-to-end gate (`research/bridge/_gyroid_knee_ship.test.ts`, env-gated
 * `PF_GYROID_KNEE_SHIP=1`), which builds the real wall once and can assert
 * candidate-set membership directly against production `featureRefine` /
 * `MetricSizingField` instances.
 */
import { describe, it, expect } from 'vitest';
import {
  selectCandidateFacets,
  type CandidateFeatureRefineSpec,
  type CandidateSizingFieldReader,
} from './verdictRefine';

/**
 * A periodic-in-u, clamped-in-t (u,t,surfaceId=0) grid mesh: `nu x nt` cells,
 * 2 triangles/cell, matching the `(u,t,surfaceId)` packing `verdictRefine.ts`
 * expects (see its `VERTEX_STRIDE` doc, verified against `ConformingWall.ts`).
 * Cell (iu,it) owns the two triangles at global indices
 * `(it*nu+iu)*2` and `(it*nu+iu)*2+1`.
 */
function buildGridMesh(nu: number, nt: number): { vertices: Float32Array; indices: Uint32Array } {
  const vertices: number[] = [];
  for (let it = 0; it <= nt; it++) {
    for (let iu = 0; iu < nu; iu++) {
      vertices.push(iu / nu, it / nt, 0);
    }
  }
  const indices: number[] = [];
  for (let it = 0; it < nt; it++) {
    for (let iu = 0; iu < nu; iu++) {
      const iu2 = (iu + 1) % nu; // periodic wrap
      const a = it * nu + iu;
      const b = it * nu + iu2;
      const c = (it + 1) * nu + iu;
      const d = (it + 1) * nu + iu2;
      indices.push(a, b, c, b, d, c);
    }
  }
  return { vertices: Float32Array.from(vertices), indices: Uint32Array.from(indices) };
}

/** Global index of the first (of 2) triangles for grid cell (iu,it). */
function quadFirstTri(nu: number, iu: number, it: number): number {
  return (it * nu + iu) * 2;
}

describe('selectCandidateFacets (T5 sparse-scan candidate selector)', () => {
  const NU = 128;
  const NT = 128;
  const LEVEL = 7; // 1 << 7 === NU === NT (isotropic — matches the real FeatureRefineSpec, no uBias)
  const CELL = 1 / (1 << LEVEL);

  // A band-edge contour spanning the FULL periodic u-range at t=CONTOUR_T —
  // mirrors ConformingWall.ts's buildFeatureIntersector output shape (a cheap
  // box-vs-segment predicate), just hand-written directly for the test.
  const CONTOUR_T = 0.76;
  const ON_CONTOUR_IT = Math.floor(CONTOUR_T * NT); // cell whose box straddles CONTOUR_T
  const NEAR_BAND_IT = ON_CONTOUR_IT - 1; // off-contour, 1-ring away in t
  const DEEP_SMOOTH_IT = 5; // far below the contour band (>>1 ring away)

  function bandEdgeIntersects(): CandidateFeatureRefineSpec['intersects'] {
    return (_u0: number, t0: number, size: number): boolean => t0 < CONTOUR_T && CONTOUR_T < t0 + size;
  }

  it('contains a hand-placed OFF-contour near-band facet', () => {
    const mesh = buildGridMesh(NU, NT);
    const featureRefine: CandidateFeatureRefineSpec = { level: LEVEL, intersects: bandEdgeIntersects() };

    // Sanity (non-vacuous): the near-band facet's OWN single cell must NOT
    // itself cross the contour — otherwise this would be the trivial
    // on-contour case, not the off-contour near-band case the real knee sits
    // in.
    const ownCellCrosses = featureRefine.intersects(0, NEAR_BAND_IT * CELL, CELL);
    expect(ownCellCrosses).toBe(false);

    const candidates = selectCandidateFacets(mesh, featureRefine);
    const nearBandTri = quadFirstTri(NU, 10, NEAR_BAND_IT);
    expect(candidates).toContain(nearBandTri);
  });

  it('excludes a deep-smooth facet far from any feature', () => {
    const mesh = buildGridMesh(NU, NT);
    const featureRefine: CandidateFeatureRefineSpec = { level: LEVEL, intersects: bandEdgeIntersects() };
    const candidates = selectCandidateFacets(mesh, featureRefine);
    const deepSmoothTri = quadFirstTri(NU, 10, DEEP_SMOOTH_IT);
    expect(candidates).not.toContain(deepSmoothTri);
  });

  it('is a small fraction (<~5%) of total facets, and non-vacuous', () => {
    const mesh = buildGridMesh(NU, NT);
    const featureRefine: CandidateFeatureRefineSpec = { level: LEVEL, intersects: bandEdgeIntersects() };
    const candidates = selectCandidateFacets(mesh, featureRefine);
    const totalFacets = mesh.indices.length / 3;
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThan(0.05 * totalFacets);
  });

  it('sizingField (optional, extra coverage): flags facets near a sharp local under-read ridge, excludes far ones', () => {
    const mesh = buildGridMesh(NU, NT);
    // No feature contour at all — isolates the sizingField-only path.
    const featureRefine: CandidateFeatureRefineSpec = { level: LEVEL, intersects: () => false };
    const RIDGE_U = 0.5;
    // Reads LOW (tight target) only in a band a bit wider than the probe
    // radius `selectCandidateFacets` uses, so facets whose OWN centroid
    // reads smooth/high (5.0) but whose probe neighbourhood dips into the
    // ridge (1.0) get flagged — the "reads fine at the sample point, but a
    // real ridge is a fraction of a cell away" under-read mechanism a
    // coarse bilinear-interpolated MetricSizingField grid produces.
    const sizingField: CandidateSizingFieldReader = {
      edgeLength: (u: number): number => {
        const du = Math.abs((((u - RIDGE_U + 0.5) % 1) + 1) % 1 - 0.5);
        return du < CELL * 0.6 ? 1.0 : 5.0;
      },
    };
    const candidates = selectCandidateFacets(mesh, featureRefine, sizingField);
    expect(candidates.length).toBeGreaterThan(0);

    const ridgeIu = Math.floor(RIDGE_U * NU);
    const shoulderFlagged = candidates.some((f) => {
      const quad = Math.floor(f / 2);
      const iu = quad % NU;
      return Math.abs(iu - ridgeIu) <= 2;
    });
    expect(shoulderFlagged).toBe(true);

    // Many cells away from the ridge, the flat reading (constant 5.0, no
    // local gradient) is never flagged.
    const farTri = quadFirstTri(NU, (ridgeIu + NU / 2) % NU, DEEP_SMOOTH_IT);
    expect(candidates).not.toContain(farTri);
  });

  it.skip('real-Gyroid production knee membership — DEFERRED to T6 heavy gate (env-gated PF_GYROID_KNEE_SHIP=1)', () => {
    // Intentionally skipped in the fast suite: building the real Gyroid outer
    // wall is heavy. See the file doc comment and the T5 brief.
  });
});
