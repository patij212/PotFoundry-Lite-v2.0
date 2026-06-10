/**
 * FShearDiagnostics.test.ts — validate the sliver-mechanism classifier on
 * synthetic surfaces whose mechanism is KNOWN in closed form, so the real-GPU
 * classification (e2e _fshear_probe) can be trusted.
 *
 * Two reference mechanisms (see FShearDiagnostics module doc):
 *  (A) ANISOTROPY — a separable cylinder has F≡0 (∂P/∂u ⟂ ∂P/∂t always). An
 *      extreme radius/height ratio makes a SQUARE cell sliver, but an
 *      axis-aligned rectangle restores it → `irreducibleByAxisFrac ≈ 0`.
 *  (B) AREA-COLLAPSE SHEAR — a strongly TWISTED cylinder makes ∂P/∂t pick up a
 *      large circumferential component, so `|F|/√(EG) → 1`; the cell is a blade
 *      for EVERY Δu/Δt → `irreducibleByAxisFrac > 0`, only rotation (aspect √3)
 *      fixes it.
 */
import { describe, it, expect } from 'vitest';
import type { SurfaceSampler, Vec3 } from './SurfaceSampler';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import { classifyCellCeiling, classifySurfaceShear } from './FShearDiagnostics';

/**
 * Twisted cylinder: `θ = 2π(u + twist·t)`, `r = R0 + amp·cos(2π k u)`, `z = H·t`.
 * `twist≠0` rotates each height ring, so `∂P/∂t` gains a circumferential term →
 * `F = ∂P/∂u·∂P/∂t ≠ 0` (the parameter directions are non-orthogonal in 3D)
 * while the cell AREA `√(EG−F²)=2πR·H·Δ` is preserved — a pure SHEAR. Models the
 * twisted styles (spinTurns) and the oblique-relief short-wide residuals.
 */
class TwistedCylinderSampler implements SurfaceSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
    private readonly twist = 0,
    private readonly amp = 0,
    private readonly k = 0,
  ) {}
  position(u: number, t: number): Vec3 {
    const theta = 2 * Math.PI * (u + this.twist * t);
    const r = this.R0 + this.amp * Math.cos(2 * Math.PI * this.k * u);
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}

describe('FShearDiagnostics — sliver-mechanism classifier', () => {
  it('separable cylinder has F≡0 (no shear) at every regime', () => {
    for (const [R, H] of [
      [57, 120],
      [145, 40],
      [400, 10],
    ] as const) {
      const s = classifySurfaceShear(new SyntheticCylinderSampler(R, H), { resU: 64, resT: 64 });
      expect(s.maxCosAlpha).toBeLessThan(0.02); // orthogonal param directions
    }
  });

  it('default + short-wide GENTLE never sliver (matches the e2e pass set)', () => {
    // Default R≈57/H≈120 → 2πR/H≈3; short-wide gentle R≈145/H≈40 → ≈23. Both <100.
    expect(classifySurfaceShear(new SyntheticCylinderSampler(57, 120), { resU: 64, resT: 64 }).sliverCountSquare).toBe(0);
    expect(classifySurfaceShear(new SyntheticCylinderSampler(145, 40), { resU: 64, resT: 64 }).sliverCountSquare).toBe(0);
  });

  it('(A) extreme anisotropy slivers SQUARE cells but axis refinement fixes ALL of them', () => {
    // Very flat wide cylinder: 2πR/H ≈ 251 > 100 → square slivers, F≡0.
    const s = classifySurfaceShear(new SyntheticCylinderSampler(400, 10), { resU: 64, resT: 64 });
    expect(s.sliverCountSquare).toBeGreaterThan(0); // square cells sliver
    expect(s.maxCosAlpha).toBeLessThan(0.02); // but NO shear
    // The best axis-aligned rectangle erases every sliver → mechanism (A).
    expect(s.irreducibleByAxisFrac).toBe(0);
    expect(s.maxBestAxisAspect).toBeLessThan(3); // ≈√3
  });

  it('(B) strong twist makes EVERY axis-aligned cell a sliver — only rotation fixes it', () => {
    // Short-wide + 12 turns: |F|/√(EG) → 1 (area-collapse shear).
    const s = classifySurfaceShear(new TwistedCylinderSampler(145, 40, 12), { resU: 64, resT: 64 });
    expect(s.sliverCountSquare).toBeGreaterThan(0);
    expect(s.maxCosAlpha).toBeGreaterThan(0.99); // near-parallel param directions
    // Axis refinement CANNOT fix these — they are irreducible without rotation.
    expect(s.irreducibleByAxisFrac).toBeGreaterThan(0.5);
    expect(s.maxBestAxisAspect).toBeGreaterThan(100);
    // A metric-aligned (rotated) cell is near-equilateral everywhere.
    expect(s.maxRotatedAspect).toBeLessThan(2); // ≈√3
  });

  it('mild twist (within axis-fixable range) is NOT misclassified as irreducible', () => {
    // 2.5 turns short-wide: |cosα|≈0.9997 but the best rhombus is ≈40-50 (<100),
    // so axis refinement still fixes it — must NOT be flagged irreducible.
    const s = classifySurfaceShear(new TwistedCylinderSampler(145, 40, 2.5), { resU: 64, resT: 64 });
    expect(s.maxBestAxisAspect).toBeLessThan(100);
    expect(s.irreducibleByAxisFrac).toBe(0);
  });
});

describe('classifyCellCeiling — analytic min-angle ceiling under a domain shear', () => {
  it('reads ~90° corners on an unsheared cylinder', () => {
    const s = new SyntheticCylinderSampler(50, 120);
    const r = classifyCellCeiling(s, null);
    expect(r.minCornerDeg).toBeGreaterThan(89);
    expect(r.pctCornerBelow15).toBe(0);
  });

  it('matches the analytic corner angle under a pure shear warp', () => {
    const R = 50;
    const H = 120;
    const shear = 2; // u' = u − shear·t
    const s = new SyntheticCylinderSampler(R, H);
    const r = classifyCellCeiling(s, (u, t) => u - shear * t);
    // cylinder: E=(2πR)², G=H²; composed F = −shear·E ⇒
    // cosθ = shear·a / √(H² + shear²·a²), a=2πR
    const a = 2 * Math.PI * R;
    const expected = (Math.acos((shear * a) / Math.hypot(H, shear * a)) * 180) / Math.PI;
    expect(Math.abs(r.minCornerDeg - expected)).toBeLessThan(0.5);
  });
});
