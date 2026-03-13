# Generator Round 22 — Eliminate All `any` Types and Reduce Unsafe `as` Casts
Date: 2026-03-12

## Problem Statement

PotFoundry's TypeScript strict mode is undermined by ~50+ explicit `any` annotations and ~60+ unsafe `as` casts scattered across production source files. These defeat the purpose of `"strict": true` and create silent runtime bugs when interfaces evolve. The type system must become a reliable safety net.

**Constraint**: `webgpu_core.ts` is excluded (separate refactor in progress).

## Root Cause Analysis

Three structural issues cause the majority of casts:

### Root Cause 1: `WebGPUParams = Record<string, unknown>` (types.ts:164)
This type alias means every param access requires casting or type guards. All `as Record<string, unknown>` casts in `UniformBlock.ts` exist because the function signatures accept `Partial<WebGPUParams>` — which is already `Record<string, unknown>`. **The casts are no-ops.** The real fix is narrowing `WebGPUParams` or accepting that it's inherently a bag-of-unknowns and using type-safe accessor helpers instead of casts.

### Root Cause 2: `WebGPUState` has an index signature `[key: string]: unknown` (types.ts:249)
Same issue — `state as Record<string, unknown>` is redundant because `WebGPUState` already satisfies that type. The casts can simply be deleted.

### Root Cause 3: TypeScript widens `[...tuple]` to `Array<T>` instead of preserving tuple length
Every `[...vec] as Vec3` exists because `const copy = [...v]` produces `number[]` not `[number, number, number]`. This needs a utility helper: `copyVec3(v: Vec3): Vec3`.

---

## Proposals

### Phase 1: Zero-Risk Deletions (Safe — No Behavioral Change)

These are casts or `any` annotations that can be removed or replaced without changing runtime behavior.

---

#### 1.1 `src/UniformBlock.ts` — Delete All Redundant `Record<string, unknown>` Casts

**Risk**: Safe  
**Rationale**: `WebGPUParams` is already `Record<string, unknown>`. `WebGPUState` has `[key: string]: unknown`. These casts are identity operations.

| Line | Current | Proposed |
|------|---------|----------|
| 238 | `const cfgAny = cfg as Record<string, unknown>` | Delete line, use `cfg` directly |
| 239 | `const curAny = current as Record<string, unknown>` | Delete line, use `current` directly |
| 379 | `const c = params as Record<string, unknown>` | Delete line, use `params` directly |
| 380 | `const cur = current as Record<string, unknown>` | Delete line, use `current` directly |
| 461 | `const c = params as Record<string, unknown>` | Delete line, use `params` directly |
| 483 | `const c = params as Record<string, unknown>` | Delete line, use `params` directly |
| 520 | `const s = state as Record<string, unknown>` | Delete line, use `state` directly |
| 566 | `const c = params as Record<string, unknown>` | Delete line, use `params` directly |
| 586 | `const c = params as Record<string, unknown>` | Delete line, use `params` directly |
| 587 | `const s = state as Record<string, unknown>` | Delete line, use `state` directly |

**Implementation note**: Each function uses local aliases like `c` and `s` throughout the body. The simplest approach is to keep the aliases but remove the cast: `const c = params;` and `const s = state;` — or just find/replace `c.` with `params.` etc. Keeping `const c = params` (no cast) is cleanest since code references `c.H`, `c.Rt` throughout.

**Assumption 1**: `Partial<WebGPUParams>` resolves to `Partial<Record<string, unknown>>`, which allows indexing with `c.H` etc. returning `unknown`. The existing `clampNumber()` calls handle unknown → number conversion. *(Verifier: confirm that `Partial<Record<string, unknown>>` allows `c.H` property access.)*

---

#### 1.2 `src/camera_controller.ts` — Delete Redundant `Record<string, unknown>` Casts

**Risk**: Safe  
**Lines**: 205, 311

