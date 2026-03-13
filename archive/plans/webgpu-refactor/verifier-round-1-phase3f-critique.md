# Verifier Round 1 — Critique of Phase 3f UniformBlock Integration

Date: 2026-03-09

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's proposal is fundamentally sound and the bug hypothesis is **CONFIRMED**. However, there are two **CRITICAL** gaps that must be addressed before implementation can proceed.

---

## 1. Bug Hypothesis Verdict: **CONFIRMED** ✓

### Generator's Claim
`populateGeometry()` in UniformBlock.ts writes topology params (offsets 27, 28, 30) with incorrect default values (100, 20, 10) that are then overwritten by inline code in webgpu_core.ts.

### Actual Behavior — Evidence

**UniformBlock.ts lines 402-404:**
```typescript
buffer[O.InnerSegments] = clampNumber(c.inner_y ?? c.innerY, 100.0);  // offset 27
buffer[O.BottomRings] = clampNumber(c.bottom_rings ?? c.bottomRings, 20.0);  // offset 28
buffer[O.RimRings] = clampNumber(c.rim_rings ?? c.rimRings, 10.0);  // offset 30
```

**webgpu_core.ts lines 3764-3770:**
```typescript
f32[27] = innerSeg;      // Math.max(1, baseInner) where baseInner is nZ-derived
f32[28] = bottomRings;   // Math.max(2, Math.min(24, baseBottom))
f32[30] = rimRings;      // Math.max(1, Math.min(8, baseRim))
```

**Call order verified (webgpu_core.ts line 3651):**
```typescript
uniformBlock.populateGeometry(cfg, current);  // Line 3651 - writes defaults
// ... 113 lines later ...
f32[27] = innerSeg;                           // Line 3764 - overwrites with computed
```

### Bug Classification

This is a **LATENT BUG with Code Smell**:
- Currently NOT causing incorrect output (inline code always runs after populateGeometry)
- WOULD become an active bug if inline code were removed (thinking populateGeometry handles it)
- The static defaults (100, 20, 10) violate the actual constraints:
  - `innerSeg` should default to nZ, not 100
  - `bottomRings` max is 24, but default 20 is OK
  - `rimRings` max is 8, but default 10 **EXCEEDS MAX** — this would be a bug if used

---

## 2. Formula Verification

| Method | Status | Evidence |
|--------|--------|----------|
| `populateResolution()` | ✓ **EXACT MATCH** | MIN_THETA=3 matches MIN_THETA_STATIC. Formula `Math.min(1024, Math.max(3, x))` identical. |
| `populateLighting()` | ✓ **EXACT MATCH** | specular: `Math.min(Math.max(clampNumber(x, 0.4), 0), 1)` — identical. roughness: `Math.min(Math.max(clampNumber(x, 0.45), 0.02), 1)` — identical. |
| `populateFeatureFlags()` | ✓ **EXACT MATCH** | `showInner !== false ? 1 : 0` and `showGrid ? 1 : 0` — identical. |
| `populateCamera()` | ⚠️ **PARTIAL MATCH** | All 20+ offsets correct, BUT **missing VP nudge logic** (see C1 below) |
| `populateGeometry()` | ⚠️ **TOPOLOGY WRONG** | Topology defaults static, not nZ-derived (see C2 below) |

---

## 3. Critiques

### C1 [CRITICAL]: populateCamera Missing VP Nudge Logic

**Generator's implicit claim**: `populateCamera()` can replace inline camera writes.

**Actual behavior**: `populateCamera()` (UniformBlock.ts lines 476-519) does **NOT** include the ViewProjection matrix singularity handling.

**Missing logic from webgpu_core.ts lines 3815-3845:**
```typescript
// If the viewProjection contains non-finite values (common when rotX is near +/-90deg),
// gently nudge the pitch (rotX) away from the singularity and rebuild the camera rig.
if (!isFiniteMat(cameraRig.viewProjection) || !isFiniteVec3(cameraRig.eye)) {
  emitDiagnostic('webgpu:invalid-vp-matrix', {...});
  
  // Nudge rotX slightly away from exact vertical
  const SIGN = Math.sign(state.rotX) || 1;
  const EPS = 1e-3;
  state.rotX = wrapAngle(state.rotX - SIGN * EPS);
  
  // Rebuild camera rig after nudging
  const rebuilt = getCachedRig(state, paddingHint);
  if (isFiniteMat(rebuilt.viewProjection) && isFiniteVec3(rebuilt.eye)) {
    for (let i = 0; i < 16; i++) f32[VP_MATRIX_OFFSET + i] = rebuilt.viewProjection[i];
    f32[CAMERA_EYE_OFFSET + 0] = rebuilt.eye[0];
    // ...
    cameraRig.viewProjection = rebuilt.viewProjection;
    cameraRig.eye = rebuilt.eye;
  }
}
```

**Failure scenario**: User rotates camera to nearly vertical (rotX ≈ ±π/2). `populateCamera()` writes NaN/Infinity values to VP matrix. Shader receives garbage. Mesh disappears or renders incorrectly.

**Required fix**: Either:
1. Add VP nudge logic to `populateCamera()` (complex — requires mutable state + getCachedRig), OR
2. Keep VP nudge logic in webgpu_core.ts and call it AFTER `populateCamera()` (simpler)

**Severity**: CRITICAL — blocks 3f-5 as written.

---

### C2 [WARNING]: Topology Defaults Are nZ-Dependent

