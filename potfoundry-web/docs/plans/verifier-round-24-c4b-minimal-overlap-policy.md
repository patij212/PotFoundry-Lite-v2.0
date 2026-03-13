# Verifier Round 24 — Critique of C4b Minimal Overlap Policy
Date: 2026-03-12

## Summary Verdict: ACCEPT WITH AMENDMENTS

The proposal is compatible with the current emitter architecture only if the geometric proof stays in the tessellator.

The live positive case is real: the current overlap fixture is a same-band, non-seam, two-edge strip with preserved raw-U order on both rows, and the existing corridor emitter can consume that shape. But the planner cannot prove that shape from its current input. It only sees legacy cell ownership sets, not edge geometry, edge entry mode, or row-order preservation. Any implementation that makes the planner the final authority on overlap support would therefore overstate what the current code can actually guarantee.

## Critique

### C1 [CRITICAL]: Planner input is structural legacy ownership, not geometric mergeability
**Generator's claim**: The planner can replace the blanket `multi_chain_overlap` rejection with a narrow carve-out for the minimal two-chain case.

**Actual behavior**: The planner contract explicitly says it consumes `legacyCells` derived from the current tessellator path at `OuterWallCorridorPlanner.ts:163`, marks candidates as `supported` at `OuterWallCorridorPlanner.ts:113`, and describes `ownershipSegments` as planner-authoritative segments eligible for emission at `OuterWallCorridorPlanner.ts:121`. But the tessellator constructs `legacyOwnership` only by unioning chain IDs seen on bottom vertices, top vertices, and chain-edge endpoints at `OuterWallTessellator.ts:1239-1253`, then widens those IDs across `superCellMap` by inheritance at `OuterWallTessellator.ts:1256-1269`.

**Counterexample**: A contiguous two-ID candidate can exist even when the actual geometry is not one simple bottom-to-top strip. Because inherited super-cell ownership erases edge-local structure, the planner cannot distinguish the live monotone fixture from a side-entering, disconnected, or otherwise non-reducible footprint that happens to cover the same `(band, col)` cells.

**Required fix**: The planner carve-out may only be structural. It may at most nominate a provisional single ownership segment for `!hasSeam && chainIds.length === 2`. Final support must be decided in the tessellator from `cellChainMap`, rail vertices, and deduped `chainEdges`.

### C2 [CRITICAL]: The current support-registration gate is not sufficient for overlap ownership
**Generator's claim**: The tessellator only needs a small final-authority guard before registering the segment.

**Actual behavior**: That is correct, but the current gate does not perform that proof. `supportedCorridorStarts` is populated only by checking for prior cell ownership conflicts at `OuterWallTessellator.ts:1301-1315`.

**Counterexample**: A planner-nominated two-chain segment with no ownership conflict but non-monotone edge ordering would still be admitted today, because there is no verification step between planner output and `supportedCorridorStarts` registration.

**Required fix**: Insert the multi-chain geometry gate exactly at the `supportedCorridorStarts` registration stage, before any cell is added to `supportedCorridorCells`.

### C3 [CRITICAL]: `constrainedSweepCell()` can consume the live fixture, but it will silently under-model side-entering overlap fragments
**Generator's claim**: The existing emitter and `constrainedSweepCell()` are already sufficient for the minimal overlap class.

**Actual behavior**: This is true only for edges that map to one bottom endpoint and one top endpoint on the owned strip rails. `constrainedSweepCell()` explicitly ignores edges whose endpoints are not found on the bottom/top rails, labeling them side-entering fragments at `OuterWallTessellator.ts:466`. If no valid partitions remain, it falls back to an unconstrained sweep at `OuterWallTessellator.ts:471`. When partitions do exist, it assumes they can be sorted monotonically by average U at `OuterWallTessellator.ts:477`.

**Counterexample**: A two-chain overlap with one side-entering fragment can still produce `chainIds.length === 2` in planner space. The current emitter would then gather the edges, fail to map one fragment to bottom/top rails, and either ignore it or fall back to simple sweep. That is not a safe multi-chain corridor.

**Required fix**: The tessellator authority gate must reject any multi-chain segment unless every deduped edge maps to exactly one bottom-rail endpoint and one top-rail endpoint, with no side-entering remainder.

### C4 [WARNING]: The proposal understates one additional invariant: exact two-edge, two-row ownership evidence
**Generator's claim**: Raw-U monotonicity on both rows is the main geometric condition.

**Actual behavior**: Monotonicity is necessary but not sufficient. `emitSupportedCorridorSpan()` gathers all bottom vertices, top vertices, and all chain edges across the owned span before deduping and calling `constrainedSweepCell()` at `OuterWallTessellator.ts:2260-2344`. For the live overlap fixture this is fine, because the segment truly reduces to two interior partition edges. But the same span-level gather path would also absorb extra chain-edge fragments if they exist.

