# Generator Round 1 — webgpu_core.ts `as any` Elimination

Date: 2026-03-09

## Problem Statement

`webgpu_core.ts` contains **66 occurrences** (on ~54 logical lines) of `as any` casts. These undermine TypeScript's type safety guarantees, mask potential bugs, and make the file harder to maintain. As groundwork for the III-1 decomposition effort, eliminating these casts will:

1. Catch type errors at compile time
2. Improve IDE autocompletion and refactoring support
3. Make the codebase more approachable for new contributors
4. Reduce the surface area for silent runtime failures

## Root Cause Analysis

The casts fall into **6 distinct categories**, each with different root causes:

| Category | Count | Root Cause |
|----------|-------|------------|
| A. Window/GlobalThis Debug Stashing | ~22 | Missing global type augmentation for `__pf_*` debug hooks |
| B. Config/InitialParams Typing | ~14 | Loosely typed `Record<string, unknown>` lacks known fields |
| C. WebGPU API Type Gaps | ~6 | Type definitions incomplete for optional properties |
| D. Function Signature Mismatches | ~10 | Functions typed to accept `Ray` but called with narrower types |
| E. State Field Access | ~6 | Debug fields missing from `WebGPUState` interface |
| F. Vendor Prefixes / Browser APIs | ~4 | Safari `webkitFullscreenElement`, error message extraction |
| G. CameraConstants Destructuring | ~2 | Module export type mismatch |

---

## Proposals

### Proposal 1: Global Type Augmentation for Debug Hooks (Category A)

**Idea**: Define a `declare global` block that types all `__pf_*` window properties.

**Mechanism**: Create or extend `src/webgpu_global.d.ts` with proper interface declarations.

**Mathematical basis**: N/A (purely type-level)

**Files affected**: 
- New file: `src/webgpu_global.d.ts`
- Modified: `src/webgpu_core.ts` (remove `as any` casts)

**Complete type augmentation block**:

```typescript
// src/webgpu_global.d.ts
/**
 * Global type augmentations for PotFoundry debug hooks.
 * These properties are attached to window/globalThis for external tooling
 * and test introspection.
 */

import type { CameraController } from './camera_controller';
import type { WebGPUParams } from './types';

/** Debug metrics tracked per mount */
interface PfMountDebugMetrics {
  uniformWrites: number;
  rigRebuilds: number;
  styleParamWrites: number;
  colorWrites: number;
}

/** Per-mount debug state */
interface PfMountDebug {
  ready: boolean;
  usedFallback: boolean;
  lastApplyCameraPayload: { fields: string[]; timestamp: number } | null;
  lastSceneRadiusUpdate: { prev: number; next: number; timestamp: number } | null;
  lastPayloadIsFullState: boolean;
  metrics: PfMountDebugMetrics;
}

/** Per-canvas mount registry entry */
interface PfWebGPUMount {
  debug?: PfMountDebug;
}

/** Logging/telemetry manager interface (minimal stub) */
interface PfManager {
  setFrameCounters?: (counters: { frames: number; draws: number; verts: number }) => void;
  // Add other manager methods as needed
}

declare global {
  interface Window {
    /** PotFoundry telemetry manager */
    __pf_manager?: PfManager;
    /** Per-canvas WebGPU mount registry for debug introspection */
    __pf_webgpu_mounts?: Record<string, PfWebGPUMount | undefined>;
    /** Shared camera controller for embedded previews */
    __pf_webgpu_camera_controller?: CameraController;
    /** Uniform signature tracking for dirty detection */
    __lastUniformSignature?: string | null;
    /** Throttle timestamp for uniform emission */
    __lastUniformEmitMs?: number;
  }

  // Mirror on globalThis for non-window contexts
  // eslint-disable-next-line no-var
  var __pf_manager: PfManager | undefined;
  // eslint-disable-next-line no-var
  var __pf_webgpu_mounts: Record<string, PfWebGPUMount | undefined> | undefined;
  // eslint-disable-next-line no-var
  var __pf_webgpu_camera_controller: CameraController | undefined;
  // eslint-disable-next-line no-var
  var __lastUniformSignature: string | null | undefined;
  // eslint-disable-next-line no-var
  var __lastUniformEmitMs: number | undefined;
}

export {};
```

