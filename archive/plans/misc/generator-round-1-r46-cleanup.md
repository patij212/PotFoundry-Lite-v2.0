# Generator Round 1 — R46 Feature Edge Dip Algorithm Cleanup

Date: 2026-03-08

---

## Problem Statement

R45 fixed chain vertex data (meshChains now uses preSmoothChains, chain edges unblocked from phantom corridor protection) — the debug overlay is pixel-accurate. But STL mesh feature edges still dip out of alignment. The chain data is correct; the problem is in how downstream tessellation and optimization stages *consume* that data.

Five root causes were identified by the Master's investigation. This proposal addresses all five with minimal, surgical changes — algorithm cleanup, not rewrite.

---

## Root Cause Analysis

### Root Cause A — CSO Flips R41 chainFanQuad Diagonals (HIGH)

**File:** `ChainStripOptimizer.ts` L555-730, `OuterWallTessellator.ts` L340-385

The R41 `chainFanQuad` (OWT L347-378) deliberately places a deterministic diagonal in 2×2 sub-quads: `chain_bot ↔ grid_top`. This ensures consistent diagonal orientation across all row bands, preventing the visual zigzag of alternating diagonals.

**The problem:** These fan diagonals are chain↔grid edges (`chain_vertex ↔ grid_vertex`). They are NOT in `constraintEdgeSet`, which only contains chain↔chain edges (built from `outerChainEdges` via `buildConstraintEdgeSet` at CSO L321-328). All three CSO phases check `constraintEdgeSet.has(ek)` (L580, L653, L708) and skip constraint edges — but they freely flip non-constraint edges.

**Consequence:** CSO evaluates chainFanQuad diagonals against 3D quality criteria (min-angle, valence, short-diagonal). When flipping improves the quality metric even slightly, CSO flips the diagonal, undoing the deterministic alignment. Different rows may flip differently → visual dip/zigzag.

**Evidence path:** OWT `emitTriCCW(buf, subBot[0], subBot[1], subTop[0], verts)` at L349-350 creates the fan diagonal (subBot[1] is chain vertex, subTop[0] is grid vertex). This edge is NOT recorded in `chainEdges` (L802 only records chain↔chain pairs). Therefore it never enters `constraintEdgeSet`. Therefore CSO can flip it.

### Root Cause B — Linearly Interpolated Chain Vertices Are Off-Ridge (HIGH)

**File:** `OuterWallTessellator.ts` L736-785

When chain points span >1 grid row (a row was skipped during feature detection), OWT fills the gap with linearly interpolated vertices:

```typescript
const frac = s / steps;
let interpU = p0.u + du * frac;  // LINEAR interpolation
```

These vertices have `pointIdx = -1` (L780) — they are NOT GPU-detected features. For a ridge that curves in U-space, linear interpolation places these vertices off the actual ridge. The deviation is proportional to the curvature × gap size².

**Quantification:** For a typical 3-row gap with curvature ε = 0.002 radians across the gap, the midpoint error is `ε × rowSpan² / 8 ≈ 0.002 × 9 / 8 ≈ 0.00225` in U-space. At a 100mm diameter pot, that's ~0.35mm off the ridge — visible as a dip.

`interpolatedCount` is tracked (L704) but NEVER LOGGED (no `console.log` references it after L775). We're flying blind on how many vertices are affected.

### Root Cause C — sweepQuad Fallback Inconsistency (MEDIUM)

**File:** `OuterWallTessellator.ts` L209-256, L355, L378

When `constrainedSweepCell` can't use `chainFanQuad` (chain on both sides of sub-quad, or N×M sub-quad), it falls back to `sweepQuad`. The sweep's primary U-comparison (L231: `botNextU < topNextU - SWEEP_EPS`) with the R36 min-angle tie-break (L239-254) can produce different diagonal choices at different rows when chain U positions oscillate by even 0.001 across rows.

This was the original sawtooth root cause identified in the Verifier Round 40 review. chainFanQuad fixed the 2×2 single-chain-side case. The remaining cases that fall through to `sweepQuad` are rarer but still present when chains enter from both left and right boundaries.

### Root Cause D — Subdivision Midpoints at UV-Averaged Positions (LOW)

**File:** `MeshSubdivision.ts` L199-210

