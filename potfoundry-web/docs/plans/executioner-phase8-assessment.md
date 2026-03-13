# Executioner Assessment — webgpu_core.ts Phase 8+ Decomposition Candidates

**Date**: 2026-03-11
**Status**: Assessment for Generator/Verifier debate
**Current State**: webgpu_core.ts ~4,700 lines (down from ~5,245 pre-extraction)

---

## 1. Context — What's Already Been Extracted

### Completed Phases (5-7)
| Phase | Module | LOC Extracted | Description |
|-------|--------|---------------|-------------|
| 5 | MatrixMath.ts | ~80 | viewMatrixFromBasis, mat4Multiply, perspective/ortho projection |
| 6 | camera_basis.ts | ~9 | vec3Length, vec3Normalize, vec3Scale (consolidated) |
| 7 | MathHelpers.ts | ~90 | wrapAngle, wrapTau, clampZoomValue, mulMat4Vec4Full |

### Pre-existing Extracted Modules
- `AxisOverlay.ts` — Axis indicator rendering
- `InputManager.ts` — Keyboard/free-look input handling
- `CameraController.ts` — Camera manipulation logic
- `camera_helpers.ts` — Ray-casting utilities
- `camera_constants.ts` — Camera-related constants
- `UniformBlock.ts` — Uniform buffer construction
- `BufferLayout.ts` — GPU buffer writing utilities

---

## 2. Decomposition Candidates — Ranked by Feasibility

### 2.1 HIGH Feasibility — Pure extraction, minimal coupling

#### Candidate A: UI Button Handlers (~150 LOC)
**Location**: Lines 1126-1270  
**Functions**:
- `updateAutoButton`, `updateProjectionButton`, `updateDebugButton`
- `updateGridButton`, `updateAxisButton`, `updateArcballButton`, `updateFreeButton`
- `updateCameraModeButtons`, `updatePivotAutoButton`
- `resolveControlsButton`, `resolveAutorotateButton`, etc.

**Dependencies**:
- State reads: `state.autoRotate`, `state.showGrid`, `state.projectionMode`, etc.
- DOM: `HTMLButtonElement` manipulation
- Callbacks: `setAutoRotate`, `toggleAutoRotate` (already external on controller)

**Risk**: LOW — These are pure UI synchronization functions. State is passed in, DOM is manipulated.

**Estimated New Module**: `UIButtonSync.ts` ~150 lines

---

#### Candidate B: Debug Pipeline Factories (~150 LOC)
**Location**: Lines 4375-4470
**Functions**:
- `createDebugPipeline` (line 4375) — WGSL shader for debug lines
- `createDebugPointsPipeline` (line 4416) — WGSL shader for debug points
- `createDebugBindGroup` (line 2002)
- `createMainBindGroup` (line 1985)

**Dependencies**:
- `device: GPUDevice`
- `ShaderManager` (already imported)
- Bind group layout definitions

**Risk**: LOW — These are factory functions that receive device and return pipelines.

**Estimated New Module**: `DebugPipelines.ts` ~180 lines (including bind groups)

---

### 2.2 MEDIUM Feasibility — Requires interface design

#### Candidate C: Camera State Broadcasting (~100 LOC)
**Location**: Lines 1378-1500
**Functions**:
- `buildCameraSnapshot`
- `snapshotsEqual`
- `emitCameraState`
- `scheduleCameraEmit`, `cancelCameraEmit`
- `requestCameraEmitWhenStatic`

**Dependencies**:
- State: Full WebGPUState read access
- Events: `postToHost`, `emit` callback
- Timer management

**Risk**: MEDIUM — Tightly coupled to mount's closure. Requires state injection.

**Estimated New Module**: `CameraStateBroadcaster.ts` ~120 lines

---

#### Candidate D: Resize/Fullscreen Handling (~150 LOC)
**Location**: Lines 1550-1710
**Functions**:
- `resize` function (complex, ~120 lines)
- `handleFullscreenChange`
- Device pixel ratio management
- Mobile GPU safety guards

**Dependencies**:
- `device`, `context`, `depth` texture
- `maxTextureDimension2D` limits
- Canvas reference

**Risk**: MEDIUM — The resize function has many side effects (texture recreation, context configure). Requires careful state management.

**Estimated New Module**: `ResizeManager.ts` ~180 lines

---

### 2.3 LOW Feasibility — Complex coupling, high risk

#### Candidate E: Render Loop Internals (~400 LOC)
**Location**: Lines 3700-4300
**Functions**: Single monolithic `updateAndDraw` inner function

