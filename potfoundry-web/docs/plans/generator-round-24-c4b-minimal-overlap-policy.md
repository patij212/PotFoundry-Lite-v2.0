# Generator Round 24 — C4b Minimal Overlap Ownership
Date: 2026-03-12

## Problem Statement
C4a already moved corridor ownership to planner-authoritative `ownershipSegments` and already supports single-chain seam-span candidates. The remaining blocked case is multi-chain overlap, because the planner still classifies every candidate with `chainIds.length > 1` as `multi_chain_overlap`, which prevents the existing segment emitter from owning those cells.

The live overlap fixture is intentionally narrow:
- same band
- non-seam
- contiguous legacy-owned run
- two chains only
- peak: `(row 1, u 0.35) -> (row 2, u 0.42)`
- valley: `(row 1, u 0.40) -> (row 2, u 0.44)`
- uniform `unionU` / `tPositions`

That fixture already matches the shape the current emitter can consume: one linear corridor segment bounded by one bottom rail, one top rail, and multiple non-crossing chain edges inside the strip.

## Root Cause Analysis
1. The planner still hard-rejects all multi-chain candidates at `chainIds.length > 1`, even though it now emits `ownershipSegments` for supported cases in `OuterWallCorridorPlanner.ts`.
2. The tessellator no longer has the old `candidate.chainIds.length === 1` ownership gate. It already registers planner-owned segments from `candidate.ownershipSegments` in `supportedCorridorStarts` and `supportedCorridorCells`.
3. `emitSupportedCorridorSpan()` already gathers all chain vertices and all chain edges across the owned segment, dedupes the edges, and passes the whole set into `constrainedSweepCell()`.
4. `constrainedSweepCell()` already supports multiple partitions, provided each chain edge maps to one bottom endpoint and one top endpoint and the partition order is monotone in raw host-grid `u`.

The narrowest safe C4b is therefore not a new emitter and not generic overlap merging. It is a planner carve-out for the one overlap class that already reduces to the current monotone strip model.

## Minimal Overlap Ownership Policy

### Policy 1: Two-Chain Monotone Non-Seam Overlap Only (Recommended)
Support a multi-chain overlap candidate if and only if all of the following are true:

1. `hasSeam === false`
2. `chainIds.length === 2`
3. the planner candidate is already one contiguous band-local run (`band`, `colStart..colEnd`) with exactly one ownership segment
4. the owned segment uses the existing collar contract unchanged: bottom/top `splitUs` remain `[unionU[colStart], unionU[colEnd + 1]]`
5. the segment's gathered chain edges are all bottom-to-top partitions of that one strip
6. when ordered by bottom-edge position, those chain edges are also strictly ordered by top-edge position

If any check fails, keep the candidate unsupported and fully legacy-owned.

### Why this is the right containment level
- It covers the live fixture exactly.
- It does not require new periodic logic.
- It does not require new collar decomposition logic.
- It does not require changing `constrainedSweepCell()`.
- It preserves the current single-owner contract: one owned segment, one strip, one host-edge decomposition.

## Why This Policy Is Likely To Work With The Current Emitter
1. `emitSupportedCorridorSpan()` already builds one bottom edge and one top edge from the planner segment and appends all chain vertices from every owned cell.
2. The emitter already deduplicates all chain edges across the segment before triangulation.
3. `constrainedSweepCell()` already handles multiple interior partition edges by sorting partitions and sweeping each sub-quad independently.
4. The live fixture is order-preserving in raw `u` on both rows:
   - bottom order: `0.35 < 0.40`
   - top order: `0.42 < 0.44`
5. Because the overlap is non-seam and contiguous, the current collar endpoints and raw `u` sorting remain valid without periodic normalization.

So the current emitter is already sufficient for this overlap class. The planner is the only blanket blocker, and the only new tessellator logic needed is an optional final monotonicity guard before ownership registration.

## Exact Changes

### 1. Planner changes
File: `src/renderers/webgpu/parametric/OuterWallCorridorPlanner.ts`

Make the planner support a single overlap carve-out instead of blanket-rejecting all `chainIds.length > 1` cases.

Exact edits:
1. Replace the current unconditional `multi_chain_overlap` rejection with a helper such as `isMinimalSupportedOverlap(...)`.
2. `isMinimalSupportedOverlap(...)` should return `true` only when:
   - `hasSeam` is false
   - `chainIds.length === 2`
   - the candidate stays one contiguous run and emits exactly one ownership segment
   - the planner can reuse the existing segment collar unchanged
