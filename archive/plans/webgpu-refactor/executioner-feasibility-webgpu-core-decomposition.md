# Executioner Feasibility Review — webgpu_core.ts Decomposition

Date: 2026-03-09
Status: **READY FOR IMPLEMENTATION**

---

## Executive Summary

After thorough review of the Generator's proposal and Verifier's validation, I confirm this decomposition is **FEASIBLE** with the implementation patterns specified below. All major concerns have been addressed, and the phased approach minimizes risk.

---

## 1. BUILD SYSTEM COMPATIBILITY

### 1.1 TypeScript Configuration

**Verified**: `tsconfig.json` has `"include": ["src"]`

This means:
- ✅ `src/webgpu_global.d.ts` will be picked up automatically
- ✅ No `types` array modification needed (global augmentation via `declare global`)
- ✅ Module resolution uses `"moduleResolution": "bundler"` — compatible with new module imports

**Risk Assessment**: NONE

### 1.2 Module Resolution

New modules (`AxisOverlay.ts`, `InputManager.ts`) will be:
- Side-effect-free (factory functions, no top-level execution)
- Tree-shakeable (only used exports are bundled)
- Compatible with the existing `import type` pattern

**Risk Assessment**: NONE

---

## 2. EXTRACTION MECHANICS

### 2.1 AxisOverlay — FEASIBLE ✅

**Verified closure dependencies** (lines 1945-2066):

| Variable | Captured From | Solution |
|----------|---------------|----------|
| `axisCanvas` | Local let | Own state — NOT a closure issue |
| `axisCtx` | Local let | Own state |
| `isDragging`, `dragStart*`, `start*` | Local drag state | Own state |
| `loadAxisPosition()`, `saveAxisPosition()` | Helper functions at L1917-1937 | Move with extraction |
| `state` | Parent scope | ❌ NOT needed — axis overlay is self-contained |
| `canvas.parentElement` | Config dependency | Pass via `config.parent` |

**Clean extraction**: All captured state is LOCAL to the axis canvas setup. No closure dependency on `state`, `device`, or render loop.

**Interface validation**: Generator's proposed interface is CORRECT:
```typescript
createAxisOverlay(config: AxisOverlayConfig): AxisOverlayInstance
```

### 2.2 InputManager — FEASIBLE WITH INTERFACE REFINEMENT ✅

**Verified closure dependencies** (keyboard handlers at L3673-3754):

| Variable | Captured From | Solution |
|----------|---------------|----------|
| `freeKeyboard` | L2502-2508 | InputManager OWNS this |
| `markInteraction()` | Local function | Pass via callbacks |
| `applyViewPreset()` | Import from camera_helpers | Direct import |
| `state` | Parent scope | Pass via config |
| `initialParams`, `current` | Parent scope | Pass via config (for scene extents) |
| `emitCameraState()` | Local function | Pass via callbacks |
| `toggleAutoRotate()`, `setAutoRotate()` | Local functions | Pass via callbacks |

**Interface adjustment required**:

```typescript
export interface InputManagerConfig {
  canvas: HTMLCanvasElement;
  state: WebGPUState;
  controller: CameraController;
  callbacks: {
    markInteraction: (shouldCancelFocus?: boolean) => void;
    emitCameraState: (force?: boolean) => void;
    toggleAutoRotate: () => void;
    getParams: () => WebGPUParams;  // For view preset scene radius calc
  };
}
```

**Note**: `freeKeyboard` is passed to `CameraController` via `controllerHelpers.freeKeyboard` (L2578). After extraction:
1. InputManager creates `freeKeyboard`
2. InputManager exposes it via `getKeyboardState()`
3. `webgpu_core.ts` passes reference to `controllerHelpers`

### 2.3 overlayForAxisFromBasis — MOVE IS SAFE ✅

**Verified** at L535-560:
- Only internal caller: `drawAxisIndicator()` at L1526
- Already exported (L696 area)
- Pure function — no closure dependencies

**Required**: Re-export from `webgpu_core.ts` for backwards compatibility:
```typescript
export { overlayForAxisFromBasis } from './AxisOverlay';
```

---

