/**
 * AnalyticCurvatureFloor.test.ts — unit gates for the per-style closed-form curvature
 * floor (E-2026-07-09-ANALYTIC-FLOOR). Cross-checks the SpiralRidges closed form
 * against a finite-difference reading of the REAL CPU style function (independent of
 * the module's own derivative algebra), pins the magnitude window in mm⁻¹ (a unit
 * error — per-θ vs per-mm — would land orders of magnitude away), and verifies the
 * cell-supremum property that motivates the floor (the 128² sizing grid has ~4.7
 * nodes per groove cycle; a nodal read aliases).
 */
import { describe, it, expect } from 'vitest';
import { buildAnalyticCurvatureFloor } from './AnalyticCurvatureFloor';
import { STYLE_FUNCTIONS } from '../../../../geometry/styles';
import { baseRadius } from '../../../../geometry/profile';
import { DEFAULT_SPIRAL } from '../../../../geometry/types';

const TAU = Math.PI * 2;
const DIMS = { H: 120, Rt: 50, Rb: 40, expn: 1 };
const SIZING = { resU: 128, resT: 128, maxSagMm: 0.003, minEdgeMm: 0.1 };

/** True SpiralRidges outer radius via the production CPU style function. */
function rTrue(theta: number, z: number): number {
  const r0 = baseRadius(z, DIMS.H, DIMS.Rb, DIMS.Rt, DIMS.expn, {});
  return STYLE_FUNCTIONS.SpiralRidges(theta, z, r0, DIMS.H, {});
}

/** FD polar-section curvature + closed-form helix (Euler) correction — the same
 *  quantity the floor bounds, derived independently of the module's algebra. */
function kappaFD(u: number, t: number): number {
  const theta = ((u % 1) + 1) % 1 * TAU;
  const z = t * DIMS.H;
  const h = 1e-4;
  const rm = rTrue(theta - h, z);
  const r = rTrue(theta, z);
  const rp = rTrue(theta + h, z);
  const d1 = (rp - rm) / (2 * h);
  const d2 = (rp - 2 * r + rm) / (h * h);
  const kPolar = Math.abs(r * r + 2 * d1 * d1 - r * d2) / Math.pow(r * r + d1 * d1, 1.5);
  const tanB = (r * TAU * DEFAULT_SPIRAL.spiralTurns) / (DEFAULT_SPIRAL.spiralK * DIMS.H);
  return kPolar * (1 + tanB * tanB);
}

describe('AnalyticCurvatureFloor — SpiralRidges closed form', () => {
  it('returns null for styles without an analytic floor', () => {
    expect(buildAnalyticCurvatureFloor('HarmonicRipple', {}, DIMS, SIZING)).toBeNull();
    expect(buildAnalyticCurvatureFloor('GyroidManifold', {}, DIMS, SIZING)).toBeNull();
  });

  it('maxKappa is the minEdge-binding curvature 8·sag/minEdge²', () => {
    const spec = buildAnalyticCurvatureFloor('SpiralRidges', {}, DIMS, SIZING);
    expect(spec).not.toBeNull();
    expect(spec!.maxKappa).toBeCloseTo((8 * SIZING.maxSagMm) / (SIZING.minEdgeMm * SIZING.minEdgeMm), 12);
  });

  it('magnitude window in mm⁻¹ (unit-error tripwire) + crest floor at the rim', () => {
    const spec = buildAnalyticCurvatureFloor('SpiralRidges', {}, DIMS, SIZING)!;
    let gridMax = 0;
    for (let j = 0; j < SIZING.resT; j++) {
      const t = j / (SIZING.resT - 1);
      for (let i = 0; i < SIZING.resU; i++) {
        gridMax = Math.max(gridMax, spec.curvatureFloor(i / SIZING.resU, t));
      }
    }
    // Analytic prior: joint-crest κ ≈ 0.6 mm⁻¹ (design doc in the registry entry).
    expect(gridMax).toBeGreaterThan(0.2);
    expect(gridMax).toBeLessThan(2.4);
    // Near the rim (worst measured locus t≈0.98) the floor must see crest-class κ.
    let rimMax = 0;
    for (let i = 0; i < SIZING.resU; i++) rimMax = Math.max(rimMax, spec.curvatureFloor(i / SIZING.resU, 0.98));
    expect(rimMax).toBeGreaterThan(0.3);
  });

  it('cell-supremum: floor ≥ pointwise FD κ at the node; ≤ dense cell-sup FD κ (both with helix correction)', () => {
    const spec = buildAnalyticCurvatureFloor('SpiralRidges', {}, DIMS, SIZING)!;
    const du = 1 / SIZING.resU;
    const dt = 1 / (SIZING.resT - 1);
    let checked = 0;
    for (let s = 0; s < 150; s++) {
      // Deterministic pseudo-random sizing NODES (floor is exact at nodes; between
      // nodes it bilinearly interpolates sup values, so gates anchor at nodes).
      const i = (s * 37) % SIZING.resU;
      const j = 1 + ((s * 53) % (SIZING.resT - 2));
      const u = i * du;
      const t = j * dt;
      const fl = spec.curvatureFloor(u, t);
      // (a) sup over the cell ≥ the pointwise value at the node.
      expect(fl).toBeGreaterThanOrEqual(kappaFD(u, t) * 0.95 - 1e-6);
      // (b) sup cannot exceed a DENSER FD sup over the same ±1-node window.
      let supFD = 0;
      for (let jj = -4; jj <= 4; jj++) {
        for (let ii = -24; ii <= 24; ii++) {
          const tt = Math.min(1, Math.max(0, t + (jj / 4) * dt));
          supFD = Math.max(supFD, kappaFD(u + (ii / 24) * du, tt));
        }
      }
      expect(fl).toBeLessThanOrEqual(supFD * 1.08 + 1e-6);
      checked++;
    }
    expect(checked).toBe(150);
  });
});
