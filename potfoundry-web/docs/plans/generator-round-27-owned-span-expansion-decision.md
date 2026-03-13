# Generator Round 27 — Owned-Span Expansion Decision
Date: 2026-03-12

## Problem Statement
The current owned-span reuse slice is intentionally narrow: corridor-owned spans may reuse the shared R35/R37/R53 owned-span path only when the corridor segment is non-seam, single-chain, touches exactly one legacy super-cell owner, and exactly matches that owner's `[colStart, colEnd]` interval. Everything else still falls back to legacy.

The next decision is whether to expand owned-span admission by:

1. allowing partial-interval single-chain admission inside a larger legacy super-cell, or
2. allowing multi-chain owned-span admission for the already-bounded two-edge monotone overlap class.

The evaluation criterion is not theoretical elegance. It is: highest real export-quality / fallback reduction for the lowest architecture risk and implementation complexity.

## Live Code Facts

### Current exact-match owned-span gate
- `tryBuildCorridorOwnedSpanDescriptor()` only admits non-seam, single-chain segments and then requires the corridor segment to touch exactly one legacy super-cell owner whose `band`, `colStart`, and `colEnd` exactly match the segment. See `OuterWallTessellator.ts` around the descriptor gate and exact-match check.
- Corridor-owned spans are registered before legacy owned spans, and any legacy super-cell with any claimed cell is suppressed entirely from the shared owned-span registry.

### Shared owned-span machinery already in production
- R37 preprocessing already runs over `ownedSpanDescriptors`, not legacy super-cells directly.
- R53 propagated-boundary handling also runs over `ownedSpanDescriptors`, but it only propagates phantoms to adjacent non-owned cells.
- `emitOwnedSpan()` already emits a shared owned span through `constrainedSweepCell()` plus R37 sub-band splitting.

### Multi-chain support is already structurally split between planner and tessellator
- The planner now marks non-seam two-chain overlap as structurally supported and counts it separately via `supportedOverlapCandidateCount`.
- Final authority for live emission already sits in the tessellator, which only admits multi-chain non-super-cell spans when they reduce to exactly two deduped bottom-to-top edges with preserved row order.

### Current regression surface
- Positive overlap corridor ownership already exists for the simple non-super-cell two-chain case.
- The remaining super-cell-touching overlap path is still pinned to legacy in the export regression that proves a planner-supported overlap later requires super-cell machinery.
- The current complex overlap fixture that crosses internal column boundaries still falls back to legacy.

## Comparison

### Option A — Partial-Interval Single-Chain Owned-Span Admission
**What it would unlock**
- Some single-chain corridor segments that are already geometrically simple but only cover a strict subset of a legacy super-cell interval.
- This could reduce legacy fallback for a subset of super-cell-touching single-chain spans that the current exact-match gate rejects.

**Why it looks simpler than it is**
- The shared registry currently suppresses the whole legacy super-cell as soon as any corridor-owned cell overlaps it. A partial takeover therefore cannot just admit the corridor sub-interval; it also has to split the remainder of the old super-cell into one or two residual owned spans.
- R53 boundary propagation currently targets adjacent non-owned cells only. That works for an owned-span versus standard-cell boundary, but not for a new owned-span versus residual-owned-span boundary created inside what used to be one legacy super-cell interval.
- The current descriptor only models one owned interval with two exterior boundaries. Partial takeover creates new internal owner-owner interfaces that the present phantom-boundary propagation contract does not model.

**Real risk**
- This is a hidden topology split, not just a gate relaxation. If one partial span receives R37 phantom rows on a new internal boundary and the residual span does not inherit the same split decomposition, the code can recreate the exact T-junction / boundary disagreement class that R53 exists to suppress.

**Expected payoff**
- Moderate at best. The user-visible win is real, but the current live regression set does not yet show a strong high-value single-chain partial-interval export failure class comparable to the overlap fallback now pinned in the export suite.

### Option B — Multi-Chain Owned-Span Admission
**What it would unlock**
- Planner-supported, non-seam, one-band overlap spans that already satisfy the verifier's exact-two-edge monotone strip contract, but currently fall back once super-cell machinery becomes necessary.
- This directly targets the remaining overlap fallback proven by the export regression and the complex overlap unit coverage.

