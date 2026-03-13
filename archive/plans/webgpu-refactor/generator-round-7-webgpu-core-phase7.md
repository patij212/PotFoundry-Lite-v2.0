# Generator Proposal — Phase 7: MathHelpers.ts Extraction

Date: 2026-03-11

## Summary

Extract `wrapAngle`, `wrapTau`, `clampZoomValue`, and a full-precision `mulMat4Vec4` into a new `MathHelpers.ts` module. This consolidates scattered math utilities, eliminates code duplication, and completes the math module trilogy (camera_basis → MatrixMath → MathHelpers) with ~35 LOC reduction and improved testability.

## Problem Statement

`webgpu_core.ts` (5,077 lines) contains:
1. **Angle wrapping utilities** (`wrapAngle`, `wrapTau`) defined at module level but only used internally
2. **Zoom clamping** (`clampZoomValue`) used both internally and passed to `CameraController`
3. **Duplicated mulMat4Vec4** — two identical 6-line implementations at L3618 and L4050 inside `mount()`, separate from the incompatible 3-component version imported from AxisOverlay.ts

The duplication is particularly egregious: the inline `mulMat4Vec4` definitions return `{x, y, z, w}` for NDC depth calculations, while `AxisOverlay.mulMat4Vec4` returns only `{x, y, w}` (no z-component). This prevents simple consolidation without API changes.

## Target Functions

| Function | Location | LOC | Usages in webgpu_core.ts |
|----------|----------|-----|--------------------------|
| `wrapAngle` | L334-338 | 5 | 11 (L414, L415, L470, L2612, L2616, L3544, L4299, L4302, L4526, L4530, L4856) |
| `wrapTau` | L340-346 | 7 | 3 (L2560, L4744, L4825) |
| `clampZoomValue` | L309-314 | 6 | 2 internal + 1 passed to controller (L536, L2172, L4682) |
| `mulMat4Vec4` (inline) | L3618-3624 | 7 | 1 local scope |
| `mulMat4Vec4` (inline) | L4050-4056 | 7 | 1 local scope |

**Total extractable: ~32 LOC definitions**

## Dependency Analysis

### wrapAngle
```typescript
const wrapAngle = (v: number): number => {
  while (v > Math.PI) v -= 2 * Math.PI;
  while (v <= -Math.PI) v += 2 * Math.PI;
  return v;
};
```
- **Imports**: None (pure math)
- **Semantics**: Maps angle to [-π, π] range (canonical Euler)
- **Consumers**: `applyCameraEuler`, host payload sync, auto-rotate, initial params

### wrapTau
```typescript
const wrapTau = (v: number): number => {
  const twoPi = 2 * Math.PI;
  let r = v % twoPi;
  if (r > Math.PI) r -= twoPi;
  if (r <= -Math.PI) r += twoPi;
  return r;
};
```
- **Imports**: None (pure math)
- **Semantics**: Same output range as wrapAngle, but uses modulo (faster for large angles)
- **Consumers**: Auto-rotate increment, inertia rotation

### clampZoomValue
```typescript
const clampZoomValue = (v: number): number => {
  if (!Number.isFinite(v)) return 1.0;
  const minZoom = 0.25;
  const maxZoom = 4.0;
  return Math.max(minZoom, Math.min(maxZoom, v));
};
```
- **Imports**: None (pure math)
- **Constants**: minZoom=0.25, maxZoom=4.0 (should be exported)
- **Consumers**: `computeCameraRig`, controller helpers, focus tween

### mulMat4Vec4Full (proposed name)
```typescript
const mulMat4Vec4Full = (m: Float32Array, x: number, y: number, z: number) => {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cz = m[2] * x + m[6] * y + m[10] * z + m[14];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return { x: cx, y: cy, z: cz, w: cw };
};
```
- **Imports**: None (pure math)
- **Semantics**: Full 4-component matrix-vector multiply for NDC depth checks
- **Note**: Different from AxisOverlay's 3-component version (which omits z for 2D overlay projection)

