/**
 * AnalyticSagRefine.test.ts — exact-analytic scoring of the conforming refinement
 * decision (E-2026-07-24-ANALYTIC-SCORE).
 *
 * The discriminator is a surface the production sampler is PROVABLY blind to: a
 * cylinder with `k = resU` ripples. Every grid node lands on the SAME ripple
 * phase (`cos(2π·k·(col/resU)) ≡ 1`), so the pre-evaluated bilinear sampler is a
 * perfect cylinder of radius `R0+amp` while the true surface carries `amp`-tall
 * relief between every pair of nodes. The sampler-scored refiner therefore CANNOT
 * see the relief at any density — exactly the structural blindness measured on
 * GeometricStar / Crystalline / GyroidManifold / Voronoi at production dims
 * (`research/bridge/_samplerBlindness.test.ts`).
 *
 * Gates:
 *  1. FLAG OFF is byte-identical even with `analyticRA`/`analyticH`/`analyticSagMm`
 *     supplied (the load-bearing production guarantee).
 *  2. FLAG ON is NON-VACUOUS on the blind surface (strictly more triangles) and
 *     drives the real chord error against the EXACT surface down.
 *  3. The `minEdgeMm` floor bounds it (a coarse floor ⇒ back to byte-identical).
 *  4. FLAG ON is a no-op when the sampler is already exact (analytic == sampler),
 *     so it only spends triangles where the grid is actually wrong.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { GpuSurfaceSampler } from './SurfaceSampler';
import { buildConformingWall, type ConformingWallOptions } from './ConformingWall';

const R0 = 40;
const H = 120;
const AMP = 3;
const RES_U = 64;
const RES_T = 17;
/** Ripple count == grid columns ⇒ the grid aliases the ripple away entirely. */
const K = RES_U;

/** Pre-evaluated bilinear sampler of the rippled cylinder (aliased to a cylinder). */
function blindSampler(): GpuSurfaceSampler {
  const positions = new Float32Array(RES_U * RES_T * 3);
  for (let row = 0; row < RES_T; row++) {
    const t = row / (RES_T - 1);
    for (let col = 0; col < RES_U; col++) {
      const u = col / RES_U;
      const theta = 2 * Math.PI * u;
      const r = R0 + AMP * Math.cos(K * theta);
      const b = (row * RES_U + col) * 3;
      positions[b] = r * Math.cos(theta);
      positions[b + 1] = r * Math.sin(theta);
      positions[b + 2] = t * H;
    }
  }
  return new GpuSurfaceSampler(positions, RES_U, RES_T);
}

/** The EXACT surface the sampler grid approximates (r as a fn of theta, z). */
const analyticRA = (theta: number, _z: number): number => R0 + AMP * Math.cos(K * theta);
/** A cylinder — identical to what a plain-cylinder sampler interpolates. */
const cylinderRA = (): number => R0;

function baseOpts(): ConformingWallOptions {
  return {
    maxSagMm: 0.2,
    maxEdgeMm: 20,
    minEdgeMm: 0.05,
    gradeRatio: 2,
    maxLevel: 9,
    resU: 33,
    resT: 17,
    nRing: 32,
    surfaceId: 0,
  };
}

function setFlag(on: boolean): void {
  (globalThis as unknown as { __pfConformingAnalyticScore?: boolean }).__pfConformingAnalyticScore = on;
}

/**
 * Worst per-facet chord deviation of the mesh against the EXACT surface, over
 * facets strictly inside `[tMin, 1-tMin]`.
 *
 * The t-margin is NOT cosmetic: `nRing` PINS the t=0/t=1 rows to exactly
 * `log2(nRing)` (they are shared by index with the caps), so no refinement
 * criterion — analytic or otherwise — may subdivide them. Those two rows are a
 * separate, contractual density floor; measuring them would score the pin, not
 * the criterion. (Pinned separately by the last test in this file.)
 */
function worstQuadSag(
  vertices: Float32Array,
  indices: Uint32Array,
  rA: (theta: number, z: number) => number,
  tMin = 0,
): number {
  const pos = (u: number, t: number): [number, number, number] => {
    const theta = u * 2 * Math.PI;
    const z = t * H;
    const r = rA(theta, z);
    return [r * Math.cos(theta), r * Math.sin(theta), z];
  };
  let worst = 0;
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f], b = indices[f + 1], c = indices[f + 2];
    let ua = vertices[a * 3], ub = vertices[b * 3], uc = vertices[c * 3];
    // Un-wrap the seam so the centroid is meaningful.
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) {
      if (ua < 0.5) ua += 1;
      if (ub < 0.5) ub += 1;
      if (uc < 0.5) uc += 1;
    }
    const ta = vertices[a * 3 + 1], tb = vertices[b * 3 + 1], tc = vertices[c * 3 + 1];
    if (Math.min(ta, tb, tc) < tMin || Math.max(ta, tb, tc) > 1 - tMin) continue;
    const pa = pos(ua, ta), pb = pos(ub, tb), pc = pos(uc, tc);
    // Facet centroid vs the exact surface point at the (u,t) centroid: the same
    // same-(u,t) chord screen the lab's radial ruler uses.
    const cu = (ua + ub + uc) / 3, ct = (ta + tb + tc) / 3;
    const mid: [number, number, number] = [
      (pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3,
    ];
    const ex = pos(cu, ct);
    const d = Math.hypot(mid[0] - ex[0], mid[1] - ex[1], mid[2] - ex[2]);
    if (d > worst) worst = d;
  }
  return worst;
}