When `subdivideLongEdges` splits a chain edge, the midpoint UV is computed via `midpointWrappedU(u0, u1)` — a simple average with seam wrapping. The GPU then evaluates this UV to 3D, placing the point ON the surface.

However, the midpoint U is the *parametric average*, not the *ridge-following U*. For a chain edge between two ridge points where the ridge has local curvature, the midpoint U may be slightly off the true ridge path. The 3D position is on-surface but not on-ridge.

Impact is small because: (a) subcell-level deviations, (b) GPU evaluation puts the point on the mathematical surface, and (c) the ridge itself has width, so "near the ridge" is usually "close enough."

### Root Cause E — Missing Observability (DIAGNOSTIC)

1. `interpolatedCount` tracked at OWT L704, L775 but never logged
2. No counting of how many chainFanQuad diagonals exist vs how many CSO flips
3. No UV-deviation tracking between interpolated vertices and GPU-detected vertices
4. `chainDirectedFlip` (MeshOptimizer.ts L66) operates only on gridMap quads — its flip counts don't reflect chain-cell diagonal fate

---

## Proposals

### Proposal 1: Protect chainFanQuad Diagonals from CSO (Conservative) — ROOT CAUSE A

**Idea:** Add chainFanQuad diagonal edges to `constraintEdgeSet` so the CSO never flips them.

**Mechanism:**
1. In `constrainedSweepCell` (OWT L290), when emitting a `chainFanQuad` 2×2 sub-quad, record the fan diagonal edge in a new collector array: `fanDiagonalEdges`.
2. Pass `fanDiagonalEdges` out of OWT via `OuterWallResult`.
3. In the pipeline orchestrator (`ParametricExportComputer.ts`), add fan diagonal edges to `constraintEdgeSet` after `buildConstraintEdgeSet(outerChainEdges)`.

**Mathematical basis:** The fan diagonal is structurally necessary for consistent feature edge alignment. It connects a chain vertex (on the ridge) to a grid vertex (off the ridge). The CSO's quality optimization criteria (min-angle, valence) are local — they don't account for the *global* coherence requirement that all chain-adjacent diagonals must align consistently across rows.

**Files affected:**
- `OuterWallTessellator.ts` — Add `fanDiagonalEdges` collection in `constrainedSweepCell`, add to `OuterWallResult`
- `ParametricExportComputer.ts` — Merge `fanDiagonalEdges` into `constraintEdgeSet`
- `ChainStripOptimizer.ts` — No changes needed (already checks `constraintEdgeSet`)

**Trade-offs:**
- (+) Zero-risk to CSO logic — it already respects constraintEdgeSet perfectly
- (+) Minimal code: ~15 lines in OWT, ~5 lines in orchestrator
- (-) In subdivision, fan diagonal edges now get `chainSubdivThreshold2` (tightest) instead of the feature threshold. This means MORE splitting of these edges → more vertices near chains → slightly larger meshes but potentially better quality
- (-) CSO loses the ability to optimize these specific quads. Loss is bounded: each chain cell has at most 2 fan diagonals, and the fan orientation was chosen deterministically, so leaving them alone is correct behavior

**Assumptions (for Verifier to attack):**
1. The deterministic fan diagonal direction (chain_bot → grid_top) is always better than whatever the 3D quality criterion would choose
2. Adding fan diagonals to constraintEdgeSet has no unintended consequences in MeshSubdivision's chain-edge handling
3. The number of fan diagonal edges is small enough that bloating constraintEdgeSet doesn't cause performance issues
4. All chainFanQuad diagonals are emitted through `emitTriCCW`, which may swap winding — the diagonal edge remains the same regardless of winding swap

**Expected visual impact:** Eliminates row-to-row diagonal inconsistency in chain cells. Feature edges should become smooth curves instead of zigzagging between rows. This is the single highest-impact fix.

---

### Proposal 2: GPU Re-snap Interpolated Chain Vertices (Moderate) — ROOT CAUSE B

**Idea:** After OWT constructs chainVertices with linear interpolation for multi-row gaps, re-evaluate the interpolated vertices through the GPU to get ridge-accurate U positions.

**Mechanism:**
1. During OWT's chain vertex construction (L736-785), collect all vertices with `pointIdx = -1` into an `interpolatedVertices` list with their `(u, t, surfaceId)` coordinates.
2. After OWT completes and the GPU has evaluated all vertex positions to 3D, use the same GPU re-snap mechanism from Step 3.5 (parabolic refinement with 32 candidates) to find the true ridge U at each interpolated vertex's row.
3. Replace the interpolated U with the re-snapped U. Update the 3D position accordingly.

