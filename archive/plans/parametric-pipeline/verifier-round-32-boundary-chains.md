# Verifier Round 32 — Critique of Generator Boundary Chain CDT Architecture
Date: 2026-03-07

## Summary Verdict: ACCEPT WITH AMENDMENTS

The proposal is architecturally sound and correctly models the problem domain (boundary vertices belong in the boundary polygon, not as interior Steiner points). However, the Generator's central claim — that this promotion **prevents slivers** — is not supported by the geometry. The slivers are caused by the companion desert, not by Steiner-vs-boundary classification. Additionally, B-A1 rescue has an unguarded path that must be fixed. The proposal should proceed, but with corrected expectations and one mandatory code fix.

---

## Critique

### C1 [WARNING]: Overclaimed Benefit — Slivers Are NOT Fixed by Boundary Promotion (Q5)

**Generator's claim**: "Mid-row grid vertices at segStart/segEnd are interior Steiner points in the CDT. Interior points at normalized U=0 lie exactly on the left boundary constraint edge [...] forcing cdt2d to produce degenerate slivers. [...] The fix: make these grid vertices boundary vertices."

**Actual behavior**: The slivers exist because the nearest interior vertex (companion or chain vertex) is far from the boundary column. Whether a vertex at U=0 is an interior Steiner point or a boundary polygon vertex, the CDT must create triangles connecting it to the nearest interior vertex. The triangle aspect ratio is determined by the distance to that interior vertex, NOT by the Steiner/boundary classification.

**Evidence — R31 already provides the same sub-edges**:

R31 boundary column constraints ([OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1666), lines 1676-1685) add constraint edges between every consecutive pair of grid vertices at `segStart`/`segEnd`:

```typescript
for (let m = localJ; m < localJTop; m++) {
    for (const bndCol of [segStart, segEnd]) {
        const vBot = m * numU + bndCol;
        const vTop = (m + 1) * numU + bndCol;
        // ...
        segConstraints.push([vBot, vTop]);
    }
}
```

In `cdtTriangulateStrip`, these constraints pass through `addEdge` ([ChainStripTriangulator.ts](../../src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L263), lines 263-268), creating the **exact same sub-edges** that R32's boundary chain would create. The single left-boundary edge `topLeft → botLeft` (line 256) is redundant because the R31 sub-edges already partition the boundary into per-band segments.

**Counterexample**: Consider a 3-band strip with:
- `topLeft` at (0, 1.0), `botLeft` at (0, 0.0)
- Grid vertices at (0, 0.33) and (0, 0.67)
- Nearest interior companion at (0.003, 0.5)

With **current code** (interior Steiner + R31 constraints):
- R31 adds constraint edges: (0,0)→(0,0.33), (0,0.33)→(0,0.67), (0,0.67)→(0,1.0)
- Interior Steiner points registered at (0, 0.33) and (0, 0.67)
- CDT creates triangles from each boundary segment to (0.003, 0.5)
- Triangle aspect ratio ≈ 0.33 / 0.003 ≈ 110:1 (sliver)

With **R32** (boundary polygon vertices):
- Boundary chain edges: topLeft→(0,0.67)→(0,0.33)→botLeft
- Same vertices, same positions, same constraint edges
- CDT creates the **identical triangles** with **identical aspect ratios**
- Triangle aspect ratio remains ≈ 110:1 (sliver)

**What R32 does improve**: Numerical robustness. With interior Steiner points exactly on the single long constraint edge `topLeft → botLeft`, cdt2d must handle the degenerate collinear-point-on-edge case. With explicit boundary edges, each sub-edge has distinct T-valued endpoints and no collinearity ambiguity. This is a legitimate benefit, but it's a **robustness cleanup**, not a sliver fix.

**Required fix**: The Generator must correct the proposal's framing. R32 is a correctness/robustness improvement that eliminates a degenerate CDT configuration, not a triangle quality fix. The slivers require denser companion injection near boundaries (e.g., T-Ladder `SHELL_FRACTIONS` closer to 0/1) — a separate concern.

**Severity**: WARNING — does not block implementation but the stated rationale is misleading.

---

### C2 [CRITICAL]: B-A1 Rescue Bypass — Unguarded `inStrip` Check

