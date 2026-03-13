# Generator Round 1 — Quick Wins (Batch 1)
Date: 2026-03-08

## Problem Statement

Four code quality issues block CI/merge readiness:
1. **I-4**: Stale test files reference deleted APIs
2. **A-4**: 4 production `@ts-ignore` annotations hide type-safety gaps
3. **A-5**: V2 UI has zero `<ErrorBoundary>` components (crash risk)
4. **IV-2**: 26 debug `console.log` statements in production hook

These are hygiene issues — no behavioral changes needed, just cleanup and hardening.

---

## Issue I-4: Stale Test Files

### Root Cause Analysis

Two test files were left behind when `ConstrainedTriangulator` was refactored:

1. **`ConstrainedTriangulator.smooth.test.ts`** (100 lines)
   - Calls `ConstrainedTriangulator.getRefinedChains()` — **method deleted**
   - Entire file wrapped in `describe.skip()`
   - Contains comment: `"SKIPPED: getRefinedChains method was removed"`
   - Provides zero test coverage

2. **`ConstrainedTriangulator.ohtake.test.ts`** (66 lines)
   - Calls `(ConstrainedTriangulator as any).smoothChain()` — **method is private**
   - Entire file wrapped in `describe.skip()`
   - Tests internal implementation details via `as any` hack
   - Provides zero test coverage

Both files are dead code that:
- Confuse `npm test` output (shows skipped counts)
- Inflate "test file count" metrics without value
- Reference deprecated/private APIs

### Proposal 1: Delete Both Files (Recommended)

**Mechanism**: `git rm` both files.

**Files to delete**:
```
potfoundry-web/src/utils/geometry/ConstrainedTriangulator.smooth.test.ts
potfoundry-web/src/utils/geometry/ConstrainedTriangulator.ohtake.test.ts
```

**Risk Assessment**: ZERO. Both files are entirely skipped with `describe.skip()`. They provide no regression protection. Deleting them is purely cleanup.

**Test Verification**:
1. `npm test` should show 2 fewer test files
2. Skipped test count should decrease by ~10
3. No "TS2339: getRefinedChains does not exist" errors in `tsc --noEmit`

**Assumptions for Verifier**:
1. No other code imports from these files (confirmed: they only import from ConstrainedTriangulator)
2. `describe.skip()` means they were intentionally abandoned

---

## Issue A-4: @ts-ignore Annotations

### Root Cause Analysis

**Location 1-2: `webgpu_core.ts:1834-1836`**
```typescript
try {
  // @ts-ignore - lastRigSignature/lastRigCached are defined later in mount()
  if (typeof lastRigSignature !== 'undefined') lastRigSignature = null;
  // @ts-ignore
  if (typeof lastRigCached !== 'undefined') lastRigCached = null;
} catch (e) {
  // Ignore - variables not yet defined during initial mount
}
```

This code tries to reset closure-scoped variables (`lastRigSignature`, `lastRigCached`) that are defined later in the same `mount()` function. The `@ts-ignore` suppresses "variable used before declaration" errors.

**Location 3-4: `styleParams.ts:451, 472`**
```typescript
// @ts-ignore - indexing by string into StyleId record
const styleId = STYLE_ID_MAP[styleName] ?? 0;
```

`STYLE_ID_MAP` is typed as `Record<StyleId, number>` where `StyleId` is a union of literal string types. Indexing with `string` fails because `string` isn't assignable to `StyleId`.

### Proposal 2A: webgpu_core.ts — Hoist Variables (Conservative)

**Idea**: Move variable declarations to top of `mount()` scope.

**Mechanism**: Instead of defining `lastRigSignature` and `lastRigCached` deep inside `mount()`, declare them at the top with initial `null` values. Then the resize callback can access them without temporal dead zone issues.

**Before** (conceptual):
```typescript
function mount() {
  // ... 1800 lines of setup ...
  const resize = () => {
    // @ts-ignore - variables defined later
    if (typeof lastRigSignature !== 'undefined') lastRigSignature = null;
  };
  // ... 200 more lines ...
  let lastRigSignature: string | null = null;  // <-- defined here
  let lastRigCached: CameraRig | null = null;
}
```

**After**:
```typescript
function mount() {
  // Declare at top of mount() scope
  let lastRigSignature: string | null = null;
  let lastRigCached: CameraRig | null = null;
  
  // ... setup code ...
  const resize = () => {
    // No @ts-ignore needed — variable in scope
    lastRigSignature = null;
    lastRigCached = null;
  };
}
```

**Risk Assessment**: LOW. This is a scope rearrangement, not a logic change. The variables were always function-scoped; we're just moving the declaration earlier.

**Trade-offs**:
- Requires reading more of `webgpu_core.ts` to find exact current locations
- 5500-line file makes this tedious but not risky

### Proposal 2B: styleParams.ts — Type Guard Function (Conservative)

**Idea**: Create a type guard that narrows `string` to `StyleId`.

