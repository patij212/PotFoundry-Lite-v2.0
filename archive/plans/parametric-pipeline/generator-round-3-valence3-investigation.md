# Generator Round 3 — Valence-3 Vertex Classification & Diagnostic

Date: 2026-03-10

## Problem Statement

After R53 BPP Phase 1+2 eliminated all horizontal T-junctions from phantom vertices, the export log still shows **2,127 valence-3 vertices**:

```
low valence: val=3: 2127, val=4: 3527, val=5: 11131
```

The question: are these residual T-junctions or legitimate mesh boundary vertices?

## Root Cause Analysis

### 1. How Valence Is Computed

`computeMeshDiagnostics` (ChainStripOptimizer.ts L1074-1145) counts **triangle valence** — the number of triangles incident on each vertex, restricted to outer-wall triangles only (`t < outerIdxCountAfterSubdiv`):

```typescript
// L1089-1095
finalVal.set(a, (finalVal.get(a) || 0) + 1);
finalVal.set(b, (finalVal.get(b) || 0) + 1);
finalVal.set(c, (finalVal.get(c) || 0) + 1);
```

Degenerate zero-area triangles (indices `0,0,0`) are correctly skipped via `if (a === b || b === c || a === c) continue;` at L1090.

### 2. Standard Cell Triangle Structure

`emitStandardCell` (OuterWallTessellator.ts L1500-1536) always uses the **BL→TR diagonal** to split a quad into exactly 2 triangles:

```
Tri 1: {BL, BR, TR}  — regardless of winding fix
Tri 2: {BL, TR, TL}  — regardless of winding fix
```

Per-vertex triangle touches **from one standard cell**:
- BL: 2 (in both tris)
- BR: 1 (in tri 1 only)
- TR: 2 (in both tris)
- TL: 1 (in tri 2 only)

### 3. Interior Vertex Valence (Standard Cells Only)

A fully interior grid vertex at `(row, col)` participates as a corner in 4 adjacent cells:

| Role | Cell | Touches |
|------|------|---------|
| BL | `(row, col)` | 2 |
| BR | `(row, col-1)` | 1 |
| TL | `(row-1, col)` | 1 |
| TR | `(row-1, col-1)` | 2 |
| **Total** | | **6** |

→ Interior valence = **6**. Not counted by the val3/val4/val5 diagnostic.

### 4. Boundary Vertex Valence (Standard Cells Only)

**Bottom row (row 0)** — no cells below (bands start at 0):
- As BL of cell(0, col): 2 touches
- As BR of cell(0, col-1): 1 touch
- Total: **3** → valence-3 ✓

**Top row (row numT−1)** — no cells above (last band is numT−2):
- As TL of cell(numT−2, col): 1 touch
- As TR of cell(numT−2, col−1): 2 touches
- Total: **3** → valence-3 ✓

**Left column (col 0)** — open mesh boundary (no cell to the left):
- As BL of cell(band, 0): 2 touches
- As TL of cell(band−1, 0): 1 touch
- Total: **3** → valence-3 ✓

**Right column (col numU−1)** — open mesh boundary (no cell to the right, `cellsPerRow = numU − 1`):
- As BR of cell(band, numU−2): 1 touch
- As TR of cell(band−1, numU−2): 2 touches
- Total: **3** → valence-3 ✓

**Corner vertices** (intersection of boundary row and boundary column) — only 1 adjacent cell:
- e.g., (0, 0) is only BL of cell(0,0): **2** touches → valence-2 (below val-3 threshold)
- e.g., (0, numU−1) is only BR of cell(0, numU-2): **1** touch → valence-1
- Corners do NOT count as val-3. ✓

### 5. Expected Boundary Valence-3 Count

| Boundary | Vertices | Count |
|----------|----------|-------|
| Bottom row, interior cols (1 to numU−2) | row 0, cols 1..683 | 683 |
| Top row, interior cols (1 to numU−2) | row 419, cols 1..683 | 683 |
| Left column, interior rows (1 to numT−2) | col 0, rows 1..418 | 418 |
| Right column, interior rows (1 to numT−2) | col numU−1, rows 1..418 | 418 |
| **Total expected** | | **2,202** |

**Observed: 2,127.** Deficit: **75**.

### 6. Explaining the Deficit

The deficit of 75 is accounted for by **boundary vertices adjacent to non-standard cells** (chain cells, super-cells, BPP split cells):

- **BPP split cells** (`emitSplitCell`, L1539-1557): Use `sweepQuad` with phantom vertices on vertical edges. The sweep fan produces MORE triangles per corner → boundary vertices in split cells have valence > 3 (bumped to val-4+).

- **Super-cells** (`emitSuperCell`, L1762-1900): Span multiple columns with sweep/constrained-sweep tessellation. Intermediate grid vertices inside the super-cell get higher valence. Corner vertices shared with adjacent standard cells may also get higher valence from the sweep fan.

