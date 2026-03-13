# Generator Round 18.1 — Revised Proposals for Grid-Bleeding Chain Strip Fix

Date: 2026-03-05

## Problem Statement

34,726 R2 violations (22% of chain-strip triangles): CDT boundary constraint edges between consecutive strip boundary vertices force grid→chain connections. The Verifier's Round 18 critique demonstrated that P1 (boundary thinning with guard margin) is a mathematical no-op: with `expansion=4`, single-chain strips are 9 columns wide and `guardMargin = max(1, 4) = 4` keeps ALL interior columns. The Catch-22: guard margin must equal expansion for manifold safety, but this means zero vertices removed.

The root cause analysis stands: R2 violations originate from CDT boundary constraint edges at [ChainStripTriangulator.ts lines 204-216](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L204-L216). The problem is the PRESCRIPTION, not the DIAGNOSIS.

## Direction Analysis

### Direction A: Unconstrained Row Boundaries — REJECTED

**Idea**: Remove CDT constraint edges between consecutive `stripBot`/`stripTop` vertex pairs. CDT still triangulates all boundary points but uses Delaunay criterion instead of forced sequential connectivity.

**Analysis**: This fails at manifold matching. Two adjacent CDT strips sharing a row boundary must produce identical edge decompositions along that row. Currently, boundary constraint edges guarantee this: identical boundary vertex sequences + identical boundary constraints = identical boundary edges.

Without row boundary constraints, the Delaunay triangulation of each band depends on its ENTIRE point cloud — including the non-shared row and interior points, which DIFFER between adjacent bands. CDT on band j (rows j to j+1) and CDT on band j+1 (rows j+1 to j+2) would compute different interior triangulations. The edges along shared row j+1 would follow different Delaunay patterns in each band, creating T-junctions and non-manifold edges.

**Proof of failure**: Band j has interior points from row j; band j+1 has interior points from row j+2. These differing interior geometries influence the Delaunay criterion at the shared row. CDT with identical boundary points but different interior points produces different triangulations — specifically, different edges along the shared row.

**Left/right boundary constraints** (bot[0]→top[0], bot[-1]→top[-1]) are still present and correctly stitch with standard cells. The failure is specifically in ROW boundary matching between adjacent bands.

**Verdict**: **REJECT**. Direction A trades one manifold problem (R2 staircase) for a worse one (T-junction non-manifold). No modification rescues it without re-introducing boundary constraints.

---

### Direction B: Selective Boundary Constraints — REJECTED

**Idea**: Only constrain grid-grid and chain-chain pairs on boundaries; leave grid-chain pairs unconstrained.

**Analysis**: This is **algebraically equivalent to the current behavior** due to collinearity.

All vertices on a strip row boundary are at the same T-coordinate (tBot or tTop). They form a collinear point set in UV space. When CDT encounters a constraint edge between two grid vertices (e.g., gridCol11→gridCol12) with an intervening collinear point (chainVertA at U between them), CDT **must subdivide the constraint** at the intervening point. This is a fundamental property of CDT: constraint edges cannot "jump over" points that lie exactly on them.

Therefore, the constraint gridCol11→gridCol12 is automatically split into gridCol11→chainVertA + chainVertA→gridCol12 — exactly the edges we currently have. Adding more grid-grid constraints while omitting grid-chain constraints produces the same edge set.

**Formal argument**: Let boundary points be $P_1, P_2, \ldots, P_n$ sorted by U on a row at T = t_0$. All points are collinear at $(u_i, t_0)$. A CDT constraint $P_i \to P_k$ (where $k > i+1$) with intermediate points $P_{i+1}, \ldots, P_{k-1}$ lying ON the constraint line is subdivided into segments $P_i \to P_{i+1}, P_{i+1} \to P_{i+2}, \ldots, P_{k-1} \to P_k$. The result is identical to constraining all consecutive pairs.

**Verdict**: **REJECT**. Direction B is a no-op. Collinearity of row boundary vertices makes selective constraints mathematically equivalent to full constraints.

---

### Direction C: Boundary Vertex Substitution — VIABLE BUT COMPLEX

