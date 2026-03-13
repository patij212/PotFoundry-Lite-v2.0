# Generator Round 23 — C4 Corridor Expansion
Date: 2026-03-12

## Problem Statement
The current corridor path is intentionally frozen at the C2 boundary: `OuterWallCorridorPlanner` marks seam-spanning and multi-chain candidates unsupported, and `OuterWallTessellator` only takes corridor ownership when `candidate.supported && candidate.chainIds.length === 1`.

That leaves two important live failure classes on the legacy path:

1. periodic seam cases where the feature-adjacent region lands in the seam-guarded host cell, and
2. neighboring-chain cases where the legacy owner is still the grid even though the local corridor should be a single feature-adjacent domain.

The approved master plan already defines C4 as the point where those cases are expanded. The question is not whether to broaden support, but how to do it without reintroducing mixed ownership, duplicate seam decomposition, or a second triangulation architecture.

## Root Cause Analysis

1. The planner currently derives candidates from legacy ownership only and classifies support with two hard rejections: `multi_chain_overlap` and `seam_span` in `OuterWallCorridorPlanner.ts`.

2. The C2 emitter in `OuterWallTessellator.ts` is already architecturally useful: `emitSupportedCorridorSpan` replaces chain/super-cell ownership for a band-local corridor by:
   - zeroing `quadMap` for the owned cells,
   - building bottom/top corridor rails from the planner's `seamCollar` split positions,
   - collecting chain vertices and chain edges from `cellChainMap`, and
   - reusing `sweepQuad()` / `constrainedSweepCell()`.

3. The active sweep path is linear-U only. `constrainedSweepCell()` sorts partitions and emits triangles from raw vertex `u` values. That means a naive “just allow seam candidates” change is unsafe. Raw seam-wrap ordering would leak periodic semantics into the generic cell sweep and likely destabilize R35/R37/R53 behavior.

4. The tessellator's main ownership loop still skips seam cells when `uSpan > SEAM_GUARD`, and R37/R53 seam preservation is built around legacy super-cells, phantom rows, and split-cell propagation. C2 deliberately does not consume that machinery for corridor-owned spans.

5. Downstream stages still expect the current metadata semantics to hold: `quadMap`, `chainEdges`, `chainAdjacentVertices`, `protectedStripVertices`, `fanDiagonalEdges`, and `interpolatedChainVertices` are consumed unchanged by `ParametricExportComputer`, `optimizeChainStrips`, `optimizeBoundaryDiagonals`, and subdivision.

The narrowest safe C4 therefore is not a new corridor triangulator and not a raw gate loosening. It is a planner-driven decomposition layer that converts some seam and overlap candidates into the same kind of linear, band-local corridor spans that the C2 emitter already knows how to own.

## Proposals

### Proposal 1: Planner-Driven Corridor Segment Decomposition (Conservative, Recommended)
**Idea**: Keep the existing C2 corridor owner and sweep helpers. Expand coverage only by teaching the planner to convert selected seam and overlap cases into one or more linear ownership segments that the current emitter can consume without learning global periodic logic.

**Mechanism**:
1. Extend the planner output from a single `(band, colStart, colEnd)` span into a candidate plus one or more `ownershipSegments`.
2. Each segment remains band-local and linear in host-grid column space. The emitter owns segments, not abstract periodic candidates.
3. For seam candidates, the planner performs the periodic reasoning once, then emits one or two linear segments that are valid in raw host-grid order. The tessellator never re-derives seam splits.
4. For overlap candidates, the planner merges only when the occupied shells form one contiguous monotone corridor footprint in the same band. Otherwise the candidate remains unsupported and stays legacy-owned.
5. The emitter is generalized from `emitSupportedCorridorSpan(candidate)` to `emitSupportedCorridorCandidate(candidate)` that iterates the planner's segments, but still builds corridor rails from planner-provided collar splits and still triangulates with `sweepQuad()` / `constrainedSweepCell()`.

**Minimal type changes**:
- Add an `ownershipSegments` array to `OuterWallCorridorCandidate`.
- Add a segment type that carries:
  - `band`
  - `colStart` / `colEnd`
  - `segmentKind: 'simple' | 'seam-left' | 'seam-right' | 'merged-overlap'`
  - segment-local bottom/top collar split positions
  - the subset of chain IDs owned by that segment
- Keep `shellRails` and `seamCollar` as the high-level contract, but make them candidate-authoritative rather than emitter-derived.

**Seam policy**:
- Support only seam candidates that can be represented as one or two monotone host-grid segments after periodic normalization.
- The planner chooses the periodic cut once per candidate and records the resulting collar splits explicitly.
- The tessellator consumes those splits directly and never teaches generic sweep code how to reason about wrap.