**Lines to fix (22 occurrences)**:
- L77: `const root = window as any;` → `const root = window;` (after augmentation)
- L937: `(window as any).__pf_manager = manager;` → `window.__pf_manager = manager;`
- L948: `(window as any).__pf_webgpu_mounts` (×2) → `window.__pf_webgpu_mounts`
- L950: `(window as any).__pf_webgpu_mounts` (×2) → `window.__pf_webgpu_mounts`
- L951: `(window as any).__pf_webgpu_mounts` (×2) → `window.__pf_webgpu_mounts`
- L2320: `(window as any).__pf_webgpu_mounts` (×2) → `window.__pf_webgpu_mounts`
- L2394: Commented out line - can remove or update
- L2532: `(window as any).__pf_webgpu_mounts` (×2) → `window.__pf_webgpu_mounts`
- L2616-2617: `(window as any).__pf_webgpu_camera_controller` → `window.__pf_webgpu_camera_controller`
- L2986, L3006: `(window as any).__pf_webgpu_mounts` → `window.__pf_webgpu_mounts`
- L4367-4368, L4373, L4382, L4384: `(globalThis as any).__lastUniform*` → `globalThis.__lastUniform*`
- L5078: `(globalThis as any)` → `globalThis`

**Risk assessment**: **None** — purely additive type declarations, no runtime changes

**Trade-offs**: 
- Adds a new .d.ts file to maintain
- Must keep in sync with actual debug hook usage

**Assumptions** (for Verifier to attack):
1. The `manager` object conforms to `PfManager` interface (or we define it minimally)
2. All debug hooks are optional (using `?` suffix)
3. The global augmentation won't conflict with existing `camera_controller.ts:L69-83` augmentation

---

### Proposal 2: Config/InitialParams Interface Extension (Category B)

**Idea**: Define an extended interface for the config object that includes known optional fields.

**Mechanism**: Create `MountInitialParams` interface that extends the existing `Record<string, unknown>` pattern but adds typed known fields.

**Files affected**:
- `src/types.ts` (add interface)
- `src/webgpu_core.ts` (use typed interface)

**Interface definition**:

```typescript
// In src/types.ts
/**
 * Extended mount parameters with known fields typed.
 * Allows pass-through of unknown fields while providing type safety
 * for recognized configuration options.
 */
export interface MountInitialParams extends Record<string, unknown> {
  /** Style ID or name (number or string) */
  style?: number | string;
  /** Style ID (numeric) */
  styleId?: number;
  /** Host camera acceptance policy */
  hostCameraAcceptPolicy?: 'always' | 'grace' | 'strict';
  /** Local camera grace period in ms */
  localCameraGraceMs?: number;
  /** @deprecated Alias for localCameraGraceMs */
  hostCameraGraceMs?: number;
  /** Background gradient override */
  __pf_bg_gradient?: GradientColor[] | null;
  /** Background mode override */
  __pf_bg_mode?: string;
}
```

**Lines to fix (14 occurrences)**:
- L2188-2189: `(initialParams as any).style` → `initialParams.style` (after typing initialParams)
- L2601: `(initialParams as any)?.hostCameraAcceptPolicy` → `initialParams?.hostCameraAcceptPolicy`
- L2605: `(initialParams as any)?.localCameraGraceMs` (×2) → `initialParams?.localCameraGraceMs`
- L3883-3888: `(cfg as any).style` (×8) → `(cfg as MountInitialParams).style` or helper function
- L3893-3894: `(cfg as any).style` (×2) → typed cfg
- L4413: `(cfg as any).__pf_bg_gradient` → `(cfg as MountInitialParams).__pf_bg_gradient`

**Risk assessment**: **Low** — interface extension is additive, preserves `[key: string]: unknown` for unrecognized fields

**Trade-offs**:
- May need to cast `cfg` at function boundaries
- Interface may grow as more fields are discovered

**Assumptions** (for Verifier to attack):
1. All known config fields are optional
2. `style` can be either a number or a string (style name from registry)
3. The `__pf_*` prefixed fields are internal and won't collide with user-provided config

---

### Proposal 3: WebGPU API Type Corrections (Category C)

**Idea**: Properly type the `GPURenderPassDescriptor` to include the optional `depthStencilAttachment`.