**Idea**: Replace grid column vertices adjacent to chain vertices on the boundary with feature-following companion vertices at nearby U-positions.

**Analysis**: This has merit but faces a coordination problem at shared rows. Both bands at a shared row must apply the same substitution to produce matching boundary vertex sequences. The substitution depends on the chain vertex positions, which are available to both bands. But the strip width may differ between bands (Verifier C3: 3-way union asymmetry), meaning different grid vertices would be candidates for substitution.

**Key difficulty**: Substituted companion vertices must be allocated with globally unique vertex indices. Both bands must allocate the SAME vertices for the shared row, but band processing is sequential. This requires either:
- A precomputation pass to determine all substitutions
- A deterministic companion allocation keyed by (row, column) that produces identical results regardless of which band triggers it

**Assessment**: Viable in principle, but approximately 2× the implementation complexity of Direction D for similar results. The coordination problem at shared rows is solvable but error-prone. **Set aside in favor of Direction D.**

---

### Direction D: Interior Promotion — RECOMMENDED

**Idea**: Move non-boundary vertices from `stripBot`/`stripTop` to CDT interior free points with a small T-perturbation. CDT receives them as interior Steiner points with full Delaunay edge-creation freedom.

#### Two Variants

**D-Conservative**: Promote only interior GRID vertices. Chain vertices remain on the boundary.
- Boundary becomes: `[col_segStart, chain vertices, col_segEnd]`
- R2 boundary edges: ~2 per row per strip (segStart→chain, chain→segEnd)
- Estimated R2: 2 × 431 rows × 16 strips × 2 boundaries = ~27,584 (21% reduction)
- Manifold risk: requires intersection-safe promotion (see below)

**D-Radical**: Promote BOTH interior grid vertices AND row-boundary chain vertices to interior. Row boundary is PURE GRID.
- Boundary becomes: `[col_segStart, col_{segStart+1}, ..., col_segEnd]`
- R2 boundary edges: **ZERO** (all boundary edges are grid-grid)
- Interior R2 (metric): still triggers for interior Delaunay triangles connecting grid and chain vertices, but these edges follow circumscribed-circle optimality, NOT grid alignment → no visual staircase
- Manifold matching: **automatically guaranteed** (see proof below)
- Feature edges: preserved as interior CDT constraints

#### D-Radical: Detailed Analysis

**Mechanism**: In the strip vertex collection loop at [OuterWallTessellator.ts lines 1108-1130](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1108-L1130):

1. Collect `stripBot`/`stripTop` with ONLY grid column vertices (pure grid boundary)
2. Collect chain vertices from `botRow`/`topRow` into `stripInteriorVerts` instead, with T-perturbation: `tBot + ε` for bot-row chain verts, `tTop - ε` for top-row chain verts
3. Interior grid vertices (columns `segStart+1` through `segEnd-1`) also go to `stripInteriorVerts` with T-perturbation

In `cdtTriangulateStrip()` at [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts):
- Boundary constraint edges: consecutive grid column pairs → all grid-grid → zero R2
- Chain constraint edges: endpoints are chain vertices now at perturbed T positions → interior constraints; CDT enforces them as interior edges
- Interior promoted vertices: participate in CDT with full Delaunay freedom

**Perturbation value**: ε = 0.05 × (tTop − tBot). For band height ≈ 0.0023, ε ≈ 1.15 × 10⁻⁴. In CDT's normalized coordinate space (scale ≈ 0.013 for 9-column strips), this is ≈ 0.009 — well above numerical precision, well below geometric significance.

**Triangle quality near boundaries**: Triangle connecting gridCol_k at (u_k, 0), chain vertex at (u_chain, ε), gridCol_{k+1} at (u_{k+1}, 0). With gridCellWidth ≈ 0.00146 and u_chain near midpoint:
- Edge lengths: ≈ 0.073, 0.073, 0.112 (normalized). Aspect ratio ≈ 1.5:1 — **excellent**.
- The aspect ratio is dominated by U-separation, not ε. Even ε → 0⁺ produces well-shaped triangles because the U-spacing provides the base length.

#### Manifold Proof for D-Radical

**Claim**: With pure-grid row boundaries, manifold matching at shared rows is automatically guaranteed regardless of 3-way union asymmetry.

