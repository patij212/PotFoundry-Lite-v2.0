# Verifier Round 7.1 — Final Verdict: Crossing Constraint Filter

Date: 2026-01-06

## Summary Verdict: ACCEPT

The P5 crossing constraint filter implementation is **correct, well-placed, and should be effective**. All critical code paths have been verified against the actual source.

---

## Verification Evidence

### V1: Placement — VERIFIED ✅
**Claim**: Filter runs after endpoint injection and before `triangulateChainStrip`.
**Evidence**: The pipeline order in OWT (L1020–L1158):
1. L1028–1038: Batch 2 remap of constraint endpoints
2. L1042–1061: Endpoint injection (Sub-problem B fix) + sort
3. **L1064–1140: P5 crossing filter** ← HERE
4. L1142–1147: Companion vertex collection
5. L1149–1158: `triangulateChainStrip` call

Nothing between the filter and CDT call can re-add removed edges.

### V2: UV Resolution — VERIFIED ✅
**Claim**: `getUV()` returns correct (u, t) coordinates.
**Evidence**: `vertices` array stores `(u, t, surfaceId)` per vertex:
- Grid: L646–651 writes `unionU[i], activeTPositions[j], surfaceId`
- Chain: L654–657 writes `cv.u, cv.t ?? activeTPositions[cv.rowIdx], surfaceId`
- `getUV` (L1075–1083) reads `vertices[vIdx * 3]` (=u) and `vertices[vIdx * 3 + 1]` (=t) for grid; `cv.u, cv.t ?? ...` for chain — consistent.

### V3: Crossing Detection — VERIFIED ✅
**Claim**: `segmentsCross()` correctly detects proper segment crossings.
**Evidence**: L132–157 uses standard orientation-test method:
- Cross product `(b-a)×(c-a)` for 4 orientations (d1–d4)
- Strict inequality (`d1 * d2 < 0 && d3 * d4 < 0`) — proper crossings only, no endpoint touching or collinear cases
- This is the textbook algorithm (Cormen et al., CLRS Chapter 33)

### V4: Confidence Scoring — VERIFIED ✅ (with NOTE)
**Claim**: Higher-confidence edges are preferentially kept.
**Evidence**: `edgeConfidence()` (L1085–1099):
- +2 per detected endpoint (`cv.pointIdx >= 0`), max +4
- Tiebreaker: UV edge length via `Math.hypot(deltaU, deltaT_normalized)`
- Grid vertex endpoints score 0 (conservative)
**NOTE N1**: The "longer = more important" tiebreaker is a heuristic. When both edges have identical detection scores (common case), the longer edge survives. This is reasonable but not provably optimal. However, ANY removal is strictly better than feeding crossing constraints to cdt2d, so the scoring is adequate.

### V5: Removal Logic — VERIFIED ✅
**Claim**: The O(n²) loop correctly removes all crossings.
**Evidence**: L1101–1126:
- When `ci` is removed (`confA <= confB`), the `break` exits the inner loop — correct, no further comparisons needed for a removed edge
- When `cj` is removed, the inner loop continues — `ci` may cross additional edges
- Transitivity: if A crosses B and B crosses C, removing A in the outer loop still allows B-vs-C to be checked in a later outer iteration
- All-crossing scenario (4 edges pairwise crossing): algorithm reduces to 1 survivor — verified by manual trace

### V6: Array Rebuild — VERIFIED ✅
**Evidence**: L1128–1135 rebuilds `segConstraints` in-place using `length = 0; push(...kept)`, preserving reference identity for downstream consumers.

### V7: Performance — VERIFIED ✅
O(n²) where n = constraints per strip ≈ 20 (one per chain). ~400 iterations/strip × ~400 strips = ~160K comparisons total. Each comparison involves 8 array lookups + 4 multiplications. Negligible.

### V8: Diagnostic Logging — VERIFIED ✅
**Evidence**: L1342–1344 logs `Crossing constraints removed: ${crossingConstraintsRemoved}` when count > 0. Counter accumulated across all strips (L683, L1131).

---

## NOTEs (Observations, Not Blockers)

### N1: Tiebreaker Heuristic
The UV-length tiebreaker favoring longer edges is reasonable but arbitrary when detection scores tie. In the rare case where the "longer" edge is actually the more aberrant one, the wrong edge gets removed. Impact: localized mesh distortion in one strip, not catastrophic.

### N2: No Chain Continuity Check
Removing a constraint disconnects that chain edge. Since constraints are per-strip (one edge per chain per strip), this cannot disconnect a chain globally — it only means one strip lacks that chain's constraint. CDT still produces a valid triangulation; the feature edge just won't be enforced in that strip.

### N3: Seam Handling
Chain edges near the seam (U ≈ 0 or U ≈ 1) use raw UV coordinates. Crossing detection works correctly in raw UV space since the CDT input uses the same parameterization. No special seam handling needed.

---

## Implementation Conditions for Export Test

1. Run export with same settings: chainStrip=cdt/d12/e4/rtrue
2. Monitor new diagnostic: `Crossing constraints removed: N`
3. Expected improvements:
   - Missing edges (total): 451 → significantly fewer
   - Missing edges (primary): 312 → significantly fewer
   - maxAspect UV: 30.8M:1 → reduced (crossings cause degenerate triangles)
   - Inverted triangles: 135K → reduced
4. If `Crossing constraints removed: 0`, the crossings may be at a different pipeline stage — escalate to diagnostic Round 8

---

## Cumulative Implementation Status

| Round | Change | Status |
|-------|--------|--------|
| R6 | Companion cap + guard zone | ✅ Verified, exported |
| R7 | SG smoothing (halfWidth=8, 2-pass, mirror) | ✅ Verified, exported |
| R7.1 | Crossing constraint filter (P5) | ✅ Verified, READY FOR EXPORT |
