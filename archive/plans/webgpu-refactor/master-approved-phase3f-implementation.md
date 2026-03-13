# Master Approved — Phase 3f: Complete UniformBlock Integration

**Date:** 2026-03-09  
**Status:** APPROVED FOR IMPLEMENTATION  
**Author:** Master Agent  
**Debate Round:** Generator R1 → Verifier R1 → Executioner R1  

---

## Decision: APPROVED

## Unanimous Agreement Status

| Agent | Status | Document |
|-------|--------|----------|
| **Generator** | Proposed 7-step plan | [generator-round-1-phase3f-uniformblock-integration.md](generator-round-1-phase3f-uniformblock-integration.md) |
| **Verifier** | ACCEPT_WITH_AMENDMENTS | [verifier-round-1-phase3f-critique.md](verifier-round-1-phase3f-critique.md) |
| **Executioner** | FEASIBLE | Inline review above |
| **Master** | APPROVED | This document |

---

## Problem Statement

`webgpu_core.ts` (~5356 lines) contains 25+ inline `f32[N] = value` writes despite `UniformBlock.ts` having production-ready population methods. Additionally:

1. **Latent topology bug:** `populateGeometry()` writes incorrect defaults (100, 20, 10) for topology params that are masked by inline overwrites
2. **Duplicated helpers:** `clampNumber`, `sanitizeInt`, `writeVec3` defined in both files
3. **Drift risk:** Offset constants defined in multiple locations

---

## Converged Implementation Plan

### Step 3f-0: Create `populateTopology()` Method [HOTFIX]

**Files:** `src/UniformBlock.ts`

**Action:** Add new method that accepts `nZ` to compute correct topology defaults:

```typescript
populateTopology(
  params: Readonly<Partial<WebGPUParams>>,
  nZ: number
): void {
  const c = params as Record<string, unknown>;

  // Compute defaults from nZ (matching webgpu_core.ts logic)
  const defaultInner = Math.max(1, nZ);
  const defaultBottom = Math.max(2, Math.min(24, Math.ceil(nZ * 0.25)));
  const defaultRim = Math.max(1, Math.min(8, Math.ceil(nZ * 0.1)));

  const baseInner = sanitizeInt(
    c.innerSegments ?? c.inner_segments ?? defaultInner,
    defaultInner,
    1
  );
  const baseBottom = sanitizeInt(
    c.bottom_rings ?? c.bottomRings ?? defaultBottom,
    defaultBottom,
    2
  );
  const baseRim = sanitizeInt(
    c.rim_rings ?? c.rimRings ?? defaultRim,
    defaultRim,
    1
  );

  buffer[O.InnerSegments] = Math.max(1, baseInner);
  buffer[O.BottomRings] = Math.max(2, Math.min(24, baseBottom));
  buffer[O.RimRings] = Math.max(1, Math.min(8, baseRim));
}
```

**Also:** Remove topology writes from `populateGeometry()` (lines ~402-404):
- Delete: `buffer[O.InnerSegments] = clampNumber(...)`
- Delete: `buffer[O.BottomRings] = clampNumber(...)`
- Delete: `buffer[O.RimRings] = clampNumber(...)`

**Validation:** `npm run typecheck && npm run lint && npm test`

---

### Step 3f-1: Integrate `populateResolution()` Call

**Files:** `src/webgpu_core.ts`

**Before** (lines 3752-3754):
```typescript
f32[16] = nTheta;
f32[17] = nZ;
f32[18] = debugActive ? 1 : 0;
```

**After:**
```typescript
uniformBlock.populateResolution(cfg, state, debugActive);
```

**Note:** Keep local `nTheta`, `nZ` variable declarations — they're used for diagnostics and mesh calculations.

**Validation:** `npm run typecheck && npm run lint && npm test`

---

### Step 3f-2: Integrate `populateTopology()` Call

**Files:** `src/webgpu_core.ts`

**Before** (lines 3764-3770):
```typescript
f32[27] = innerSeg;
f32[28] = bottomRings;
f32[30] = rimRings;
```

**After:**
```typescript
uniformBlock.populateTopology(cfg, nZ);
```

**Critical ordering:** Must be called AFTER local `nZ` is computed but BEFORE geometry-dependent code.

**Note:** Keep local `innerSeg`, `bottomRings`, `rimRings` declarations — they're used for diagnostics.