**Proof**: At shared row j+1 between band j and band j+1:

- Band j strip: columns [segStart_j, segEnd_j]. Bot boundary: pure grid columns [segStart_j, ..., segEnd_j]. CDT boundary constraints: consecutive grid column pairs.
- Band j+1 strip: columns [segStart_{j+1}, segEnd_{j+1}]. Top boundary: pure grid columns [segStart_{j+1}, ..., segEnd_{j+1}]. CDT boundary constraints: consecutive grid column pairs.
- Standard cells fill columns outside each band's strip.

At the shared row, the complete edge set is the union of:
- Band j CDT boundary edges: {col_i → col_{i+1}} for i ∈ [segStart_j, segEnd_j - 1]
- Band j standard cell edges at shared row: {col_i → col_{i+1}} for i ∉ [segStart_j, segEnd_j - 1]
- Band j+1 CDT boundary edges: {col_i → col_{i+1}} for i ∈ [segStart_{j+1}, segEnd_{j+1} - 1]
- Band j+1 standard cell edges at shared row: {col_i → col_{i+1}} for i ∉ [segStart_{j+1}, segEnd_{j+1} - 1]

In ALL cases, whether a column pair is covered by CDT or standard cell, the edge is col_i → col_{i+1}. The edge decomposition along the shared row is **identical** for both bands: it's simply all consecutive grid column pairs across the full row. **QED**.

This proof works regardless of strip width differences between bands. The Verifier's C3 (3-way union asymmetry) is **completely neutralized** by pure-grid boundaries.

#### Chain Constraint Edge Safety

Chain constraint edges connect chain vertices at row j to chain vertices at row j+1. Under D-Radical:
- Bot chain vertex: perturbed to T = tBot + ε
- Top chain vertex: perturbed to T = tTop − ε
- Constraint edge in UV: from (u_chain_bot, tBot + ε) to (u_chain_top, tTop − ε)

This edge lies ENTIRELY within the band interior (T range: [tBot + ε, tTop − ε] ⊂ (tBot, tTop)). It does NOT cross any grid boundary constraint edges (which are at T = tBot or T = tTop). **No crossing constraints** between chain edges and boundary edges. ✓

Can a promoted grid vertex lie ON a chain constraint edge? Promoted grid vertices are at (u_grid, tBot + ε) or (u_grid, tTop − ε). A chain constraint from (u_chain_bot, tBot + ε) to (u_chain_top, tTop − ε) passes through the point (u_grid, tBot + ε) only if u_grid = u_chain_bot AND the constraint is a single point (degenerate). For non-degenerate constraints, the promoted grid vertex is at a different U than the chain vertex (since batch2Remap already handles coincident u-positions). **No collinear conflicts**. ✓

#### R2 Metric Considerations

The current R2 metric flags ANY triangle with both a feature vertex and a grid vertex (`idx < gridVCount`). Under D-Radical, promoted grid vertices are still grid vertices by index. Interior Delaunay triangles connecting promoted grid vertices to chain vertices trigger the R2 metric.

However, these interior edges follow the **Delaunay criterion** (maximize minimum angle), NOT grid alignment. They create smooth, well-shaped triangles without staircase artifacts. The R2 metric is **too conservative** for D-Radical — it counts "false positives" that are geometrically benign.

**Proposal**: Split R2 into two sub-metrics:
- **R2-boundary**: triangle with a feature vertex AND a grid vertex where the connecting edge is a CDT boundary constraint. These are the TRUE staircase edges. D-Radical reduces this to **ZERO**.
- **R2-interior**: triangle with a feature vertex AND a grid vertex where all connecting edges are interior Delaunay edges. These are geometrically benign. D-Radical shifts all R2 violations here.

This decomposition lets the Verifier verify that D-Radical eliminates the STRUCTURAL problem (boundary constraints) while acknowledging that the METRIC has false positives.

---

### Direction E: Post-CDT Edge Collapse — VIABLE SUPPLEMENT

**Idea**: After CDT, collapse edges connecting grid and chain vertices in R2-violating triangles.

