# Master Approval — R49 Chain Edge Accuracy (P4 + P1)

Date: 2026-03-09

## Decision: APPROVED

## Unanimous Agreement Status
- Generator: Proposed P4 (revert fan midpoints) + P1 (adaptive wide re-snap) as top priority
- Verifier: Accepted P4 + P1 with critical C7 amendment (two-stage re-snap for precision preservation)
- Executioner: Implemented both changes, confirmed feasibility — zero deviations from plan
- Master: Approved — validated implementation, tests, lint, typecheck all clean

## Rationale
After 5 rounds of post-processing fixes (R44–R48), diagnostic data revealed the true root cause of the 0.22mm average chain-to-ridge gap: the Step 3.5 GPU re-snap window (±0.000244 U) is 61× too narrow to correct chain-linking noise (up to ±0.008 U). The re-snap was designed for sub-sample refinement only, but chain errors are 32× larger than the window.

Two changes were approved:

**P4 — Revert R48 Fan Midpoint Insertion**: R48's fan midpoint insertion was counter-productive. Sliver rate increased from 37.1% to 47.0%, with 38,980 CSO rowSpan rejection (was 0). Mid-row T values defeated the CSO row-span guard entirely. The midpoints were correctly GPU-evaluated (Generator's C5 error noted by Verifier), but the CSO topology harm outweighed any geometric benefit.

**P1 — Two-Stage Adaptive Wide Re-Snap (with Verifier C7 amendment)**: Replaces the single-pass narrow re-snap with a two-stage approach:
- Stage 1: 64 candidates in adaptive window ±min(nearestSameKind/3, 0.005) U — finds approximate extremum
- Stage 2: 32 candidates in ±2/ROW_PROBE_SAMPLES around Stage 1 winner — parabolic refinement at original sub-sample precision

The C7 amendment was critical: without it, P1 would have traded 10× precision for 20× reach. The two-stage design preserves both.

## Conditions Met
- [x] Ridge diagnostic preserved (lines 2085-2185 untouched)
- [x] Two-stage re-snap implemented per C7 (Stage 1: 64 wide, Stage 2: 32 narrow)
- [x] Per-point adaptive halfwidth from `allRowTypedFeatures[row]` same-kind features
- [x] Seam-safe via `circularDistance` for U computations
- [x] Guard: `circularDistance(originalU, finalU) < hw` prevents overshooting
- [x] Diagnostic: tracks points where wide search found different extremum

## Risk Assessment
**Blast radius**: Low. Changes are confined to Step 3.5 (GPU re-snap) and the removed fan midpoint block. No changes to mesh topology, chain linking, tessellation, or other pipeline stages.

**Regression risk**: Minimal. P4 reverts to pre-R48 behavior (known-good). P1 is strictly additive — wider search + same-precision refinement. Tests confirm no regressions (1920/1923 pass, 3 pre-existing failures).

**Rollback plan**: Revert the two changes independently (P4 and P1 are orthogonal).

**Open items for future rounds**:
- P2 (chain-coherent DP): Awaiting Generator response on C11 (expectedDrift specification) and C12 (α sensitivity analysis)
- C2 (ridge diagnostic cross-feature contamination for m≥34): Needs a guard to prevent measuring against neighboring features
- Validation: Export on SuperformulaBlossom with diagnostic comparison needed to confirm actual ridge distance improvement

## Implementation Summary
| Change | Files Modified | Lines Changed |
|--------|---------------|---------------|
| P4: Revert fan midpoints | ParametricExportComputer.ts | ~150 lines removed |
| P4: Remove dead `triangleAspectRatio3D` | ParametricExportComputer.ts | ~30 lines removed |
| P4: Simplify constraint edge set | ParametricExportComputer.ts | ~10 lines simplified |
| P1: Two-stage adaptive re-snap | ParametricExportComputer.ts | ~120 lines replaced |

## Validation
- TypeScript: 0 errors in modified files
- ESLint: 0 warnings
- Tests: 88/90 files pass, 1920/1923 tests pass (3 pre-existing failures)