**Also update fallback path** (lines 4063-4067):
```typescript
// Before:
f32[27] = resolvedCounts.innerSeg;
f32[28] = resolvedCounts.bottomRings;
f32[30] = resolvedCounts.rimRings;

// After: Keep as direct writes OR call populateTopology with resolvedCounts.nZ
```

**Validation:** `npm run typecheck && npm run lint && npm test`

---

### Step 3f-3: Integrate `populateLighting()` Call

**Files:** `src/webgpu_core.ts`

**Before** (lines 3759-3763, 3785-3788):
```typescript
f32[22] = clampNumber(cfg.ambient, 0.0);
f32[23] = clampNumber(cfg.diffuse, 0.0);
f32[24] = clampNumber(cfg.fresnel, 0.25);
f32[25] = clampNumber(cfg.t_wall, 3.0);
f32[26] = clampNumber(cfg.t_bottom, 3.0);
// ...
f32[SPECULAR_GAIN_OFFSET] = specular;
f32[ROUGHNESS_OFFSET] = roughness;
```

**After:**
```typescript
uniformBlock.populateLighting(cfg);
```

**Validation:** `npm run typecheck && npm run lint && npm test`

---

### Step 3f-4: Integrate `populateFeatureFlags()` Call

**Files:** `src/webgpu_core.ts`

**Before** (lines 3781, 3797):
```typescript
f32[GRID_FLAG_OFFSET] = state.showGrid ? 1 : 0;
// ...
f32[SHOW_INNER_OFFSET] = showInner ? 1 : 0;
```

**After:**
```typescript
uniformBlock.populateFeatureFlags(cfg, state);
```

**Validation:** `npm run typecheck && npm run lint && npm test`

---

### Step 3f-5: Integrate `populateCamera()` Call [HIGHEST RISK]

**Files:** `src/webgpu_core.ts`

**Before** (lines 3755-3803):
```typescript
f32[19] = state.rotX;
f32[20] = state.rotY;
f32[21] = state.zoom;
f32[29] = state.panX;
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
for (let i = 0; i < 16; i++) f32[VP_MATRIX_OFFSET + i] = cameraRig.viewProjection[i];
```

**After:**
```typescript
uniformBlock.populateCamera(state, cameraRig, paddingHint);
```

**CRITICAL: PRESERVE VP NUDGE LOGIC (C1)**

The ViewProjection matrix singularity check (lines 3805-3845) MUST remain in webgpu_core.ts:

```typescript
// This block stays EXACTLY as-is after populateCamera() call
if (!isFiniteMat(cameraRig.viewProjection) || !isFiniteVec3(cameraRig.eye)) {
  emitDiagnostic('webgpu:invalid-vp-matrix', {...});
  
  const SIGN = Math.sign(state.rotX) || 1;
  const EPS = 1e-3;
  state.rotX = wrapAngle(state.rotX - SIGN * EPS);
  
  const rebuilt = getCachedRig(state, paddingHint);
  if (isFiniteMat(rebuilt.viewProjection) && isFiniteVec3(rebuilt.eye)) {
    // Direct writes to f32 buffer — correct because f32 = uniformBlock.buffer
    for (let i = 0; i < 16; i++) f32[VP_MATRIX_OFFSET + i] = rebuilt.viewProjection[i];
    f32[CAMERA_EYE_OFFSET + 0] = rebuilt.eye[0];
    f32[CAMERA_EYE_OFFSET + 1] = rebuilt.eye[1];
    f32[CAMERA_EYE_OFFSET + 2] = rebuilt.eye[2];
    cameraRig.viewProjection = rebuilt.viewProjection;
    cameraRig.eye = rebuilt.eye;
  }
}
```

**Rationale:** The VP nudge logic mutates `state.rotX` and rebuilds the camera rig — operations that require access to `getCachedRig()` and diagnostic emission, which belong at the caller level, not inside UniformBlock.

**Validation:** 
1. `npm run typecheck && npm run lint && npm test`
2. **Visual test:** Rotate camera to near-vertical angles, verify no visual artifacts
3. **Diagnostic check:** Confirm `webgpu:invalid-vp-matrix` emits correctly at edge cases

---

### Step 3f-6: Remove Dead Helpers

**Files:** `src/webgpu_core.ts`

**Delete these functions** (now available from UniformBlock.ts):
- `buildUniformBlock` (lines 410-414) — replaced by `createUniformBlock`
- `clampNumber` (lines 417-422) — exported from UniformBlock
- `writeVec3` (lines 498-502) — exported from UniformBlock