| Line | Current | Proposed |
|------|---------|----------|
| 205 | `s as Record<string, unknown>, (payload as Record<string, unknown>) ?? {} as Record<string, unknown>` | `s as Record<string, unknown>, (payload as Record<string, unknown>) ?? {}` — BUT better: since `WebGPUState` already has index signature and `WebGPUParams` is `Record<string, unknown>`, simplify to `s, payload ?? {}` |
| 311 | `typeof (payload as Record<string, unknown>).cameraNonce === 'number' ? (payload as Record<string, unknown>).cameraNonce as number : null` | Since `WebGPUParams = Record<string, unknown>`, `payload.cameraNonce` is already valid — just: `typeof payload.cameraNonce === 'number' ? payload.cameraNonce : null` |

**Assumption 2**: `sharedCameraPayloadDiffers` accepts `Record<string, unknown>` parameters. Since `WebGPUState` satisfies this via its index signature, no cast needed. *(Verifier: check `sharedCameraPayloadDiffers` signature in `camera_basis.ts`.)*

---

#### 1.3 `src/types.d.ts` — Fix Duplicate `any` Declarations

**Risk**: Safe  
**Lines**: 20-21, 28

| Line | Current | Proposed |
|------|---------|----------|
| 20 | `export type WebGPUController = any` | `export type WebGPUController = import('./types').WebGPUController` |
| 21 | `export type WebGPUEvent = any` | `export type WebGPUEvent = import('./types').WebGPUEvent` |
| 28 | `computeSceneExtents(cfg: any)` | `computeSceneExtents(cfg: Record<string, unknown>)` |

**Note**: Better yet, the `.d.ts` file should re-export from `types.ts` rather than redeclaring. These duplicate declarations may cause type conflicts. Consider whether `types.d.ts` is even needed — if all consumers import from `types.ts`, the `.d.ts` is dead code.

---

### Phase 2: Type Narrowing (Safe — Straightforward Replacements)

---

#### 2.1 `src/types.ts` line 148 — `computeSceneExtents(cfg: any)`

**Risk**: Safe  
**Current**: `cfg: any`  
**Proposed**: `cfg: Record<string, unknown>`  

The function only accesses `cfg?.H`, `cfg?.Rt`, `cfg?.Rb` with null-safe chaining and `Number()` coercion, so `Record<string, unknown>` is the correct type. No narrower interface needed since the function is defensive.

---

#### 2.2 `src/geometry/meshDecimator.ts` line 62 — `error?: any`

**Risk**: Safe  
**Current**: `error?: any` in `DecimationResult`  
**Proposed**: `error?: Error | string`

The `error` field captures exceptions from meshoptimizer. JS errors are either `Error` objects or occasionally string values from thrown strings. The union `Error | string` covers both without losing information.

---

#### 2.3 `src/utils/styleParams.ts` line 68 — `flatten(arr: any[]): number[]`

**Risk**: Safe  
**Current**: `function flatten(arr: any[]): number[]`  
**Proposed**: `function flatten(arr: (number | number[])[]): number[]`

The function flattens nested numeric arrays. The actual call sites pass `number[]` or `number[][]` values. The generic `(number | number[])[]` captures the input shape. Alternatively, if deeper nesting is possible: `function flatten(arr: readonly (number | readonly number[])[]): number[]`.

**Implementation note**: The `.flat(Infinity)` call produces `unknown[]` with the strict type. The `as number[]` cast on the return is acceptable since `.flat()` doesn't narrow types correctly in TS. Alternatively, use a recursive typed flatten.

---

#### 2.4 `src/infra/logging/ConsolePatch.ts` — Multiple `any` Instances

**Risk**: Safe  
**Lines**: 5, 11, 23, 44

