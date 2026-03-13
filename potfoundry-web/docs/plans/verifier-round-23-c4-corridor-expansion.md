# Verifier Round 23 — Critique of C4 Corridor Expansion
Date: 2026-03-12

## Summary Verdict: ACCEPT WITH AMENDMENTS

The proposal is directionally compatible with the live codebase, but not with the live codebase as-is.

It correctly keeps periodic logic out of the generic sweep path and correctly keeps unsupported cases on the legacy branch, which matches the master constraints in `master-approval-chain-owned-transition-zones-implementation.md`.

However, the current implementation only supports a single band-local span with two authoritative collar endpoints per host edge. The proposal becomes compatible only if C4 promotes planner-produced ownership segments to a first-class contract and proves that each supported segment still reduces to the current monotone-strip model consumed by `constrainedSweepCell()`.

## Critique

### C1 [CRITICAL]: The live ownership gate rejects the proposal’s new supported classes today
**Generator's claim**: C4 can expand into seam and deterministic overlap cases without touching generic triangulation.

**Actual behavior**: The current planner hard-rejects overlap and seam candidates by pushing `multi_chain_overlap` at `OuterWallCorridorPlanner.ts:194` and `seam_span` at `OuterWallCorridorPlanner.ts:198`, then computes support from `unsupportedReasons.length === 0` at `OuterWallCorridorPlanner.ts:201`. The tessellator then refuses ownership unless `candidate.supported && candidate.chainIds.length === 1` at `OuterWallTessellator.ts:1304`.

**Counterexample**: A seam candidate that the new planner would consider supportable still cannot run through the live path, because `supportedCorridorStarts` is populated only after the `chainIds.length !== 1` filter and only from `candidate.band`, `candidate.colStart`, and `candidate.colEnd` at `OuterWallTessellator.ts:1314`.

**Required fix**: The planner must explicitly classify mergeable seam/overlap candidates as supported, and the tessellator’s ownership gate must switch from “single chain candidate” to “planner-authoritative non-overlapping ownership segments.”

### C2 [CRITICAL]: `emitSupportedCorridorSpan()` is not compatible with multi-segment or multi-split candidates as written
**Generator's claim**: The tessellator can keep using the current corridor emitter plus planner-declared collar boundaries.

**Actual behavior**: The live emitter consumes exactly one `(band, colStart, colEnd)` span and collapses the collar contract to the first and last split only: `leftBoundaryU` and `rightBoundaryU` are read from `bottomCollar?.splitUs[0]` and `bottomCollar?.splitUs[splitUs.length - 1]` at `OuterWallTessellator.ts:2273-2274`. The planner likewise only emits two split positions per edge today, `[unionU[colStart], unionU[colEnd + 1]]`, at `OuterWallCorridorPlanner.ts:226` and `OuterWallCorridorPlanner.ts:233`.

**Counterexample**: A seam candidate normalized into two linear pieces cannot be represented by one candidate-level span without ambiguity about which piece owns which cells and which collar endpoints belong to which emitted strip. A merged-overlap case that needs more than one edge interval on the same host edge would silently lose interior split information because the live emitter ignores every split except the first and last.

**Required fix**: Add segment-local ownership records. Each supported segment must carry its own `band`, `colStart`, `colEnd`, bottom collar endpoints, top collar endpoints, and owned chain ID subset. The emitter may still reuse `constrainedSweepCell()`, but it must iterate planner segments rather than reinterpret one candidate-wide collar.

### C3 [CRITICAL]: “No generic seam triangulation” is correct, but only if supported seam segments bypass legacy seam skip cleanly and completely
**Generator's claim**: Seam expansion can stay planner-local and avoid changing generic seam handling.

**Actual behavior**: Standard cells are still dropped whenever `uSpan` crosses the seam guard at `OuterWallTessellator.ts:2375`, and there is additional seam-sensitive branching during R37 preparation at `OuterWallTessellator.ts:1427`. The main loop only avoids the standard seam skip when the cell key is already present in `supportedCorridorCells` and dispatches to `emitSupportedCorridorSpan()` first at `OuterWallTessellator.ts:2355`.