3. If the helper returns `true`, emit the same single ownership segment shape used today, but with both chain IDs in `segment.chainIds`.
4. If the helper returns `false`, keep `unsupportedReasons` containing `multi_chain_overlap` and emit no ownership segments.
5. Add one diagnostic counter for supported overlap candidates, so C4b coverage is measurable separately from unsupported overlap fallbacks.

Do not add planner-side seam+overlap support, multi-segment overlap decomposition, or new collar shapes in C4b.

### 2. Tessellator changes
File: `src/renderers/webgpu/parametric/OuterWallTessellator.ts`

Keep the existing corridor emitter architecture intact.

Exact edits:
1. Leave `emitSupportedCorridorSpan()` structurally unchanged.
2. Leave `constrainedSweepCell()` structurally unchanged.
3. Add a narrow final-authority guard before inserting a multi-chain segment into `supportedCorridorStarts`:
   - gather the segment's deduped `uniqueEdges` exactly the same way the emitter already does
   - map each edge to its bottom/top positions on the segment rails
   - require every edge to have one endpoint on the bottom rail and one on the top rail
   - require bottom-order and top-order to be strictly increasing across the edge set
4. If that guard fails, do not register the segment in `supportedCorridorCells`; let the region fall through to the legacy path unchanged.

This keeps ownership authoritative before the main emission loop starts and avoids partial takeover of cells the current emitter cannot safely partition.

### 3. Test changes
Files:
- `src/renderers/webgpu/parametric/OuterWallCorridorPlanner.test.ts`
- `src/renderers/webgpu/parametric/OuterWallTessellator.test.ts`
- `src/renderers/webgpu/parametric/integration.test.ts`

Exact new or changed tests:

1. Planner test: supported minimal overlap
   - use the existing two-chain non-seam fixture shape
   - assert `candidate.supported === true`
   - assert `candidate.unsupportedReasons` is empty
   - assert exactly one `ownershipSegment`
   - assert `ownershipSegment.chainIds.length === 2`
   - assert `periodicSeam === false`

2. Planner test: unsupported overlap remains unsupported when widened beyond policy
   - one representative case with `chainIds.length > 2`, or seam+overlap, or a fixture explicitly marked for non-monotone ordering
   - assert `multi_chain_overlap` remains present and `ownershipSegments` is empty

3. Tessellator test: supported minimal overlap changes topology only inside corridor-owned cells
   - reuse the current overlap fixture that now falls back
   - assert flag-on output differs from legacy in the owned band
   - assert the supported candidate owns exactly one segment
   - assert all non-chain boundary vertices in corridor-owned triangles lie on planner-declared collar `splitUs`
   - assert `quadMap` for owned cells is `-1`

4. Tessellator test: non-monotone or out-of-policy overlap falls back to legacy
   - construct one overlap case that fails the new authority guard
   - assert vertices, indices, `quadMap`, and `chainEdges` remain identical to legacy under the flag

5. Integration test: supported minimal overlap remains compatible with downstream optimizers
   - mirror the existing supported-simple and supported-seam optimizer tests
   - assert supported candidate exists
   - assert owned cell `quadMap` is `-1`
   - run `optimizeChainStrips()` and `optimizeBoundaryDiagonals()` unchanged
   - assert valid indices, non-degenerate triangles, finite diagnostics, and defined `interpolatedChainVertices`

## Cases That Must Remain Unsupported In C4b
1. Any seam + overlap combination
2. Any candidate with more than two chain IDs
3. Any overlap that needs more than one ownership segment
4. Any overlap whose chain edges are not monotone between the segment bottom and top rails
5. Any overlap whose chain edges enter from sides or require side-specific intersection handling outside the current strip contract
6. Any overlap requiring new collar splits beyond `[unionU[colStart], unionU[colEnd + 1]]`
7. Any branching or disconnected overlap footprint, even if it happens inside one band
8. Any case that would cause a segment to lose authoritative ownership before the main loop

## Recommended Approach
Ship only Policy 1.

This is the smallest C4b that is both useful and technically defensible. It unlocks the live overlap fixture by removing the planner's blanket rejection, while preserving every current containment boundary:
- one band-local strip
- one ownership segment
- existing collar decomposition
- existing emitter
- legacy fallback for every harder case

Anything broader than this starts to become true overlap architecture instead of a narrow C4b extension.