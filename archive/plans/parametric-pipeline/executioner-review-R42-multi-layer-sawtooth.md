# Executioner Implementation — R42 Multi-Layer Sawtooth Fix

Date: 2026-03-08

---

## Changes Made

### Fix 1: Remove `j%2` alternation in `chainDirectedFlip`

**File**: [MeshOptimizer.ts](../../src/renderers/webgpu/parametric/MeshOptimizer.ts) lines ~211-228

- Removed the `else { j % 2 === 0 ? flipToAD : flipToBC }` tie-break branch
- Added a `let flipped = false` flag, set `true` only when a flip is performed (`|localUDelta| > LEAN_THRESHOLD`)
- Changed `lockedQuads.add()` from unconditional to `if (shouldLockBand && flipped)` — cells where the flip was skipped (tie-break) are now free for `flipEdges3D` downstream optimization
- Verified safety: `flipEdges3D` already has `if (triBase < 0) continue;` at line 367, so chain cells (quadMap=-1) that become unlocked in the tie-break path are still skipped by`flipEdges3D`

### Fix 2: Increase mesh-guide blend constants

**File**: [ChainLinker.ts](../../src/renderers/webgpu/parametric/ChainLinker.ts) lines ~465-479

- `MESH_GUIDE_BASE_BLEND_WEIGHT`: 0.12 → **0.40**
- `MESH_GUIDE_ADAPTIVE_BLEND_GAIN`: 0.88 → **0.60** (maintains BASE + GAIN = 1.00)
- `MESH_GUIDE_ACCEL_FULL_BLEND`: 0.003 → **0.002**
- `MESH_GUIDE_MAX_POINT_SHIFT`: 0.003 → **0.005** (Verifier-amended from Generator's 0.008)

### Fix 3: Exempt feature edges from protected vertex check in subdivision

**File**: [MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts) lines ~402-424

- Converted `touchesProtectedPatch` from an arrow expression to a block function with a new `isFeatureEdge: boolean` parameter
- Feature edges (chain↔grid boundary) now only check opposite vertices against `protectedVertices`, not the edge endpoints themselves — this allows subdivision to add midpoints on long feature edges even when endpoints are in the phantom corridor
- Non-feature edges retain the original behavior (all 4 vertices checked)
- At the call site, `isFeatureEdge` is recomputed from `se.v0` and `se.v1` rather than modifying the `SplitEdge` interface — simpler, zero-overhead (one XOR comparison)

---

## Test Updates

5 tests across 3 files updated to reflect R42's new behavior:

| Test File | Test | Change |
|---|---|---|
| MeshOptimizer.test.ts | `flips quads along a vertical chain` | `lockedQuads.size > 0` → `=== 0` (vertical chains produce no locks) |
| MeshOptimizer.test.ts | `handles non-identity row mapping` | Same — vertical chain, no locks |
| MeshOptimizer.test.ts | `multiple chains produce independent locked sets` | `>= 4` → `=== 0` (both chains vertical) |
| ChainLinker.test.ts | `moves a jagged interior point harder than smoother neighbors` | Cap assertion `0.003` → `0.005` |
| MeshSubdivision.test.ts | `skips subdivision patches that touch protected corridor vertices` | `protectedVertices: Set([4])` → `Set([0,1,2,3])` — protect the opposite vertices (grid), not the feature edge endpoint (chain) |

---

## Deviations from Plan

**None.** All three fixes implemented exactly as specified in the converged Generator/Verifier R42 proposal.

Implementation detail not in plan: Used a `flipped` flag to conditionally lock quads rather than duplicating `lockedQuads.add()` inside both `if`/`else if` branches. Semantically identical; cleaner control flow.

---

## Validation Results

- **typecheck**: 0 errors
- **test**: 1883 passed, 0 failed, 13 skipped (88 files)
- **lint**: 0 warnings

---

## Surprises / Feedback for Generator & Verifier

1. **No surprises.** All three fixes were clean, isolated changes. No unexpected coupling or downstream breakage beyond the 5 expected test failures.

2. **`flipEdges3D` safety net confirmed**: The `triBase < 0` guard at line 367 means chain cells (quadMap=-1) that become unlocked in Fix 1's tie-break path are inherently safe — `flipEdges3D` skips them regardless of lock status.

3. **`SplitEdge` interface left unchanged**: Fix 3 recomputes `isFeatureEdge` from `se.v0`/`se.v1` at the call site (one cheap XOR). This avoids propagating the interface change to all consumers and test fixtures. If future fixes need `isFeatureEdge` frequently, consider adding it to the interface then.

4. **Test fixture for protected vertices needed updating**: The MeshSubdivision test used `Set([4])` (protecting the chain vertex endpoint) which was a valid test of the old behavior. Updated to `Set([0,1,2,3])` (protecting the grid vertices = the opposite vertices) to test the same corridor-protection intent through the new feature-edge-aware path.
