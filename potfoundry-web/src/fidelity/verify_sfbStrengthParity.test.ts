/**
 * verify_sfbStrengthParity.test.ts — CPU/GPU parity for SuperformulaBlossom
 * `sf_strength` blending (BLOCKING-2 fix).
 *
 * BUG: `rOuterSuperformulaBlossom` / `rOuterSuperformulaBlossomVec`
 * (geometry/styles.ts) unconditionally returned `r0*(0.90+0.35*rf)` — the
 * FULL petal modulation — regardless of `sf_strength`. The GPU shader
 * (assets/shaders/styles.wgsl:98-102) instead blends:
 *
 *   sf_result = r0*(0.90+0.35*rf_final);
 *   return mix(r0, sf_result, strength);   // strength = clamp(sf_strength,0,1)
 *
 * Registry default sf_strength = 0 (styles/registry.ts), so a default
 * SuperformulaBlossom pot should render SMOOTH on both CPU and GPU. Before
 * this fix, the CPU (legacy STL/3MF export path, `useExport.ts` ->
 * `buildPotMesh` -> `getStyleFunction('SuperformulaBlossom')`) rendered full
 * petals at default settings instead — a CPU export vs GPU preview mismatch.
 *
 * This test pins: strength=0 -> r0 (smooth, both {} default and explicit 0,
 * including inside the seamAngle amplitude-blend branch), strength=1 ->
 * unchanged from the old (pre-fix) full-petal formula, strength=0.5 -> exact
 * linear halfway blend, and snake_case/camelCase parity (production
 * `buildStyleOptions` in useExport.ts sets BOTH spellings; fidelity tests
 * pass snake_case only; the fix must honor either).
 *
 * Pure CPU, read-only imports, no production change from this file.
 */
import { describe, it, expect } from 'vitest';
import { rOuterSuperformulaBlossom, rOuterSuperformulaBlossomVec } from '../geometry/styles';
import { EPSILON, TAU, DEFAULT_SUPERFORMULA } from '../geometry/types';

// Independent (hand-computed) reproduction of the Gielis superformula, copied
// from geometry/styles.ts `superformulaValue` (not exported), so the
// strength=1 case below can be checked against a ground truth that is NOT
// just "call the function under test again" — it independently re-derives
// what the OLD (buggy, strength-blind) formula always produced, catching any
// accidental corruption introduced while wiring in the strength blend.
function handSuperformulaValue(
  theta: number,
  m: number,
  n1: number,
  n2: number,
  n3: number,
  a = 1.0,
  b = 1.0
): number {
  const c = Math.pow(Math.abs(Math.cos((m * theta) / 4.0) / Math.max(a, EPSILON)), n2);
  const s = Math.pow(Math.abs(Math.sin((m * theta) / 4.0) / Math.max(b, EPSILON)), n3);
  const denom = Math.pow(c + s, 1.0 / Math.max(n1, EPSILON));
  if (denom <= EPSILON) return 0.0;
  return Math.min(1.0 / denom, 4.0);
}

/** Hand-computed "full petals" radius (the pre-fix, strength-blind formula)
 *  for DEFAULT_SUPERFORMULA params, no seamAngle. Mirrors
 *  rOuterSuperformulaBlossom's math exactly: t/m/n1/n2/n3 interpolation +
 *  seam-phase offset + r0*(0.90+0.35*rf). */
function handFullRadius(theta: number, z: number, r0: number, H: number): number {
  const t = H > 0 ? z / H : 0.0;
  const { sfMBase, sfMTop, sfMCurveExp, sfN1, sfN1Top, sfN2, sfN2Top, sfN3, sfN3Top, sfA, sfB } =
    DEFAULT_SUPERFORMULA;
  const m = sfMBase + (sfMTop - sfMBase) * Math.pow(t, sfMCurveExp);
  const n1 = sfN1 + (sfN1Top - sfN1) * t;
  const n2 = sfN2 + (sfN2Top - sfN2) * t;
  const n3 = sfN3 + (sfN3Top - sfN3) * t;
  const seamOffset = Math.PI / Math.max(m, 1.0);
  const rf = handSuperformulaValue(theta + seamOffset, m, n1, n2, n3, sfA, sfB);
  return r0 * (0.9 + 0.35 * rf);
}

const H = 100;
const R0 = 50;
const Z = 50; // mid-height (t = 0.5)
const THETA_SWEEP = [0, Math.PI / 6, Math.PI / 4, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, TAU - 0.01];