**Generator's claim**: Create `populateTopology(nZ, params)` to fix the default issue.

**Actual webgpu_core.ts logic (lines 3736-3750):**
```typescript
const baseInner = sanitizeInt(cfg.innerSegments ?? cfg.inner_segments ?? baseNZ, baseNZ, 1);
const defaultBottom = Math.max(2, Math.min(24, Math.ceil(baseNZ * 0.25)));
const defaultRim = Math.max(1, Math.min(8, Math.ceil(baseNZ * 0.1)));
```

The defaults for topology params are **derived from nZ**:
- `innerSeg` defaults to `nZ`
- `bottomRings` defaults to `ceil(nZ * 0.25)` clamped to [2, 24]
- `rimRings` defaults to `ceil(nZ * 0.1)` clamped to [1, 8]

**Required fix**: `populateTopology()` MUST accept nZ as a parameter to compute correct defaults:

```typescript
populateTopology(
  params: Readonly<Partial<WebGPUParams>>,
  nZ: number  // Required for computing defaults
): void
```

**Severity**: WARNING — current proposal would compile but produce incorrect defaults without nZ input.

---

### C3 [NOTE]: Double-Write Pattern in Fallback Path

**Location**: webgpu_core.ts lines 4065-4067

```typescript
if (usingFallback) {
  f32[16] = resolvedCounts.nTheta;
  f32[17] = resolvedCounts.nZ;
  f32[27] = resolvedCounts.innerSeg;
  f32[28] = resolvedCounts.bottomRings;
  f32[30] = resolvedCounts.rimRings;
}
```

**Observation**: There are TWO places that write topology offsets:
1. Primary path (line 3764-3770)
2. Fallback path (lines 4065-4067) when geometry is invalid

**Impact**: After integrating `populateTopology()`, both write sites must be updated OR the fallback path must call `populateTopology()` as well.

**Severity**: NOTE — must be tracked during implementation.

---

## 4. Accepted Items

The following are verified correct and can proceed:

| Item | Evidence |
|------|----------|
| 3f-1: `populateResolution()` integration | Formula exact match verified |
| 3f-3: `populateLighting()` integration | Formula exact match verified |
| 3f-4: `populateFeatureFlags()` integration | Formula exact match verified |
| 3f-6: Dead helper removal | `clampNumber`, `sanitizeInt`, `writeVec3` have equivalents in UniformBlock.ts |

---

## 5. Risk Assessment Critique

### Generator's Assessment: 7-step conservative approach with 3f-5 (camera) marked "highest risk"

**Verifier's Assessment**: **AGREE — but understated**

The Camera integration (3f-5) is not just "highest risk" — it contains a **CRITICAL GAP** that would cause rendering failures at vertical camera angles. The Generator correctly identified camera as the risky step but did not discover the VP nudge logic gap.

### Step Order Critique

Generator's proposed order is correct:
1. Hotfix topology first (3f-0) — prevents future bugs
2. Resolution before Camera — Camera needs nZ for aspect calculations
3. Camera last in the integration sequence — allows iterative validation
4. Dead code removal last (3f-6) — only after all integrations verified

### Step Combination Assessment

Q: *Could steps be combined safely?*

A: Steps 3f-1/3f-3/3f-4 (Resolution, Lighting, FeatureFlags) COULD be combined — they are independent leaf operations that don't interact. However, given the 5500+ line file size and the discovered Camera gap, the conservative approach is justified.

---

## 6. Open Questions for Generator

1. **VP Nudge Architecture Decision**: Should the VP nudge logic:
   - (a) Be added to `populateCamera()` — requires mutable state handling
   - (b) Remain in webgpu_core.ts as post-processing — simpler but less encapsulated
   - (c) Be extracted to a separate `validateAndNudgeCamera()` method?

2. **Topology Signature**: Should `populateTopology(params, nZ)` take nZ directly, or should it access the buffer to read the already-written nZ value at offset 17?

3. **Fallback Path Handling**: Will the geometry-invalid fallback path (line 4063-4070) also use `populateTopology()`, or remain as direct writes?

---

## 7. Implementation Conditions (if ACCEPT)

For the Generator's proposal to earn **ACCEPT**:

### MANDATORY (C1 resolution):
- [ ] Either add VP nudge logic to `populateCamera()`, OR
- [ ] Document that VP nudge remains in webgpu_core.ts with explicit call after `populateCamera()`

### MANDATORY (C2 resolution):
- [ ] `populateTopology()` signature must accept nZ parameter
- [ ] Default computations must match the nZ-derived formulas

### RECOMMENDED:
- [ ] Address fallback path writes (C3) in the implementation plan
- [ ] Add unit tests for topology defaults at various nZ values
- [ ] Add unit test for camera at rotX = ±π/2 (singularity case)

---

## 8. Final Verdict

**ACCEPT WITH AMENDMENTS**

The Generator's Phase 3f proposal demonstrates correct understanding of the codebase and identifies a real latent bug. The 7-step approach is appropriately conservative. However, the Camera integration (3f-5) contains a critical gap that must be addressed in the next Generator revision.

**Path to Full ACCEPT**:
1. Generator revises 3f-5 to explicitly handle VP nudge logic
2. Generator revises 3f-0 to add nZ parameter to `populateTopology()`
3. Generator addresses fallback path in implementation notes

Once these amendments are incorporated, this proposal can proceed to implementation by the Executioner.

---

*Verifier Agent — Round 1 Complete*
