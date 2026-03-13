# Generator Proposal — Phase 6: Vec3 Utilities Consolidation

**Date:** 2026-03-10  
**Author:** Generator Agent  
**Status:** Proposal  

## Summary

Phase 6 consolidates duplicated vec3 utility functions currently scattered across three files (`camera_basis.ts`, `webgpu_core.ts`, `AxisOverlay.ts`) by exporting the canonical implementations from `camera_basis.ts`. This eliminates ~15 LOC of duplication, establishes a single source of truth for vector math, and follows the same decomposition pattern as Phase 5's MatrixMath.ts extraction.

## Problem Statement

The codebase has **THREE separate copies** of vec3 utility functions:

| File | Functions | Status |
|------|-----------|--------|
| `camera_basis.ts` (L24-40) | `vec3Length`, `vec3Normalize`, `vec3Scale`, `vec3Cross`, `vec3Add` | **Internal** (not exported) |
| `webgpu_core.ts` (L399-408) | `vec3Length`, `vec3Normalize`, `vec3Scale` | **Duplicate** |
| `AxisOverlay.ts` (L67-69) | `vec3Length`, `vec3Scale` | **Duplicate** |

This violates DRY and creates maintenance risk—a bug fix in one copy won't propagate to others.

## Target Functions

### 1. `vec3Length` — webgpu_core.ts L399 (1 LOC)
```typescript
const vec3Length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
```
- **Pure function**: ✅ No dependencies
- **Consumers**: 5 call sites in webgpu_core.ts

### 2. `vec3Normalize` — webgpu_core.ts L400-406 (7 LOC)
```typescript
const vec3Normalize = (v: Vec3): Vec3 => {
  const len = vec3Length(v);
  if (!Number.isFinite(len) || len < 1e-8) {
    return [0, 0, 0];
  }
  return [v[0] / len, v[1] / len, v[2] / len];
};
```
- **Pure function**: ✅ Depends only on vec3Length
- **Consumers**: 3 call sites in webgpu_core.ts

### 3. `vec3Scale` — webgpu_core.ts L407 (1 LOC)
```typescript
const vec3Scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
```
- **Pure function**: ✅ No dependencies
- **Consumers**: 10+ call sites in webgpu_core.ts

### Also in AxisOverlay.ts (L67-69):
```typescript
const vec3Length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const vec3Scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
```
- **Consumers**: 2 call sites in AxisOverlay.ts

## Dependency Analysis

### Functions to Export from camera_basis.ts

| Function | Current Status | Dependencies | Already Used By |
|----------|---------------|--------------|-----------------|
| `vec3Length` | Internal | None | Internal use only |
| `vec3Normalize` | Internal | `vec3Length` | Internal use only |
| `vec3Scale` | Internal | None | Internal use only |
| `vec3Cross` | Internal | None | Internal use only |
| `vec3Add` | Internal | None | Internal use only |
| `vec3Dot` | **Exported** | None | webgpu_core.ts (already imports) |
| `vec3Subtract` | **Exported** | None | webgpu_core.ts (already imports) |

### Import Chain After Extraction
```
camera_basis.ts (canonical source)
    ├── exports: vec3Length, vec3Normalize, vec3Scale, vec3Cross, vec3Add
    │                  (+ existing: vec3Dot, vec3Subtract)
    │
    ├─── webgpu_core.ts
    │    └── imports: vec3Length, vec3Normalize, vec3Scale
    │         (adds to existing vec3Dot, vec3Subtract imports)
    │
    └─── AxisOverlay.ts
         └── imports: vec3Length, vec3Scale (new)
```

## Consumer Analysis

### webgpu_core.ts Consumers (remove duplicate definitions, add imports)

**vec3Length** (5 call sites):
- L401: `const len = vec3Length(v);` (inside vec3Normalize — will use imported)
- L3611: `vec3Length(cameraRig.eye)` (diagnostic)
- L2547: `vec3Length(vec3Subtract(target, eye))`

**vec3Normalize** (3 call sites):
- L2457: `vec3Normalize(vec3Subtract(hit, state.freePosition))`
- L2537: `vec3Normalize(basis.forward)`
- As free-standing helper

**vec3Scale** (10+ call sites):
- L577, 578: `vec3Scale(basis.right, -1)`, `vec3Scale(basis.up, -1)`
- L654: `vec3Scale(basis.forward, distance)`
- L676, 677: Basis flipping
- L696: `vec3Scale(fallbackBasis.forward, distance)`
- L1102: Initial eye calculation
- L2289, 2290: Display cam flipping
- L2339, 2340: Committed basis flipping

### AxisOverlay.ts Consumers (remove duplicate definitions, add imports)

**vec3Length** (1 call site):
- L136: `vec3Length(axis)` in `overlayForAxisFromBasis()`

**vec3Scale** (1 call site):
- L138: `vec3Scale(axis, worldScale / axisLen)` in `overlayForAxisFromBasis()`

## Extraction Strategy

### Step 1: Export from camera_basis.ts
Convert internal `const` declarations to `export const`:

```typescript
// camera_basis.ts - Change L24-40
export const vec3Length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
export const vec3Normalize = (v: Vec3): Vec3 => {
  const len = vec3Length(v);
  if (!Number.isFinite(len) || len < 1e-8) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
};
export const vec3Cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const vec3Scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
export const vec3Add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
```

### Step 2: Update webgpu_core.ts Imports (L40-52)

**Before:**
```typescript
import {
  // ...existing imports...
  vec3Dot,
  vec3Subtract,
} from './camera_basis';
```

**After:**
```typescript
import {
  // ...existing imports...
  vec3Dot,
  vec3Subtract,
  vec3Length,
  vec3Normalize,
  vec3Scale,
} from './camera_basis';
```

### Step 3: Remove Duplicates from webgpu_core.ts (L399-408)

**Delete these lines:**
```typescript
const vec3Length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const vec3Normalize = (v: Vec3): Vec3 => {
  const len = vec3Length(v);
  if (!Number.isFinite(len) || len < 1e-8) {
    return [0, 0, 0];
  }
  return [v[0] / len, v[1] / len, v[2] / len];
};
const vec3Scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
```

### Step 4: Update AxisOverlay.ts Imports (L17-18)

**Before:**
```typescript
import type { CameraRig } from './types';
import type { CameraBasis, Vec3 } from './camera_basis';
```

**After:**
```typescript
import type { CameraRig } from './types';
import { type CameraBasis, type Vec3, vec3Length, vec3Scale } from './camera_basis';
```

### Step 5: Remove Duplicates from AxisOverlay.ts (L67-69)

**Delete these lines:**
```typescript
const vec3Length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const vec3Scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
```

## Risk Assessment

### Low Risk ✅

1. **No Semantic Change**: Functions are byte-for-byte identical—same implementation, same edge-case handling (`len < 1e-8`).

2. **Already Proven Pattern**: webgpu_core.ts already imports `vec3Dot` and `vec3Subtract` from camera_basis.ts (L51-52). This extends the same pattern.

3. **No Closure Dependencies**: All target functions are pure—inputs → outputs with no state capture.

4. **Tree-shakeable**: Unused exports won't bloat the bundle.

### Mitigation for Import Cycles

- **No risk**: camera_basis.ts has zero imports from webgpu_core.ts or AxisOverlay.ts. Dependency arrow is strictly one-way.

## Expected Outcome

### Line Count Changes

| File | Before | After | Delta |
|------|--------|-------|-------|
| webgpu_core.ts | 4,736 | 4,727 | **-9** |
| AxisOverlay.ts | ~250 | ~248 | **-2** |
| camera_basis.ts | ~450 | ~450 | **+0** (just add `export`) |

**Net reduction in webgpu_core.ts:** 9 lines

### Benefits

1. **Single Source of Truth**: One canonical implementation per function
2. **Easier Testing**: Vec3 utilities testable via camera_basis.test.ts
3. **Incremental Progress**: Follows Phase 5 pattern, builds foundation for future extractions
4. **Type Safety**: Importing ensures Vec3 type consistency across modules

---

## Alternative Proposal: MathHelpers.ts (More Aggressive)

If the Verifier considers **9 lines too small**, here's a larger extraction:

### Target: New `MathHelpers.ts` Module (~45 LOC)

Extract these pure helper functions from webgpu_core.ts:

| Function | Lines | LOC |
|----------|-------|-----|
| `wrapAngle` | L331-336 | 6 |
| `wrapTau` | L337-343 | 7 |
| `clampZoomValue` | L306-312 | 7 |
| `sanitizePadding` | L394-398 | 5 |
| `sanitizeInt` | L368-373 | 6 |
| `parseClearColor` | L348-358 | 11 |
| `resolveAlphaMode` | L361-364 | 4 |

**Total extraction:** ~46 LOC

### Why This is Riskier

1. **Mixed Concerns**: Angle wrapping vs. color parsing vs. zoom clamping—not cohesive
2. **More Touch Points**: 7 functions = 7 import updates
3. **Lower Reuse Value**: These helpers are specific to webgpu_core.ts

---

## Recommendation

**Proceed with Primary Proposal (Vec3 Consolidation):**

- Clean, focused extraction
- Zero semantic change
- Establishes reusable vector math API
- Proven import pattern (vec3Dot/vec3Subtract already work this way)

The 9-line reduction is modest, but the **deduplication value** and **API consistency** justify this as Phase 6.

---

## Assumptions for Verifier to Attack

1. **A1:** The vec3 implementations in camera_basis.ts and webgpu_core.ts are functionally identical (same epsilon handling).

2. **A2:** No call site depends on the functions being module-local (no shadowing concerns).

3. **A3:** Exporting from camera_basis.ts won't break tree-shaking in the build pipeline.

4. **A4:** The `type` import syntax for `Vec3` and `CameraBasis` in AxisOverlay.ts is compatible with named value imports.

5. **A5:** No circular import risk exists between camera_basis.ts ↔ webgpu_core.ts.

---

*End of Generator Round 6 Proposal*
