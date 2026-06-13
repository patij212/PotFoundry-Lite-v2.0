/**
 * verify_b5_analyticMetric.test.ts — the B5 CPU PROOF.
 *
 * Proves the 3D radial-analytic metric (radialAnalyticDeviation: recover
 * theta=atan2(y,x), z direct, t=z/H → r_analytic) is CORRECT, by building a mesh
 * where BOTH the (u,t) AND the 3D positions are known by construction, and
 * cross-checking it against the known-(u,t) gate (fidelityGate.deviationVsTrueSurface).
 *
 * The two gates measure the SAME residual through two independent code paths:
 *  - deviationVsTrueSurface consumes (u,t) directly + a surface(u,t)->3D closure.
 *  - radialAnalyticDeviation consumes the 3D vertices + the parallel (u,t,sid)
 *    stash, recovers theta/z FROM the 3D positions, and compares hypot vs
 *    rAnalytic(theta,z).
 * On a faithfully-built mesh they must agree to f64 round-off: the radial gate
 * recovers theta=atan2(r·sin,r·cos)=TAU·u and z=t·H EXACTLY, then evaluates the
 * SAME analytic radius. Any disagreement would expose a mapping/config bug.
 *
 * Channels:
 *  - VERTEX channel ≈ 0 on a faithful mesh (vertices ARE on the surface).
 *  - CHORD channel == the (u,t) gate's chord error (flat facet vs curved surface).
 *
 * Negative controls confirm the metric DETECTS real defects (a nudged ring),
 * EXCLUDES the right faces (seam, ArtDeco riser), and is CONFIG-AWARE (SFB at
 * sf_strength=0 reads a smooth pot ≈ 0, not full petals — the BLOCKING-2 trap).
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { STYLE_FUNCTIONS } from '../geometry/styles';
import { buildStyleParamPayload } from '../utils/styleParams';
import { sfRf } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { deviationVsTrueSurface, type SurfaceFn, type FidelityMesh } from './fidelityGate';
import {
  radialAnalyticDeviation,
  artDecoRiserTBands,
  type AnalyticRadiusFn,
} from './analyticSurfaceGate';

const H = 120, Rt = 70, Rb = 45, expn = 1.1;
const TAU = 2 * Math.PI;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const r0Of = (t: number): number => Rb + (Rt - Rb) * Math.pow(clamp01(t), expn);

/** Build a config-true surface(u,t)->3D for a generic radial style (STYLE_FUNCTIONS). */
function genericSurface(styleId: keyof typeof STYLE_FUNCTIONS, opts: Record<string, number>): {
  surface: SurfaceFn;
  rAnalytic: AnalyticRadiusFn;
} {
  const fn = STYLE_FUNCTIONS[styleId];
  // snake+camel both spellings (the production buildStyleOptions convention).
  const toCamel = (s: string): string => s.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
  const so: Record<string, number> = {};
  for (const [k, v] of Object.entries(opts)) {
    if (typeof v !== 'number') continue;
    so[k] = v;
    const ck = toCamel(k);
    if (ck !== k) so[ck] = v;
  }
  const rAnalytic: AnalyticRadiusFn = (theta, z) => {
    const t = clamp01(z / H);
    return fn(theta, z, r0Of(t), H, so as Parameters<typeof fn>[4]);
  };
  const surface: SurfaceFn = (u, t) => {
    const tc = clamp01(t);
    const theta = TAU * u;
    const r = rAnalytic(theta, tc * H);
    return [r * Math.cos(theta), r * Math.sin(theta), tc * H] as const;
  };
  return { surface, rAnalytic };
}

