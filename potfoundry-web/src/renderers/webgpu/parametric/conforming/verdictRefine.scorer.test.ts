/**
 * verdictRefine.scorer.test.ts — TDD unit test for the T2 verdict scorer
 * (`scoreCandidateFacets` in `verdictRefine.ts`).
 *
 * Three fast checks against a synthetic cylinder + localized radial bump:
 *   1. UNIT-EXACT: one hand-constructed triangle where the true max deviation from
 *      its own plane is known analytically (proves the metric itself, not just
 *      monotonicity).
 *   2. COARSE-vs-FINE over the same analytic bump: a coarse facet spanning the bump
 *      must be flagged (worstMm > tol); a fine facet tightly covering the same bump
 *      must NOT be flagged (worstMm <= tol).
 *   3. FLAT: a facet far from the bump scores ~0.
 *
 * No existing `SyntheticCylinderSampler`/bump combination in the repo produces a
 * *localized* (u AND t) bump (the repo's `SyntheticCylinderSampler` in
 * `SurfaceSampler.ts` only supports a u-periodic ripple) — per the brief, a tiny
 * local sampler is built here instead of reusing/extending that one.
 */
import { describe, it, expect } from 'vitest';
import { scoreCandidateFacets, type VerdictLiftSampler } from './verdictRefine';

// ── local synthetic samplers (this test owns them; not shared) ─────────────────

/** position(u,t) = [u, t, u*t] — a saddle over UV space itself (no cylinder wrap
 * needed for the unit-exact check: the vertex-space and lift-space coordinates are
 * intentionally the same axes, so the "true max deviation" is hand-computable). */
class SaddleSampler implements VerdictLiftSampler {
  position(u: number, t: number): [number, number, number] {
    return [u, t, u * t];
  }
}

/** A cylinder (R0,H) with a localized 2D Gaussian radial bulge centered at
 * (bumpU,bumpT), amplitude bumpAmp, parametric-space width bumpWidth. amp=0 is a
 * plain cylinder (flat facets score ~0 anywhere on it). */
class BumpCylinderSampler implements VerdictLiftSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
    private readonly bumpAmp: number,
    private readonly bumpU: number,
    private readonly bumpT: number,
    private readonly bumpWidth: number,
  ) {}

  position(u: number, t: number): [number, number, number] {
    const du = u - this.bumpU;
    const dt = t - this.bumpT;
    const bump = this.bumpAmp * Math.exp(-(du * du + dt * dt) / (2 * this.bumpWidth * this.bumpWidth));
    const r = this.R0 + bump;
    const theta = 2 * Math.PI * u;
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}

// ── mesh builder helper: N (u,t) vertices -> stride-3 (u,t,surfaceId) Float32Array ──
function buildMesh(uts: Array<[number, number]>, tris: number[][]): { vertices: Float32Array; indices: Uint32Array } {
  const vertices = new Float32Array(uts.length * 3);
  uts.forEach(([u, t], i) => {
    vertices[i * 3] = u;
    vertices[i * 3 + 1] = t;
    vertices[i * 3 + 2] = 0; // surfaceId
  });
  const indices = Uint32Array.from(tris.flat());
  return { vertices, indices };
}

