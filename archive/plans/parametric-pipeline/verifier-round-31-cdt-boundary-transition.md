# Verifier Round 31 — Critique of CDT Strip-to-Grid Boundary Transition Proposals
Date: 2026-03-07

## Summary Verdict: REJECT Proposal 2 as written. CONDITIONAL ACCEPT with mandatory amendments.

Proposal 2 has the right *intuition* (boundary companions + constraints) but contains two critical implementation errors and one stale architecture assumption. Proposal 1 is architecturally cleanest and aligns with user intent but is higher-risk. Proposal 3 has merits but introduces unnecessary complexity. I recommend a **corrected Proposal 2** as Phase 1, with Proposal 1 as escalation.

---

## Critique of Proposal 2 (Recommended — Boundary Column Constraints + Companions)

### C1 [CRITICAL]: Boundary companion injection targets WRONG columns

**Generator's claim**: "For each boundary column B in {leftCol, rightCol}: // strip boundary columns"

**Actual behavior**: The sketch code computes `leftCol = Math.max(0, col - expansion)` and `rightCol = Math.min(numU-1, col + expansion + 1)` per-chain-vertex (the chain vertex's own expansion boundary). These are NOT the strip boundary columns.

**Evidence**: Strip boundaries (`segStart`/`segEnd`) are computed from the contiguous run of `colHasChain[i]` at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1300). The `colHasChain` array includes horizontal expansion at [line 1220-1235](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1220):

```typescript
const pre = Uint8Array.from(colHasChain);
for (let c = 0; c < cellsPerRow; c++) {
    if (pre[c]) {
        for (let d = 1; d <= stripExpansion; d++) {
            if (c - d >= 0) colHasChain[c - d] = 1;
            if (c + d < cellsPerRow) colHasChain[c + d] = 1;
        }
    }
}
```

When multiple chains merge into one contiguous segment, the segment boundary (segStart) may be far from any individual chain vertex's `leftCol`. For a chain at column 10 with expansion=2, the per-chain `leftCol=8`. But if an adjacent chain at column 5 also has expansion=2, the merged segment starts at `segStart=3`. The companion injection at column 8 misses the boundary desert at columns 3-7 entirely.

**Impact**: The companion desert at strip boundaries remains UNFILLED. The primary quality improvement is lost.

**Required fix**: Companion injection must use the actual strip boundary columns (`segStart`, `segEnd`), not per-chain expansion boundaries.

---

### C2 [CRITICAL]: Companion injection timing — strip boundaries unknown during Section 1.5

**Generator's claim (Assumption #5)**: "Boundary companion injection during Section 1.5 can determine strip boundary columns before the main window loop"

**Actual behavior**: FALSE. The code execution order is:
1. **Section 1.5** (companion generation) — [line 565](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L565)
2. **Section 2** (vertex buffer allocation) — [line 916](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L916)
3. **colHasChain computation** — [line 1120](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1120)
4. **Horizontal expansion** — [line 1220](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1220)
5. **Strip assembly** (segStart/segEnd determined) — [line 1300](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1300)

Strip boundaries depend on `colHasChain` with expansion applied, which is computed AFTER companion generation AND vertex buffer allocation. You cannot inject companions at strip boundaries during Section 1.5 because the boundaries don't exist yet.

Furthermore, vertex buffer allocation at [line 919](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L919):
```typescript
const totalVertexCount = gridVertexCount + allChainVertices.length;
const vertices = new Float32Array((totalVertexCount + rowBoundaryCvCount + totalShadowCount) * 3);
```
is sized before strip assembly. Adding companions later requires buffer resizing.

**Impact**: The proposed 20-line companion injection code CANNOT be placed where the Generator suggests.

**Required fix**: Either:
- (A) Pre-compute strip boundaries before Section 1.5 by moving `colHasChain` + expansion computation earlier, OR
- (B) Inject boundary companions during strip assembly (Section 4), directly into `stripInteriorVerts`, with on-demand vertex buffer extension

Option (B) is simpler: during strip assembly, after determining segStart/segEnd, allocate new vertices via a small secondary buffer and push them into `stripInteriorVerts`. This requires ~10 extra lines for vertex allocation but avoids restructuring the pipeline.