**Mathematical basis:** Linear interpolation of U between two GPU-detected chain points approximates the ridge path as a straight line in parameter space. For any ridge with nonzero curvature in parameter space, this produces an error proportional to `curvature × (Δrow)²`. GPU re-snapping evaluates the actual parametric surface and finds the local extremum (peak/valley) — the error is bounded by the re-snap precision (~±0.00006 U per the problem statement).

**Files affected:**
- `OuterWallTessellator.ts` — Export `interpolatedVertices` list with indices
- `ParametricExportComputer.ts` — After Step 6 GPU evaluation, run a re-snap pass on interpolated chain vertices (similar to Step 3.5)
- OR: Move interpolation responsibility out of OWT into a pre-tessellation interpolation-and-resnap step between Steps 3.6 and 4

**Trade-offs:**
- (+) Eliminates the largest source of off-ridge chain vertices
- (+) Reuses existing GPU re-snap infrastructure
- (-) Adds one more GPU dispatch (bounded: re-snaps only interpolated vertices, typically 5-15% of chain vertices)
- (-) Changes OWT's output interface — new field on OuterWallResult or a pre-processing step

**Assumptions (for Verifier to attack):**
1. The GPU re-snap mechanism can find the correct feature at an interpolated row — it's possible the feature doesn't exist at the interpolated row if it's between two rows where the feature was detected, but the feature may be absent at this specific row
2. Multi-row gaps are common enough to warrant a GPU pass (what if 95% of chains have no gaps?)
3. Re-snapping after tessellation (post-OWT) doesn't invalidate the tessellation's vertex placement assumptions
4. The interpolated vertex IS on a row that has the feature — it's possible the feature detection SKIPPED this row because there's no feature there

**Assumption 4 is critical.** If a chain skips a row because the feature is genuinely absent at that row (e.g., feature enters, crosses a row boundary, and only re-emerges 2 rows later), then re-snapping at the skipped row might snap to the wrong feature or find nothing. We must handle this case: if re-snap finds no feature within a reasonable U-tolerance of the interpolated position, keep the linear interpolation.

**Expected visual impact:** Fixes the most visible dips — those at multi-row gap boundaries where the ridge curves. The fix is proportional to ridge curvature: straight ridges see no change, curved ridges (spirals, undulating features) see the largest improvement.

---

### Proposal 3: Deterministic Diagonal for Both-Sides Chain Sub-Quads (Conservative) — ROOT CAUSE C

**Idea:** When `constrainedSweepCell` encounters a 2×2 sub-quad with chain vertices on BOTH left and right sides, use a deterministic diagonal instead of falling through to `sweepQuad`.

**Mechanism:**
Currently (OWT L354-355): `else { sweepQuad(buf, subBot, subTop, verts); }` — this is the "chain on both sides" case.

Replace with a biased diagonal choice:
```
// 2×2 sub-quad with chain on BOTH sides:
// Both left and right boundaries are chain edges.
// Use shorter-3D-diagonal if positions available, else default to bot-left→top-right.
emitTriCCW(buf, subBot[0], subBot[1], subTop[1], verts);
emitTriCCW(buf, subBot[0], subTop[1], subTop[0], verts);
```

**Mathematical basis:** When chains bracket a sub-quad on both sides, all four vertices are chain vertices. Both diagonals connect chain-to-chain. The key insight: diagonal choice here doesn't affect ridge alignment (both endpoints are on ridges), but inconsistent diagonal choice across rows creates visible sawtooth artifacts. A fixed diagonal direction eliminates the inconsistency.

**Files affected:**
- `OuterWallTessellator.ts` — Replace `sweepQuad` call at L355 with fixed diagonal emission. Same for the `finalBot/finalTop` case at L378.

**Trade-offs:**
- (+) ~10 lines changed, zero structural risk
- (+) Eliminates diagonal alternation in the both-sides case
- (-) Fixed diagonal may not always be the optimal 3D quality choice
- (-) Only applies to both-sides case — if this case is rare, impact is minimal

