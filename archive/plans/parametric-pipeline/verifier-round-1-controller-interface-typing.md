# Verifier Round 1 — Critique of Generator Phase 4: Controller Interface Typing

**Date**: 2026-03-10  
**Verifier**: Claude Opus 4.5  
**Generator Proposal**: `generator-round-4-controller-interface-typing.md`

---

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's proposal is fundamentally sound. All 11 controller methods match the implementation. All 4 event types cover the actual `postToHost` call sites. The `CameraSnapshot` interface matches `buildCameraSnapshot()` exactly. However, three minor amendments are required for full acceptance.

---

## Evidence-Based Verification

### V1: Controller Methods — VERIFIED ✓

**Location**: [webgpu_core.ts](../../../src/webgpu_core.ts#L5097-L5157)

| Method | Proposal Signature | Actual Implementation (L5097-5157) | Match |
|--------|-------------------|-----------------------------------|-------|
| `updateParams` | `(payload?: WebGPUParams \| null): void` | L5100: `(payload?: WebGPUParams \| null)` | ✓ |
| `handleCameraCommand` | `(payload: unknown): void` | L5111: `(payload: unknown)` | ✓ |
| `setAutoRotate` | `(value: boolean): void` | L5114: `(value: boolean)` | ✓ |
| `toggleAutoRotate` | `(): void` | L5117 | ✓ |
| `getAutoRotate` | `(): boolean` | L5120: returns `state.autoRotate` | ✓ |
| `setAutoPivot` | `(value: boolean): void` | L5121: `(v: boolean)` | ✓ |
| `toggleAutoPivot` | `(): void` | L5122 | ✓ |
| `getAutoPivot` | `(): boolean` | L5123: returns `Boolean(state.autoPivotFromCamera)` | ✓ |
| `dispose` | `(): void` | L5124 | ✓ |
| `setDebugSegments` | `(segments: Float32Array): void` | L5125: `(segments: Float32Array)` | ✓ |
| `setDebugPoints` | `(points: Float32Array): void` | L5140: `(points: Float32Array)` | ✓ |

**Result**: All 11 controller methods verified. Signatures match exactly.

---

### V2: CameraSnapshot Interface — VERIFIED ✓

**Location**: [webgpu_core.ts](../../../src/webgpu_core.ts#L1373-L1388) (`buildCameraSnapshot()`)

```typescript
// Actual implementation at L1373-1388:
const buildCameraSnapshot = (): CameraSnapshot => ({
  rotX: state.rotX,
  rotY: state.rotY,
  zoom: state.zoom,
  panX: state.panX,
  panY: state.panY,
  autoRotate: state.autoRotate,
  sceneRadius: state.sceneRadius,
  projection: state.projectionMode,    // ← maps to 'perspective' | 'ortho'
  cameraMode: state.cameraMode,        // ← CameraMode type
  pivot: [...state.pivot],             // ← Vec3 tuple
  eye: [...(lastCameraRig?.eye ?? ensureFreePosition(state))], // ← Vec3 tuple
});
```

| Field | Proposed Type | Matches |
|-------|---------------|---------|
| `rotX`, `rotY`, `zoom`, `panX`, `panY`, `sceneRadius` | `number` | ✓ |
| `autoRotate` | `boolean` | ✓ |
| `projection` | `'perspective' \| 'ortho'` | ✓ |
| `cameraMode` | `CameraMode` | ✓ |
| `pivot` | `[number, number, number]` | ✓ (see Amendment A1) |
| `eye` | `[number, number, number]` | ✓ (see Amendment A1) |

**Result**: All 12 fields match. Minor typing preference amendment below.

---

### V3: WebGPUEvent Types — VERIFIED ✓

**postToHost Call Sites**:

| Line | Event Type | Payload Fields | Covered by Proposal |
|------|-----------|----------------|---------------------|
| L5013 | `'ready'` | `{ timestamp, canvasId }` | ✓ `WebGPUReadyEvent` |
| L914-922 | `'diagnostic'` | `{ message, detail, timestamp, canvasId }` | ✓ `WebGPUDiagnosticEvent` |
| L972-984 | `'error'` | `{ code, message, detail, fatal, timestamp, canvasId, context }` | ✓ `WebGPUErrorEvent` |
| L1550-1557 | `'cameraState'` | `{ ...snapshot, timestamp, seq }` | ✓ `WebGPUCameraStateEvent` |

**Result**: All 4 postToHost call sites covered. No missing event types.

---

### V4: WebGPUErrorCode — VERIFIED ✓

**Location**: [webgpu_core.ts](../../../src/webgpu_core.ts#L265-L273)

```typescript
// Actual definition at L265-273:
type WebGPUErrorCode =
  | 'webgpu:not-supported'
  | 'webgpu:adapter-unavailable'
  | 'webgpu:context-unavailable'
  | 'webgpu:pipeline-failed'
  | 'webgpu:invalid-vertex-count'
  | 'webgpu:index-overflow'
  | 'component:mount-failed'
  | 'component:mount-rejected';
```

**Result**: Exact match with proposal. No missing codes.

---

## Answers to Generator's Open Questions

### Q1: Should `handleCameraCommand(payload: unknown)` stay as `unknown`?

**Answer: YES — ACCEPT AS IS**

**Evidence**: The implementation at L2949-3055 shows `handleCameraCommand` accepts `raw: unknown` and performs runtime narrowing:
- L2953-2961: Checks for string (JSON parse) vs object
- L2969-3050: Runtime type checks for each field (`typeof payload.preset === 'string'`, etc.)

This is correct defensive typing. The payload originates from external sources (host app, serialized state) and cannot be statically guaranteed. Using `unknown` forces callers to pass through runtime validation, which is exactly what happens.

**Recommendation**: Keep `payload: unknown`. Do NOT narrow to a union type — that would create false type safety without runtime guarantees.

---

### Q2: Should `WebGPUErrorCode` move to types.ts?

**Answer: YES — MOVE IT**

**Rationale**:
1. Currently defined at [webgpu_core.ts L265-273](../../../src/webgpu_core.ts#L265) as a local `type` (not exported)
2. The `WebGPUErrorEvent` interface needs to reference it
3. Consumers of `WebGPUEvent` should be able to type-check error codes

**Implementation**: Export `WebGPUErrorCode` from `types.ts` alongside the other event interfaces.

---

### Q3: Tuple `[number,number,number]` vs `Vec3` for pivot/eye?

**Answer: USE `Vec3` — Not inline tuples**

**Evidence**: `Vec3` is already defined at [geometry/types.ts L27](../../../src/geometry/types.ts#L27):
```typescript
/** 3D vertex coordinates */
export type Vec3 = [number, number, number];
```

**Rationale**:
1. `Vec3` is the canonical type alias throughout the codebase
2. Using inline tuples duplicates the definition
3. If `Vec3` ever changes (unlikely but possible), the interfaces would drift

**Recommendation**: Import `Vec3` from `geometry/types` and use it for `pivot` and `eye` fields.

---

### Q4: Any missing event types?

**Answer: NO — All covered**

**Evidence**: Grep search for `postToHost` in webgpu_core.ts found exactly 4 call sites (L914, L972, L1550, L5013). All 4 event types (`ready`, `diagnostic`, `error`, `cameraState`) are accounted for in the proposal.

---

## Required Amendments

### A1 [NOTE]: Use `Vec3` instead of inline tuples

**Generator's proposal**:
```typescript
pivot: [number, number, number];
eye: [number, number, number];
```

**Required change**:
```typescript
import { Vec3 } from './geometry/types';
// ...
pivot: Vec3;
eye: Vec3;
```

**Impact**: Purely cosmetic typing improvement. No runtime change.

---

### A2 [NOTE]: Add import for `CameraMode` in types.ts

**Issue**: The `CameraSnapshot` interface references `CameraMode`, but the proposal doesn't show where it's imported from.

**Evidence**: `CameraMode` is defined at [types.ts L27](../../../src/types.ts):
```typescript
export type CameraMode = 'arcball' | 'turntable' | 'free';
```

**Required**: Ensure `CameraSnapshot` is placed where `CameraMode` is already in scope (types.ts), or add explicit import if placed elsewhere.

---

### A3 [NOTE]: Clarify `fatal` field default in WebGPUErrorEvent

**Observation**: The proposal shows `fatal` as required (`fatal: boolean`), but the actual emission at L979-980 shows:
```typescript
fatal: error.fatal ?? false,
```

**Impact**: None — the type is correct. The `??` handles the internal `WebGPUError` type, not the emitted event. Just documenting for completeness.

---

## Items That Passed Review

1. ✓ All 11 `WebGPUController` methods match implementation signatures
2. ✓ All 12 `CameraSnapshot` fields match `buildCameraSnapshot()` output
3. ✓ All 4 `WebGPUEvent` discriminated union members cover all `postToHost` calls
4. ✓ `WebGPUErrorCode` union covers all 8 error codes in the codebase
5. ✓ `unknown` for `handleCameraCommand` payload is correct (runtime validation inside)
6. ✓ `canvasId: string | undefined` defensive typing is appropriate

---

## Implementation Conditions (for Executioner)

Given ACCEPT WITH AMENDMENTS, the Executioner should:

1. **In types.ts**:
   - Add `import { Vec3 } from './geometry/types';`
   - Add `WebGPUErrorCode` type (exported)
   - Add `CameraSnapshot` interface using `Vec3` for `pivot`/`eye`
   - Add `WebGPUReadyEvent`, `WebGPUDiagnosticEvent`, `WebGPUErrorEvent`, `WebGPUCameraStateEvent`
   - Replace `export type WebGPUEvent = any;` with discriminated union
   - Replace `export type WebGPUController = any;` with full interface

2. **In types.d.ts**:
   - Mirror the same changes for declaration file consumers

3. **In webgpu_core.ts**:
   - Replace `type CameraSnapshot = any;` at L155 with import from types.ts
   - Optionally consolidate `WebGPUErrorCode` (currently local type at L265) to import from types.ts

4. **Validation**:
   ```bash
   npm run typecheck  # Must pass — interfaces should match existing implementations
   npm run lint       # Must pass — no new warnings
   npm test           # Must pass — no runtime changes expected
   ```

---

## Conclusion

The Generator's proposal demonstrates solid code archaeology. All claims verified against actual source. The three amendments are minor typing preferences that improve consistency but don't change the fundamental correctness of the proposal.

**Verdict**: ACCEPT WITH AMENDMENTS (A1-A3)

The proposal may proceed to the Executioner once the amendments are incorporated.
