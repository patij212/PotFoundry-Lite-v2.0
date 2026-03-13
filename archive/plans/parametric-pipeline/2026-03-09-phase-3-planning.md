# Phase 3 — UniformBlock Extraction Planning

**Date:** 2026-03-09  
**Status:** PLANNING  
**Author:** Master Agent  
**Context:** Known Issues Audit — Phase 6 (webgpu_core.ts decomposition)

---

## Revision to Original Plan

The original Phase 6 plan specified:
> **Phase 3: Extract Buffer Management (~600 lines) → `BufferLayout.ts`**

This target is **obsolete** because:
1. `SceneManager.ts` already handles GPU buffer creation/management
2. The actual pain point is **uniform marshalling** scattered across multiple locations

**New Phase 3 Target:**  
**Extract Uniform Marshalling → `UniformBlock.ts`**

---

## Problem Statement

### Current State

Uniform buffer population is fragmented across three locations:

| Location | What it writes | Lines |
|----------|---------------|-------|
| `webgpu_geometry.ts` → `fillGeometryBuffer()` | Geometry params (H, Rt, Rb, spin, style, bell) | ~95 |
| `webgpu_core.ts` → `updateAndDraw()` | Camera, lighting, resolution, matrices | ~200 |
| `webgpu_core.ts` → inline writes | Debug flags, show_inner, seam angle | ~30 |

**Problems:**
1. **No single source of truth** for uniform buffer layout
2. **Magic offsets** — `f32[73] = seamAngleRad` with comment-only documentation
3. **Duplicated `clampNumber`** — defined in both files
4. **Testing difficulty** — uniform population interleaved with render logic
5. **Type-unsafe** — raw `f32[index]` access with `as any` casts

### Uniform Buffer Layout (Current)

From `camera_constants.ts` and WGSL `common.wgsl`:

```
Offset | Name                  | Size | Notes
-------|----------------------|------|-------
0      | H (height)           | 1    | from fillGeometryBuffer
1      | Rt (radius top)      | 1    | 
2      | Rb (radius bottom)   | 1    |
3      | expn                 | 1    |
4-6    | spin (turns/phase/curve) | 3 |
7      | styleId              | 1    |
8-12   | sf params (m_base, m_top, n1-3) | 5 |
13     | drain radius         | 1    | DRAIN_RADIUS_OFFSET
14-15  | bell (amp/center)    | 2    |
16-17  | nTheta, nZ           | 2    | from updateAndDraw
18     | debug flag           | 1    |
19-21  | rotX, rotY, zoom     | 3    |
22-24  | ambient/diffuse/fresnel | 3 |
25-30  | wall/bottom/inner/rings/pan | 6 |
31-35  | panY/aspect/radius/padding/near | 5 |
36-38  | eye (x,y,z)          | 3    | CAMERA_EYE_OFFSET = 36
39     | camera mode          | 1    | CAMERA_MODE_OFFSET = 39
40-55  | viewProjection mat4  | 16   | VP_MATRIX_OFFSET = 40
56-59  | right (vec4)         | 4    | CAMERA_RIGHT_OFFSET = 56
60-63  | up (vec4)            | 4    | CAMERA_UP_OFFSET = 60
64-67  | forward (vec4)       | 4    | CAMERA_FORWARD_OFFSET = 64
68     | grid flag            | 1    | GRID_FLAG_OFFSET = 68
69     | specular gain        | 1    | SPECULAR_GAIN_OFFSET = 69
70     | roughness            | 1    | ROUGHNESS_OFFSET = 70
71     | show_inner           | 1    | SHOW_INNER_OFFSET = 71
72     | bell_width           | 1    | BELL_WIDTH_OFFSET = 72
73     | seam angle (radians) | 1    | SEAM_ANGLE_OFFSET = 73
74     | (reserved)           | 1    |
75     | seam radius          | 1    | SEAM_RADIUS_OFFSET = 75
```

Total: 304 bytes (UNIFORM_BUFFER_SIZE = 76 floats * 4 bytes)
Style params: Separate buffer at 256 bytes (64 floats)

---

## Proposed Architecture

### New Module: `src/UniformBlock.ts`