**Overlap policy**:
- Support only deterministic mergeable overlaps, initially capped at two chains in one band-local run.
- Merge if and only if the candidate's shell/collar intervals intersect in `(u, t)` after periodic normalization and their union is still one contiguous corridor footprint.
- Reject if the union would branch, separate into two disjoint intervals, or require segment-specific host-edge decompositions that disagree.

**Mathematical basis**:
- The C2 emitter already assumes a monotone polygon strip bounded by bottom/top rails plus mandatory chain edges.
- A seam or overlap expansion is safe only when the corridor can still be reduced to that same monotone strip model after planner-side normalization.
- If the normalized ownership region is not monotone, then the current sweep ownership is the wrong owner and the case must remain unsupported.

**Files affected**:
- `src/renderers/webgpu/parametric/OuterWallCorridorPlanner.ts`
- `src/renderers/webgpu/parametric/OuterWallTessellator.ts`
- tests in `src/renderers/webgpu/parametric/OuterWallTessellator.test.ts`
- downstream-compat coverage in `src/renderers/webgpu/parametric/integration.test.ts`

**Trade-offs**:
- Pros: minimal churn, reuses the existing C2 emitter, preserves current metadata semantics, and keeps periodic logic single-sourced in the planner.
- Pros: does not require changing `constrainedSweepCell()` into a periodic triangulator.
- Cons: does not support arbitrary multi-chain branching or arbitrary seam-wrap geometry in C4.
- Cons: some seam/overlap cases remain intentionally unsupported until a later architectural phase.

**Assumptions**:
1. The approved C4 goal only requires expanding beyond today's simple cases, not full arbitrary periodic corridor remeshing.
2. The overlap cases worth supporting first can be filtered down to a monotone merged footprint without losing the main product value.
3. The planner can become the sole authority for corridor seam decomposition without forcing `ParametricExportComputer` changes.

### Proposal 2: Teach Generic Sweep and Cell Ownership About Periodic U (Rejected)
**Idea**: Remove the seam rejection and let `constrainedSweepCell()`, `sweepQuad()`, R35, R37, and the main emission loop all understand periodic U ordering directly.

**Why I reject it**:
- It spreads seam semantics into the entire cell-local tessellation path instead of keeping them localized to corridor ownership.
- It would force raw vertex-order, winding, partition sorting, and maybe downstream optimizer assumptions to change together.
- It is the opposite of narrow: high churn, hard to verify, and easy to regress R37/R53 manifold guarantees.

## Recommended Approach
Implement Proposal 1.

The narrowest safe C4 is a planner-first expansion, not a tessellator-first heuristic broadening. Concretely:

1. Keep the existing ownership boundary: corridor-owned cells are still `quadMap = -1`, still use planner-declared collar splits, and still collect their interior chain edges from `cellChainMap`.
2. Move all new seam and overlap reasoning into `OuterWallCorridorPlanner.ts`.
3. Generalize the emitter only enough to consume planner-declared segments and multi-chain edge sets.
4. Continue to reject anything that does not reduce to a single monotone segment set with one authoritative host-edge split decomposition.

This stays faithful to the approved master plan:
- explicit periodic seam handling exists, but only in planner-owned contract data,
- overlap support exists, but only for deterministic shell-intersection merges,
- single-source-of-truth host-edge decomposition is preserved because the tessellator stops inventing corridor boundaries.

## Exact Edit Areas

### 1. `OuterWallCorridorPlanner.ts`
Edit the planner, not the global tessellator core, for all new support classification.

Required changes:
- Extend `OuterWallCorridorCandidate` to carry planner-authoritative `ownershipSegments`.
- Add helpers for periodic candidate normalization and segment emission.
- Replace the current blanket `chainIds.length > 1` rejection with a mergeability check.
- Replace the current blanket `hasSeam` rejection with a periodic segmentation step that can still mark unsupported when normalization fails.

This file should become the only place that decides:
- which overlap cases are mergeable,
- where the periodic cut lives for a seam candidate,
- and which exact host-edge split positions the emitter must honor.

### 2. `OuterWallTessellator.ts`
Edit only the corridor-planning and corridor-emission sections, not the generic sweep path.

Specific areas:
- the corridor plan / supported lookup block in `buildCDTOuterWall()`
- the corridor emitter currently named `emitSupportedCorridorSpan`
- the main cell loop's corridor-owner dispatch