**Mechanism**: The WebGPU type definitions in `@webgpu/types` already include `depthStencilAttachment` as optional on `GPURenderPassDescriptor`. The issue is we're casting the entire descriptor, then adding the property. Instead, we should construct the object correctly.

**Current problematic pattern**:
```typescript
const renderPassDesc: GPURenderPassDescriptor = { ... } as GPURenderPassDescriptor;
if (depthView) {
  (renderPassDesc as any).depthStencilAttachment = { ... };
}
```

**Proposed fix**:
```typescript
const renderPassDesc: GPURenderPassDescriptor = {
  label: 'component:main-pass',
  colorAttachments: [ ... ],
  ...(depthView ? {
    depthStencilAttachment: {
      view: depthView,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    }
  } : {})
};
```

**Lines to fix (3 occurrences)**:
- L4490: `(magentaPassDesc as any).depthStencilAttachment = { ... }`
- L4520: `(renderPassDesc as any).depthStencilAttachment = { ... }`
- L2455: `(wireframePipeline as any).getBindGroupLayout(0)` — This is valid; `GPURenderPipeline.getBindGroupLayout` exists. The cast may be due to `wireframePipeline` being typed as `GPURenderPipeline | null`. Fix: use non-null assertion or guard.

**For L4560**: `(pipeline as any)?.label` — `GPURenderPipeline` does have an optional `label` property. May need to check if it's typed correctly in ambient types.

**For L2142**: `device as any` — The `createShaderModule` function in `WebGpuCapture.ts` takes `GPUDevice`. If `device` is already typed as `GPUDevice`, the cast is unnecessary. Investigation needed.

**Risk assessment**: **Low** — restructuring object construction is semantically equivalent

**Trade-offs**:
- Spread operator may have marginal perf impact (negligible)
- Requires verifying spread works correctly with GPURenderPassDescriptor

**Assumptions** (for Verifier to attack):
1. Spreading `{}` into `GPURenderPassDescriptor` is type-safe
2. `depthStencilAttachment` is indeed optional in the type definitions
3. The conditional spread pattern doesn't break any downstream code

---

### Proposal 4: Function Signature Alignment (Category D)

**Idea**: The `ControllerHelpers` interface already defines `intersectRayZPlane` and `intersectRayCylinder` with proper `Ray` type signatures. The casts exist because the inline lambda wrappers use `any`.

**Current problematic pattern**:
```typescript
const controllerHelpers: ControllerHelpers = {
  intersectRayZPlane: (ray: any, z: number) => intersectRayZPlane(ray as any, z),
  intersectRayCylinder: (ray: any, radius: number, minZ: number, maxZ: number) => intersectRayCylinder(ray as any, radius, minZ, maxZ),
  // ...
};
```

**Proposed fix**:
```typescript
import type { Ray } from './camera_helpers';
// or from './types' where Ray is also defined

const controllerHelpers: ControllerHelpers = {
  intersectRayZPlane: (ray: Ray, z: number) => intersectRayZPlane(ray, z),
  intersectRayCylinder: (ray: Ray, radius: number, minZ: number, maxZ: number) => intersectRayCylinder(ray, radius, minZ, maxZ),
  // ...
};
```

**For `mulMat4Vec4` casts (L2668-2669, L2722-2723)**:
The function is defined at L506 with signature:
```typescript
const mulMat4Vec4 = (m: Mat4, x: number, y: number, z: number) => { ... }
```

The casts `(mulMat4Vec4 as any)(...)` are redundant — the function is called with valid arguments. These may be artifacts from a past refactor. Simply remove the casts:

```typescript
// Before:
const pA = (mulMat4Vec4 as any)(rig.viewProjection, state.pivot?.[0] ?? 0, ...);
// After:
const pA = mulMat4Vec4(rig.viewProjection, state.pivot?.[0] ?? 0, ...);
```

**For L2763-2764** (`ray as any` in pivot update):
The `ray` comes from `worldRayFromCanvas` which returns `Ray | null`. After the null check, it should be safe to use without cast.

**Lines to fix (10 occurrences)**:
- L2571-2572: Fix lambda parameter types
- L2668-2669: Remove `(mulMat4Vec4 as any)` wrapper
- L2722-2723: Remove `(mulMat4Vec4 as any)` wrapper  
- L2763-2764: Remove `ray as any` after null guard

