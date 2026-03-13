# Generator Round 5 — webgpu_core.ts Phase 5 Decomposition

Date: 2026-03-10  
Updated: 2026-03-10 (Fresh code archaeology pass)

## Problem Statement

`webgpu_core.ts` is at **4,815 lines** after 4 phases of decomposition. The file remains difficult to navigate, test, and maintain. This proposal identifies the next extraction target following the established pattern: coherent, self-contained blocks with minimal coupling.

## Current State After Phase 4

| Phase | Extraction | LOC Removed | Risk Level |
|-------|------------|-------------|------------|
| P-0 | as-any elimination | 27 casts removed | LOW |
| 1 | AxisOverlay | ~200 | LOW |
| 2 | InputManager | ~250 | LOW |
| 3 | BufferLayout | ~130 | LOW |
| 4 | Controller Interface Typing | 0 (type safety) | LOW |
| **Total** | | ~580+ | |

## Updated Code Structure (2026-03-10 Pass)

### Module-Level Code (L1-850)

| Line Range | Content | LOC | Extractable? |
|------------|---------|-----|--------------|
| L1-75 | Imports | 75 | No |
| L75-100 | Logging setup | 25 | No |
| L102-170 | Constants & type aliases | 68 | Already in CameraConstants |
| L170-200 | Uniform parity tracking | 30 | No — state-coupled |
| L200-280 | Camera basis utilities | 80 | No — uses cameraController |
| L280-400 | Utility functions | 120 | Partial |
| **L400-530** | **Matrix math** | **130** | **✅ YES** |
| L530-600 | applyViewPreset | 70 | Medium risk |
| L600-830 | buildCameraRig | 230 | High risk (defer) |
| L830-850 | handleDeviceLost | 20 | Already exported |

### Inside mount() (~4000 lines, L850-4815)

| Section | Line Range | LOC | Extraction Difficulty |
|---------|------------|-----|----------------------|
| Diagnostic setup | L850-1000 | 150 | Medium |
| Status helpers | L1000-1100 | 100 | Medium |
| WebGPUState init | L1100-1200 | 100 | Easy (low value) |
| UI Button handlers | L1200-1450 | 250 | Medium |
| Camera snapshot/emit | L1450-1650 | 200 | Hard |
| Resize handler | L1700-1900 | 200 | Medium |
| Shader/pipeline setup | L1900-2100 | 200 | Hard |
| ControllerHelpers | L2100-2300 | 200 | Hard |
| commitDisplayBasisToState | L2300-2500 | 200 | Hard |
| applyCameraPayload | L2700-2900 | 200 | Hard |
| handleCameraCommand | L2900-3100 | 200 | Hard |
| Event handlers | L3100-3400 | 300 | Hard |
| updateAndDraw | L3500-4200 | 700 | Very Hard |
| Frame loop | L4400-4815 | 415 | Very Hard |

---

## Candidate Analysis

### Candidate 1: Matrix Math Utilities (L427-522)

**Functions:**
- `viewMatrixFromBasis(basis: CameraBasis, eye: Vec3): Mat4` (L427-450)
- `mat4Multiply(a: Mat4, b: Mat4): Mat4` (L452-467)
- `matrixIsFinite(m: Mat4): boolean` (L471-479)
- `mat4OrthoLH(left, right, bottom, top, near, far): Mat4` (L481-497)
- `mat4PerspectiveFovLH(fovY, aspect, near, far): Mat4` (L499-514)

| Metric | Value |
|--------|-------|
| **LOC** | ~90 |
| **Risk** | LOW |
| **Dependencies** | `Vec3`, `Mat4`, `CameraBasis` types only |
| **State Access** | NONE — pure functions |
| **Consumers** | `buildCameraRig` (single call site in webgpu_core) |
| **Test Coverage** | Easily unit-testable with known matrix math results |

**Verdict:** ✅ PRIMARY CANDIDATE — Pure mathematical functions with no state, no closures, single consumer.

---