## 3. TEST INFRASTRUCTURE

### 3.1 Existing Tests — NO BREAKING CHANGES

**Verified**: `src/webgpu/webgpu_core.test.ts` tests mock infrastructure (adapter, device, buffers), not the mount function. Extraction of AxisOverlay/InputManager does NOT affect these tests.

### 3.2 New Test Patterns

Follow `camera_controller.test.ts` pattern:

```typescript
// AxisOverlay.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAxisOverlay } from './AxisOverlay';

describe('AxisOverlay', () => {
  let parent: HTMLDivElement;
  let instance: ReturnType<typeof createAxisOverlay>;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
  });

  afterEach(() => {
    instance?.dispose();
    parent.remove();
  });

  it('creates canvas with correct ID', () => {
    instance = createAxisOverlay({ parent });
    expect(document.getElementById('wgpu-axis-overlay')).not.toBeNull();
  });

  it('removes all listeners on dispose', () => {
    const removeListenerSpy = vi.spyOn(document, 'removeEventListener');
    instance = createAxisOverlay({ parent });
    instance.dispose();
    
    // Must remove ALL 6 document-level listeners
    expect(removeListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith('touchmove', expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith('touchend', expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith('touchcancel', expect.any(Function));
  });
});
```

### 3.3 Mocking Concerns

- **AxisOverlay**: Can test without WebGPU — only needs DOM
- **InputManager**: Needs mock `CameraController` and `WebGPUState` (use patterns from `camera_controller.test.ts`)

---

## 4. DEPENDENCY & TREE-SHAKING ANALYSIS

### 4.1 Import Graph After Extraction

```
webgpu_core.ts
├── AxisOverlay.ts (side-effect-free)
│   └── types.ts (CameraRig, CameraBasis)
├── InputManager.ts (side-effect-free)
│   ├── types.ts (WebGPUState, CameraMode)
│   └── camera_controller.ts (CameraController type)
└── camera_controller.ts (unchanged)
```

### 4.2 Tree-Shaking

All new modules are:
- ✅ Side-effect-free (factory functions only)
- ✅ Named exports (no default exports)
- ✅ Tree-shakeable by Vite/Rollup

---

## 5. RISK MITIGATION PATTERNS

### R1: Document-Level Axis Event Listeners

**Pattern**: Track listener references, remove on dispose.

```typescript
// AxisOverlay.ts implementation pattern
export function createAxisOverlay(config: AxisOverlayConfig): AxisOverlayInstance {
  // Track EVERY listener added
  let mouseMoveListener: ((e: MouseEvent) => void) | null = null;
  let mouseUpListener: (() => void) | null = null;
  let touchMoveListener: ((e: TouchEvent) => void) | null = null;
  let touchEndListener: (() => void) | null = null;
  let mouseDownListener: ((e: MouseEvent) => void) | null = null;
  let touchStartListener: ((e: TouchEvent) => void) | null = null;
  
  // ... in setup ...
  mouseMoveListener = (e) => { /* ... */ };
  document.addEventListener('mousemove', mouseMoveListener);
  
  return {
    dispose: () => {
      // CRITICAL: Remove ALL document listeners
      if (mouseMoveListener) document.removeEventListener('mousemove', mouseMoveListener);
      if (mouseUpListener) document.removeEventListener('mouseup', mouseUpListener);
      if (touchMoveListener) document.removeEventListener('touchmove', touchMoveListener);
      if (touchEndListener) {
        document.removeEventListener('touchend', touchEndListener);
        document.removeEventListener('touchcancel', touchEndListener);  // 6th listener!
      }
      // Also remove canvas listeners
      if (canvas && mouseDownListener) canvas.removeEventListener('mousedown', mouseDownListener);
      if (canvas && touchStartListener) canvas.removeEventListener('touchstart', touchStartListener);
      // Remove canvas from DOM
      canvas?.remove();
    }
  };
}
```

### R2: freeKeyboard Shared Coupling

**Pattern**: InputManager owns freeKeyboard, exposes via getter.