**Risk assessment**: **None** — removing unnecessary casts, types already correct

**Trade-offs**: None

**Assumptions** (for Verifier to attack):
1. `Ray` type from `camera_helpers.ts` is compatible with `Ray` in `types.ts`
2. The `mulMat4Vec4` calls have correct argument types without the cast
3. `worldRayFromCanvas` return type is properly narrowed after null check

---

### Proposal 5: WebGPUState Interface Extension (Category E)

**Idea**: Add the debug/display fields that are accessed but not declared in `WebGPUState`.

**Analysis of accessed fields**:
- L2752: `state.recentBasisCommit` — **Already declared** at types.ts:118
- L2999: `state as any` for `sharedCameraPayloadDiffers` — Function signature issue
- L3224-3227: `state.recentInertia` — **Already declared** at types.ts:120
- L5360: `state.displayRotZ` — **Already declared** at types.ts:93

**Finding**: All these fields ARE declared in `WebGPUState`! The casts may exist because:
1. The functions accept a looser type
2. Historical artifact from before the fields were added

**For L2752**:
```typescript
state.recentBasisCommit = { right: [...committedBasis.right], up: [...committedBasis.up], forward: [...committedBasis.forward] } as any;
```
The cast is because `recentBasisCommit` is typed as `{ right: Vec3; up: Vec3; forward: Vec3 }` but the spread creates a new array. This is actually type-safe — remove the cast.

**For L2999**:
```typescript
const differs = sharedCameraPayloadDiffers(state as any, payload as any);
```
Check the function signature in `camera_basis.ts`. If it accepts `WebGPUState`, remove casts.

**Lines to fix (5 occurrences)**:
- L2752: Remove `as any` (array spread creates compatible type)
- L2999 (×2): Verify `sharedCameraPayloadDiffers` signature and remove casts
- L3224, L3227: Already typed, verify TypeScript doesn't complain without cast
- L5360: Already typed, remove cast

**Risk assessment**: **None** — fields already declared, just removing unnecessary casts

**Assumptions** (for Verifier to attack):
1. `Vec3` is a tuple type that accepts array spread assignment
2. `sharedCameraPayloadDiffers` is typed to accept `WebGPUState`

---

### Proposal 6: Browser API / Vendor Prefix Handling (Category F)

**Idea**: Use proper type guards and DOM type augmentation for vendor-prefixed APIs.

**For L1741 (`webkitFullscreenElement`)**:
```typescript
const isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
```

**Proposed fix**: Add type augmentation for Safari's prefixed API:
```typescript
// In webgpu_global.d.ts
interface Document {
  /** Safari-prefixed fullscreen element */
  webkitFullscreenElement?: Element | null;
}
```

Then remove cast:
```typescript
const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
```

**For L4787** (`error.message`):
```typescript
const detail = typeof error === 'string' ? error : (error as any)?.message ?? 'validation error';
```

**Proposed fix**: Use type guard or `instanceof`:
```typescript
const detail = typeof error === 'string' 
  ? error 
  : error instanceof Error 
    ? error.message 
    : 'validation error';
```

**For L4890** (setHostCameraAcceptPolicy):
```typescript
cameraController.setHostCameraAcceptPolicy(next as any);
```
The `next` variable is computed as `'always' | 'strict' | 'grace'` — exactly the type the method accepts. Remove the cast.

**Lines to fix (4 occurrences)**:
- L1741: Add DOM augmentation, remove cast
- L4787: Use `instanceof Error` check
- L4890: Remove unnecessary cast (type already matches)
- L5078: `(globalThis as any)` → covered in Proposal 1

**Risk assessment**: **Low** — DOM augmentation is standard practice

**Assumptions** (for Verifier to attack):
1. Safari's `webkitFullscreenElement` is always either `Element` or `null/undefined`
2. `GPUError` has a `message` property (need to verify WebGPU types)

---

### Proposal 7: CameraConstants Destructuring Fix (Category G)

**Idea**: The destructuring at L138 casts `CameraConstants` to `any` because not all destructured names are exported.

**Current code**:
```typescript
const {
  DEFAULT_INTERACTIVE_LOD,
  // ... 25+ constants
} = CameraConstants as any;
```

**Root cause**: `CameraConstants` exports both named exports AND a default object. The destructuring may be picking up constants that aren't in the default export.