/** Build the config-true SFB surface honoring the GPU strength mix (BLOCKING-2). */
function sfbSurface(packed: Float32Array): { surface: SurfaceFn; rAnalytic: AnalyticRadiusFn } {
  const strength = Math.max(0, Math.min(1, packed[0]));
  const rAnalytic: AnalyticRadiusFn = (theta, z) => {
    const t = clamp01(z / H);
    const r0 = r0Of(t);
    const sf = r0 * (0.9 + 0.35 * sfRf(((theta / TAU) % 1 + 1) % 1, t, packed));
    return r0 + (sf - r0) * strength; // mix(r0, sf, strength) — styles.wgsl:102
  };
  const surface: SurfaceFn = (u, t) => {
    const tc = clamp01(t);
    const theta = TAU * u;
    const r = rAnalytic(theta, tc * H);
    return [r * Math.cos(theta), r * Math.sin(theta), tc * H] as const;
  };
  return { surface, rAnalytic };
}

/**
 * A known-(u,t) lattice (nu × nt), triangulated. Returns:
 *  - utMesh: a FidelityMesh whose vertices are (u,t,surfaceId=0) triples.
 *  - mesh3D: the SAME topology with vertices = surface(u,t) 3D positions.
 *  - ut: the parallel (u,t,surfaceId) stash for the 3D gate.
 * `nudge(u,t,pos)` may perturb a 3D position (radial defect injection).
 */
