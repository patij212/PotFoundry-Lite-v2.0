# Executioner Review — R37 Column-Crossing Dip Elimination

Date: 2026-03-08

## Feasibility Assessment: FEASIBLE

The converged Proposal 2 (per-super-cell band splitting) is implementable as specified.
All 7 Verifier amendments are incorporated. No pipeline reordering is needed.

## Strategy: Buffer Overestimate (avoids pipeline reordering)

The Verifier's A3 amendment suggests reordering sections 2→3.7→3.8→3.9→2
to know phantom count before buffer allocation. This is high-risk — batch2Remap
and cellChainMap reference `vertices[]` for position lookups.

**Instead**: allocate the buffer with `chainEdges.length * 6` extra phantom slots
at section 2 (chainEdges.length is known at that point). Section 3.9 writes
phantom vertices into the extra space. Wasted space: ≤360KB for 5k edges.

This avoids ALL code motion and preserves the existing pipeline order exactly.

## Amendment Disposition

| Amendment | How addressed |
|-----------|--------------|
| A3 (CRITICAL): Buffer | Overestimate at line 785 — no reorder needed |
| A4 (CRITICAL): Pre-split chainEdges | Section 3.9 builds edgeSplitMap, replaces master chainEdges entries |
| A5 (CRITICAL): Sub-band uses pre-split | Subband edge assignment uses `r37.subEdges` (all pre-split) |
| A6 (WARNING): Degenerate guard | `max(1e-4, 0.05 * bandHeight)` applied to crossing T values |
| A7 (WARNING): isChainV bounds | Not needed — phantom vertices don't exist during sections 3.5–3.8 |
| A8 (WARNING): cellChainMap sub-edges | Bypassed — emitSuperCell uses `r37.subEdges` directly, not cellChainMap |
| C10 (WARNING): batch6 dedup | `totalVerts` updated to `totalVertexCount + phantomVertexCount` |

## File Impact Analysis

**Single file**: `OuterWallTessellator.ts` (~1450 → ~1620 lines)

| Section | Change |
|---------|--------|
| Line 784–785 (buffer alloc) | +4 lines: overestimate + phantom tracking variables |
| After line ~1037 (section 3.9) | +130 lines: crossing computation, phantom vertices, edge pre-split |
| emitSuperCell (line ~1190) | +30 lines: R37 band splitting with early return |
| Line 1269 (batch6 dedup) | 1-line change: extend loop bound |
| Logging section | +1 line: R37 stats |

## Risk Zones

1. **Edge pre-split correctness**: If `edgeSplitMap` misses an edge or double-splits, verification
   reports false missing edges. Mitigated: canonical key matching, single-pass per super-cell.

2. **Phantom buffer overflow**: If `maxPhantomSlots` is exceeded, vertices write to unallocated memory.
   Mitigated: guard check `nextPhantomIdx < totalVertexCount + maxPhantomSlots`.

3. **Same-column edges in super-cells**: These don't cross column boundaries but DO cross phantom rows.
   Mitigated: section 3.9 adds exact-crossing-point phantom vertices for ALL edges crossing phantom rows,
   not just column-boundary edges.

## Implementation Sequence

1. Edit buffer allocation (line 784) — add overestimate + tracking vars
2. Insert section 3.9 — crossing computation, phantom vertices, edge pre-split
3. Modify emitSuperCell — add R37 band-splitting path with early return
4. Update batch6 dedup bound
5. Add R37 logging
6. Run tests — all 1879 must pass