**Generator's claim**: No mention of B-A1 interaction. The proposal modifies the midRows loop (step 3 in the assembly pipeline) but does not update B-A1 rescue (step 6).

**Actual behavior**: B-A1 rescue ([OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1564), lines 1564-1571) checks whether a batch2Remap'd grid vertex is already registered:

```typescript
const inStrip = stripBot.some(sv => sv.idx === vIdx) ||
                stripTop.some(sv => sv.idx === vIdx) ||
                stripInteriorVerts.some(sv => sv.idx === vIdx);
if (inStrip) continue;
```

With R32, grid vertices at `segStart`/`segEnd` are routed to `leftBoundaryChain`/`rightBoundaryChain` instead of `stripInteriorVerts`. B-A1 does NOT check these new arrays. Therefore, if a chain vertex is batch2Remap'd to a grid vertex at `col === segStart` AND that vertex appears as a constraint endpoint, B-A1 fires rescue and pushes the vertex into `stripInteriorVerts`.

**Consequence**: The vertex exists in BOTH `leftBoundaryChain` (from midRows routing) AND `stripInteriorVerts` (from B-A1 rescue). In `cdtTriangulateStrip`, the `addVertex` dedup prevents double-registration in the point set — the second call returns the existing local index. So there is no geometric corruption. However:

1. The rescue increments `batch2RescueCount` falsely, corrupting diagnostics.
2. The vertex appears as both a boundary polygon vertex and an interior Steiner point. While cdt2d treats all vertices identically, this dual presence is architecturally wrong and brittle.
3. If future code processes interior vertices differently from boundary vertices (e.g., skipping boundary vertices in the interior validation loop), the dual presence becomes a real bug.

