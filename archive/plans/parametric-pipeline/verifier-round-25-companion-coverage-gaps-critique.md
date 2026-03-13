# Verifier Round 25 — Critique of Generator's Companion Coverage Gap Proposals

Date: 2026-03-06

## Summary Verdict: ACCEPT WITH AMENDMENTS (P2 primary, P1 secondary — reject P3)

The Generator's root cause analysis is structurally correct but overstates the density cliff's severity. The recommended P2 (gap-fill) approach is sound but has a critical strip-boundary coverage hole and a performance anti-pattern. P1 (extended T-ring) is safe but less impactful than claimed because shell 3 already gets 2 T-levels from the main loop. P3 (boundary-seeded) has a fatal buffer allocation flaw. P4 is just P1+P2 and inherits their properties.

---

## Root Cause Analysis Verification

### V1 [NOTE]: T-ring shell cutoff location — OFF BY ONE LINE

**Generator's claim**: T-ring cutoff at `Math.min(3, nShells)` is at line 717.

**Actual code**: [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L716), line 716:
```typescript
for (let s = 0; s < Math.min(3, nShells); s++) {
```
**Verdict**: ✅ CONFIRMED (off-by-one in line reference, code is correct). The cutoff limits the T-ring loop to the inner 3 of 7 shells.

---

### V2 [WARNING]: Main loop nT computation overgeneralized

**Generator's claim**: "Shells 3-6 only get main-loop companions. The main loop at outer shells places just 1 companion (at T≈0.5)."

**Actual code** at [lines 736-737](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L736-L737):
```typescript
const nT = Math.max(1, Math.floor(density * (nShells - s) / (nShells * 2)));
```

With `density=8`, `nShells=7`:

| Shell | s | nT = max(1, floor(8 × (7-s) / 14)) | T-positions |
|-------|---|-------------------------------------|-------------|
| 0     | 0 | floor(4.0) = **4** | 0.20, 0.40, 0.60, 0.80 |
| 1     | 1 | floor(3.43) = **3** | 0.25, 0.50, 0.75 |
| 2     | 2 | floor(2.86) = **2** | 0.33, 0.67 |
| 3     | 3 | floor(2.29) = **2** | 0.33, 0.67 |
| 4     | 4 | floor(1.71) = **1** | 0.50 |
| 5     | 5 | floor(1.14) = **1** | 0.50 |
| 6     | 6 | floor(0.57) = **1** | 0.50 (but see note) |

**Counterexample**: Shell 3 gets nT=**2** (not 1). It receives companions at T=0.33 and T=0.67 — the same density as shell 2 which HAS the T-ring. The Generator's table shows this correctly, but the prose generalizes "Shells 3-6" when the cliff actually occurs at shell 4 (fraction 0.45).

**Impact**: The density cliff is at the **shell 3/4 boundary** (fraction 0.25→0.45, U-offset 1.0→1.8 columns), not the shell 2/3 boundary (0.16→0.25) as the prose suggests. This weakens the urgency of extending the T-ring: the most critical shells (3) already have adequate coverage from the main loop. The real gap begins at shell 4 (45% of strip half-width).

**Required fix**: Generator should correct the prose to say "Shells 4-6 get only 1 T-level." Shell 3 is adequately served.

---

### V3 [NOTE]: T-ring coverage percentage — CONFIRMED but misleadingly framed

**Generator's claim**: T-ring coverage is 16% of strip half-width.

**Verification**: SHELL_FRACTIONS[2] = 0.16. With expansion=4, strip half-width = 4 columns. T-ring reaches 0.64 columns from chain vertex. 0.16 × 100% = 16%.

**Verdict**: ✅ CONFIRMED. But as V2 shows, the effective "well-covered" zone extends to shell 3 (25% of strip half-width, 1.0 columns) since shell 3 gets nT=2 from the main loop. The "poorly covered" zone is 45-100% of strip half-width (shells 4-6), which is **55%** of the strip half-width, not 84% as the Generator implies.