### Candidate 2: Vector Math Consolidation

**Problem:** `vec3Length`, `vec3Normalize`, `vec3Scale`, `vec3Dot`, `vec3Subtract` exist in BOTH:
- `webgpu_core.ts` (L391-401) — local definitions
- `camera_basis.ts` (L23-35) — exported versions

**Analysis:**
- `camera_basis.ts` already exports `Vec3`, `vec3Length`, `vec3Normalize`, `vec3Scale`, `vec3Dot`
- `webgpu_core.ts` has local duplicates (not importing from camera_basis)
- `vec3Subtract` exists only in `webgpu_core.ts` — would need to be added to `camera_basis.ts`

| Metric | Value |
|--------|-------|
| **LOC Reduction** | ~15 (replacing duplicates with imports) |
| **Risk** | MEDIUM — requires changing imports across files |
| **Coupling** | Creates tighter coupling between modules |
| **Value** | Consolidation benefit, but low LOC payoff |

**Verdict:** ⚠️ SECONDARY — Good hygiene but not worth a dedicated phase. Bundle with Candidate 1.

---

### Candidate 3: View Presets (L552-607)

**Function:** `applyViewPreset(state: WebGPUState, preset: string): void`

| Metric | Value |
|--------|-------|
| **LOC** | ~55 |
| **Risk** | MEDIUM |
| **Dependencies** | `applyCameraEuler`, `resetInertia`, `wrapAngle` |
| **State Access** | WRITES to `WebGPUState` (pan, zoom, cam basis, pivot) |
| **Consumers** | `handleCameraCommand` (inside mount), exported to external callers |

**Verdict:** ⚠️ DEFER — State mutation makes testing harder. `applyCameraEuler` has closure-like behavior via `quaternionFromBasis` imports.

---

### Candidate 4: buildCameraRig (L616-800)

**Function:** `buildCameraRig(state, paddingHint, paddedHalfWidth?, paddedHalfHeight?): CameraRig`

| Metric | Value |
|--------|-------|
| **LOC** | ~185 |
| **Risk** | HIGH |
| **Dependencies** | `resolveActiveBasis`, `ensureFreePosition`, `emitDiagnostic`, parity flip logic |
| **State Access** | READS state, WRITES `lastCameraRig`, calls `markUniformParityRewriteNeeded` |
| **Coupling** | Uses forward-declared `emitDiagnostic` (defined inside `mount()`) |

**Previous Assessment:** Flagged as HIGH RISK in earlier phases due to:
1. VP nudge coupling (parity flip detection uses `mulMat4Vec4`, `ndcDirBetween`)
2. Forward-declared `emitDiagnostic` — closure dependency on `mount()` scope
3. Free camera mode path vs orbit mode path divergence

**Verdict:** ❌ NOT YET — Too many tentacles into mount() internals. Extract matrix math first to reduce buildCameraRig's local dependencies.

---

### Candidate 5: Camera State Functions Inside mount()

**Functions:** `buildCameraSnapshot`, `emitCameraState`, `setAutoRotate`, `applyCameraPayload`, `handleCameraCommand`

| Metric | Value |
|--------|-------|
| **LOC** | ~450+ |
| **Risk** | HIGH |
| **Coupling** | CLOSURE DEPENDENCIES on `state`, `emit`, `cameraController`, `current` |

**Verdict:** ❌ BLOCKED — These are defined inside `mount()` and capture closure variables. Cannot extract without major refactoring.

---

## Primary Proposal: MatrixMath Module

### Target: Create `src/MatrixMath.ts`

Extract pure matrix math functions from webgpu_core.ts into a dedicated module.

### Exact Line Ranges (Verified 2026-03-10)

```
webgpu_core.ts L431-522:
  - viewMatrixFromBasis: L431-456 (~26 lines)
  - mat4Multiply: L458-473 (~16 lines)
  - matrixIsFinite: L477-484 (~8 lines)
  - mat4OrthoLH: L486-504 (~19 lines)
  - mat4PerspectiveFovLH: L508-522 (~15 lines)
```