**Analysis of `camera_constants.ts`**:
- All constants ARE exported both as named exports and in the default object
- The `as any` may be because TypeScript can't infer the default export's type perfectly

**Proposed fix Option A**: Import named exports directly:
```typescript
import {
  DEFAULT_INTERACTIVE_LOD,
  MIN_INTERACTIVE_LOD,
  // ...all the others
} from './camera_constants';
```

**Proposed fix Option B**: Type the default export properly in `camera_constants.ts`:
```typescript
export default {
  DEFAULT_INTERACTIVE_LOD,
  // ...
} as const;
```

**Recommended**: **Option A** (named imports) — cleaner and tree-shakeable.

**Lines to fix (2 occurrences)**:
- L138 in `webgpu_core.ts`
- L10 in `webgpu_geometry.ts` (same pattern)

**Risk assessment**: **None** — switching to named imports is equivalent

**Assumptions** (for Verifier to attack):
1. All constants used in the destructuring are exported from `camera_constants.ts`
2. Named imports won't break any circular dependency

---

### Proposal 8: PointerState Mode Type (Correct Workaround)

**Idea**: At L2478, there's `mode: 'orbit' as any` in the `pointer` object initialization.

**Analysis**:
```typescript
const pointer: PointerState = {
  active: false,
  mode: 'orbit' as any,  // <-- this cast
  // ...
};
```

Looking at `PointerState` in `camera_controller.ts:L85`:
```typescript
export type PointerState = {
  mode: PointerMode;  // 'orbit' | 'pan' | 'dolly'
  // ...
};
```

`'orbit'` IS a valid `PointerMode`. The cast is unnecessary — likely a historical artifact.

**Proposed fix**: Remove the cast:
```typescript
mode: 'orbit',
```

**Risk assessment**: **None**

---

## Recommended Implementation Order

### Phase 1: Zero-Risk Removals (Est. 30 min)
Remove casts that are provably unnecessary:
1. L2478: `mode: 'orbit' as any` → `mode: 'orbit'`
2. L2752: Remove `as any` from recentBasisCommit assignment
3. L2668-2669, L2722-2723: Remove `(mulMat4Vec4 as any)` wrappers
4. L4890: Remove `next as any` cast
5. L5360: Remove `(state as any).displayRotZ` → `state.displayRotZ`

**Verification**: `npm run typecheck && npm test`

### Phase 2: Global Type Augmentation (Est. 1 hr)
1. Create `src/webgpu_global.d.ts` with complete augmentation block
2. Add DOM augmentation for `webkitFullscreenElement`
3. Remove ~22 window/globalThis casts across the file

**Verification**: `npm run typecheck && npm test`

### Phase 3: Config Interface Extension (Est. 45 min)
1. Add `MountInitialParams` interface to `types.ts`
2. Update function signatures to use typed interface
3. Remove ~14 config-related casts

**Verification**: `npm run typecheck && npm test`

### Phase 4: Function Signature Alignment (Est. 30 min)
1. Fix `ControllerHelpers` inline lambda types
2. Ensure `Ray` type imports are correct
3. Remove ~6 function signature casts

**Verification**: `npm run typecheck && npm test`

### Phase 5: WebGPU API Restructuring (Est. 45 min)
1. Refactor `GPURenderPassDescriptor` construction to use spread
2. Verify `getBindGroupLayout` typing
3. Remove ~4 WebGPU API casts

**Verification**: `npm run typecheck && npm test`

### Phase 6: CameraConstants Import Cleanup (Est. 15 min)
1. Switch to named imports in `webgpu_core.ts` and `webgpu_geometry.ts`
2. Remove `as any` from destructuring

**Verification**: `npm run typecheck && npm test`

---

## Total Effort Estimate

| Phase | Time | Casts Removed |
|-------|------|---------------|
| 1 | 30 min | ~8 |
| 2 | 60 min | ~22 |
| 3 | 45 min | ~14 |
| 4 | 30 min | ~10 |
| 5 | 45 min | ~6 |
| 6 | 15 min | ~2 |
| **Total** | **~4 hours** | **~62** |

Note: Some casts on the same line count multiple times in the grep output.

---

## Casts That MAY Need to Remain (Require Investigation)