---

## Proposal 1: Extended T-Ring Coverage

### V4 [NOTE]: Collision with main loop — NO ISSUE

**Concern**: Will extending T-ring to all shells cause collisions?

**Analysis at [OWT line 716-731](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L716-L731)**: T-ring emits at T-fractions [0.25, 0.50, 0.75]. Main loop emits at T = k/(nT+1). For shell 4 (nT=1): main loop T = 0.50. For shell 5 (nT=1): main loop T = 0.50. For shell 6 (nT=1): main loop T = 0.50. All collide with T-ring's T=0.50.

Dedup check via `isDuplicate2D()` at [lines 772-784](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L772-L784): threshold 1e-5, same (U,T) → deduped. T-ring runs FIRST (emits first), so the T-ring companion survives and the main loop companion is deduped.

For shell 3 (nT=2): main loop T = 0.33, 0.67. T-ring T = 0.25, 0.50, 0.75. No collision — all survive. Shell 3 would go from 2 companions to 2+3=5 companions per side.

**Verdict**: ✅ No collision. Dedup handles the overlap correctly. The T-ring emits first per Verifier C1 priority, so it gets budget priority.

---

### V5 [WARNING]: Companion count increase estimate — IMPRECISE

**Generator's claim**: ~8% increase (308K → 333K, +25K after dedup).