```typescript
/**
 * UniformBlock — Consolidated uniform buffer marshalling for WebGPU shader.
 *
 * Single source of truth for:
 * - All uniform offsets (typed constants)
 * - Conversion from WebGPUParams + WebGPUState → Float32Array
 * - Validation and clamping of input values
 *
 * @module UniformBlock
 */

// ============== OFFSET CONSTANTS ==============
// These MUST match the WGSL struct layout in shaders

export const UNIFORM_OFFSETS = {
  // Geometry block (0-15)
  H: 0,
  Rt: 1,
  Rb: 2,
  Expn: 3,
  SpinTurns: 4,
  SpinPhase: 5,
  SpinCurve: 6,
  StyleId: 7,
  SfMBase: 8,
  SfMTop: 9,
  SfN1: 10,
  SfN2: 11,
  SfN3: 12,
  DrainRadius: 13,     // DRAIN_RADIUS_OFFSET
  BellAmp: 14,
  BellCenter: 15,
  
  // Resolution block (16-17)
  NTheta: 16,
  NZ: 17,
  
  // Rendering block (18-35)
  DebugFlag: 18,
  RotX: 19,
  RotY: 20,
  Zoom: 21,
  Ambient: 22,
  Diffuse: 23,
  Fresnel: 24,
  TWall: 25,
  TBottom: 26,
  InnerSegments: 27,
  BottomRings: 28,
  PanX: 29,
  RimRings: 30,
  PanY: 31,
  Aspect: 32,
  SceneRadius: 33,
  Padding: 34,
  Near: 35,
  
  // Camera block (36-75)
  CameraEye: 36,          // 3 floats (x,y,z)
  CameraMode: 39,         // 1 float (0=ortho, 1=perspective)
  ViewProjection: 40,     // 16 floats (mat4) ← VP_MATRIX_OFFSET
  CameraRight: 56,        // 4 floats (vec4)
  CameraUp: 60,           // 4 floats (vec4)
  CameraForward: 64,      // 4 floats (vec4)
  GridFlag: 68,           // 1 float
  SpecularGain: 69,       // 1 float
  Roughness: 70,          // 1 float
  ShowInner: 71,          // 1 float
  BellWidth: 72,          // 1 float (BELL_WIDTH_OFFSET)
  SeamAngle: 73,          // 1 float (radians)
  Reserved74: 74,         // 1 float
  SeamRadius: 75,         // 1 float (SEAM_RADIUS_OFFSET)
} as const;

// ============== INTERFACES ==============

export interface UniformBlockConfig {
  params: Readonly<WebGPUParams>;
  state: Readonly<WebGPUState>;
  cameraRig: Readonly<CameraRig>;
}

export interface UniformBlockInstance {
  /** The Float32Array uniform buffer */
  readonly buffer: Float32Array;
  
  /** Populate the buffer from current config */
  populate(config: UniformBlockConfig): void;
  
  /** Get diagnostic info about buffer state */
  getDiagnostics(): UniformDiagnostics;
}

// ============== FACTORY ==============

export function createUniformBlock(size: number): UniformBlockInstance {
  const buffer = new Float32Array(size / 4);
  buffer.fill(0);
  
  return {
    buffer,
    populate(config) {
      populateGeometry(buffer, config.params);
      populateResolution(buffer, config.params);
      populateCamera(buffer, config.state, config.cameraRig);
      populateLighting(buffer, config.params);
      populateFeatureFlags(buffer, config.params);
    },
    getDiagnostics() { /* ... */ }
  };
}
```

### Integration Pattern

**Before (current):**
```typescript
// In updateAndDraw (~200 lines)
f32[0] = height;
f32[1] = radiusTop;
// ... many more lines of f32[N] = value
```

**After (proposed):**
```typescript
// In updateAndDraw (~10 lines)
const cfg = { ...initialParams, ...current };
uniformBlock.populate({
  params: cfg,
  state,
  cameraRig: getCachedRig(state, paddingHint, phw, phh)
});
device.queue.writeBuffer(uniformBuffer, 0, uniformBlock.buffer);
```

---

## Implementation Steps

