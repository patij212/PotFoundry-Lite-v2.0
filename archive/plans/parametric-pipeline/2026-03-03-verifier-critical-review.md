# Verifier Critical Review — Attacking the Redesign Plan & Joint Playbook

**Date:** 2026-03-03  
**Role:** Verifier (Claude Opus — third instance)  
**Reviewing:** `2026-03-02-column-detection-horizontal-lines-fix.md` (Opus A original plan),  
`2026-03-03-opus-b-review-of-redesign-plan.md` (Opus B review),  
`2026-03-03-joint-implementation-playbook.md` (Joint playbook)  
**Method:** Code-verified adversarial review — every claim checked against actual source  
**Verdict:** The diagnosis is mostly sound. The proposed remedies have **three critical logical gaps** and **two hidden landmines** that will cause the implementation to fail or regress if not addressed.

---

## Part 1: What Both Instances Got RIGHT (Confirmed Against Code)

These claims survive scrutiny. I verified each against the actual source.

| Claim | Verification | Status |
|-------|-------------|--------|
| `localOnlyMode: true` is the UI default | ExportDialog.tsx line 142 | ✅ Confirmed |
| Column probing gated behind `!cfgLocalOnly` | PEC line ~860 | ✅ Confirmed (Opus A said ~801; Opus B corrected to 860 implicitly — actual is 860) |
| `unionU = outerBaseU` in localOnly mode | PEC lines 1180-1192 | ✅ Confirmed |
| `maxRowInsertions = 0` in localOnly mode | PEC line ~1056 | ✅ Confirmed |
| `minProminence = 0.005` hardcoded default | FeatureDetection.ts line 204 | ✅ Confirmed |
| `detectAllRowFeatures` does NOT override prominence | FeatureDetection.ts line ~490 | ✅ Confirmed |
| R2 violation counting is observational only | ChainStripTriangulator.ts lines 497-521 | ✅ Confirmed |
| `insertGradedTransitionVertices` loops only over `[bot.rowIdx, top.rowIdx]` | OWT lines 390-410 | ✅ Confirmed |
| Grid-proximity rejection at `1e-6` threshold | OWT lines 330-334 | ✅ Confirmed |
| UV-snapping overwrites grid vertex positions | OWT lines ~707-732 | ✅ Confirmed |
| Chain strip detection is hybrid (index + UV-proximity) | ChainStripOptimizer.ts lines 439-448 | ✅ Confirmed |
| Seam handling via `circularSignedDelta` in ChainLinker.ts | ChainLinker.ts lines 56-63, 354, 386-387 | ✅ Confirmed |

**Summary:** The factual foundation is solid. Both instances did proper code archaeology.

---

## Part 2: Critical Logical Gaps — Things That Will Break

### GAP A: The "Just Remove UV-Snapping" Proposal Ignores How `buildFeatureEdgeGraphFromGrid` Works

**The claim** (Opus B review + joint playbook Section 1.1): "Remove the UV-snapping loop (OWT lines 693-755), keep chain vertices as-is. Chain vertices already have indices >= gridVCount."

**The problem they missed:**

`buildFeatureEdgeGraphFromGrid` (FeatureEdgeGraph.ts lines 169-262) builds the feature edge graph by snapping chain points to the **nearest grid column**:

```typescript
// Snap chain U to nearest grid column (binary search)
vertexIdx = finalRow * numU + col;
```

This means the `FeatureEdgeGraph` stores **grid vertex indices** as edge endpoints, not chain vertex indices. The entire downstream pipeline (`isFeatureEdge`, `ChainStripOptimizer` constraint preservation, `SeamTopology` healing) works with these grid-snapped indices.

**If you remove UV-snapping but keep `buildFeatureEdgeGraphFromGrid` as-is:**
1. The feature edge graph maps to grid vertex positions that DON'T match the chain's actual U
2. `isFeatureEdge(a, b)` will check grid vertex pairs, but chain vertices live at different indices
3. **Edge protection breaks entirely** — MeshOptimizer, AdaptiveRefinement, and SeamTopology will not know which edges are feature edges because the graph references grid positions while the actual geometry uses chain vertex positions

