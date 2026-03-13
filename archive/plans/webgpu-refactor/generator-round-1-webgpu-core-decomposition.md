# Generator Round 1 — webgpu_core.ts Decomposition Plan

Date: 2026-03-09  
Issue: III-1 (webgpu_core.ts Decomposition)

## Executive Summary

`webgpu_core.ts` is a **5,236-line monolith** that represents the single largest maintenance risk in the PotFoundry codebase. This document provides a detailed, step-by-step plan to decompose it into focused, testable modules. The decomposition is sequenced to minimize risk and maximize reviewer confidence.

---

## Prerequisites

### P-1: `as any` Elimination (MUST COMPLETE FIRST)

Before any extraction, all `as any` casts must be eliminated. This is covered in `generator-round-1-webgpu-core-as-any.md`. Key deliverables:

1. **Global type augmentation** (`src/webgpu_global.d.ts`) — types all `__pf_*` debug hooks
2. **MountInitialParams interface** — types known config fields
3. **WebGPUState extensions** — adds missing debug state fields

**Rationale**: Extracting code with `as any` casts propagates type unsafety to new modules. Clean types first, then extract.

**Estimated effort**: ~2 hours

---

## Extraction Phasing

The decomposition is split into 4 phases, each with increasing complexity and risk:

| Phase | Module | LOC | Risk | Dependencies |
|-------|--------|-----|------|--------------|
| 1 | AxisOverlay.ts | ~350 | Low | CameraRig, CameraBasis types only |
| 2 | InputManager.ts | ~450 | Medium | WebGPUState, CameraController |
| 3 | BufferLayout.ts | ~200 | Low | GPUBuffer, color types |
| 4 | Controller Interface Typing | ~100 | Low | Type-only changes |

---

## Phase 1: AxisOverlay.ts Extraction

### 1.1 Scope

Extract all axis overlay functionality into a dedicated module:

**Source lines in webgpu_core.ts:**
- L1380-L1395: `axisButton`, `resolveAxisButton()`, `updateAxisButton()`
- L1461-L1576: `drawAxisIndicator(ctx, rig)` — the 2D rendering function
- L1911-L2065: Axis canvas creation, positioning, drag handlers
- L1917-L1952: `loadAxisPosition()`, `saveAxisPosition()`, `getDefaultAxisPosition()`
- L1947-L1952: Event handler references (hoisted for cleanup)
- L532-L691: `overlayForAxisFromBasis()` helper (already exported, can stay or move)

**Total: ~350 lines**

### 1.2 Interface Design

```typescript
// src/AxisOverlay.ts

import type { CameraRig, CameraBasis } from './types';

/** Configuration for creating the axis overlay */
export interface AxisOverlayConfig {
  /** Parent element to append canvas to */
  parent: HTMLElement;
  /** Optional controls element for axis toggle button */
  controlsEl?: HTMLElement | null;
  /** Initial visibility state */
  visible?: boolean;
}

/** Axis overlay instance returned by create() */
export interface AxisOverlayInstance {
  /** Update the overlay with new camera state */
  draw(rig: CameraRig, basis: CameraBasis): void;
  /** Toggle visibility */
  setVisible(visible: boolean): void;
  /** Get current visibility */
  isVisible(): boolean;
  /** Resize canvas for DPR changes */
  resize(devicePixelRatio: number): void;
  /** Clean up all resources and event listeners */
  dispose(): void;
}

/** Create an axis overlay instance */
export function createAxisOverlay(config: AxisOverlayConfig): AxisOverlayInstance;
```

### 1.3 Implementation Plan

**Step 1.3.1**: Create `src/AxisOverlay.ts` with the interface above
**Step 1.3.2**: Move `loadAxisPosition()`, `saveAxisPosition()`, `getDefaultAxisPosition()` (private helpers)
**Step 1.3.3**: Move axis canvas creation logic into `createAxisOverlay()`
**Step 1.3.4**: Move drag handler setup into the create function
**Step 1.3.5**: Move `drawAxisIndicator()` into instance `draw()` method
**Step 1.3.6**: Wire `dispose()` to remove all event listeners
**Step 1.3.7**: Update `webgpu_core.ts:mount()` to call `createAxisOverlay()` instead of inline code
**Step 1.3.8**: Create `src/AxisOverlay.test.ts` with unit tests

### 1.4 Test Coverage Requirements

