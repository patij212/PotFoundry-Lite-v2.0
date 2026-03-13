# Master Approval — R26 CDT Expansion Reduction
Date: 2026-03-06

## Decision: APPROVED (Option A — P1 only)

## Unanimous Agreement Status
- Generator: Proposed P5 hybrid (P1 + P2); P1 validated as independent proposal
- Verifier: **ACCEPTED P1 unconditionally**; REJECTED P2/P5 as stated (3 CRITICAL math errors)
- Executioner: Dispatched for P1 implementation (one-constant change)
- Master: **APPROVED** — P1 alone, Option A

## Rationale

Three rounds of companion-density approaches have all failed:

| Round | Strategy | Violations | Outcome |
|-------|----------|-----------|---------|
| R24.1 | Independent CDT normalization | 54.2% (was 50.4%) | REVERTED |
| R25 P1 | Extend T-ring to all 7 shells | 63.1% (was 50.4%) | REVERTED |
| R25 P2 | Gap-fill companions | 63.1% (combined) | REVERTED |

**Root cause identified**: The CDT segment domain has an inherent 5.8:1 aspect ratio (9 columns wide × 1 band tall with expansion=4). The Delaunay criterion in this wide domain FORCES horizontally-elongated triangles. No companion manipulation can fix this — it's domain geometry, not point density.

**P1 (expansion=2) directly attacks the root cause:**
- CDT segment width: 9 cols → 5 cols
- Domain aspect ratio: 5.8:1 → 3.2:1
- CDT domain height (normalized): 0.17 → 0.31
- One constant change, trivially reversible

**Why P2/P5 are deferred (not killed):**
- Verifier found `positions3D` unavailable at CDT time (GPU eval runs after)
- Metric formula inverted (metricRatio instead of 1/metricRatio)
- Correct isotropic scaling paradoxically makes domain WORSE (18:1)
- Heuristic √metricRatio compromise may have merit but needs P1 baseline first

## Conditions

1. **Change ONLY** `expansion: 4` → `expansion: 2` at ChainStripTriangulator.ts line 47
2. **No other changes** — no companion adjustments, no normalization changes
3. Run full test suite (`npx vitest run`)
4. If tests fail due to threshold recalibration (not genuine regressions), adjust thresholds with documentation
5. User validates with export: target violations < 35%, manifold = true

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Some tests fail | Medium | Threshold recalibration, not regressions |
| Violation rate doesn't improve enough | Medium | Follow up with Option B (heuristic T-inflation) |
| CDT←→quad boundary artifacts | Low | Fewer `colHasChain` cells = smoother transitions |
| Companion coverage too narrow | Low | Shell fractions proportional; inner companions preserved |

**Blast radius**: Minimal — one constant, one file.
**Rollback**: Trivial — change `2` back to `4`.

## Implementation Order

1. Change `expansion: 4` → `expansion: 2` (ChainStripTriangulator.ts line 47)
2. Run `npx vitest run` — expect all pass
3. Report for user export validation

## Follow-up Path (if P1 insufficient)

If violations remain > 35% after P1:
1. Add heuristic T-inflation with `√metricRatio ≈ 1.77` (Verifier's recommended formula)
2. Plumb `H` through `PotGeometryParams` → `cdtTriangulateStrip`
3. Make inflation factor configurable in `ChainStripConfig`
4. This is Option B — requires a new G/V cycle with corrected math
