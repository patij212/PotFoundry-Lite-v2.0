/**
 * nonLocusMaxPass.test.ts — R8: the all-20 scorecard's fidelity MAX came from
 * `featureLineChord3D`, which samples ONLY along feature loci (ridges/valleys). A SMOOTH
 * under-tessellated region — a scale-tip cone, a coarse smooth wall — carries no locus, so
 * loci-only sampling never touches it and its chord error is INVISIBLE (blind, not diluted).
 *
 * The fix is a whole-mesh, non-locus MAX pass: `perFaceTrue3DSag` scans EVERY face. This test
 * pins that it catches under-tessellation on a smooth surface where a loci-only ruler has
 * nothing to sample — the exact blind spot the scorecard must not have.
 *
 * Pure CPU, read-only, no src/ change.
 */
import { describe, it, expect } from 'vitest';
import { perFaceTrue3DSag } from './labkit';

/** A coarse `nSides`-gon cylinder (r=R, smooth ⇒ NO feature loci) as (u,t) pairs + indices. */
function buildCoarseCylinder(nSides: number, nBands: number): { ut: number[]; indices: Uint32Array } {
  const ut: number[] = [];
  for (let b = 0; b <= nBands; b++) {
    for (let s = 0; s < nSides; s++) ut.push(s / nSides, b / nBands);
  }
  const at = (b: number, s: number): number => b * nSides + (s % nSides);
  const idx: number[] = [];
  for (let b = 0; b < nBands; b++) {
    for (let s = 0; s < nSides; s++) {
      const a = at(b, s), bb = at(b, s + 1), c = at(b + 1, s), d = at(b + 1, s + 1);
      idx.push(a, bb, d, a, d, c);
    }
  }
  return { ut, indices: Uint32Array.from(idx) };
}

describe('R8 — whole-mesh non-locus MAX catches what loci-only sampling is blind to', () => {
  const R = 50, H = 120;

  it('perFaceTrue3DSag sees smooth under-tessellation (no feature locus anywhere)', () => {
    const nSides = 8; // coarse ⇒ flat facets sag R(1-cos(π/8)) ≈ 3.8mm from the circle
    const { ut, indices } = buildCoarseCylinder(nSides, 4);
    const rA = (): number => R; // constant radius ⇒ perfectly SMOOTH, zero feature loci
    const res = perFaceTrue3DSag(ut, indices, rA, H);
    // A loci-only ruler samples nothing here (no ridge/valley) → would report ~0. The
    // whole-mesh ruler sees the real facet chord: a large, non-locus MAX.
    const chord = R * (1 - Math.cos(Math.PI / nSides)); // ≈ 3.8mm
    expect(res.worstMm).toBeGreaterThan(chord * 0.4);        // genuinely non-zero under-tessellation
    expect(res.worstMm).toBeLessThanOrEqual(chord + 0.25);   // …and bounded by the exact chord
  });

  it('refines toward zero as the same smooth surface is tessellated finely (it IS the chord)', () => {
    const coarse = perFaceTrue3DSag(buildCoarseCylinder(8, 4).ut, buildCoarseCylinder(8, 4).indices, () => R, H);
    const fine = perFaceTrue3DSag(buildCoarseCylinder(180, 4).ut, buildCoarseCylinder(180, 4).indices, () => R, H);
    // The whole-mesh MAX tracks the true chord: coarse ≫ fine, and fine ≈ 0 (≈0.0038mm).
    expect(fine.worstMm).toBeLessThan(0.02);
    expect(coarse.worstMm).toBeGreaterThan(fine.worstMm * 50);
  });
});