**Risk**: HIGH — This is the core render path with:
- 20+ local variable captures
- Uniform buffer writes
- Multiple GPU resource references
- Validation and fallback logic

**Recommendation**: Leave in place for now. Consider splitting ONLY after UI and debug extraction.

---

#### Candidate F: Pointer Event Handlers (~120 LOC)
**Location**: Lines 2994-3087
**Functions**:
- `handlePointerDown`, `handlePointerMove`, `handlePointerRelease`
- `handleWheel`, `handleDoubleClick`
- `handleTouchStart`, `handleTouchMove`, `handleTouchEnd`

**Risk**: HIGH — These are already thin wrappers around `cameraController`. Extracting would add indirection without meaningful reduction.

**Recommendation**: Leave as-is. The CameraController owns the logic; these are glue.

---

## 3. Recommended Phase 8 Scope

### Primary Target: UI Button Handlers (Candidate A)

**Rationale**:
1. Pure functions with clear inputs/outputs
2. No GPU resource ownership
3. Existing pattern: InputManager already handles similar UI state sync
4. Low risk of regression
5. ~150 LOC reduction

### Proposed Module: `ToolbarButtonSync.ts`

**Interface**:
```typescript
export interface ToolbarSyncConfig {
  controlsRoot: HTMLElement | null;
  canvas: HTMLCanvasElement;
}

export interface ToolbarStateSlice {
  autoRotate: boolean;
  showGrid: boolean;
  showAxis: boolean;
  projectionMode: 'ortho' | 'perspective';
  cameraMode: 'turntable' | 'arcball' | 'free';
  debugOverlay: boolean;
  autoPivotFromCamera: boolean;
}

export interface ToolbarButtonSync {
  updateAll(state: ToolbarStateSlice): void;
  updateButton(name: ToolbarButtonName, active: boolean): void;
  dispose(): void;
}

export function createToolbarButtonSync(config: ToolbarSyncConfig): ToolbarButtonSync;
```

### Alternative: Debug Pipeline Factories (Candidate B)

If team prefers GPU-related extraction, debug pipelines are also safe:

**Interface**:
```typescript
export interface DebugPipelineSet {
  linesPipeline: GPURenderPipeline | null;
  pointsPipeline: GPURenderPipeline | null;
  bindGroup: GPUBindGroup | null;
}

export async function createDebugPipelines(
  device: GPUDevice,
  shaderManager: ShaderManager,
  uniformBuffer: GPUBuffer,
  styleId: number
): Promise<DebugPipelineSet>;
```

---

## 4. Files Impacted (Phase 8 — Candidate A)

| File | Change |
|------|--------|
| `src/ToolbarButtonSync.ts` | NEW — ~150 lines |
| `src/ToolbarButtonSync.test.ts` | NEW — ~120 lines |
| `src/webgpu_core.ts` | MODIFY — Remove ~150 LOC, add imports |
| `src/types.ts` | MODIFY — Add ToolbarStateSlice if needed |

---

## 5. Validation Protocol

```bash
npm run typecheck  # Must: 0 errors
npm run lint       # Must: 0 warnings
npm test           # Must: No regressions
```

### Manual Testing:
- Toggle auto-rotate button → verify state sync
- Toggle grid/axis buttons → verify visual update
- Switch camera modes → verify button states
- Fullscreen → verify buttons remain functional

---

## 6. Questions for Generator/Verifier

1. **Naming**: `ToolbarButtonSync` vs `UIButtonSync` vs `ControlsButtonSync`?
2. **Scope**: Include `notifyAutoRotateChange` callback in module, or leave as mount() responsibility?
3. **Testing**: Mock DOM or JSDOM integration?
4. **Phase 8b**: Should debug pipelines be Phase 8b or Phase 9?

---

## 7. Risk Summary

| Candidate | LOC | Risk | Recommendation |
|-----------|-----|------|----------------|
| A. UI Button Handlers | 150 | LOW | ✅ Phase 8 |
| B. Debug Pipelines | 150 | LOW | ✅ Phase 9 |
| C. Camera Broadcast | 100 | MED | ⏳ Phase 10 |
| D. Resize Manager | 150 | MED | ⏳ Phase 11 |
| E. Render Loop | 400 | HIGH | ❌ Not recommended |
| F. Pointer Handlers | 120 | HIGH | ❌ Not recommended |

---

*Executioner Assessment Complete — Awaiting Generator proposal for Phase 8.*