1. **L2142**: `device as any` in `createShaderModule` call
   - Investigate if `WebGpuCapture.createShaderModule` signature matches
   - If signature is correct, remove cast
   
2. **L2999**: `sharedCameraPayloadDiffers(state as any, payload as any)`
   - Investigate function signature in `camera_basis.ts`
   - May need interface widening if function accepts partial state

3. **L4560**: `(pipeline as any)?.label`
   - Verify `GPURenderPipeline.label` is in type definitions
   - If missing, add module augmentation for WebGPU types

---

## Open Questions for Verifier

1. **Q1**: The `camera_controller.ts` already has a global augmentation block (L69-83). Should we consolidate both into a single `webgpu_global.d.ts`, or keep them separate? Risk of duplication/conflict?

2. **Q2**: The `MountInitialParams` interface uses `extends Record<string, unknown>`. Is this the correct pattern, or should we use a mapped type or intersection instead?

3. **Q3**: For the `GPURenderPassDescriptor` restructuring (Proposal 3), does TypeScript's excess property checking interact badly with the spread pattern? Could this cause silent failures?

4. **Q4**: L2142 casts `device as any` before passing to `createShaderModule`. The function signature accepts `GPUDevice`. Is this cast protecting against a stale/lost device reference, or is it purely a type workaround?

5. **Q5**: Are there any casts I've missed that exist in the file but weren't captured by the grep search (e.g., inside template strings or multi-line constructs)?

6. **Q6**: The `Vec3` type is defined in multiple places (`types.ts`, `camera_basis.ts`, `camera_helpers.ts`). Are these all structurally equivalent? Could type aliasing cause issues during the refactor?

---

## Addendum: Parameter Type Annotations (`: any`)

In addition to the `as any` casts, there are **11 occurrences** of `: any` parameter annotations that should also be addressed:

### ControllerHelpers Lambda Parameters (L2571-2585)

```typescript
// Current:
multiplyQuaternions: (a: any, b: any) => multiplyQuaternions(a, b),
invertQuaternion: (q: any) => invertQuaternion(q),
axisAngleFromQuaternion: (q: any) => axisAngleFromQuaternion(q),
basisFromQuaternion: (q: any) => basisFromQuaternion(q),
cameraAxisToWorld: (basis: any, axis: Vec3) => cbCameraAxisToWorld(basis, axis),
syncAnglesFromBasis: (basis: any) => cbSyncAnglesFromBasis(basis),
```

**Fix**: Import proper types and use them:
```typescript
import type { Quaternion, CameraBasis } from './camera_basis';

multiplyQuaternions: (a: Quaternion, b: Quaternion) => multiplyQuaternions(a, b),
invertQuaternion: (q: Quaternion) => invertQuaternion(q),
axisAngleFromQuaternion: (q: Quaternion) => axisAngleFromQuaternion(q),
basisFromQuaternion: (q: Quaternion) => basisFromQuaternion(q),
cameraAxisToWorld: (basis: CameraBasis, axis: Vec3) => cbCameraAxisToWorld(basis, axis),
syncAnglesFromBasis: (basis: CameraBasis) => cbSyncAnglesFromBasis(basis),
```

### startFocusTween Return Type (L2803)

```typescript
// Current:
function startFocusTween(...): any | void {
```

**Fix**: Define proper return type or use `void`:
```typescript
function startFocusTween(...): void {
```

### L5078 Variable Annotation

```typescript
// Current:
const root: any = typeof window !== 'undefined' ? window : (globalThis as any);
```

**Fix**: After global augmentation, use `Window | typeof globalThis`:
```typescript
const root = typeof window !== 'undefined' ? window : globalThis;
```

These 11 additional fixes can be included in **Phase 4** (Function Signature Alignment).

---

## Sign-off

This proposal addresses all 66 `as any` casts + 11 `: any` parameter annotations in `webgpu_core.ts`. The fixes are organized into 6 phases that can be implemented and tested independently. No runtime behavior changes are proposed — all fixes are at the type level.

**To the Verifier**: Please attack the assumptions listed under each proposal. Pay particular attention to Q3 (spread pattern) and Q6 (Vec3 type equivalence) as these could cause subtle issues.

**To the Executioner**: If this proposal converges, implement in the phase order specified. Run `npm run typecheck && npm test` after each phase before proceeding.