**Counterexample**: A candidate with preserved order but three deduped chain edges is still outside the proposed policy, even if all three are monotone. The current emitter would happily pass all three partitions into `constrainedSweepCell()`, but that is no longer the promised “exactly-two-chain overlap candidate.”

**Required fix**: The authority gate must require exactly two candidate chain IDs and exactly two deduped bottom-to-top edges, with one edge per candidate chain ID and one unique owned chain vertex per candidate chain ID on each rail.

### C5 [NOTE]: The current unsupported overlap fixture is the correct positive control
**Generator's claim**: The live unsupported overlap fixture should be the first supported overlap case.

**Actual behavior**: Accepted. The fixture at `OuterWallTessellator.test.ts:496-529` uses exactly two chains with points `(row 1, u 0.35) -> (row 2, u 0.42)` and `(row 1, u 0.40) -> (row 2, u 0.44)` at `OuterWallTessellator.test.ts:506-514`. That preserves raw-U order across both rows and matches the current monotone-strip emitter model.

**Verdict for this claim**: ACCEPT.

## Exact Checks Required and Where They Must Live

1. **Planner structural gate**
Location: `OuterWallCorridorPlanner.ts`, inside `flushRun()` where `multi_chain_overlap` is currently assigned.
Requirement: only relax the blanket overlap rejection for `!hasSeam && chainIds.length === 2` and only to emit one band-local ownership segment candidate. Do not attempt planner-side proofs for monotonicity, side entry, branching, or disconnected geometry.

2. **Tessellator final-authority gate**
Location: `OuterWallTessellator.ts`, immediately before `supportedCorridorStarts.set(...)` and `supportedCorridorCells.add(...)` at `OuterWallTessellator.ts:1301-1315`.
Requirement: for multi-chain segments only, gather the same rail vertices and deduped `uniqueEdges` that `emitSupportedCorridorSpan()` uses at `OuterWallTessellator.ts:2260-2344`, then require all of the following:
- segment is non-seam
- candidate chain ID set size is exactly 2
- deduped `uniqueEdges.length === 2`
- each deduped edge maps to exactly one bottom-rail endpoint and one top-rail endpoint
- bottom positions are strictly increasing and top positions are strictly increasing in the same order
- each candidate chain contributes exactly one owned chain vertex on the bottom rail and one on the top rail
- no extra chain-owned vertices or edges remain in the span after dedupe

3. **Legacy fallback invariant**
Location: same tessellator registration gate.
Requirement: on any failure, register nothing. The whole region must fall through to the existing legacy path unchanged.

## Mandatory Tests

1. **Planner positive structural test**
File: `OuterWallCorridorPlanner.test.ts`
Case: two-chain, non-seam, contiguous one-band overlap.
Assert: planner emits exactly one ownership segment candidate for that run. If `supported` continues to mean “eligible for emission,” then that assertion is only valid if a new field distinguishes planner-structural support from tessellator-confirmed support.

2. **Planner negative tests**
File: `OuterWallCorridorPlanner.test.ts`
Cases: seam+overlap and `chainIds.length > 2`.
Assert: `multi_chain_overlap` remains unsupported, `ownershipSegments` is empty.

3. **Tessellator positive overlap test**
File: `OuterWallTessellator.test.ts`
Case: the current unsupported overlap fixture at `OuterWallTessellator.test.ts:496-529`.
Assert: flag-on output diverges from legacy only inside the owned band, owned cells get `quadMap = -1`, all non-chain boundary vertices in owned triangles lie on planner-declared collar endpoints, and the corridor plan reports exactly one two-chain owned segment that passes the authority gate.

4. **Tessellator non-monotone fallback test**
File: `OuterWallTessellator.test.ts`
Case: two-chain overlap where bottom order and top order invert.
Assert: flag-on output is byte-identical to legacy for vertices, indices, `quadMap`, and `chainEdges`.

5. **Tessellator side-entry or extra-edge fallback test**
File: `OuterWallTessellator.test.ts`
Case: representative two-ID candidate that yields a side-entering fragment or more than two deduped edges.
Assert: full fallback to legacy.

6. **Downstream integration test**
File: `integration.test.ts`
Case: supported minimal overlap fixture.
Assert: downstream optimizer/refinement path still runs with valid indices, finite diagnostics, corridor-owned `quadMap = -1`, and preserved outer-wall metadata contracts.

## Narrowest Alternative If This Is Not Implemented With The Amendments Above

Keep all overlap cases unsupported for C4b and ship only the already-supported single-chain seam work. That is the narrowest safe alternative if the team does not want to introduce provisional planner semantics or a tessellator-side overlap authority gate.

## Implementation Conditions

1. Do not let planner diagnostics claim final support for an overlap case that the tessellator can still veto.
2. Do not broaden `constrainedSweepCell()` for side-entering or periodic logic in this round.
3. Do not admit any overlap case that does not reduce to exactly two monotone bottom-to-top partition edges in one band-local span.
4. Preserve full legacy equivalence for every out-of-policy overlap case.