// surfaceMetricField.test.ts — verify M = g/h² equals the ANALYTIC first fundamental form.
// The metric math is correctness-critical (a wrong tensor silently invalidates the whole study), so we pin it
// to closed-form g on two surfaces with known fundamental forms: a cylinder and a cone.
import { describe, it, expect } from 'vitest';
import { buildSurfaceMetricField } from './surfaceMetricField';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const RES = 65; // fine enough that the central-difference Su is within ~0.3% of analytic (sin(δ)/δ, δ=2π/64)

describe('buildSurfaceMetricField — first fundamental form M = g/h²', () => {
  it('cylinder r=R: M ≈ diag(4π²R²/h², H²/h²), F=0', () => {
    const R = 45, H = 120, h = 5;
    const rA: AnalyticRadiusFn = () => R;
    const f = buildSurfaceMetricField(rA, H, { resU: RES, resT: RES, h3DMm: h });
    const inv = 1 / (h * h);
    const iu = 32, it = 32, b = (it * RES + iu) * 3; // interior node
    const E = 4 * Math.PI * Math.PI * R * R, G = H * H;
    expect(Math.abs(f.m[b] / (E * inv) - 1)).toBeLessThan(0.01);  // M00 = E/h² (central-diff ~0.3% low)
    expect(f.m[b + 1]).toBeCloseTo(0, 6);                          // M01 = F/h² = 0
    expect(f.m[b + 2]).toBeCloseTo(G * inv, 4);                    // M11 = G/h² (exact: St=(0,0,H))
  });

  it('cone r(z)=Rb+(Rt−Rb)z/H: M ≈ diag(4π²r²/h², ((Rt−Rb)²+H²)/h²), F=0', () => {
    const Rb = 40, Rt = 50, H = 120, h = 4;
    const rA: AnalyticRadiusFn = (_theta, z) => Rb + (Rt - Rb) * (z / H);
    const f = buildSurfaceMetricField(rA, H, { resU: RES, resT: RES, h3DMm: h });
    const inv = 1 / (h * h);
    const iu = 32, it = 32, b = (it * RES + iu) * 3; // interior node at t≈0.5 → r≈45
    const t = it / (RES - 1), r = Rb + (Rt - Rb) * t;
    const E = 4 * Math.PI * Math.PI * r * r, G = (Rt - Rb) * (Rt - Rb) + H * H;
    expect(Math.abs(f.m[b] / (E * inv) - 1)).toBeLessThan(0.01);  // M00 = E/h²
    expect(f.m[b + 1]).toBeCloseTo(0, 5);                          // M01 = F/h² = 0 (r indep of θ)
    expect(Math.abs(f.m[b + 2] / (G * inv) - 1)).toBeLessThan(0.01); // M11 = G/h²
  });

  it('chord mode on cylinder: κ_max=1/R ⇒ h₃D=√(8·tol·R) ⇒ M00=4π²R²/(8·tol·R)', () => {
    const R = 45, H = 120, tol = 0.1;
    const rA: AnalyticRadiusFn = () => R;
    const f = buildSurfaceMetricField(rA, H, { resU: RES, resT: RES, tolMm: tol, hMin: 0.5, hMax: 50 });
    const iu = 32, it = 32, b = (it * RES + iu) * 3; // interior node
    const h3D = Math.sqrt(8 * tol * R);              // = 6 mm, inside [0.5,50] so unclamped
    const inv = 1 / (h3D * h3D);
    const E = 4 * Math.PI * Math.PI * R * R, G = H * H;
    expect(Math.abs(f.m[b] / (E * inv) - 1)).toBeLessThan(0.02);   // M00 = E/h₃D² (κ via central diffs ~1%)
    expect(f.m[b + 1]).toBeCloseTo(0, 5);                          // M01 = 0
    expect(Math.abs(f.m[b + 2] / (G * inv) - 1)).toBeLessThan(0.02); // M11 = G/h₃D²
  });
});
