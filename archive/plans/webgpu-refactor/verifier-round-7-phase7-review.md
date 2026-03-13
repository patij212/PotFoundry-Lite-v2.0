# Verifier Review — Phase 7: MathHelpers.ts Extraction

Date: 2026-03-11

## Verdict: ACCEPT WITH AMENDMENTS

The core extraction plan is sound, but there are critical naming conflicts and missing consolidation targets that must be addressed before implementation.

---

## Assumption Verification

### A1: Inline mulMat4Vec4 instances identical
**Verdict: ✅ VERIFIED**

**Evidence:**
- [webgpu_core.ts#L3617-L3624](src/webgpu_core.ts#L3617-L3624):
```typescript
const mulMat4Vec4 = (m: Float32Array, x: number, y: number, z: number) => {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12] * 1;
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13] * 1;
  const cz = m[2] * x + m[6] * y + m[10] * z + m[14] * 1;
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15] * 1;
  return { x: cx, y: cy, z: cz, w: cw };
};
```

- [webgpu_core.ts#L4049-L4056](src/webgpu_core.ts#L4049-L4056):
```typescript
const mulMat4Vec4 = (m: Float32Array, x: number, y: number, z: number) => {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12] * 1;
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13] * 1;
  const cz = m[2] * x + m[6] * y + m[10] * z + m[14] * 1;
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15] * 1;
  return { x: cx, y: cy, z: cz, w: cw };
};
```

**Analysis**: Character-for-character identical. Safe to consolidate.

---

### A2: No shadowing risks from new imports
**Verdict: ✅ VERIFIED**

**Evidence:**
- `wrapAngle` defined only at [webgpu_core.ts#L334](src/webgpu_core.ts#L334)
- `wrapTau` defined only at [webgpu_core.ts#L340](src/webgpu_core.ts#L340)  
- `clampZoomValue` defined only at [webgpu_core.ts#L309](src/webgpu_core.ts#L309)
- No other files in `potfoundry-web/src/` define or import these names
- `camera_basis.ts` mentions `wrapAngle`/`wrapTau` in comments only (L9-10), no actual definitions

**Safe to import** — no shadowing risk.

---

### A3: mulMat4Vec4Full vs AxisOverlay's version serve distinct purposes
**Verdict: ✅ VERIFIED**

**Evidence:**
- [AxisOverlay.ts#L72-L84](src/AxisOverlay.ts#L72-L84) returns `{ x: number; y: number; w: number }` (3 components)
- Inline versions return `{ x: number; y: number; z: number; w: number }` (4 components)

```typescript
// AxisOverlay version (L72-84):
const mulMat4Vec4 = (m: Float32Array, x: number, y: number, z: number): { x: number; y: number; w: number } => {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return {
    x: m[0] * x + m[4] * y + m[8] * z + m[12],
    y: m[1] * x + m[5] * y + m[9] * z + m[13],
    w: w,  // <-- NO Z COMPONENT
  };
};
```

**Analysis**: AxisOverlay version omits z-component for 2D overlay projection. Inline versions need z for NDC depth checks. Cannot be merged — correctly identified by Generator.

---

### A4: CameraController only receives clampZoomValue via interface
**Verdict: ✅ VERIFIED**

**Evidence:**
- [camera_controller.ts#L110](src/camera_controller.ts#L110): `clampZoomValue?: (v: number) => number;` in ControllerHelpers
- [camera_controller.ts#L730](src/camera_controller.ts#L730): `this.helpers.clampZoomValue?.(this.state.zoom * factor)`
- [camera_controller.ts#L820](src/camera_controller.ts#L820): `this.helpers.clampZoomValue?.(this.state.zoom * focusZoomFactor)`
- [camera_controller.ts#L1299](src/camera_controller.ts#L1299): `this.helpers.clampZoomValue?.(this.state.zoom * factor)`
- [camera_controller.ts#L1409](src/camera_controller.ts#L1409): `this.helpers.clampZoomValue?.(newZoom)`
- [webgpu_core.ts#L2172](src/webgpu_core.ts#L2172): Passed as `clampZoomValue: (v: number) => clampZoomValue(v)`

**Analysis**: CameraController never imports clampZoomValue directly. Safe to extract without breaking controller.

---

### A5: Pure function extraction has no closure overhead
**Verdict: ✅ VERIFIED**

**Evidence:**
All four functions use only:
- `Math.PI`, `Math.max`, `Math.min`, `Number.isFinite` — global constants/functions
- Function parameters — no external state
- Locally-defined constants (`minZoom`, `maxZoom`, `twoPi`)

**Analysis**: Zero closure capture. Safe to extract to module scope.

---

## Errors Found

### E1 [CRITICAL]: MIN_ZOOM/MAX_ZOOM Name Collision

**Generator's claim**: Export `MIN_ZOOM = 0.25` and `MAX_ZOOM = 4.0` from MathHelpers.ts

**Actual conflict**: `camera_constants.ts` already exports:
```typescript
// camera_constants.ts L74-75
export const MIN_ZOOM = 0.1;   // Allow zooming out to see 10x the scene
export const MAX_ZOOM = 50.0;  // Allow zooming in to 1/50th of the scene
```

But `clampZoomValue` uses:
```typescript
// webgpu_core.ts L311-312
const minZoom = 0.25;
const maxZoom = 4.0;
```

**Problem**: Creating MathHelpers with `MIN_ZOOM = 0.25` and `MAX_ZOOM = 4.0` will cause:
1. **Name confusion** — two different constants with the same name
2. **Import ambiguity** — consumers might import the wrong one
3. **Semantic mismatch** — camera_constants values (0.1/50.0) appear to be legacy/unused

**Required fix**: Use different names in MathHelpers:
- `ZOOM_CLAMP_MIN = 0.25`
- `ZOOM_CLAMP_MAX = 4.0`

OR: Update camera_constants.ts to use 0.25/4.0 and import from there.

---

### E2 [WARNING]: camera_controller.ts Has Duplicated Zoom Bounds

**Location**: [camera_controller.ts#L684-L686](src/camera_controller.ts#L684-L686)
```typescript
const minZoom = 0.25;
const maxZoom = 4.0;
const zoomFromDepth = Math.max(minZoom, Math.min(maxZoom, paddedMax * CAMERA_DISTANCE_FALLOFF / Math.max(hitDepth, 1e-3)));
```

**Problem**: This is a third location with hardcoded 0.25/4.0 zoom limits, separate from `clampZoomValue`. The Generator's proposal does not address this duplication.

**Impact**: After extraction, there would still be three sources of truth for zoom bounds:
1. `MathHelpers.ZOOM_CLAMP_MIN/MAX` (proposed)
2. `camera_constants.MIN_ZOOM/MAX_ZOOM` (0.1/50.0 — different values!)
3. `camera_controller.ts L684-686` (hardcoded 0.25/4.0 — not consolidated)

**Required fix**: Either:
- Include camera_controller.ts L684-686 in the consolidation, OR
- Document this as a known duplication for future cleanup

---

### E3 [NOTE]: Generator Line Numbers Off by 1

**Generator claims**:
- mulMat4Vec4 at L3618, L4050

**Actual**:
- mulMat4Vec4 at L3617, L4049

**Impact**: Minor. 1-line drift, likely from recent edits. Does not affect extraction logic.

---

## Amendments Required

### Amendment 1: Rename Exported Constants (MANDATORY)

Change from:
```typescript
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4.0;
```

To:
```typescript
export const ZOOM_CLAMP_MIN = 0.25;
export const ZOOM_CLAMP_MAX = 4.0;
```

This avoids collision with `camera_constants.MIN_ZOOM`/`MAX_ZOOM`.

### Amendment 2: Document camera_controller.ts Duplication (RECOMMENDED)

Add a TODO comment at [camera_controller.ts#L684](src/camera_controller.ts#L684):
```typescript
// TODO(Phase 7): Consider importing ZOOM_CLAMP_MIN/MAX from MathHelpers
const minZoom = 0.25;  // Duplicated in MathHelpers.ts
const maxZoom = 4.0;   // Duplicated in MathHelpers.ts
```

### Amendment 3: Clarify camera_constants.ts Values (OPTIONAL)

The 0.1/50.0 values in camera_constants.ts appear to be legacy. If they're unused, consider:
1. Removing them, OR
2. Renaming to `LEGACY_MIN_ZOOM`/`LEGACY_MAX_ZOOM`, OR
3. Adding a comment explaining why they differ from clampZoomValue

---

## Risks Verified

| Risk | Status | Notes |
|------|--------|-------|
| Circular imports | ✅ Safe | MathHelpers.ts has no dependencies |
| Type changes | ✅ Safe | All signatures preserved exactly |
| Runtime behavior | ✅ Safe | Pure functions, no closures |
| Test coverage | ⚠️ Needs tests | Proposal includes test plan |
| Name collision | ❌ Blocked | Must rename MIN_ZOOM/MAX_ZOOM |

---

## Validation Protocol for Executioner

Before merging:
1. `npm run typecheck` — must pass
2. `npm run lint` — must pass with 0 warnings
3. `npm test` — all existing tests must pass
4. Verify MathHelpers.test.ts covers edge cases:
   - `wrapAngle(3.5)` → within [-π, π]
   - `wrapTau(7)` → within [-π, π]
   - `clampZoomValue(NaN)` → 1.0
   - `clampZoomValue(Infinity)` → 4.0 (not the camera_constants 50.0!)
   - `mulMat4Vec4Full` with identity matrix

---

## Recommendation

**ACCEPT WITH AMENDMENTS**

The extraction plan is fundamentally sound. The Generator correctly identified:
- ✅ Inline mulMat4Vec4 definitions are identical
- ✅ AxisOverlay's version is incompatible (different return type)
- ✅ CameraController uses interface injection, not direct import
- ✅ All functions are pure with no closure overhead

However, **Amendment 1 is blocking** — the MIN_ZOOM/MAX_ZOOM name collision must be resolved before implementation. Use `ZOOM_CLAMP_MIN`/`ZOOM_CLAMP_MAX` instead.

The Executioner may proceed once Generator acknowledges the naming change.

---

## Checklist for Generator Response

- [ ] Acknowledge E1 and rename constants to `ZOOM_CLAMP_MIN`/`ZOOM_CLAMP_MAX`
- [ ] Acknowledge E2 (camera_controller duplication) — confirm whether to consolidate or defer
- [ ] Update proposal with corrected names

Upon Generator acknowledgment, Verifier will issue final ACCEPT.
