# Verifier Round 4 — Critique of R54 Chain-Strip Density Enhancement

Date: 2026-03-10

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's core insight is correct: single-cell chain edges get zero density injection from existing mechanisms (R37/R38/R53), and intra-cell phantom injection is the right local-only response. The two-axis approach (U-phantoms for unbalanced sub-quads, T-phantoms for tall bands) addresses the two dominant failure modes. However, there are several specification gaps and one incorrect assumption about what Axis 1 targets, plus an under-specified multi-chain-edge case that must be resolved before implementation.

**Amendments required before implementation: 4 (A1–A4)**
**Warnings to address during implementation: 3 (W1–W3)**

---

## Critique

### C1 [WARNING]: Axis 1 U-Phantom Mechanism — Sound for Single-Chain Cells, Under-Specified for Multi-Chain Cells

**Generator's claim**: "For each chain edge (v0, v1) that partitions the cell: compute `w_left = u_chain - u_left` and `w_right = u_right - u_chain`."

**Verification (single-chain cell)**: CONFIRMED CORRECT.

I traced the full code path:
1. `emitChainCell` at OWT L1576-1582 builds `botEdge = [BL, ...info.botChainVerts, BR]` and `topEdge = [TL, ...info.topChainVerts, TR]`, both pre-sorted by U (sorting at L973-974).
2. `constrainedSweepCell` at L340-345 uses `bot.indexOf(v0)` to find chain edge endpoint positions, then `bot.slice(prevBotPos, part.botPos + 1)` to extract sub-quads.
3. If U-phantom vertices are inserted into `botEdge`/`topEdge` at correct U-sorted positions BETWEEN the chain vertex and the far cell boundary, `indexOf` still finds chain vertices correctly, and the slice naturally includes phantoms in the wide sub-quad.
4. `sweepQuad` (L238-300) handles N-vertex edges with its two-pointer sweep + R51 quality-aware diagonal selection.

**U-phantoms in the wide sub-quad → more vertices on the sub-quad edges → more triangles with better aspect ratios.** Mechanism is geometrically sound.

**Problem with multi-chain cells**: The Generator's per-edge loop computes `w_left` and `w_right` relative to the CELL boundaries `u_left` and `u_right`. But with multiple chain edges, sub-quad widths depend on ALL partition positions.

**Counterexample**: Two chain edges at u=0.5002 and u=0.5008 in cell [0.5000, 0.5015]:
- Sub-quad A: [0.5000, 0.5002] — width 0.0002 (narrow)
- Sub-quad B: [0.5002, 0.5008] — width 0.0006 (medium)
- Sub-quad C: [0.5008, 0.5015] — width 0.0007 (medium)

The Generator's loop, processing chain edge at u=0.5002, computes `w_left = 0.0002`, `w_right = 0.0013`. It would inject phantoms in `w_right` — but that "right" region is actually split by the second chain edge at u=0.5008. The phantoms would be placed between u=0.5002 and u=0.5015, but the actual sub-quad needing help (Sub-quad A) gets nothing.

**Severity**: WARNING. Multi-chain cells are likely rare (~2-5% of chain cells based on the cellChainMap edge construction at L930-965), but the logic must handle them correctly or skip them.

**W1**: For multi-chain-edge cells, compute sub-quad widths AFTER sorting all partition positions (chain edge U-values at bot/top), not per-edge relative to cell boundaries. Alternatively, skip multi-chain cells in the first implementation (they get R35 super-cell treatment or are handled by existing mechanisms), and add multi-chain support later.

---

### C2 [CRITICAL]: Axis 2 T-Phantom Integration with emitChainSplitCell — Interface Mismatch

**Generator's claim**: "T-phantom injection reuses `emitChainSplitCell` (R53)" and "This is exactly the R37 mechanism, generalized to all chain cells."

**Actual behavior**: `emitChainSplitCell` at OWT L1593-1757 takes a `PhantomBoundaryInfo` parameter with `leftPhantoms` and `rightPhantoms` — arrays of phantom vertex indices on the cell's LEFT and RIGHT **vertical edges** (at `u = uLeft` and `u = uRight`). At L1618-1627, it iterates `bppInfo.leftPhantoms` and `bppInfo.rightPhantoms` to extract phantom T-values from vertex positions.

**The critical gap**: The Generator says R54 T-phantoms are created at arbitrary interior T-positions. But `emitChainSplitCell` doesn't accept T-positions directly — it derives them from existing phantom vertex indices in `bppInfo.leftPhantoms`/`rightPhantoms`. The function expects phantom vertices to ALREADY EXIST on the left/right vertical edges.

