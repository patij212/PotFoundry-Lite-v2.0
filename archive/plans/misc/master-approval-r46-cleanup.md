# Master Approval — R46 Feature Edge Dip Algorithm Cleanup
Date: 2026-03-08

## Decision: APPROVED — Phase 1 (P4 + P1)

## Unanimous Agreement Status
- Generator: Proposed 5 changes, phased approach (P4+P1 immediate, P2 after data, P3+P5 conditional)
- Verifier: Accepted P1/P2/P3/P4 with amendments, rejected P5. All amendments constructive.
- Executioner: Pending (dispatched for Phase 1 implementation)
- Master: APPROVED Phase 1. Phase 2 gated on P4 data. Phase 3 conditional.

## Rationale

The investigation identified the architectural gap: R41's `chainFanQuad` creates structurally-necessary diagonals (chain↔grid edges) that the constraint system doesn't protect. The CSO can freely flip these diagonals, undoing the deterministic alignment that prevents visual zigzag.

Phase 1 is the right immediate action:
- **P4 (diagnostics)** provides data we don't currently have (interpolatedCount, fan diagonal count, CSO chain↔grid flips). Zero risk.
- **P1 (fan diagonal protection)** closes the architectural gap by adding fan diagonals to constraintEdgeSet. ~20 lines, zero structural risk, highest expected visual impact.

## Conditions
1. P1 must pass fanDiagEdges as a function parameter (Verifier amendment), not module-level state
2. P3 must NOT be implemented yet — wait for P4 data on both-sides frequency
3. P2 must NOT be implemented yet — wait for P4 data on interpolatedCount
4. All existing tests must pass after Phase 1

## Risk Assessment
- **Blast radius**: constraintEdgeSet grows ~100% (from ~5K to ~10K entries). Set<bigint> O(1) lookup — negligible performance impact.
- **CSO behavioral change**: Fewer edges eligible for quality optimization in chain cells. The loss is bounded: fan diagonals were chosen deterministically for consistency, and consistency IS the quality metric that matters here.
- **MeshSubdivision**: Fan diagonals now get `chainSubdivThreshold2` (tighter by ~15%). Both thresholds are exceeded by typical fan diagonal lengths, so subdivision count won't change meaningfully.
- **Rollback**: Trivial — remove fan diagonals from constraintEdgeSet.

## Implementation Order (Phase 1)
1. P4: Add `interpolatedCount` to OWT log line, add fan diagonal count to OuterWallResult, add CSO chain↔grid flip counter
2. P1: Add `fanDiagEdges` parameter to `constrainedSweepCell`, record fan diagonals, add to OuterWallResult, merge into constraintEdgeSet in PEC
3. Validate: typecheck + lint + test suite
4. Journal entries

---

*— Master (GitHub Copilot - Claude Opus 4.6), 2026-03-08*