---

### C3 [WARNING]: Vertical constraint edges are silently skipped by cdt2d's monotone sweep

**Generator's claim**: "These constraints partition the CDT boundary into per-band segments. The CDT CANNOT create triangles crossing these edges."

**Actual behavior**: The cdt2d library's monotone sweep processes edges via events sorted by x-coordinate. At [monotone.js line 161-171](../../node_modules/cdt2d/lib/monotone.js#L161):
```javascript
if(a[0] < b[0]) {
    events.push(new Event(a, b, EVENT_START, i), new Event(b, a, EVENT_END, i))
} else if(a[0] > b[0]) {
    events.push(new Event(b, a, EVENT_START, i), new Event(a, b, EVENT_END, i))
}
```
When `a[0] === b[0]` (vertical edge — same x-coordinate for both endpoints), **NEITHER branch executes**. No edge events are created. The constraint is silently ignored during the monotone sweep phase.

The boundary column vertices at segStart all map to normalized U=0 after CDT normalization at [ChainStripTriangulator.ts line 195](../../src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L195):
```typescript
points.push([(u - uMin) / uRange, ...])
```
Since `uMin = uStripLeft = unionU[segStart]`, all segStart grid vertices get normalized U = 0. Boundary column constraints between them are vertical edges at U=0.

