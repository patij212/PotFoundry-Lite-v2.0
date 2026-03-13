# Master Approval — R24.1 Independent CDT Normalization
Date: 2026-03-06

## Decision: APPROVED

## Unanimous Agreement Status
- Generator: Proposed single-line normalization change with comprehensive downstream analysis
- Verifier: ACCEPTED WITH AMENDMENTS (A1: test rename — implemented)
- Executioner: Implemented with zero deviations, all targeted tests pass
- Master: APPROVED — independently verified code changes and test results

## Rationale

The root cause of persistent 50.4% aspect ratio violations after R24 was identified: the CDT normalization used `scale = Math.max(uRange, tRange)`, preserving the band's 5.65:1 elongated aspect ratio in CDT space. This caused the Delaunay criterion to create wide horizontal triangles — the very slivers we've been fighting.

Independent normalization (`u/uRange`, `t/tRange`) maps both axes to [0,1], making the CDT operate in an isotropic domain. The Delaunay criterion now optimizes for balanced triangles regardless of band geometry. This is the correct behavior: the CDT should determine optimal connectivity, not replicate the physical elongation.

The math is clean:
- Cross product sign preserved (both scale factors positive)
- Constraint edges unaffected (index-based, not coordinate-based)
- Centroid filter *improved* (T-axis bounds now tight at [0,1] instead of loose at [0,0.177])
- cdt2d robust predicates are scale-invariant by construction

## Changes Implemented

| File | Change |
|------|--------|
| `ChainStripTriangulator.ts` L160-162 | Comment: "uniform scale" → "independent per-axis normalization" |
| `ChainStripTriangulator.ts` L168 | Deleted: `const scale = Math.max(uRange, tRange);` |
| `ChainStripTriangulator.ts` L175 | Changed: `/ scale` → `/ uRange` and `/ tRange` |
| `ChainStripTriangulator.test.ts` L395 | Test renamed per Verifier A1 |
| `ChainStripTriangulator.test.ts` L396-399 | Comments updated to describe independent normalization |

## Test Results

- Targeted: 21/21 passed (ChainStripTriangulator.test.ts)
- Full suite: 1895/1909 passed, 13 skipped, 2 failed (pre-existing: meshDecimator timeout, fidelity integration import)
- Zero regressions from R24.1

## Risk Assessment

**Blast radius**: LOW. The change is confined to one function (`cdtTriangulateStrip`) in one file. CDT coordinates never escape the function — downstream code uses physical UV from the vertex buffer.

**Rollback plan**: Revert the three lines in ChainStripTriangulator.ts and two lines in the test file.

**Remaining unknowns**: The violation rate prediction (50.4% → 15-25%) needs validation via a full export run. If violations remain above 30%, companion fraction adjustment ([0.25, 0.50, 0.75] → [0.33, 0.67]) is the next lever.

## Next Steps

User should run a visual export test to measure actual metrics. Key targets:
- violations(>4:1): < 30% (currently 50.4%)
- maxAspect3D: < 1000 (currently 3,350)
- No visible sliver artifacts in preview/export

---

*Signed: The Master, 2026-03-06*