**This means R54 must**:
1. Create phantom vertices at `(uLeft, t_phantom)` and `(uRight, t_phantom)` for each R54 T-position
2. Store these vertex indices in a `PhantomBoundaryInfo` (creating one if none exists, or merging with existing BPP entries)
3. Pass the `PhantomBoundaryInfo` to `emitChainSplitCell`

Step 3 already works because the cell emission loop at L1939-1941 routes cells with both `info` and `bppInfo` to `emitChainSplitCell`. So if R54 populates `phantomBoundaryMap` with its T-phantom boundary vertices, the routing is automatic.

**What emitChainSplitCell already does correctly** (Steps 3-4, L1660-1744):
- Builds sub-band boundaries from phantom T-levels ✓
- Splits chain edges at phantom T-levels, creating chain-interpolated phantoms via `phantomChainAnchorSet` ✓
- Assigns chain sub-edges to sub-bands ✓
- Emits sub-bands with `constrainedSweepCell` ✓

**A1 (AMENDMENT)**: The Generator must specify that R54 T-phantom injection works by:
1. Computing phantom T-positions per cell
2. Creating left/right boundary vertices at those T-positions (allocating from phantom buffer)
3. Inserting those vertex indices into `phantomBoundaryMap` (merging with existing BPP entries if present — UNION the T-positions, not replace)
4. Letting the existing cell emission routing handle the rest

This is **simpler** than the Generator describes. No new `emitR54Cell` function is needed. The Generator's "modified emitChainSplitCell" (Code Paths table) is unnecessary — the existing function works if given the right inputs.

---

### C3 [WARNING]: BPP Second-Pass Propagation — T-Position Mismatch Risk

**Generator's claim**: "R54 phantoms at cell boundaries trigger a second-pass BPP propagation limited to one hop."

**The risk**: Two adjacent chain cells in the same band. Cell A has chain at u=0.501 with cellWidth=0.0015, bandHeight=0.003 → aspect 2:1 → NO T-phantoms. Cell B has chain at u=0.5025 with cellWidth=0.0015, bandHeight=0.003 → aspect 2:1 → NO T-phantoms. This is fine.

But consider: Cell A has cellWidth=0.0008, bandHeight=0.004 → ratio 5:1 → 1 T-phantom at t_mid. Cell B has cellWidth=0.0020, bandHeight=0.004 → ratio 2:1 → NO T-phantoms. Cell A creates boundary vertices at `(uRight, t_mid)` on the shared boundary. This phantom propagates to Cell B's LEFT boundary via R54 BPP. Cell B now has a LEFT phantom at `t_mid`. This works correctly — Cell B becomes a BPP-split cell even though it wouldn't have been otherwise.

