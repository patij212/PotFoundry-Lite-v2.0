# Master Approval — R37 Column-Crossing Dip Elimination

Date: 2026-03-08

## Decision: APPROVED

## Unanimous Agreement Status
- Generator: Proposed 4 approaches; recommended Proposal 2 (per-super-cell band splitting)
- Verifier: ACCEPT WITH 7 AMENDMENTS (3 critical, 4 warnings) — all addressed
- Executioner: FEASIBLE WITH NOTES — chose buffer overestimate over pipeline reordering
- Master: APPROVED — verified implementation, trimmed vertex buffer, all tests pass

## Rationale

The dip artifact is a **vertex-absence problem**: super-cell triangles connect ridge-peak chain vertices to flank-elevation grid vertices at column boundaries. The fix injects **phantom row vertices** at the exact crossing T where chain edges cross column boundaries, then splits each super-cell into sub-bands. Each sub-band is a valid monotone polygon for `sweepQuad`/`constrainedSweepCell`.

Key virtues:
1. **Minimal vertex cost**: ~7.5k phantom vertices (vs 100k+ for micro-rows)
2. **Exact dip elimination**: The crossing-point vertex lies ON the chain edge by construction
3. **Self-contained**: Changes are within emitSuperCell + a new Section 3.9
4. **Budget-safe**: ~15k additional tris (vs 274k-411k for micro-rows)

## Conditions

1. User must run an actual export to verify visual quality improvement
2. Chain edge enforcement must remain at 0 missing edges
3. Triangle count increase should be < 30k

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Phantom vertices at extreme T (near band boundary) | Degenerate guard: max(1e-4, 0.05 × bandHeight) |
| Buffer overallocation waste | Trimmed with Float32Array.subarray at return |
| False "missing edge" reports | Global pre-split (A4) updates master chainEdges |
| batch6 dedup missing phantoms | totalVerts extended to include phantom count |

## Implementation Summary

### Section 3.9: R37 Crossing Computation + Chain Edge Pre-Split (~130 lines)
- For each super-cell: collect unique chain edges, find column-boundary crossings
- Compute exact crossing T using α = (U_c - u_A) / (u_B - u_A) 
- Create phantom row vertices (column boundaries + chain intercept positions)
- Pre-split chain edges at phantom row vertices
- Update master `chainEdges` array with sub-edges (Amendment A4)

### emitSuperCell: R37 Band Splitting (~35 lines)
- Looks up pre-computed `superCellR37` data
- Builds sub-band boundaries: [finalBot, phantomRow1, ..., finalTop]
- Assigns pre-split sub-edges to sub-bands by endpoint membership
- Emits each sub-band independently via sweepQuad/constrainedSweepCell

### Buffer Management
- Overestimated allocation: `maxPhantomSlots = chainEdges.length * 6`
- Tracks actual phantom count via `nextPhantomIdx - phantomVertexStart`
- **Trimmed** at return: `vertices.subarray(0, usedVertexCount * 3)` — prevents GPU evaluation waste

### batch6 Dedup (Amendment C10)
- `totalVerts = totalVertexCount + phantomVertexCount` — phantom vertices scanned for dedup

## Validation Results
- TypeScript: 0 errors in OuterWallTessellator.ts
- Tests: 88 files passed, **1879 tests passed**, 0 failures
- Duration: 53s

## Implementation Order Completed
1. ✅ Buffer overestimate + phantom tracking variables
2. ✅ Section 3.9: Crossing computation, phantom vertices, chain edge pre-split
3. ✅ emitSuperCell: R37 band-splitting path with early return
4. ✅ batch6 dedup bound extension
5. ✅ R37 diagnostic logging
6. ✅ Vertex buffer trim at return (Master addition)