| Line | Current | Proposed | Notes |
|------|---------|----------|-------|
| 5 | `const originals: Partial<Record<keyof Console, any>>` | `const originals: Partial<Record<'log' \| 'info' \| 'debug' \| 'warn' \| 'error', (...args: unknown[]) => void>>` | Only these keys are actually stored |
| 11 | `lvl: any` | `lvl: string` | Only receives string values: `'ERROR'`, `'CRITICAL'`, `'WARN'`, etc. |
| 23 | `(console as any)[level]` | `(console as Record<string, (...args: unknown[]) => void>)[level]` | OR better: define a `ConsoleLevel` type and use a type-safe index. Since `level` comes from `capture` which is `ReadonlyArray<'log' \| 'info' \| 'debug'>`, we can use: `console[level]` directly — TypeScript knows `console.log` etc. exist |
| 44 | `const map: any = { log: 'INFO', info: 'INFO', debug: 'DEBUG' }` | `const map: Record<string, string> = { log: 'INFO', info: 'INFO', debug: 'DEBUG' }` | Values are just strings |

**For uninstallConsolePatch** (also has `(console as any)[k]`):
| Line ~52 | `(console as any)[k] = originals[k]` | Use a typed approach: `Object.assign(console, { [k]: originals[k] })` or cast once at function scope |

---

#### 2.5 `src/renderers/webgpu/ShaderManager.ts` line 43 — `getShaderContent(mod: any): string`

**Risk**: Safe  
**Current**: `mod: any`  
**Proposed**: `mod: string | { default: string }`

The Vite `?raw` import can return either a raw string or a module object with a `.default` property. The function already handles both cases with `typeof mod === 'string'` and `mod?.default`. The correct type is the union.

---

#### 2.6 `src/renderers/webgpu/SceneManager.ts` — `bgBuffers` and `updateColors`

**Risk**: Safe  
**Lines**: 14, 289

| Line | Current | Proposed |
|------|---------|----------|
| 14 | `public bgBuffers: any = null` | `public bgBuffers: { c1: GPUBuffer; c2: GPUBuffer; c3: GPUBuffer; bg1: GPUBuffer; bg2: GPUBuffer; bg3: GPUBuffer } \| null = null` |
| 289 | `public updateColors(_colors: any)` | `public updateColors(_colors: Record<string, Float32Array>): void` — OR if the method is truly unimplemented, type it as `unknown` with a TODO |

For `bgBuffers`: The shape is clearly defined in `createBuffers()` at line 131. Extract an interface:

```typescript
interface BgBuffers {
  c1: GPUBuffer;
  c2: GPUBuffer;
  c3: GPUBuffer;
  bg1: GPUBuffer;
  bg2: GPUBuffer;
  bg3: GPUBuffer;
}
```

For `updateColors`: The method body is empty (`// Implementation needed`). Type parameter as `unknown` until implementation exists:
```typescript
public updateColors(_colors: unknown): void { }
```

---

#### 2.7 `src/renderers/webgpu/ExportComputer.ts` lines 886-887 — `decimateFn` and `compactFn`

**Risk**: Safe  
**Current**: `let decimateFn: any = null; let compactFn: any = null;`  
**Proposed**:

```typescript
let decimateFn: ((mesh: MeshData, opts: DecimationOptions) => Promise<DecimationResult>) | null = null;
let compactFn: ((mesh: MeshData) => MeshData) | null = null;
```

These are assigned from `await import('../../geometry/meshDecimator')` — specifically `mod.decimateMesh` and `mod.compactMesh`. The types exist in `meshDecimator.ts`. Import the types at the top of the file.

---

### Phase 3: Medium-Risk Structural Fixes

---

#### 3.1 `src/infra/logging/WebGpuCapture.ts` — Multiple `any` Instances

**Risk**: Medium  
**Lines**: 50, 72-73, 85, 87, 94, 119

| Line | Current | Proposed | Notes |
|------|---------|----------|-------|
| 50 | `const reason = (info as any)?.reason` | `const reason = (info as GPUDeviceLostInfo).reason` | `GPUDeviceLostInfo` has `.reason` property |
| 72 | `const kind = (err as any)?.name \|\| 'GPUError'` | `const kind = ('name' in err ? (err as { name: string }).name : 'GPUError')` | Guard property access |
| 85 | `let err = null as any` | `let err: GPUError \| null \| undefined = null` | `popErrorScope()` returns `GPUError \| null` |
| 87 | `(err as any)?.message` | `err?.message` | If typed as `GPUError \| null \| undefined`, `.message` is valid |
| 89 | `(e as any)?.message` | `(e instanceof Error ? e.message : String(e))` | Standard error handling pattern |
| 94 | `const info: any = await (module as any).getCompilationInfo?.()` | `const info = await module.getCompilationInfo()` | `GPUShaderModule` has `getCompilationInfo()` in the WebGPU API types. No cast needed. |
| 119 | `fmtShaderMsg(label, m: any)` | `fmtShaderMsg(label: string \| undefined, m: GPUCompilationMessage)` | The `m` comes from `info.messages` which is `GPUCompilationMessage[]` |

