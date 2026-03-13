# Generator Proposal — Phase 4 Controller Interface Typing

**Date**: 2026-03-10  
**Generator**: Claude Opus 4.5  
**Status**: Ready for Verifier Review

---

## Executive Summary

Replace the `any`-typed `WebGPUController` and `WebGPUEvent` definitions with proper TypeScript interfaces. This is low-risk typing work—no runtime changes, pure compile-time safety gains. The proposal includes a bonus `CameraSnapshot` interface found during analysis (also typed as `any`).

---

## Root Cause Analysis

**Current state in `types.ts` L41-42:**
```typescript
export type WebGPUController = any;
export type WebGPUEvent = any;
```

**Current state in `types.d.ts` L18-19:**
```typescript
export type WebGPUController = any;
export type WebGPUEvent = any;
```

**Current state in `webgpu_core.ts` L155:**
```typescript
type CameraSnapshot = any;
```

These `any` types eliminate TypeScript's ability to:
1. Catch invalid method calls on the controller
2. Verify event payloads match expected shapes
3. Provide intellisense for consumers

---

## Proposed WebGPUController Interface

Based on the actual implementation at `webgpu_core.ts` L5097-5160:

```typescript
/**
 * Controller returned by mountWebGPU().
 * Provides imperative access to the WebGPU renderer.
 */
export interface WebGPUController {
  /**
   * Update rendering parameters (geometry, style, appearance).
   * @param payload Key-value pairs to merge into current params
   */
  updateParams(payload?: WebGPUParams | null): void;

  /**
   * Handle external camera commands (view presets, mode changes).
   * @param payload Camera command object
   */
  handleCameraCommand(payload: unknown): void;

  /**
   * Set auto-rotate state.
   * @param value true to enable, false to disable
   */
  setAutoRotate(value: boolean): void;

  /** Toggle auto-rotate on/off */
  toggleAutoRotate(): void;

  /** Get current auto-rotate state */
  getAutoRotate(): boolean;

  /**
   * Set auto-pivot state.
   * @param value true to enable, false to disable
   */
  setAutoPivot(value: boolean): void;

  /** Toggle auto-pivot on/off */
  toggleAutoPivot(): void;

  /** Get current auto-pivot state */
  getAutoPivot(): boolean;

  /** Release all GPU resources and stop rendering */
  dispose(): void;

  /**
   * Set debug line segments for visualization.
   * @param segments Float32Array of [x1,y1,x2,y2,...] pairs (2 floats per endpoint)
   */
  setDebugSegments(segments: Float32Array): void;

  /**
   * Set debug points for visualization.
   * @param points Float32Array of [u, t, kind,...] (3 floats per point)
   */
  setDebugPoints(points: Float32Array): void;
}
```

**Assumptions (for Verifier to attack):**
1. The `handleCameraCommand` payload is left as `unknown` because it accepts various command shapes—narrowing would require enumeration of all command types.
2. All methods match the current implementation exactly—no additions or removals.
3. The return type of `mountWebGPU()` changes from `Promise<WebGPUController | null>` to the same signature (interface just becomes concrete).

---

## Proposed CameraSnapshot Interface

Based on `buildCameraSnapshot()` at `webgpu_core.ts` L1373-1388:

```typescript
/**
 * Snapshot of camera state for serialization/comparison.
 */
export interface CameraSnapshot {
  /** Horizontal rotation (radians) */
  rotX: number;
  /** Vertical rotation (radians) */
  rotY: number;
  /** Zoom factor (1.0 = default) */
  zoom: number;
  /** Pan offset X (screen units) */
  panX: number;
  /** Pan offset Y (screen units) */
  panY: number;
  /** Whether auto-rotate is active */
  autoRotate: boolean;
  /** Scene bounding radius */
  sceneRadius: number;
  /** Projection mode */
  projection: 'perspective' | 'ortho';
  /** Camera interaction mode */
  cameraMode: CameraMode;
  /** World-space pivot point [x, y, z] */
  pivot: [number, number, number];
  /** World-space eye position [x, y, z] */
  eye: [number, number, number];
}
```

---

## Proposed WebGPUEvent Type

Based on all `postToHost()` call sites:

```typescript
/**
 * Event types emitted by the WebGPU renderer to the host.
 */
export type WebGPUEvent =
  | WebGPUReadyEvent
  | WebGPUDiagnosticEvent
  | WebGPUErrorEvent
  | WebGPUCameraStateEvent;

/** Emitted when renderer is ready for interaction */
export interface WebGPUReadyEvent {
  type: 'ready';
  payload: {
    timestamp: number;
    canvasId: string | undefined;
  };
}

/** Emitted for debug/diagnostic information */
export interface WebGPUDiagnosticEvent {
  type: 'diagnostic';
  payload: {
    message: string;
    detail?: Record<string, unknown>;
    timestamp: number;
    canvasId: string | undefined;
  };
}

/** Emitted on errors */
export interface WebGPUErrorEvent {
  type: 'error';
  payload: {
    code: WebGPUErrorCode;
    message: string;
    detail?: string;
    fatal: boolean;
    timestamp: number;
    canvasId: string | undefined;
    context: Record<string, unknown>;
  };
}

/** Emitted on camera state changes */
export interface WebGPUCameraStateEvent {
  type: 'cameraState';
  payload: CameraSnapshot & {
    timestamp: number;
    seq: number;
  };
}

/**
 * Error codes for WebGPU failures.
 */
export type WebGPUErrorCode =
  | 'webgpu:not-supported'
  | 'webgpu:adapter-unavailable'
  | 'webgpu:context-unavailable'
  | 'webgpu:pipeline-failed'
  | 'webgpu:invalid-vertex-count'
  | 'webgpu:index-overflow'
  | 'component:mount-failed'
  | 'component:mount-rejected';
```

