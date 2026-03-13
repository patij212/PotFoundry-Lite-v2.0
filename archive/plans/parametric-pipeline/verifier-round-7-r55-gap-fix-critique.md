# Verifier Round 7 — Critique of Generator R55 Gap Fix Proposal

Date: 2026-03-10

## Summary Verdict: ACCEPT WITH AMENDMENTS

Approach S is fundamentally sound. The root cause analysis is verified as correct. The bidirectional registration invariant holds. However, the Generator's **benefit preservation claim is critically wrong** (70–90% is closer to 10–30%), and the proposal has **one missing edge case** and **one incorrect call-site count**. These do not block implementation but the team should go in with accurate expectations.

---

## Critique

### C1 [VERIFIED]: Root Cause — Cross-Column Coalescing Mismatch

**Generator's claim**: T-junctions arise from cross-column coalescing — grid vertex in one column, chain vertex registered to a different column via `bsearchFloor`.  
**Verification result**: CONFIRMED.

Traced the complete chain:

1. Chain vertex registration at [L980–1001](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L980-L1001): uses `bsearchFloor(unionU, cv.u)` to determine column `gc`. A chain vertex at `u = unionU[col] - ε` maps to column `col-1`.

2. Grid vertex `G = band * numU + col` at position `unionU[col]` is a corner of 4 cells: `(band, col)`, `(band, col-1)`, `(band-1, col)`, `(band-1, col-1)`.

3. The chain vertex `C` is registered to cells in column `gc` only (both vertical neighbors via bidirectional registration), NOT to cells in column `gc+1` or `gc-1`.

4. `coalesceNearGridChain()` at [L330–385](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L330-L385) maps `G → C` in `coalMap`.

5. Post-processing remap at [L2155–2168](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L2155-L2168) blanket-replaces ALL `G` references → `C`, including in standard cells that don't have `C` on their edge.

6. Standard cell's corner `G → C` creates an edge that doesn't match the chain cell's subdivided edge → T-junction.

**Is this the ONLY mechanism?** Yes, by construction. All grid vertices on cell edges are at **column boundary positions** (`unionU[col]`). No grid vertex lies in the interior of a cell. Since `GRID_CHAIN_COALESCE_RADIUS = 0.0006` < typical column spacing `~0.00173`, coalescing only occurs between a grid vertex at a column boundary and a chain vertex registered to one of the two columns sharing that boundary. This is always a "cross-column" coalesce in the sense that matters: the chain vertex is registered to one column's cells but not the adjacent column's cells.

**Important subtlety**: Same-column coalescing (chain vertex and grid vertex both in column `col`) can still create T-junctions at the **other** column boundary. Example: chain vertex C at `u = unionU[col] + ε` registered to col `col`. Grid vertex BL at `unionU[col]` is coalesced. Cell `(band, col-1)` has BR = BL = G, but C is NOT registered to col-1 cells. Same mechanism, same result. The Generator's analysis covers this implicitly (it's the same boundary vertex sharing problem).

---

### C2 [VERIFIED]: Bidirectional Registration Invariant

**Generator's claim**: Chain vertex at `rowIdx=r, column=gc` is registered to BOTH `cell(r-1, gc).topChainVerts` AND `cell(r, gc).botChainVerts`.  
**Verification result**: CONFIRMED with conditions.

Code at [L980–1001](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L980-L1001):

```typescript
for (const cv of chainVertices) {
    if (cv.t !== undefined) continue;           // (a) skip companions
    if (batch2Remap.has(cv.vertexIdx)) continue; // (b) skip batch2 merged
    ...
    if (cv.rowIdx > 0) { cell(r-1, gc).topChainVerts.push(...); }
    if (cv.rowIdx < numT - 1) { cell(r, gc).botChainVerts.push(...); }
}
```

Three conditions could break the invariant:

**(a) Companion skip (`cv.t !== undefined`)**: Companions are 2D offset vertices — they don't participate in edge construction. They are separate from the primary chain vertex. **SAFE** — not on edges.

**(b) batch2Remap skip**: R52 Precision Lock at [L898–908](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L898-L908) — `batch2Remap` is declared as `new Map<number, number>()` and never populated (DISABLED). So this skip never fires. **SAFE** — batch2Remap is always empty.

**(c) Boundary rows**: `cv.rowIdx === 0` → only `botChainVerts` registration (no cell above). `cv.rowIdx === numT - 1` → only `topChainVerts` registration (no cell below). For interior rows, both registrations occur. **CORRECT** — boundary vertices have fewer than 4 adjacent cells, and the Generator's bounds check handles this.