**Mechanism**:
```typescript
import { StyleId } from '../geometry/types';

/** Type guard: checks if styleName is a valid StyleId */
function isStyleId(name: string): name is StyleId {
  return name in STYLE_ID_MAP;
}

export function buildStyleParamPayload(
  styleName: string,
  opts: Record<string, unknown> | null | undefined
): [number, number[]] {
  // Type-safe lookup with fallback
  const styleId = isStyleId(styleName) ? STYLE_ID_MAP[styleName] : 0;
  // ...
}

export function getStyleId(styleName: string): number {
  return isStyleId(styleName) ? STYLE_ID_MAP[styleName] : 0;
}
```

**Alternative**: Use `styleName as StyleId` with runtime validation already present via `?? 0`.

**Risk Assessment**: ZERO. The `?? 0` fallback already handles unknown style names. We're just satisfying TypeScript.

**Trade-offs**:
- Type guard adds ~3 lines but is explicit
- Alternative `as StyleId` assertion is shorter but less safe

### Recommended Approach for A-4

1. **styleParams.ts**: Use type guard (Proposal 2B) — 5 lines of change, zero risk
2. **webgpu_core.ts**: Defer to Executioner for exact placement — requires reading the 5500-line file to find current variable locations

**Assumptions for Verifier**:
1. `lastRigSignature` and `lastRigCached` are closure-scoped `let` variables, not module-level
2. Moving declarations earlier doesn't change initialization timing (still `null`)
3. `isStyleId(name)` correctly narrows type when `name in STYLE_ID_MAP` is true

---

## Issue A-5: V2 UI Missing Error Boundaries

### Root Cause Analysis

**`AppUI.tsx` (V1)** has 5 `<ErrorBoundary>` components:
```tsx
<ErrorBoundary name="AppUI">        {/* Root wrapper */}
  <ErrorBoundary name="Viewport">   {/* 3D canvas */}
  <ErrorBoundary name="Sidebar">    {/* Control panel */}
  <ErrorBoundary name="Toolbar">    {/* Top bar */}
</ErrorBoundary>
```

**`AppUIv2.tsx`** has ZERO:
```tsx
<AnnouncerProvider>
  <div className="pf2-root pf2-layout">
    <ToolbarV2 />
    <SidebarV2 />
    <WelcomeCard />
  </div>
</AnnouncerProvider>
```

V2 was built rapidly and error handling was forgotten. Any unhandled exception in `ToolbarV2`, `SidebarV2`, or `WelcomeCard` crashes the entire app.

### Proposal 3: Mirror V1's Pattern (Conservative)

**Mechanism**: Wrap each major component in `<ErrorBoundary>`.

**Proposed change**:
```tsx
import { ErrorBoundary } from '../shared';

export const AppUIv2: React.FC = () => {
  // ... hooks unchanged ...
  
  return (
    <ErrorBoundary name="AppUIv2">
      <AnnouncerProvider>
        <div
          className="pf2-root pf2-layout"
          data-theme={resolvedTheme}
          data-zen={zenMode || undefined}
          data-panel-open={panelOpen || undefined}
        >
          <ErrorBoundary name="ToolbarV2">
            <ToolbarV2 />
          </ErrorBoundary>

          <ErrorBoundary name="SidebarV2">
            <SidebarV2 />
          </ErrorBoundary>

          <ErrorBoundary name="WelcomeCard">
            <WelcomeCard />
          </ErrorBoundary>
        </div>
      </AnnouncerProvider>
    </ErrorBoundary>
  );
};
```

**Files affected**:
- `potfoundry-web/src/ui/v2/AppUIv2.tsx`

**Risk Assessment**: ZERO. `ErrorBoundary` is already used in V1 and works. Adding it to V2 is purely additive.

**Trade-offs**:
- Slight DOM nesting increase (negligible)
- Error recovery UX may need CSS tweaks for V2's layout

**Test Verification**:
1. Intentionally throw in `SidebarV2` → only sidebar shows error UI
2. Toolbar and viewport remain functional
3. No behavior change for normal operation

**Assumptions for Verifier**:
1. `ErrorBoundary` component is fully functional (it is — V1 uses it)
2. `AnnouncerProvider` should be inside root `ErrorBoundary` (announcements continue if UI crashes)

---

## Issue IV-2: Debug Console.log in Production

### Root Cause Analysis

**`useAdaptiveExport.ts`** contains **26 `console.*` statements**:

| Type | Count | Purpose |
|------|-------|---------|
| `console.log` | 18 | Pipeline progress, debug visualization |
| `console.warn` | 5 | Fallback paths, missing features |
| `console.error` | 3 | Critical failures, exceptions |

Most are development-time debugging that should not appear in production builds:
- `"[useAdaptiveExport] Mounting and initializing GPU..."`
- `"[useAdaptiveExport] 1. Extraction: quality=high, threshold=0.03"`
- `"[useAdaptiveExport] DebugVis: Segments=1234, Ctrl=true, Ref=true"`