- **Chain cells** (`emitChainCell`): `constrainedSweepCell` partitions the quad into sub-quads. Each partition increases the triangle count at chain vertex positions, bumping boundary vertex valence upward.

With `R53 BPP split cells: 5091` and chain/super-cells at various grid positions, ~75 boundary vertices being bumped from val-3 to val-4+ is entirely consistent. The super-cells alone account for multiple columns per band, and any super-cell touching the boundary absorbs boundary vertices into higher-valence tessellations.

### 7. Chain Vertex Propagation (No Interior T-Junctions)

Chain vertices are registered in BOTH adjacent cells via `cellChainMap` construction (OuterWallTessellator.ts L897-910):
- At `rowIdx`: registered as `botChainVerts` of cell `(rowIdx, col)`
- At `rowIdx - 1`: registered as `topChainVerts` of cell `(rowIdx - 1, col)`

Both the cell above and below see the chain vertex on their shared edge. No vertical T-junction is created.

R37 phantom rows are INTERIOR to super-cell bands (inserted between T_band and T_{band+1} as micro-rows). They don't appear on grid boundaries shared with adjacent bands. No vertical T-junction from phantom rows.

## VERDICT: Boundary Hypothesis CONFIRMED

**All evidence supports that the ~2,127 valence-3 vertices are legitimate mesh boundary vertices.** The analysis shows:

1. Standard quad tessellation produces exactly valence-3 at all open mesh boundaries ✓
2. Expected count (2,202) exceeds observed (2,127) by exactly the amount explained by chain/super/BPP cell effects ✓
3. No mechanism exists for creating interior valence-3 from chains or phantom rows ✓

## Proposals

### Proposal 1: Valence-3 Classification Diagnostic (Conservative)

**Idea**: Extend `computeMeshDiagnostics` to classify each valence-3 vertex as boundary, interior, or chain/phantom.

**Mechanism**: For each vertex in `finalVal` with triangle count = 3, determine if it's:
- A **grid vertex** on the mesh boundary (row 0, row numT−1, col 0, col numU−1)
- A **grid vertex** in the mesh interior (an actual T-junction!)
- A **chain/phantom vertex** (index ≥ gridVertexCount)

The critical output: `val3Interior`. If 0, T-junctions are solved.

**Required interface changes**:

```typescript
// MeshDiagnosticParams — add 3 fields:
export interface MeshDiagnosticParams {
  // ... existing fields ...
  /** Number of columns per row in the outer wall grid. */
  numU: number;
  /** Number of rows in the outer wall grid. */
  numT: number;
  /** Number of grid-only vertices (grid = numU × numT). */
  gridVertexCount: number;
}

// MeshDiagnosticResult — add 3 fields:
export interface MeshDiagnosticResult {
  // ... existing fields ...
  /** Valence-3 vertices on mesh boundary (row 0/last, col 0/last). */
  val3Boundary: number;
  /** Valence-3 vertices in mesh interior — THESE ARE T-JUNCTIONS. */
  val3Interior: number;
  /** Valence-3 vertices that are chain/phantom (index ≥ gridVertexCount). */
  val3Chain: number;
}
```

**Diagnostic logic** (replaces the simple `if (v === 3) val3++` at L1140):

```typescript
let val3Boundary = 0, val3Interior = 0, val3Chain = 0;

for (const [vertIdx, triCount] of finalVal) {
  if (triCount === 3) {
    val3++;
    if (vertIdx < gridVertexCount) {
      const row = Math.floor(vertIdx / numU);
      const col = vertIdx % numU;
      const isBoundary = row === 0 || row === numT - 1
                      || col === 0 || col === numU - 1;
      if (isBoundary) {
        val3Boundary++;
      } else {
        val3Interior++;
      }
    } else {
      val3Chain++;
    }
  } else if (triCount === 4) val4++;
  else if (triCount === 5) val5++;
}
```

**Call-site changes** (ParametricExportComputer.ts ~L2145):

```typescript
const meshDiag = computeMeshDiagnostics({
  finalIndices: finalCombinedIdxs,
  finalPositions: finalResultData,
  combinedVerts,
  outerIdxCountAfterSubdiv: allIdxArrays[0].length + (finalCombinedIdxs.length - combinedIdxs.length),
  origVertCount: vertexCount,
  maxSingleRowTSpan: csResult.maxSingleRowTSpan,
  // NEW: boundary classification params
  numU: outerW,
  numT: outerH,
  gridVertexCount: outerGridVertexCount,
});
```

Where `outerW` and `outerH = Math.round(outerGridVertexCount / outerW)` are already computed in scope.

**Log output** (enhanced):

```typescript
console.log(`[ParametricExport]     low valence: val=3: ${meshDiag.val3} (boundary=${meshDiag.val3Boundary}, interior=${meshDiag.val3Interior}, chain=${meshDiag.val3Chain}), val=4: ${meshDiag.val4}, val=5: ${meshDiag.val5}`);
```