**Why it is the better incremental fit**
- The exact-match interval contract can stay intact. That means no residual legacy-span splitting and no new owner-owner internal boundary class.
- `emitOwnedSpan()` already consumes multiple `uniqueEdges`, and R37 already preprocesses all unique chain edges inside an owned span. The missing piece is not a second phantom pipeline; it is a tighter owned-span admission gate for the exact two-edge monotone multi-chain case.
- The tessellator already contains the right authority pattern for multi-chain non-super-cell admission: exact edge count, one-band strip, bottom/top endpoint mapping, and preserved order. That verifier guidance can be reused at the owned-span gate instead of inventing new planner semantics.

**Real risk**
- If the gate broadens beyond the exact-two-edge, no-side-entry class, `constrainedSweepCell()` will silently under-model the span by discarding side-entering or extra fragments. So the safety of this option depends on keeping final authority inside the tessellator, not the planner.

**Expected payoff**
- High for the next slice. The blocked export-level overlap regression is already present, the simple overlap topology path is already proven on the non-super-cell branch, and the architecture delta stays inside an existing ownership model instead of splitting that model apart.

## Recommendation

### Choose B next: multi-chain owned-span admission

This is the better next step because it attacks the higher-value remaining fallback class while preserving the owned-span descriptor shape that already exists.

Option B keeps the current strongest containment properties:
- exact-match interval ownership stays unchanged,
- R37 and R53 still operate over one authoritative owned interval,
- the planner may nominate overlap structurally, but the tessellator remains final authority on exact-two-edge monotonicity.

Option A looks narrower, but it actually forces the architecture to learn how to split one legacy super-cell into multiple adjacent owned authorities and then make R53 owner-owner boundaries first-class. That is a deeper contract change than admitting the already-bounded multi-chain geometry class.

## Expected User-Visible Wins
1. Fewer planner-supported overlap corridors will fall back to the legacy tessellator path once super-cell / phantom-row machinery appears.
2. Overlap-heavy bands should preserve corridor-declared boundaries instead of reverting to the broader legacy super-cell rails.
3. Export topology should improve first in the same failure family already covered by the bounded-overlap compute regression, which is the most direct signal of reduced real export fallback.

## Main Hidden Risks

### If B is chosen
1. Planner diagnostics still overstate support structurally. The tessellator must stay the final admission authority for owned-span overlap cases.
2. The gate must remain exact: non-seam, one band, exactly two candidate chain IDs, exactly two deduped edges, one bottom endpoint and one top endpoint per edge, no side-entry, no extra fragments.
3. Any attempt to "help" broader overlap cases by loosening `constrainedSweepCell()` or inventing planner-side geometry proofs should be rejected for this slice.

### If A is chosen instead
1. Legacy super-cell suppression becomes ambiguous because a partially claimed super-cell can no longer be skipped wholesale.
2. R53 currently has no owner-owner propagation contract for an internal boundary between two adjacent owned spans.
3. The smallest-looking partial slice is likely to create the most subtle manifold and T-junction regressions.

## Smallest Safe Implementation Slice

For B, the smallest safe slice is:
1. Keep planner support structural only for the existing two-chain non-seam overlap class.
2. Extend the owned-span admission gate, not planner authority, so exact-match super-cell-touching overlap spans may build an owned-span descriptor only when they also pass the exact-two-edge monotone proof already used for non-super-cell multi-chain spans.
3. Leave any overlap with extra edges, side-entry, seam behavior, disjoint normalization, or partial-interval ownership on the legacy path.

## First Tests To Flip
1. `OuterWallTessellator.test.ts` overlap fallback coverage for the super-cell-touching overlap case should be the first unit-level flip.
2. `ParametricExportComputer.corridorFlags.test.ts` should flip the regression that currently keeps the planner-supported overlap on the legacy path once super-cell machinery is needed.
3. `integration.test.ts` should add or flip the downstream optimizer compatibility check for the newly admitted owned-span overlap path.

The current complex internal-boundary overlap fallback should remain the negative control until the exact-match multi-chain slice is green.

## Decision On The Other Path

### Defer A, do not reject it permanently

Partial-interval single-chain admission should be deferred, not rejected forever.

It becomes the right next topic only after the codebase has an explicit answer for residual owned-span splitting and owner-owner R53 propagation. Until then, A has worse architecture risk than B despite looking more incremental.

## Open Questions For Verifier
1. Does the Verifier agree that owner-owner boundary propagation is the real blocker for A, not descriptor endpoint math?
2. For B, is the current exact-two-edge monotone proof sufficient if reused verbatim at the owned-span gate, or should the owned-span version add one more guard around R37-generated extra fragments before registration?