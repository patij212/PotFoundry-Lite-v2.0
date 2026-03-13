# Master Approval — Corridor Owned Super-Cell Reuse
Date: 2026-03-12

## Decision: APPROVED WITH CONDITIONS

## Unanimous Agreement Status
- Generator: proposed shared owned-span reuse for super-cell-touching corridor spans
- Verifier: accepted with amendments around single-owner prep and owner-aware propagation
- Executioner: feasible now as a bounded `OuterWallTessellator.ts` change
- Master: approved and implemented the bounded slice

## Rationale
The live blocker was no longer planner support. It was emitter parity: supported corridor spans that touched legacy super-cells still fell back because only the legacy super-cell path owned R37 phantom-row splitting and R53 propagated-boundary handling. The approved slice fixes that at the correct seam by creating a single owned-span registry before preprocessing and reusing the shared R35/R37/R53 path for exact-match single-chain corridor spans.

## Conditions
- Keep planner semantics unchanged in this round.
- Limit corridor takeover to exact-match, single-chain spans that map cleanly onto one legacy super-cell interval.
- Leave overlap-heavy and ambiguous ownership cases on the legacy path.
- Treat `0,0,0` sentinel tris as explicit sentinels in compatibility tests, not as real geometry failures.

## Risk Assessment
Blast radius is limited to outer-wall owned-span preprocessing and emission in `OuterWallTessellator.ts`. The main risk is over-claiming ownership for spans that still need wider legacy behavior, which is why the admission gate remains exact-match and single-chain only. Rollback is straightforward: revert the corridor-owned span registration and all super-cell-touching spans return to legacy emission.

## Implementation Order
1. Resolve corridor-owned span ownership before R37/R53 preprocessing.
2. Generalize owned-span geometry and shared R37/R53 preprocessing.
3. Dispatch owned spans before plain corridor spans in the main loop.
4. Flip only the simple supported-span and real `SuperformulaBlossom` regressions; keep complex overlap fallback regressions unchanged.
5. Validate with focused corridor Vitest coverage plus `typecheck` and `lint`.