**Analysis as primary strategy**: Edge collapse of boundary constraint edges requires global coordination across bands (collapsing a shared-row vertex in one band but not the other creates non-manifold). The link condition checks are O(N) per collapse, and 34K collapses touching ~69K triangles is computationally expensive. As a primary strategy, it's architecturally risky and doesn't address the root cause.

**Analysis as supplement to D-Radical**: With D-Radical, R2 boundary violations = 0. The remaining R2 are interior Delaunay triangles (metric false positives). If the team insists on reducing the R2 COUNT (not just the visual artifacts), Direction E could collapse a subset of interior grid-chain edges. But this is cosmetic metric reduction, not quality improvement.

**Assessment**: Not recommended as primary. Potentially useful as Phase 2 cleanup if R2 count matters independently of visual quality.

---

## Recommended Proposal: D-Radical

### Why D-Radical Over D-Conservative

| Property | D-Conservative | D-Radical |
|---|---|---|
| R2 boundary violations | ~27,584 | **0** |
| Manifold safety | Requires intersection-safe promotion (complex) | **Automatic** (pure-grid boundaries) |
| 3-way union asymmetry (C3) | Must coordinate strip widths between bands | **Neutralized** |
| Implementation complexity | Medium (intersection computation) | **Low** (simple vertex routing) |
| Catch-22 resolved? | Partially (still have boundary R2) | **Fully** (no guard margin needed) |

D-Conservative requires computing the intersection of adjacent bands' strip ranges to determine which grid vertices are safe to promote — reintroducing per-band coordination complexity. D-Radical sidesteps this entirely by keeping ALL grid vertices on the boundary (no promotion decisions needed) and moving only chain vertices to interior.

Wait — I need to clarify. D-Radical promotes chain vertices AND interior grid vertices. Let me re-specify:

**D-Radical precise specification**:
1. `stripBot`/`stripTop` contain ALL grid columns from segStart to segEnd (pure grid boundary, unchanged from current code MINUS the chain vertex interleaving)
2. Row-boundary chain vertices are collected into `stripInteriorVerts` with T-perturbation
3. Interior grid vertices (segStart+1 through segEnd-1) are ALSO moved to `stripInteriorVerts` with T-perturbation
4. Grid vertices at segStart and segEnd remain on the boundary (they stitch with standard cells)

Actually, step 3 is optional. The key insight is step 2: **promoting chain vertices off the collinear boundary is what eliminates R2 boundary edges**. Whether we also promote interior grid vertices is a secondary optimization.

**D-Radical-Minimal** (recommended implementation):
1. Keep ALL grid vertices on `stripBot`/`stripTop` (no change to grid vertex collection)
2. Move chain vertices from `stripBot`/`stripTop` to `stripInteriorVerts` with T-perturbation
3. CDT gets pure-grid boundaries + interior chain vertices + existing companions

This is the simplest version: we just DON'T inject chain vertices into the boundary arrays. The boundary stays pure grid. Chain vertices enter CDT as interior free points alongside the existing T-Ladder companions.

### Implementation Plan

#### Step 1: Modify Strip Vertex Collection (OuterWallTessellator.ts)

Location: [OuterWallTessellator.ts lines 1108-1130](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1108-L1130)

Current code collects all vertices in the U-range into `stripBot`/`stripTop`:
```typescript
for (let bi = 0; bi < botRow.length; bi++) {
    const sv = botRow[bi];
    if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
        stripBot.push(sv);
    }
}
```

Proposed change:
```typescript
const PROMO_EPSILON = 0.05; // fraction of band T-height for perturbation
const tBotVal = activeTPositions[j];
const tTopVal = activeTPositions[j + 1];
const tGap = tTopVal - tBotVal;

for (let bi = 0; bi < botRow.length; bi++) {
    const sv = botRow[bi];
    if (sv.u < uStripLeft - 1e-9 || sv.u > uStripRight + 1e-9) continue;

    if (sv.isChain) {
        // Promote chain vertex to interior with T-perturbation
        stripInteriorVerts.push(sv);
        // Register the chain vertex as a companion-like interior vertex
        // with explicit T value for CDT interior placement.
        // The chain vertex's ChainVertex entry needs a .t field set.
        // We handle this in the CDT function by checking a promotion set.
    } else {
        stripBot.push(sv);  // grid vertex stays on boundary
    }
}
// Same for stripTop (chain vertices perturbed toward tTop - ε)
```