describe('scoreCandidateFacets — honest geometric chord/max-sag verdict scorer', () => {
  it('UNIT-EXACT: saddle triangle (0,0)-(1,0)-(0,1) has analytic worst 0.25 at the (0.5,0.5) barycentric lattice point', () => {
    // position(u,t)=[u,t,u*t]. All 3 vertices have u*t=0 (one coord is 0 at each
    // corner), so the plane through them is exactly z=0 — the (u,t) plane itself.
    // An interior dense-bary sample at barycentric (wa,wb,wc) lands at parametric
    // (u,t)=(wb,wc) (since A=(0,0) contributes nothing, B=(1,0) contributes wb to
    // u, C=(0,1) contributes wc to t), so its lifted z = u*t = wb*wc and its
    // deviation from the z=0 plane is exactly |wb*wc|. denseBary(8) includes the
    // lattice point wb=wc=4/8=0.5 exactly (i=4,j=4,i+j=8<=8), which is also the
    // continuous maximum of wb*wc over the triangle wb,wc>=0, wb+wc<=1. So the
    // TRUE worst this scorer must report is exactly 0.5*0.5 = 0.25.
    const mesh = buildMesh([[0, 0], [1, 0], [0, 1]], [[0, 1, 2]]);
    const sampler = new SaddleSampler();
    const tol = 0.1; // well below the analytic 0.25 so the cell must be flagged
    const cells = scoreCandidateFacets(mesh, sampler, [0], tol, /* featureLevel */ 1, /* uBias */ 0);
    expect(cells).toHaveLength(1);
    expect(cells[0].worstMm).toBeCloseTo(0.25, 10);
  });

  it('COARSE facet spanning a localized bump is flagged as an outlier (worstMm > tol)', () => {
    const sampler = new BumpCylinderSampler(50, 100, 5, 0.5, 0.5, 0.05);
    // Vertices ~2-3 bump-widths from the bump center (near-flat there), but the
    // triangle's interior sweeps straight over the bump peak.
    const mesh = buildMesh(
      [[0.4, 0.4], [0.6, 0.4], [0.5, 0.65]],
      [[0, 1, 2]],
    );
    const tol = 0.5; // mm — the bump amplitude is 5mm, comfortably above this
    const cells = scoreCandidateFacets(mesh, sampler, [0], tol, /* featureLevel */ 4, /* uBias */ 0);
    expect(cells).toHaveLength(1);
    expect(cells[0].worstMm).toBeGreaterThan(tol);
  });

  it('FINE facet tightly covering the same bump is NOT flagged (worstMm <= tol)', () => {
    const sampler = new BumpCylinderSampler(50, 100, 5, 0.5, 0.5, 0.05);
    // Same bump, but the facet is subdivided down to ~1/10th the coarse triangle's
    // footprint, tightly hugging the (locally near-quadratic) peak.
    const mesh = buildMesh(
      [[0.49, 0.49], [0.51, 0.49], [0.5, 0.515]],
      [[0, 1, 2]],
    );
    const tol = 0.5; // mm — same tolerance as the coarse case
    const cells = scoreCandidateFacets(mesh, sampler, [0], tol, /* featureLevel */ 8, /* uBias */ 0);
    expect(cells).toHaveLength(0);
  });

  it('FLAT facet far from the bump scores ~0 (clean, not flagged)', () => {
    const sampler = new BumpCylinderSampler(50, 100, 5, 0.5, 0.5, 0.05);
    // Opposite side of the cylinder from the bump (u near 0), Gaussian tail is
    // numerically zero there. Footprint is deliberately tiny (du=0.01, ~3.6 deg of
    // arc on the R0=50 cylinder): the metric is honest about the CYLINDER's own
    // curvature too, so a wide facet even off-bump would show real (correct) sag
    // from the base surface alone (sagitta ~R*(1-cos(dtheta/2))). A tiny footprint
    // isolates "the bump adds nothing here" from "the base cylinder is curved".
    const mesh = buildMesh(
      [[0.0, 0.1], [0.01, 0.1], [0.0, 0.105]],
      [[0, 1, 2]],
    );
    const tol = 0.5;
    const cells = scoreCandidateFacets(mesh, sampler, [0], tol, /* featureLevel */ 4, /* uBias */ 0);
    expect(cells).toHaveLength(0);
  });

  it('uBias doubles the u-axis cell resolution: two facets sharing an iu at uBias=0 split into distinct iu cells at uBias=1', () => {
    // Two flat facets on a plain cylinder (amp=0 ⇒ every facet scores ~0), placed
    // so their u-centroids straddle a level-`featureLevel` u-cell boundary at the
    // FINER `featureLevel+uBias` resolution. featureLevel=3 ⇒ base u-cell width
    // 1/8=0.125; the two centroids (~0.030 and ~0.093) both fall in base iu=0 at
    // uBias=0, but land in iu=0 and iu=1 respectively at uBias=1 (u-cell width
    // 1/16=0.0625, boundary at u=0.0625). Same t-band so any collision would be a
    // real iu collision, not a t difference. Flat ⇒ tol=-1 forces every cell out
    // so we can inspect the keying regardless of sag.
    const flat = new BumpCylinderSampler(50, 100, 0, 0.5, 0.5, 0.05);
    const meshA = buildMesh([[0.02, 0.5], [0.04, 0.5], [0.03, 0.52]], [[0, 1, 2]]);
    const meshB = buildMesh([[0.085, 0.5], [0.10, 0.5], [0.093, 0.52]], [[0, 1, 2]]);

    // uBias=0: both facets key to the SAME iu (base u-cell 0).
    const a0 = scoreCandidateFacets(meshA, flat, [0], -1, /* featureLevel */ 3, /* uBias */ 0);
    const b0 = scoreCandidateFacets(meshB, flat, [0], -1, /* featureLevel */ 3, /* uBias */ 0);
    expect(a0).toHaveLength(1);
    expect(b0).toHaveLength(1);
    expect(a0[0].iu).toBe(b0[0].iu); // share an iu at uBias=0

    // uBias=1: the u-axis resolution doubles, so the two now key to DISTINCT iu.
    const a1 = scoreCandidateFacets(meshA, flat, [0], -1, /* featureLevel */ 3, /* uBias */ 1);
    const b1 = scoreCandidateFacets(meshB, flat, [0], -1, /* featureLevel */ 3, /* uBias */ 1);
    expect(a1).toHaveLength(1);
    expect(b1).toHaveLength(1);
    expect(a1[0].iu).not.toBe(b1[0].iu); // split into distinct iu at uBias=1
    // And the finer iu is exactly the coarse iu at double resolution (+/- the
    // boundary the two straddle): a stays at 0, b moves to 1.
    expect(a1[0].iu).toBe(0);
    expect(b1[0].iu).toBe(1);
  });

  it('SEAM: a facet straddling the periodic u=0/u=1 seam is scored across the SHORT arc, not the long way around', () => {
    // QuadtreeTriangulator collapses the u=1 column onto u=0 (QuadtreeTriangulator.ts:11-13,
    // 68-72), so a facet on the right seam is STORED with u-values that straddle 0/1 — here
    // {0.95, 0.05, 0.0}: three points on a narrow ~36deg arc around angle 0. On a plain
    // cylinder its only true deviation is the barrel's own arc sagitta (R*(1-cos(18deg)) ~
    // 2.4mm at R=50). The naive u-blend (wa*0.95 + wb*0.05 + wc*0.0) instead sweeps interior
    // samples across u in [0, 0.95] — nearly all the way around — lifting to the FAR wall and
    // fabricating sag on the order of the cylinder DIAMETER (~100mm). This asserts the scorer
    // unwraps u across the seam (relative to ua) before dense-sampling, exactly as its own
    // centroid keying already does (verdictRefine.ts wrapDu) and as the spike's scoreOuterSag
    // was fixed to do.
    const cyl = new BumpCylinderSampler(50, 100, 0, 0.5, 0.5, 0.05); // amp=0 ⇒ plain cylinder
    const mesh = buildMesh([[0.95, 0.5], [0.05, 0.5], [0.0, 0.55]], [[0, 1, 2]]);
    // tol=-1 forces the cell out regardless of flagging so we can read worstMm directly.
    const cells = scoreCandidateFacets(mesh, cyl, [0], -1, /* featureLevel */ 4, /* uBias */ 0);
    expect(cells).toHaveLength(1);
    // Honest narrow-arc sag is ~2.4mm; the naive-blend bug reports ~100mm (order of the barrel
    // diameter). A 10mm ceiling sits unambiguously between: passes post-fix, fails hard pre-fix.
    expect(cells[0].worstMm).toBeLessThan(10);
  });

  it('SEAM/GUARD: a genuine non-periodic full-span triangle (u = 0,1,0) is NOT folded to zero width', () => {
    // The seam-unwrap guard is `Math.abs(ub - ua) < 1 ? unwrap : leave`. Real mesh u's live
    // in [0,1) so a raw delta of exactly ±1 never arises there — but the UNIT-EXACT saddle
    // fixture above uses u = {0, 1, 0} (delta exactly 1.0). An UNCONDITIONAL unwrap would fold
    // that ub from 1→0 (wrapDu(1)=0), collapsing the triangle in u and destroying its analytic
    // worst. This pins that the guard keeps such a full-span facet intact. position(u,t)=[u,t,u*t]
    // ⇒ interior (u,t)=(wb,wc), z=wb*wc, analytic max 0.25 at (0.5,0.5) — identical to UNIT-EXACT.
    const mesh = buildMesh([[0, 0], [1, 0], [0, 1]], [[0, 1, 2]]);
    const cells = scoreCandidateFacets(mesh, new SaddleSampler(), [0], 0.1, /* featureLevel */ 1, /* uBias */ 0);
    expect(cells).toHaveLength(1);
    expect(cells[0].worstMm).toBeCloseTo(0.25, 10);
  });
});