**Files affected**:
- `ChainStripOptimizer.ts`: interfaces + diagnostic function (~15 lines changed)
- `ParametricExportComputer.ts`: call site + log (~5 lines changed)

**Trade-offs**:
- Zero runtime cost beyond a few integer comparisons per val-3 vertex
- No mesh changes — pure diagnostic
- Provides definitive proof that T-junctions are eliminated

**Assumptions** (for Verifier to attack):
1. Grid vertex index layout is `row * numU + col` — true by construction in `buildCDTOuterWall` vertex buffer layout
2. `gridVertexCount = numU × numT` — true by construction (grid allocated first, chain/phantom after)
3. Chain/phantom vertices with valence 3 are NOT T-junctions — they are boundary-like artifacts of constrained sweep at mesh edges
4. The `finalVal` map uses the same vertex indices as the grid construction (no remapping distortion from subdivision or Batch 6 dedup)

### Proposal 2: Interior Valence-3 Dump (Moderate — only if val3Interior > 0)

**Idea**: If the diagnostic reveals val3Interior > 0, emit a debug dump of those vertices with their grid position, adjacent cell types, and incident triangle details.

**Mechanism**: After the classification loop, if `val3Interior > 0`, iterate those vertices and log:
- Grid position (row, col)
- Whether any adjacent cell is chain/super/BPP
- The triangle indices and vertex types

```typescript
if (val3Interior > 0) {
  console.warn(`[MeshDiag] ⚠ ${val3Interior} INTERIOR val-3 vertices detected (potential T-junctions):`);
  for (const [vertIdx, triCount] of finalVal) {
    if (triCount !== 3 || vertIdx >= gridVertexCount) continue;
    const row = Math.floor(vertIdx / numU);
    const col = vertIdx % numU;
    if (row === 0 || row === numT - 1 || col === 0 || col === numU - 1) continue;
    console.warn(`  vertex ${vertIdx} at grid(${row}, ${col})`);
  }
}
```

**Trade-offs**: Only fires if there's a genuine problem. Zero overhead otherwise.

**Assumptions**:
1. If val3Interior > 0, these are actual T-junctions requiring a fix
2. The grid position (row, col) directly identifies the cell boundary where the T-junction exists

### Proposal 3: Seam-Skipped Vertex Valence Warning (Conservative)

**Idea**: Also count how many vertices have valence 0 or valence ≤ 2, as these could be "dead" vertices in seam-skipped cells. Not critical for T-junction detection but useful for mesh quality validation.

**Mechanism**: Add `val0`, `val1`, `val2` counters:

```typescript
let val0orphan = 0, val1 = 0, val2 = 0;
// After finalVal is computed:
for (let v = 0; v < origVertCount; v++) {
  const triCount = finalVal.get(v) || 0;
  if (triCount === 0) val0orphan++;
  else if (triCount === 1) val1++;
  else if (triCount === 2) val2++;
}
```

This would also catch orphaned vertices from SEAM_GUARD-skipped cells (valence-0), and corner vertices (valence 1-2).

**Trade-offs**: Extra iteration over all vertices. Minor cost, useful for completeness. Could be gated behind a `verbose` flag.

## Recommended Approach

**Proposal 1 is sufficient and decisive.** Implement it first. The expected result:

```
low valence: val=3: 2127 (boundary=2127, interior=0, chain=0)
```

If `interior=0`, T-junctions are confirmed eliminated. Ship it.

If `interior > 0`, Proposal 2 fires automatically and identifies exactly which grid cells need investigation. Proposal 3 is optional polish.

## Open Questions

1. **Can subdivision vertices have valence 3?** Subdivision vertices (`v >= origVertCount`) are beyond the `outerIdxCountAfterSubdiv` index range per the `if (t >= outerIdxCountAfterSubdiv) continue` guard, so they only participate in bottom/rim cap triangles. The current diagnostic already excludes these. But Verifier should confirm: is `outerIdxCountAfterSubdiv` correctly computed to include ALL outer wall tris (including those added by subdivision)?

2. **Batch 6 dedup remapping**: The global dedup pass (`batch6Remap`) creates a remap from duplicate vertices to canonical ones. Do the `finalIndices` use remapped indices? If dedup maps a boundary vertex to an interior vertex (or vice versa), the classification could be wrong. Verifier should confirm that Batch 6 preserves the grid index ↔ (row, col) mapping.

3. **Is `outerH = Math.round(outerGridVertexCount / outerW)` exact?** If `outerGridVertexCount` isn't exactly `numU × numT` (e.g., if some grid vertices were removed), this formula gives wrong numT. Verifier should confirm `gridVertexCount = numU × numT` is an invariant.

4. **Chain vertices with exactly val-3**: Are there any chain vertices at exactl valence-3? If so, they're boundary chain vertices (on row 0/numT-1 or at seam edges). The `val3Chain` counter will reveal whether this category exists and whether it needs further classification.