## Consumer Analysis

### Internal to webgpu_core.ts
- `applyCameraEuler()` → uses `wrapAngle` for state normalization
- `computeCameraRig()` → uses `clampZoomValue` for zoom bounds
- Render loop → uses `wrapTau` for continuous rotation, `wrapAngle` for commit
- Diagnostic blocks → use inline `mulMat4Vec4` for NDC bounds checks

### External Consumers
- `CameraController` receives `clampZoomValue` via `ControllerHelpers.clampZoomValue`
- `camera_basis.ts` mentions `wrapTau`/`wrapAngle` in comments but doesn't import them

## Proposals

### Proposal 1: MathHelpers.ts (Recommended — Moderate)

**Idea**: Create `src/MathHelpers.ts` with all four utilities plus exported constants.

**New File Structure**:
```typescript
// src/MathHelpers.ts

/** Zoom bounds for camera (25% to 400%) */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4.0;

/** Wrap angle to [-π, π] range (canonical Euler angles) */
export const wrapAngle = (v: number): number => {
  while (v > Math.PI) v -= 2 * Math.PI;
  while (v <= -Math.PI) v += 2 * Math.PI;
  return v;
};

/** Wrap angle to [-π, π] using modulo (faster for large angles) */
export const wrapTau = (v: number): number => {
  const twoPi = 2 * Math.PI;
  let r = v % twoPi;
  if (r > Math.PI) r -= twoPi;
  if (r <= -Math.PI) r += twoPi;
  return r;
};

/** Clamp zoom to valid range, returning 1.0 for invalid input */
export const clampZoomValue = (v: number): number => {
  if (!Number.isFinite(v)) return 1.0;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v));
};

/** Full 4-component matrix-vector multiply (for NDC depth checks) */
export const mulMat4Vec4Full = (
  m: Float32Array,
  x: number,
  y: number,
  z: number
): { x: number; y: number; z: number; w: number } => ({
  x: m[0] * x + m[4] * y + m[8] * z + m[12],
  y: m[1] * x + m[5] * y + m[9] * z + m[13],
  z: m[2] * x + m[6] * y + m[10] * z + m[14],
  w: m[3] * x + m[7] * y + m[11] * z + m[15],
});
```

**Changes to webgpu_core.ts**:
1. Add import: `import { wrapAngle, wrapTau, clampZoomValue, mulMat4Vec4Full, MIN_ZOOM, MAX_ZOOM } from './MathHelpers';`
2. Remove local definitions of `wrapAngle`, `wrapTau`, `clampZoomValue` (L309-346)
3. Replace inline `mulMat4Vec4` at L3618 and L4050 with `mulMat4Vec4Full`

**Trade-offs**:
- ✅ Clean separation of pure math from rendering logic
- ✅ Enables unit testing of angle/zoom math in isolation
- ✅ Eliminates duplication (2 inline mulMat4Vec4 → 1 shared)
- ✅ Exports zoom constants for consistency across codebase
- ⚠️ Adds one more import to webgpu_core.ts (acceptable overhead)

**LOC Impact**: -32 (definitions) +1 (import) = **-31 net in webgpu_core.ts**

### Proposal 2: Merge into MatrixMath.ts (Conservative)

**Idea**: Add the angle/zoom utilities to the existing `MatrixMath.ts`.

**Rationale**: MatrixMath already handles camera math; angle wrapping is conceptually related.

**Trade-offs**:
- ✅ No new file
- ❌ Muddies MatrixMath's single responsibility (matrix operations)
- ❌ `clampZoomValue` is not matrix math

**Verdict**: REJECTED — violates single responsibility principle.

### Proposal 3: Inline mulMat4Vec4Full Only (Minimal)

**Idea**: Just dedupe the two inline `mulMat4Vec4` into a single local function at mount scope.

**Trade-offs**:
- ✅ Minimal change
- ❌ Doesn't address angle/zoom utilities
- ❌ Function still trapped inside mount() closure

