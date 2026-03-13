# Generator Round 1 — Phase 3f: Complete UniformBlock Integration

Date: 2026-03-09

## Problem Statement

`webgpu_core.ts` (~5356 lines) still contains 25+ inline `f32[N] = value` writes for resolution, camera, lighting, and feature flags, despite `UniformBlock.ts` having production-ready `populateXxx()` methods. Additionally, three helper functions (`clampNumber`, `sanitizeInt`, `writeVec3`) are now **duplicated** between `webgpu_core.ts` (lines 376-500) and `UniformBlock.ts` (lines 146-180), violating DRY and creating a drift risk.

**Current redundancy:**
- `clampNumber` defined at both [webgpu_core.ts:418](../src/webgpu_core.ts#L418) and [UniformBlock.ts:146](../src/UniformBlock.ts#L146)
- `sanitizeInt` defined at both [webgpu_core.ts:376](../src/webgpu_core.ts#L376) and [UniformBlock.ts:159](../src/UniformBlock.ts#L159)
- `writeVec3` defined at both [webgpu_core.ts:498](../src/webgpu_core.ts#L498) and [UniformBlock.ts:176](../src/UniformBlock.ts#L176)

**Goal:** Replace all remaining inline writes with `uniformBlock.populateXxx()` calls, then remove dead helper code from `webgpu_core.ts`.

---

## Root Cause Analysis

### Why inline writes still exist

The Step 3e integration only wired `populateGeometry()`. The remaining writes were left in place to minimize blast radius:

```typescript
// webgpu_core.ts:3752-3800 — CURRENT STATE
f32[16] = nTheta;                          // Resolution block
f32[17] = nZ;
f32[18] = debugActive ? 1 : 0;
f32[19] = state.rotX;                       // Camera state
f32[20] = state.rotY;
f32[21] = state.zoom;
f32[22] = clampNumber(cfg.ambient, 0.0);    // Lighting block
f32[23] = clampNumber(cfg.diffuse, 0.0);
f32[24] = clampNumber(cfg.fresnel, 0.25);
f32[25] = clampNumber(cfg.t_wall, 3.0);
f32[26] = clampNumber(cfg.t_bottom, 3.0);
f32[27] = innerSeg;
f32[28] = bottomRings;
f32[29] = state.panX;
f32[30] = rimRings;
f32[31] = state.panY;
// ... plus camera eye, basis vectors, viewProjection matrix
```

### Why this matters

1. **Drift risk**: Constants like `CAMERA_EYE_OFFSET=36` are defined in BOTH `camera_constants.ts` AND `UniformBlock.ts`. Any offset change must update 3+ files.
2. **Duplication**: The helper functions are semantically identical but defined twice. A bug fix in one won't propagate to the other.
3. **LOC bloat**: ~60 lines of inline writes + ~40 lines of helper definitions could be replaced by 4 method calls.

---

## Proposals

### Proposal 1: Incremental Method Integration (Conservative)

Integrate one `populateXxx()` method at a time with full test verification between each.

**Order of operations:**
1. `populateResolution()` — lowest risk, only 3 offsets
2. `populateLighting()` — medium risk, 7 offsets, includes specular/roughness
3. `populateFeatureFlags()` — low risk, 2 offsets
4. `populateCamera()` — highest risk, 20+ offsets, includes viewProjection matrix
5. Dead code removal — helper functions + `buildUniformBlock`

**Mechanism:** Each step is an atomic commit. If any step breaks, revert that single commit.

**Trade-offs:**
- (+) Maximum safety — each step is independently testable
- (+) Easy bisection if something breaks
- (-) 5 commit cycles, slower overall
- (-) Helper functions remain duplicated until final step

---

### Proposal 2: Grouped Integration with Parallel Testing (Moderate)

Integrate all 4 remaining methods in a single commit, but validate by comparing buffer contents byte-for-byte before/after.

**Mechanism:**
1. Add a `DEBUG_VERIFY_BUFFER` flag that runs both old inline writes AND new method calls
2. Compare `f32` arrays after each; any mismatch triggers diagnostic
3. Once verified, remove the old path

**Trade-offs:**
- (+) Faster — single integration commit
- (+) High confidence — byte-level verification catches any drift
- (-) Temporary code doubling during verification phase
- (-) Buffer comparison has ~2% performance overhead during verification

---

### Proposal 3: Full Replacement with Comprehensive Test Coverage (Aggressive)

Replace all inline writes in one commit, relying on the existing 1966 tests + 43 UniformBlock tests to catch regressions.

**Mechanism:** Trust the test suite. The `UniformBlock.test.ts` already validates all 76 offsets against expected values. If tests pass, the integration is correct.

**Trade-offs:**
- (+) Fastest — single commit, no verification scaffolding
- (+) Cleanest diff — no temporary code
- (-) If tests miss an edge case, regression ships
- (-) Requires high confidence in test coverage

---

## Recommended Approach: Proposal 1 (Incremental)

**Rationale:** Camera rendering is the visual heart of PotFoundry. Even a single incorrect offset produces visible artifacts (inverted camera, wrong lighting). The conservative approach costs ~30 minutes extra but guarantees zero visual regression.

---

## Detailed Implementation Plan

### Step 3f-1: Integrate `populateResolution()`

**Before** (webgpu_core.ts:3752-3754):
```typescript
f32[16] = nTheta;
f32[17] = nZ;
f32[18] = debugActive ? 1 : 0;
```

**After:**
```typescript
uniformBlock.populateResolution(cfg, state, debugActive);
```

**Additionally modified variables:**
The local variables `nTheta`, `nZ`, `innerSeg`, `bottomRings`, `rimRings` are computed BEFORE being written. They're also used for diagnostics and mesh budget calculations later in the function. We CANNOT simply delete const declarations.

**Safe approach:** Keep the local variable computation, but delegate the buffer writes to `populateResolution()`:

```typescript
// Keep these — used later for diagnostics and mesh calculations
const nTheta = Math.min(1024, Math.max(MIN_THETA_STATIC, baseNTheta));
const nZ = Math.min(1024, Math.max(MIN_Z_STATIC, baseNZ));
const innerSeg = Math.max(1, baseInner);
const bottomRings = Math.max(2, Math.min(24, baseBottom));
const rimRings = Math.max(1, Math.min(8, baseRim));

// Delegate buffer writes to UniformBlock
uniformBlock.populateResolution(cfg, state, debugActive);
```

**Issue:** `populateResolution()` computes `nTheta`/`nZ` internally using its OWN sanitization. This could produce different values than the local computation.

**Solution:** Verify `populateResolution()` uses the same formula:
- UniformBlock: `Math.min(1024, Math.max(MIN_THETA, baseNTheta))` with `MIN_THETA=3`
- webgpu_core: `Math.min(1024, Math.max(MIN_THETA_STATIC, baseNTheta))` with `MIN_THETA_STATIC=3`

The formulas are **identical**. Safe to proceed.

---

### Step 3f-2: Integrate `populateLighting()`

**Before** (webgpu_core.ts:3760-3766, 3785-3787):
```typescript
f32[22] = clampNumber(cfg.ambient, 0.0);
f32[23] = clampNumber(cfg.diffuse, 0.0);
f32[24] = clampNumber(cfg.fresnel, 0.25);
f32[25] = clampNumber(cfg.t_wall, 3.0);
f32[26] = clampNumber(cfg.t_bottom, 3.0);
// ...later...
const specular = Math.min(Math.max(clampNumber(cfg.specular, 0.4), 0), 1);
const roughness = Math.min(Math.max(clampNumber(cfg.roughness, 0.45), 0.02), 1);
f32[SPECULAR_GAIN_OFFSET] = specular;
f32[ROUGHNESS_OFFSET] = roughness;
```

**After:**
```typescript
uniformBlock.populateLighting(cfg);
```

**Verification:** Compare `populateLighting()` implementation in UniformBlock.ts:490-502:
```typescript
buffer[O.Ambient] = clampNumber(c.ambient, 0.0);
buffer[O.Diffuse] = clampNumber(c.diffuse, 0.0);
buffer[O.Fresnel] = clampNumber(c.fresnel, 0.25);
buffer[O.TWall] = clampNumber(c.t_wall, 3.0);
buffer[O.TBottom] = clampNumber(c.t_bottom, 3.0);
const specular = Math.min(Math.max(clampNumber(c.specular, 0.4), 0), 1);
const roughness = Math.min(Math.max(clampNumber(c.roughness, 0.45), 0.02), 1);
buffer[O.SpecularGain] = specular;
buffer[O.Roughness] = roughness;
```

**Result:** Identical behavior. Safe to proceed.

---

### Step 3f-3: Integrate `populateFeatureFlags()`

**Before** (webgpu_core.ts:3781, 3797):
```typescript
f32[GRID_FLAG_OFFSET] = state.showGrid ? 1 : 0;
// ...later...
const showInner = cfg.showInner !== false;
f32[SHOW_INNER_OFFSET] = showInner ? 1 : 0;
```

**After:**
```typescript
uniformBlock.populateFeatureFlags(cfg, state);
```

**Verification:** `populateFeatureFlags()` in UniformBlock.ts:535-543 handles both flags identically.

---

### Step 3f-4: Integrate `populateCamera()` (High Risk)

This is the largest and most complex block. The camera integration must handle:

1. **State values:** `state.rotX`, `state.rotY`, `state.zoom`, `state.panX`, `state.panY`, `state.canvasAspect`
2. **CameraRig values:** `cameraRig.eye`, `cameraRig.basis`, `cameraRig.near`, `cameraRig.mode`, `cameraRig.viewProjection`
3. **Scene values:** `paddingHint`, `state.sceneRadius`

**Before** (webgpu_core.ts:3755-3800):
```typescript
f32[19] = state.rotX;
f32[20] = state.rotY;
f32[21] = state.zoom;
f32[27] = innerSeg;     // ← ISSUE: This is NOT camera data
f32[28] = bottomRings;  // ← ISSUE: This is NOT camera data
f32[29] = state.panX;
f32[30] = rimRings;     // ← ISSUE: This is NOT camera data
f32[31] = state.panY;
f32[32] = state.canvasAspect || 1;
f32[33] = state.sceneRadius;
f32[34] = paddingHint;
f32[35] = cameraRig.near;

f32[CAMERA_EYE_OFFSET + 0] = cameraRig.eye[0];
f32[CAMERA_EYE_OFFSET + 1] = cameraRig.eye[1];
f32[CAMERA_EYE_OFFSET + 2] = cameraRig.eye[2];
f32[CAMERA_MODE_OFFSET] = cameraRig.mode === 'perspective' ? 1 : 0;
writeVec3(f32, CAMERA_RIGHT_OFFSET, cameraRig.basis.right);
f32[CAMERA_RIGHT_OFFSET + 3] = 0;
writeVec3(f32, CAMERA_UP_OFFSET, cameraRig.basis.up);
f32[CAMERA_UP_OFFSET + 3] = 0;
writeVec3(f32, CAMERA_FORWARD_OFFSET, cameraRig.basis.forward);
f32[CAMERA_FORWARD_OFFSET + 3] = 0;
for (let i = 0; i < 16; i += 1) {
  f32[VP_MATRIX_OFFSET + i] = cameraRig.viewProjection[i];
}
```

**Critical observation:** Offsets 27, 28, 30 are `innerSeg`, `bottomRings`, `rimRings` — these are **topology parameters**, not camera parameters. They're interleaved due to legacy buffer layout.

**Checking UniformBlock.populateGeometry():**
Looking at UniformBlock.ts:395-398:
```typescript
buffer[O.InnerSegments] = clampNumber(c.inner_y ?? c.innerY, 100.0);
buffer[O.BottomRings] = clampNumber(c.bottom_rings ?? c.bottomRings, 20.0);
buffer[O.RimRings] = clampNumber(c.rim_rings ?? c.rimRings, 10.0);
```

**Issue discovered:** `populateGeometry()` already writes to offsets 27, 28, 30 with DEFAULT values (100, 20, 10), but `webgpu_core.ts` overwrites them with COMPUTED values (`innerSeg`, `bottomRings`, `rimRings`) that have different bounds.

**This is a BUG waiting to happen.** The integration of `populateGeometry()` in Step 3e may have introduced silent regressions for topology parameters.

**Immediate action required:** Verify that the current `populateGeometry()` writes match the inline writes.

| Param | `populateGeometry()` | Inline write | Match? |
|-------|---------------------|--------------|--------|
| innerSeg | `clampNumber(..innerY, 100.0)` | `Math.max(1, baseInner)` where baseInner = sanitizeInt(cfg.innerSegments, baseNZ, 1) | **MISMATCH** — UniformBlock uses raw param fallback 100; inline uses clamped nZ |
| bottomRings | `clampNumber(..bottomRings, 20.0)` | `Math.max(2, Math.min(24, baseBottom))` where baseBottom = sanitizeInt(.., defaultBottom, 2) | **MISMATCH** — UniformBlock missing min/max clamp |
| rimRings | `clampNumber(..rimRings, 10.0)` | `Math.max(1, Math.min(8, baseRim))` | **MISMATCH** — UniformBlock missing min/max clamp |

**Root cause:** `populateGeometry()` was designed to handle the geometry-only offsets (0-15), but the topology parameters (27, 28, 30) were erroneously included with incorrect fallbacks and missing clamping.

---

## Proposal Amendment: Fix Topology Parameter Handling

Before integrating `populateCamera()`, we must fix the existing `populateGeometry()` bug.

### Option A: Move topology params to a new `populateTopology()` method

Create `UniformBlock.populateTopology(nZ, innerSeg, bottomRings, rimRings)` that takes **pre-computed** values:

```typescript
populateTopology(innerSeg: number, bottomRings: number, rimRings: number): void {
  buffer[O.InnerSegments] = innerSeg;
  buffer[O.BottomRings] = bottomRings;
  buffer[O.RimRings] = rimRings;
}
```

And call it from `webgpu_core.ts` AFTER computing the values:
```typescript
uniformBlock.populateTopology(innerSeg, bottomRings, rimRings);
```

### Option B: Fix `populateGeometry()` to use correct clamping

Update `populateGeometry()` to apply the correct bounds:
```typescript
// In populateGeometry():
const baseInner = sanitizeInt(c.innerSegments ?? c.inner_segments ?? baseNZ, baseNZ, 1);
const innerSeg = Math.max(1, baseInner);
buffer[O.InnerSegments] = innerSeg;

const defaultBottom = Math.max(2, Math.min(24, Math.ceil(baseNZ * 0.25)));
const baseBottom = sanitizeInt(c.bottom_rings ?? c.bottomRings ?? defaultBottom, defaultBottom, 2);
const bottomRings = Math.max(2, Math.min(24, baseBottom));
buffer[O.BottomRings] = bottomRings;

const defaultRim = Math.max(1, Math.min(8, Math.ceil(baseNZ * 0.1)));
const baseRim = sanitizeInt(c.rim_rings ?? c.rimRings ?? defaultRim, defaultRim, 1);
const rimRings = Math.max(1, Math.min(8, baseRim));
buffer[O.RimRings] = rimRings;
```

**Problem with Option B:** This requires `nZ` as an input, but `nZ` is computed in `populateResolution()`. Circular dependency.

**Recommendation:** Option A — explicit `populateTopology()` method, called after computing local variables.

---

## Revised Order of Operations

1. **Step 3f-0 (Hotfix):** Remove topology writes from `populateGeometry()`, add new `populateTopology()` method
2. **Step 3f-1:** Integrate `populateResolution()` 
3. **Step 3f-2:** Integrate `populateTopology()` call after local variable computation
4. **Step 3f-3:** Integrate `populateLighting()`
5. **Step 3f-4:** Integrate `populateFeatureFlags()`
6. **Step 3f-5:** Integrate `populateCamera()`
7. **Step 3f-6:** Remove dead helpers (`clampNumber`, `sanitizeInt`, `writeVec3`, `buildUniformBlock`)

---

## Risk Analysis

### High Risk: ViewProjection Matrix Handling

The inline code has a **matrix validity check** (lines 3808-3849) that nudges `rotX` and rebuilds the camera rig if `viewProjection` contains NaN/Infinity values. This logic CANNOT be moved into `populateCamera()` because it modifies `state.rotX` and calls `getCachedRig()` — operations that belong at the caller level.

**Mitigation:** Keep the validity check in `webgpu_core.ts` as a post-population hook:
```typescript
uniformBlock.populateCamera(state, cameraRig, paddingHint);

// Matrix validity check — nudge rotX if VP is degenerate
if (!isFiniteMat(cameraRig.viewProjection) || !isFiniteVec3(cameraRig.eye)) {
  // Nudge and rebuild rig...
  // Then re-populate camera with fixed values
  uniformBlock.populateCamera(state, fixedCameraRig, paddingHint);
}
```

### Medium Risk: Offset Constant Drift

UniformBlock.ts re-exports offset constants for backward compatibility (lines 577-594). If `camera_constants.ts` defines different values, imports could silently resolve to the wrong constant.

**Mitigation:** Verify all imports resolve to UniformBlock.ts after integration.

### Low Risk: `sceneRadius` Circular Reference

`state.sceneRadius` is used both as INPUT to `populateCamera()` and UPDATED within the render loop. The current code updates `state.sceneRadius` BEFORE calling the inline writes, so `populateCamera()` would see the updated value. Order is preserved — no issue.

---

## Validation Protocol

### Per-Step Validation (run after each step):
```bash
cd potfoundry-web
npm run typecheck    # Must pass with 0 errors
npm run lint         # Must pass with 0 warnings (max-warnings=0)
npm test            # All 1966 tests must pass
```

### Visual Validation (after Step 3f-5):
1. `npm run dev`
2. Open preview, rotate camera 360° on both axes
3. Verify no visual artifacts (inverted view, wrong lighting, broken projection)
4. Test perspective and orthographic modes
5. Test zoom, pan, and preset view buttons

### Buffer Comparison (optional, high confidence):
Add temporary `console.log(f32.slice(0, 76))` before and after migration to compare buffer contents byte-by-byte.

---

## Rollback Plan

Each step is a separate Git commit:
```
git commit -m "fix(UniformBlock): add populateTopology method"
git commit -m "refactor(webgpu_core): integrate populateResolution"
git commit -m "refactor(webgpu_core): integrate populateTopology"
git commit -m "refactor(webgpu_core): integrate populateLighting"
git commit -m "refactor(webgpu_core): integrate populateFeatureFlags"
git commit -m "refactor(webgpu_core): integrate populateCamera"
git commit -m "chore(webgpu_core): remove dead helper functions"
```

To rollback any step: `git revert <commit-sha>`

---

## Assumptions (For Verifier to Attack)

1. **The `populateGeometry()` integration in Step 3e is currently buggy** — topology params (offsets 27, 28, 30) are written with wrong values. The inline writes AFTER `populateGeometry()` silently overwrite them, masking the bug.

2. **The ViewProjection matrix validity check must remain in webgpu_core.ts** — it cannot be encapsulated in `populateCamera()` because it needs to modify caller scope and rebuild the rig.

3. **Helper function removal is safe after all methods are integrated** — no other code in webgpu_core.ts depends on the local `clampNumber`/`sanitizeInt`/`writeVec3` definitions.

4. **Camera constant re-exports from UniformBlock.ts are authoritative** — all imports should resolve to UniformBlock, not camera_constants.ts.

5. **The 43 UniformBlock tests provide sufficient coverage** — any offset mismatch will be caught.

---

## Open Questions

1. **Should we migrate SceneRadius to populateGeometry()?** It's currently written in the camera block at offset 33, but semantically it's a scene parameter derived from geometry.

2. **Should `populateTopology()` be a separate method or merged into an extended `populateResolution()`?** Arguments for separate: clean single-responsibility. Arguments for merged: fewer method calls.

3. **Should the matrix validity check be formalized as `UniformBlock.validateCamera()` with a callback for nudging?** This would keep all buffer-related logic in UniformBlock while allowing caller-controlled recovery.

---

## Estimated LOC Impact

| Action | Lines Removed | Lines Added | Net |
|--------|--------------|-------------|-----|
| Step 3f-0: populateTopology | 0 | 15 | +15 |
| Step 3f-1: populateResolution | 3 | 1 | -2 |
| Step 3f-2: populateTopology call | 3 | 1 | -2 |
| Step 3f-3: populateLighting | 9 | 1 | -8 |
| Step 3f-4: populateFeatureFlags | 2 | 1 | -1 |
| Step 3f-5: populateCamera | 25 | 1 | -24 |
| Step 3f-6: Dead code removal | 40 | 0 | -40 |

**Total: ~62 lines removed from webgpu_core.ts**

---

## Summary

Phase 3f is more complex than initially scoped. The critical discovery is that **Step 3e introduced a latent bug** in topology parameter handling. The integration must:

1. Fix the bug by separating topology params into a dedicated method
2. Integrate remaining methods in dependency order
3. Remove dead code only after all integrations are verified

The conservative incremental approach is recommended for a codebase where camera rendering is mission-critical.

---

*Generator awaiting Verifier critique.*
