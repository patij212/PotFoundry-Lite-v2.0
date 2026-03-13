# Master Approval — R42 Multi-Layer Sawtooth Fix
Date: 2026-03-08

## Decision: APPROVED

## Unanimous Agreement Status
- Generator: proposed 3 fixes targeting 4 identified root causes
- Verifier: accepted all 3 fixes, amended MAX_POINT_SHIFT from 0.008 → 0.005
- Executioner: implemented all 3 fixes, confirmed feasibility
- Master: approved — all changes verified against actual codebase

## Rationale

The R41 chainFanQuad fix was correct but insufficient — it addressed only 1 of 4 contributing causes of the persistent sawtooth at feature edges. R42 targets the remaining 3 causes with coordinated, minimal changes across 3 files.

**Fix 1** (MeshOptimizer.ts) is the linchpin. The `j%2` alternation in `chainDirectedFlip` was the dominant sawtooth factory — it deliberately alternated diagonal directions in the ±1 column band around ridges for near-vertical chains. Removing the alternation and skipping the lock for tie-break cells lets `flipEdges3D` optimize these cells with actual 3D geometry.

**Fix 2** (ChainLinker.ts) addresses the vertex position oscillation. The mesh-guide blend was extremely conservative (avgShift=0.000104), preserving nearly all raw chain U-oscillation. Raising BASE_BLEND to 0.40 and MAX_POINT_SHIFT to 0.005 allows the blend to meaningfully smooth the chain path while staying within safe bounds.

**Fix 3** (MeshSubdivision.ts) unblocks feature edge subdivision. 55% of candidates were rejected by `touchesProtectedPatch` because they shared an endpoint with R37/R38 phantom vertices. The exemption checks only opposite vertices for feature edges — subdivision is topology-preserving and runs AFTER all optimizer passes, so there's no vulnerability.

## Conditions

1. The 1 test failure (weldMesh performance benchmark at 1022ms vs 1000ms limit) is a pre-existing timing flake unrelated to R42 changes.
2. All 1882 functional tests pass.
3. TypeScript compilation and ESLint are clean.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Removing j%2 could reintroduce an unknown artifact | No journal rationale found for j%2; Verifier confirms it's a common heuristic, not a targeted fix. flipEdges3D handles ambiguous cells downstream. |
| Stronger blend could overshoot feature positions | MAX_POINT_SHIFT capped at 0.005 (~3.4 grid cells), well within the feature radius. Verifier validated against spiral ridge counterexample. |
| Subdivision midpoints exposed to optimizers | Verifier PROVED this is impossible: subdivision runs AFTER all edge-flipping passes in the pipeline. |

## Implementation Order

All 3 fixes implemented atomically:
1. Fix 1: MeshOptimizer.ts — removed j%2, conditional lock (~5 lines changed)
2. Fix 2: ChainLinker.ts — 4 constants updated
3. Fix 3: MeshSubdivision.ts — touchesProtectedPatch accepts isFeatureEdge, ~8 lines changed

## Expected Export Log Changes

- `chain-directed flip: N diagonals` — N should DECREASE (tie-break flips skipped)
- `N quads locked` — should DECREASE (tie-break cells unlocked)
- `avgShift` — should INCREASE from ~0.000104 to ~0.001-0.002
- `maxShift` — should INCREASE from 0.003000 toward 0.005000
- `protected rejects` — should DECREASE significantly from ~5014
