# Generator Round 26 — Corridor Super-Cell Reuse
Date: 2026-03-12

## Problem Statement
Corridor planning already classifies some spans as supported, but the tessellator still forces those spans back onto the legacy path whenever any owned cell intersects `superCellCols` in `OuterWallTessellator.ts:1387-1395`. The current fallback is not a planner failure. It is an emitter capability gap: `emitSupportedCorridorSpan()` in `OuterWallTessellator.ts:2388-2431` only emits a monotone strip with `constrainedSweepCell()`, while the legacy super-cell path layers in three extra behaviors that corridor emission does not reuse yet:

1. Multi-column owned-span emission via `emitSuperCell()` in `OuterWallTessellator.ts:2241-2386`.
2. R37 phantom rows and edge pre-splitting via `superCellR37`, `edgeSplitMap`, and `phantomChainAnchorSet` in `OuterWallTessellator.ts:1473-1815`.
3. R53 propagated boundary phantoms via `phantomBoundaryMap`, `emitSplitCell()`, and `emitChainSplitCell()` in `OuterWallTessellator.ts:1828-2239`.

The regression harness pins this exact gap. `ParametricExportComputer.corridorFlags.test.ts:275-319`, `:506-585`, and `:633-709` currently assert that planner-supported spans remain legacy-equal once the live geometry later needs super-cell machinery.

## Root Cause Analysis
The planner and the tessellator disagree about what “supported” means.

The planner emits corridor ownership segments and diagnostics, and the tessellator records them in `supportedCorridorStarts` and `supportedCorridorCells` at `OuterWallTessellator.ts:1300-1321`. But before any segment is registered, `isCorridorOwnershipSegmentAdmissible()` hard-rejects every segment that touches `superCellCols` at `OuterWallTessellator.ts:1387-1395`.

That veto exists because all phantom preprocessing is keyed only from legacy super-cells:

1. R37 scans only `superCellMap` in `OuterWallTessellator.ts:1551-1794`.
2. R53 propagates only from `superCellMap` and `superCellR37` in `OuterWallTessellator.ts:1830-1890`.
3. The main loop can emit corridor spans first, but only `emitSuperCell()` knows how to consume those preprocessing products in `OuterWallTessellator.ts:2241-2386` and `:2435-2450`.

So the fallback is structural. Corridor ownership can declare the region, but only the legacy super-cell owner can currently materialize the required split edges and propagated boundaries.

## Proposals

### Proposal 1: Shared Owned-Span Emission for Super-Cell-Touching Corridors (Recommended)
**Idea**: Do not invent a second corridor phantom pipeline. Keep the current simple corridor emitter for ordinary spans, but route only the `superCellCols`-touching corridor spans through a shared owned-span descriptor plus shared R37/R53 helpers extracted from the legacy super-cell path.

**Mechanism**:
1. Keep `corridorPlan`, `supportedCorridorStarts`, and `supportedCorridorCells` as the ownership truth.
2. Replace the hard `superCellCols` veto with a narrower emission-mode decision:
   - ordinary supported corridor span: keep current `emitSupportedCorridorSpan()` strip path.
   - supported corridor span that intersects `superCellCols`: build a temporary owned-span descriptor and send it through the same helper stack as legacy super-cells.
3. Extract a shared `emitOwnedSpan()` helper from `emitSuperCell()`.
4. Extract shared R37 preparation and R53 propagation helpers that operate on an owned-span descriptor instead of directly on `superCellMap`.
5. Leave `emitSplitCell()` and `emitChainSplitCell()` unchanged as the downstream consumers of propagated phantom boundaries.

**Required helper contract**:

```ts
interface OwnedSpanDescriptor {
    owner: 'legacy-super' | 'corridor-super';
    band: number;
    colStart: number;
    colEnd: number;
    coveredCellKeys: number[];
    bottomEdge: number[];
    topEdge: number[];
    uniqueEdges: Array<[number, number]>;
    internalBoundaryUs: number[];
    leftAdjacentCellKey?: number;
    rightAdjacentCellKey?: number;
}

interface PreparedOwnedSpanPhantoms {
    phantomRows: PhantomRow[];
    subEdges: Array<[number, number]>;
    leftBoundaryPhantoms: number[];
    rightBoundaryPhantoms: number[];
}
```

`buildOwnedSpanDescriptor(...)` inputs:
- legacy mode: `{ band, colStart, colEnd }`
- corridor mode: `{ segment: OuterWallCorridorOwnershipSegment }`

`buildOwnedSpanDescriptor(...)` outputs:
- exactly the edge arrays the emitter needs
- exactly the internal column boundaries R37 must test
- exactly the adjacent cell keys R53 may populate