**Now the harder case**: Cell A has cellWidth=0.0005 → ratio 8:1 → 2 T-phantoms at t1, t2. Cell B has cellWidth=0.0010 → ratio 4:1 → 1 T-phantom at t1'. Since `t1 ≠ t1'` in general (t1 = tBot + (tTop-tBot)/3, t1' = tBot + (tTop-tBot)/2), the shared boundary has phantoms at BOTH t1 and t1' (from different cells), plus t2 from Cell A. The union is {t1, t1', t2}.

Cell A needs phantoms at {t1, t2} on its RIGHT. Cell B needs phantoms at {t1'} on its LEFT. But the shared boundary should have {t1, t1', t2} to avoid T-junctions. Cell A doesn't know about t1', and Cell B doesn't know about t1 and t2.

**The fix**: R54 must process ALL cells first (computing their T-phantom positions), THEN propagate the UNION of T-positions to both sides of each shared boundary. This is a two-pass algorithm: (1) compute, (2) propagate. The Generator describes one-hop propagation, but the directionality needs clarification.

**W2**: Implement R54 in two passes:
- Pass 1: For each chain cell, compute phantom T-positions and store them (don't create vertices yet)
- Pass 2: For each shared boundary between chain cells, compute the UNION of T-positions from both sides. Create phantom vertices for the merged set. Insert into phantomBoundaryMap.

This prevents T-junction mismatches. The Generator's "one-hop, no cascade" is achievable but only with this two-pass union strategy.

---

### C4 [NOTE]: Near-Boundary "Collapse" Concept Is Confused

**Generator's claim (Risk #7)**: "If `w_narrow < R54_MIN_NARROW_WIDTH = 5e-5`, collapse the narrow sub-quad by not partitioning at the chain edge for U-phantoms."

**What this actually does**: NOT adding U-phantoms to the wide sub-quad when the narrow sub-quad is very narrow. But the narrow sub-quad still exists because `constrainedSweepCell` still partitions at the chain edge (the chain edge is a mandatory constraint). The "collapse" doesn't remove the narrow sub-quad — it just skips densification of the WIDE sub-quad.

**This is backwards**: When `w_narrow` is tiny, the narrow sub-quad produces the worst slivers, and the wide sub-quad is where phantoms are most beneficial. Skipping phantoms on the wide side when the narrow side is already bad provides zero benefit and removes the improvement.

**What the Generator likely means**: Don't worry about the narrow sub-quad because it's geometrically minuscule (w_narrow < 5e-5 ≈ 0.005% of U-range). The triangles are technically slivers but have near-zero area and no visual impact. This is the correct reasoning, but the specification conflates "don't worry about narrow slivers" with "don't add phantoms to the wide side."

**Required clarification**: The `R54_MIN_NARROW_WIDTH` guard should NOT suppress wide-side phantoms. It should merely be a diagnostic flag that says "narrow sub-quad slivers are expected and acceptable." U-phantoms in the wide sub-quad should ALWAYS be added regardless of the narrow sub-quad width.

Super-cell fusion (merging with the neighbor) is overkill for this case. The narrow slivers from near-boundary chains are geometrically insignificant.

---

### C5 [ACCEPT]: Phantom Budget Calculation Is Sufficient

**Generator's claim**: "16× `chainEdges.length` = 98,864 slots is sufficient."

**Verification**: `maxPhantomSlots` is computed at L773: `const maxPhantomSlots = chainEdges.length * 12`. At this point, `chainEdges.length` is the ORIGINAL count before R37 pre-splitting. With ~13 chains × ~420 rows = ~5,460 original edges:

- Current: 5,460 × 12 = 65,520 slots
- R37 uses ~12,757 phantoms (from console logs)
- R53 BPP creates a small number of additional phantoms (~200-500 from boundary propagation)
- Proposed 16×: 5,460 × 16 = 87,360 slots
- R54 adds 4,000-8,000 phantoms
- Total used: ~12,757 + 500 + 8,000 = ~21,257
- Headroom: 87,360 - 21,257 = ~66,100 slots

**ACCEPT**: 66K headroom is more than sufficient. Even worst-case R54 (28 phantoms × 2,000 cells = 56,000) fits within the 87K budget, though this worst case is unrealistically pessimistic.

---

### C6 [CRITICAL]: Quality Prediction Is Overly Optimistic — Axis 1 Doesn't Help the Worst Offenders

**Generator's claim**: "Axis 1 alone should cut the 45.4% violation rate to roughly 10-15%" and "Reduces the ~25,000 triangles currently in narrow sub-quads to aspect < 4:1."

**Fundamental error**: U-phantoms are injected into the WIDE sub-quad, not the narrow sub-quad. The triangles in the narrow sub-quad are the ones with the WORST aspect ratios (the Generator's own example: 12:1 in the narrow sub-quad). **Axis 1 U-phantoms do not improve narrow sub-quad triangles at all.** They improve the wide sub-quad triangles, which may or may not have bad aspect ratios depending on bandHeight vs cellWidth.

**Breakdown of violation sources** (estimated from the geometry):

1. **Narrow sub-quad slivers**: ~2 triangles × ~2,000 single-cell chain cells = ~4,000 triangles. These have the WORST aspect ratios (10:1 to 7940:1). **Axis 1 does NOT help these.**

2. **Tall-band triangles**: bandHeight/cellWidth > 4:1 creates bad aspect in ALL cell triangles. With typical bandHeight ≈ 0.0024 and cellWidth ≈ 0.0017, ratio ≈ 1.4:1 (OK). But variable band heights from micro-rows can create 3-6:1 ratios. **Axis 2 helps these.**

3. **Wide sub-quad triangles**: If the wide sub-quad has width >> bandHeight, the triangles there are short and wide (bad aspect in the opposite direction). This is uncommon because `cellWidth ≈ 0.0017` is similar to `bandHeight ≈ 0.0024`. **Axis 1 helps these when they occur.**

4. **Chain-edge-adjacent triangles**: The two triangles immediately adjacent to the chain edge (one in each sub-quad) have geometry determined by the chain edge slope and the cell corners. Even with U-phantoms in the wide sub-quad, the chain-edge-adjacent triangle in the narrow sub-quad is unchanged.

**A2 (AMENDMENT)**: The Generator must revise the quality predictions. Specifically:
- Axis 1 primarily improves wide-sub-quad triangles, NOT narrow-sub-quad slivers. The expected reduction is ~5-10 percentage points (from the wide-sub-quad contribution to violations), not 30+ percentage points.
- Axis 2 is likely MORE impactful than Axis 1 because tall-band cells affect ALL triangles in the cell, not just one sub-quad.
- A realistic combined prediction is **20-30% violations** (down from 45.4%), not 8-12%.
- The extreme aspect ratios (>100:1) from narrow sub-quads will persist. These are geometrically inevitable for near-boundary chains and have negligible surface area impact.

---

### C7 [ACCEPT]: U-Phantom Interaction with Diagonal Selection Is Benign

**Generator's concern**: "How do U-phantoms affect the diagonal selection?"

**Verification**: `sweepQuad` (L238-300) uses a two-pointer sweep where each step emits one triangle. With more vertices on the edges, there are more steps, each producing a smaller triangle. The R51 quality-aware diagonal choice (L268-291) compares `maxCosine2D` for the two diagonal options, picking the one with better minimum angle.

Adding U-phantom vertices to the wide sub-quad edge creates more, smaller triangles with lower aspect ratios. The quality-zone diagonal choice has MORE opportunities to pick good diagonals because each decision involves shorter edges and more equilateral options.

`constrainedSweepCell`'s chainFanQuad path (L383-406) only fires for 2×2 sub-quads. With U-phantoms, the sub-quad has more vertices → falls through to the standard `sweepQuad` path (L407) which handles N×M sub-quads correctly.

**ACCEPT**: No regression risk from diagonal selection interaction.

---

### C8 [ACCEPT WITH NOTE]: Local Strategy Is Justified, But Principle #9 Is Already Violated

**Generator's claim**: Respects distilled principle #9 "no global row/column insertion."

**Evidence**: `insertMicroRowsForSteepCrossings` at L465-545 inserts global T-rows into the master `tPositions` array. These affect ALL columns (every cell in that T-band gets split). The function is called at L743 and produces micro-rows that are merged into the global T-position array.

**Conclusion**: Principle #9 is a guideline, not an absolute rule. Micro-rows already violate it for steep crossings.

However, the Generator's local approach (intra-cell phantoms) IS the right strategy for R54. Global column insertion at chain U-positions would add ~5,000+ columns to `unionU`, increasing grid vertices from ~228K to ~2.25M — a 10× explosion that's unacceptable for performance and memory.

**A3 (AMENDMENT)**: The Generator should acknowledge that principle #9 has precedent violations (micro-rows) and justify the local approach on PERFORMANCE grounds (10× vertex explosion for global columns), not on principle #9 compliance.

---

## Accepted Items

1. **Core insight** — single-cell chain edges get zero density injection from R37/R38/R53, creating the quality gap ✓
2. **Phantom buffer mechanism** — reusing the existing phantom vertex buffer with increased multiplier ✓
3. **R52 precision lock compatibility** — R54 creates new vertices at new positions, never modifying chain vertex positions ✓
4. **Axis 1 sweep integration** — U-phantom vertices in botEdge/topEdge are naturally consumed by constrainedSweepCell/sweepQuad ✓
5. **Axis 2 pattern** — sub-band decomposition via emitChainSplitCell handles T-phantom injection correctly (once inputs are correctly prepared) ✓
6. **Implementation ordering** — section 3.95 between BPP and cell emission is the right location ✓
7. **Phantom budget** — 16× multiplier provides adequate headroom ✓
8. **Four-changeset decomposition** — infrastructure → Axis 1 → Axis 2 → quality gating is a safe incremental rollout ✓

---

## Amendments Required

### A1: Axis 2 Integration Via phantomBoundaryMap (Not Custom emitR54Cell)
R54 T-phantoms must integrate via the existing `phantomBoundaryMap` interface:
1. Compute phantom T-positions per cell
2. Create phantom vertices at `(uLeft, t_phantom)` and `(uRight, t_phantom)`
3. Insert into `phantomBoundaryMap` (merge with existing BPP entries if present)
4. Let existing cell emission routing at L1932-1944 handle dispatch

No modifications to `emitChainSplitCell` are needed. No new `emitR54Cell` function is needed.

### A2: Revised Quality Predictions
- Axis 1 target: wide-sub-quad triangles (NOT narrow-sub-quad slivers)
- Axis 2 target: all triangles in tall-band cells
- Realistic combined prediction: 20-30% violations (not 8-12%)
- Narrow sub-quad slivers (>100:1 aspect) will persist and are acceptable (negligible area)

### A3: Principle #9 Justification
Justify local approach on performance grounds (10× vertex explosion risk from global columns), not principle #9 compliance. Acknowledge micro-row precedent.

### A4: Multi-Chain-Edge Cell Handling
For cells with `info.chainEdges.length > 1`:
- Either compute sub-quad widths from ALL sorted partition positions (correct approach), OR
- Skip R54 U-phantom injection entirely for multi-chain cells (safe conservative approach for first implementation)

Generator must specify which approach and provide the implementation sketch.

---

## Warnings for Implementation

### W1: Multi-Chain Cell Sub-Quad Width Calculation
See A4. If implementing multi-chain support, partition positions must be sorted and sub-quad widths computed pairwise between consecutive partitions.

### W2: Two-Pass T-Phantom Propagation
R54 must use a two-pass strategy:
- Pass 1: Compute phantom T-positions for all chain cells (no vertex creation)
- Pass 2: For shared boundaries between chain cells, compute UNION of T-positions from both sides, then create vertices and populate phantomBoundaryMap

This prevents T-junction mismatches from independently-computed T-positions on shared boundaries.

### W3: Near-Boundary Guard Logic Correction
`R54_MIN_NARROW_WIDTH` guard must NOT suppress U-phantom injection in the wide sub-quad. The guard should only flag narrow sub-quad slivers as expected/acceptable. Wide-side phantoms should always be added regardless of narrow-side width.

---

## Implementation Conditions (for Executioner)

### Changeset 1: Infrastructure
1. Add constants: `R54_ASPECT_THRESHOLD = 3.0`, `R54_HT_RATIO = 4.0`, `R54_MAX_U_PHANTOMS = 3`, `R54_MAX_T_PHANTOMS = 3`
2. Increase `maxPhantomSlots` multiplier from 12 to 16 at L773
3. Add `r54PhantomMap: Map<number, { uPhantoms: number[]; tPhantoms: number[] }>` for staging
4. Add diagnostic console.log for R54 cell analysis counts
5. **Validation**: typecheck + lint clean, no behavioral change

### Changeset 2: Axis 1 U-Phantom Injection
1. New section 3.95a: iterate `cellChainMap` entries NOT in `superCellCols`
2. For single-chain-edge cells: compute sub-quad widths, inject U-phantom vertices into phantom buffer
3. Store phantom vertex indices in `r54PhantomMap` keyed by cell
4. Modify `emitChainCell` to read `r54PhantomMap` and insert U-phantom vertices into `botEdge`/`topEdge` at correct sorted positions
5. For multi-chain-edge cells: SKIP (per A4 conservative approach)
6. **Validation**: Export gothic_arches, log aspect ratio metrics for chain-strip triangles, compare with baseline

### Changeset 3: Axis 2 T-Phantom Injection
1. New section 3.95b: iterate chain cells with `bandHeight/cellWidth > R54_HT_RATIO`
2. Two-pass implementation (per W2):
   - Pass 1: Compute phantom T-positions for all qualifying cells
   - Pass 2: Union T-positions on shared boundaries, create vertices, populate `phantomBoundaryMap`
3. **Validation**: Export gothic_arches, verify zero T-junction warnings, compare sub-band triangle quality

### Changeset 4: Quality Gating
1. Add aspect-ratio and min-angle logging for chain-strip triangles (before/after R54)
2. Flag-gated: `R54_ENABLED = true` with fallback
3. **Validation**: Full export test suite, regression check against baseline metrics

---

## Verification Protocol

After implementation, the Executioner must report:
1. Chain-strip aspect ratio violation percentage (before/after)
2. Max aspect ratio in chain-strip triangles (before/after)
3. Phantom vertex count increase (expected: 4,000-8,000)
4. T-junction count at R54 boundaries (must be 0)
5. Total triangle count change (expected: modest increase from sub-quad splitting)
6. Export time delta (expected: <50ms from linear scan)
7. At least 3 different styles tested (gothic_arches, amphora, vase) to confirm generalization