### Step 3a: Extract Offset Constants (30 min)
- Move all `*_OFFSET` constants from `camera_constants.ts` to new file
- Create typed `UNIFORM_OFFSETS` object
- Update imports in `camera_constants.ts` to re-export for backward compat

### Step 3b: Create UniformBlock Interface (1 hour)
- Define `UniformBlockConfig` interface
- Define `UniformBlockInstance` interface
- Implement `createUniformBlock()` factory
- Implement `populateGeometry()` — absorbs `fillGeometryBuffer` logic

### Step 3c: Implement Camera/Lighting Population (1 hour)
- Implement `populateCamera()` — camera eye, basis, mode
- Implement `populateLighting()` — ambient, diffuse, fresnel, specular
- Implement `populateResolution()` — nTheta, nZ, debug flags
- Implement `populateFeatureFlags()` — show_inner, seam_angle
- Implement `populateMatrix()` — viewProjection mat4

### Step 3d: Write Unit Tests (1 hour)
- Test offset values match WGSL expectations
- Test clamping behavior for out-of-range values
- Test NaN/Infinity handling
- Test style ID resolution logic

### Step 3e: Integrate into webgpu_core.ts (1 hour)
- Import `createUniformBlock` 
- Create instance in `mount()` instead of raw `buildUniformBlock()`
- Replace inline `f32[N] = value` with `uniformBlock.populate()`
- Preserve debug logging through `getDiagnostics()`

### Step 3f: Deprecate Old Code (30 min)
- Mark `fillGeometryBuffer` as deprecated (keep for one release)
- Remove `buildUniformBlock` from webgpu_core.ts
- Update `camera_constants.ts` to import from `UniformBlock.ts`

### Step 3g: Validation (30 min)
- `npm run typecheck` — 0 errors
- `npm run lint` — 0 warnings
- `npm test` — all passing
- Manual visual check — pot renders correctly
- Playwright screenshot comparison — no regression

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Offset mismatch breaks rendering | Medium | HIGH | Unit tests verify offsets match WGSL |
| Performance regression from function calls | Low | Low | Inline critical paths if profiling shows issue |
| Style params buffer (offset 192+) collision | Low | Medium | Explicit boundary checks in tests |
| Breaking existing `camera_constants` imports | Medium | Medium | Re-export for backward compatibility |

---

## Success Criteria

- [ ] All uniform offsets defined in single typed module
- [ ] `updateAndDraw()` reduced by ~200 lines
- [ ] No `as any` casts for uniform access
- [ ] Unit tests for uniform population
- [ ] `webgpu_geometry.ts` → `fillGeometryBuffer` deprecated
- [ ] TypeScript strict mode clean (0 errors)
- [ ] ESLint clean (0 warnings)
- [ ] All existing tests pass
- [ ] Visual output unchanged

---

## Dependencies

- **Requires:** Phase 2 complete (InputManager extraction) ✅
- **Blocked by:** None
- **Blocks:** Phase 4 (Controller interface typing)

---

## Estimated Effort

| Step | Time |
|------|------|
| 3a: Extract offsets | 30 min |
| 3b: Create interface | 1 hour |
| 3c: Implement population | 1 hour |
| 3d: Unit tests | 1 hour |
| 3e: Integration | 1 hour |
| 3f: Deprecation | 30 min |
| 3g: Validation | 30 min |
| **Total** | **~6 hours** |

---

## Notes for Next Agent

1. **Start with offset extraction** — this is the foundation. Get the constants right before any logic.

2. **The WGSL struct** is the ultimate source of truth. Check `src/renderers/webgpu/shaders/common.wgsl` for the Uniforms struct definition.

3. **Style params** use a separate buffer at offset 192+ with 64 floats (256 bytes). Don't mix these into the main UniformBlock — they're handled separately via `syncStyleParams()`.

4. **Camera rig population** is trickier than geometry because it involves matrix math and has edge cases for gimbal lock near ±90° pitch. Copy the existing validation logic.

5. **Debug emit compatibility** — some downstream code expects `emitDiagnostic('webgpu:uniform-*')` calls. Preserve these via the `getDiagnostics()` method.

6. **Test with multiple styles** — especially Voronoi (13) and Celtic Triquetra (18) which have complex style params.