`emitOwnedSpan(span, phantoms?)` inputs:
- `OwnedSpanDescriptor`
- optional `PreparedOwnedSpanPhantoms`

`emitOwnedSpan(...)` output:
- no new return type; it writes into the existing `indexBuf`, `quadMap`, `chainAdjacentGridVerts`, `fanDiagEdges`, and counters just like `emitSuperCell()` does today

**Mathematical basis**:
R37 and R53 are topological decompositions of one owned band-domain. They do not fundamentally depend on whether the owner was discovered as a legacy super-cell or as a corridor segment. They depend on:
- the ordered lower and upper boundary chains,
- the chain edges crossing the domain,
- the internal column boundaries that can induce T-level splits,
- the two adjacent neighbor cells that can inherit boundary phantoms.

Those are all representable by one span descriptor.

**Files affected**:
- `potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts`
- `potfoundry-web/src/renderers/webgpu/ParametricExportComputer.corridorFlags.test.ts`
- `potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.test.ts`
- `potfoundry-web/src/renderers/webgpu/parametric/integration.test.ts`

**Trade-offs**:
- Small increase in tessellator abstraction surface.
- Much lower risk than a planner rewrite or a second phantom implementation, because all split and propagation logic still lives in one code path.

**Assumptions**:
1. The corridor segments that currently fail only need the existing super-cell internal-boundary model, not a broader non-column phantom scheme.
2. `buildCorridorSpanGeometry()` already exposes the correct bottom/top rail order for these spans and does not require planner changes.
3. The current adjacent-cell consumers `emitSplitCell()` and `emitChainSplitCell()` remain sufficient once corridor-owned phantom boundaries are registered into `phantomBoundaryMap`.

### Proposal 2: Synthesize Temporary Super-Cell Records and Call `emitSuperCell()` Directly (Rejected)
**Idea**: Pretend a corridor-owned span is just another `superCellMap` entry.

**Why reject it**:
`emitSuperCell()` reconstructs its domain from full-column ownership in `OuterWallTessellator.ts:2241-2319`. Corridor ownership is defined by `buildCorridorSpanGeometry()` and `segment.seamCollar` in `OuterWallTessellator.ts:1325-1385`, not by the raw `[colStart, colEnd]` rectangle alone. Reusing the current `emitSuperCell()` without a descriptor layer would either ignore corridor boundary intent or force corridor semantics into the legacy map structures in a brittle way.

### Proposal 3: Add Corridor-Specific R37/R53 Implementations Beside the Legacy Ones (Rejected)
**Idea**: Keep `emitSuperCell()` untouched and build a second phantom-row and boundary-propagation path for corridors.

**Why reject it**:
This duplicates the most failure-prone part of the tessellator, widens the regression surface, and violates the user’s requirement to reuse or inherit the existing machinery instead of inventing a second geometry path.

## Recommended Approach
Implement Proposal 1, but keep the scope tighter than a wholesale emitter rewrite.

### Exact implementation strategy
1. **Introduce a local emission-mode split, not a planner split.**
   In `OuterWallTessellator.ts:1300-1443`, replace the binary admissibility logic with:
   - `simple-corridor` when the existing strip emitter is enough.
   - `corridor-super` when the segment intersects `superCellCols` and `buildOwnedSpanDescriptor(segment)` succeeds.
   - legacy fallback otherwise.

2. **Extract a descriptor builder, not a new planner product.**
   Keep `buildCorridorSpanGeometry()` as the corridor-specific geometry source, and add a sibling builder for legacy super-cells. Both feed `OwnedSpanDescriptor`.

3. **Extract `emitOwnedSpan()` from `emitSuperCell()`.**
   Move the shared logic out of `emitSuperCell()`:
   - quad/counter marking
   - coalescing of boundary edges
   - intermediate-grid `chainAdjacentGridVerts` marking
   - R37 sub-band dispatch
   - terminal `sweepQuad()` or `constrainedSweepCell()`

   Then:
   - `emitSuperCell()` becomes a thin wrapper that builds a legacy descriptor and calls `emitOwnedSpan()`.
   - `emitSupportedCorridorSpan()` keeps the current monotone-strip code for ordinary spans, but calls `emitOwnedSpan()` when the span is tagged `corridor-super`.

4. **Generalize phantom preparation over owned spans, not over `superCellMap`.**
   Replace the hardcoded super-cell preprocessing loops at `OuterWallTessellator.ts:1551-1794` and `:1830-1890` with loops over `OwnedSpanDescriptor[]` built from:
   - legacy super-cells not shadowed by corridor ownership
   - supported corridor-super spans

   The existing phantom state stays shared:
   - `superCellR37` can be renamed or kept as the storage map, but its key must become owner-span-based rather than implicitly legacy-only.
   - `edgeSplitMap`, `phantomChainAnchorSet`, `phantomVertexChainIds`, and `phantomBoundaryMap` stay single-source-of-truth.

