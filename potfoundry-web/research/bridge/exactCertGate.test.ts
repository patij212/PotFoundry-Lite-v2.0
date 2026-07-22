/**
 * exactCertGate.test.ts — the LIVE certification gate (always-on, NOT env-gated).
 *
 * This is the missing "wire the rigorous prover to a live gate" piece. The rigorous
 * targetSolid interval prover was previously only exercised by the DEV-ONLY, env-gated
 * roster sidecar baker (`_certRosterErrorBake.test.ts`, `it.skipIf(!selected)`), which
 * is skipped by default and gates nothing. This test runs the prover END-TO-END by
 * default in `npm run test`, so a regression that makes the outer wall stop certifying
 * at 0.01mm — or a prover soundness change — FAILS the build.
 *
 * SCOPE: the OUTER WALL (the fidelity surface, matching measureRadialFidelity), on a
 * gentle small pot resolved to certify at 0.01mm. Other patches are tessellated coarse
 * (not gated) so the rigorous proof stays CI-fast (~15-20s vs ~85s whole-solid). The
 * verdict is MAX-first and FAIL-CLOSED (an unconverged triangle's 1.28mm sentinel
 * dominates the MAX). See exactCertGate.ts and research/MEASUREMENT-COMPENDIUM.md §4.9.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_GEOMETRY, type GeometryParams } from '../../src/state/types';
import { certifyOuterWallExact } from './exactCertGate';

const GENTLE_GEOMETRY: GeometryParams = { ...DEFAULT_GEOMETRY, H: 20, top_od: 30, bottom_od: 30, r_drain: 6 };
const GENTLE_PARAMS = { hr_petal_amp: 0.01, hr_ripple_amp: 0, hr_bell: 0 };

// Outer wall resolved (angular 256, vertical 8) so the interval prover can guarantee
// ≤0.01mm; the non-gated patches are minimal for speed.
const GATE_DIVISIONS = {
  angularDivisionsLog2: 8,
  verticalDivisionsLog2ByPatch: {
    'outer-wall': 3, 'inner-wall': 1, 'top-rim': 1, 'bottom-top': 1, 'bottom-under': 1, 'drain-wall': 0,
  },
} as const;

describe('exact certification gate — LIVE (rigorous interval prover)', () => {
  it('rigorously certifies the gentle outer wall at 0.01mm, converged & fail-closed', () => {
    const res = certifyOuterWallExact(GENTLE_GEOMETRY, GENTLE_PARAMS, 'HarmonicRipple', GATE_DIVISIONS, {
      tolMm: 0.01,
      splitBudget: 400,
      gatePatchIds: ['outer-wall'],
    });
    expect(res.triangleCount).toBeGreaterThan(0);            // a wall was actually measured (non-vacuous)
    expect(res.unconvergedCount).toBe(0);                    // every gated triangle was PROVEN
    expect(res.maxCertifiesAtMm).toBeLessThanOrEqual(0.01);  // rigorous MAX bound ≤ the standard
    expect(res.certified).toBe(true);
  }, 120_000);

  it('is non-vacuous: an under-resolved outer wall does NOT certify (the gate can fail)', () => {
    // Deliberately coarse: the interval prover cannot guarantee ≤0.01mm over these
    // large cells within the split budget, so the gate correctly REFUSES to certify.
    const coarse = {
      angularDivisionsLog2: 6,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 1, 'inner-wall': 1, 'top-rim': 1, 'bottom-top': 1, 'bottom-under': 1, 'drain-wall': 0,
      },
    } as const;
    const res = certifyOuterWallExact(GENTLE_GEOMETRY, GENTLE_PARAMS, 'HarmonicRipple', coarse, {
      tolMm: 0.01,
      splitBudget: 400,
      gatePatchIds: ['outer-wall'],
    });
    expect(res.maxCertifiesAtMm).toBeGreaterThan(0.01);
    expect(res.certified).toBe(false);
  }, 120_000);
});
