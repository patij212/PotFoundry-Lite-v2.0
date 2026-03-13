# Executioner Feasibility Assessment — R53 BPP (Boundary Phantom Propagation)

Date: 2026-03-10

---

## Feasibility Verdict: FEASIBLE — Proceed with Implementation

BPP is implementable exactly as the Verifier described. The key implementation insight is that `sweepQuad` works correctly on vertical edges (all-same-U), producing a valid fan triangulation from the side with fewer vertices.

---

## File Impact Analysis

| File | Section | Change Type | LOC |
|------|---------|-------------|-----|
| `OuterWallTessellator.ts` | L1106 (overflow guard) | Add `console.warn` | +2 |
| `OuterWallTessellator.ts` | After L1385 (R37 log) | `PhantomBoundaryInfo` interface + `phantomBoundaryMap` construction | +55 |
| `OuterWallTessellator.ts` | After `emitStandardCell` (~L1442) | New `emitSplitCell` function | +20 |
| `OuterWallTessellator.ts` | Main dispatch loop (~L1649) | BPP check before `emitStandardCell` | +6 |
| `OuterWallTessellator.ts` | After dispatch loop | BPP counter + log line | +5 |
| **Total** | | **Purely additive** | **~88** |

**Zero modifications to existing logic.** All changes are additive — new code paths, new data structure, new function.

---

## Implementation Strategy: Vertical-Edge Sweep

The Verifier's recommended "horizontal strip decomposition" has a subtle gap for single-sided phantoms: when one T-level has only 1 vertex (phantom on left, no vertex on right), strips at intermediate phantom T-values produce degenerate 1×1 sweeps that emit zero triangles, creating mesh holes.

**Solution:** Build two sorted vertical edges and call `sweepQuad`:
```
leftEdge  = [BL, ...leftPhantoms sorted by T, TL]   — all at U = unionU[col]
rightEdge = [BR, ...rightPhantoms sorted by T, TR]   — all at U = unionU[col+1]
sweepQuad(indexBuf, leftEdge, rightEdge, vertices)
```

**Why this works:**
1. `sweepQuad` compares `botNextU` vs `topNextU`. Since all left-edge vertices have U_left < U_right, it always advances the left pointer first.
2. This produces a fan from the right edge's current vertex (BR), then transitions when the right pointer advances.
3. `emitTriCCW` correctly handles winding for these vertical-edge triangles (tested: cross product is negative → swaps to CCW).
4. For 1 phantom on left: 3 triangles (fan from BR + corner triangle). For 2: 4 triangles. For both sides: fan from BR then fan from TL.

**Triangle quality:** Fan aspect ratios are bounded by degenGuard (phantom T-values are ≥5% of band height from boundaries). Typical case (1-2 phantoms) produces well-shaped triangles.

---

## Risk Zones

| Risk | Severity | Mitigation |
|------|----------|------------|
| `sweepQuad` cellWidth=0 for vertical edges → QUALITY_ZONE=0 | NONE | Falls through to U-comparison branch, which correctly picks the left edge first. Fan triangulation is valid. |
| Phantom vertex U precision mismatch | NONE | Both phantom and grid corner vertices use the exact same `unionU[c]` value. Zero floating-point discrepancy. |
| Adjacent super-cells skip propagation | NONE | `!superCellCols.has(adjKey)` correctly excludes super-cell columns. Super-cells handle their own phantoms internally. |
| Seam boundary wraparound | LOW | Hard bound `leftAdjacentCol >= 0` + seam guard `adjUSpan > SEAM_GUARD` provides double protection. |
| Edge flip optimizer on split cells | NONE | `quadMap[quadIdx] = -1` prevents optimizer from treating split cells as standard 2-tri quads. |
| Batch 6 dedup interaction | NONE | BPP references existing phantom vertices — no new vertices created. Dedup already covers phantom index range. |

---

## Unstated Dependencies (None Critical)

1. **`superCellMap` iteration order:** BPP iterates `superCellMap` to find phantom boundary vertices. The map preserves insertion order (ES2015+ Map). No ordering dependency — each super-cell's boundaries are independent.

2. **Phantom vertex T-sorting:** BPP sorts phantom indices by T-ascending for the vertical edge sweep. The degenGuard guarantees all phantom T-values are strictly between T_bot and T_top, so sorting is well-defined.

3. **`cellChainMap` completeness:** BPP checks `!cellChainMap.has(adjKey)` to skip chain cells. If a chain cell is missing from `cellChainMap` (shouldn't happen), it would receive BPP phantom propagation. Low risk — `cellChainMap` is built exhaustively from `rowChainVerts`.

---

## Implementation Sequence

1. Add `console.warn` to phantom slot overflow guard (L1106)
2. Build `phantomBoundaryMap` after R37 construction (after L1385)
3. Add `emitSplitCell` function (after `emitStandardCell`, ~L1442)
4. Add BPP dispatch check in main emission loop (L1649)
5. Add BPP split cell counter and log line
6. Run `typecheck` → `lint` → `test`

---

## Questions for Generator/Verifier

None — the plan is clear and complete. Implementation proceeds.
