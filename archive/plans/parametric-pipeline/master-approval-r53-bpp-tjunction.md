# Master Approval — R53 BPP T-Junction Elimination

Date: 2026-03-10

## Decision: APPROVED

## Unanimous Agreement Status
- Generator: Proposed 5 approaches, recommended CPR (Proposal 5)
- Verifier: Rejected CPR (2 CRITICAL flaws), accepted BPP (Proposal 1) with amendments
- Executioner: Confirmed feasibility, implemented BPP with vertical-edge sweep innovation
- Master: Approved BPP implementation after code review

## Rationale

BPP (Boundary Phantom Propagation) is the correct solution for T-junction elimination at super-cell boundaries because:

1. **Purely additive** — ~88 new lines, zero modifications to existing R37 phantom row data or super-cell band splitting. The principle of least surprise: nothing that worked before can break.

2. **Uses proven machinery** — `sweepQuad` for triangulation, `cellKey` for dispatch, `phantomChainAnchorSet`/`R37_U_MERGE` tolerances for vertex identification. No new algorithms.

3. **Architecturally clean separation** — the `phantomBoundaryMap` is built as a post-processing pass AFTER phantom rows are complete. Super-cells never know about BPP. Adjacent cells get exactly the vertices they need.

4. **Respects all constraints** — R52 precision locks untouched, no historically-failed systems reintroduced, no CDT or Steiner points.

### Why CPR was rejected
The Verifier's Attack 2 proved that extending phantom rows in the creation loop pollutes `emitSuperCell`'s band splitting — `pr.vertexIndices` would contain vertices outside the super-cell's column range, causing `sweepQuad` to produce triangles spanning into adjacent cells. The Generator acknowledged this risk but the Verifier demonstrated it's catastrophic.

### Executioner's key innovation
The Verifier recommended horizontal strip decomposition, but the Executioner identified a gap: single-sided phantoms create degenerate 1×1 strips. The vertical-edge sweep approach (passing left and right edges to `sweepQuad`) avoids this elegantly and works for all phantom configurations (left-only, right-only, both sides).

## Conditions
- Chain cells adjacent to super-cells are SKIPPED for BPP propagation (Amendment A3). A few T-junctions may remain at these locations. If measurement shows visible artifacts, implement `emitChainSplitCell` in Phase 2.
- Density gradient improvement is DEFERRED to a separate R54 round. T-junctions and density are orthogonal problems.

## Risk Assessment
- **Blast radius**: Contained to `OuterWallTessellator.ts`. No changes to any other pipeline file.
- **Rollback plan**: Delete the BPP section (~88 lines) and the dispatch check. Everything reverts cleanly.
- **Performance**: Negligible — each split cell adds O(K) triangles where K = phantom count on that boundary (typically 1-2).

## Validation Results
| Check | Result |
|-------|--------|
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 warnings |
| `npm test` | 2007 passed, 7 skipped |

## Implementation Summary (for journal)

| Component | Lines | Purpose |
|-----------|-------|---------|
| Overflow diagnostic | +2 | `console.warn` in phantom slot overflow guard (Verifier A2) |
| `PhantomBoundaryInfo` interface | +5 | Type for left/right phantom vertex index arrays |
| `phantomBoundaryMap` construction | +55 | Post-processing scan of super-cell boundary phantom vertices |
| `emitSplitCell` function | +20 | Vertical-edge sweep triangulation including phantom vertices |
| Dispatch logic | +6 | BPP check before `emitStandardCell` in main emission loop |

## Next Steps
1. **User testing** — Run an export with the BPP changes and check the pipeline log for `[CDT] R53 BPP:` diagnostic line. Verify valence-3 vertex count decreases.
2. **Density assessment** — After confirming T-junction elimination, assess whether mesh quality around chains still needs improvement. If yes, open R54 for density gradient work.
3. **Phase 2 (conditional)** — If chain-cell T-junctions cause visible artifacts, implement `emitChainSplitCell` with per-cell band-splitting.
