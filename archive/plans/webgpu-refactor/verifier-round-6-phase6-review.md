# Verifier Review — Phase 6: Vec3 Utilities Consolidation

**Date:** 2026-03-10  
**Reviewer:** Verifier Agent  
**Proposal:** `generator-round-6-webgpu-core-phase6.md`

---

## Verdict: ACCEPT WITH AMENDMENTS

The proposal is **sound**. All five assumptions hold under code inspection. However, there are minor factual errors in consumer counts that warrant correction before execution.

---

## Assumption Verification

### A1: Implementations are functionally identical ✅ VERIFIED

**Evidence:**

| File | Function | Implementation | Line |
|------|----------|----------------|------|
| camera_basis.ts | vec3Length | `Math.hypot(v[0], v[1], v[2])` | L24 |
| webgpu_core.ts | vec3Length | `Math.hypot(v[0], v[1], v[2])` | L399 |
| AxisOverlay.ts | vec3Length | `Math.hypot(v[0], v[1], v[2])` | L67 |

**vec3Normalize comparison:**

```typescript
// camera_basis.ts L25-29
const vec3Normalize = (v: Vec3): Vec3 => {
  const len = vec3Length(v);
  if (!Number.isFinite(len) || len < 1e-8) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
};

// webgpu_core.ts L400-406
const vec3Normalize = (v: Vec3): Vec3 => {
  const len = vec3Length(v);
  if (!Number.isFinite(len) || len < 1e-8) {
    return [0, 0, 0];
  }
  return [v[0] / len, v[1] / len, v[2] / len];
};
```

**Same semantics:**
- Same epsilon: `1e-8`
- Same `Number.isFinite` guard
- Same fallback: `[0, 0, 0]`
- Only formatting differs (single-line vs braced return)

**vec3Scale:** Byte-for-byte identical across all three files.

**VERDICT:** No semantic difference. Safe to consolidate.

---

### A2: No module-local shadowing dependency ✅ VERIFIED

**Evidence:**

All 25 call sites in webgpu_core.ts reference `vec3Length`, `vec3Normalize`, or `vec3Scale` as bare identifiers:
- No `this.vec3Scale(...)` patterns
- No closure captures of these functions
- No dynamic binding via `bind()` or `call()`

The functions are **pure** with no side-effects:
- Inputs: `Vec3` tuple
- Outputs: `number` or `Vec3`
- No state mutation

**VERDICT:** No shadowing or scoping concerns.

---

### A3: Tree-shaking preserved after export ✅ VERIFIED

**Evidence:**

- ESBuild (used by vite in potfoundry-web) handles named exports correctly
- All target functions are **pure** (no side effects at import time)
- No IIFE patterns or module-level execution dependent on these definitions
- Existing exports `vec3Dot` and `vec3Subtract` already work without bundle bloat

**VERDICT:** Tree-shaking unaffected.

---

### A4: Type + value imports work together in AxisOverlay.ts ✅ VERIFIED

**Current AxisOverlay.ts L17-18:**
```typescript
import type { CameraRig } from './types';
import type { CameraBasis, Vec3 } from './camera_basis';
```

**Proposed change:**
```typescript
import type { CameraRig } from './types';
import { type CameraBasis, type Vec3, vec3Length, vec3Scale } from './camera_basis';
```

**Verification:** TypeScript 4.5+ supports inline `type` modifiers. This syntax is valid and will compile correctly. The project's `tsconfig.json` targets ES2020+ which supports this.

**VERDICT:** Syntax is valid TypeScript.

---

### A5: No circular import risk ✅ VERIFIED

**Evidence:**

1. `camera_basis.ts` has **zero imports** from any other module in the project:
   - Grep for `^import` in camera_basis.ts: **No results**
   - File is self-contained with only built-in JS dependencies

2. Dependency graph remains strictly one-way:
   ```
   camera_basis.ts (source of truth)
       │
       ├─── webgpu_core.ts (consumer)
       │         └── L40: Vec3 as HelperVec3
       │         └── L51-52: vec3Dot, vec3Subtract
       │
       └─── AxisOverlay.ts (consumer)
             └── L18: type CameraBasis, Vec3
   ```