```typescript
// InputManager.ts
export function createInputManager(config: InputManagerConfig): InputManagerInstance {
  const freeKeyboard = {
    activeKeys: new Set<string>(),
    boost: false,
  };
  
  // ... handlers use freeKeyboard directly ...
  
  return {
    getKeyboardState: () => freeKeyboard,  // Read-only access for CameraController
    reset: () => {
      freeKeyboard.activeKeys.clear();
      freeKeyboard.boost = false;
    },
    dispose: () => { /* ... */ }
  };
}

// webgpu_core.ts usage
const inputManager = createInputManager({ ... });
const controllerHelpers: ControllerHelpers = {
  freeKeyboard: inputManager.getKeyboardState(),  // Pass reference
  // ...
};
```

### R3: CameraController Instantiation Complexity

**Pattern**: InputManager receives (not creates) CameraController.

```typescript
// webgpu_core.ts (after extraction)
// 1. Create InputManager first (owns freeKeyboard)
const inputManager = createInputManager({
  canvas,
  state,
  callbacks: { markInteraction, emitCameraState, toggleAutoRotate, getParams }
});

// 2. Build controllerHelpers with inputManager's keyboard state
const controllerHelpers: ControllerHelpers = {
  freeKeyboard: inputManager.getKeyboardState(),
  // ... other helpers unchanged ...
};

// 3. Create CameraController (unchanged)
cameraController = new CameraController(state, pointer, canvas, controllerHelpers);

// 4. Connect InputManager to controller (for delegation)
inputManager.setController(cameraController);
```

**Note**: Step 4 requires `setController()` method on InputManager for late binding, OR split InputManager creation into two phases.

---

## 6. RECOMMENDED IMPLEMENTATION ORDER

### Phase 0: Global Type Augmentation (30 min)

1. Create `src/webgpu_global.d.ts` with consolidated global types
2. Move `camera_controller.ts` L69-83 augmentation to new file
3. Run `npm run typecheck` — MUST pass

### Phase 1: AxisOverlay Extraction (2 hours)

1. Create `src/AxisOverlay.ts` with interface + implementation
2. Move `loadAxisPosition`, `saveAxisPosition`, `getDefaultAxisPosition`
3. Move `overlayForAxisFromBasis`
4. Add re-export in `webgpu_core.ts`
5. Create `src/AxisOverlay.test.ts`
6. Update `webgpu_core.ts:mount()` to use `createAxisOverlay()`
7. Update `dispose()` to call `axisOverlay.dispose()`
8. Run `npm run typecheck && npm run lint && npm test`

### Phase 2: InputManager Extraction (3 hours)

1. Create `src/InputManager.ts` with interface
2. Move `freeKeyboard` ownership
3. Move keyboard handlers (`handleKeydown`, `handleKeyup`, `handleWindowBlur`)
4. Move `clearFreeMovementKeys` and `FREE_MOVE_KEYS`
5. Create `src/InputManager.test.ts`
6. Update `webgpu_core.ts:mount()` to use `createInputManager()`
7. Wire `controllerHelpers.freeKeyboard` to `inputManager.getKeyboardState()`
8. Update `dispose()` to call `inputManager.dispose()`
9. Run full validation

### Phase 3 & 4: Defer

BufferLayout and Controller Interface Typing can proceed after Phase 2 stabilizes.

---

## 7. VALIDATION PROTOCOL

After EACH phase:

```powershell
cd potfoundry-web
npm run typecheck      # 0 errors
npm run lint           # 0 warnings
npm test               # all passing
npm run dev            # manual smoke test
```

Memory leak test (after Phases 1 & 2):
```javascript
// In browser console
for (let i = 0; i < 100; i++) {
  window.__pf_dispose?.();  // Dispose
  // Re-mount would happen automatically
}
// Check Performance tab for retained listeners
```

---

## 8. VERDICT

### FEASIBLE Items (implement as specified)

- ✅ Phase 0: `webgpu_global.d.ts` creation
- ✅ Phase 1: AxisOverlay extraction
- ✅ Phase 2: InputManager extraction (with interface refinements above)

### NEEDS ADJUSTMENT Items

