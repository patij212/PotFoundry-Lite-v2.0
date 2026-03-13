# Master Approval — Round 22: Grid Vertex Demotion from CDT Strip Boundaries

Date: 2026-03-05

## Decision: APPROVED WITH CONDITIONS

## Unanimous Agreement Status

- **Generator**: Proposed P1 (Boundary Thinning) + P2 (Shadow-Endpoint Guard) + P3B (diagnostic only) + P4 (no-change)
- **Verifier**: ACCEPT WITH AMENDMENTS — C1 critical batch2Remap rescue (A1), all other items verified clean
- **Executioner**: Pending dispatch
- **Master**: APPROVED — the structural fix is correct; A1 is mandatory

## Rationale

R21's shadow vertices exposed a fundamental architectural limitation: the CDT strip boundary IS the grid. No amount of interior enrichment (companions R16, fans R19, T-ring R20, shadows R21) can override boundary-driven grid structure. The only fix is to remove intermediate grid vertices from the boundary.

P1 (Boundary Thinning) is the correct structural fix. It reduces boundary vertices from ~11 per row to ~2-4 (endpoints + shadows), giving CDT maximal freedom for Delaunay-optimal triangulation.

The Verifier's C1 finding (batch2Remap coincidence) is a valid critical bug — CDF-adaptive grid places columns at feature U-positions, so chain-grid coincidence is expected. Amendment A1 rescues these dropped vertices as interior points.

## Conditions

1. **Amendment A1 is MANDATORY** — batch2Remap rescue pass must be implemented
2. **P2 threshold = 0.001 U** — conservative guard for shadow-endpoint proximity
3. **Diagnostic counters** — log boundary thinning drops, batch2Remap rescues, P3B strip mismatches
4. **All 1896 tests must pass**

## Risk Assessment

- **Blast radius**: Only affects CDT strip construction in OuterWallTessellator.ts. Standard cells untouched. ChainStripTriangulator untouched.
- **T-junction risk**: Bounded to ~40 vertices at chain endpoints (C4). Absorbed by expansion=4 and edge flip.
- **Rollback**: Single file change, easily reverted if metrics worsen.

## Implementation Order

See Executioner dispatch below.