**My arithmetic**:
- Current T-ring: 3 fracs × 3 shells × 2 sides = 18 per (cv, band)
- Extended T-ring: 3 fracs × 7 shells × 2 sides = 42 per (cv, band)
- Delta: 24 per (cv, band)
- Per chain vertex: 2 bands × 24 = 48 additional
- Dedup from main loop collisions: shells 4-6 at T=0.50 overlap → 3 shells × 2 sides × 2 bands = 12 deduped
- Net per CV: ~36 additional
- With ~800 chain vertices: ~28.8K theoretical
- Cross-chain dedup (adjacent CVs' companion clouds overlap): probably removes ~30-50%
- Estimate: 15-20K actual increase → ~5-7%

The Generator's 8% is at the upper bound. Realistic range is **5-8%**, depending on chain density and overlap.

**Verdict**: Approximately correct. Not a blocking issue.

---

### V6 [NOTE]: Budget starvation — NOT AN ISSUE (Generator's concern is unfounded)

**Generator's concern**: With MAX_TRING doubled to 48, will the main loop be budget-starved?

**Code analysis at [line 748](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L748)**:
```typescript
if (emitted >= MAX_FAN_PER_BAND + MAX_TRING_PER_BAND) return;
```

The total budget is `MAX_FAN_PER_BAND + MAX_TRING_PER_BAND`. The T-ring is independently capped at `MAX_TRING_PER_BAND`. So:

| Scenario | T-ring uses | Total budget | Main loop remaining |
|----------|-------------|--------------|---------------------|
| Current  | ≤24         | 64           | ≥40 (= MAX_FAN)    |
| Extended | ≤48         | 88           | ≥40 (= MAX_FAN)    |

The main loop ALWAYS has at least `MAX_FAN_PER_BAND = 40` slots available regardless of T-ring budget changes. This is by design — the budgets are additive, not shared.

**Verdict**: ✅ No budget starvation. The architecture correctly reserves MAX_FAN_PER_BAND for the main loop.

### P1 Overall Verdict: ACCEPT

Simple 2-line change. Safe. Provides moderate improvement at shells 4-6. But impact is less dramatic than the Generator suggests because:
1. Shell 3 already has nT=2 (the cliff is at shell 4, not shell 3)
2. The main benefit is adding T=0.25 and T=0.75 companions at shells 4-6, which currently only have T=0.50

**One edge case to note**: Shell 6 (fraction=1.0) places companions AT the strip boundary. These companions overlap with grid boundary vertex positions but are at interior T-levels (0.25, 0.50, 0.75), so they create valid interior points at the strip edges. This is actually beneficial — it puts interior coverage right where the boundary slivers form.

---

## Proposal 2: Band-Wide Gap-Fill Companions (RECOMMENDED)

### V7 [NOTE]: interiorByBand collection — CONFIRMED CORRECT

**Generator's claim**: Gap-fill companions will be collected by `interiorByBand`.

**Verification at [OWT lines 638-648](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L638-L648)**:
```typescript
companionVertices.push({
    u: cu,
    t: ct,          // ← explicit t IS set
    rowIdx: parent.rowIdx,
    vertexIdx: nextVertexIdx++,
    chainId: parent.chainId,
    pointIdx: -1,
});
```

`interiorByBand` collection at [lines 836-844](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L836-L844) checks `cv.t !== undefined` and uses `bsearchFloor(activeTPositions, cv.t)` for band assignment. Gap-fill companions have `t: ct` set, so they WILL be collected.

**Sequencing**: Gap-fill runs AFTER the main companion loop but BEFORE `allChainVertices` construction and `interiorByBand` building. The gap-fill pushes to `companionVertices`, then `allChainVertices = [...chainVertices, ...companionVertices]` captures them, and `interiorByBand` iterates `allChainVertices`. The pipeline order is correct.

**Verdict**: ✅ CONFIRMED. No sequencing issue.

---

### V8 [CRITICAL]: Strip boundary coverage gap — REAL AND SIGNIFICANT

**Generator's acknowledgment** (Open Question 3): "The gap scan only finds gaps BETWEEN existing companions. What about the gap from strip-left-boundary to first companion, and from last companion to strip-right-boundary?"

**Analysis**: The revised gap-fill code scans `uList[k]` to `uList[k+1]` for gaps. It does NOT check:
- Gap from the CDT segment's left boundary to `uList[0]`
- Gap from `uList[uList.length-1]` to the CDT segment's right boundary

**Why this matters**: The user's "purely horizontal lines" are most severe at the strip EDGES, where the companion cloud ends and only grid boundary vertices remain. The gap between the outermost companion (shell 6, fraction=1.0) and actual CDT segment boundary might be small (fraction=1.0 means strip edge), but for multi-chain segments or segments where the chain vertex is off-center, the boundary gap could be significant.

**Counterexample**: A chain vertex at column 100 with expansion=4 has strip [96, 105]. Its outermost companion (shell 6) is at column 96 (left) and column 105 (right) — exactly at the boundary. In this case, there's NO boundary gap. **But**: if a second chain passes through the SAME band at column 110 with its own strip [106, 115], the merged segment spans [96, 115]. The companions from chain 1 cover [96, 105] and from chain 2 cover [106, 115]. The gap between column 105 and 106 might be covered by overlapping companion clouds, or it might not. The gap-fill WOULD catch this gap since it's between consecutive companions. So this specific case IS handled.

**More problematic case**: Consider a band where `compByBand` has companions, but they're all clustered on one side. The gap from the cluster to the opposite boundary isn't covered. However, the companion cloud from `emitUGradedFan` extends to shell 6 (fraction=1.0) on BOTH sides, so unless dedup or constraint guard removes the outermost companions, the boundary should be covered.

**Revised assessment**: The strip-boundary gap is less critical than initially feared, because shell 6 (fraction=1.0) already places companions at the strip boundary. The gap-fill's true value is filling gaps between adjacent chain vertices' companion clouds WITHIN the strip, not at strip edges. Still, the Generator should add a boundary sentinel scan for robustness.

**Required amendment**: Add strip boundary U-positions as sentinels:
```typescript
// Add strip boundary sentinels
const uMin = Math.min(...uList);
const uMax = Math.max(...uList);
// The gap from uMin to first companion and from last companion to uMax
// is already bounded by shell 6 placement — but verify with a leftmost/rightmost check.
```

**Severity downgrade**: CRITICAL → WARNING. The actual impact is smaller than feared, but the code should be robust.

---

### V9 [NOTE]: FILL_GAP_THRESHOLD calibration — REASONABLE but edge-case-fragile

**Generator's claim**: `FILL_GAP_THRESHOLD = 3.0/numU ≈ 0.0044`.

**Verification**: With numU≈685: `3.0/685 ≈ 0.00438`.

**Analysis of typical gaps within a single chain vertex's companion cloud**:
- Shell 3 (fraction=0.25, U-offset=0.0015) to Shell 4 (fraction=0.45, U-offset=0.0026): gap = 0.0011
- Shell 4 to Shell 5 (fraction=0.72, U-offset=0.0042): gap = 0.0016
- Shell 5 to Shell 6 (fraction=1.0, U-offset=0.0058): gap = 0.0016

All intra-cloud gaps are < 0.0044. The gap-fill won't trigger within a single chain vertex's cloud. ✅ This is correct — we don't want to over-density within existing clouds.

**Inter-cloud gap** (between adjacent chain vertices in the same band): Depends on chain vertex spacing. If two chain vertices are 5 columns apart (U-difference ≈ 0.0073), and each has shell 6 companions extending 4 columns, the gap between their outermost companions is 5 - 2×4 = -3 columns (overlapping). If 10 columns apart: 10 - 8 = 2 columns gap ≈ 0.0029 U → below threshold. If 12+ columns apart: gap ≥ 0.006 U → above threshold, gap-fill triggers.

So the threshold captures inter-cloud gaps when chain vertices are >~10 columns apart. This seems reasonable.

**Edge case**: In very sparse chain regions (chain vertices far apart), the gap might be enormous (0.1+ U-units). The gap-fill would emit `floor(0.1/0.0044) - 1 ≈ 22` companions × 2 T-levels = 44 companions per band. With 400+ bands, this could produce 18K+ companions — much more than the Generator's "1.8-2.4K" estimate. The estimate assumes 2-4 gaps per band, but sparse chains could produce many more.

**Verdict**: The threshold value is calibrated correctly for the common case. The total count estimate is optimistic for sparse-chain styles.

---

### V10 [WARNING]: O(n) parentCV find — PERFORMANCE ANTI-PATTERN

**Generator's code**:
```typescript
const parentCV = chainVertices.find(
    cv => cv.rowIdx === bandIdx || cv.rowIdx === bandIdx + 1
) ?? chainVertices[0];
```

**Analysis**: `chainVertices` has ~5000 elements. This `find` is O(5000) per gap-fill companion. With ~2000 gap-fill companions: ~10M comparisons. With the V9 edge case (18K sparse companions): ~90M comparisons.

**Impact**: In a pipeline that generates 308K companions, the companion generation phase is probably ~200-500ms. An extra 10-90M linear scans could add 50-500ms. Not catastrophic but easily avoided.

**Required amendment**: Pre-build a band→chainVertex lookup before the gap-fill loop:
```typescript
const cvByBand = new Map<number, ChainVertex>();
for (const cv of chainVertices) {
    if (!cvByBand.has(cv.rowIdx)) cvByBand.set(cv.rowIdx, cv);
}
// Then: const parentCV = cvByBand.get(bandIdx) ?? cvByBand.get(bandIdx + 1) ?? chainVertices[0];
```

**Severity**: WARNING. Won't cause crashes, but needlessly quadratic.

---

### P2 Additional Finding: T=0.33/0.67 vs T=0.25/0.75 — CONFIRMED CORRECT

**Generator's claim**: T=0.33/0.67 creates 3 equal strata ([0, 0.33], [0.33, 0.67], [0.67, 1.0]) vs T=0.25/0.75 creating thin outer bands ([0, 0.25] and [0.75, 1.0]).

**Verdict**: ✅ Geometrically correct. Equal stratification produces better worst-case aspect ratios.

---

### P2 Overall Verdict: ACCEPT WITH AMENDMENTS

The gap-fill approach is sound and correctly targets the root cause. Two amendments required:
1. **A1 [WARNING]**: Replace O(n) `chainVertices.find(...)` with pre-built band lookup map
2. **A2 [NOTE]**: Consider adding strip-boundary sentinels to the gap scan (though shell 6 placement makes this less critical)

---

## Proposal 3: Boundary-Vertex-Seeded Interior Points

### V11 [CRITICAL]: Vertex buffer is FIXED-SIZE — FATAL FLAW

**Generator's concern**: "Vertex buffer pre-allocation: the vertex buffer is sized before strips are processed."

**Verification at [OWT line 915](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L915)**:
```typescript
const vertices = new Float32Array((totalVertexCount + rowBoundaryCvCount + totalShadowCount) * 3);
```

This allocates exactly `(gridVertexCount + allChainVertices.length + rowBoundaryCvCount + totalShadowCount) * 3` floats. The buffer is a typed array — writes beyond its length are **silently ignored** in JavaScript (`Float32Array` out-of-bounds index assignment is a no-op).

P3 proposes adding vertices during the CDT building loop (after line ~1400) via:
```typescript
const seedIdx = nextVertexIdx++;
vertices[seedIdx * 3] = sv.u;
```

If `seedIdx * 3` exceeds the buffer length, the vertex data (u, t, surfaceId) is silently dropped. The CDT would reference an index whose coordinates remain at their default (0, 0, 0) — producing degenerate geometry at the origin.

**Counterexample**: With ~750 seeded vertices (Generator's estimate) × 3 floats = 2250 additional floats needed. The buffer has no slack for these. Every seeded vertex beyond the buffer boundary becomes a zero-vertex.

**The Generator identifies this but proposes no concrete solution.** Possible mitigations:
1. Pre-scan boundary vertices in all CDT segments to count seeds → add to allocation. This doubles the CDT loop (first to count, second to build). Complex.
2. Over-allocate with generous padding. Fragile — violates size guarantees.
3. Emit seeds during companion generation instead (move to earlier phase). This would require knowing which boundary vertices lack nearby companions before strips are built — a chicken-and-egg problem.

**Verdict**: ❌ REJECT. This is a fatal flaw with no clean solution within the proposal's architecture.

---

### V12 [NOTE]: T-junction risk — LOW

**Generator's concern**: Seeded vertices might create T-junctions between adjacent bands.

**Analysis**: Seeded companions are interior to each band (at T=0.5 of the band). Adjacent bands share only the common boundary row. Each band independently decides which seeds to place. If band j seeds a companion at (U=0.3, T=tMid_j) and band j+1 does NOT seed at (U=0.3, T=tMid_{j+1}), the shared boundary vertex at (U=0.3, tRow) is unaffected — it's on the boundary, not created by seeding.

**Verdict**: ✅ No T-junction risk. The concern is unfounded.

### P3 Overall Verdict: ❌ REJECT

Fatal buffer allocation flaw (V11). The concept is the most targeted of the three proposals but the implementation requires vertex buffer architecture changes that are outside the scope of a companion coverage fix.

---

## Proposal 4: Combined P1 + P2

**Verdict**: Inherits P1 ACCEPT and P2 ACCEPT WITH AMENDMENTS. If both are applied: ACCEPT WITH AMENDMENTS (same amendments as P2).

---

## V13: Does Any Proposal Address the User's Observation?

**User's statement**: "Purely horizontal lines running from the base mesh to the feature edges."

**Interpretation**: In the CDT's (U, T) coordinate space, "horizontal" means constant-T edges. These occur when the CDT connects two vertices at nearly the same T-position but separated in U. The scenario:

1. A grid boundary vertex at (U_grid, T=tBot) — part of the "base mesh"
2. A chain companion at (U_companion, T=0.25×tGap + tBot) — near the "feature edge"
3. The edge between them: ΔU = |U_grid - U_companion| >> ΔT = 0.25×tGap ≈ 0.0006

When companion coverage is poor (shells 4-6 with only T=0.5), the CDT connects boundary vertices to distant companions via nearly-horizontal long edges. In regions with NO interior companions at all, the CDT creates degenerate full-band-spanning triangles from boundary vertices only.

**Assessment per proposal**:

| Proposal | Addresses "horizontal lines"? | Mechanism |
|----------|------------------------------|-----------|
| P1       | **Partially**. Extends T-ring to shells 4-6, adding T=0.25/0.75 at those shells. Creates interior vertices at the positions where horizontal edges currently form. But ONLY near existing chain vertices — gaps between chain vertices remain. | New interior vertices break horizontal long edges into shorter sub-edges |
| P2       | **Yes**. Fills companion-free U-gaps with T=0.33/0.67 companions at regular intervals. Regardless of chain vertex placement, every band segment gets interior coverage. | Gap-driven fill ensures no CDT region is companion-free |
| P3       | **Most directly**, but REJECTED on implementation grounds. Places companions at exact boundary vertex U-positions. | One-to-one targeting of every problematic boundary vertex |
| P4       | **Yes** (P1+P2 combined). | Both mechanisms active |

**Overall**: P2 is the most effective implementable fix. P1 provides supplementary benefit. The combination (P4) is the most thorough, but P2 alone should reduce violations substantially.

---

## Answers to Generator's Open Questions

### OQ1: interiorByBand sequencing
**Answer**: ✅ Confirmed correct. `tryEmitCompanion` sets `t: ct` explicitly. Gap-fill companions will be collected by `interiorByBand` via `bsearchFloor(activeTPositions, cv.t)`. The pipeline ordering (gap-fill → allChainVertices → interiorByBand) is correct.

### OQ2: Parent rowIdx for interiorByBand bucketing
**Answer**: ✅ Confirmed. `interiorByBand` uses `bsearchFloor(activeTPositions, cv.t)`, NOT `cv.rowIdx`. Since gap-fill companions have `ct` within the band (strictly between `tLo` and `tHi`), they will be bucketed correctly regardless of `parent.rowIdx`. The `rowIdx` field on gap-fill companions is semantically incorrect (it's the parent's row, not the companion's row) but functionally harmless because nothing in the CDT pipeline uses `rowIdx` for companions with explicit `t`.

### OQ3: Strip boundary coverage
**Answer**: Partially addressed above (V8). Shell 6 (fraction=1.0) places companions at the strip boundary, so the gap from outermost companion to strip edge is typically zero. The concern is more relevant for multi-chain bands where inter-cloud gaps are the issue — and the gap-fill DOES scan those. **Recommendation**: Add boundary sentinels for robustness but don't consider it blocking.

### OQ4: Multiple chain vertices per band
**Answer**: ✅ P2 handles this correctly. The gap scan is global across the band (all companions bucketed together), so inter-chain gaps are scanned just like intra-chain gaps. P1 does NOT address inter-chain gaps because it's per-chain-vertex. This is a point in favor of the P2-first strategy.

### OQ5: Simple quad bands
**Answer**: ✅ Correct — simple quad bands (no chains) use 2-triangle quad cells, not CDT. Their aspect ratio is determined purely by grid cell dimensions (U-spacing / T-spacing). If the 50.4% violation rate includes quad-band triangles, the companion proposals won't help those. The Generator correctly notes the problem statement says "chain strip triangles" specifically. **Recommendation**: Verify diagnostics exclude quad-band triangles from the violation count.

### OQ6: Budget interaction
**Answer**: ✅ No issue (see V6 above). The main loop always has `MAX_FAN_PER_BAND` budget regardless of T-ring budget. The budgets are additive (total = FAN + TRING), with FAN reserved for the main loop. Doubling TRING to 48 increases the total cap to 88 but leaves FAN untouched at 40.

---

## Verdicts Summary

| ID | Claim | Severity | Verdict | Evidence |
|----|-------|----------|---------|----------|
| V1 | T-ring cutoff at line 717 | NOTE | ✅ Off by 1 line (actually line 716) | OWT line 716 |
| V2 | Shells 3-6 get only 1 main loop T-level | WARNING | ⚠️ Shell 3 gets nT=2, not 1. Cliff at shell 4, not 3 | nT formula with density=8 |
| V3 | T-ring coverage = 16% of strip half-width | NOTE | ✅ Correct but misleading — effective coverage is 25% counting shell 3 | SHELL_FRACTIONS[2] = 0.16 |
| V4 | T-ring extension causes collisions | NOTE | ✅ No issue — dedup handles overlaps at T=0.50 | isDuplicate2D threshold 1e-5 |
| V5 | ~8% companion increase from P1 | WARNING | ⚠️ Reasonable but imprecise — realistic range 5-8% | Arithmetic verified |
| V6 | P1 budget starvation | NOTE | ✅ No issue — main loop retains full MAX_FAN budget | Budget math: 88 - 48 = 40 = MAX_FAN |
| V7 | Gap-fill companions collected by interiorByBand | NOTE | ✅ Confirmed — t: ct is set, bsearchFloor-based bucketing works | tryEmitCompanion at line 638 |
| V8 | Strip boundary coverage gap | WARNING | ⚠️ Real but less severe than feared — shell 6 covers strip edges | Shell 6 fraction=1.0 |
| V9 | FILL_GAP_THRESHOLD calibration | NOTE | ✅ Correct for common case, total count estimate optimistic for sparse chains | 3/685 ≈ 0.0044 vs shell gaps |
| V10 | O(n) parentCV find performance | WARNING | ⚠️ Unnecessary O(n) per companion — should pre-build lookup | chainVertices.find() is O(5000) |
| V11 | P3 vertex buffer pre-allocation | CRITICAL | ❌ Fatal — Float32Array is fixed-size, silent overflow | OWT line 915 allocation |
| V12 | P3 T-junction risk | NOTE | ✅ No risk — seeds are band-interior | Shared boundary unaffected |
| V13 | User observation addressed | NOTE | ✅ P2 most effective implementable fix | See analysis above |

---

## Overall Recommendation

### Implementation Order

1. **P2 (Gap-Fill)** — primary fix, with amendments A1 and A2
2. **P1 (Extended T-Ring)** — secondary, apply if P2 alone doesn't bring violations below 25%
3. **P3** — ❌ REJECTED (V11 fatal flaw)

### Implementation Conditions for the Executioner

**For P2**:
1. Implement `emitGapFillCompanions()` after the main companion loop (line ~828) and before `allChainVertices` construction (line ~829)
2. **Amendment A1**: Replace `chainVertices.find(...)` with pre-built `Map<number, ChainVertex>` keyed by rowIdx
3. **Amendment A2**: Consider adding strip-boundary sentinels (low priority — shell 6 already covers edges)
4. Use FILL_T_FRACTIONS = [0.33, 0.67] (confirmed optimal)
5. Use FILL_GAP_THRESHOLD = 3.0/numU (confirmed appropriate)

**For P1** (if applied):
1. Change `Math.min(3, nShells)` to `nShells` at line 716
2. Change `MAX_TRING_PER_BAND = 24` to `MAX_TRING_PER_BAND = 48` at line 582
3. No other changes needed

**Validation Protocol**:
- Run export with default style (8-petal)
- Check chain-strip sliver violation rate (target: <25%)
- Check total companion count (expect +2-4K for P2 alone, +15-25K if P1 added)
- Check total triangle count (should not increase significantly)
- Visual inspection: confirm absence of horizontal lines from grid to chains
- Performance: export time should not increase by more than 10%

---

*Verifier signing off. The Generator's analysis was thorough and well-documented. The root cause identification is correct in substance — the density cliff at outer shells IS the mechanism behind companion-free gaps. The V2 overgeneralization (shell 3 included in "poorly covered" shells) is a prose issue, not a conceptual error. P2 is the right recommendation. P3 was creative but hit a fundamental architecture constraint. The Executioner should implement P2 first and measure before adding P1.*