| Item | Adjustment |
|------|------------|
| InputManager interface | Add `getParams` callback for view preset scene radius |
| InputManager lifecycle | Add `setController()` for late CameraController binding |
| overlayForAxisFromBasis | Add re-export in webgpu_core.ts for backwards compatibility |

### IMPLEMENTATION PATTERNS

All risk areas (R1-R3) have concrete patterns specified in Section 5.

### FINAL VERDICT

**✅ READY FOR IMPLEMENTATION**

Begin with Phase 0 (webgpu_global.d.ts), then Phase 1 (AxisOverlay). These are low-risk and will build confidence before tackling InputManager.

---

## Sign-off

**Executioner**: Implementation is feasible. The Generator's architecture is sound, and the Verifier's amendments are incorporated. Code patterns above should be followed exactly to avoid introducing regressions.

**To Generator/Verifier**: One surprise — the `FREE_MOVE_KEYS` constant (L2500) also needs to move with InputManager. It's a `Set` of key codes used by keyboard handlers. Minor oversight, but I'll include it in the changeset.

**Feelings**: Clean review. The Generator did the hard architectural thinking; Verifier caught the edge cases. My job is straightforward — verify it can actually be built, and it can.

---

## 9. REMAINING `as any` CASTS (27 total)

**Status**: Deferred — requires interface improvements beyond simple cast removal.

### 9.1 Config/InitialParams Property Access (~15 casts)

These require `MountInitialParams` interface extension:

| Line | Code | Fix |
|------|------|-----|
| L2190 | `(initialParams as any).style` | Add `style?: number \| string \| StyleId` to MountOptions |
| L2191 | `(initialParams as any).style` | Same as above |
| L2603 | `(initialParams as any)?.hostCameraAcceptPolicy` | Add `hostCameraAcceptPolicy?: 'always' \| 'grace' \| 'strict'` |
| L2607 | `(initialParams as any)?.localCameraGraceMs` | Add `localCameraGraceMs?: number` |
| L2607 | `(initialParams as any)?.hostCameraGraceMs` | Add `hostCameraGraceMs?: number` |
| L3885-3890 | `(cfg as any).style` (×6) | Same interface extension |
| L3895-3896 | `(cfg as any).style` (×2) | Same interface extension |
| L4415 | `(cfg as any).__pf_bg_gradient` | Add `__pf_bg_gradient?: unknown` (internal property) |

### 9.2 WebGPU API Gaps (4 casts)

These require restructuring object construction:

| Line | Code | Fix |
|------|------|-----|
| L2144 | `device as any` in createShaderModule | Fix createShaderModule signature |
| L2457 | `(wireframePipeline as any).getBindGroupLayout(0)` | Pipeline is `GPURenderPipeline` — cast is unnecessary |
| L4492 | `(magentaPassDesc as any).depthStencilAttachment` | Use spread pattern for optional properties |
| L4522 | `(renderPassDesc as any).depthStencilAttachment` | Use spread pattern for optional properties |

### 9.3 mulMat4Vec4 Function Signature (4 casts)

| Line | Code | Fix |
|------|------|-----|
| L2670-2671 | `(mulMat4Vec4 as any)(rig.viewProjection, ...)` | Remove cast — function signature is correct |
| L2724-2725 | `(mulMat4Vec4 as any)(rig.viewProjection, ...)` | Remove cast — function signature is correct |

### 9.4 WebGPUState Missing Fields (3 casts)

| Line | Code | Fix |
|------|------|-----|
| L2754 | `state.recentBasisCommit = {...} as any` | Field exists in WebGPUState — remove cast |
| L3226 | `(state as any).recentInertia` | Field exists in WebGPUState — remove cast |
| L3229 | `(state as any).recentInertia` | Field exists in WebGPUState — remove cast |

### 9.5 Commented Code (1 cast — ignored)

| Line | Code | Status |
|------|------|--------|
| L2396 | `// try { (window as any).__pf_webgpu_mounts...` | In comment — no action needed |

### Action Plan

1. **Phase P-2** (after Phase 2): Extend MountOptions interface with config properties
2. **Phase P-3**: Fix WebGPU API object construction patterns
3. **Phase P-4**: Remove unnecessary casts for existing interface fields