The T-perturbation must be applied in `cdtTriangulateStrip()` when registering promoted chain vertices. The `addVertex()` call for these vertices uses `tBot + ε*tGap` instead of `tBot`:

#### Step 2: Modify CDT Interior Registration (ChainStripTriangulator.ts)

Location: [ChainStripTriangulator.ts lines 188-196](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L188-L196)

Currently, interior vertices are added only if they have explicit `cv.t` (companion T-position):
```typescript
for (const sv of interiorVerts) {
    const cvIdx = sv.idx - gridVCount;
    const cv = chainVerts[cvIdx];
    if (cv?.t !== undefined) {
        addVertex(sv.idx, sv.u, cv.t);
    }
}
```

For promoted chain vertices (which are row-aligned, `cv.t === undefined`), we need to compute the perturbed T:
```typescript
const PROMO_EPSILON = 0.05;
const tGap = Math.abs(tTop - tBot);
const epsilonT = PROMO_EPSILON * tGap;

for (const sv of interiorVerts) {
    const cvIdx = sv.idx - gridVCount;
    const cv = chainVerts[cvIdx];
    if (cv?.t !== undefined) {
        // Existing companion with explicit T
        addVertex(sv.idx, sv.u, cv.t);
    } else if (sv.isChain) {
        // Promoted row-boundary chain vertex: perturb T into band interior
        // Determine if this vertex is from bot or top row
        const isBot = Math.abs(cv?.rowIdx !== undefined
            ? activeTPositions?.[cv.rowIdx] ?? tBot : tBot - tBot) < 1e-9;
        // Simplified: check if closer to tBot or tTop
        const perturbedT = (/* from bot row */ true)
            ? tBot + epsilonT
            : tTop - epsilonT;
        addVertex(sv.idx, sv.u, perturbedT);
    }
}
```

More precisely, the calling code in OuterWallTessellator must signal which row each promoted vertex came from. This can be done by:
- Setting a flag on the StripVertex (add `promotedFromRow?: 'bot' | 'top'`)
- Or passing promoted-bot and promoted-top as separate arrays
- Or using the chain vertex's `rowIdx` field (already available via `chainVerts[idx - gridVCount].rowIdx`)

**Cleanest approach**: Use `chainVerts[sv.idx - gridVCount].rowIdx` to determine if the vertex is from the band's bot or top row. If `rowIdx === j` → perturb from tBot. If `rowIdx === j+1` → perturb from tTop.

#### Step 3: Remap Chain Constraint Edge Endpoints (Already Handled)

Chain constraint edges reference chain vertex global indices. These indices are unchanged — we're just routing them through `stripInteriorVerts` instead of `stripBot`/`stripTop`. The constraint endpoint lookup in `cdtTriangulateStrip()` via `globalToLocal.get(v0)` will find the promoted vertex (registered by addVertex in Step 2).

The existing "Fix missing constraint endpoints" code at [OuterWallTessellator.ts lines 1196-1220](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1196-L1220) might need adjustment to handle promoted chain vertices that are already in `stripInteriorVerts`. Currently it checks:
```typescript
const inStrip = stripBot.some(sv => sv.idx === vIdx) ||
                stripTop.some(sv => sv.idx === vIdx) ||
                stripInteriorVerts.some(sv => sv.idx === vIdx);
```
Since promoted chain vertices ARE in `stripInteriorVerts`, the `inStrip` check will find them. No change needed here.

#### Step 4: Add R2 Sub-Metric (ChainStripTriangulator.ts)

Add `r2BoundaryViolations` and `r2InteriorViolations` to `ChainStripStats`. In the R2 check loop, classify each R2 triangle by checking whether the feature-grid edge is a CDT boundary constraint (in `cdtEdges`) or an interior edge.

This is a diagnostic, not a behavioral change. It demonstrates that D-Radical eliminates R2-boundary to zero.

### Exact Code Locations