**This is a showstopper.** You can't remove UV-snapping without also rewriting `buildFeatureEdgeGraphFromGrid` to reference chain vertex indices (idx >= gridVCount) instead of grid vertex indices (idx = row * numU + col).

**The fix both instances should have proposed:** When removing UV-snapping, `buildFeatureEdgeGraphFromGrid` must be updated to use `cv.vertexIdx` (the chain vertex's own index in the combined vertex buffer) instead of `finalRow * numU + col`. This is a surgical change but it's a prerequisite for Phase 1, not an afterthought.

### GAP B: The Feature-Aware Grid (Gaussian Density) Has a Fatal Circularity Problem

**The claim** (Opus B review Idea 1, Joint Playbook Section 5): Replace `buildUnionFeatureGrid` with a Gaussian density walk that places columns adaptively near feature positions.

**The circularity:**

1. Feature positions are detected by `detectAllRowFeatures` using **row probe data** sampled on a **uniform U grid** (the `rowProbeSamples = 8192` high-res probing in Phase 2.5)
2. The detected features are u-positions in [0,1) that are independent of the mesh grid
3. The Feature-Aware Grid is built from these u-positions ✅ — no circularity here

BUT:

4. The chain linking step (`linkFeatureChainsByKind`) produces chains with u-positions at each row
5. These chain u-positions go through **GPU resnap** which refines them to sub-sample precision
6. After resnap, the chain vertex u-positions are **not guaranteed to align with any grid column** in the new Feature-Aware Grid
7. When `buildCDTOuterWall` receives these chain vertices + the Feature-Aware Grid, it needs to stitch chain vertices into the grid topology
8. **If the Feature-Aware Grid was computed from pre-resnap feature U positions, but chain vertices have post-resnap U positions, the Gaussian density peaks are offset from the actual chain vertices**

The offset is small (sub-sample precision, typically < 0.0002 in U), but the Gaussian sigma is `2 * baseSpacing ≈ 2 * 0.00136 ≈ 0.0027`. A 0.0002 offset relative to a 0.0027 sigma is ~7% displacement — negligible for density shaping, but it means **no Feature-Aware Grid column will be exactly at a chain vertex's U**.

**Why this matters:** The plan calls for Feature-Aware Grid to REPLACE transition vertices ("No transition vertices needed: Grid itself provides the transition density" — Playbook Section 5.2). But if grid columns don't coincide with chain vertices, you STILL need a mechanism to connect chain vertices to the grid. You're back to the original problem: chain vertices floating between grid columns.

**The fix:** Feature-Aware Grid cannot replace transition vertices unless it's rebuilt AFTER GPU resnap using the final chain vertex U positions. This creates a sequencing constraint:

```
Current: detect → link → resnap → build grid → tessellate
Needed:  detect → link → resnap → build grid(using resnap'd positions) → tessellate
```

This is achievable but the playbook doesn't mention it. Without this fix, Feature-Aware Grid provides nice density gradients but still has floating chain vertices.

### GAP C: Multi-Row Ring Expansion (Playbook Section 2.2) Creates a Quadratic Vertex Explosion

**The claim** (Playbook Section 2.2): Expand transition rings from `[bot.rowIdx, top.rowIdx]` to `[bot.rowIdx - ring, top.rowIdx + ring]` for each ring level.

**The math the playbook provides:**
> "Ring 6 covering 13 rows × 2 sides = 26 vertices per edge. With ~250 feature edges, that's ~6,500 vertices at ring 6 alone. Total across all rings: ~25,000 vertices."

**The math is wrong.** Let me redo it:

- Ring 1: rows = [bot-1, top+1] → 3 rows (for edge spanning 1 row), 2 sides each → 6 vertices
- Ring 2: rows = [bot-2, top+2] → 5 rows, 2 sides → 10 vertices
- Ring 3: 7 × 2 = 14
- Ring 4: 9 × 2 = 18
- Ring 5: 11 × 2 = 22
- Ring 6: 13 × 2 = 26
- **Total per edge:** 6+10+14+18+22+26 = **96 vertices**
- **With 250 feature edges:** 96 × 250 = **24,000 vertices** (playbook said ~25,000 — close enough)

But wait — **250 feature edges is the PRIMARY edge count** (pointIdx >= 0 on both endpoints). The actual `featureEdges` array passed to `insertGradedTransitionVertices` includes ALL chain path edges, which is **~7,184** (from the Round 2 fix log). Even after the Gap 1 fix from `2026-03-01-chain-strip-fix-round-2.md` (filtering to pointIdx >= 0 only), the edge count depends on the style.

**For a style with 20 ridges × ~60 rows × 2 edges per vertex = ~2,400 feature edges:**
- Total transition vertices: 96 × 2,400 = **230,400 vertices**
- The `maxVertices = 10,000` cap will bail out extremely early
- With 10,000 vertices spread across 2,400 edges → **~4 vertices per edge** → only ring 1-2 complete, rings 3-6 starved

**For a style with 40 ridges:** Double the above. The cap bails at ring 1.

**The real problem:** The playbook's budget concern says "Consider reducing maxRings from 6 to 4" — this is not enough. With 2,400+ edges, even maxRings=2 exhausts the 10,000 vertex budget. The current `maxVertices` default is woefully undersized for the multi-row expansion.

**Options:**
1. **Raise maxVertices significantly** (to 50,000-100,000) — but this increases memory and tessellation time
2. **Budget per-edge** instead of globally — each edge gets `maxVertices / numEdges` transition vertices. With 2,400 edges and 50,000 budget, that's ~21 per edge → 3 rings with multi-row
3. **Use Feature-Aware Grid instead** (Opus B's Idea 1) — but this has its own Gap B problem
4. **Only expand to multi-row for the outermost 2 rings** — rings 1-4 stay same-row, rings 5-6 expand. This limits the vertex explosion while still providing 2D density at the grid boundary

**My recommendation:** Option 4 (hybrid) or a reworked option 2 (per-edge budget). The current playbook proposal will silently degrade to no transition density for most real-world styles.

---

## Part 3: Hidden Landmines — Risks Neither Instance Identified

### LANDMINE 1: The Constraint Edge Duplication in CDT When Chain Vertices Are First-Class

When UV-snapping is active, chain "vertices" are just moved grid vertices. There's one vertex at each (row, col) position. The CDT constraint edges connect consecutive chain vertex pairs.

When UV-snapping is removed and chain vertices become first-class (idx >= gridVCount), there are now TWO vertices near each chain position: the original grid vertex at (row, nearestCol) and the chain vertex at (row, chainU). If both are fed to the CDT, the constraint edge system gets confused:

- Feature edge graph says `edge(gridVertexA, gridVertexB)` (via `buildFeatureEdgeGraphFromGrid` — see Gap A)
- Chain path edges say `edge(chainVertexA, chainVertexB)` (via the chain vertex indices)
- Both vertex sets are at nearly the same position
- CDT receives near-duplicate vertices and constraint edges that reference different vertex sets

**Result:** CDT produces valid triangulation of a degenerate point set. Some triangles will have zero area (two of their three vertices coincide within floating-point tolerance). The dedup pass at OWT line ~1145-1197 uses a `1e-5` spatial hash, which should handle exact coincidences but will miss near-misses (chain at U=0.2543, grid at U=0.2545 — gap of 0.0002 >> 1e-5).

**This is exactly what Opus B flagged as "Risk 7" in their review**, but neither the playbook nor the implementation sketch provides a concrete solution. "Snap the nearest column to the chain's U (or vice versa) within MIN_U_SEPARATION (0.0005)" is essentially UV-snapping-lite — doing the same thing they just removed, but with a tighter threshold.

**My take:** The correct architectural answer is: **don't feed the grid vertex at the chain's nearest column to the CDT at all.** When building the CDT strip vertex set, if a grid vertex is within MIN_U_SEPARATION of any chain vertex, **exclude the grid vertex and let the chain vertex take its topological role.** This is vertex substitution, not vertex snapping. The grid vertex is still in the vertex buffer (for the non-strip regions), but within the strip, the chain vertex replaces it.

### LANDMINE 2: The `insertChainGuidedRows` Function Returns a `rowMapping` That Changes Vertex Indices — But Feature-Aware Grid Is Built BEFORE Row Insertion

**The sequencing in PEC:**

1. Line ~1056: `maxRowInsertions` computed
2. Line ~1060: `insertChainGuidedRows(tPositions, chains, maxRowInsertions, ...)` → returns new `tPositions` + `rowMapping`
3. Line ~1180: `unionU = buildUnionFeatureGrid(outerBaseU, ...)` (or `outerBaseU` in localOnly)
4. Later: `buildCDTOuterWall(chains, rowMapping, tPositions, unionU, ...)`

When `localOnlyMode` is removed (Playbook Section 1.2-1.3), row insertion becomes active. The `rowMapping` remaps original row indices to new row indices (with inserted rows). But:

- Chain feature positions were detected at ORIGINAL row indices
- The `linkFeatureChainsByKind` uses original row indices
- GPU resnap produces chain vertices with original row indices
- `insertChainGuidedRows` changes the row indexing

**The chain's `rowIdx` values must be remapped through `rowMapping` before being passed to `buildCDTOuterWall`.** Does this happen?

Looking at the actual code flow in PEC: `buildCDTOuterWall` receives `rowMapping` as a parameter, and OWT uses it internally to map chain vertex rows. So yes, the mapping IS applied inside `buildCDTOuterWall`. But:

**The Feature-Aware Grid (Playbook Section 5) uses feature U positions from chains, which are row-indexed.** If the grid is built BEFORE row insertion (step 3 happens after step 2), the grid is correct — it only cares about U positions, not row indices. But if you move grid building to AFTER resnap (as Gap B requires), you must also ensure it happens AFTER row insertion, because the resnap'd chain may reference pre-insertion rows.

**This is a sequencing constraint that isn't documented anywhere.** The correct order must be:

```
detect → link → resnap → insertRows → buildFeatureAwareGrid(resnap'd U positions) → buildCDTOuterWall
```

NOT:

```
detect → link → resnap → buildFeatureAwareGrid → insertRows → buildCDTOuterWall
```

The playbook's kill list (Section 1.2-1.3) removes the localOnly gates but doesn't explicitly address this ordering dependency.

---

## Part 4: Disagreements with Specific Proposals

### 4.1 Opus B's "Prominence as Relative Deviation" (stdDev-based) — I DISAGREE

**The proposal:** `adaptiveProminence(row) = max(0.0005, 0.5 * stdDev(radii_in_row))`

**Why I disagree:**

StdDev is a measure of the **total variability** in the row, not the characteristic feature size. Consider:

- **Style with 20 equal ridges:** Each ridge has prominence P. The stdDev of a sum of N equal-height ridges on a circle is approximately `P / sqrt(2)` (for a sinusoidal profile). So `0.5 * stdDev ≈ 0.35 * P`. This means the threshold is 35% of the actual feature prominence — you'll detect all features. ✅

- **Style with 1 large ridge + 19 small ridges:** The large ridge dominates stdDev. Small ridges with prominence < 35% of the large ridge get rejected. This is the OPPOSITE of what you want — the small ridges are the ones that need the most help surviving the threshold. ❌

- **Smooth row with only numerical noise:** stdDev ≈ noise level. `0.5 * stdDev ≈ 0.5 * noise`. You detect noise as features. The floor of 0.0005mm may save you, but only for very clean data. ❌

**StdDev is sensitive to outliers and doesn't represent the typical feature scale.** A single anomalous sample (GPU floating-point glitch, a spike from the seam) can inflate stdDev and suppress all genuine features in that row.

**My counter-proposal:** Use **median absolute deviation (MAD)** instead of stdDev:

```typescript
const sorted = Array.from(radii).sort((a, b) => a - b);
const median = sorted[Math.floor(probeSamples / 2)];
const absDevs = radii.map(r => Math.abs(r - median));
absDevs.sort((a, b) => a - b);
const mad = absDevs[Math.floor(probeSamples / 2)];
const adaptiveMinProm = Math.max(0.001, 1.0 * mad);
```

MAD is robust to outliers, represents the "typical deviation" rather than "RMS of all deviations", and naturally scales with the surface texture. It's O(n log n) instead of O(n) due to sorting, but with n=8192 this is trivial.

**Or even simpler:** Just use Opus A's original `max(0.001, 0.0003 * meanRadius(row))`. It's less clever but far more predictable. The radius-proportional approach has a simple geometric interpretation: features must be at least 0.03% of the local circumference to qualify. This is style-agnostic in the right way.

### 4.2 The FQS Metric Weights — The CC Component Is Misleading

**The FQS formula:**
```
FQS = 0.25 * CC + 0.25 * AQ + 0.20 * TG + 0.20 * EP + 0.10 * R2
```

**CC (Chain Continuity)** = `(total chain points with pointIdx>=0) / (detected features × non-gap rows)`

**Problem:** CC measures the ratio of features that ended up in chains, but doesn't measure whether the chains are CORRECT. A chain linker that aggressively links unrelated features (cross-assignment — Root Cause 4) will produce high CC (many points in chains) but terrible mesh quality (chains connect wrong features). CC measures quantity, not quality.

**Better CC:** Weight chain points by their linking confidence. The chain linker already has distance-based matching — use `1 - (matchDistance / CHAIN_LINK_RADIUS)` as a per-point weight. High-confidence links (close matches) contribute more to CC than desperate long-range links.

### 4.3 Column Detection: Keep Behind Flag vs. Remove — I AGREE WITH OPUS B (Keep)

Opus A (original plan) says remove entirely. Opus B says keep behind `detectHorizontalFeatures: boolean`.

I agree with Opus B. The code is tested and working. Removing working, debugged code because it's currently disabled is wasteful. The `taper-subtraction` logic (v17.1) is mathematically sound — it correctly subtracts the taper profile before looking for T-direction features. The problem was never that the code is wrong; it's that it runs on a disabled path. Hiding it behind an opt-in flag is the correct engineering decision.

### 4.4 The Feature-Aware Grid vs. Transition Vertices — Both Required, Not Either/Or

The playbook presents Feature-Aware Grid and transition vertices as alternatives (Section 5.2: "No transition vertices needed"). This is wrong.

**Feature-Aware Grid** provides smooth density gradients in the **grid structure** (column positions). This improves triangle quality in grid-only regions.

**Transition vertices** provide density at the **chain-grid interface** (where chain vertices connect to the grid). This is a local stitching problem that the grid structure cannot solve because chain vertices are OFF-grid by definition (they're at arbitrary U positions, not grid columns).

Even with a Feature-Aware Grid that's dense near features, a chain vertex at U=0.2543 still sits between grid columns at U=0.2541 and U=0.2547. The triangles connecting this chain vertex to the grid need transition density. Feature-Aware Grid makes those triangles's neighbors better-shaped, but it doesn't eliminate the stitching problem.

**Both mechanisms serve different purposes and should coexist.** Feature-Aware Grid for global density shaping, transition vertices for local chain-grid stitching.

---

## Part 5: What I Would Add to the Plan

### Addition 1: Chain Vertex Substitution Protocol

When removing UV-snapping, define a clear protocol for how chain vertices interact with the grid in CDT:

```
For each chain vertex cv at (u_chain, rowIdx):
    1. Find nearest grid column: col = bsearchFloor(unionU, u_chain)
    2. If |unionU[col] - u_chain| < MIN_U_SEPARATION (0.0005):
        → Mark grid vertex (rowIdx, col) as SUBSTITUTED
        → In CDT strip: use cv.vertexIdx instead of grid vertex index
        → Grid vertex is excluded from strip triangulation
    3. Else:
        → Chain vertex is a FREE vertex (no grid substitution)
        → Transition vertices provide density bridge
```

This avoids near-degenerate triangles (Landmine 1) without re-introducing UV-snapping.

### Addition 2: Feature Edge Graph Must Use Chain Vertex Indices

Update `buildFeatureEdgeGraphFromGrid` to use chain vertex's own indices:

```typescript
// CURRENT (broken after UV-snap removal):
vertexIdx = finalRow * numU + col;

// FIXED:
vertexIdx = cv.vertexIdx;  // Use the chain vertex's global index
```

This is prerequisite for Phase 1 and is NOT mentioned in either the playbook or the review.

### Addition 3: Sequencing Diagram for the Revised Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: GPU Curvature Sampling (16 strips × 4096)             │
├─────────────────────────────────────────────────────────────────┤
│ Phase 2: detectFeatureEdges (T + U) on curvature data          │
├─────────────────────────────────────────────────────────────────┤
│ Phase 2.5: Per-row U-direction probing (8192 samples/row)      │
├─────────────────────────────────────────────────────────────────┤
│ Phase 3: detectAllRowFeatures (with ADAPTIVE PROMINENCE)       │
│          → uses per-row meanRadius or MAD for threshold        │
├─────────────────────────────────────────────────────────────────┤
│ Phase 4: linkFeatureChainsByKind (peak/valley separation)      │
├─────────────────────────────────────────────────────────────────┤
│ Phase 5: GPU Resnap (parabolic refinement at 20× resolution)   │
│          → chain vertex U positions are now sub-sample precise │
├─────────────────────────────────────────────────────────────────┤
│ Phase 6: insertChainGuidedRows                                 │ ← ALWAYS (no localOnly gate)
│          → tPositions expanded, rowMapping computed             │
├─────────────────────────────────────────────────────────────────┤
│ Phase 7: buildFeatureAwareGrid(resnap'd chain U positions)     │ ← AFTER resnap + row insertion
│          → smooth Gaussian density near features               │
│          → budget-capped, deterministic                        │
├─────────────────────────────────────────────────────────────────┤
│ Phase 8: buildCDTOuterWall                                     │
│   8a: Create grid vertices on Feature-Aware Grid               │
│   8b: Create chain vertices (idx >= gridVCount, exact U)       │
│   8c: Chain Vertex Substitution (exclude near-coincident grid) │
│   8d: insertGradedTransitionVertices (multi-row, per-edge cap) │
│   8e: CDT triangulation per strip band                         │
│   8f: buildFeatureEdgeGraph (using cv.vertexIdx)               │
├─────────────────────────────────────────────────────────────────┤
│ Phase 9: ChainStripOptimizer (edge flips, angle optimization)  │
│          → isFeatureEdge protects chain edges                  │
├─────────────────────────────────────────────────────────────────┤
│ Phase 10: Post-processing (subdivision, refinement, welding)   │
│           → isFeatureEdge protects chain edges                 │
├─────────────────────────────────────────────────────────────────┤
│ Phase 11: FQS Metric Computation                               │
│           → CC, AQ, TG, EP, R2 → grade badge                  │
└─────────────────────────────────────────────────────────────────┘
```

### Addition 4: Concrete Test for Each Critical Fix

| Fix | Test | Pass Criterion |
|-----|------|---------------|
| UV-snap removal | No grid vertex has been moved from its uniform position | `∀v ∈ gridVertices: v.u === unionU[v.col]` |
| Feature edge graph uses chain indices | All edge endpoints have `idx >= gridVCount` | `∀(a,b) ∈ featureEdges: a >= gvCount && b >= gvCount` |
| Chain vertex substitution | No triangle has both a chain vertex and its nearest grid vertex | `∀tri: ¬(hasChainV(tri) ∧ hasSubstitutedGridV(tri))` |
| Multi-row transition rings | Ring k vertices span `top.rowIdx - bot.rowIdx + 2k` rows | Spatial extent check |
| Per-edge transition budget | Each edge gets `≥ 4` transition vertices | `∀edge: ringVerts(edge) >= 4` |
| Adaptive prominence | Row with meanRadius=5mm detects features at 0.002mm prominence | Synthetic test with known features |
| Feature-Aware Grid density | Grid spacing at feature U is `< 0.5 * baseSpacing` | Direct spacing check |
| FQS ≥ 0.85 for all default styles | Integration test over each style preset | FQS per style |

---

## Part 6: Revised Priority Order (Disagreements Highlighted)

The joint playbook's priority order is mostly correct. I propose one change:

| Priority | Playbook Says | I Say | Reason |
|----------|--------------|-------|--------|
| **P0** | Phase 1+2 together (remove UV-snap, fix transition rings) | **Phase 1 + Gap A fix + Addition 1 + Addition 2** together | UV-snap removal is useless without fixing the feature edge graph and adding the substitution protocol. Transition ring multi-row can be P0.5. |
| **P0** | Phase 5 (remove localOnly gates) | Agree — but **add explicit sequencing constraint** (Landmine 2) | Must ensure row insertion happens before Feature-Aware Grid build |
| **P1** | Feature-Aware Grid | **Feature-Aware Grid + Transition Vertices TOGETHER** | They're complementary, not alternatives (Section 4.4) |
| **P1** | Adaptive prominence (stdDev) | **Adaptive prominence (radius-proportional or MAD)** | StdDev is fragile (Section 4.1) |
| **P2** | Metric-distorted CDT | Agree | High impact, low risk |
| **P2** | Chain linking improvements | Agree | Incremental |
| **P3** | Column detection behind flag | Agree | Cleanup, not urgent |

---

## Part 7: Questions and Challenges for the Generator

These are questions I want the Generator to answer before implementation proceeds. I need written responses, not hand-waves.

### Q1: Feature Edge Graph Rewrite Scope
The feature edge graph currently uses `finalRow * numU + col` as vertex indices. When we switch to `cv.vertexIdx`, we need to ensure ALL consumers of `isFeatureEdge` still work. List every call site and confirm the index domain change is compatible.

### Q2: CDT Vertex Set Construction
After UV-snap removal + chain vertex substitution, what EXACTLY is the vertex set fed to `cdtTriangulateStrip`? Write the pseudocode for constructing this set, accounting for:
- Grid vertices (some substituted/excluded)
- Chain vertices (idx >= gridVCount)
- Transition ring vertices (idx >= gridVCount + chainVCount?)
- Near-coincident dedup

### Q3: Feature-Aware Grid + Transition Vertices Integration
If both coexist (my position), specify: does the Feature-Aware Grid make the transition vertex placement more effective (because grid columns are closer to chain positions, so rings are better-anchored) or less effective (because grid-proximity rejection triggers more often with denser columns)?

### Q4: Transition Vertex Budget Arithmetic
With 20 ridges × ~60 feature rows × 2 edges_per_vertex = 2,400 feature edges, and maxVertices=10,000:
- How many rings can each edge get? Show the math.
- Is this sufficient for R2 compliance?
- What maxVertices value is needed for 3 complete rings with multi-row expansion?

### Q5: The Seam Chain Problem
Opus B flagged Risk 9: chains crossing the 0°/360° seam. `circularSignedDelta` handles linking, but does `insertGradedTransitionVertices` correctly place ring vertices that wrap around U=0/U=1? Show the specific code path.

### Q6: Regression Testing Strategy
The playbook says "Golden mesh comparison at 3 resolutions." Which specific golden meshes? From which styles? At which parameter values? Without this specificity, "regression test" is meaningless.

---

## Part 8: Verdict & Recommendation

**Diagnosis quality:** 9/10 — both instances correctly identified the root causes. The five root causes in the original plan are accurate and well-evidenced.

**Remedy quality:** 6/10 — the proposed fixes have the right intent but three critical implementation gaps (Feature Edge Graph rewrite, Feature-Aware Grid circularity, transition vertex budget exhaustion) will cause implementation to fail or silently degrade.

**Recommendation:** Before any implementation begins:
1. **Close Gap A** — write the `buildFeatureEdgeGraphFromGrid` rewrite spec
2. **Close Gap B** — specify the pipeline sequencing with Feature-Aware Grid happening AFTER resnap
3. **Close Gap C** — rework the transition vertex budget model (per-edge or hybrid rings)
4. **Address Landmine 1** — write the chain vertex substitution protocol
5. **Address Landmine 2** — document the sequencing constraint for row insertion vs. grid build

Only then should the implementing agent start writing code.

---

*— Verifier, 2026-03-03. The diagnosis is good. The remedies need surgical refinement before the scalpel hits the code.*