**Invariant holds.** Within the same column, vertically adjacent cells sharing a row boundary always have matching chain vertices.

---

### C3 [CRITICAL]: Benefit Preservation Claim — 70–90% Is Grossly Optimistic

**Generator's claim**: "The majority of coalescing occurs at chain-to-chain boundaries (interior of chain bands), which remain fully optimized. Preserves 70–90% of R55 benefit."  
**Actual analysis**: The true preservation rate is likely **10–30%**, not 70–90%.

**Evidence — structural argument**:

For a typical style with ~20 chains, each spanning ~243 rows, most chains occupy **single-column cells** (a chain vertex at one U position per row, registered to one column). A single-column chain cell at `(band, col)` has:

- BL = `band * numU + col` — shared with cells `(band, col-1)` and `(band-1, col-1)`
- BR = `band * numU + (col+1)` — shared with cells `(band, col+1)` and `(band-1, col+1)`

If the chain is a narrow band (1 column wide), the cells to the LEFT (`col-1`) and RIGHT (`col+1`) are **standard cells** (no chain vertices registered to them). This makes:
- BL: cell `(band, col-1)` is standard → BL is **UNSAFE**
- BR: cell `(band, col+1)` is standard → BR is **UNSAFE**

**Result**: For every single-column chain cell, BOTH corner grid vertices are unsafe. R55 coalescing is completely suppressed. The `emitChainCell` path processes BL and BR on bot/top edges — these are the ONLY grid vertices on those edges. Zero coalescing.

**Where coalescing survives**:
1. **Super-cell intermediate grid vertices** where cells above AND below are also chain/super cells (requires horizontally AND vertically aligned chain coverage)
2. **R54-fused multi-column** chain cells where the merged neighbor's cells are all chain cells

Both of these are minority scenarios. R54 fusion at [L1070–1140](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1070-L1140) creates 2-column super-cells, but the cells above/below the intermediate grid vertex are typically standard cells.

**Quantitative estimate**: With ~4,854 chain cell entries, most being single-column, and super-cells comprising a fraction of the total, the coalescing preserved by Approach S is dominated by super-cell interiors with vertically aligned chain coverage. This is likely **10–30%** of the original R55 coalescing count.

**Required fix**: The Generator must revise the benefit estimate downward and evaluate whether Approach S effectively reduces to Approach B (disable R55) for the majority of chain cells. If the residual pin triangles at single-column chain cell boundaries cause visible quality regression, Approach A (R55-BPP) becomes necessary.

---

### C4 [WARNING]: Degenerate Triangles from Same-Cell Coalescing

**Generator's omission**: When a grid vertex G and its coalescing target C are both on the same cell's edge (e.g., cell `(band-1, col)` has C in `topChainVerts` and G as TL corner), the post-processing remap creates `G → C` in the cell's triangulation. If the cell was triangulated with both C and G as separate vertices, a triangle `[C, G, X]` becomes `[C, C, X]` — a degenerate triangle.

**Impact**: Degenerate triangles (zero area) are geometrically harmless — they contribute no visible surface. However:
- They inflate triangle count
- They may confuse downstream CSO edge-flip decisions (degenerate neighbor check)
- They add noise to boundary edge counting diagnostics

**Severity**: WARNING, not CRITICAL. The existing code already produces degenerate triangles from seam cells (`[0,0,0, 0,0,0]`), so the codebase tolerates them. But this should be documented.

---

### C5 [NOTE]: Call-Site Count — 7, Not 8

**Generator's claim**: "All 8 call sites pass the `safeToCoalesce` set."  
**Actual count**: 7 call sites.

| # | Location | Function |
|---|----------|----------|
| 1 | L1762 | `emitChainCell` — botEdge |
| 2 | L1763 | `emitChainCell` — topEdge |
| 3 | L1926 | `emitChainSplitCell` — sub-band bot |
| 4 | L1927 | `emitChainSplitCell` — sub-band top |
| 5 | L2006 | `emitSuperCell` — main botEdge (non-R37) |
| 6 | L2007 | `emitSuperCell` — main topEdge (non-R37) |
| 7 | L2041 | `emitSuperCell` — R37 intermediate boundaries (loop) |

The Generator may have miscounted L2041 (a single call site inside a loop) as two, or counted a call site that doesn't exist. **Minor inaccuracy**, but the Executioner should verify all 7 are updated.

---

### C6 [VERIFIED]: Boundary Vertex Handling (Row 0, Row numT-1)

**Generator's claim**: Out-of-bounds neighbors are skipped (`continue`), making boundary vertices "safe by default."  
**Verification result**: CORRECT.