Required changes:
- replace the `candidate.chainIds.length === 1` ownership gate with a planner-segment gate
- generalize the emitter to own planner segments, including merged multi-chain segments
- collect all chain edges from all segment-owned cells, dedupe them, and pass them through the existing sweep path
- mark corridor-owned cells and boundary-adjacent grid vertices exactly once from planner data

Do not modify the global seam skip path for standard cells. Standard seam cells should still be skipped unless a planner-supported corridor segment owns them.

### 3. `OuterWallTessellator.test.ts`
This is the primary regression harness for C4.

Add seam and overlap fixtures that explicitly exercise:
- newly supported seam segments,
- newly supported merged-overlap segments,
- still-unsupported seam/overlap cases that remain on the legacy branch.

### 4. `integration.test.ts`
Mirror the existing downstream-compatibility check for the new seam and merged-overlap supported fixtures.

The goal is not new behavior here. The goal is proving that the expanded corridor outputs still satisfy the same optimizer/subdivision contracts already tested for the simple C2 fixture.

## Specific Regression Tests

1. **Supported seam corridor changes topology under flag**
- Add a seam fixture that is single-band, deterministic, and reducible to planner segments.
- Assertions:
  - `corridorPlan` contains a supported candidate with a seam segment kind.
  - flag-off output remains legacy-equivalent.
  - flag-on output differs from legacy in the owned band.
  - all non-chain vertices in corridor-owned triangles lie on planner-declared collar split positions.

2. **Unsupported complex seam remains legacy-equivalent**
- Keep one seam-span fixture that still cannot be normalized into monotone segments.
- Assertions:
  - candidate remains unsupported.
  - vertices / indices / `quadMap` / `chainEdges` stay legacy-equivalent under the flag.

3. **Supported overlap merge changes topology only when shells intersect**
- Add a two-chain fixture whose planner-computed shells/collars overlap into one contiguous segment set.
- Assertions:
  - one supported candidate owns both chain IDs.
  - corridor-owned output differs from legacy in the owned cells.
  - corridor-owned triangles only touch planner-declared collar boundary vertices, not arbitrary host-grid vertices.

4. **Unsupported overlap branch remains legacy-equivalent**
- Keep a multi-chain fixture where the union would branch or separate.
- Assertions:
  - planner leaves it unsupported.
  - output is legacy-equivalent under the flag.

5. **Downstream compatibility for seam and overlap supported fixtures**
- Repeat the current optimizer-compat test for both new supported fixture types.
- Assertions:
  - `optimizeChainStrips()` sees chain-strip triangles and does not generate invalid indices.
  - `optimizeBoundaryDiagonals()` checks real boundary cells.
  - no degenerate triangles appear after the compatibility pass.

6. **Single-source-of-truth collar contract**
- Add a test that every corridor-owned boundary U used in the emitted band appears in planner output and that no extra split positions are synthesized in the emitter.
- This is the direct guard against the manifold-risk class the Verifier flagged in round 21.

## Implementation Traps To Avoid

1. Do not widen the current ownership gate by deleting `chainIds.length === 1` or `seam_span` checks first and “seeing what passes.” That would produce mixed ownership before the contract exists.

2. Do not teach `constrainedSweepCell()` or `sweepQuad()` to infer periodic ordering from raw `u`. That moves seam complexity into the generic cell path and makes C4 much larger than necessary.

3. Do not let the tessellator invent corridor boundary splits. The planner must stay authoritative for seam collars and overlap merges, or the codebase will recreate R37/R53-style split disagreement.

4. Do not support arbitrary multi-chain clusters in C4. Cap the first merge policy at deterministic monotone unions, ideally two chains, and reject everything else.

5. Do not let corridor-owned cells also participate in legacy super-cell ownership, R54 fusion, or corridor-adjacent seam heuristics in the same region. The region must have one topology owner.

6. Do not change downstream metadata semantics casually. `quadMap = -1` for corridor-owned cells and the current meaning of adjacency/protection sets should remain intact unless a later changeset deliberately redefines them.

7. Do not add chain-grid averaging, seam snapping, or cross-owner coalescing to “help” overlap cases. This codebase already has explicit precision locks against that class of fix.

## Open Questions

1. Should the first overlap merge cap be exactly two chains, or “any number so long as the normalized union is still a single monotone segment set”? My recommendation is two chains first.
2. Should the planner expose separate diagnostics for `mergeableOverlapCount` and `supportedSeamCount` so C4 coverage is measurable without reading geometry dumps?
3. For supported seam segments, is one planner-selected periodic cut per candidate sufficient, or do some fixtures require per-segment cuts? I expect one per candidate is the right containment model.