afterEach(() => {
  setFlag(false);
});

const TIMEOUT_MS = 60_000;

describe('exact-analytic sag refinement (__pfConformingAnalyticScore)', () => {
  it('FLAG OFF is byte-identical even when analyticRA/analyticH/analyticSagMm are supplied', () => {
    setFlag(false);
    const sampler = blindSampler();
    const bare = buildConformingWall(sampler, baseOpts());
    const armed = buildConformingWall(sampler, {
      ...baseOpts(), analyticRA, analyticH: H, analyticSagMm: 0.01, analyticSagSamples: 3,
    });
    expect(armed.indices.length).toBe(bare.indices.length);
    expect(Array.from(armed.indices)).toEqual(Array.from(bare.indices));
    expect(Array.from(armed.vertices)).toEqual(Array.from(bare.vertices));
  }, TIMEOUT_MS);

  it('FLAG ON refines the SUB-GRID relief the sampler cannot see (non-vacuous) and cuts the exact-surface chord error', () => {
    const sampler = blindSampler();
    setFlag(false);
    const off = buildConformingWall(sampler, { ...baseOpts(), analyticRA, analyticH: H });
    setFlag(true);
    const on = buildConformingWall(sampler, {
      ...baseOpts(), analyticRA, analyticH: H, analyticSagMm: 0.05, analyticSagSamples: 3,
    });
    // Non-vacuous: the criterion must actually fire.
    expect(on.indices.length).toBeGreaterThan(off.indices.length);
    // INTERIOR only — the pinned t=0/t=1 rows cannot be refined by contract.
    const TMARGIN = 4 / 32; // 4 pinned-ring cell heights
    const sagOff = worstQuadSag(off.vertices, off.indices, analyticRA, TMARGIN);
    const sagOn = worstQuadSag(on.vertices, on.indices, analyticRA, TMARGIN);
    // The sampler-blind mesh chords the whole 3mm relief; the analytic-scored one
    // must be at least an order of magnitude better.
    expect(sagOff).toBeGreaterThan(1);
    expect(sagOn).toBeLessThan(sagOff / 10);
  }, TIMEOUT_MS);

  it('does NOT subdivide the PINNED boundary rings (they stay exactly nRing wide)', () => {
    const sampler = blindSampler();
    setFlag(true);
    const on = buildConformingWall(sampler, {
      ...baseOpts(), analyticRA, analyticH: H, analyticSagMm: 0.05, analyticSagSamples: 3,
    });
    setFlag(false);
    // The shared rings are the watertight-assembly contract: exactly nRing verts.
    expect(on.bottomRing.length).toBe(32);
    expect(on.topRing.length).toBe(32);
  }, TIMEOUT_MS);

  it('the minEdgeMm floor bounds the criterion (a coarse floor ⇒ back to the flag-off mesh)', () => {
    const sampler = blindSampler();
    setFlag(false);
    const off = buildConformingWall(sampler, { ...baseOpts(), minEdgeMm: 12 });
    setFlag(true);
    const on = buildConformingWall(sampler, {
      ...baseOpts(), minEdgeMm: 12, analyticRA, analyticH: H, analyticSagMm: 0.05,
    });
    expect(on.indices.length).toBe(off.indices.length);
  }, TIMEOUT_MS);

  it('FLAG ON is a NO-OP when the analytic surface agrees with the sampler', () => {
    // Plain cylinder both sides: the exact surface has no sub-grid relief, so the
    // criterion must never fire (it must not tax styles the grid already resolves).
    const positions = new Float32Array(RES_U * RES_T * 3);
    for (let row = 0; row < RES_T; row++) {
      const t = row / (RES_T - 1);
      for (let col = 0; col < RES_U; col++) {
        const theta = (2 * Math.PI * col) / RES_U;
        const b = (row * RES_U + col) * 3;
        positions[b] = R0 * Math.cos(theta);
        positions[b + 1] = R0 * Math.sin(theta);
        positions[b + 2] = t * H;
      }
    }
    const sampler = new GpuSurfaceSampler(positions, RES_U, RES_T);
    setFlag(false);
    const off = buildConformingWall(sampler, baseOpts());
    setFlag(true);
    const on = buildConformingWall(sampler, {
      ...baseOpts(), analyticRA: cylinderRA, analyticH: H, analyticSagMm: 0.5,
    });
    expect(on.indices.length).toBe(off.indices.length);
  }, TIMEOUT_MS);
});