**Total:** ~84 lines of function definitions + whitespace

### Bonus: Consolidate vec3Subtract

Add `vec3Subtract` to exports from either `camera_basis.ts` or the new `MatrixMath.ts`. This eliminates the local duplicate in webgpu_core.ts.

### Estimated LOC Reduction

| Item | LOC |
|------|-----|
| Matrix functions | 90 |
| vec3Subtract duplicate removal | 1 |
| Import statement additions | -2 |
| **Net reduction** | **~88** |

---

## Interface Design

```typescript
// src/MatrixMath.ts

import type { Vec3, CameraBasis } from './camera_basis';

/** 4x4 Matrix type - can be tuple or Float32Array */
export type Mat4 =
  | readonly [
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
      number, number, number, number
    ]
  | Float32Array;

/**
 * Build a view matrix from camera basis vectors and eye position.
 * Camera axes form ROWS of the rotation part (stored as columns in column-major).
 */
export function viewMatrixFromBasis(basis: CameraBasis, eye: Vec3): Mat4;

/**
 * Multiply two 4x4 matrices (column-major).
 */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4;

/**
 * Check if all 16 elements of a matrix are finite numbers.
 */
export function matrixIsFinite(m: Mat4): boolean;

/**
 * Create a left-handed orthographic projection matrix.
 */
export function mat4OrthoLH(
  left: number, right: number,
  bottom: number, top: number,
  near: number, far: number
): Mat4;

/**
 * Create a left-handed perspective projection matrix from vertical FOV.
 */
export function mat4PerspectiveFovLH(
  fovY: number,
  aspect: number,
  near: number,
  far: number
): Mat4;

/** Subtract two Vec3 vectors: a - b */
export function vec3Subtract(a: Vec3, b: Vec3): Vec3;
```

### Type Consolidation Decision

**Option A:** Move `Mat4` type from `UniformBlock.ts` → `MatrixMath.ts`, re-export from UniformBlock  
**Option B:** Keep `Mat4` in `UniformBlock.ts`, import into `MatrixMath.ts`  
**Option C:** Create `src/types/math.ts` as single source for `Vec3`, `Mat4`

**Recommendation:** Option A — `MatrixMath.ts` is the natural home for matrix types. UniformBlock re-exports to avoid breaking existing imports.

---

## Implementation Plan

### Step 1: Create MatrixMath.ts (new file)

```bash
# File: potfoundry-web/src/MatrixMath.ts
```

1. Add JSDoc module header
2. Import `Vec3`, `CameraBasis` from `camera_basis.ts`
3. Define `Mat4` type (move from UniformBlock.ts)
4. Copy the 5 pure functions from webgpu_core.ts
5. Add `vec3Subtract` (copy from webgpu_core.ts)
6. Export all functions and the Mat4 type

### Step 2: Update webgpu_core.ts

1. Add import: `import { viewMatrixFromBasis, mat4Multiply, matrixIsFinite, mat4OrthoLH, mat4PerspectiveFovLH, vec3Subtract, Mat4 } from './MatrixMath';`
2. Remove local function definitions (L427-514)
3. Remove local `vec3Subtract` definition (L399)
4. Verify `buildCameraRig` still compiles correctly

### Step 3: Update UniformBlock.ts

1. Remove `Mat4` type definition
2. Add: `export type { Mat4 } from './MatrixMath';`

### Step 4: Add Unit Tests

```bash
# File: potfoundry-web/src/MatrixMath.test.ts
```

Test cases:
- `viewMatrixFromBasis` produces identity-like matrix for canonical basis at origin
- `mat4Multiply` with identity matrix returns original
- `matrixIsFinite` returns false for NaN/Infinity
- `mat4OrthoLH` produces expected projection for known inputs
- `mat4PerspectiveFovLH` produces expected values for 90° FOV, 1:1 aspect

### Step 5: Validate

```bash
cd potfoundry-web
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint — must be 0 warnings
npm test            # Vitest unit tests
```

