# Verifier Round 1 — Critique of Generator R46 Feature Edge Dip Cleanup

Date: 2026-03-08

---

## Summary Verdict: ACCEPT WITH AMENDMENTS

Four of five proposals pass verification. One (Proposal 5) is REJECTED as unnecessary given the others. Proposals 1 and 4 are ready to ship. Proposal 2 has a timing concern requiring an amendment. Proposal 3 requires a code-path amendment.

---

## Proposal 1: Protect chainFanQuad Diagonals from CSO

### Verdict: ACCEPT WITH AMENDMENTS

### Verification

#### V1.1 — Fan diagonals are NOT in constraintEdgeSet ✅ CONFIRMED

Traced the full chain:

1. **Triangle emission.** Right-chain case at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L351):
   ```
   emitTriCCW(buf, subBot[0], subBot[1], subTop[0], verts);  // L351
   emitTriCCW(buf, subTop[0], subBot[1], subTop[1], verts);  // L352
   ```
   Shared diagonal edge: `subBot[1] ↔ subTop[0]` = chain_bot ↔ grid_top.

   Left-chain case at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L375):
   ```
   emitTriCCW(buf, finalBot[0], finalBot[1], finalTop[1], verts);  // L375
   emitTriCCW(buf, finalBot[0], finalTop[1], finalTop[0], verts);  // L376
   ```
   Shared diagonal edge: `finalBot[0] ↔ finalTop[1]` = chain_bot ↔ grid_top.

2. **chainEdges construction** at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L798-L810): Only records edges between consecutive entries in `finalChain` — i.e., chain↔chain edges. Fan diagonals (chain↔grid) are **never** recorded in `chainEdges`.

3. **constraintEdgeSet construction** at [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1557): `buildConstraintEdgeSet(outerChainEdges)` — builds from `outerChainEdges` which equals `cdtResult.chainEdges`. Fan diagonals are **not** in this set.

4. **CSO guard checks** at [ChainStripOptimizer.ts](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L580), [L653](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L653), [L708](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L708): All three phases skip `constraintEdgeSet` edges. Fan diagonals **pass through** all guards and are freely flipped. ✅ Root cause confirmed.

#### V1.2 — flipEdges3D does NOT touch fan diagonals ✅ CONFIRMED

