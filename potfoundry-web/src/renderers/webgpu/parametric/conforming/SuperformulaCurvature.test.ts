/**
 * SuperformulaCurvature.test.ts — TDD for the STAGE-4 analytic curvature FLOOR.
 *
 * Serration is curvature-resolution-limited: the sizing field's κ from FD on the
 * 256² bilinear sampler is band-limited (a sub-cell step reads inside a planar
 * patch), so it under-refines the steep petal flanks. The fix feeds the sizing
 * field an ACCURATE angular-curvature floor from the analytic radius mirror
 * (`sfRf`): FD on a smooth analytic function has no band-limit and no GPU cost.
 *
 * κ_angular = |1 + 2ρ'² − ρ''| / (R·(1+ρ'²)^1.5)   [polar-curve curvature, mm⁻¹]
 * with ρ'=R'/R, ρ''=R''/R from sfRf (r0 cancels in the ratios), R the physical
 * radius (from the sampler/GPU). A plain pot reads κ≈1/R (a circle); steep flanks
 * read ≫1/R; the n1<1 tip is a cusp (κ→∞, handled by a cap downstream).
 */
import { describe, it, expect } from 'vitest';
import { polarCurvature, superformulaAngularKappa } from './SuperformulaCurvature';

/** Pack SuperformulaBlossom params in WGSL slot order. */
function pack(strength: number, mBase: number, mTop: number, n1 = 0.35): Float32Array {
  return Float32Array.from([strength, mBase, mTop, 1.2, n1, n1, 0.8, 0.8, 0.8, 0.8, 1, 1]);
}

describe('polarCurvature (generic polar-curve curvature from R and ratios)', () => {
  it('a circle (no relief) has curvature 1/R', () => {
    expect(polarCurvature(50, 0, 0)).toBeCloseTo(1 / 50, 9);
    expect(polarCurvature(45, 0, 0)).toBeCloseTo(1 / 45, 9);
  });

  it('matches the closed-form polar curvature at a cosine-relief peak', () => {
    // R(θ)=R0+a·cos(kθ); at the peak θ=0: R=R0+a, R'=0, R''=-a·k².
    // κ = |R²+2R'²−R·R''| / (R²+R'²)^1.5  (Ericson/standard polar formula).
    const R0 = 50, a = 5, k = 8;
    const R = R0 + a;            // 55
    const Rpp = -a * k * k;      // -320
    const rhoP = 0;              // R'/R
    const rhoPP = Rpp / R;       // R''/R
    const expected = Math.abs(R * R + 0 - R * Rpp) / Math.pow(R * R, 1.5);
    expect(polarCurvature(R, rhoP, rhoPP)).toBeCloseTo(expected, 9);
  });
});

describe('superformulaAngularKappa (analytic flank curvature from sfRf)', () => {
  const R = 50; // physical radius (from the sampler in production)

  it('reads ≈ 1/R on a plain pot (strength 0 — no relief, g≡1)', () => {
    for (const u of [0.05, 0.3, 0.61, 0.93]) {
      expect(superformulaAngularKappa(u, 0.5, pack(0, 6, 10), R)).toBeCloseTo(1 / R, 4);
    }
  });

  it('reads ≫ 1/R somewhere on a high-strength petal (steep flank curvature)', () => {
    const p = pack(1, 8, 8, 0.3);
    let maxK = 0;
    for (let i = 0; i < 256; i++) {
      const k = superformulaAngularKappa(i / 256, 0.5, p, R);
      if (k > maxK) maxK = k;
    }
    expect(maxK).toBeGreaterThan(10 / R); // flanks curve far sharper than the base circle
  });

  it('the flank curvature rises with style strength (monotone proxy)', () => {
    const sampleMaxK = (s: number): number => {
      const p = pack(s, 8, 8, 0.3);
      let maxK = 0;
      for (let i = 0; i < 256; i++) {
        const k = superformulaAngularKappa(i / 256, 0.5, p, R);
        if (k > maxK) maxK = k;
      }
      return maxK;
    };
    const k02 = sampleMaxK(0.2);
    const k06 = sampleMaxK(0.6);
    const k10 = sampleMaxK(1.0);
    expect(k06).toBeGreaterThan(k02);
    expect(k10).toBeGreaterThan(k06);
  });

  it('is finite and positive everywhere (the cusp is large but not NaN/Inf)', () => {
    const p = pack(1, 6, 10, 0.3);
    for (let j = 0; j <= 8; j++) {
      for (let i = 0; i < 64; i++) {
        const k = superformulaAngularKappa(i / 64, j / 8, p, R);
        expect(Number.isFinite(k)).toBe(true);
        expect(k).toBeGreaterThan(0);
      }
    }
  });
});
