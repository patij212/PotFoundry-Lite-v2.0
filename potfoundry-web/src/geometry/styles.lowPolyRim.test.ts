// styles.lowPolyRim.test.ts — E-2026-07-22-LOWPOLY-GRID-CLOSE, BLOCKER A (rim floor() off-by-one).
//
// The LowPolyFacet rim floor() bug (DragonScales-rim-bug class): rOuterLowPolyFacet computed
// tierIdx = floor(t·tiersN); at the exact rim t=1 that jumps 0→1 (tiers=1) / N-1→N (tiers=N),
// phase-shifting the facet pattern by one jitter sector and stepping the radius ~1.124mm in the top
// vertex row of EVERY LowPoly pot (live preview AND export). The targetSolid layered target
// (lowPolyFacetLayeredOuterWallTarget.ts) already encodes the CORRECTED semantics: "the last real
// tier is extended to v=1; the zero-height extra tier selected by floor(t*tiers) at the exact rim is
// an implementation defect." The fix pins tierIdx = min(floor(t·tiersN), tiersN−1) so the rim
// continues the last real tier — matching the target.
//
// z enters rOuterLowPolyFacet ONLY through t = z/H (the tier index) — every other term is a function
// of (theta, r0, opts) — so FREEZING r0 across the two z samples isolates the pure tier-phase step
// (the bug) from the legitimate r0(z) taper difference (~2.7e-5mm), which is what the real mesh's
// adjacent rim rows also carry and is NOT the defect.
import { describe, it, expect } from 'vitest';
import { rOuterLowPolyFacet } from './styles';
import { DEFAULT_STYLE_PARAMS, type StyleOptions } from './types';

const TAU = 2 * Math.PI;
const H = 120; // production-scale height (OD140/H120)
const R0 = 59; // frozen representative base radius; isolates the tier-phase step from r0(z)

/** Worst |r(θ,H) − r(θ,H⁻)| over a fine θ sweep at FROZEN r0 = the pure tier-phase rim step. */
function maxRimStep(opts: StyleOptions): number {
  let m = 0;
  for (let i = 0; i < 2400; i++) {
    const th = (i / 2400) * TAU;
    const rRim = rOuterLowPolyFacet(th, H, R0, H, opts);
    const rBelow = rOuterLowPolyFacet(th, H * (1 - 1e-6), R0, H, opts);
    m = Math.max(m, Math.abs(rRim - rBelow));
  }
  return m;
}

describe('rOuterLowPolyFacet rim floor() fix (Blocker A)', () => {
  // Pre-fix this step is ~1.124mm (campaign scorecard diag|rimjump); the fix pins the rim to the
  // last real tier so the frozen-r0 step is exactly 0.
  it('default params (tiers=1): the top rim continues tier 0 — no ~1.124mm phase step', () => {
    const step = maxRimStep({ ...DEFAULT_STYLE_PARAMS.LowPolyFacet });
    expect(step).toBeLessThan(1e-6);
  });

  // Guards the clamp target: the rim must continue the LAST real tier (tiersN−1 = 3), NOT tier 0.
  // A clamp-to-0 fix would step here (rim tier 0 vs t=1⁻ tier 3); a correct clamp-to-(N−1) is
  // continuous.
  it('tiers=4: the rim clamps to the LAST real tier (N−1), continuous with t=1⁻', () => {
    const step = maxRimStep({ ...DEFAULT_STYLE_PARAMS.LowPolyFacet, lpTiers: 4 });
    expect(step).toBeLessThan(1e-6);
  });
});