**Scenario where this fires**: A chain with a detected feature exactly at column `segStart`. `buildMergedRow` maps the chain vertex to the grid vertex at `segStart` via `batch2Remap`. The chain's constraint edge `[gridIdx_at_segStart, next_chain_vertex]` appears in `segConstraints`. B-A1 examines `gridIdx_at_segStart`, doesn't find it in stripBot/stripTop/stripInteriorVerts (it's in `leftBoundaryChain`), and rescues it.

**Required fix**: Update the `inStrip` check:

```typescript
const inStrip = stripBot.some(sv => sv.idx === vIdx) ||
                stripTop.some(sv => sv.idx === vIdx) ||
                stripInteriorVerts.some(sv => sv.idx === vIdx) ||
                leftBoundaryChain.some(sv => sv.idx === vIdx) ||
                rightBoundaryChain.some(sv => sv.idx === vIdx);
```

**Severity**: CRITICAL — must be addressed before implementation.

---

### C3 [NOTE]: Polygon Self-Intersection Risk is Non-Existent (Q1)

**Generator's claim (Q3)**: "If a chain vertex in stripBot was placed at U < unionU[segStart] [...] the polygon could self-intersect."

**Actual behavior**: This cannot happen. The endpoint safety net ([OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1451), lines 1451-1453) guarantees:

```typescript
if (stripBot.length === 0 || stripBot[0].idx !== botLeftIdx) {
    stripBot.unshift({ idx: botLeftIdx, u: uStripLeft, isChain: false, gridCol: segStart });
}
```

`stripBot[0]` is ALWAYS the grid vertex at `botLeftIdx = localJ * numU + segStart` with `u = uStripLeft = unionU[segStart]`. Similarly, `stripTop[0]` is always at `unionU[segStart]`. The left boundary chain vertices are grid vertices at column `segStart`, also at `unionU[segStart]`.

All left-side vertices are at exactly the same U-coordinate. The polygon is collinear on the left side — no "dent", no zigzag, no self-intersection risk.

Even in the edge case E5 (chain vertex in stripBot with different U), the safety net prepends the grid vertex at `unionU[segStart]`, making it `bot[0]`. Any chain vertex with slightly different U would be at index > 0 in stripBot, inside the bottom row boundary, not at the polygon corner.

**Verdict**: ACCEPT. No issue.

---

### C4 [NOTE]: Centroid Filter Handles Boundary Vertices Correctly (Q2)

**Generator's claim (Q2)**: "Boundary chain vertices at U=0 produce triangles with centroids near U=0, which is within bounds. No issue."

**Verification**: In `cdtTriangulateStrip`, normalization ([ChainStripTriangulator.ts](../../src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L172), lines 172-175):

```typescript
const uMin = Math.min(bot[0].u, top[0].u);
const uMax = Math.max(bot[bot.length - 1].u, top[top.length - 1].u);
```

Since `bot[0].u = top[0].u = unionU[segStart]`, `uMin = unionU[segStart]`. Left boundary chain vertices normalize to `(unionU[segStart] - uMin) / uRange = 0`. They sit at x=0 in normalized space, on the convex hull. No vertices exist at x < 0, so no exterior triangles form to the left.

The centroid filter ([line 304](../../src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L304)) uses `uBoundsMin = -0.01`. All triangle centroids have U ≥ 0 (since all vertex U ≥ 0 in normalized space). The filter correctly passes boundary-adjacent triangles.

With `exterior: true`, cdt2d returns all triangles within the convex hull. Exterior triangles (outside the boundary polygon) would occur only between boundary edges and the hull, but since left boundary vertices ARE on the hull, no exterior triangles form on the left side.

**Verdict**: ACCEPT. No issue.

---

### C5 [WARNING]: Test Count is 18, Not ~19 (Q4)

**Generator's claim**: "All `triangulateChainStrip()` calls in `ChainStripTriangulator.test.ts` must add two `[]` arguments after `interiorVerts`. [...] ~19"

**Actual count**: grep search of `triangulateChainStrip(` in `ChainStripTriangulator.test.ts` returns exactly **18 matches** at lines: 108, 132, 156, 180, 189, 216, 237, 249, 264, 285, 298, 327, 342, 358, 370, 385, 410, 427.

**Impact**: Minor — the Generator's estimate of "~19" was close but imprecise. The Executioner needs to update exactly 18 call sites, not ~19.

**What the current calls look like** (representative example from [line 108](../../src/renderers/webgpu/parametric/ChainStripTriangulator.test.ts#L108)):
```typescript
triangulateChainStrip(buf, bot, top, [], [], [], gridVCount, 0.0, 1.0, cdtConfig, stats);
```

Each call currently passes 12 arguments. With R32, two more `[]` arguments are inserted after the 5th argument (`interiorVerts`), making 14 arguments total per call.

**Severity**: WARNING — minor inaccuracy, does not affect design.

---

### C6 [NOTE]: R31 Constraint Edge Dedup Works Correctly

**Generator's claim (Q4)**: "`addEdge` dedup prevents double-counting" when boundary chain edges duplicate R31 column constraints.

**Verification**: `addEdge` in `cdtTriangulateStrip` ([ChainStripTriangulator.ts](../../src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L231), lines 231-237):

```typescript
const addEdge = (a: number, b: number): void => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    cdtEdges.push([a, b]);
};
```

Deduplicates by local index pair, normalized by min/max. Boundary chain edges (from the left/right boundary loop) use the same global indices as R31 column constraints (from `segConstraints`). `addVertex` maps global → local consistently. The dedup is sound.

**Processing order**: Boundary chain edges are added in the boundary construction section (line 252+), BEFORE chain constraint edges (line 260+). So boundary chain edges are registered first; R31 column constraints are silently deduped when encountered later.

**Verdict**: ACCEPT. The Generator's analysis is correct.

---

### C7 [NOTE]: Line Number Discrepancies

The Generator cites several line numbers that are off by 1-4 lines from the actual codebase:

| Generator citation | Actual line | Discrepancy |
|-|-|-|
| "line 253-259" (boundary construction) | 252-257 | ~1 line |
| "line 1758-1766" (`triangulateChainStrip` call) | 1760-1768 | ~2 lines |

These are minor and don't affect the proposal's validity, but the Executioner should use the actual line numbers when editing.

---

## Accepted Items

1. **Architectural correctness**: Grid vertices at `segStart`/`segEnd` on intermediate rows ARE boundary vertices of the CDT polygon. Promoting them from interior Steiner points to boundary polygon vertices is the semantically correct model. ✓

2. **Winding direction analysis**: The Generator's CCW winding analysis is correct. Left boundary descending T (top→bot) and right boundary ascending T (bot→top) match the CCW polygon convention: `bottom(L→R) → right(↑) → top(R→L) → left(↓)`. ✓

3. **T-junction prevention**: The shared vertex indices between CDT boundary chain and adjacent standard grid cells prevent T-junctions. Constraint edges between consecutive boundary chain vertices are enforced by the CDT, matching the shared edges of adjacent grid quads. ✓

4. **Single-band fallback**: When `localJTop - localJ == 1`, the boundary chains are empty and the fallback to single-edge boundaries preserves existing behavior. ✓

5. **addEdge dedup with R31**: Clean, verified. ✓

6. **addVertex dedup**: Clean. Duplicate registrations from B-A1 rescue (C2) are no-ops due to global index dedup. ✓

7. **Edge case E4 (seam crossing)**: Boundary chains are per-segment, strip assembly breaks at seam columns. No cross-seam risk. ✓

8. **Edge case E6 (batch2Remap)**: Remapped chain vertices at segStart/segEnd appear as grid vertices and are correctly routed to boundary chains. ✓

---

## Open Questions for Generator

1. **Can you provide a concrete scenario where boundary promotion changes the CDT output triangles?** The R31 column constraints already add the same sub-edges as the boundary chain. What specific cdt2d behavior differs between "interior Steiner on constraint" and "boundary polygon vertex"? If you cannot demonstrate a difference with a reproducible example, the proposal should be reframed as an architectural cleanup/robustness improvement rather than a sliver fix.

2. **Should the R31 column constraints be removed?** With R32 boundary chains, the R31 column constraints at `segStart`/`segEnd` are fully redundant (same edges, deduped by `addEdge`). Keeping them is harmless (belt-and-suspenders), but removing them would simplify the code. What's the Generator's recommendation?

3. **Performance of B-A1 `inStrip` check**: The updated `inStrip` check with 5 O(n) scans (`some()` on 5 arrays) per constraint endpoint is potentially expensive for strips with many constraints. Should this be refactored to use a Set-based lookup? The typical strip has ~20-50 interior vertices and ~10-20 constraints, so the O(n²) cost is likely negligible, but this should be confirmed.

---

## Implementation Conditions (ACCEPT WITH AMENDMENTS)

The proposal may proceed to the Executioner with these mandatory amendments:

### Amendment A1 (CRITICAL): Update B-A1 Rescue Guard

In [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1568), the `inStrip` check must include `leftBoundaryChain` and `rightBoundaryChain`:

```typescript
const inStrip = stripBot.some(sv => sv.idx === vIdx) ||
                stripTop.some(sv => sv.idx === vIdx) ||
                stripInteriorVerts.some(sv => sv.idx === vIdx) ||
                leftBoundaryChain.some(sv => sv.idx === vIdx) ||   // R32 amendment
                rightBoundaryChain.some(sv => sv.idx === vIdx);    // R32 amendment
```

### Amendment A2 (WARNING): Correct the framing

The proposal must acknowledge that boundary promotion is a **robustness/correctness improvement**, not a sliver fix. The slivers require addressing the companion desert (e.g., T-Ladder shell fractions closer to 0 and 1, or additional companion injection at boundary bands). This reframing prevents the team from believing slivers are "fixed" when they are not.

### Amendment A3 (NOTE): Fix test count

Document that exactly 18 call sites need updating, not ~19.

### Validation Protocol for Executioner

1. All 131 existing tests must pass (`npm test`)
2. `npm run typecheck` passes
3. `npm run lint` passes with 0 warnings
4. Export a Gothic Arches pot (style with many chains) and verify:
   - Triangle count ≈ same as before (±5%)
   - `stats.minAngleUV` ≈ same as before (or better)
   - `stats.r2Violations` ≈ same as before
   - No visual regression at chain-to-grid transitions
5. Export a simple Rounded Cylinder (few chains) and verify identical mesh output
6. Specifically inspect `batch2RescueCount` in diagnostic output — should NOT increase after A1 fix

---

*Signature: Verifier Agent — 2026-03-07*