| File | Lines | Change |
|---|---|---|
| [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts) | 1108-1130 | Strip vertex collection: route chain vertices to interiorVerts |
| [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts) | 188-196 | Interior vertex registration: handle promoted chain verts with T-perturbation |
| [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts) | 72-80 | Add `r2BoundaryViolations`, `r2InteriorViolations` to stats interface |
| [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts) | 338-351 | R2 check: classify into boundary vs interior sub-metrics |

### Expected Impact

| Metric | Before | After D-Radical |
|---|---|---|
| R2 total (current definition) | 34,726 | ~20,000-30,000 (interior Delaunay; NOT visual artifacts) |
| **R2-boundary** (new sub-metric) | ~34,726 | **0** |
| R2-interior (new sub-metric) | ~0 | ~20,000-30,000 (Delaunay-optimal; geometrically benign) |
| Visual staircase artifacts | Severe | **Eliminated** |
| Manifold violations at shared rows | 0 | **0** (guaranteed by pure-grid boundaries) |
| Triangle quality (min angle) | Variable | Improved (Delaunay freedom for chain vertices) |
| Vertex count | Unchanged | Unchanged (vertices reclassified, not added/removed) |
| CDT constraint count | Unchanged | Unchanged (chain constraints same; boundary constraints fewer due to fewer boundary vertices... wait, actually more grid-grid boundary constraints since chain verts aren't breaking the sequence) |

Correction on constraint count: Currently, a boundary with `[grid, grid, chain, grid, chain, grid]` has 5 boundary constraint edges. With D-Radical, boundary is `[grid, grid, grid, grid, grid, grid]` — still 5 constraint edges (but all grid-grid). Chain vertices are interior and don't generate boundary constraints. Net change: approximately same number of boundary constraints, but zero R2-generating ones.

## Assumptions for Verifier to Attack

### A1: T-perturbation ε = 0.05 × tGap is sufficient for CDT numerical stability

CDT operates on points in normalized UV space (divided by `scale = max(uRange, tRange)`). With tGap ≈ 0.0023 and scale ≈ 0.013, the perturbation in normalized space is `0.05 × 0.0023 / 0.013 ≈ 0.009`. CDT's robust predicates (orient2d) should handle this without precision issues. cdt2d uses non-robust predicates (simple cross products), so the perturbation magnitude relative to the coordinate scale matters.

**Verifier challenge**: Is 0.009 in normalized space large enough for cdt2d's non-robust predicates? What is the effective precision threshold for cdt2d's `orient` computation?

### A2: Promoting chain vertices to interior does not create crossing constraints

Chain constraint edges span from (u_chain, tBot + ε) to (u_chain_top, tTop − ε) — fully interior to the band. Grid boundary constraints are at T = tBot and T = tTop. No crossing.

**Verifier challenge**: What if two chain vertices on the same row have nearby U values and their constraint edges to the opposite row cross? This is the EXISTING crossing constraint problem (already handled by P5 crossing detection at lines 1230-1290), NOT introduced by D-Radical.

### A3: Manifold matching is guaranteed by pure-grid boundaries

The proof above shows that consecutive grid column pairs produce identical edge decompositions in both bands regardless of strip width. This relies on: (a) grid column positions are identical between bands at the shared row, (b) consecutive grid column pairs always produce the edge col_i→col_{i+1} whether from CDT boundary constraints or standard cell triangulation.

**Verifier challenge**: Is there a case where a standard cell and a CDT strip both cover the same column at the shared row, producing conflicting edge decompositions? This would require a column to be simultaneously marked as CDT (colHasChain=1) in one band and NOT in the other. The 3-way union is designed to prevent this, but edge cases at the seam or at the first/last row may violate it.

### A4: cdt2d handles interior constraint edges correctly

Chain constraint edges with perturbed endpoints are interior to the CDT domain (not on the convex hull or boundary polygon). CDT must enforce these as interior constraints while maintaining Delaunay optimality elsewhere. cdt2d supports this — constraints are just edges that must appear in the output, regardless of position.

**Verifier challenge**: Does cdt2d handle constraints between interior points (not on the boundary) correctly? The documentation and implementation should be verified.

### A5: The R2-boundary sub-metric accurately measures visual staircase artifacts

The claim that R2 boundary violations = 0 eliminates visual staircases rests on the assertion that only BOUNDARY constraint edges (forced grid-chain connections) produce staircase patterns, while interior Delaunay edges (optimized by circumscribed-circle criterion) produce smooth triangulations.

**Verifier challenge**: Can interior Delaunay edges also produce grid-aligned patterns? In principle, if grid and chain vertices are at very regular positions, Delaunay triangulation might still produce grid-aligned edges. Empirical verification needed.

### A6: No regression in companion system effectiveness

The T-Ladder companion system places interior Steiner points at intermediate T-positions. D-Radical adds more interior points (promoted chain vertices at T ± ε) near the row boundaries. These promoted points are at different T-positions than companions (row boundary ± ε vs. mid-band). They should coexist without interference.

**Verifier challenge**: Could promoted chain vertices at T = tBot + ε interfere with companion vertices at T = tBot + 0.33 × tGap (first T-Ladder rung)? The ε = 0.05 × tGap vs. rung at 0.33 × tGap — they're well-separated. But the companion guard radius check (`isNearConstraintEdge`) might reject companions near promoted chain vertices. Verify that the guard zone doesn't expand excessively.

### A7: Grid vertices remaining on the boundary don't need T-perturbation

Interior grid vertices (columns segStart+1 through segEnd-1) stay on the boundary in D-Radical-Minimal. They are grid-grid boundary vertices — no R2 issue. The question is whether these grid vertices create suboptimal CDT triangulations. Since CDT has interior chain vertices as free points, it can connect them to boundary grid vertices via Delaunay-optimal interior edges.

**Verifier challenge**: With 9 grid vertices on the boundary and ~1 chain vertex + companions in the interior, does CDT produce well-shaped triangles? The grid boundary is uniform-spaced; the interior chain vertex is near the center. CDT should produce a fan from the chain vertex to surrounding boundary grid vertices — geometrically reasonable.

## Open Questions

1. **cdt2d precision**: What is cdt2d's effective epsilon for orient2d computations? Does it use exact arithmetic or floating-point? The perturbation magnitude (0.009 in normalized space) must exceed this threshold.

2. **Interior constraint handling**: Has cdt2d been tested with constraints whose BOTH endpoints are interior free points (not on boundary)? Chain constraint edges in D-Radical have this property.

3. **R2-interior vs. visual quality**: Can we empirically verify that R2-interior violations from D-Radical don't produce visible artifacts? An A/B comparison of exported STL meshes (before/after D-Radical) would be definitive.

4. **Performance impact**: D-Radical changes the CDT point classification (more interior, fewer boundary) but not the point count. CDT's time complexity is O(n log n) for n points. No performance regression expected, but the higher interior-to-boundary ratio may change CDT's traversal patterns. Benchmark needed.

5. **Epsilon sensitivity**: How sensitive is the result to the ε value? Does ε = 0.01 work as well as ε = 0.05? Is there a range where CDT produces degenerate triangles? A sensitivity sweep over ε ∈ {0.001, 0.01, 0.05, 0.1, 0.2} would be informative.

---

## Appendix: Why D-Radical Works Where P1 Failed

P1 tried to thin boundary vertices, creating a Catch-22: the guard margin must equal the expansion for manifold safety, consuming the entire strip. D-Radical doesn't thin the boundary — it changes the boundary's COMPOSITION. The boundary retains all grid column vertices (same count, same positions), but chain vertices are moved from boundary to interior. This:

1. **Avoids the Catch-22**: No guard margin needed because no grid vertices are removed from the boundary.
2. **Avoids the 3-way union problem (C3)**: Pure-grid boundaries are identical between bands regardless of strip width differences.
3. **Preserves vertex density**: All original vertices participate in CDT — just with different roles (interior vs. boundary).
4. **Eliminates R2 boundary violations**: No chain vertices on the boundary → no grid-chain boundary edges → no R2 boundary violations.

The fundamental insight: **the problem was never about too many grid vertices on the boundary. It was about chain vertices being FORCED onto the boundary, creating grid-chain constraint edges. The fix is to liberate chain vertices from the boundary, not to thin the grid.**