### Proposal 4A: Gate All Logs Behind `import.meta.env.DEV` (Conservative)

**Mechanism**: Wrap each console statement in a DEV check. Vite tree-shakes these in production builds.

**Pattern**:
```typescript
// Before
console.log('[useAdaptiveExport] Mounting and initializing GPU...');

// After
if (import.meta.env.DEV) {
  console.log('[useAdaptiveExport] Mounting and initializing GPU...');
}
```

**Risk Assessment**: LOW. No behavioral change — same logs in DEV, no logs in PROD.

**Trade-offs**:
- Adds 26 `if` statements (verbose)
- Guarantees zero log removal mistakes

### Proposal 4B: Create a DEBUG_LOG Helper (Moderate)

**Mechanism**: Extract a `debugLog()` function that no-ops in production.

```typescript
// At top of file
const debugLog = import.meta.env.DEV
  ? (...args: unknown[]) => console.log('[useAdaptiveExport]', ...args)
  : () => {};

const debugWarn = import.meta.env.DEV
  ? (...args: unknown[]) => console.warn('[useAdaptiveExport]', ...args)
  : () => {};

// Usage
debugLog('Mounting and initializing GPU...');
debugLog('2. Analysis: Found', rawFeatures.length, 'raw candidates.');
```

**Risk Assessment**: LOW. Centralizes gating logic.

**Trade-offs**:
- Cleaner code
- Loses exact line-number attribution in stack traces (minor)

### Proposal 4C: Keep Error Logs, Gate Info Logs (Recommended)

**Mechanism**:
- **KEEP unconditionally**: `console.error` (3 statements) — critical failures
- **KEEP unconditionally**: `console.warn` for fallbacks (2 statements) — user-facing degradation
- **GATE with DEV**: All `console.log` (18 statements) — progress/debug only
- **REMOVE entirely**: Debug visualization logs (3 statements) — internal only

**Classification**:

| Line | Type | Action | Rationale |
|------|------|--------|-----------|
| 112 | log | GATE | Mount lifecycle |
| 121 | warn | KEEP | User needs to know WebGPU missing |
| 128 | warn | KEEP | User needs to know no adapter |
| 145 | error | KEEP | Device lost is critical |
| 190 | log | GATE | Init success |
| 199 | error | KEEP | Init failure is critical |
| 314 | log | GATE | Pipeline step 1 |
| 326 | log | GATE | Pipeline step 2 |
| 341-342 | log | GATE | Feature counts |
| 364 | log | GATE | Importance map |
| 373 | log | GATE | Importance map result |
| 375 | warn | KEEP | Importance fallback |
| 379 | log | GATE | Pipeline step 3 |
| 381 | log | GATE | Mesh stats |
| 388 | log | GATE | Chain stats |
| 429-440 | log/warn | REMOVE | Debug visualization only |
| 464-465 | log | GATE | Segment stats |
| 468 | error | KEEP | Critical segmentation failure |
| 472 | error | KEEP | Root failure |
| 478 | warn | KEEP | Fallback mesh |

**Risk Assessment**: LOW. Error/warn logs remain for production debugging. Only verbose pipeline logs are gated.

**Assumptions for Verifier**:
1. `import.meta.env.DEV` is correctly set by Vite (it is — documented)
2. Production builds should still show errors/warnings (yes — user-facing issues)
3. Debug visualization logs (429-440) are development-only and safe to remove entirely

---

## Recommended Approach Summary

| Issue | Proposal | Risk | Effort |
|-------|----------|------|--------|
| I-4 Stale Tests | Delete both files | ZERO | 5 min |
| A-4 styleParams | Type guard function | ZERO | 10 min |
| A-4 webgpu_core | Hoist variables | LOW | 30 min |
| A-5 ErrorBoundary | Mirror V1 pattern | ZERO | 15 min |
| IV-2 Console logs | Gate/classify per 4C | LOW | 20 min |

**Total estimated effort**: ~80 minutes for Executioner.

---

## Open Questions for Verifier

1. **webgpu_core.ts hoisting**: Should I propose exact line numbers for variable relocation, or is the general pattern sufficient?

2. **ErrorBoundary placement**: Should `AnnouncerProvider` be inside or outside the root `ErrorBoundary`? I assumed inside so announcements survive UI crashes.

3. **Console log categorization**: I marked `console.warn('[useAdaptiveExport] DebugVis: Wrapper has no setDebugSegments method!')` as REMOVE. Is this too aggressive? The warning only fires during feature flag experimentation.

4. **Test file deletion**: Should we archive the test logic somewhere (e.g., commit message, ADR) for historical reference, or is `git log` sufficient?

---

## Sign-off

**Generator assessment**: These are all low-risk, high-value changes. The stale test deletion and ErrorBoundary addition are trivially safe. The `@ts-ignore` fixes require minor code reading. The console log cleanup is mechanical.

Awaiting Verifier critique before handoff to Executioner.