**Mitigating factor**: The constraints ARE tracked in `isConstraint()` via [triangulation.js](../../node_modules/cdt2d/lib/triangulation.js#L26), so the Delaunay refinement step prevents flipping of these edges. Since boundary column vertices sit on the convex hull (minimum U), edges between consecutive hull vertices are naturally created by the monotone sweep and preserved by constraint-based flip prevention.

**Impact**: Moderate. The constraints work *de facto* through convex-hull preservation + flip prevention, but NOT through active edge enforcement during the sweep. The guarantee is weaker than the Generator claims — it relies on convex-hull geometry rather than direct constraint enforcement.

**Required fix**: None strictly needed if the convex-hull argument holds, but the Generator should acknowledge this mechanism. For robustness, a `+1e-9` U-offset on the boundary columns (making them non-vertical) would force cdt2d to process them as proper edge events. The quality trade-off is negligible.

---

### C4 [WARNING]: Per-band constraint value is limited without companion fixes

**Generator's claim**: "Boundary column constraints prevent cross-band slivers (height-bounded triangles)"

**Assessment**: This is TRUE in the sense that Delaunay flip prevention ensures consecutive boundary column edges are preserved. Without the constraints, flipping a hull edge between (0, T_m) and (0, T_{m+1}) could create a triangle spanning from T_m to some distant interior point, bypassing T_{m+1}. The constraints prevent this.

However, the INTRA-band problem (triangle from U=0 to distant interior companion) remains. The nearest interior point to the boundary is at approximately `cv.u - 0.25 * (cv.u - uStripLeft)` = `0.75 * cv.u + 0.25 * uStripLeft` (from `SHELL_FRACTIONS = [0.04, 0.09, 0.16, 0.25]` at [line 586](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L586)). This leaves 75% of the boundary→chain distance as a companion desert.

Without companion fixes (C1/C2), the constraints alone reduce aspect ratios from ~714:1 (cross-band) to ~20:1 (intra-band). Useful but insufficient.

---

### C5 [NOTE]: Constraint crossing with chain edges (Q4)

**Assessment**: ACCEPTED. Boundary constraints at U = unionU[segStart] are at the vertical edge of the strip. Chain constraint edges are between chain vertices in the strip interior (U > unionU[segStart]). The P5 `segmentsCross` test at [line 1660+](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1660) operates in raw UV space. A vertical segment at U=segStart and a chain segment at U>segStart crossing would require the chain to pass through the strip boundary — geometrically impossible for interior chains. LOW RISK.

---

### C6 [NOTE]: Vertex existence (Q5)

**Assessment**: ACCEPTED. Grid vertices at `m * numU + segStart` for mid-rows are confirmed present in `stripInteriorVerts` by the filtering at [line 1462](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1462):
```typescript
if (col !== segStart && col !== segEnd) {
    stripGridInteriorSkipCount++;
    continue;
}
```
These are the ONLY grid vertices kept. The constraint between `(m * numU + segStart)` and `((m+1) * numU + segStart)` references vertices that are guaranteed to be in the CDT.

---

## Critique of Proposal 1 (Grid-Side Adaptive Fan)

### C7 [NOTE]: CDT boundary monotonicity (Q6) — ACCEPTED

The CDT left boundary at U=0 (normalized) is the convex hull edge at minimum U. Without grid vertices in mid-rows, `bot[0]` and `top[0]` (both at U = uStripLeft) are the only vertices at this coordinate. The left boundary is a single straight edge — trivially monotone.

**Edge case**: If `bot[0]` and `top[0]` are at different raw U values (possible if buildMergedRow inserts a chain vertex at the exact start), the normalized left boundary might have two segments. But this is rare and still monotone in T.

### C8 [WARNING]: Boundary extraction cost (Q7)

The CDT returns triangle indices. Extracting the left boundary edge chain requires building an edge-adjacency map: for each triangle, record its three edges and which triangles share each edge. Boundary edges are shared by exactly one triangle. This is O(triangles) and ~20-30 lines of code — not trivial but not expensive.

**Complication**: The CDT with `exterior: true` includes triangles OUTSIDE the strip bounds. The boundary extraction must operate on the FULL CDT output, then the boundary edges must be filtered to ensure they're on the actual strip boundary (U ≈ uStripLeft), not on some concavity caused by interior constraints.

### C9 [NOTE]: Grid vertex dangling (Q3 from Generator)

Unused grid vertices at (m, segStart) are harmless — the Batch 6 dedup and weld step operates on the final index buffer, not the vertex buffer. Unreferenced vertices just waste buffer space (negligible).

### C10 [CRITICAL]: Transition fan T-junction prevention

The whole purpose of keeping grid vertices at segStart in the CDT is to share indices with adjacent standard grid cells, preventing T-junctions. Proposal 1 REMOVES these vertices from the CDT. The transition fan must now connect grid vertices (at exact T = activeTPositions[m]) to CDT boundary vertices (which may be at T = activeTPositions[m] OR at intermediate T from chain/companion positions).

If the CDT boundary at U=0 has ONLY bot[0] and top[0] (no intermediate vertices), the transition fan for each band is a simple quad: grid(m, segStart-1), grid(m+1, segStart-1), grid(m, segStart), grid(m+1, segStart). But grid(m, segStart) and grid(m+1, segStart) ARE the CDT's bot[0] and top[0] only for the FIRST and LAST bands. For intermediate bands, grid(m, segStart) must connect to both the grid side (left) and the CDT side (right). Since the CDT only has bot/top boundary vertices at T=tBot and T=tTop, there are NO CDT vertices at intermediate row heights. The transition fan must bridge from grid(m, segStart) to the CDT interior at some U > segStart — which is exactly the same problem we started with, just outside the CDT.

**Impact**: Proposal 1 moves the slivering problem from inside the CDT to the transition zone. The transition fan triangles would still have poor aspect ratios unless the CDT boundary has intermediate vertices (which it doesn't, since we removed grid mid-row vertices).

**Required fix**: Proposal 1 must KEEP grid vertices at segStart in the CDT boundary rows (stripBot/stripTop), or inject them as CDT boundary vertices at intermediate rows (as sub-points on the left boundary). Without intermediate boundary points, the transition fan creates the same slivers, just in a different location.

---

### Proposal 1 Verdict: CONDITIONAL ACCEPT (with C10 fix)

If grid vertices at segStart are injected into the CDT boundary (not as interior Steiner points, but as boundary vertices on the left/right edge chains), the CDT treats them as convex-hull vertices and creates well-formed triangles from them to the interior. This is the cleanest possible triangulation. The transition fan degenerates to identity (no gap to fill, since the CDT boundary passes through the grid vertices).

But this is functionally equivalent to the current architecture, just with better constraint enforcement. The real fix is the same for both proposals: don't let boundary grid vertices be INTERIOR Steiner points — make them BOUNDARY vertices.

---

## Critique of Proposal 3 (Per-Band CDT)

### C11 [WARNING]: Determinism (Q9)

CDT2d is deterministic for *identical* input. Two CDT calls sharing row m+1 use the same vertex positions. However, they have DIFFERENT constraint edge sets (band b has constraints in [T[b], T[b+1]], band b+1 has constraints in [T[b+1], T[b+2]]). Since constraints affect Delaunay flipping, the triangulation of shared-row vertices can differ between bands.

This does NOT cause T-junctions (both CDTs reference the same vertex indices for shared-row vertices — any triangulation using those vertices shares them). But it CAN cause visual inconsistency where the same shared-row edge has different internal triangle orientations in adjacent bands.

**Verdict**: Theoretically sound but the "identical output" claim is incorrect. The important property (shared vertex indices → no T-junctions) holds regardless.

### C12 [WARNING]: Chain edge splitting (Q10)

Chain edges from row b to row b+2 must be split at row b+1. The interpolated point at (lerp(u_b, u_{b+2}, 0.5), T[b+1]) is a NEW vertex requiring:
1. Vertex buffer allocation (vertex buffer is already sized)
2. Global index assignment
3. Both bands must reference the SAME interpolated vertex index

The Generator acknowledges this but underestimates the complexity. The interpolated vertex must be created BEFORE the per-band CDT loop and shared between bands. This requires a pre-processing pass over all chain edges to identify cross-band edges and create split vertices.

### C13 [NOTE]: Performance (Q8 from Generator Assumption #5)

312 small CDT calls vs 13 large calls: total work is similar (CDT is O(n log n)). The overhead is in CDT initialization and constraint processing per call. With typical 100-300 vertices per band, each call is fast. Total should be comparable or slightly slower due to initialization overhead.

### Proposal 3 Verdict: CONDITIONAL ACCEPT (viable fallback)

Eliminates the root cause (no interior Steiner points at boundaries). Chain-edge splitting is the main implementation complexity. Recommended as Plan B if corrected Proposal 2 is insufficient.

---

## Meta-Question (Q11): Fix CDT or Bypass?

The user's stated intent: "the entire reason why we tried to make the strip independent from grid is because boundary edges were ruining the chain strip together with the grid vertices."

**Proposal 2** keeps grid vertices in the CDT and adds constraints/companions. This CONTRADICTS the user's intent to make the strip independent.

**Proposal 1** removes grid vertices from the CDT, making it fully independent. This ALIGNS with user intent but C10 shows simply removing them creates the same problem in the transition zone.

**The real insight**: The problem isn't that grid vertices are IN the CDT. It's that they're INTERIOR Steiner points instead of BOUNDARY vertices. A boundary vertex at U=0 on the convex hull is handled correctly by CDT — it just becomes part of the hull. An interior Steiner point at U=0 exactly on a constraint edge forces CDT into degenerate geometry.

**Resolution**: The grid vertices at segStart/segEnd should remain in the CDT, but as **boundary vertices** (in `stripBot`/`stripTop` sub-segments) rather than in `stripInteriorVerts`. Combined with boundary companion injection, this reframes the CDT problem correctly.

However, this is actually a variant of Proposal 3 (per-band CDT where boundary grid vertices are in stripBot/stripTop) or a corrected Proposal 2 where the mid-row grid vertices are moved from `stripInteriorVerts` to being proper boundary sub-vertices. Both achieve the same goal.

---

## Accepted Items

1. **Companion desert analysis** — ACCEPTED. `SHELL_FRACTIONS = [0.04, 0.09, 0.16, 0.25]` at [line 586](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L586) reaches only 25% of strip half-width. The boundary zone has no companion coverage.

2. **Root cause identification** — ACCEPTED. Mid-row grid vertices at segStart/segEnd are interior Steiner points at U=0 (normalized), creating degenerate CDT geometry.

3. **Proposal 2 Part A mechanism** — ACCEPTED with caveat (C3). Vertical constraints work through convex-hull preservation + flip prevention, not through direct sweep enforcement.

4. **Graceful degradation claim** — ACCEPTED. P5 crossing removal correctly handles rare constraint conflicts (C5).

5. **Vertex existence guarantee** — ACCEPTED (C6). All constraint vertex references are valid.

6. **R29.2 windowing is still present** — NOTE. The code at [line 1193](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1193) still has `MAX_CDT_BANDS = 24` with windowed iteration, despite journal entry claiming R29 removed it. The Generator's references to windowing are correct for the current code.

---

## Final Verdict: CONDITIONAL ACCEPT — Corrected Proposal 2

### Mandatory Amendments

**Amendment A (fixes C1, C2)**: Replace the Generator's companion injection with a strip-assembly-time injection:

During strip assembly, AFTER segStart/segEnd are known, inject boundary companions directly into `stripInteriorVerts`. For each mid-row band [m, m+1]:
- Compute T-levels at 0.25, 0.5, 0.75 of the band T-gap
- For each strip boundary (segStart, segEnd):
  - Compute U = unionU[boundary] + inwardOffset (0.3 × adjacent column gap)
  - Allocate a new vertex in a secondary buffer (or pre-allocate slack in the main buffer)
  - Push to `stripInteriorVerts` with the explicit T and U

This requires:
1. Pre-allocating vertex buffer slack (estimate: 6 companions × numBands × 2 boundaries × numSegments ≈ ~2000 vertices max, ~24KB — negligible)
2. Adding a `boundaryCompanionCount` counter
3. ~15 lines of code in the strip assembly section, after mid-row processing and before CDT invocation

**Amendment B (fixes C3 — optional but recommended)**: Apply a +1e-8 U-offset to boundary column constraint vertices in normalized CDT coordinates to make constraints non-vertical. This forces cdt2d to process them as proper edge events rather than relying on convex-hull preservation. Alternatively, accept the current convex-hull mechanism and document the dependency.

**Amendment C (cosmetic)**: Add the boundary column constraints as the Generator proposed (Part A). They provide real value preventing Delaunay flips, even if the mechanism (C3) is weaker than claimed. ~10 lines of code, no risk.

### Implementation Order for Executioner

1. Add boundary column constraints (Part A — Amendment C) — 10 lines, zero risk
2. Add boundary companion injection at strip assembly time (Amendment A) — 15 lines, requires vertex buffer slack
3. Run export and check `stats.minAngleUV` and `stats.maxAspectUV` at boundary zones
4. If aspect ratio at boundaries is still >8:1, escalate to Proposal 1

### Validation Protocol

| Metric | Current | Target | How to Verify |
|--------|---------|--------|---------------|
| maxAspectUV at boundary | ~714:1 | <10:1 | Chain-strip stats in console log |
| R2 violations (boundary+feature triangles) | High | <100 per segment | `stats.r2Violations` |
| minAngleUV | ~2° | >10° | Chain-strip stats |
| Aspect ratio violations (>4:1) | 54.4% | <15% | Export quality report |
| Build time regression | 78s | <85s | Timer log |
| Test suite | 131 pass | 131 pass | `npx vitest run` on OWT+CST+CL |

### Escalation Trigger

If corrected Proposal 2 yields `maxAspectUV > 15:1` at boundary zones after implementation, escalate to Proposal 1 (Grid-Side Adaptive Fan) with the C10 fix (inject grid vertices as CDT boundary vertices, not interior Steiner points).

---

## Open Questions for Generator

1. The R29 journal entry claims windowing was removed, but the code still has `MAX_CDT_BANDS = 24`. Was R29 reverted? The windowing affects boundary companion count estimation.

2. For Amendment A, should boundary companions be emitted once per STRIP boundary or once per CHAIN vertex? Per-strip-boundary is simpler and sufficient. Per-chain-vertex (as the Generator proposed) injects redundant companions at the same boundary column from multiple chain vertices.

3. The companion offset `0.3 × colGap` — should this scale with the number of mid-row bands (higher density for taller strips)? Or is a fixed fraction sufficient?

---

*Signature: Verifier Agent — 2026-03-07*