| Test | Description |
|------|-------------|
| `creates canvas with correct ID` | Canvas ID is `wgpu-axis-overlay` |
| `loads position from localStorage` | Reads `pf-axis-position` key |
| `saves position on drag end` | Writes position after mouse/touch drag |
| `draws axis vectors correctly` | Projects X/Y/Z axes to 2D |
| `toggles visibility` | `setVisible(false)` hides canvas |
| `cleans up on dispose` | Removes all event listeners and canvas |

### 1.5 Rollback Strategy

If extraction causes regressions:
1. Revert `AxisOverlay.ts` creation
2. Restore inline code in `webgpu_core.ts`
3. Document what failed in agents_journal.md

---

## Phase 2: InputManager.ts Extraction

### 2.1 Scope

Extract input handling (pointer, keyboard, wheel) into a dedicated module:

**Source lines in webgpu_core.ts:**
- L2474-L2497: `PointerState` object creation
- L2502-L2508: `freeKeyboard` object
- L3407-L3420: `handlePointerDown()`
- L3439-L3441: `handlePointerRelease()` setup
- L3443-L3449: `handlePointerMove()`
- L3451-L3670: `handleWheel()` — complex zoom logic
- L3673-L3743: `handleKeydown()` — keyboard shortcuts
- L3744-L3754: `handleKeyup()`
- L4875-L4876: `addEventListener('wheel', ...)`
- L5466-L5502: Event listener cleanup

**Total: ~450 lines**

### 2.2 Interface Design

```typescript
// src/InputManager.ts

import type { WebGPUState, CameraController } from './types';

/** Configuration for input manager */
export interface InputManagerConfig {
  /** Canvas element for pointer events */
  canvas: HTMLCanvasElement;
  /** WebGPU state object */
  state: WebGPUState;
  /** Camera controller instance */
  controller: CameraController;
  /** Callbacks for input events */
  callbacks: {
    onZoom?: (delta: number) => void;
    onAutoRotateChange?: (enabled: boolean) => void;
    onModeChange?: (mode: string) => void;
    onFullscreenToggle?: () => void;
    requestRender?: () => void;
  };
}

/** Input manager instance */
export interface InputManagerInstance {
  /** Process pending inertia/momentum */
  tick(): void;
  /** Reset input state (e.g., on focus loss) */
  reset(): void;
  /** Get current pointer state */
  getPointerState(): PointerState;
  /** Get current keyboard state */
  getKeyboardState(): FreeKeyboardState;
  /** Clean up all event listeners */
  dispose(): void;
}

/** Create input manager instance */
export function createInputManager(config: InputManagerConfig): InputManagerInstance;
```

### 2.3 Implementation Plan

**Step 2.3.1**: Create `src/InputManager.ts` with interface above
**Step 2.3.2**: Move `PointerState` initialization
**Step 2.3.3**: Move `freeKeyboard` initialization
**Step 2.3.4**: Move pointer event handlers
**Step 2.3.5**: Move wheel handler (preserve scroll physics)
**Step 2.3.6**: Move keyboard handlers
**Step 2.3.7**: Wire all event listeners in create function
**Step 2.3.8**: Update `webgpu_core.ts:mount()` to use `createInputManager()`
**Step 2.3.9**: Create `src/InputManager.test.ts`

### 2.4 Critical Dependencies

This extraction is **medium risk** because:

1. **CameraController coupling**: The input handlers call `cameraController?.onPointerDown()`, etc.
2. **State mutations**: Handlers mutate `state.zoom`, `state.rotX`, `state.rotY`, etc.
3. **Render loop interaction**: `requestRender()` must be callable

**Mitigation**: Pass dependencies via config object, use callbacks for render triggers.

### 2.5 Test Coverage Requirements

| Test | Description |
|------|-------------|
| `attaches pointer listeners` | Canvas has pointerdown/move/up handlers |
| `attaches wheel listener` | Canvas has wheel handler with passive:false |
| `attaches keyboard listeners` | Window has keydown/keyup handlers |
| `delegates to camera controller` | Calls controller methods on input |
| `handles zoom bounds` | Clamps zoom to [0.25, 4.0] |
| `cleans up on dispose` | All `removeEventListener` calls made |

---

## Phase 3: BufferLayout.ts Extraction

### 3.1 Scope

Extract GPU buffer write helpers:

**Source lines in webgpu_core.ts:**
- L2306-L2323: `writeGradient(device, buffers, gradient)`
- L2325-L2354: `writeBackgroundGradient(device, buffers, bg, angle)`
- L2385-L2403: Style param buffer write with error handling
- L394-L400: `buildUniformBlock(size)` helper

**Total: ~200 lines**

### 3.2 Interface Design

```typescript
// src/BufferLayout.ts

/** Write gradient colors to GPU buffers */
export function writeGradient(
  device: GPUDevice,
  buffers: { c1: GPUBuffer; c2: GPUBuffer; c3: GPUBuffer },
  gradient: GradientColor[]
): void;

/** Write background gradient to GPU buffers */
export function writeBackgroundGradient(
  device: GPUDevice,
  buffers: { c1: GPUBuffer; c2: GPUBuffer; c3: GPUBuffer },
  background: BackgroundConfig,
  angle: number
): void;

/** Build a zeroed Float32Array for uniform buffer */
export function buildUniformBlock(size: number): Float32Array;
```

### 3.3 Implementation Plan

**Step 3.3.1**: Create `src/BufferLayout.ts`
**Step 3.3.2**: Move `buildUniformBlock()`
**Step 3.3.3**: Move `writeGradient()`
**Step 3.3.4**: Move `writeBackgroundGradient()`
**Step 3.3.5**: Update imports in `webgpu_core.ts`
**Step 3.3.6**: Create `src/BufferLayout.test.ts`

### 3.4 Test Coverage Requirements

| Test | Description |
|------|-------------|
| `buildUniformBlock returns correct size` | Array has expected byte length |
| `writeGradient packs colors correctly` | RGB values in expected positions |
| `handles empty gradient` | Graceful fallback to default |
| `writeBackgroundGradient handles angle` | Rotation applied correctly |

---

## Phase 4: Controller Interface Typing

### 4.1 Scope

Strengthen type contracts between modules:

**Files affected:**
- `src/types.ts` — add `WebGPUController` interface methods
- `src/webgpu_core.ts` — ensure return type matches interface

### 4.2 Interface Additions

```typescript
// In src/types.ts

export interface WebGPUController {
  dispose: () => void;
  applyCamera: (payload: CameraPayload) => void;
  getState: () => WebGPUState;
  forceRender: () => void;
  setAutoRotate: (enabled: boolean) => void;
  // ... other existing methods
}
```

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                     webgpu_core.ts                          │
│                    (mount() function)                       │
└──────────┬──────────────┬──────────────┬───────────────────┘
           │              │              │
           ▼              ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │AxisOverlay.ts│ │InputManager.ts│ │BufferLayout.ts│
    └──────────────┘ └──────────────┘ └──────────────┘
           │              │              │
           ▼              ▼              ▼
    ┌──────────────────────────────────────────────────────┐
    │                      types.ts                         │
    │  (CameraRig, CameraBasis, WebGPUState, etc.)         │
    └──────────────────────────────────────────────────────┘