describe('SFB CPU/GPU parity — sf_strength blend (BLOCKING-2)', () => {
  describe('rOuterSuperformulaBlossom (scalar)', () => {
    it('sf_strength=0 via default {} opts returns r0 (smooth) for a sweep of theta', () => {
      for (const theta of THETA_SWEEP) {
        const r = rOuterSuperformulaBlossom(theta, Z, R0, H, {});
        expect(Math.abs(r - R0)).toBeLessThan(1e-9);
      }
    });

    it('sf_strength=0 explicit returns r0 (smooth) for a sweep of theta', () => {
      for (const theta of THETA_SWEEP) {
        const r = rOuterSuperformulaBlossom(theta, Z, R0, H, { sf_strength: 0 });
        expect(Math.abs(r - R0)).toBeLessThan(1e-9);
      }
    });

    it('sf_strength=1 matches the old unconditional full-petal formula (hand-computed)', () => {
      for (const theta of THETA_SWEEP) {
        const r = rOuterSuperformulaBlossom(theta, Z, R0, H, { sf_strength: 1 });
        const expected = handFullRadius(theta, Z, R0, H);
        expect(r).toBeCloseTo(expected, 9);
      }
    });

    it('sf_strength=0.5 returns the exact halfway blend between r0 and full petals', () => {
      for (const theta of THETA_SWEEP) {
        const rHalf = rOuterSuperformulaBlossom(theta, Z, R0, H, { sf_strength: 0.5 });
        const full = handFullRadius(theta, Z, R0, H);
        const expected = R0 + (full - R0) * 0.5;
        expect(rHalf).toBeCloseTo(expected, 9);
      }
    });

    it('snake sf_strength and camel sfStrength are honored identically at strength=1', () => {
      for (const theta of THETA_SWEEP) {
        const rSnake = rOuterSuperformulaBlossom(theta, Z, R0, H, { sf_strength: 1 });
        const rCamel = rOuterSuperformulaBlossom(theta, Z, R0, H, { sfStrength: 1 });
        expect(rCamel).toBeCloseTo(rSnake, 12);
      }
    });

    it('snake sf_strength and camel sfStrength are honored identically at strength=0', () => {
      for (const theta of THETA_SWEEP) {
        const rSnake = rOuterSuperformulaBlossom(theta, Z, R0, H, { sf_strength: 0 });
        const rCamel = rOuterSuperformulaBlossom(theta, Z, R0, H, { sfStrength: 0 });
        expect(rCamel).toBeCloseTo(rSnake, 12);
        expect(Math.abs(rCamel - R0)).toBeLessThan(1e-9);
      }
    });

    it('sf_strength=0 returns r0 even inside the seamAngle amplitude-blend branch', () => {
      // seamAngle>0 takes a SEPARATE return statement in the source (the
      // early-return inside the seam blending block) — it must ALSO honor
      // strength=0, not just the unconditional tail return.
      const seamThetas = [0, (5 * Math.PI) / 180, (10 * Math.PI) / 180, (29 * Math.PI) / 180];
      for (const theta of seamThetas) {
        const r = rOuterSuperformulaBlossom(theta, Z, R0, H, { seamAngle: 30, sf_strength: 0 });
        expect(Math.abs(r - R0)).toBeLessThan(1e-9);
      }
    });
  });

  describe('rOuterSuperformulaBlossomVec (vectorized)', () => {
    const thetas = Float32Array.from(THETA_SWEEP);

    it('sf_strength=0 via default {} opts returns r0 (smooth) for all thetas', () => {
      const result = rOuterSuperformulaBlossomVec(thetas, Z, R0, H, {});
      for (const r of result) {
        expect(Math.abs(r - R0)).toBeLessThan(1e-9);
      }
    });

    it('sf_strength=0 explicit returns r0 (smooth) for all thetas', () => {
      const result = rOuterSuperformulaBlossomVec(thetas, Z, R0, H, { sf_strength: 0 });
      for (const r of result) {
        expect(Math.abs(r - R0)).toBeLessThan(1e-9);
      }
    });

    it('sf_strength=1 matches the old unconditional full-petal formula (hand-computed)', () => {
      const result = rOuterSuperformulaBlossomVec(thetas, Z, R0, H, { sf_strength: 1 });
      for (let i = 0; i < thetas.length; i++) {
        const expected = handFullRadius(thetas[i], Z, R0, H);
        expect(result[i]).toBeCloseTo(expected, 3); // Float32Array storage precision
      }
    });

    it('sf_strength=0.5 returns the exact halfway blend between r0 and full petals', () => {
      const result = rOuterSuperformulaBlossomVec(thetas, Z, R0, H, { sf_strength: 0.5 });
      for (let i = 0; i < thetas.length; i++) {
        const full = handFullRadius(thetas[i], Z, R0, H);
        const expected = R0 + (full - R0) * 0.5;
        expect(result[i]).toBeCloseTo(expected, 3);
      }
    });

    it('snake sf_strength and camel sfStrength are honored identically at strength=1', () => {
      const rSnake = rOuterSuperformulaBlossomVec(thetas, Z, R0, H, { sf_strength: 1 });
      const rCamel = rOuterSuperformulaBlossomVec(thetas, Z, R0, H, { sfStrength: 1 });
      for (let i = 0; i < thetas.length; i++) {
        expect(rCamel[i]).toBeCloseTo(rSnake[i], 5);
      }
    });

    it('sf_strength=0 returns r0 for all thetas even with seamAngle active', () => {
      const seamThetas = Float32Array.from([0, (5 * Math.PI) / 180, (10 * Math.PI) / 180, (29 * Math.PI) / 180]);
      const result = rOuterSuperformulaBlossomVec(seamThetas, Z, R0, H, { seamAngle: 30, sf_strength: 0 });
      for (const r of result) {
        expect(Math.abs(r - R0)).toBeLessThan(1e-9);
      }
    });
  });
});