**Assumption 3**: The project uses `@webgpu/types` or equivalent WebGPU type definitions that include `GPUCompilationMessage`, `GPUDeviceLostInfo`, etc. *(Verifier: confirm WebGPU type availability.)*

---

#### 3.2 `src/context/LibraryContext.tsx` — Cache and Data `any` Types

**Risk**: Medium  
**Lines**: 22, 36, 55, 257, 325-332, 357, 428

**Cache types** (lines 22, 36, 55):

```typescript
// Current:
interface CacheEntry { data: any; timestamp: number; }
function getCachedData(key: string): any | null { ... }
function setCachedData(key: string, data: any): void { ... }

// Proposed:
interface CacheEntry<T = unknown> { data: T; timestamp: number; }
function getCachedData<T = unknown>(key: string): T | null { ... }
function setCachedData(key: string, data: unknown): void { ... }
```

Since cache entries are JSON-serialized, `unknown` is correct. Callers can assert the type at the call site.

**Supabase data mapping** (line 257):

```typescript
// Current:
const designs: LibraryDesign[] = (data || []).map((d: any) => ({

// Proposed:
const designs: LibraryDesign[] = (data || []).map((d) => ({
```

The Supabase client `query.select(...)` returns typed data. If the Supabase types aren't configured, use `Record<string, unknown>` as the explicit type.

**Bell param casts** (lines 325-332):

```typescript
// Current:
const bellAmp = (opts.bell_amp as number) ?? 0.0;

// Proposed:
const bellAmp = Number(opts.bell_amp ?? 0.0);
// OR use a helper:
const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
```

The `opts` variable is typed as `Record<string, unknown>`, so `opts.bell_amp` is `unknown`. Using `Number()` with a fallback is safer than `as number` because it handles strings and `undefined` correctly — the same pattern already used in `computeSceneExtents`.

**Window store access** (lines 357, 428):

```typescript
// Current:
const store = (window as any).__POTFOUNDRY_STORE__;

// Proposed (declare once in types.ts or a global.d.ts):
declare global {
  interface Window {
    __POTFOUNDRY_STORE__?: {
      getState: () => Record<string, unknown> & {
        geometry: Record<string, unknown>;
        style: { name: string; opts?: Record<string, unknown> };
        setGeometryParams: (params: Record<string, unknown>) => void;
        setStyle: (name: string) => void;
        setStyleOpts: (opts: Record<string, number | boolean>) => void;
        setPrimaryColor: (color: string) => void;
        setMidColor: (color: string) => void;
        setSecondaryColor: (color: string) => void;
        setBackgroundGradient: (g: [string, string]) => void;
        setGradientAngle: (angle: number) => void;
        setLightingPreset: (name: string) => void;
      };
    };
    __pf_webgpu_camera_controller?: {
      state?: Record<string, unknown>;
    };
  }
}
```

This eliminates ALL `(window as any).__POTFOUNDRY_STORE__` and `(window as any).__pf_webgpu_camera_controller` casts across the codebase.

---

#### 3.3 `src/ui/controls/LibraryPanel.tsx` line 43 — `confirmLoad: { design: any }`

**Risk**: Safe  
**Current**: `const [confirmLoad, setConfirmLoad] = useState<{ design: any } | null>(null)`  
**Proposed**: `const [confirmLoad, setConfirmLoad] = useState<{ design: LibraryDesign } | null>(null)`

`LibraryDesign` is already defined and imported in the same module.

---