At row 0 (bottom rim), grid vertex `0 * numU + col` has only cells `(0, col)` and `(0, col-1)` as neighbors. Cells `(-1, col)` and `(-1, col-1)` don't exist → skipped. This means the vertex is safe if `(0, col)` and `(0, col-1)` are both chain/super cells.

This is correct behavior: there are no cells below row 0 to create T-junctions with. Similarly for the top rim (row numT-1).

**Edge case to watch**: If rim stitching code references these grid vertices externally (e.g., inner wall → outer wall joins), the remap could affect those references too. But rim joins work on full row boundaries, not individual vertices, so this should be safe. The Executioner should verify.

---

### C7 [VERIFIED]: Seam Cell Treatment

**Generator's claim**: Seam cells emit degenerate triangles, so treating them as "safe to ignore" is correct.  
**Verification result**: CONFIRMED.

Seam cells at [L2117–2122](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L2117-L2122) emit `indexBuf.push(0, 0, 0, 0, 0, 0)`. After remap, if vertex 0 is in `coalMap`, these become `[C, C, C, C, C, C]` — still degenerate. No visible geometry. **SAFE.**

One minor concern: vertex 0 being replaced by chain vertex C changes which vertex index the degenerate triangles reference. This has no geometric effect but could confuse vertex-usage analysis tools. Not a blocking issue.

---

### C8 [VERIFIED]: Phantom Vertex Exclusion

**Generator's claim**: Phantom vertices (R37) won't be in `safeToCoalesce` since they're not of the form `band * numU + col`, so they'll be excluded from coalescing by the safe guard.  
**Verification result**: CORRECT but CONSERVATIVE.

Phantom vertices have indices `>= totalVertexCount` (in the phantom vertex range `[phantomVertexStart, nextPhantomIdx)`). The `isGridLike` closure at [L1256–1257](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1256-L1257) classifies them as grid-like if they're NOT chain anchors:

```typescript
const isGridLike = (idx: number): boolean =>
    idx < gridVertexCount || (idx >= totalVertexCount && !phantomChainAnchorSet.has(idx));
```

These phantom grid-like vertices would be candidates for coalescing but are NOT in `safeToCoalesce` (which only contains `band * numU + col` indices). So the safe guard blocks their coalescing. This is conservative — some phantom vertex coalescing is lost, but no T-junctions.

Phantom vertices on R37 intermediate boundaries are shared between sub-bands of the same super-cell AND potentially with the cells above/below. Since those cells may be standard cells, blocking coalescing is the correct default. **Verified as safe.**

---

### C9 [WARNING]: Approach S vs. Approach A — Risk of Phased Refinement Trap

The Generator proposes Approach S as primary and Approach A as fallback. Given C3's finding that Approach S preserves only ~10–30% of R55 benefit (not 70–90%), there's a real risk that:

1. Approach S is implemented
2. Pin triangles at chain-to-standard boundaries cause visible quality regression
3. Approach A (R55-BPP) must be implemented anyway
4. Total engineering effort = Approach S + Approach A, instead of just Approach A

The Generator should explicitly address: **is the 10–30% residual R55 benefit worth the complexity of maintaining the safe-coalesce mechanism?** If Approach S ends up being "R55 disabled for 70% of chain cells," the simpler option might be to revert R55 entirely (Approach B) and invest in Approach A for the full fix.

**However**, I do not REJECT on this basis. Approach S is still the correct first step because:
- It fixes the T-junction bug with minimal code change
- It's low-risk (simple pre-scan + 1-line guard)
- Even 10–30% R55 benefit at super-cell interiors is non-zero
- It provides diagnostic data (coalMap.size reduction) to inform whether Approach A is needed

---

## Answers to Generator's Open Questions

