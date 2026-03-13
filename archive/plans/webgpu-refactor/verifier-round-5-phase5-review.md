# Verifier Round 5 — Phase 5 Review

Date: 2026-03-10

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's proposal to extract matrix math utilities into `MatrixMath.ts` is fundamentally sound. The functions are pure, have minimal dependencies, and extraction is low-risk. However, there are factual errors and omissions that must be corrected before implementation.

---

## V1: Line Number Verification

### Actual vs Claimed Line Numbers

| Function | Generator Claim | Actual Location | LOC Claimed | LOC Actual | Status |
|----------|-----------------|-----------------|-------------|------------|--------|
| viewMatrixFromBasis | L431-456 | L431-454 | ~26 | ~24 | ⚠️ Minor |
| mat4Multiply | L458-473 | L458-473 | ~16 | ~16 | ✅ |
| matrixIsFinite | L477-484 | L477-484 | ~8 | ~8 | ✅ |
| mat4OrthoLH | L486-504 | L486-502 | ~19 | ~17 | ⚠️ Minor |
| mat4PerspectiveFovLH | L508-522 | L508-522 | ~15 | ~15 | ✅ |
| vec3Subtract | L399 | L399 | 1 | 1 | ✅ |

**Evidence**: [webgpu_core.ts](../src/webgpu_core.ts#L431-L522)

**Verdict**: Line numbers are accurate within ±2 lines. Total LOC ~80, not 84-90 as claimed. Acceptable.

---

## V2: Dependency Analysis

### Function Purity Verification

| Function | Dependencies | Closure Access | State Mutation | Verdict |
|----------|--------------|----------------|----------------|---------|
| viewMatrixFromBasis | `Vec3`, `Mat4`, `CameraBasis`, `vec3Dot` | NONE | NONE | ✅ PURE |
| mat4Multiply | `Mat4` | NONE | NONE | ✅ PURE |
| matrixIsFinite | `Mat4` | NONE | NONE | ✅ PURE |
| mat4OrthoLH | `Mat4` | NONE | NONE | ✅ PURE |
| mat4PerspectiveFovLH | `Mat4` | NONE | NONE | ✅ PURE |

**Evidence**: All functions return new `Float32Array(16)` instances. No references to `state`, `cameraController`, or any other module-level variables.

**ACCEPTED**: All functions are pure and extractable.

### C1 [CRITICAL]: viewMatrixFromBasis Depends on vec3Dot

**Generator's omission**: The proposal lists dependencies as "Vec3, Mat4, CameraBasis types only" but omits that `viewMatrixFromBasis` calls `vec3Dot` at lines 451-453.

**Actual code** ([webgpu_core.ts#L451-453](../src/webgpu_core.ts#L451-L453)):
```typescript
out[12] = -vec3Dot(basis.right, eye);
out[13] = -vec3Dot(basis.up, eye);
out[14] = -vec3Dot(basis.forward, eye);
```

**Impact**: MatrixMath.ts must either:
1. Import `vec3Dot` from `camera_basis.ts` (which already exports it at L30), OR
2. Include a local implementation

**Required fix**: Import `vec3Dot` from `camera_basis.ts`. This is the cleaner approach since camera_basis.ts already exports it.

---

## V3: Mat4 Type Location

### C2 [CRITICAL]: Conflicting Mat4 Definitions

**Generator's claim**: "Mat4 is defined in UniformBlock.ts"

**Reality**: There are TWO definitions:

1. **UniformBlock.ts L17-25** (exported):
```typescript
export type Mat4 =
  | readonly [number, number, number, number, ...]
  | Float32Array;
```

2. **webgpu_core.ts L156** (local):
```typescript
type Mat4 = Float32Array;
```

**Evidence**: [webgpu_core.ts#L156](../src/webgpu_core.ts#L156) vs [UniformBlock.ts#L17-25](../src/UniformBlock.ts#L17-L25)

**Analysis**:
- webgpu_core.ts's local `Mat4` is NARROWER (Float32Array only)
- UniformBlock.ts's exported `Mat4` is BROADER (tuple OR Float32Array)
- All matrix functions in webgpu_core.ts return `Float32Array`, so both types work

**Required fix**: 
1. MatrixMath.ts should import `Mat4` from `UniformBlock.ts` (the broader type)
2. Remove the local `type Mat4 = Float32Array;` from webgpu_core.ts L156
3. webgpu_core.ts imports `Mat4` from MatrixMath.ts (which re-exports from UniformBlock)

---

## V4: Answers to Generator's Open Questions

### Q1: vec3Subtract Placement

**Generator's question**: Should vec3Subtract go to MatrixMath.ts or camera_basis.ts?

**Evidence**:
- camera_basis.ts exports: `vec3Length`, `vec3Normalize`, `vec3Dot`, `vec3Cross`, `vec3Scale`, `vec3Add` (L23-35)
- camera_basis.ts does NOT export: `vec3Subtract`
- camera_helpers.ts L11 has its own `vec3Subtract` (local)
- webgpu_core.ts L399 has its own `vec3Subtract` (local)

**Answer**: `vec3Subtract` should be added to `camera_basis.ts`.

**Rationale**:
1. camera_basis.ts is already the canonical home for vec3 utilities
2. Adding vec3Subtract maintains consistency with vec3Add, vec3Scale, etc.
3. MatrixMath.ts should only contain matrix (4x4) operations
4. Consolidation eliminates duplicates in both webgpu_core.ts and camera_helpers.ts

### Q2: Mat4 Type Home

**Generator's question**: Who owns Mat4 currently? What's the cleanest extraction path?

**Answer**: UniformBlock.ts owns the canonical `Mat4` type. However, the extraction strategy should be:

1. **DO NOT move Mat4** — it belongs in UniformBlock.ts (associated with uniform buffer marshalling)
2. MatrixMath.ts should `import type { Mat4 } from './UniformBlock'`
3. MatrixMath.ts should re-export it: `export type { Mat4 }`
4. Consumers can import from either UniformBlock.ts or MatrixMath.ts

---

## V5: Additional Scrutiny

### C3 [CRITICAL]: Generator's Consumer Analysis is WRONG

**Generator's claim**: "Consumers: buildCameraRig (single call site in webgpu_core)"

**THIS IS FALSE.**

**Actual consumers** (verified via grep):

| Function | buildCameraRig Usage | mount() Usage | Other |
|----------|---------------------|---------------|-------|
| viewMatrixFromBasis | L631, L668, L740, L766, L782 | **L3562** | — |
| mat4Multiply | L632, L669, L741, L767, L783 | **L3563** | — |
| matrixIsFinite | L742 | — | — |
| mat4OrthoLH | L730 | **L3560** | — |
| mat4PerspectiveFovLH | L630, L721 | **L3556** | — |

**Evidence**: [webgpu_core.ts#L3556-3563](../src/webgpu_core.ts#L3556-L3563)

```typescript
// Inside mount(), at L3556-3563:
projection = mat4PerspectiveFovLH(cameraRig.fov, aspect, cameraRig.near, cameraRig.far);
// ...
projection = mat4OrthoLH(-orthoHalfWidth, orthoHalfWidth, ...);
const view = viewMatrixFromBasis(cameraRig.basis, cameraRig.eye);
cameraRig.viewProjection = mat4Multiply(projection, view);
```

**Context**: mount() starts at L830. The usage at L3556-3563 is inside mount()'s `updateAndDraw` section.

**Impact**: None for extraction — these are module-level functions called from within mount(), not closures. Extraction remains safe.

**Required fix**: Generator must correct the consumer documentation in the implementation plan.

### Closure Risk Assessment

**Question**: Are there any functions inside mount() that call these matrix functions (closure risk)?

**Answer**: NO closure risk. The matrix functions are defined at MODULE LEVEL (L431-522), not inside mount(). The calls from within mount() are to module-level functions, which remain accessible after extraction.

### Circular Import Risk Assessment

**Potential chains**:
- MatrixMath.ts → imports from camera_basis.ts (Vec3, CameraBasis, vec3Dot)
- MatrixMath.ts → imports from UniformBlock.ts (Mat4)
- webgpu_core.ts → imports from MatrixMath.ts
- camera_basis.ts → does NOT import from webgpu_core.ts ✅
- UniformBlock.ts → does NOT import from webgpu_core.ts ✅

**Verdict**: NO circular import risk.

---

## Accepted Items

1. ✅ Extraction of `viewMatrixFromBasis`, `mat4Multiply`, `matrixIsFinite`, `mat4OrthoLH`, `mat4PerspectiveFovLH` into MatrixMath.ts
2. ✅ Functions are pure — verified via code inspection
3. ✅ No closure dependencies — all are module-level
4. ✅ No circular import risk
5. ✅ LOC reduction estimate (~80 lines) is reasonable

---

## Required Amendments for ACCEPT

### A1: vec3Dot Import Required
MatrixMath.ts MUST import `vec3Dot` from camera_basis.ts for `viewMatrixFromBasis` to compile.

### A2: vec3Subtract Goes to camera_basis.ts
Move `vec3Subtract` to camera_basis.ts, NOT MatrixMath.ts. This consolidates all vec3 utilities in one place.

### A3: Import Mat4 from UniformBlock
MatrixMath.ts imports and re-exports `Mat4` from UniformBlock.ts. Do NOT duplicate the type definition.

### A4: Update Consumer Documentation
The implementation plan must acknowledge usages inside mount() at L3556-3563, even though this doesn't affect extractability.

### A5: Remove Local Mat4 from webgpu_core.ts
After extraction, delete the local `type Mat4 = Float32Array;` from webgpu_core.ts L156.

---

## Implementation Conditions for Executioner

### Step 1: Add vec3Subtract to camera_basis.ts
```typescript
// In camera_basis.ts, after vec3Scale definition (~L35):
export const vec3Subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
```

### Step 2: Create MatrixMath.ts
```typescript
// src/MatrixMath.ts
import type { Vec3, CameraBasis } from './camera_basis';
import { vec3Dot } from './camera_basis';
export type { Mat4 } from './UniformBlock';
import type { Mat4 } from './UniformBlock';

export const viewMatrixFromBasis = (basis: CameraBasis, eye: Vec3): Mat4 => { ... };
export const mat4Multiply = (a: Mat4, b: Mat4): Mat4 => { ... };
export const matrixIsFinite = (m: Mat4): boolean => { ... };
export const mat4OrthoLH = (...): Mat4 => { ... };
export const mat4PerspectiveFovLH = (...): Mat4 => { ... };
```

### Step 3: Update webgpu_core.ts imports
```typescript
// Remove local definitions
// Add:
import { vec3Subtract } from './camera_basis';
import { viewMatrixFromBasis, mat4Multiply, matrixIsFinite, mat4OrthoLH, mat4PerspectiveFovLH } from './MatrixMath';
import type { Mat4 } from './MatrixMath';
```

### Step 4: Remove from webgpu_core.ts
- Delete `type Mat4 = Float32Array;` (L156)
- Delete `const vec3Subtract = ...` (L399)
- Delete `const viewMatrixFromBasis = ...` (L431-454)
- Delete `const mat4Multiply = ...` (L458-473)
- Delete `const matrixIsFinite = ...` (L477-484)
- Delete `const mat4OrthoLH = ...` (L486-502)
- Delete `const mat4PerspectiveFovLH = ...` (L508-522)

### Validation Protocol
1. `npm run typecheck` — must pass with 0 errors
2. `npm run lint` — must pass with 0 warnings
3. `npm test` — all existing tests must pass
4. Manual verification: Load preview, verify camera controls work in both perspective and orthographic modes

---

## Final Notes for Generator

The core proposal is ACCEPTED. The matrix extraction is a sound, low-risk refactoring that improves testability and code organization. The amendments above are minor corrections that don't change the overall approach.

The critical error was claiming "buildCameraRig is the single consumer" — this was factually incorrect. However, this doesn't affect extractability since the functions are module-level, not closures.

Proceed with implementation after incorporating amendments A1-A5.