#### 3.4 `src/context/ControllerContext.tsx` — Window and `rendererType` Casts

**Risk**: Medium  
**Lines**: 181, 268, 285

| Line | Current | Proposed |
|------|---------|----------|
| 181 | `(controllerRef.current as any)?.rendererType` | `(controllerRef.current as RendererController \| null)?.rendererType` — OR better: `ContextController` already includes `RendererController` which has `rendererType`. Just use `controllerRef.current?.rendererType` if the `WebGPUController` interface also declares it (it doesn't currently — see fix below) |
| 268 | `const cc = (window as any).__pf_webgpu_camera_controller` | Use the `Window` augmentation from 3.2 → `window.__pf_webgpu_camera_controller` |
| 285 | `const cc = (window as any).__pf_webgpu_camera_controller` | Same as above |

**Fix needed**: `WebGPUController` interface in `types.ts` should add `rendererType?: 'webgpu' | 'webgl'` to match `RendererController`. Then `ContextController = WebGPUController | RendererController` gives access to `rendererType` without casting.

---

#### 3.5 `src/debug/TriangulatorVerifier.tsx` line 130 — `setTestName(name as any)`

**Risk**: Safe  
**Current**: `onClick={() => setTestName(name as any)}`  
**Proposed**: `onClick={() => setTestName(name as keyof typeof TEST_CASES)}`

The `name` comes from `Object.keys(TEST_CASES)` which returns `string[]`. The cast to `keyof typeof TEST_CASES` is the correct narrowing — this is a legitimate use of `as` since `Object.keys()` always returns `string[]` in TypeScript.

---

#### 3.6 `src/App.tsx` line 136 — `(event?.payload as any)?.reason`

**Risk**: Safe  
**Current**: `(event?.payload as any)?.reason`  
**Proposed**: `(event?.payload as { reason?: string })?.reason`

The `event` is typed as `{ type?: string; payload?: unknown }`. The device-lost payload is known to have `{ reason: string }`. Use a narrow inline type or define a `DeviceLostPayload` interface.

---

#### 3.7 `src/ui/debug/hooks/useConsoleStore.ts` line 275 — `merge: (persisted: any, current) =>`

**Risk**: Medium  
**Current**: `merge: (persisted: any, current) =>`

**Proposed**: Define the persisted shape:

```typescript
interface PersistedConsolePrefs {
  filterLevels?: string[];
  groupDuplicates?: boolean;
  dockPosition?: string;
  panelHeight?: number;
  panelWidth?: number;
  floatPosition?: { x: number; y: number };
  fontSize?: number;
  theme?: string;
  timestampFormat?: string;
  pinnedIds?: string[];
  bookmarkedIds?: string[];
}

merge: (persisted: PersistedConsolePrefs | null, current) => ({
  ...current,
  ...persisted,
  filterLevels: new Set(persisted?.filterLevels ?? ['INFO', 'WARN', 'ERROR', 'CRITICAL', 'DEBUG']),
  pinnedIds: new Set(persisted?.pinnedIds ?? []),
  bookmarkedIds: new Set(persisted?.bookmarkedIds ?? []),
}),
```

**Note**: Zustand's `persist` middleware types the `merge` callback as `(persistedState: unknown, currentState: S) => S`. So the correct type for `persisted` is the Zustand-provided one. Check if `unknown` works or if a type assertion to the persisted shape is needed.

---

### Phase 4: Vec3/Quaternion Tuple Cast Reduction (`camera_controller.ts`, `CameraStateBroadcaster.ts`)

**Risk**: Medium (many call sites, must not change runtime behavior)

---

#### 4.1 Add Tuple Copy Utilities to `camera_basis.ts`

```typescript
/** Copy a Vec3 tuple (prevents TypeScript widening [...v] to number[]) */
export const copyVec3 = (v: Vec3): Vec3 => [v[0], v[1], v[2]];

/** Copy a Quaternion tuple */
export const copyQuat = (q: Quaternion): Quaternion => [q[0], q[1], q[2], q[3]];

/** Construct a Vec3 from computed components */
export const vec3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

/** Construct a Quaternion from components */
export const quat = (x: number, y: number, z: number, w: number): Quaternion => [x, y, z, w];
```

#### 4.2 Replace `as Vec3` / `as Quaternion` Casts in `camera_controller.ts`

Pattern replacements (~40+ instances):

| Pattern | Current | Proposed |
|---------|---------|----------|
| Copy | `[...state.camQuat] as Quaternion` | `copyQuat(state.camQuat)` |
| Copy | `[...state.pivot] as Vec3` | `copyVec3(state.pivot)` |
| Construct | `[basis.right[0]*-dx*f, basis.right[1]*-dx*f, basis.right[2]*-dx*f] as Vec3` | `vec3(basis.right[0]*-dx*f, basis.right[1]*-dx*f, basis.right[2]*-dx*f)` |
| Nullable | `(this.state.displayCamQuat ?? this.state.camQuat) as Quaternion` | This is a legitimate nullability narrowing — the `??` ensures non-null. Valid `as Quaternion` since the type is `Quaternion \| null \| undefined` and `??` guarantees `Quaternion`. Keep this cast. |
| Display basis | `[...(this.state.displayCamRight as Vec3)] as Vec3` | This has a double-cast problem. `displayCamRight` is `Vec3 \| null \| undefined`. When the branch is entered, it's known non-null (guarded by `if (this.state.displayCamRight)`). Use: `copyVec3(this.state.displayCamRight!)` — or better, assign to a local after the null check. |

#### 4.3 `CameraStateBroadcaster.ts` lines 213-214

| Line | Current | Proposed |
|------|---------|----------|
| 213 | `[...state.pivot] as Vec3` | `copyVec3(state.pivot)` |
| 214 | `[...eye] as Vec3` | `copyVec3(eye)` |

---

### Phase 5: ESLint Rule Gating (Final Step)

**Risk**: Safe (but must be done LAST)

Add to `eslint.config.js` in the `rules` section:

```javascript
'@typescript-eslint/no-explicit-any': 'error',
```

This prevents any future `any` regression. Must be added only after all existing `any` instances are eliminated.

**Implementation**: The rule should also have an exception pattern for test files if needed:

```javascript
// In a new config block for test files:
{
  files: ['src/**/*.test.{ts,tsx}', 'e2e/**/*.{ts,tsx}'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn', // Relaxed for tests
  },
},
```

---

## New Interfaces / Type Utilities Required

### 1. `BgBuffers` interface (in `SceneManager.ts` or `types.ts`)
```typescript
interface BgBuffers {
  c1: GPUBuffer;
  c2: GPUBuffer;
  c3: GPUBuffer;
  bg1: GPUBuffer;
  bg2: GPUBuffer;
  bg3: GPUBuffer;
}
```

### 2. Window augmentation (in `src/global.d.ts` — new file)
```typescript
declare global {
  interface Window {
    __POTFOUNDRY_STORE__?: PotFoundryStore;
    __pf_webgpu_camera_controller?: {
      state?: Record<string, unknown>;
    };
  }
}

interface PotFoundryStore {
  getState(): PotFoundryStoreState;
}

interface PotFoundryStoreState {
  geometry: Record<string, unknown>;
  style: { name: string; opts?: Record<string, unknown> };
  setGeometryParams(params: Record<string, unknown>): void;
  setStyle(name: string): void;
  setStyleOpts(opts: Record<string, number | boolean>): void;
  setPrimaryColor(color: string): void;
  setMidColor(color: string): void;
  setSecondaryColor(color: string): void;
  setBackgroundGradient(g: [string, string]): void;
  setGradientAngle(angle: number): void;
  setLightingPreset(name: string): void;
}
```

### 3. Vec3/Quaternion copy helpers (in `camera_basis.ts`)
```typescript
export const copyVec3 = (v: Vec3): Vec3 => [v[0], v[1], v[2]];
export const copyQuat = (q: Quaternion): Quaternion => [q[0], q[1], q[2], q[3]];
export const vec3 = (x: number, y: number, z: number): Vec3 => [x, y, z];
```

### 4. `PersistedConsolePrefs` interface (in `useConsoleStore.ts`)
```typescript
interface PersistedConsolePrefs {
  filterLevels?: string[];
  groupDuplicates?: boolean;
  dockPosition?: string;
  panelHeight?: number;
  panelWidth?: number;
  floatPosition?: { x: number; y: number };
  fontSize?: number;
  theme?: string;
  timestampFormat?: string;
  pinnedIds?: string[];
  bookmarkedIds?: string[];
}
```

### 5. `WebGPUController.rendererType` addition (in `types.ts`)
Add `readonly rendererType?: 'webgpu' | 'webgl'` to the `WebGPUController` interface.

---

## Execution Order

```
Phase 1 (Safe, isolated, no deps):
  1.1  UniformBlock.ts — delete redundant casts
  1.2  camera_controller.ts — delete redundant Record casts
  1.3  types.d.ts — fix duplicate any declarations

Phase 2 (Safe, straightforward):
  2.1  types.ts — computeSceneExtents cfg
  2.2  meshDecimator.ts — error field
  2.3  styleParams.ts — flatten param
  2.4  ConsolePatch.ts — all any instances
  2.5  ShaderManager.ts — mod param
  2.6  SceneManager.ts — bgBuffers + updateColors (creates BgBuffers interface)
  2.7  ExportComputer.ts — decimateFn + compactFn

Phase 3 (Medium, structural — create new types first):
  3.0  Create global.d.ts (Window augmentation)
  3.0b Add rendererType to WebGPUController interface
  3.1  WebGpuCapture.ts — all any instances
  3.2  LibraryContext.tsx — cache types, data mapping, window casts
  3.3  LibraryPanel.tsx — confirmLoad
  3.4  ControllerContext.tsx — window and rendererType casts
  3.5  TriangulatorVerifier.tsx — setTestName
  3.6  App.tsx — payload cast
  3.7  useConsoleStore.ts — merge param

Phase 4 (Medium, many call sites):
  4.0  camera_basis.ts — add copyVec3, copyQuat, vec3 helpers
  4.1  camera_controller.ts — replace all as Vec3/Quaternion casts (~40+)
  4.2  CameraStateBroadcaster.ts — replace as Vec3 casts

Phase 5 (Final gating):
  5.1  eslint.config.js — add no-explicit-any rule
  5.2  Run full typecheck + lint to confirm zero violations
```

---

## Recommended Approach

Execute Phases 1-2 first as a single PR — these are zero-risk and self-contained. Phase 3 should be a second PR since it creates new type infrastructure. Phase 4 is a third PR (camera tuple casts) since it touches ~40+ locations in a single critical file. Phase 5 locks it down.

**Key principle**: Every `any` elimination should be tested by running `npm run typecheck` after each file change. If typecheck passes, the change is correct. If it fails, the replacement type needs refinement.

---

## Open Questions (for Verifier)

1. **`WebGPUParams` — should it remain `Record<string, unknown>`?** It's used as a bag for heterogeneous GPU params. A full interface would be ~60+ optional fields. Is the accessor-helper approach (keep `Record`, use `clampNumber` etc.) better than a massive interface?

2. **`types.d.ts` — is it actually used?** If all imports come from `types.ts`, the `.d.ts` file may be dead code. Removing it would eliminate 3 `any` instances for free.

3. **WebGPU types availability**: Are `GPUCompilationMessage`, `GPUDeviceLostInfo`, `GPUError` available from `@webgpu/types` in this project? The `WebGpuCapture.ts` fixes depend on this.

4. **Zustand `persist` merge typing**: Does Zustand's `persist` middleware accept `unknown` for the `persisted` parameter, or does it require a specific type? The `useConsoleStore.ts` fix depends on this.

5. **`as Vec3` on nullable `??` expressions**: Is `(this.state.displayCamQuat ?? this.state.camQuat) as Quaternion` safe to keep, or should we use a type guard? The `??` operator should narrow correctly, but TS may not infer the tuple type from the union.