**Assumptions (for Verifier to attack):**
1. The 2×2 both-sides case is common enough to matter (vs fallbacks to sweepQuad for N×M)
2. A fixed diagonal is better than a quality-optimized one for visual consistency
3. The `emitTriCCW` winding correction handles both diagonal orientations correctly

**Expected visual impact:** Small. This case only fires when chains bracket a sub-quad on both sides, which requires two chains close together. When it does fire, it eliminates diagonal alternation.

---

### Proposal 4: Log interpolatedCount and Fan Diagonal Statistics (Conservative) — ROOT CAUSE E

**Idea:** Add diagnostic logging at three key points to quantify the scope of Root Causes A and B.

**Mechanism:**
1. **OWT:** After the chain vertex construction loop, log `interpolatedCount` and total chain vertex count.
2. **OWT:** Count and log fan diagonals emitted during `constrainedSweepCell`.
3. **CSO:** Track how many edge flips involve a chain vertex on one side (chain↔grid edges). Log alongside existing phase flip counts.

**Files affected:**
- `OuterWallTessellator.ts` — 2 `console.log` additions (~4 lines)
- `ChainStripOptimizer.ts` — 1 counter + 1 `console.log` (~6 lines)

**Trade-offs:**
- (+) Zero functional risk — pure diagnostic
- (+) Enables data-driven prioritization of subsequent fixes
- (-) More console output (gated by existing pattern; ConsolePatch intercepts)

**Assumptions:** None (pure diagnostic, nothing to attack).

**Expected visual impact:** None. This is instrumentation only.

---

### Proposal 5: Chain-Aware Subdivision Midpoints (Radical) — ROOT CAUSE D

**Idea:** When subdividing a chain edge (constraint edge), snap the midpoint U to the chain's interpolated position at that T-coordinate instead of using the simple UV average.

**Mechanism:**
1. During subdivision, when splitting a chain edge between vertices at `(u0, t0)` and `(u1, t1)`:
   - Compute `midT = (t0 + t1) / 2`
   - Instead of `midU = midpointWrappedU(u0, u1)`, compute `midU` by interpolating along the chain's known trajectory at `midT`
   - This requires passing chain point data into the subdivision module

2. Alternatively (simpler): after computing the UV-space midpoint, add that point to the GPU re-snap batch (from Proposal 2). The re-snap will find the actual ridge U at that T.

