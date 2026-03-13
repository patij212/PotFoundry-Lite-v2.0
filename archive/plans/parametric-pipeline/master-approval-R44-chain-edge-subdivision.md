# Master Approval — R44 Chain Edge Subdivision
Date: 2026-03-08

## Decision: APPROVED

## Unanimous Agreement Status
- Generator: proposed (chain edge subdivision + debug vis alignment)
- Verifier: accepted with 3 minor amendments (A1 comment, A2 test, A3 diagnostic)
- Executioner: feasible, implemented, all tests pass
- Master: **approved**

## Rationale

R40-R43 failed because they targeted topology and smoothing — but the dominant issue was that chain edges (the very edges forming the ridge path) were **completely excluded from GPU subdivision**. Two independent mechanisms blocked them:

1. `constraintEdgeSet.has(ek) → continue` (MeshSubdivision.ts:372) — unconditional skip
2. `isFeatureEdge` XOR check (line 383) — didn't catch chain-to-chain edges (both ≥ outerGridVertexCount)

This locked ridge resolution at row-spacing (~0.77mm), creating ~45° visible zigzag at every row boundary. The fix is minimal and targeted:

- Remove the unconditional skip, reclassify chain edges as feature edges
- Chain edges (~0.77mm) now exceed the feature threshold (0.579mm) → subdivided once
- Midpoints GPU-evaluated to exact on-surface positions → 2× ridge resolution
- Debug vis aligned with smoothed chains (meshChains instead of preSmoothChains)

## Conditions
None. All amendments incorporated during implementation.

## Risk Assessment
**Low**. The constraint edge set is only consumed by CSO (flip protection, runs BEFORE subdivision) and subdivision itself. No downstream consumers affected. The `touchesProtectedPatch` mechanism correctly blocks splits in phantom corridors. Single-pass subdivision means no cascading or UV growth issues.

## Implementation Order
All changes implemented atomically:
1. MeshSubdivision.ts — removed constraint skip, added chain edge classification (2 locations)
2. MeshSubdivision.ts — updated JSDoc for constraintEdgeSet
3. ParametricExportComputer.ts — debug vis uses meshChains
4. MeshSubdivision.test.ts — updated test from "never splits" to "treats as feature edges"

## Validation
- typecheck: 0 errors
- lint: 0 warnings
- tests: 1882 passed (1 pre-existing weldMesh benchmark flake — timing issue, unrelated)

## Why This Time Is Different
| Round | What Was Fixed | Category | Why No Improvement |
|-------|---------------|----------|-------------------|
| R40 | sweepQuad diagonal direction | Topology | Didn't change vertex positions |
| R41 | chainFanQuad + FAST threshold | Topology + Resolution | FAST blocked by protection, chain edges still frozen |
| R42 | j%2 alternation + blend + subdivision exemption | Topology + Geometry (weak) | Chain edges still frozen |
| R43 | smoothedChains for mesh + WH λ=200 | Geometry | Remaining delta IS the real feature — WH can't reduce further |
| **R44** | **Chain edge subdivision** | **Resolution** | **2× ridge resolution, directly addressing the root cause** |

R44 targets a DIFFERENT category (resolution) than all previous rounds (topology/geometry). The chain edges were always the bottleneck — we just never let them be subdivided.