---

## Dependency Analysis

### What MatrixMath.ts Needs

| Dependency | Source | Type |
|------------|--------|------|
| `Vec3` | `camera_basis.ts` | Type import |
| `CameraBasis` | `camera_basis.ts` | Type import |
| `vec3Dot` | `camera_basis.ts` | Function import (for viewMatrixFromBasis) |

### What Uses MatrixMath.ts (after extraction)

| Consumer | Import Needed |
|----------|---------------|
| `webgpu_core.ts` | All 5 functions + `Mat4` type |
| `UniformBlock.ts` | `Mat4` type (re-export) |

### Circular Dependency Risk: NONE

`MatrixMath.ts` → imports from → `camera_basis.ts`  
`webgpu_core.ts` → imports from → `MatrixMath.ts`  
No cycle.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Line numbers shifted | HIGH | Search by function name, not line number |
| Breaking existing Mat4 imports | LOW | Re-export from UniformBlock.ts |
| buildCameraRig regression | LOW | Functions are pure; no behavior change |
| Test coverage gap | LOW | Add unit tests for all extracted functions |

**Overall Risk: LOW**

---

## Open Questions (For Verifier)

1. **vec3Subtract placement**: Should it go in `MatrixMath.ts` or be added to `camera_basis.ts` alongside other vec3 operations?

2. **Mat4 type home**: UniformBlock.ts already defines `Mat4`. Should MatrixMath.ts own it, or should we create a shared `types/math.ts`?

3. **vec3Dot import**: `viewMatrixFromBasis` uses `vec3Dot`. Should MatrixMath.ts re-export it, or should consumers import from camera_basis directly?

4. **Future extraction path**: After MatrixMath extraction, does buildCameraRig become LOW risk for Phase 6, or are there other blockers?

5. **Test strategy**: Should MatrixMath.test.ts use property-based testing (e.g., fast-check) for matrix math, or are deterministic test vectors sufficient?

---

## Recommended Next Steps

**If Verifier ACCEPTS:**
1. Executioner implements MatrixMath.ts per this spec
2. Run full validation suite
3. Update agents_journal.md with Phase 5 completion

**If Verifier REJECTS:**
1. Generator addresses critique in Round 5.1
2. Consider alternative candidates if fundamental issues found

---

## Summary

| Metric | Value |
|--------|-------|
| **Primary target** | Matrix math utilities (5 pure functions) |
| **Estimated LOC reduction** | ~88-130 |
| **Risk level** | LOW |
| **Test coverage** | Fully unit-testable |
| **Blocking dependencies** | None |
| **Recommended** | ✅ YES — cleanest available extraction |

---

## Alternative Implementation: Extend camera_helpers.ts

Instead of creating a new `MatrixMath.ts` module, consider extending `camera_helpers.ts`:

**Pros:**
- `camera_helpers.ts` already exists (~100 LOC) with `invertMat4`, `worldRayFromCanvas`, `intersectRayZPlane`
- Namespace "camera_helpers" — matrices ARE camera math
- Import pattern already established in webgpu_core.ts
- Avoids new module proliferation

**Cons:**
- camera_helpers.ts would grow from ~100 to ~230 lines
- Mixes projection math with ray intersection code

**Verdict:** Either approach is valid. Generator slightly prefers `MatrixMath.ts` for cleaner separation, but Verifier may prefer consolidation.

---

## Future Phase Roadmap

After Phase 5 (Matrix Math), the next logical targets by risk:

| Phase | Target | LOC | Risk | Unblocks |
|-------|--------|-----|------|----------|
| 6 | UI Button Handlers | 250 | Medium | None |
| 7 | Resize Handler | 200 | Medium | None |
| 8 | buildCameraRig | 220 | Medium (reduced) | Matrix math extracted |
| 9+ | applyCameraPayload | 200+ | High | Requires controller refactor |

**End state goal:** webgpu_core.ts < 3,500 lines with clear separation of concerns.