[MeshOptimizer.ts](../../src/renderers/webgpu/parametric/MeshOptimizer.ts#L291) `flipEdges3D` signature takes `(indices, positions3D, w, h, invertWinding, lockedQuads?, quadMap?)` — no `constraintEdgeSet` parameter. More importantly, it iterates grid cells via `quadMap`:

```typescript
const triBase = quadMap ? quadMap[quadIdx] : quadIdx * 6;  // L371
if (triBase < 0) continue;                                  // L372
```

Chain-strip cells have `quadMap[...] = -1`, so `flipEdges3D` **skips** all chain cells. Fan diagonals exist only in chain cells. ✅ No interaction.

#### V1.3 — Side effects of expanding constraintEdgeSet

**A. MeshSubdivision threshold change — WARNING (non-blocking)**

At [MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L403-L435):
```typescript
const isChainEdge = constraintEdgeSet.has(ek);           // L403
const isCrossEdge = (v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount);  // L430
const threshold = isChainEdge
    ? chainSubdivThreshold2           // CHAIN_SCALE = 0.50
    : isFeatureEdge
        ? featureSubdivThreshold2     // FEATURE_SCALE = 0.75
        : ...;
```

**Current behavior:** Fan diagonals are cross-edges (chain↔grid), `isChainEdge = false`, get `featureSubdivThreshold2`.

**After Proposal 1:** Fan diagonals become `isChainEdge = true`, get `chainSubdivThreshold2` (tighter by ~15%).

**Impact assessment:** Both thresholds are in the same range. Looking at typical production numbers from diagnostic logs: `chainThresh ≈ 0.359mm`, `featureThresh ≈ 0.390mm`. Fan diagonal 3D length ≈ 0.7–1.0mm (spanning one row band diagonally). These exceed **both** thresholds, so they'd be subdivided either way. **The practical subdivision count change is negligible.**

**B. Protected corridor bypass — WARNING (non-blocking)**

At [MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L485):
```typescript
if (isChainEdge) return false;  // always allow chain edge splits
```

Currently, fan diagonals as cross-edges check `protectedVertices.has(opp0) || protectedVertices.has(opp1)`. After Proposal 1, they bypass the check entirely — always splittable even near phantom corridors. This is probably correct (fan diagonals ARE feature edges; placing a midpoint vertex on them is topology-preserving), but worth monitoring via Proposal 4 diagnostics.

**C. CSO opp-edge guard — SAFE**

At [ChainStripOptimizer.ts](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L589):
```typescript
if (constraintEdgeSet.has(edgeKey(opp0, opp1))) continue;
```

This blocks creating flips that would produce a constraint edge as the new diagonal. Adding fan diagonals means CSO also can't flip **to** a fan diagonal direction. This is a minor additional protection. ✅ Safe and beneficial.

**D. Chain-strip triangle identification — SAFE**

Chain-strip triangles are identified by `identifyChainStripTriangles` via vertex-based detection (outerGridVertexCount XOR, chainAdjacentVertices). `constraintEdgeSet` is NOT used for chain-strip identification. ✅ No interaction.

#### V1.4 — Attack: "Is the deterministic diagonal always better?"

**Generator's claim**: The deterministic fan diagonal (chain_bot → grid_top) is always better than the 3D quality criterion.

**Counterexample construction**: On a highly curved surface where the chain vertex is on a sharp ridge and the grid vertex is on a steep flank, the 3D-optimal diagonal could connect different vertex pairs for better triangle aspect ratios.

**However**: The Generator's argument is about **global consistency**, not local quality. Even if the 3D-optimal diagonal is locally better at one row, having inconsistent diagonal directions across rows creates the visible zigzag artifact that is the stated problem. A consistent "suboptimal" diagonal is visually superior to alternating "locally optimal" diagonals. ✅ The consistency argument is sound.

#### V1.5 — Amendment: Pass collector as parameter, not module-level state

`constrainedSweepCell` is a file-scope helper function called from `buildCDTOuterWall`. The Generator proposes a "module-level collector array." While this works in the single-threaded export context, passing a collector array as a parameter is cleaner and avoids implicit state. The function already takes `buf` and `edges` as collector-style arguments.

**Required amendment**: Add `fanDiagEdges: Array<[number, number]>` as a parameter to `constrainedSweepCell` instead of using module-level state. Push `[subBot[1], subTop[0]]` (right-chain) and `[finalBot[0], finalTop[1]]` (left-chain) inside the respective if-branches.

#### V1.6 — Estimate validation

Generator estimates "~15 lines in OWT, ~5 lines in orchestrator." Actual estimate:
- OWT: ~12 lines (parameter addition to function signature × 2 callsites, two push calls, OuterWallResult field, return value update)
- PEC: ~4 lines (merge fan diagonals into constraintEdgeSet)

Close enough. ✅

---

## Proposal 2: GPU Re-snap Interpolated Chain Vertices

### Verdict: ACCEPT WITH AMENDMENTS

#### V2.1 — Attack on Assumption 4 (Critical)

**Generator's claim**: If a chain skips a row, the feature might genuinely not exist there.

**Verification via chain linker**: At [ChainLinker.ts](../../src/renderers/webgpu/parametric/ChainLinker.ts#L727), `missCount` tracks consecutive rows without a matching feature. `MAX_MISS_COUNT` can be up to 8 (v22.1, [ChainLinker.ts L557](../../src/renderers/webgpu/parametric/ChainLinker.ts#L557)). The linker bridges gaps via momentum prediction ([L740](../../src/renderers/webgpu/parametric/ChainLinker.ts#L740)).

**Two distinct gap scenarios:**

1. **Detection gap** (feature exists but detector missed it): Feature is below SNR threshold at this row, or detector's 8192-sample resolution created aliasing. The feature EXISTS at the row; re-snap will find it. → Re-snap improves accuracy.

2. **Genuine absence** (feature doesn't exist): Feature merges, splits, or terminates. The linker's momentum carried it past a real gap. → Re-snap would either find no feature (fallback to linear interp) or snap to a WRONG feature.

**The Generator correctly identifies this risk** and proposes a tolerance-bounded fallback. ✅ The fallback is essential.

**Recommended tolerance**: If re-snap finds a candidate with `|u_resnap - u_interp| > 2 × CHAIN_LINK_RADIUS` (= 0.08 U), reject the re-snap and keep linear interpolation. This matches the chain linker's own linking tolerance.

#### V2.2 — Magnitude verification

Generator claims 0.35mm error for a 3-row gap. Let me verify:

For a ridge with curvature ε = 0.002 radians across 3 rows:
- Error = ε × rowSpan² / 8 = 0.002 × 9 / 8 = 0.00225 U
- At circumference = 2π × 50mm ≈ 314mm: error = 0.00225 × 314 ≈ 0.71mm

The Generator used "100mm diameter" (circumference ≈ 314mm) but then wrote 0.35mm, which suggests they used radius (50mm) instead of circumference (314mm). **The actual error for their stated curvature is ~0.71mm, not 0.35mm.** The effect is LARGER than claimed. This strengthens the case for re-snap, not weakens it.

For realistic error bounds: curvature varies by style. GothicArches has sharp features (high curvature), while ModernMinimalist has gentle ones. The error is always proportional to curvature × gap², so styles with high feature curvature AND multi-row gaps see the worst dips.

#### V2.3 — CRITICAL: Timing (post-OWT re-snap safety)

**Generator proposes**: Re-snap interpolated vertices AFTER OWT, after GPU 3D evaluation.

**The concern**: OWT uses chain vertex U positions for cell assignment ([OWT L969-1020](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L969-L1020)) — specifically `bsearchFloor(unionU, u0)` determines which column (cell) a chain vertex falls in. If re-snap changes U, the vertex may now be in a different cell than the tessellation assumed.

**Impact analysis**: The re-snap step (Step 3.5) uses `RESNAP_RADIUS = 0.005`. Grid column spacing ≈ 1/577 ≈ 0.00173. So re-snap could shift a vertex by up to 2.9 columns. HOWEVER:

- Post-OWT re-snap only changes the **3D position** of an already-placed vertex, not the mesh **topology**. The vertex remains at the same index in the vertex buffer, connected to the same neighbors.
- The 3D position changes because the GPU evaluates a different (u, t) → different (x, y, z).
- For a small re-snap displacement (≤ 0.005 U), the 3D displacement is bounded by the surface curvature × 0.005 × circumference ≈ 0.005 × 314mm ≈ 1.57mm max.
- This could cause a triangle to become near-degenerate or inverted in 3D.

**However**: For the common case (detection gap, feature is close), the re-snap moves the vertex TOWARD the feature ridge, not away from it. This typically IMPROVES triangle quality in 3D.

**My assessment**: Post-OWT re-snap is the pragmatic choice. Pre-OWT re-snap (the safer option) would require restructuring the pipeline: currently, GPU re-snap infrastructure is set up at Step 3.5 (before grid insertion at Step 4 and OWT at Step 6). Running a second re-snap pass between Steps 3.6 and 4 means the interpolation code (currently in OWT) must be pulled out earlier.

**AMENDMENT**: Post-OWT re-snap is acceptable IF combined with a triangle inversion check: after re-snapping each vertex, verify that no adjacent triangle has its normal flipped (dot product of old normal vs new normal must be > 0). Reject the re-snap if any triangle inverts.

#### V2.4 — GPU infrastructure availability ✅ CONFIRMED

The pipeline at the point after subdivision ([PEC L1611-1632](../../src/renderers/webgpu/ParametricExportComputer.ts#L1611-L1632)) uses `this.evaluatePoints()` for GPU midpoint evaluation during subdivision. The same lambda can be reused for re-snap. The uniform buffer and style parameters are available at that stage.

For Step 3.5-style parabolic re-snap: the infrastructure exists at [PEC L1100-1130](../../src/renderers/webgpu/ParametricExportComputer.ts) (the original re-snap pass). It can be replicated after OWT/subdivision.

#### V2.5 — Phasing is correct

The Generator recommends this as Phase 2, after Proposal 4 provides `interpolatedCount` data. ✅ Agreed. If `interpolatedCount` is consistently < 5% of chain vertices for all tested styles, the ROI may not justify the complexity. Get the data first.

---

## Proposal 3: Deterministic Diagonal for Both-Sides Chain Sub-Quads

### Verdict: ACCEPT WITH AMENDMENTS

#### V3.1 — Code path verification

At [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L346-L356):
```typescript
} else if (subBot.length === 2 && subTop.length === 2 && !prevIsChainEdge) {
    // R41 chainFanQuad: 2×2 sub-quad with chain on RIGHT only
    emitTriCCW(buf, subBot[0], subBot[1], subTop[0], verts);
    emitTriCCW(buf, subTop[0], subBot[1], subTop[1], verts);
} else {
    // Chain on both sides, or N×M sub-quad → standard sweep
    sweepQuad(buf, subBot, subTop, verts);
}
```

The `else` clause at line 354 catches **two distinct cases**:
1. `subBot.length === 2 && subTop.length === 2 && prevIsChainEdge` — 2×2 both-sides
2. `subBot.length !== 2 || subTop.length !== 2` — N×M sub-quad

The Generator's proposal replaces the sweepQuad call with a fixed diagonal, but **only the 2×2 both-sides case** can use a fixed triangle pair. The N×M case still requires sweepQuad.

#### V3.2 — AMENDMENT: Split the else clause

The replacement MUST distinguish between the two cases:
```typescript
} else if (subBot.length === 2 && subTop.length === 2 && prevIsChainEdge) {
    // 2×2 both-sides: fixed diagonal for consistency
    emitTriCCW(buf, subBot[0], subBot[1], subTop[1], verts);
    emitTriCCW(buf, subBot[0], subTop[1], subTop[0], verts);
} else {
    // N×M sub-quad → standard sweep (unchanged)
    sweepQuad(buf, subBot, subTop, verts);
}
```

Same amendment applies to the final sub-quad case at L378.

#### V3.3 — Frequency analysis

The both-sides 2×2 case requires two chains within the same grid cell (U-distance < one column width ≈ 0.00173). This is **rare** — chains are typically separated by features whose width exceeds one column. But it can happen at feature convergence points (e.g., WaveInterference at high m values where peaks crowd together).

**Recommendation**: Count this case via Proposal 4 diagnostics before investing engineering effort. If it fires < 1% of cells, deprioritize.

#### V3.4 — Diagonal direction

The Generator proposes `botLeft → topRight` (subBot[0] → subTop[1]). In the both-sides case, all four vertices are chain vertices. Both diagonals are chain↔chain. The choice is arbitrary but must be **consistent**. ✅ The proposed direction achieves this.

---

## Proposal 4: Diagnostic Logging

### Verdict: ACCEPT

#### V4.1 — interpolatedCount is never logged ✅ CONFIRMED

Searched [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts) exhaustively:
- [L704](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L704): `let interpolatedCount = 0;` — declaration
- [L775](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L775): `interpolatedCount++;` — increment

No `console.log` references `interpolatedCount` anywhere in the file. The variable is tracked but **discarded at function exit**. ✅ Confirmed observability gap.

#### V4.2 — No existing fan diagonal tracking ✅ CONFIRMED

Searched OWT for any counting of chainFanQuad emissions. None exists. The `constrainedSweepCell` function emits triangles directly to `buf` with no diagnostic tracking.

#### V4.3 — CSO chain↔grid flip tracking

The CSO currently logs per-phase flip counts ([PEC L1571-1576](../../src/renderers/webgpu/ParametricExportComputer.ts#L1571-L1576)). It does NOT differentiate between chain↔grid edge flips and grid↔grid edge flips. The Generator's proposal to add a counter for "flips where exactly one endpoint is ≥ outerGridVertexCount" is the correct approach.

#### V4.4 — Insertion points

1. **interpolatedCount log**: After chain vertex construction loop, near [OWT L1805](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1805), alongside the existing `R35 Chain edges:` log line.
2. **Fan diagonal count**: Return count via `OuterWallResult` (new field `fanDiagonalCount: number`) or log inline in `buildCDTOuterWall` after the cell sweep loop.
3. **CSO chain↔grid flip count**: Inside each phase's flip loop, after the `applyFlip` call, check `(shLo >= outerGridVertexCount) !== (shHi >= outerGridVertexCount)` to detect chain↔grid edges.

#### V4.5 — Risk: zero ✅

Pure instrumentation. No functional change. ConsolePatch intercepts all console.log output per existing pattern.

---

## Proposal 5: Chain-Aware Subdivision Midpoints

### Verdict: REJECT

#### V5.1 — Impact is negligible after Proposals 1 + 2

The Generator correctly rates this as LOW impact and recommends "only if dips persist after Phase 1+2." I go further: **this should not be pursued at all**.

**Reasoning:**

1. **Subdivision midpoints are on short edges.** Edges are only subdivided when they exceed the threshold (~0.36mm for chain edges). After splitting, the two resulting sub-edges are each ~0.18mm. The curvature-dependent UV error on a 0.36mm edge is vanishingly small — the chord deviation at this scale is below print resolution (layer height ≈ 0.1–0.2mm).

2. **GPU evaluation already places midpoints on-surface.** The subdivision's GPU callback evaluates the midpoint UV to 3D coordinates on the mathematical surface. The midpoint may not be on the ridge, but it IS on the surface. The visual distinction is subliminal on a 0.36mm edge.

3. **Coupling cost is not justified.** Passing chain trajectory data into `MeshSubdivision.ts` creates module coupling that currently doesn't exist. The subdivision module is a clean, geometry-only module. Adding chain awareness breaks this boundary for minimal gain.

4. **If Proposal 2 (GPU re-snap) is implemented**, subdivision midpoints on chain edges could simply be added to the re-snap batch — achieving the same effect without coupling. This is the Generator's "Alternative" approach, which is strictly superior to the primary proposal.

**Alternative**: If residual dips are visible after Phase 1+2 (unlikely), batch subdivision midpoints on chain edges into the re-snap pass. No code changes needed in MeshSubdivision.ts — the re-snap pass would naturally operate on all vertices flagged as chain-adjacent.

---

## Cross-Cutting Concerns

### X1 — Interaction between Proposals 1 and 2

If fan diagonals become constraint edges (P1) AND interpolated vertices get re-snapped (P2):
- The constraint edge connects a (potentially re-snapped) chain vertex to a grid vertex.
- CSO won't flip it regardless of re-snap (constraint edges are protected).
- MeshSubdivision uses the tighter threshold, which is fine.
- **No problematic interaction.** ✅

### X2 — Test implications

- `buildConstraintEdgeSet` unit tests ([ChainStripOptimizer.test.ts L325-336](../../src/renderers/webgpu/parametric/ChainStripOptimizer.test.ts#L325-L336)): Pass unchanged — the function processes whatever edges it receives.
- CSO integration tests: Pass — CSO respects whatever's in the constraint set.
- OWT tests: May need updates if `OuterWallResult` interface gains new fields (TypeScript strict mode will catch missing fields).
- **No existing test breakage expected.** ✅

### X3 — Performance

- **constraintEdgeSet growth**: Fan diagonals add ~2× chain edges to the set (1 fan diagonal per chain vertex cell, roughly matching chainEdge count). For typical exports: constraintEdgeSet grows from ~5,000 to ~10,000 entries. Set<bigint> lookup remains O(1). ✅ Negligible.
- **MeshSubdivision**: Fan diagonals already exceed both `featureSubdivThreshold2` and `chainSubdivThreshold2`, so the stricter threshold doesn't change the subdivision count materially. ✅ Negligible.
- **CSO**: More constraint edges = fewer edges eligible for flipping = CSO runs slightly faster (fewer candidates). ✅ Net positive.

### X4 — Generator's magnitude estimate has an error

In Proposal 2, the Generator claims 0.35mm error for a 3-row gap with ε = 0.002 radians at "100mm diameter pot." Using circumference = π × 100mm ≈ 314mm, the actual error is:
```
0.00225 U × 314mm ≈ 0.71mm
```
The Generator may have used diameter (100mm) instead of circumference (314mm). This doesn't affect the conclusion — the error is LARGER than claimed, which strengthens the case for Proposal 2.

---

## Accepted Items

| # | Proposal | Verdict | Conditions |
|---|----------|---------|------------|
| 1 | Fan diagonal protection | ✅ ACCEPT WITH AMENDMENTS | Pass collector as parameter, not module state |
| 2 | GPU re-snap interpolated vertices | ✅ ACCEPT WITH AMENDMENTS | Post-OWT with triangle inversion guard; tolerance-bounded fallback; gated on P4 data |
| 3 | Both-sides diagonal | ✅ ACCEPT WITH AMENDMENTS | Must split else clause to distinguish 2×2 from N×M; gate on P4 frequency data |
| 4 | Diagnostic logging | ✅ ACCEPT | No amendments |
| 5 | Chain-aware subdivision | ❌ REJECT | Negligible ROI; if needed, use P2 re-snap batch instead |

---

## Implementation Conditions for the Executioner

### Phase 1 (Ship immediately):
1. **Proposal 4**: Add `interpolatedCount` to the `R35 Chain edges:` log line at OWT L1806. Add fan diagonal count field to `OuterWallResult`. Add chain↔grid flip counter in CSO phases.
2. **Proposal 1**: Add `fanDiagEdges: Array<[number, number]>` parameter to `constrainedSweepCell`. Push diagonal edge in right-chain (L351: `[subBot[1], subTop[0]]`) and left-chain (L375: `[finalBot[0], finalTop[1]]`) branches. Add `fanDiagonalEdges` field to `OuterWallResult`. In PEC after L1557, merge fan diagonal edges into `constraintEdgeSet`.

### Phase 2 (After Phase 1 diagnostics confirm interpolatedCount > 0):
3. **Proposal 2**: Add re-snap pass for interpolated chain vertices after GPU evaluation. Use `|u_resnap - u_interp| > 0.08` rejection threshold. Include triangle inversion guard.

### Phase 3 (Only if both-sides case fires ≥ 1% of cells per P4 data):
4. **Proposal 3**: Split the else clause at OWT L354 to handle 2×2 both-sides separately from N×M fallback.

### Validation Protocol:
1. `npm run typecheck` — must pass
2. `npm test` — 1883/1883 (or current passing count)
3. `npm run lint` — 0 warnings
4. Export GothicArches + DiamondLatticeCup at default resolution before/after
5. Check new diagnostic logs for: `interpolatedCount`, fan diagonal count, CSO chain↔grid flip count
6. Compare mesh vertex/triangle counts (expect ≤ 2% increase from fan diagonal subdivision)
7. Visual inspection of feature edge continuity in exported STL

---

## Open Questions for Generator

1. **Fan diagonal count estimate**: The Generator says "~5–20%" growth in constraintEdgeSet. My analysis suggests ~100% growth (roughly 1 fan diagonal per chain vertex, matching chain edge count). Can you provide the exact count logic? Each chain cell with a single-side chain partition produces 1 fan diagonal (either right-chain from the partition loop or left-chain from the final sub-quad). With ~20 chains × ~243 rows/chain ≈ 4,860 chain cells → ~4,860 fan diagonals, vs ~4,860 chain edges currently. Am I overcounting?

2. **CSO flip prevalence**: Before implementing Proposal 1, how many fan diagonal flips actually occur per export? If the diagnostic (P4) shows zero flips, the protection is unnecessary. Recommend shipping P4 first to get this data point.

3. **Proposal 2 pre-OWT alternative**: Has the Generator considered pulling the interpolation code OUT of OWT into a standalone step that runs between Steps 3.6 and 4? This would allow pre-OWT re-snap, eliminating the triangle inversion risk entirely. The cost is restructuring OWT's interface (chain vertices become an input, not computed internally).