**Assumptions (for Verifier to attack):**
1. The union covers all event types emitted via `postToHost()`.
2. The `canvasId` can be `undefined` (defensive typing for optional mount param).
3. `WebGPUErrorCode` is duplicated here for exportability—could alternatively be imported from `webgpu_core.ts` (internal).

---

## Implementation Steps

### Step 1: Update `types.ts` (canonical definitions)

Replace L41-42 with the full interface definitions:

```typescript
// === WebGPU Controller Interface ===
export interface WebGPUController {
  updateParams(payload?: WebGPUParams | null): void;
  handleCameraCommand(payload: unknown): void;
  setAutoRotate(value: boolean): void;
  toggleAutoRotate(): void;
  getAutoRotate(): boolean;
  setAutoPivot(value: boolean): void;
  toggleAutoPivot(): void;
  getAutoPivot(): boolean;
  dispose(): void;
  setDebugSegments(segments: Float32Array): void;
  setDebugPoints(points: Float32Array): void;
}

// === Camera Snapshot ===
export interface CameraSnapshot {
  rotX: number;
  rotY: number;
  zoom: number;
  panX: number;
  panY: number;
  autoRotate: boolean;
  sceneRadius: number;
  projection: 'perspective' | 'ortho';
  cameraMode: CameraMode;
  pivot: [number, number, number];
  eye: [number, number, number];
}

// === WebGPU Error Codes ===
export type WebGPUErrorCode =
  | 'webgpu:not-supported'
  | 'webgpu:adapter-unavailable'
  | 'webgpu:context-unavailable'
  | 'webgpu:pipeline-failed'
  | 'webgpu:invalid-vertex-count'
  | 'webgpu:index-overflow'
  | 'component:mount-failed'
  | 'component:mount-rejected';

// === WebGPU Events ===
export interface WebGPUReadyEvent {
  type: 'ready';
  payload: { timestamp: number; canvasId: string | undefined };
}

export interface WebGPUDiagnosticEvent {
  type: 'diagnostic';
  payload: { message: string; detail?: Record<string, unknown>; timestamp: number; canvasId: string | undefined };
}

export interface WebGPUErrorEvent {
  type: 'error';
  payload: {
    code: WebGPUErrorCode;
    message: string;
    detail?: string;
    fatal: boolean;
    timestamp: number;
    canvasId: string | undefined;
    context: Record<string, unknown>;
  };
}

export interface WebGPUCameraStateEvent {
  type: 'cameraState';
  payload: CameraSnapshot & { timestamp: number; seq: number };
}

export type WebGPUEvent =
  | WebGPUReadyEvent
  | WebGPUDiagnosticEvent
  | WebGPUErrorEvent
  | WebGPUCameraStateEvent;
```

### Step 2: Update `types.d.ts` (ambient declarations)

Mirror the interface definitions for external type consumers.

### Step 3: Update `webgpu_core.ts`

1. Remove local `type CameraSnapshot = any;` at L155
2. Import `CameraSnapshot` from `'./types'`
3. Remove local `type WebGPUErrorCode` definition at L264-272 (now exported from types)
4. Verify the existing imports at L56 include new types

### Step 4: Verify Consumers

Run `npm run typecheck` to verify:
- [App.tsx](potfoundry-web/src/App.tsx) — uses `WebGPUController` in ref
- [useRendererBridge.ts](potfoundry-web/src/hooks/useRendererBridge.ts) — imports type
- [factory.ts](potfoundry-web/src/renderers/factory.ts) — wraps controller
- [ControllerContext.tsx](potfoundry-web/src/context/ControllerContext.tsx) — stores ref

### Step 5: Run Full Validation

```bash
npm run typecheck  # Must pass
npm run lint       # Must pass (0 warnings)
npm test           # Must pass
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Interface mismatch with implementation | Low | Medium | Derived directly from L5097-5160 source |
| Consumer breakage | Low | Low | Types are more restrictive than `any`, not less |
| Missing event type | Low | Low | grep_search found all `postToHost` calls |
| CameraSnapshot fields wrong | Very Low | Low | Derived from `buildCameraSnapshot()` L1373 |

**Potential Breaks:**
1. If any consumer passes invalid params to controller methods → **TypeScript error is desired** (catches bugs)
2. If any code accesses non-existent controller properties → **Will fail typecheck** (catch before runtime)

---

## Open Questions (Verifier Scrutiny Invited)

1. **handleCameraCommand payload**: Should we narrow to a discriminated union of command types, or is `unknown` acceptable as a "parse at runtime" boundary?

2. **CameraSnapshot pivot/eye arrays**: Using `[number, number, number]` tuples. Alternative: `Vec3` type. Which is preferable for this public interface?

3. **WebGPUErrorCode location**: Currently duplicated from `webgpu_core.ts`. Should we move it to `types.ts` as single source of truth and import in `webgpu_core.ts`?

4. **Event extensibility**: If future events are added, users relying on exhaustive switch statements will get TypeScript errors. Is this desired (forces updates) or should we add an escape hatch type?

---

## Summary

This is **straightforward typing work** with high confidence of correctness:
- Interfaces derived from actual implementation code
- Events derived from exhaustive grep of `postToHost` calls
- No runtime changes—pure compile-time safety
- Low risk of breaking consumers (any → interface is always safe)

**Recommended for implementation.**
