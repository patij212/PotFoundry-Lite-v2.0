# Master Directive — Bounded Multi-Chain Owned-Span Expansion
Date: 2026-03-12

## Situation
The current owned-span implementation safely reuses R35, R37, and R53 for exact-match single-chain corridor spans that map onto one legacy super-cell interval. The next expansion choice is between:

- partial-interval single-chain admission
- exact-match multi-chain admission

The design review converged on exact-match multi-chain admission as the better next step. Partial-interval admission is not a simple gate relaxation; it would split one legacy owner into multiple adjacent owned authorities and would therefore require residual-span modeling plus owner-to-owner phantom propagation semantics that the current registry and R53 path do not support.

## Judgment
Implement only the bounded exact-match multi-chain slice next.

That slice preserves the current ownership contract:
- one authoritative owned interval
- corridor-first suppression of the legacy owner
- R53 propagation only from owned spans to adjacent non-owned cells

Do not attempt partial-interval takeover in this round.

## Decision
APPROVED FOR IMPLEMENTATION: exact-match, one-band, non-seam, two-chain owned-span admission with final authority in the tessellator.

REJECTED FOR THIS ROUND: partial-interval single-chain owned-span admission.

## Scope
Admit a corridor segment into owned-span reuse only if all of the following hold:

1. The segment touches exactly one legacy super-cell.
2. The segment footprint exactly matches that legacy super-cell interval.
3. The segment is non-seam.
4. The segment has exactly two chain IDs.
5. The deduped geometry has exactly two bottom-to-top edges.
6. Each edge maps to one bottom rail endpoint and one top rail endpoint.
7. Bottom-row order and top-row order are strictly preserved.
8. No extra chain-owned fragments remain after dedupe.

Everything else stays on the legacy path.

## Exact Code Changes

### 1. Extract a shared exact-owner proof helper
File: `potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts`

Add a helper that proves the ownership footprint is exactly one legacy super-cell interval and returns the matched owner.

Suggested shape:

```ts
function getExactMatchedSuperCellOwner(
    segment: OuterWallCorridorOwnershipSegment,
): SuperCell | undefined
```

This should move the exact-match logic currently embedded in `tryBuildCorridorOwnedSpanDescriptor()` into one reusable place.

### 2. Extract a shared multi-chain geometry proof helper
File: `potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts`

Extract the existing two-chain admissibility proof from `isCorridorOwnershipSegmentAdmissible()` into a helper that works for any corridor segment geometry.

Suggested shape:

```ts
function isBoundedTwoChainOwnedSpan(
    segment: OuterWallCorridorOwnershipSegment,
    geometry: CorridorSpanGeometry,
): boolean
```

This helper must enforce:
- `chainIds.length === 2`
- `!periodicSeam`
- `uniqueEdges.length === 2`
- one bottom and one top endpoint per edge
- exactly one owned chain vertex per chain ID on each rail
- preserved rail order
- no extra chain evidence outside the two proven edges

### 3. Broaden owned-span descriptor admission, not planner support
File: `potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts`

Change `tryBuildCorridorOwnedSpanDescriptor()` so it:
- allows `chainIds.length === 1` as today
- allows `chainIds.length === 2` only when the exact-match owner proof passes and the shared two-chain geometry proof passes
- still rejects all partial-interval and ambiguous-owner cases

Do not change `OuterWallCorridorPlanner.ts` support semantics in this round.

### 4. Keep the owned-span registry unchanged
File: `potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts`

Do not change:
- `ownedSpanStarts`
- `ownedSpanCells`
- `ownedSpanDescriptors`
- owned-span-first dispatch in the main loop

This is a gate expansion only. The registry model stays single-owner and interval-exact.

### 5. Leave R37 and R53 logic untouched unless the new tests prove a real gap
File: `potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts`

The current owned-span path already drives:
- `ownedSpanR37`
- `phantomBoundaryMap`
- `emitOwnedSpan()`

Do not reopen those paths unless the newly admitted two-chain exact-match case exposes a concrete failure. The whole point of this round is to reuse them unchanged.

## Implementation Order

1. Add the new exact-match overlap fixtures and keep them failing on legacy-equality expectations first.
2. Extract `getExactMatchedSuperCellOwner(...)`.
3. Extract `isBoundedTwoChainOwnedSpan(...)` from the current non-supercell overlap proof.
4. Update `tryBuildCorridorOwnedSpanDescriptor()` to allow the bounded two-chain class.
5. Re-run focused corridor tests and confirm only the intended regressions flip.
6. Only if needed, make the minimum R37/R53 adjustment required by those failing tests.

## First Test Flips

### Unit-level first flip
File: `potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.test.ts`

Add or flip the super-cell-touching bounded overlap case so planning-on output is no longer legacy-equal when the exact-match two-chain proof passes.

### Export-level first flip
File: `potfoundry-web/src/renderers/webgpu/ParametricExportComputer.corridorFlags.test.ts`

Flip:
- `keeps the real compute() mesh on the legacy path for a planner-supported overlap that later needs super-cell machinery`

to assert changed output once the exact-match two-chain case is admitted.

### Integration coverage
File: `potfoundry-web/src/renderers/webgpu/parametric/integration.test.ts`

Add or extend the optimizer compatibility case for the bounded super-cell-touching overlap fixture.

## Negative Controls That Must Stay Legacy

These must remain unchanged in this round:

1. partial-interval corridor ownership inside a larger super-cell
2. seam-touching multi-chain spans
3. spans with more than two chain IDs
4. spans whose deduped edge set is not exactly two
5. side-entering or disconnected chain fragments
6. complex internal-boundary overlap cases already pinned as legacy fallback

## Acceptance Criteria

### Functional
- bounded exact-match two-chain super-cell cases emit through the owned-span path
- legacy output is preserved for all out-of-policy cases
- corridor boundaries remain corridor-declared, not widened to a larger legacy rectangle

### Validation
Run:

```bash
cd potfoundry-web
npx vitest run src/renderers/webgpu/ParametricExportComputer.corridorFlags.test.ts src/renderers/webgpu/parametric/OuterWallTessellator.test.ts src/renderers/webgpu/parametric/integration.test.ts
npm run typecheck
npm run lint
```

## Risk Notes
- The main risk is over-admission, not emission mechanics.
- If the gate becomes looser than the current two-edge proof, `constrainedSweepCell()` can silently under-model side-entering geometry.
- If implementation starts synthesizing residual owned spans, stop and redesign; that is partial-interval work and outside this directive.

## Next Step After This Round
Only after the bounded two-chain exact-match class is green should the team revisit partial-interval reuse. That later round needs a fresh design because it changes ownership semantics, not just admission rules.