**Counterexample**: If a seam-supporting candidate is marked supported in planner diagnostics but not converted into authoritative owned cell keys before the main loop reaches those cells, the live fallback is still “drop seam cell,” not “emit planner corridor.” That violates the master rule that the planner must choose seam behavior up front rather than letting ad hoc seam dropping decide topology.

**Required fix**: C4 must preserve a hard invariant: every supported seam segment must own every seam-guarded cell it covers before the main emission loop begins. Any seam cell not owned by a supported segment must remain fully legacy.

### C4 [WARNING]: The planner’s current input is legacy ownership, not geometric mergeability
**Generator's claim**: Deterministic contiguous merged corridors are a good first overlap target.

**Actual behavior**: The planner currently derives candidates from `legacyOwnership`, which is aggregated from `cellChainMap` and then widened by `superCellMap` inheritance before planning. That means the current input tells you which chain IDs the legacy path touched in a cell, not whether a merged corridor is geometrically monotone or whether its chain edges remain non-crossing.

**Counterexample**: Two neighboring chains can appear in one planner candidate after super-cell inheritance even if their usable corridor union is geometrically disjoint after periodic normalization. Conversely, two chains that are mergeable in geometry may still need segment-local collars that disagree, which the current input does not encode.

**Required fix**: The planner must compute mergeability from normalized corridor intervals and collar compatibility, not from `chainIds.length > 1` alone. The initial merge policy should be capped at two chains and require one contiguous normalized footprint with one authoritative collar decomposition per emitted segment.

### C5 [WARNING]: “No ParametricExportComputer changes” is acceptable only as an output-contract promise, not as a proof shortcut
**Generator's claim**: C4 can land without `ParametricExportComputer` changes.

**Actual behavior**: The exporter does not appear to need API changes if `OuterWallResult` semantics stay intact, but it forwards several corridor-sensitive outputs directly: `chainAdjacentVertices`, `protectedStripVertices`, `fanDiagonalEdges`, and `interpolatedChainVertices` are copied from `buildCDTOuterWall()` at `ParametricExportComputer.ts:1481-1484`. Those are then consumed by optimizer and refinement stages at `ParametricExportComputer.ts:1573`, `ParametricExportComputer.ts:1797`, `ParametricExportComputer.ts:1811-1812`, and `ParametricExportComputer.ts:1832-1833`.

**Counterexample**: A seam or merged-overlap corridor that emits correct triangles but fails to mark corridor-adjacent grid vertices consistently will still regress chain-strip detection, because `optimizeChainStrips()` treats triangles as chain-strip if any vertex index is non-grid or if `chainAdjacentVertices` marks one of their vertices at `ChainStripOptimizer.ts:393-399`. Likewise, `optimizeBoundaryDiagonals()` skips chain-strip cells via `outerQuadMap[qIdx] < 0` at `ChainStripOptimizer.ts:899` and respects protected vertices at `ChainStripOptimizer.ts:931`.

**Required fix**: Keep the exporter file unchanged if desired, but treat “no `ParametricExportComputer` edits” as contingent on preserving the exact downstream semantics of `quadMap`, `chainAdjacentVertices`, `protectedStripVertices`, `fanDiagonalEdges`, and `interpolatedChainVertices`.

### C6 [NOTE]: Unsupported-complex fallback matches both live tests and approved architecture
**Generator's claim**: Unsupported complex seam/overlap should stay legacy-equivalent.

**Actual behavior**: This is already the live contract. `OuterWallTessellator.test.ts:497` asserts overlap fallback via `multi_chain_overlap`, `OuterWallTessellator.test.ts:524` asserts seam fallback via `seam_span`, and the master plan requires that any case not explicitly classified as supported must stay entirely on the legacy path at `master-approval-chain-owned-transition-zones-implementation.md:43`. It also requires planner-chosen periodic seam behavior up front at `master-approval-chain-owned-transition-zones-implementation.md:70`.

**Verdict for this claim**: ACCEPT.

## Accepted Items

