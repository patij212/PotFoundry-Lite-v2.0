/**
 * prefilterBoundSoundness.test.ts — TDD for R4: the chord-channel pre-filter must bound
 * the WHOLE facet, not just its centroid.
 *
 * accumulateDeviation skips the (expensive) dense chord scan when a facet's cheap bound is
 * ≤ preFilterMm, on the premise "chordDev ≤ bound ≤ pre". But the bound was evaluated only
 * at the CENTROID, and the radial residual is NOT constant across a facet — an off-centroid
 * sample can exceed the centroid. So a facet with centroid ≤ pre but a corner/edge sample
 * > pre was skipped, and its spike was recorded at the (smaller) centroid value → chordMax
 * UNDER-reported. Since chordDev ≤ chordBound POINTWISE (perpendicular ≤ radial), the sound
 * bound is the MAX of chordBound over the same dense samples the scan would use.
 *
 * Pure CPU, read-only imports, no production behaviour change.
 */
import { describe, it, expect } from 'vitest';
import { radialAnalyticDeviation, perpendicular3DDeviation, type AnalyticRadiusFn } from './analyticSurfaceGate';

const TAU = 2 * Math.PI;
const H = 120;

type Surface = (u: number, t: number) => readonly [number, number, number];

/** (nu×nt) grid mesh on `surface` with the parallel (u,t,sid=0) stash. */
function buildGridMesh(
  nu: number, nt: number, surface: Surface,
  nudge?: (u: number, t: number, p: readonly [number, number, number]) => [number, number, number],
): { mesh3D: { vertices: Float32Array; indices: Uint32Array }; ut: Float32Array } {
  const nUv = nu + 1, nTv = nt + 1;
  const utv: number[] = [], v3: number[] = [];
  for (let it = 0; it < nTv; it++) {
    const t = it / nt;
    for (let iu = 0; iu < nUv; iu++) {
      const u = iu / nu;
      utv.push(u, t, 0);
      let p = surface(u, t);
      if (nudge) p = nudge(u, t, p);
      v3.push(p[0], p[1], p[2]);
    }
  }
  const idx: number[] = [];
  for (let it = 0; it < nt; it++) {
    for (let iu = 0; iu < nu; iu++) {
      const a = it * nUv + iu, b = a + 1, c = a + nUv, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  return { mesh3D: { vertices: Float32Array.from(v3), indices: Uint32Array.from(idx) }, ut: Float32Array.from(utv) };
}

const surfaceOf = (rA: AnalyticRadiusFn): Surface => (u, t) => {
  const theta = TAU * u, z = t * H, r = rA(theta, z);
  return [r * Math.cos(theta), r * Math.sin(theta), z] as const;
};

/** Nudge exactly the grid vertex at (u,t)=(0.5,0.5) outward by `d` mm. */
function nudgeOneVertex(d: number) {
  return (u: number, t: number, p: readonly [number, number, number]): [number, number, number] => {
    if (Math.abs(u - 0.5) > 1e-9 || Math.abs(t - 0.5) > 1e-9) return [p[0], p[1], p[2]];
    const r = Math.hypot(p[0], p[1]), s = (r + d) / (r || 1);
    return [p[0] * s, p[1] * s, p[2]];
  };
}

describe('R4 — chord pre-filter bounds the whole facet, not just the centroid', () => {
  const R = 50;
  const rA: AnalyticRadiusFn = () => R; // cylinder ⇒ perpendicular == radial
  // A FINE 360-gon so the smooth-facet chord sag (≈0.0019mm) is ≪ pre → smooth facets are
  // genuinely skipped. One vertex +0.12mm out: the ~6 facets touching it have centroid radial
  // ≈0.04 (< pre=0.06, so the centroid-only pre-filter SKIPS them) but a chord sample AT that
  // vertex reads 0.12 — the spike the pre-filter must not mask.
  const opts = { H, tolMm: 0.1, seamExclU: 0, denseN: 12, preFilterMm: 0.06 };

  it('radial: chordMax sees the 0.12 off-centroid spike (was masked at the ~0.04 centroid)', () => {
    const { mesh3D, ut } = buildGridMesh(360, 4, surfaceOf(rA), nudgeOneVertex(0.12));
    const out = radialAnalyticDeviation(mesh3D, ut, rA, opts);
    // The spike is a genuine CHORD sample (the flat facet at the nudged vertex is 0.12mm off
    // the cylinder). The pre-filter must not let it hide behind the centroid.
    expect(out.chordMaxMm).toBeGreaterThan(0.10);
  });

  it('perpendicular: chordMax sees the spike too, and stays ≤ the radial bound', () => {
    const { mesh3D, ut } = buildGridMesh(360, 4, surfaceOf(rA), nudgeOneVertex(0.12));
    const radial = radialAnalyticDeviation(mesh3D, ut, rA, opts);
    const perp = perpendicular3DDeviation(mesh3D, ut, rA, opts);
    expect(perp.chordMaxMm).toBeGreaterThan(0.10);
    expect(perp.chordMaxMm).toBeLessThanOrEqual(radial.chordMaxMm + 1e-9); // perp ≤ radial always
  });

  it('a clean fine cylinder reads only its ≈0.002mm angular chord (fix does not inflate it)', () => {
    const { mesh3D, ut } = buildGridMesh(360, 4, surfaceOf(rA));
    const out = radialAnalyticDeviation(mesh3D, ut, rA, opts);
    expect(out.chordMaxMm).toBeLessThan(0.01);
  });
});