**Mathematical basis:** The UV-average midpoint deviates from the ridge by the same curvature-dependent error as linear interpolation (Root Cause B). But the effect is smaller because subdivision edges are shorter (they passed the length threshold precisely because they're long, but their UV span is bounded).

**Files affected:**
- `MeshSubdivision.ts` — Modify midpoint computation for constraint edges (~15 lines)
- OR: Batch re-snapped UV positions post-subdivision (reuses Proposal 2 infrastructure)

**Trade-offs:**
- (+) Marginal quality improvement on subdivided chain edges
- (-) Adds complexity to subdivision's clean midpoint logic
- (-) Requires chain trajectory data in subdivision (coupling increase)
- (-) Benefit is tiny compared to Proposals 1 and 2

**Assumptions (for Verifier to attack):**
1. Subdivision midpoints are a visible contributor to dip artifacts (are they?)
2. The added coupling is worth the marginal quality gain
3. Re-snapping subdivision midpoints doesn't break the subdivision module's invariants

**Expected visual impact:** Minimal. The UV-average is already close for short edges. This is polish, not fix.

---

## Recommended Approach

**Phase 1 (Ship immediately):**
- Proposal 4 (diagnostics) — Zero risk, provides data
- Proposal 1 (protect fan diagonals) — Highest impact, lowest risk

**Phase 2 (Ship after Phase 1 validation):**
- Proposal 2 (GPU re-snap interpolated vertices) — Second highest impact, moderate complexity

**Phase 3 (Conditional on Phase 2 results):**
- Proposal 3 (both-sides diagonal) — Low risk, low impact, easy
- Proposal 5 (chain-aware subdivision) — Only if dips persist after Phase 1+2

**Do NOT pursue Phase 3 unless Phase 1+2 leave visible residual dips.**

---

## Implementation Plan (File by File)

### `OuterWallTessellator.ts`
1. Add `fanDiagonalEdges: Array<[number, number]>` to `OuterWallResult` interface
2. In `constrainedSweepCell`, after emitting chainFanQuad triangles, push the diagonal edge to a module-level collector
3. Thread the collector through `buildCDTOuterWall` and return it in the result
4. Add `console.log` for `interpolatedCount` after chain vertex loop (L805)
5. (Phase 2) Export `interpolatedChainVertices` list for GPU re-snap

### `ParametricExportComputer.ts`
1. After `buildConstraintEdgeSet(outerChainEdges)`, merge OWT's `fanDiagonalEdges` into the constraint set
2. (Phase 2) After Step 6 GPU evaluation, run re-snap pass on interpolated chain vertices

### `ChainStripOptimizer.ts`
1. Add counter for chain↔grid edge flips (where exactly one endpoint is `>= outerGridVertexCount`)
2. Log the count in the result alongside existing phase flip counts

### `MeshSubdivision.ts`
1. (Phase 3 only) Modify midpoint computation for constraint edges

---

## Risk Assessment

| Change | Risk | Regression Potential | Mitigation |
|--------|------|---------------------|------------|
| Proposal 1 (fan diag protection) | LOW | Constraint set grows by ~5-20%; CSO flips fewer edges | Verify CSO flip count and mesh quality metrics don't degrade |
| Proposal 2 (GPU re-snap interp) | MEDIUM | New GPU dispatch; OWT interface change | Feature-gate behind flag; verify interpolatedCount is meaningful before implementing |
| Proposal 3 (both-sides diagonal) | LOW | Different tessellation for rare case | Count occurrences first (Proposal 4); skip if < 1% of cells |
| Proposal 4 (diagnostics) | NONE | Pure logging | N/A |
| Proposal 5 (chain midpoints) | LOW | Subdivision midpoints shift slightly | Only pursue if dips remain after Phase 1+2 |

**Biggest risk:** Proposal 2 introduces a new GPU dispatch and requires careful handling of the "feature doesn't exist at interpolated row" case. If re-snap finds no feature, we must fall back to linear interpolation — not crash or snap to a wrong feature.

---

## Validation Protocol

### Phase 1 Validation
1. Export any chain-heavy style (e.g., GothicArches, DiamondLatticeCup) at default resolution
2. Compare STL mesh feature edge smoothness before/after
3. Check new diagnostic logs:
   - `interpolatedCount` — how many chain vertices are linearly interpolated?
   - Fan diagonal count — how many are protected? 
   - CSO chain↔grid flip count — was this nonzero before the fix?
4. Run full test suite (`npm test`) — must pass 1883/1883
5. Run typecheck (`npm run typecheck`) — must be clean

### Phase 2 Validation
1. Re-export same styles after GPU re-snap of interpolated vertices
2. Compare interpolated vertex U positions before/after re-snap — deviation should decrease
3. Visual comparison of feature edge smoothness in slicer
4. Full test suite + typecheck

### Regression Guards
- Chain edge count must not decrease (fan diagonals are additive to constraint set)
- Triangle count may increase slightly (more constraint edges → fewer CSO flips → less optimization)
- Export time may increase by 1-5ms (one additional GPU dispatch in Phase 2)

---

## Open Questions

1. **How common are multi-row gaps?** `interpolatedCount` has been tracked but never logged. Before implementing Proposal 2, we need this number. If it's consistently 0 for most styles, Proposal 2 is wasted effort. → Proposal 4 answers this.

2. **Does the CSO actually flip chainFanQuad diagonals in practice?** We believe it does based on code analysis, but have no empirical count. → Proposal 4 answers this.

3. **Is the "both-sides" case in constrainedSweepCell actually reached?** If chain features rarely bracket the same sub-quad, Root Cause C is theoretical. → Proposal 4 can be extended to count this.

4. **Should `chainDirectedFlip` (MeshOptimizer.ts) also run on chain cells?** Currently it only operates on grid cells (quadMap ≥ 0). Chain cells (quadMap = -1) are entirely managed by chainFanQuad + CSO. If we protect fan diagonals (Proposal 1), is there additional value in running chainDirectedFlip on chain cells? → Likely NO, because chainFanQuad already provides the deterministic diagonal direction. But worth noting.

5. **What's the interaction between Proposal 1 and the R38 protected corridor?** Protected corridor vertices prevent CSO flips near phantom anchors. Fan diagonal protection is orthogonal (protects specific edges, not vertices). No interaction expected, but Verifier should confirm.

---

*— Generator (GitHub Copilot - Claude Opus 4.6), 2026-03-08*
