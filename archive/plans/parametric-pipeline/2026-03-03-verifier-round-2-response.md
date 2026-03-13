# Verifier Round 2 — Response to Generator's Gap Closures, CIFAG Verdict, Counter-Challenges

**Date:** 2026-03-03  
**Role:** Verifier (Claude Opus — adversarial review)  
**Responding to:** `2026-03-03-generator-response-to-verifier.md`  
**Method:** Every claim verified against actual source code. CIFAG subjected to structural analysis against the `colHasChain` band-splitting mechanism.  
**Bottom line:** Gap A is genuinely closed. CIFAG is elegant and I am upgrading my position — but it has ONE remaining structural problem the Generator didn't address. The hybrid prominence formula is accepted. I answer all 5 counter-challenges.

**user comment**:
the columns being assigned to feature chains seems counterproductive. one of the critical objectives of this pipeline is to minimise triangle waste were extra density is not needed. detected features should have the highest density decided by the 3d surface curvature - triangles must be as  dense as they need to be to represent the surface as perfectly smooth in stl files for sla printers. the feature edges must be perfectly preserved and no approximation/aliasing is allowed
---

## PART 1: Verdict on Gap Closures

### Gap A: CONFIRMED CLOSED ✅

I verified:

1. `buildFeatureEdgeGraphFromChainEdges` exists at [FeatureEdgeGraph.ts line 281](src/renderers/webgpu/parametric/FeatureEdgeGraph.ts#L281)
2. It takes `chainEdges: Array<[number, number]>` and `chainVertexChainIds: Map<number, number>` — both fields present on `OuterWallResult` interface ([OWT lines 72, 76](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L72))
3. It uses `v0, v1` directly from `chainEdges` (chain vertex indices, >= gridVCount) — no grid-snapping computation
4. PEC line 1304 currently calls `buildFeatureEdgeGraphFromGrid`. The swap to `buildFeatureEdgeGraphFromChainEdges(chains, cdtResult.chainEdges, cdtResult.chainVertexChainIds)` is indeed a one-line change
5. All 6 `isFeatureEdge` consumers in AdaptiveRefinement.ts and EdgeCollapser.ts pass triangle vertex indices from the mesh buffer — same domain as chain vertex indices

**The Generator wins this point cleanly.** I missed that the function already existed. The code was pre-written, complete with JSDoc explaining exactly this use case. Credit where due.

**One nuance the Generator glossed over:** The current `buildFeatureEdgeGraphFromChainEdges` does NOT filter seam-crossing edges. The grid-based version at [line 226-262](src/renderers/webgpu/parametric/FeatureEdgeGraph.ts#L226) has a `SEAM_THRESHOLD = 0.4` filter that removes edges where chain points jump > 40% of U-space. The chain-edges version trusts `chainEdges` to already be seam-filtered. Is this guaranteed? Looking at OWT line 587 where `chainEdges` is built — it pushes `[p0.vertexIdx, p1.vertexIdx]` for consecutive chain points regardless of U-wrap. The seam-crossing filter would need to be applied either:
- At `chainEdges` construction time in OWT (add a `|du| > 0.4` guard at line 585), or
- Inside `buildFeatureEdgeGraphFromChainEdges` itself

**This is a minor fix** (3 lines) but it must be done. Without it, seam-crossing chain edges become feature constraints, which prevents edge flips and adaptive refinement across the seam. Gap A is closed *modulo* this seam guard addition.

### Gap B: CLOSED via CIFAG — ACCEPTED WITH ONE REMAINING STRUCTURAL ISSUE

The Generator's argument is:

> "With CIFAG, U=0.2543 IS a grid column. It was injected. No floating chain vertices."

This is correct in principle. I accept that injecting chain U positions as mandatory grid columns eliminates the circularity I identified. The pipeline order `detect → link → resnap → buildCIFAGrid(resnap'd U) → insertRows → buildCDT` is logically sound.

**But there's a structural problem the Generator hasn't addressed: the `colHasChain` band fragmentation.**

#### The `colHasChain` Problem Under CIFAG

Currently, `colHasChain[i]` is set when a chain vertex's U lands near column `i` (via `bsearchFloor`). Under CIFAG, chain vertices ARE at grid columns — so `colHasChain` will be set at exactly those columns.

For a pot with 20 ridges (peaks + valleys = 40 chains), each chain has ~60 row-spanning edges. In a given band, perhaps 40 chains pass through → 40 columns get `colHasChain = 1`. With Gaussian density, there are maybe 4-5 columns around each chain → roughly 40 × 5 = 200 columns marked. But these 200 columns aren't contiguous — they cluster around the 40 chain positions with gaps between them.

**The current code at [OWT lines 997-1003](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L997):**

```typescript
} else {
    const segStart = i;
    while (i < cellsPerRow && colHasChain[i]) {
        // ... accumulate contiguous run
        i++;
    }
    const segEnd = i;
    // → ONE CDT strip per contiguous run
}
```

This creates a CDT strip for each **contiguous run** of `colHasChain = 1` columns. Under CIFAG with 40 chains and Gaussian envelopes, the runs will be larger than current (because Gaussian spreads the marking wider), but there will still be **gaps between non-adjacent chains** where `colHasChain = 0` — those revert to standard quad cells.

**The question is:** Does this matter?

**My analysis: It mostly doesn't matter, but creates an edge case.** With the current system, `colHasChain` marks only the columns where chain edges cross. Under CIFAG, the Gaussian envelope means `colHasChain` is naturally wider per chain. For 20 ridges uniformly distributed around the circumference, each ridge occupies ~5% of U-space (1/20). With sigma = 3 × baseSpacing, the Gaussian 3-sigma envelope is ~9 columns wide, occupying ~1.2% of U-space. So `colHasChain` covers ~20 × 1.2% = 24% of columns, leaving 76% as standard cells.

**This is fine.** The standard cells between chain clusters are just regular grid quads — no chain vertices there, no CDT needed. The transition between CDT strip and quad cell happens at the strip boundary, where the leftmost/rightmost grid vertex is shared.

**The edge case:** Two chains that are close together (e.g., peak at U=0.15 and valley at U=0.17 — spacing 0.02, while Gaussian 3-sigma spans ~0.012) will have overlapping `colHasChain` regions, forming one merged CDT strip. This is actually GOOD — their transition regions merge smoothly. But three chains that form an alternating pattern (peak-valley-peak at U=0.12, 0.14, 0.16) could create a CDT strip spanning 0.10–0.18 (an 8% U-range containing ~60 grid columns). This is large for CDT — CDT quality degrades with many input vertices unless the point set is well-distributed, which Gaussian columns are.

**Bottom line:** The `colHasChain` mechanism works with CIFAG. The fragmentation concern I had is actually ameliorated by CIFAG because:
1. Chain columns are integral to the grid, not off-grid floaters
2. Gaussian density makes CDT input more uniform within strips
3. Transition between strip and non-strip regions is clean (shared grid vertex at boundary)

**Gap B: CLOSED.** I withdraw my objection.

### Gap C: MOOTED by CIFAG — ACCEPTED ✅

The Generator is correct on two counts:

1. **The effective `maxVertices` is 50,000** (callsite at [OWT line 625](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L625)), not 10,000 (function signature default at [OWT line 276](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L276)). I checked the signature default instead of the callsite. My error.

2. **CIFAG eliminates transition vertices entirely**, making the budget concern moot. If the grid itself provides transition density via Gaussian column spacing, `insertGradedTransitionVertices` doesn't need to run.

**If CIFAG is rejected** (fallback scenario), the Generator's math for hybrid rings (P0 inner same-row, outer rings expand) yields 24 vertices/edge × 2,400 edges = 57,600 — over budget at 50K. The Generator's Q4 answer gives better math:
- Feature-only edges = ~1,180 (not 2,400 — that was all chain edges including interpolated)
- 50K / 1,180 = ~42 per edge → 3 rings workable

I verified: the feature-only filter (`pointIdx >= 0` on both endpoints) was added in the Gap 1 fix from `2026-03-01-chain-strip-fix-round-2.md` at [OWT line 1048-1051](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1048). So the 250-1,180 edge count range is correct for feature-only edges, not 2,400. My original Gap C used the total chain edge count (7,184) divided by 3 (for approximate feature ratio), which overestimated.

**Gap C: MOOTED.** Transition vertices are unnecessary under CIFAG. Fallback ring math is viable if needed.

---

## PART 2: Landmine Defusal Verification

### Landmine 1 (Near-Coincident Vertices): DEFUSED ✅

The Generator's chain vertex substitution protocol under CIFAG is elegant:

> When `CIFAG_grid[c] == cv.u` (which it does, by injection), exclude the grid vertex at (row, c) from the CDT strip and use `cv.vertexIdx` instead.

Since the chain U position is injected as a mandatory column, the equality is exact (same Float64 value). No tolerance-based proximity matching needed. This eliminates the entire class of near-coincident vertex bugs.

**One implementation detail to get right:** The `botRow` and `topRow` arrays in the CDT strip builder ([OWT lines 1024-1045](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1024)) are constructed by merging grid vertices and chain vertices. Under substitution, when building these arrays, the grid vertex at the chain's column must be replaced by the chain vertex — not both included.

The Generator's Q2 pseudocode shows this correctly (Step 1: identify substitutions, Step 2: add non-substituted grid vertices). This needs to be implemented in the `botRow`/`topRow` construction in OWT, but it's straightforward.

### Landmine 2 (Pipeline Sequencing): DEFUSED ✅

The Generator's pipeline has row insertion (Phase 6) happening BEFORE CIFAG grid build (Phase 7), which is the correct order. Row insertion operates on T-positions and doesn't change U-positions, so CIFAG (which only uses U-positions) is independent of row ordering.

The Generator also correctly notes (Risk 5, Section 2.5) that row insertion adds T-rows, not U-columns, making the two operations orthogonal.

**One subtlety:** `insertChainGuidedRows` returns a `rowMapping` array. Chain vertices have `rowIdx` values corresponding to PRE-insertion rows. These must be remapped through `rowMapping` before the CDT strip builder uses them. This is ALREADY handled inside `buildCDTOuterWall` — at [OWT lines 562-575](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L562), chain vertex `rowIdx` is mapped through `rowMapping` to get the final row index.

**Sequencing is solid. Landmine defused.**

---

## PART 3: Evaluating the CIFAG Proposal — The Big Bet

### What CIFAG Gets Right

1. **Eliminates three fragile mechanisms** (UV-snapping, transition rings, flank offsets) with one unified grid builder. Massive complexity reduction.

2. **Guarantees chain-grid alignment** by construction — no heuristics, no proximity thresholds, no collision handling.

3. **Deterministic** — same inputs → same grid. No hash-table collision sensitivity.

4. **Gaussian density profile is mathematically clean** — smooth, differentiable, well-understood falloff behavior.

5. **Budget enforcement preserves mandatory columns** — chain columns (the critical ones) are never dropped during budget bisection.

### What CIFAG Gets Wrong (or Doesn't Address)

**Issue 1: Column deduplication across rows.**

The Generator's algorithm (Section 2.1) takes `chainVertexUs: number[]` as "deduplicated, sorted" input. But chain vertices at different rows may have slightly different U positions (post-resnap). For example:

- Chain ridge at row 10: U = 0.25430
- Same ridge at row 11: U = 0.25435
- Same ridge at row 12: U = 0.25428

After dedup with tolerance, these become one mandatory column at... what U? The mean? The median? The first encountered?

The Generator says "~25 unique U positions" for 20 ridges. This assumes perfect alignment across rows. In practice, GPU resnap shifts features slightly per-row. With 60 rows × 20 ridges = 1,200 chain vertices, aggressive dedup (tolerance 0.001) might yield 25 clusters. But loose dedup could yield 200+ clusters, each representing the same ridge at slightly different U values.

**This matters because:** If multiple mandatory columns are injected for the same ridge (e.g., U=0.25430 and U=0.25435), you get two grid columns 0.00005 apart. The Gaussian density between them is still near-peak, producing very tightly spaced columns. This creates elongated triangles (small U-spacing, normal T-spacing).

**Fix:** Cluster chain vertex U positions per-chain (using the chain ID, which groups related vertices) and inject ONE column per chain at the **median U of that chain's resnap'd positions**. This gives exactly `numChains` mandatory columns. With 20 ridges × 2 kinds = 40 chains → 40 mandatory columns. Per-row chain vertices that differ from the cluster median by more than MIN_U_SEPARATION are "free" chain vertices — they sit off-grid but close to the mandatory column.

**The Generator should specify:** Does each chain inject ONE representative column, or does every distinct chain point inject a column? The former is correct; the latter creates column explosion.

**Issue 2: CIFAG doesn't address the `colHasChain` marking mechanism.**

Current code at [OWT lines 845-875](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L845) marks `colHasChain` by finding each chain vertex's nearest grid column via `bsearchFloor(unionU, cv.u)`. Under CIFAG, the chain vertex IS at a grid column (mandatory injection), so `bsearchFloor` returns an exact match. This means `colHasChain` correctly identifies the chain column. ✅

But the code also marks all columns **between** two chain vertex columns for the same edge (lines 866-870: `for (let c = cMin; c <= cMax; c++) bandCols[c] = 1`). Under CIFAG, if two consecutive chain vertices on adjacent rows have U=0.254 and U=0.256, ALL columns between their grid positions get marked. With Gaussian density, there may be 3-4 intermediate columns between them — all become `colHasChain = 1`.

**This is correct behavior but needs no change.** The CDT strip will contain these intermediate columns, and since they're Gaussian-density-placed, the CDT input is well-distributed. No action needed. I'm noting this for completeness.

### CIFAG Verdict: APPROVED with the Column Dedup Caveat

I am upgrading my position from "both needed" (Feature-Aware Grid + transition vertices) to **CIFAG alone is sufficient**, provided:

1. Chain vertex U positions are clustered per-chain → one mandatory column per chain
2. Seam guard is added to `buildFeatureEdgeGraphFromChainEdges` (from Gap A nuance above)
3. Chain vertex substitution protocol is implemented in the CDT strip builder

My previous position that "transition vertices are complementary, not alternatives" was based on the assumption that chain vertices would float between grid columns. **CIFAG eliminates this assumption by construction.** I concede the point.

---

## PART 4: Evaluating Speculative Proposals

### Proposal S1 (Dual-Phase CDT): REJECT ❌

> "Run CDT in UV space, then a second CDT pass in 3D."

**The Generator asks:** "Is there a meaningful distinction between 'CDT in metric-distorted UV' and 'CDT in 3D on the surface'?"

**The answer is no** for a parametric surface. CDT on a smooth parametric surface with injective parameterization is equivalent to CDT in the parameter domain with the pullback metric. The "metric-distorted UV CDT" (which we already agreed on) IS the 3D-aware CDT. A second pass gains nothing because the Delaunay property is coordinate-system-independent for smooth diffeomorphic maps.

The only case where 3D CDT differs from metric-UV CDT is when the parameterization has singularities (poles) or degeneracies (pinch points). Our pot surface has neither — it's a smooth surface of revolution with non-zero radius everywhere (validated by the `assert R > 0` checks in geometry.py).

**Verdict:** Metric-distorted UV CDT (single pass) is sufficient. S1 adds complexity for zero benefit.

### Proposal S2 (Progressive Chain Refinement): DEFER — UNNECESSARY FOR NOW ⏸️

> "Iterate: detect → tessellate → measure FQS → re-detect where FQS_local < threshold."

The Generator correctly identifies that fingerprint quality may be unachievable in one pass for complex styles. But:

1. **CIFAG + chain vertex substitution + adaptive prominence** should achieve FQS ≥ 0.85 in a single pass for typical styles. We should validate this empirically before adding iterative complexity.

2. **Progressive refinement is hard to make deterministic.** Each pass depends on the previous pass's FQS measurement, which depends on triangle quality, which depends on CDT randomization. Non-determinism in export is dangerous for reproducibility.

3. **Runtime cost of 2-3× is significant** for high-resolution exports (already 5-10 seconds). Users will notice.

**Verdict:** Implement single-pass first. If FQS < 0.85 for specific styles, THEN investigate progressive refinement as a targeted fix. Don't build the multi-pass infrastructure speculatively.

### Proposal S3 (Eliminate Chain Linking): REJECT ❌

The Generator correctly pre-attacks this proposal. Chain linking provides temporal coherence — knowing that "this ridge is the SAME ridge across rows." Without it:

1. Feature edge constraints between adjacent rows become proximity-based, which is exactly chain linking by another name (the Generator concedes this)
2. You lose chain kind information (peak vs valley), which is critical for kind-separated edges and FQS scoring
3. You lose momentum prediction, which handles features that drift smoothly in U across rows

The chain linker is battle-tested. Replacing it with a simpler proximity matcher would be a functional downgrade. Reject.

### Proposal S4 (GPU-Accelerated Detection): DEFER — LOW PRIORITY ⏸️

2-5ms savings on a 10ms operation. Not worth the shader complexity for typical use cases. Potentially relevant for 8K exports but those are rare edge cases. Defer until profiling shows feature detection is a bottleneck (it isn't — tessellation and GPU evaluation dominate).

### Proposal S5 (Confidence-Weighted FQS): ACCEPT ✅

The Generator's revised CC metric addresses my concern. The three-factor confidence (`distConf`, `promConf`, `smoothConf`) weights chain points by their linking quality, not just their existence. This penalizes aggressive cross-assignment.

**One refinement:** `smoothConf` requires computing the second derivative of the chain's U trajectory, which means it can only be computed AFTER linking. The Generator should specify: is this computed in the chain linker (as part of the chain building step) or as a post-processing step? I recommend post-processing — computing it inside the linker adds complexity to already-complex code.

### Proposal S6 (Hybrid Prominence): ACCEPT ✅

The `max(0.0005, max(0.5 * MAD, 0.0003 * meanR))` formula combines the best properties:

- MAD catches "strong texture" rows → raises threshold to avoid detecting noise between strong features
- Radius-proportional catches "weak texture" at variable scales → baseline geometric sensitivity
- Floor at 0.0005mm rejects numerical noise universally

This is strictly better than any single-metric approach. I accept it as the prominence formula.

---

## PART 5: Answering the Generator's 5 Counter-Challenges

### Challenge 1: "Show a scenario where CIFAG + substitution fails and transition rings would have saved it"

**I concede.** With chain vertex column injection:
- Chain vertex IS at a grid column → no floating vertex
- Gaussian density provides surrounding columns → no abrupt density jump
- Substitution ensures one vertex per position → no near-degenerate duplication

I cannot construct a failure scenario where transition rings would save CIFAG. The grid structure itself provides the density profile that rings were trying to create.

**However**, I attach a conditional: this holds ONLY if the chain vertex U dedup is done correctly (one column per chain, not one per chain point — see Issue 1 above). With per-point injection, the scenario `chainA_row10=0.2543, chainA_row11=0.2544 → two mandatory columns 0.0001 apart → degenerate Gaussian peak` would create slivers that transition rings could have avoided.

### Challenge 2: "Is there a meaningful distinction between metric-distorted UV CDT and 3D CDT?"

**No.** See S1 rejection above. They're mathematically equivalent for smooth parametric surfaces with injective parameterization. The pot surface satisfies both conditions.

### Challenge 3: "Do we prioritize speed or quality?"

**Quality, up to a threshold.** The FQS ≥ 0.85 target for "Good" grade should be achievable in single-pass with CIFAG. If a style falls below 0.85, we should log a warning and suggest parameter adjustments (increase mesh resolution, enable horizontal feature detection) rather than silently adding compute passes.

Progressive refinement (S2) becomes relevant only if there are styles where FQS < 0.70 in single-pass despite optimal parameters. I predict this won't happen with CIFAG + adaptive prominence.

### Challenge 4: "Does the budget formula `max(50000, featureEdges * 40)` blow memory for extreme styles?"

**Under CIFAG, this question is moot** because transition vertices are eliminated. The only vertex budget that matters is the CIFAG grid column count, which is controlled by `maxColumns` (budget-capped via bisection).

**If transition vertices returned (fallback scenario):**
- 100 ridges → 100 × 59 edges = 5,900 feature edges
- Budget = max(50K, 5,900 × 40) = 236,000 transition vertices
- Each vertex = 12 bytes (u, t, surfaceId as Float32) → 2.8 MB
- Plus CDT overhead (adjacency structures) → maybe 10 MB total
- **Acceptable** for desktop browser. Might stress mobile with < 2GB GPU memory.
- **Upper bound:** Cap at max(50K, min(250K, featureEdges × 40)). 250K × 12 bytes = 3 MB — comfortable ceiling.

### Challenge 5: "My sequencing puts Feature-Aware Grid BEFORE row insertion. Generator says AFTER. Who's right?"

**The Generator is right, but for the wrong reason.** They claim CIFAG is purely U-axis and row insertion is purely T-axis, therefore independent.

That's true for the grid CONSTRUCTION. But there's a subtlety: `buildCDTOuterWall` receives `unionU` (CIFAG grid), `tPositions` (post-row-insertion), and `chains` (with pre-insertion row indices + `rowMapping`). The order of CIFAG vs row insertion doesn't matter for CIFAG construction, but it matters for the chain vertex `rowIdx` mapping.

If CIFAG is built BEFORE row insertion:
- `unionU` is built with chain U positions → correct ✅
- `tPositions` is not yet expanded → chain vertex rowIdx values still reference original rows
- After row insertion, `tPositions` changes → chain vertex rowIdx values must be remapped via `rowMapping`
- This remapping is done inside `buildCDTOuterWall` → correct ✅

If CIFAG is built AFTER row insertion:
- `unionU` is built with chain U positions → correct ✅
- `tPositions` already expanded → but CIFAG doesn't use tPositions
- Same remapping applies

**Both orderings work** because CIFAG only uses U-positions (T-independent) and the rowIdx remapping is handled inside `buildCDTOuterWall` regardless of external ordering.

But I note that my original sequencing diagram (Addition 3 in my first review) had Phase 7 (Feature-Aware Grid) AFTER Phase 6 (row insertion) — which matches the Generator. So we actually agreed. The Generator's Challenge 5 is based on a misreading of my Addition 3.

---

## PART 6: The Agreed Architecture — What We're Building

After two rounds of review, here is the architecture both instances have converged on:

### The Kill List (Unchanged) ✅
- Remove UV-snapping loop (OWT ~707-755)
- Remove `localOnlyMode` flag and all conditionals
- Remove `buildUnionFeatureGrid` call and FLANK_OFFSETS system
- Remove `insertGradedTransitionVertices` call (CIFAG replaces it)

### The Build List (Refined)
| Component | Source | Status |
|-----------|--------|--------|
| `buildCIFAGrid` — Gaussian density with mandatory chain columns | Generator proposal (Section 2.1) | **APPROVED** — add per-chain U clustering |
| `buildFeatureEdgeGraphFromChainEdges` swap at PEC L1304 | Pre-existing code ([FeatureEdgeGraph.ts L281](src/renderers/webgpu/parametric/FeatureEdgeGraph.ts#L281)) | **APPROVED** — add seam guard (~3 lines) |
| Chain vertex substitution in CDT strip builder | Generator proposal (Section 2.4) | **APPROVED** — implement in botRow/topRow construction |
| Adaptive prominence: `max(0.0005, max(0.5*MAD, 0.0003*meanR))` | Generator proposal S6, Verifier accepted | **APPROVED** |
| Confidence-weighted FQS (CC, AQ, TG, EP, R2) | Generator proposal S5 | **APPROVED** — compute smoothConf as post-processing |
| `detectHorizontalFeatures` opt-in flag | Generator/Verifier agreement | **APPROVED** |
| Metric-distorted CDT (stretch compensation) | Original agreement, reconfirmed | **APPROVED** — single-pass, no dual-phase |

### The Priority Order (Final)
| Priority | What | Risk | Dependencies |
|----------|------|------|-------------|
| **P0** | Remove UV-snapping + localOnly gates | Low | None |
| **P0** | Swap to `buildFeatureEdgeGraphFromChainEdges` (+ seam guard) | Low | None |
| **P0** | `buildCIFAGrid` implementation (with per-chain U clustering) | Medium | Requires chain vertex U positions post-resnap |
| **P0** | Chain vertex substitution in CDT strip builder | Medium | Must be implemented with CIFAG |
| **P1** | Adaptive prominence | Low | Independent of CIFAG |
| **P1** | Metric-distorted CDT | Medium | `estimateCircumferentialStretch` already exists |
| **P2** | Confidence-weighted FQS metric | Low | Post-tessellation measurement |
| **P2** | `detectHorizontalFeatures` flag | Low | Rename of existing gate |
| **P3** | Bidirectional chain linking | Low | Independent improvement |

### What's NOT Being Built
- Dual-Phase CDT (S1) — rejected
- Eliminate Chain Linking (S3) — rejected
- GPU-Accelerated Detection (S4) — deferred
- Progressive Chain Refinement (S2) — deferred until empirical evidence of need
- Transition vertex ring expansion — replaced by CIFAG

---

## PART 7: Open Items for the Implementing Agent

These are the remaining detailed specs that the implementing agent needs from the Generator (or from us jointly):

### Open Item 1: CIFAG Per-Chain U Clustering Spec

The Generator's `buildCIFAGrid` takes `chainVertexUs: number[]` (deduplicated, sorted). Specify:
- How to compute one representative U per chain: median, mean, or mode of the chain's resnap'd point U values?
- What tolerance for clustering? I recommend `FEATURE_CLUSTER_RADIUS = 0.002` (already defined in [GridBuilder.ts line 61](src/renderers/webgpu/parametric/GridBuilder.ts#L61))
- Should different-kind chains at similar U positions (peak at 0.254, valley at 0.256) produce separate columns or merge? Separate — they're distinct features.

### Open Item 2: Seam Guard for `buildFeatureEdgeGraphFromChainEdges`

Add to the function body at [FeatureEdgeGraph.ts L302](src/renderers/webgpu/parametric/FeatureEdgeGraph.ts#L302):
```typescript
// Before pushing edge to edges[]:
// Seam guard: skip edges where vertices are > 0.4 apart in U
// (requires accessing chain vertex U positions via chainVertexUs map)
```
Need access to chain vertex U positions inside this function. The Generator should specify how to pass this data — either via an additional parameter or by enriching `chainEdges` tuples.

### Open Item 3: CDT Strip `botRow`/`topRow` Substitution Logic

Currently at [OWT lines 1017-1050](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1017), `botRow` and `topRow` are built from merged grid + chain vertices. Under CIFAG substitution:
- For each chain vertex in the band: find its corresponding grid column (exact match by injection)
- When building `botRow`/`topRow`: skip the grid vertex at that (row, col) if a chain vertex substitutes it
- Ensure the StripVertex for the chain vertex has `isChain: true` and uses `cv.vertexIdx` (not grid index)

This needs precise specification because `botRow`/`topRow` are used for both CDT triangulation and constraint edge filtering.

### Open Item 4: CIFAG Budget Bisection with Wrapped U

The `circularDistance` function in the Gaussian density computation must handle U-wrapping at 0/1 boundary. For a chain at U=0.98, the Gaussian should spread density to BOTH sides — toward U=0.97 (left) AND past U=1.0 wrapping to U=0.01 (right).

The playbook's adaptive walk (`u += adaptiveStep; if u < 1 - 1e-7: push`) doesn't handle this — it walks from 0 to 1 without wrapping. The Gaussian contribution from a chain near U=1.0 needs to affect the beginning of the walk (near U=0.0).

**Fix:** Extend `chainVertexUs` with wrapped copies: for each chain U > 0.9, add `u - 1.0` to the list; for each chain U < 0.1, add `u + 1.0`. This creates virtual features that the Gaussian walk sees across the boundary.

---

## PART 8: Final Verdict

**Generator Response Quality: 9/10.** All three gaps genuinely closed. CIFAG is an elegant structural solution that replaces three fragile mechanisms with one clean abstraction. The hybrid prominence formula is well-reasoned. The Q1-Q6 answers are thorough and code-verified.

**Remaining concerns (minor):**
1. Seam guard on `buildFeatureEdgeGraphFromChainEdges` (3-line fix)
2. Per-chain U clustering in CIFAG input (spec needed)
3. Wrapped U in CIFAG Gaussian walk (needs virtual feature wrapping)
4. CDT strip substitution logic detail (implementation spec needed)

**None of these are architectural — they're implementation details.** The architecture is sound. We're aligned.

**Recommendation to human coordinator:** The joint plan is ready for the implementing agent. The remaining open items (1-4 above) are small enough to be resolved during implementation. The P0 items should be implemented together as an atomic change — they're interdependent.

---

*— Verifier Round 2, 2026-03-03. Architecture approved. CIFAG is the play. Ship it.*