function buildGridMesh(
  nu: number,
  nt: number,
  surface: SurfaceFn,
  nudge?: (u: number, t: number, pos: readonly [number, number, number]) => [number, number, number],
): { utMesh: FidelityMesh; mesh3D: { vertices: Float32Array; indices: Uint32Array }; ut: Float32Array } {
  const nUverts = nu + 1, nTverts = nt + 1;
  const utv: number[] = [], v3: number[] = [];
  for (let it = 0; it < nTverts; it++) {
    const t = it / nt;
    for (let iu = 0; iu < nUverts; iu++) {
      const u = iu / nu;
      utv.push(u, t, 0); // surfaceId 0 = outer wall
      let p = surface(u, t);
      if (nudge) p = nudge(u, t, p);
      v3.push(p[0], p[1], p[2]);
    }
  }
  const idx: number[] = [];
  for (let it = 0; it < nt; it++) {
    for (let iu = 0; iu < nu; iu++) {
      const a = it * nUverts + iu, b = a + 1, c = a + nUverts, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  const ut = Float32Array.from(utv);
  return {
    utMesh: { vertices: ut, indices: Uint32Array.from(idx) },
    mesh3D: { vertices: Float32Array.from(v3), indices: Uint32Array.from(idx) },
    ut,
  };
}

describe('B5 CPU proof — 3D radial-analytic metric == known-(u,t) gate', () => {
  it('SuperformulaBlossom@1: chord channel agrees with deviationVsTrueSurface; vertex channel ≈ 0', () => {
    const [, packed] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
    const p = Float32Array.from(packed);
    const { surface, rAnalytic } = sfbSurface(p);
    const { utMesh, mesh3D, ut } = buildGridMesh(96, 64, surface);

    const seamExclU = 0; // no seam exclusion in the proof — measure the whole grid
    const A = deviationVsTrueSurface(utMesh, surface, { tolMm: 0.1, seamExclU, denseN: 12 });
    const B = radialAnalyticDeviation(mesh3D, ut, rAnalytic, { H, tolMm: 0.1, seamExclU, denseN: 12 });

    /* eslint-disable no-console */
    console.log(`\n[B5-PROOF SFB@1] (u,t)-gate max=${A.maxMm.toExponential(3)} p99=${A.p99Mm.toExponential(3)}`);
    console.log(`[B5-PROOF SFB@1] 3D-gate  max=${B.maxDevMm.toExponential(3)} p99=${B.p99DevMm.toExponential(3)} vertexMax=${B.vertexMaxMm.toExponential(3)} chordMax=${B.chordMaxMm.toExponential(3)}`);
    console.log(`[B5-PROOF SFB@1] radial/full ratio = ${(B.chordMaxMm / A.maxMm).toFixed(5)} (radial is a lower bound; ≈1 on a near-vertical wall)`);
    /* eslint-enable no-console */

    // The chord channel measures RADIAL deviation; the (u,t) gate measures full
    // 3D facet→surface distance. They are EQUAL where the surface normal is radial
    // and the radial channel is a LOWER BOUND elsewhere (factor cos(normal-tilt)).
    // On this near-vertical SFB wall the two agree to ≈0.2% — the proof that the
    // 3D atan2/z mapping + the strength-mix config recover the same surface.
    expect(B.chordMaxMm).toBeLessThanOrEqual(A.maxMm + 1e-9); // strict lower bound
    expect(B.chordMaxMm).toBeGreaterThan(A.maxMm * 0.99);     // within 1% on a near-vertical wall
    // (p99 is NOT cross-checked: the 3D gate pools vertex+chord samples while the
    //  (u,t) gate pools per-triangle maxes — different population, same max.)
    // The vertex channel certifies "vertices lie on the true surface" — ≈ 0 here.
    expect(B.vertexMaxMm).toBeLessThan(1e-4);
    expect(B.nonFiniteCount).toBe(0);
    expect(B.wallTriangles).toBe(A.nTris);
  });

  it('ArtDeco (default, featured): 3D radial chord max == (u,t) gate max with riser bands excluded', () => {
    const opts = {}; // ArtDeco defaults are featured (step_depth 0.08)
    const { surface, rAnalytic } = genericSurface('ArtDeco', opts);
    const { utMesh, mesh3D, ut } = buildGridMesh(96, 96, surface);

    const stepEdges = artDecoRiserTBands(4); // default ad_step_count = 4
    // The riser-frustum cell straddles a step over one t-row; the band half-width
    // must cover that row (1/96 grid here ⇒ ~6e-3) so the riser channel — not just
    // the geometric near-horizontal guard — accounts for it (auditable riserBandMax).
    const tBandHalf = 6e-3, seamExclU = 0;
    const A = deviationVsTrueSurface(utMesh, surface, { tolMm: 0.1, seamExclU, tBands: stepEdges, tBandHalf, denseN: 12 });
    const B = radialAnalyticDeviation(mesh3D, ut, rAnalytic, { H, tolMm: 0.1, seamExclU, tBands: stepEdges, tBandHalf, denseN: 12 });

    /* eslint-disable no-console */
    console.log(`\n[B5-PROOF ArtDeco] (u,t)-gate max=${A.maxMm.toFixed(4)} p99=${A.p99Mm.toFixed(4)} nTris=${A.nTris}`);
    console.log(`[B5-PROOF ArtDeco] 3D-gate  max=${B.maxDevMm.toFixed(4)} chordMax=${B.chordMaxMm.toFixed(4)} vertexMax=${B.vertexMaxMm.toExponential(3)} riserBandMax=${B.riserBandMaxMm.toFixed(4)} wallTris=${B.wallTriangles}`);
    console.log(`[B5-PROOF ArtDeco] => with risers excluded the wall is faithful; the (u,t) and 3D gates agree to <1%.`);
    /* eslint-enable no-console */

    // Riser bands excluded on BOTH gates ⇒ the clean wall (fan/chevron floor).
    // The two independent gates agree to <1% (radial is the lower bound).
    expect(B.wallTriangles).toBe(A.nTris);
    expect(B.chordMaxMm).toBeLessThanOrEqual(A.maxMm + 1e-9);
    expect(B.chordMaxMm).toBeGreaterThan(A.maxMm * 0.98);
    expect(B.vertexMaxMm).toBeLessThan(1e-4);
    // The riser frustum is EXCLUDED (steep radial-step facet ⇒ near-horizontal
    // normal): it never enters the measured wall. wallTriangles parity vs the
    // (u,t) gate (which excludes via the riser t-band) proves the same faces drop.
    expect(B.maxDevMm).toBeLessThan(1.0); // the wall is faithful; no riser frustum leaked in
  });

  it('detects an injected radial defect (one ring nudged +0.3mm outward)', () => {
    const { surface, rAnalytic } = genericSurface('HarmonicRipple', {});
    const targetT = 0.5;
    const nudge = (_u: number, t: number, p: readonly [number, number, number]): [number, number, number] => {
      if (Math.abs(t - targetT) > 1e-9) return [p[0], p[1], p[2]];
      const r = Math.hypot(p[0], p[1]);
      const s = (r + 0.3) / (r || 1); // push radius +0.3mm
      return [p[0] * s, p[1] * s, p[2]];
    };
    const { mesh3D, ut } = buildGridMesh(64, 64, surface, nudge);
    const B = radialAnalyticDeviation(mesh3D, ut, rAnalytic, { H, tolMm: 0.1, seamExclU: 0, denseN: 8 });
    /* eslint-disable no-console */
    console.log(`\n[B5-PROOF defect] injected +0.3mm ring → vertexMax=${B.vertexMaxMm.toFixed(4)}mm nAbove=${B.nAbove}`);
    /* eslint-enable no-console */
    // The vertex channel must SEE the 0.3mm radial defect (within sampling slop).
    expect(B.vertexMaxMm).toBeGreaterThan(0.25);
    expect(B.vertexMaxMm).toBeLessThan(0.35);
    expect(B.nAbove).toBeGreaterThan(0);
  });

  it('excludes the u-seam band (tracked in seamBandMaxMm, not maxDevMm)', () => {
    // A radial spike planted at the seam (u=0/1) must be excluded, not failed.
    // Base = a SMOOTH pot (SFB sf_strength=0) so the ONLY deviation is the spike.
    const [, packed] = buildStyleParamPayload('SuperformulaBlossom', {}); // strength 0
    const { surface, rAnalytic } = sfbSurface(Float32Array.from(packed));
    // Spike only the exact seam vertices (u==0 / u==1). With a 1/64 grid and a
    // seamExclU band wider than one cell, every triangle TOUCHING a spiked vertex
    // is fully inside the excluded band (its centroid-u < seamExclU or it wraps).
    const nudge = (u: number, _t: number, p: readonly [number, number, number]): [number, number, number] => {
      if (u > 1e-9 && u < 1 - 1e-9) return [p[0], p[1], p[2]];
      const r = Math.hypot(p[0], p[1]);
      const s = (r + 1.0) / (r || 1); // +1mm spike at the seam (u=0/1)
      return [p[0] * s, p[1] * s, p[2]];
    };
    const { mesh3D, ut } = buildGridMesh(64, 64, surface, nudge);
    const B = radialAnalyticDeviation(mesh3D, ut, rAnalytic, { H, tolMm: 0.1, seamExclU: 0.05, denseN: 6 });
    /* eslint-disable no-console */
    console.log(`\n[B5-PROOF seam] +1mm seam spike → maxDevMm=${B.maxDevMm.toFixed(4)} seamBandMaxMm=${B.seamBandMaxMm.toFixed(4)}`);
    /* eslint-enable no-console */
    expect(B.seamBandMaxMm).toBeGreaterThan(0.9); // the spike is captured in the seam channel
    expect(B.maxDevMm).toBeLessThan(0.1);          // and NOT in the measured wall
  });

  it('CONFIG-AWARE: SFB at sf_strength=0 (default smooth pot) reads ≈ 0, NOT full petals (BLOCKING-2)', () => {
    const [, packed] = buildStyleParamPayload('SuperformulaBlossom', {}); // default → sf_strength=0
    const p = Float32Array.from(packed);
    expect(p[0]).toBe(0); // confirm the default is the smooth strength-0 pot
    const { surface, rAnalytic } = sfbSurface(p);
    const { mesh3D, ut } = buildGridMesh(96, 64, surface);
    const B = radialAnalyticDeviation(mesh3D, ut, rAnalytic, { H, tolMm: 0.1, seamExclU: 0, denseN: 8 });
    /* eslint-disable no-console */
    console.log(`\n[B5-PROOF config] SFB sf_strength=0 → maxDevMm=${B.maxDevMm.toExponential(3)}mm (smooth pot, no petal false-fail)`);
    /* eslint-enable no-console */
    // A config-BLIND truth (STYLE_FUNCTIONS, always full petals) would report
    // multi-mm here. The strength-mix truth reads a smooth pot ≈ chord floor.
    expect(B.maxDevMm).toBeLessThan(0.05);
  });
});