**Keep but do NOT delete:**
- `sanitizePadding` — not duplicated, used only in webgpu_core.ts
- `vec3Length`, `vec3Normalize`, etc. — not duplicated, used for camera math

**Update imports** if any remaining code references the removed helpers:
```typescript
// If needed, add to existing import:
import { createUniformBlock, clampNumber, writeVec3 } from './UniformBlock';
```

**Validation:** `npm run typecheck && npm run lint && npm test`

---

## Answers to Executioner Questions

**Q1: Should `populateTopology()` handle `SceneRadius`?**  
**A:** No. `SceneRadius` (offset 33) is semantically camera-related (scene fitting), not topology. It stays in `populateCamera()`.

**Q2: Should `populateAll()` be updated?**  
**A:** Yes. After adding `populateTopology()`, update `populateAll()` call chain:
```typescript
populateAll(config: UniformBlockConfig & { nZ: number }): void {
  this.populateGeometry(config.params, config.params);
  this.populateResolution(config.params, config.state, config.debugActive);
  this.populateTopology(config.params, config.nZ);  // NEW
  this.populateCamera(config.state, config.cameraRig, config.paddingHint);
  this.populateLighting(config.params);
  this.populateFeatureFlags(config.params, config.state);
}
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| VP nudge logic accidentally removed | Low | **HIGH** | Step 3f-5 explicitly preserves it |
| Topology defaults wrong after 3f-0 | Low | Medium | Unit tests verify bounds |
| Camera offset mismatch | Low | HIGH | Visual test at step 3f-5 |
| Performance regression | Very Low | Low | Method calls are inlined by V8 |

---

## Estimated Impact

| Metric | Value |
|--------|-------|
| LOC removed from webgpu_core.ts | ~65 |
| LOC added to UniformBlock.ts | ~25 |
| Net reduction | **~40 LOC** |
| Time estimate | 2-3 hours (with validation) |

---

## Validation Protocol

### Per-Step (MANDATORY)
```bash
cd potfoundry-web
npm run typecheck    # 0 errors
npm run lint         # 0 warnings
npm test             # 1966+ tests pass
```

### Post-3f-5 (MANDATORY)
1. Start dev server: `npm run dev`
2. Rotate camera 360° on both axes
3. Test near-vertical angles (rotX ≈ ±85°)
4. Verify perspective and orthographic modes
5. Test zoom, pan, and view preset buttons
6. Confirm no visual artifacts

### Optional (High Confidence)
Add temporary buffer comparison:
```typescript
const before = f32.slice(0, 76).join(',');
// ... integration calls ...
const after = f32.slice(0, 76).join(',');
console.assert(before === after, 'Buffer mismatch detected');
```

---

## Git Workflow

```bash
git checkout -b feat/phase3f-uniformblock-integration

# Step 3f-0
git commit -m "fix(UniformBlock): add populateTopology method, fix topology defaults"

# Step 3f-1
git commit -m "refactor(webgpu_core): integrate populateResolution"

# Step 3f-2
git commit -m "refactor(webgpu_core): integrate populateTopology"

# Step 3f-3
git commit -m "refactor(webgpu_core): integrate populateLighting"

# Step 3f-4
git commit -m "refactor(webgpu_core): integrate populateFeatureFlags"

# Step 3f-5
git commit -m "refactor(webgpu_core): integrate populateCamera, preserve VP nudge"

# Step 3f-6
git commit -m "chore(webgpu_core): remove dead helper functions"

git push -u origin feat/phase3f-uniformblock-integration
```

---

## Rollback Plan

If any step fails validation:
1. `git reset --hard HEAD~1` to revert that step
2. Investigate failure (typecheck error, test failure, visual artifact)
3. Fix the issue and re-commit
4. If unfixable, escalate to Generator/Verifier debate

---

## Master Sign-Off

**I, the Master Agent, approve this plan for implementation.**

All three specialist agents have converged:
- Generator proposed a sound incremental approach
- Verifier identified and addressed critical gaps (C1: VP nudge, C2: nZ parameter)
- Executioner confirmed feasibility and type safety

**Next agent:** The Executioner should implement steps 3f-0 through 3f-6 following this plan exactly, with full validation between each step.

**Key constraints to enforce:**
1. VP nudge logic (lines 3805-3845) MUST stay in webgpu_core.ts
2. `populateTopology()` MUST accept nZ parameter
3. Each step MUST pass typecheck/lint/test before proceeding

---

*Document generated after Generator/Verifier/Executioner debate cycle. All agents reached unanimous agreement.*