3. webgpu_core.ts already imports from camera_basis.ts at L35-53 without cycles.

**VERDICT:** No circular import possible.

---

## Errors Found in Generator Proposal

### E1 [WARNING]: vec3Length consumer count incorrect

**Generator claim:** "5 call sites in webgpu_core.ts"

**Actual count:** **9 call sites**

| Line | Usage |
|------|-------|
| L401 | `vec3Length(v)` (inside vec3Normalize) |
| L2547 | `vec3Length(vec3Subtract(target, eye))` |
| L2688 | `vec3Length(vec3Subtract(currentRig.eye, targetVec))` |
| L2758 | `vec3Length(vec3Subtract(rigCheck.eye, target))` |
| L2759 | `vec3Length(vec3Subtract(rigCheck.eye, target))` |
| L3161 | `vec3Length(vec3Subtract(currentRig.eye, targetVec))` |
| L3202 | `vec3Length(vec3Subtract(rigCheck.eye, targetVec))` |
| L3203 | `vec3Length(vec3Subtract(rigCheck.eye, targetVec))` |
| L3610 | `vec3Length(cameraRig.eye)` (diagnostic) |

**Impact:** None on extraction strategy. All 9 call sites will work identically with imported function.

---

### E2 [NOTE]: vec3Normalize consumer count minor error

**Generator claim:** "3 call sites"

**Actual count:** **2 call sites**

| Line | Usage |
|------|-------|
| L2457 | `vec3Normalize(vec3Subtract(hit, state.freePosition))` |
| L2537 | `vec3Normalize(basis.forward)` |

**Impact:** None. Likely Generator included the definition itself in count.

---

### E3 [NOTE]: Line number range off-by-one

**Generator claim:** "webgpu_core.ts (L399-408)"

**Actual range:** L399-407 (9 lines)

```
L399: const vec3Length = ...
L400-406: const vec3Normalize = { ... };
L407: const vec3Scale = ...
```

**Impact:** None. The 9-line LOC reduction claim is still correct.

---

## Amendments Required

### AMD1: Update consumer counts in proposal documentation

Before execution, correct the documentation for accuracy:
- vec3Length: 9 call sites (not 5)
- vec3Normalize: 2 call sites (not 3)

This is **documentation hygiene**, not a blocking concern.

---

## Risks Verified

| Risk | Status | Mitigation |
|------|--------|------------|
| Semantic change | ✅ None | Implementations identical |
| Type mismatch | ✅ None | webgpu_core.ts already aliases `Vec3 = HelperVec3` |
| Import cycle | ✅ None | camera_basis.ts has no imports |
| Bundle bloat | ✅ None | ESBuild tree-shakes unused exports |
| Runtime behavior change | ✅ None | Pure functions, no closures |

---

## Validation Protocol for Executioner

1. **Pre-flight checks:**
   ```bash
   cd potfoundry-web
   npm run typecheck  # Must pass
   npm run lint       # Must be clean
   npm test           # Must pass
   ```

2. **Execution order:**
   1. Add `export` keyword to vec3Length, vec3Normalize, vec3Scale in camera_basis.ts
   2. Update webgpu_core.ts imports to include vec3Length, vec3Normalize, vec3Scale
   3. Delete duplicate definitions from webgpu_core.ts L399-407
   4. Update AxisOverlay.ts import to mixed type+value
   5. Delete duplicate definitions from AxisOverlay.ts L67-69

3. **Post-flight checks:**
   ```bash
   npm run typecheck  # Must pass
   npm run lint       # Must be clean
   npm test           # Must pass
   npm run build      # Must succeed (verify tree-shaking)
   ```

4. **Manual verification:**
   - Load preview in browser
   - Verify camera rotation/zoom/pan still work
   - Check axis overlay renders correctly

---

## Recommendation

**ACCEPT WITH AMENDMENTS.**

The Generator's proposal is architecturally sound. The minor count errors do not affect the extraction strategy. The existing import pattern (vec3Dot, vec3Subtract) is proven and extends naturally to vec3Length, vec3Normalize, vec3Scale.

The Executioner may proceed with implementation.

---

*End of Verifier Round 6 Review*