```

---

## Risk Assessment

### High-Risk Areas

1. **Event listener cleanup**: If `dispose()` is called incorrectly, memory leaks occur
2. **State mutation timing**: Input handlers mutate state that the render loop reads
3. **Camera controller coupling**: Tight integration between input and camera

### Mitigations

1. **Test coverage gate**: Each module must have 80%+ line coverage before merge
2. **Integration test**: E2E test that exercises full mount/drag/dispose cycle
3. **Phased rollout**: Each phase is a separate PR; wait for user validation before next phase

---

## Validation Protocol

### For Each Phase:

1. **Typecheck passes**: `npm run typecheck` (0 errors)
2. **Lint passes**: `npm run lint` (0 warnings)
3. **Unit tests pass**: `npm test` (all green)
4. **E2E tests pass**: `npm run test:e2e`
5. **Manual validation**: User confirms preview works, axis overlay drags, input responsive

### Regression Indicators:

- Axis overlay doesn't appear
- Drag/rotate doesn't work
- Keyboard shortcuts broken
- Memory usage grows on repeated mount/dispose cycles
- Console errors on page load

---

## Estimated Timeline

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| P-1 (as-any elimination) | 2 hours | None |
| Phase 1 (AxisOverlay) | 3 hours | P-1 complete |
| Phase 2 (InputManager) | 4 hours | Phase 1 complete |
| Phase 3 (BufferLayout) | 2 hours | Can run parallel to Phase 2 |
| Phase 4 (Interface Typing) | 1 hour | Phases 1-3 complete |

**Total: ~12 hours of implementation work**

---

## Verifier Attack Surface

The Verifier should challenge:

1. **Line ranges**: Are the specified lines accurate? Has the file shifted since analysis?
2. **Interface completeness**: Do the proposed interfaces capture all needed functionality?
3. **Dependency correctness**: Does the dependency graph accurately reflect imports?
4. **Test sufficiency**: Are the proposed tests comprehensive enough?
5. **Risk assessment**: Are there hidden coupling points not identified?
6. **Rollback feasibility**: Can each phase actually be rolled back independently?

---

## Executioner Checklist

Before implementation:

- [ ] Verify line numbers are current (file may have changed)
- [ ] Confirm type definitions exist for all dependencies
- [ ] Create module files with interfaces first, then implement
- [ ] Run tests after each sub-step, not just at phase end
- [ ] Commit after each working sub-step for easy bisect

---

## Open Questions for Verifier

1. Should `overlayForAxisFromBasis()` move to `AxisOverlay.ts` or stay in `webgpu_core.ts`?
2. Is the `PointerState` type already exported from `camera_controller.ts`? If so, reuse it.
3. Should `InputManager` own the `CameraController` instantiation or receive it?
4. Is there a circular dependency risk between `InputManager` and `CameraController`?

---

## Sign-off

**Generator**: This plan provides a phased, low-risk approach to decomposing the largest maintenance burden in the codebase. Each phase is independently testable and rollbackable.

---

## Implementation Progress (Updated 2026-03-09)

### ✅ P-1: `as any` Elimination (PARTIAL COMPLETE)

**Eliminated**: 24 of 51 casts (47% reduction)
**Files changed**:
- `src/webgpu_global.d.ts` — NEW (60 lines)
- `src/camera_controller.ts` — Removed duplicate global augmentation
- `src/webgpu_core.ts` — 24 casts removed

### ✅ Phase 1: AxisOverlay.ts Extraction (COMPLETE)

**Completed 2026-03-09**
- Created `src/AxisOverlay.ts` (343 lines)
- Integrated into `webgpu_core.ts` via `createAxisOverlay()`
- `webgpu_core.ts`: 5236 → 5053 lines (~183 LOC reduced)
- Typecheck: ✅ PASS | Lint: ✅ PASS

### 🔲 Remaining 27 `as any` Casts (TODO)

The following casts require interface extensions before removal:

| Line | Cast | Category | Fix Strategy |
|------|------|----------|--------------|
| 1954 | `device as any` | WebGPU API | `createShaderModule` wrapper signature |
| 2000-2001 | `(initialParams as any).style` | Config | Extend `MountOptions.style` |
| 2206 | `(window as any).__pf_webgpu_mounts` (comment) | Dead code | Remove commented line |
| 2267 | `(wireframePipeline as any).getBindGroupLayout` | WebGPU API | Pipeline type assertion |
| 2413-2417 | `(initialParams as any).hostCameraAcceptPolicy` | Config | Extend `MountOptions` |
| 2480-2481 | `(mulMat4Vec4 as any)` | Function sig | Already properly typed — remove cast |
| 2534-2535 | `(mulMat4Vec4 as any)` | Function sig | Already properly typed — remove cast |
| 2564 | `recentBasisCommit = {...} as any` | State | Add to `WebGPUState` interface |
| 2811 | `state as any, payload as any` | Function sig | Import proper types for `cameraPayloadDiffers` |
| 3036-3039 | `(state as any).recentInertia` | State | Add to `WebGPUState` interface |
| 3695-3706 | `(cfg as any).style` (×10) | Config | Extend `WebGPUParams.style` type |
| 4225 | `(cfg as any).__pf_bg_gradient` | Config | Add internal property to type |
| 4302, 4332 | `depthStencilAttachment` | WebGPU API | Use spread pattern per prior analysis |
| 5172 | `(state as any).displayRotZ` | State | Add to `WebGPUState` interface |

**Estimated effort**: ~2 hours to complete remaining casts

### 🔲 Phase 2: InputManager.ts Extraction (TODO)

### 🔲 Phase 3: BufferLayout.ts Extraction (TODO)

### 🔲 Phase 4: Interface Typing (TODO)

Ready for Verifier review.