1. Keeping periodic seam logic out of `constrainedSweepCell()` and `sweepQuad()` is correct. The live sweep path is raw-linear in `u`; broadening it into a generic periodic triangulator would be a larger architectural change than C4 needs.
2. Keeping unsupported complex seam and overlap cases fully legacy-owned is correct and already aligned with the master approval and live tests.
3. Reusing the corridor emitter architecture is acceptable only if it is generalized to consume planner-owned segments rather than one candidate-wide span.
4. Avoiding `ParametricExportComputer` edits is plausible, but only if outer-wall output semantics remain identical at the optimizer/refinement boundaries.

## Amendments Required for Acceptance

1. Make ownership segments explicit in planner output. Candidate-level `band/colStart/colEnd` is no longer sufficient for C4.
2. Require segment-local collar contracts. Each emitted segment must reduce to exactly one monotone interval on bottom and top host edges.
3. Change the tessellator ownership gate from `candidate.chainIds.length === 1` to “all planner segments are supported, non-overlapping, and authoritative.”
4. Preserve the seam-owner invariant: every supported seam-guarded cell must be owned before the main emission loop reaches it.
5. Cap the first overlap merge policy at two chains and reject any normalized union that branches, splits into disjoint intervals, or needs contradictory collar decompositions.
6. Preserve optimizer/refinement contracts exactly: `quadMap = -1` for corridor-owned cells, consistent `chainAdjacentVertices`, correct `protectedStripVertices`, complete `fanDiagonalEdges`, and valid `interpolatedChainVertices`.
7. Add planner diagnostics that separately count supported seam candidates and supported merged-overlap candidates so coverage can be measured.

## Exact Invariants and Tests Required

1. **Single-source collar contract**
The emitter must not synthesize any boundary `u` that does not appear in planner-owned segment collar data.

2. **Authoritative ownership**
Every supported segment-owned cell is emitted exactly once, marked `quadMap = -1`, and excluded from legacy chain-cell, super-cell, and seam-drop paths.

3. **Seam completeness**
For a supported seam fixture, every seam-guarded cell in the planner-owned footprint is corridor-owned, and no seam cell in that footprint falls through to the `uSpan > SEAM_GUARD` skip path.

4. **Monotone-strip reducibility**
For every supported segment, bottom and top rail vertices are strictly ordered in raw host-grid order after planner normalization, and `uniqueEdges` contain no crossings within the emitted segment.

5. **Supported seam topology test**
Flag-off stays legacy-equivalent. Flag-on changes topology only inside the owned seam segment. Every non-chain boundary vertex in owned triangles lies on planner-declared collar endpoints.

6. **Unsupported complex seam fallback test**
Representative non-normalizable seam fixtures remain byte-equivalent to legacy output for vertices, indices, `quadMap`, and `chainEdges` under the flag.

7. **Supported merged-overlap topology test**
Two-chain contiguous normalized corridor fixture becomes supported, changes topology only inside owned cells, and emits no non-planner boundary vertices.

8. **Unsupported branching/disjoint overlap fallback test**
Branching or disconnected overlap fixtures remain unsupported and legacy-equivalent.

9. **Downstream compatibility tests for both new supported classes**
Mirror the existing optimizer integration test at `integration.test.ts:251` for supported seam and supported merged-overlap fixtures. Assert `quadMap` ownership, non-empty `chainAdjacentVertices`, valid optimizer passes, finite diagnostics, and no invalid or degenerate triangle indices.

10. **Refinement contract tests**
Supported seam and overlap fixtures must preserve `outerInterpolatedChainVertices` viability for the post-OWT GPU re-snap path and must not omit required protected/fan-diagonal metadata.

## Narrowest Acceptable Alternative If Rejected

If the Generator cannot satisfy the segment-local collar contract and the ownership/metadata invariants above, the narrowest acceptable alternative is:

1. Support seam expansion only.
2. Restrict support to candidates that normalize into exactly two or fewer non-overlapping linear ownership segments.
3. Keep all multi-chain overlap cases on the legacy path for this round.

That alternative still advances C4 without forcing the planner to solve merged multi-chain collar compatibility prematurely.

## Implementation Conditions

1. Do not loosen the current support gates before segment-local planner output exists.
2. Do not teach generic sweep helpers about periodic ordering.
3. Do not let one region be partially corridor-owned and partially legacy-owned.
4. Do not claim exporter independence unless the downstream contract tests pass for seam and overlap fixtures, not just the current simple fixture.