### Q1: Bidirectional Registration Invariant
**Answer**: YES, invariant holds. See C2 above. `batch2Remap` is always empty (R52 lock at [L908](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L908)). Companion vertices are correctly skipped (they're not on edges). The registration code at [L990–1001](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L990-L1001) handles row boundaries correctly.

### Q2: Super-Cell Intermediate Grid Vertices
**Answer**: Not always in `cellChainMap`. When a chain runs diagonally and skips column `c`, cell `(band-1, c)` may not be in `cellChainMap`. This makes the intermediate grid vertex at column `c` **UNSAFE** — coalescing is correctly suppressed by Approach S. This is safe but reduces R55 benefit. See C3 for quantitative impact.

For the specific example: super-cell `(band, 5–8)`, intermediate grid vertex at column 7. If the chain crosses from column 6 to column 8 (skipping column 7), then cell `(band-1, 7)` has no chain vertices → NOT in `cellChainMap` → grid vertex at column 7 is UNSAFE → not coalesced. **Correct behavior.**

### Q3: Seam Cell Treatment
**Answer**: CORRECT. See C7 above. Seam cells emit degenerate triangles. Remapping vertex 0 in degenerate triangles changes the index but not the geometry (zero area). No T-junctions possible.

### Q4: Post-Processing Remap Scope
**Answer**: No downstream effects. Fewer `coalMap` entries → fewer remaps in the post-processing loop at [L2155–2168](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L2155-L2168). `batch6Remap` (vertex deduplication at [L2177+](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L2177)) operates on the final vertex buffer after R55 remap and is independent — it deduplicates by spatial position, not by index mapping. Fewer remaps = smaller performance overhead (trivially). **No interaction issues.**

### Q5: Boundary Edge Elimination Completeness
**Answer**: Approach S will eliminate **all R55-induced T-junction boundary edges** (~1,274 new edges above the 2,256 baseline). This is because:
- Every T-junction is caused by R55 coalescing at an unsafe grid vertex (adjacent to a standard cell)
- Approach S suppresses coalescing at ALL unsafe vertices
- No coalescing at unsafe vertices → no T-junctions → boundary edge count returns to ~2,256 baseline

However, the residual pin triangles (from suppressed coalescing) will have high aspect ratios, as they did pre-R55. The mesh is watertight but not geometrically optimal at chain-to-standard boundaries.

---

## Accepted Items

1. **Root cause analysis** — Verified. Cross-column coalescing + global post-processing remap is the correct mechanism.
2. **Approach S mechanism** — Verified. Pre-scan + safe guard is sound.
3. **Bidirectional registration invariant** — Verified. Holds under all current code paths.
4. **Boundary and seam handling** — Verified. Out-of-bounds neighbors correctly skipped, seam cells correctly treated as safe.
5. **Phantom vertex exclusion** — Verified. Conservative but correct.
6. **R53 BPP orthogonality** — Verified. BPP handles vertical phantom edges independently of R55 horizontal coalescing.
7. **Implementation plan** — Structurally correct (pre-scan + guard + pass-through to call sites). Minor count error (7 call sites, not 8).

---

## Amendments Required Before Implementation

### A1 [MANDATORY]: Revise Benefit Estimate
The 70–90% benefit preservation claim must be revised to 10–30%. The Executioner should instrument the build to log:
- `safeToCoalesce.size` vs. total grid vertex candidates
- `coalMap.size` before and after Approach S
- Pin triangle count at chain-to-standard boundaries

This data will inform whether Approach A (R55-BPP) is needed as a follow-up.

### A2 [MANDATORY]: Fix Call-Site Count
7 call sites, not 8. The Executioner should verify all 7 are updated:
- `emitChainCell` (2): L1762, L1763
- `emitChainSplitCell` (2): L1926, L1927
- `emitSuperCell` (3): L2006, L2007, L2041

### A3 [RECOMMENDED]: Add Diagnostic Logging
After building `safeToCoalesce`, log:
```typescript
console.log(`[CDT] R55-S: ${safeToCoalesce.size} safe grid vertices out of ${(totalBands + 1) * (cellsPerRow + 1)} total`);
```
After coalescing, log `coalMap.size` and compare with pre-Approach-S value from git history. This is essential for validating the benefit estimate.

### A4 [RECOMMENDED]: Document Degenerate Triangle Risk
When a grid vertex G and its coalescing target C are both on the same cell's edge (e.g., chain cell where C is in `botChainVerts` and G is BL), the remap creates degenerate triangles `[C, C, X]`. Add a comment near the post-processing remap explaining this is expected and harmless.

---

## Path to ACCEPT

Approach S is ACCEPTED WITH AMENDMENTS A1–A4. No architectural objections. The core mechanism (pre-scan + safe guard) is mathematically sound and eliminates all R55-induced T-junctions.

**The Executioner should**:
1. Implement Approach S as described (with corrected 7 call sites)
2. Add diagnostic logging (A3) to measure actual coalescing preservation
3. After implementation, export a test mesh and verify:
   - Boundary edge count returns to ~2,256 baseline
   - No new boundary edges from R55
   - `coalMap.size` is reported (expect significant reduction from current value)
4. If `coalMap.size` drops below ~20% of pre-Approach-S value AND pin triangles cause visible artifacts, escalate to Approach A (R55-BPP)

**Implementation risk**: LOW. The pre-scan is ~20 lines, the guard is 1 line per call site, and failure mode is conservative (too many pin triangles, not T-junctions).