5. **Keep the main loop ordering unchanged.**
   The main loop at `OuterWallTessellator.ts:2435-2478` already checks supported corridor ownership before legacy super-cells. Preserve that. The only difference is that some registered corridor spans now emit through the shared owned-span path instead of being vetoed up front.

## Exact Code Areas To Change
### `OuterWallTessellator.ts`
- `supportedCorridorStarts` / `supportedCorridorCells` registration: `:1300-1321`
- `buildCorridorSpanGeometry()`: `:1328-1385`
- `isCorridorOwnershipSegmentAdmissible()`: `:1387-1443`
- R37 phantom-row preparation currently hardwired to super-cells: `:1473-1815`
- R53 propagated-boundary preparation: `:1828-1905`
- `emitSplitCell()` and `emitChainSplitCell()` consumers remain mostly unchanged: `:2011-2239`
- `emitSuperCell()`: `:2241-2386`
- `emitSupportedCorridorSpan()`: `:2388-2431`
- main emission loop precedence: `:2435-2478`

### `ParametricExportComputer.corridorFlags.test.ts`
- flip the simple supported-span expectation at `:275-319`
- flip the real SuperformulaBlossom max-strength expectation at `:506-585`
- flip the strengthened zero-interception overlap expectation at `:633-709`
- re-evaluate `:323-385` only after implementation; keep it legacy if that mocked fixture still exceeds the new descriptor contract

### `OuterWallTessellator.test.ts`
- flip the simple supported-candidate fallback test at `:544-559`
- keep the existing boundary-only triangle checks at `:560-621`
- flip the complex overlap internal-boundary fallback test at `:646-662`
- keep the crossed-overlap legacy-equivalence test at `:624-644` as a containment guard

### `integration.test.ts`
- keep the existing supported/seam/overlap optimizer-compatibility tests at `:318-557`
- add one new optimizer-compatibility test for the complex-overlap corridor-super fixture so R53 propagation is exercised with downstream optimizers

## Regression Changes
1. **Expectation flips**
   - planner-enabled simple corridor fixture should no longer be legacy-equal when it only failed because of `superCellCols`
   - planner-enabled real `SuperformulaBlossom` max-strength export should no longer be legacy-equal when the only blocker was missing super-cell reuse
   - planner-enabled zero-interception overlap export should no longer be legacy-equal when the only blocker was missing super-cell reuse

2. **Expectation keeps**
   - `corridorPlan` diagnostics remain present
   - `R35 Chain edges: ... super-cells:` diagnostic remains present
   - unsupported crossed-overlap cases remain byte/topology-equivalent to legacy
   - downstream optimizer compatibility stays green under the existing integration checks

3. **One new targeted assertion**
   Add a corridor-super-span unit test that asserts non-chain vertices in the affected band still lie only on corridor-declared boundary `splitUs`, even after R37/R53 reuse. This proves the shared helper did not widen ownership to a full-column legacy rectangle.

## Risks And Containment Rules
1. **Do not broaden planner semantics.**
   The planner already decides support. This round only widens the tessellator’s emission capability for a subset of already-supported segments.

2. **Do not replace the ordinary corridor emitter.**
   Keep `emitSupportedCorridorSpan()` intact for spans that do not touch super-cell machinery. Only `superCellCols`-touching supported spans should use the shared owned-span helper.

3. **Do not make `superCellMap` lie.**
   Do not mutate planner or legacy ownership maps to pretend corridor spans are legacy super-cells. Build a separate owned-span registry for preprocessing.

4. **Keep unsupported-case isolation absolute.**
   If `buildOwnedSpanDescriptor(segment)` cannot produce a descriptor with deterministic internal boundaries and adjacent-cell keys, the segment stays legacy. No partial takeover.

5. **Preserve single-owner emission.**
   A corridor-owned span that reuses super-cell machinery must suppress legacy super-cell emission for the same cell keys via the existing corridor-first precedence in the main loop.

6. **Keep the current phantom invariants.**
   Do not weaken `phantomChainAnchorSet`, `edgeSplitMap`, or `emitChainSplitCell()` behavior. The R52 precision guard is part of the reuse contract, not optional cleanup.

## Open Questions
1. Does the Verifier agree that the only new corridor-super subset should be segments whose internal-boundary set is still expressible as `unionU[colStart + 1 .. colEnd]`?
2. Should the owned-span phantom map keep the `superCellR37` name for minimal churn, or should it be renamed immediately to avoid future semantic drift?
3. Does the earlier mocked overlap regression at `ParametricExportComputer.corridorFlags.test.ts:323-385` fit the same bounded contract, or should it remain a fallback guard for this round?