**Verdict**: REJECTED — misses the bigger consolidation opportunity.

## Extraction Strategy

### Phase 7a: Create MathHelpers.ts (Executioner Task 1)
1. Create `src/MathHelpers.ts` with exported utilities
2. Create `src/MathHelpers.test.ts` with unit tests:
   - `wrapAngle` edge cases: 0, π, -π, 2π, -2π, 3π
   - `wrapTau` equivalence to wrapAngle on normal ranges
   - `clampZoomValue` bounds: 0.1→0.25, 5.0→4.0, NaN→1.0, Infinity→1.0
   - `mulMat4Vec4Full` identity matrix, translation matrix

### Phase 7b: Update webgpu_core.ts (Executioner Task 2)
1. Add import statement (line ~70, after MatrixMath import)
2. Delete L309-346 (wrapAngle, wrapTau, clampZoomValue definitions)
3. Search-replace inline mulMat4Vec4 at L3618 and L4050 with `mulMat4Vec4Full`
4. Run `npm run typecheck && npm run lint && npm test`

### Phase 7c: Optional Cleanup
- Consider exporting `MIN_ZOOM`/`MAX_ZOOM` from `camera_constants.ts` instead
- Update any comments referencing local definitions

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Import adds bundle size | LOW | Functions are tiny; tree-shaking handles unused exports |
| wrapAngle/wrapTau subtle difference | LOW | Both normalize to [-π, π]; wrapTau is faster for cumulative rotation |
| clampZoomValue constants hardcoded | MEDIUM | Export MIN_ZOOM/MAX_ZOOM for future configurability |
| mulMat4Vec4Full signature differs from AxisOverlay | RESOLVED | Different use case (4-component vs 3-component); both coexist |
| Breaking CameraController | LOW | clampZoomValue signature unchanged; just re-exports |

**Highest Risk**: None significant. All functions are pure with no side effects.

## Expected Outcome

### New Files
- `src/MathHelpers.ts` (~35 LOC)
- `src/MathHelpers.test.ts` (~80 LOC)

### webgpu_core.ts Changes
- **Before**: 5,077 lines
- **After**: ~5,046 lines (**-31 LOC**)
- Removes 3 function definitions + 2 inline duplicates
- Adds 1 import statement

### Benefits
1. **Testability**: Pure math functions now have isolated unit tests
2. **Reusability**: Other modules can import angle wrapping without depending on webgpu_core
3. **Maintainability**: Zoom bounds constants exported, not buried in function body
4. **Consistency**: Completes the module extraction trilogy (camera_basis → MatrixMath → MathHelpers)

## Open Questions (for Verifier)

1. Should `MIN_ZOOM`/`MAX_ZOOM` live in `camera_constants.ts` instead of `MathHelpers.ts`?
2. Is there value in renaming `wrapTau` to `wrapAngleFast` for clarity?
3. Should `mulMat4Vec4Full` be added to `MatrixMath.ts` instead (since it's matrix math)?

## Assumptions (for Verifier to Attack)

1. **A1**: The inline `mulMat4Vec4` definitions at L3618 and L4050 are semantically identical and can be consolidated.
2. **A2**: No other files in the codebase define local `wrapAngle`/`wrapTau`/`clampZoomValue` that would shadow the imports.
3. **A3**: Extracting these pure functions has no performance impact (no closure overhead).
4. **A4**: The `mulMat4Vec4Full` 4-component return type is required by the NDC depth checks; the 3-component AxisOverlay version cannot substitute.
5. **A5**: `camera_controller.ts` references `clampZoomValue` only via the `ControllerHelpers` interface, not by direct import — so this extraction won't break it.

---

**Generator Recommendation**: Proceed with **Proposal 1 (MathHelpers.ts)**. This is a low-risk, high-value extraction that completes the math utility consolidation started in Phase 5. The Executioner should implement in two commits: (1) create MathHelpers.ts + tests, (2) update webgpu_core.ts imports and remove definitions.
