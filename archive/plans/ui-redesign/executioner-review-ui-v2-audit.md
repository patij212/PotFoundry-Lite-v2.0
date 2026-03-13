# Executioner Feasibility Review — UI v2 Audit
Date: 2026-03-07

---

## Executive Summary

Eight of nine items are feasible. The change set is **safe to ship as a single PR** with the
following gate conditions:

- **P1-B contains a hard blocker**: the plan says "clean up store.ts L118" — that line is the
  `window.__POTFOUNDRY_STORE__` global assignment that the entire `e2e/v2-undo-redo-
  verification.spec.ts` suite depends on. The ToolbarV2 refactor is fine; the store.ts
  cleanup is NOT. Retarget that sub-item to "ToolbarV2 component code only, store.ts stays."

- **Inferred-2** has a naming discrepancy: the plan references `handleResizeCancel` — that
  function does not exist in SidebarV2.tsx. The correct name is `handleResizeEnd`.

- **P0-B** has a circular-import risk: `ExportFormat` lives in `src/geometry/stlExport.ts`.
  Importing it into `src/state/slices/ui.ts` creates a state → geometry dependency. Declare
  `type ExportFormat = 'stl' | '3mf'` inline in the state types file instead.

Everything else is straightforward. The three trivial items (P1-D, P2-C, OMISSION-3) can be
executed in under ten minutes total.

---

## Per-Item Feasibility Assessment

---

### P0-A: Wrap AppUIv2 in ErrorBoundary

**Verdict: FEASIBLE**

**Exact location confirmed**
`src/App.tsx` L537–542 (confirmed via source read):
```tsx
{uiTheme === 'v2' ? (
    <Suspense fallback={null}>
        <AppUIv2 />
    </Suspense>
) : (
```
The `ErrorBoundary` component with `name?` prop is exported from
`src/ui/shared/index.ts` (line 14): `export { ErrorBoundary, InlineErrorBoundary, withErrorBoundary }`.

Prop API: `{ children, fallback?, onError?, name? }`. The `name="AppUIv2"` approach is
valid and matches the default fallback message template.

**Wrap pattern:**
```tsx
<ErrorBoundary name="AppUIv2">
    <Suspense fallback={null}>
        <AppUIv2 />
    </Suspense>
</ErrorBoundary>
```
The import already exists elsewhere in the file; just add it to the `src/ui/shared` destructure.
If `src/ui/shared` is not yet imported in App.tsx, add `import { ErrorBoundary } from './ui/shared';`.

**main.tsx unhandledrejection**
`src/main.tsx` is 24 lines — intentionally minimal. Insert the listener **after**
`installConsolePatch()` and **before** `root.render(...)`. No new imports needed.

```ts
window.addEventListener('unhandledrejection', (event) => {
    console.error('[UnhandledRejection]', event.reason);
});
```

**No hidden dependencies.** No TypeScript risk. Existing `ToastProvider` wraps the whole
app, so if a future iteration wants to surface to toast it's already in scope.

---

### P0-B: Wire ExportTab format state to actual export pipeline

**Verdict: FEASIBLE WITH NOTES**

**Current state confirmed**

- `ExportTab.tsx` L124: `const [format, setFormat] = useState<ExportFormat>('stl');` — local
  state only.
- `useExport.ts` L309: `const exportSTL = useCallback(async (filename: string = 'pot.stl')` —
  no `format` parameter; uses `downloadSTL()` directly (hard-coded STL).
- `StatusFooter.tsx` L81: `const handleDownload = useCallback(async () => { … await exportSTL(); }`.
  Calls with zero arguments.
- `downloadMesh()` in `src/geometry/stlExport.ts` L55 fully supports `format` via
  `options: ExportOptions`. It already does format dispatch (STL vs 3MF).

**Slice placement**
UI slice (`src/state/slices/ui.ts`) is the right home — export format is a UI preference,
not a mesh quality parameter. It should NOT go into `MeshSlice`.

**Circular import risk — action required**
`ExportFormat` is defined in `src/geometry/stlExport.ts`. Importing it into
`src/state/slices/ui.ts` would create a `state → geometry` dependency, which is the wrong
direction and may cause circular module issues. **Resolution: declare the type inline in
`src/state/types.ts` or directly in `ui.ts`:**
```ts
export type ExportFormatPreference = 'stl' | '3mf';
```
Then in `stlExport.ts` import from state or simply keep both definitions (types are erased
at runtime — no actual coupling).

**Four-step change sequence:**

1. `src/state/slices/ui.ts` — add `exportFormat: ExportFormatPreference` to `UIState`
   and `setExportFormat(format: ExportFormatPreference)` action to `UISlice`. Default: `'stl'`.

2. `src/state/slices/ui.ts` — wire the setter in the `createUISlice` factory.

3. `ExportTab.tsx` — replace `useState<ExportFormat>('stl')` with:
   ```ts
   const format = useAppStore((s) => s.ui.exportFormat);
   const setFormat = useAppStore((s) => s.setExportFormat);
   ```

4. `useExport.ts` — update `exportSTL` signature to
   `async (filename?: string, format: 'stl' | '3mf' = 'stl')`, replace `downloadSTL(...)` 
   call with `await downloadMesh(result.mesh, finalFilename, { format })`. Also update
   `UseExportResult` interface accordingly.

5. `StatusFooter.tsx` — read format from store:
   ```ts
   const exportFormat = useAppStore((s) => s.ui.exportFormat);
   ```
   and pass to download: `await exportSTL(undefined, exportFormat)`.

**TypeScript note:** `UseExportResult.exportSTL` signature changes from
`(filename?: string) => Promise<void>` to `(filename?: string, format?: 'stl' | '3mf') => Promise<void>`.
All existing call sites pass zero or one argument — safe, backwards compatible.

**Persist concern:** `ui` is NOT in `PERSISTED_KEYS` in `store.ts` (only `geometry`, `style`,
`mesh`, `appearance` are persisted). Export format preference will reset on page reload.
This is probably correct; if persistence is desired add `'ui'` to `PERSISTED_KEYS`, but
that was not requested.

---

### P1-A: Silent load failure — add user feedback

**Verdict: FEASIBLE**

**ToolbarV2.tsx currently logs:**
- L134: `console.warn('Invalid design file format')` (handleLoad)
- L166: `console.error('Failed to load design:', error)` (handleLoad)

**`useAnnounce`** is available (exported from `src/ui/v2/shared/Announcer.tsx`) and already
used in `StatusFooter.tsx` and `SidebarV2.tsx`. ToolbarV2 does NOT currently import it —
needs one import line added.

**Toast availability:** `ToastProvider` wraps the entire app at the top of `src/App.tsx`
(outermost wrapper before `AuthProvider`). All child components, including ToolbarV2, are
inside it. Use `useToastMaybe()` (the safe variant that returns `null` if no provider rather
than throwing) to avoid any risk.

**Implementation:**
```tsx
import { useAnnounce } from '../shared/Announcer';
import { useToastMaybe } from '../../../ui/shared';
// inside component:
const announce = useAnnounce();
const toast = useToastMaybe();
// in handleLoad:
toast?.error('Invalid design file format');
announce('Failed to load design file — invalid format');
// on catch:
toast?.error(`Failed to load design: ${error instanceof Error ? error.message : 'Unknown error'}`);
announce('Failed to load design file');
```

**No hidden dependencies. No TypeScript risk.**

---

### P1-B: Replace window.__POTFOUNDRY_STORE__ with useAppStore.getState()

**Verdict: FEASIBLE WITH NOTES — partial; store.ts cleanup is BLOCKED**

**E2E hard dependency confirmed (15 occurrences)**

`e2e/v2-undo-redo-verification.spec.ts` accesses `window.__POTFOUNDRY_STORE__` at:
- L27–28: `snap()` helper reads state
- L43, L49: `storeUndo()` and `storeRedo()` helpers
- L65: `beforeEach` fixture asserts `window.__POTFOUNDRY_STORE__?.getState` is truthy
- L79, L98, L117, L136, L162, L183, L211, L220, L229: every individual test body

The `beforeEach` fixture at L65 **explicitly asserts** the global is present and fails if it
is absent. Removing `store.ts` L117–119 would fail the entire E2E suite at the fixture level
before any test runs.

**ToolbarV2 refactor is safe and should proceed**

`handleSave` and `handleLoad` in ToolbarV2.tsx currently do:
```ts
const store = (window as unknown as { __POTFOUNDRY_STORE__?: ... }).__POTFOUNDRY_STORE__;
if (!store) return;
const state = store.getState() as ...;
```
This can be replaced with:
```ts
const state = useAppStore.getState();
```
`useAppStore` is already imported in `ToolbarV2.tsx`. No change to `store.ts` needed.
The `(window as any).__POTFOUNDRY_STORE__ = useAppStore` line in `store.ts` L117–119 **must
remain untouched.**

**Scope of this item: ToolbarV2.tsx only. store.ts is off-limits.**

---

### P1-C: WelcomeCard accessibility — role="dialog" + aria-modal

**Verdict: FEASIBLE WITH NOTES (attribute approach only; Radix Dialog is risky)**

**Current markup:** `<div role="complementary" aria-label="Welcome to PotFoundry">`

**Radix Dialog approach is risky** because WelcomeCard's exit animation is CSS class-based:
`className={pf2-welcome${exiting ? ' pf2-welcome-exit' : ''}}`. Radix Dialog cleans up the
DOM by unmounting on close (or via `AnimatePresence` patterns), which would fight the existing
220ms `pf2-welcome-exit` animation. Rewriting to Radix Dialog would require adding
`forceMount` on `Dialog.Content`, adding a custom animation hook, and restructuring the
trigger — this is out of scope for an audit fix.

**Minimum viable approach (safe):**
1. Change `role="complementary"` to `role="dialog"`
2. Add `aria-modal="true"`
3. Add `aria-labelledby="welcome-title"` and a matching `id` on the wordmark element

Focus trap is partially handled: `accentBtnRef.current.focus()` fires on mount
(`useEffect` with `level === 0`), and the `autoFocus` attribute on the accent button is a
belt-and-suspenders. A full trap (intercept Tab to keep focus inside) would require a
`focus-trap-react` or manual `keydown` handler. Given the card has only two focusable
buttons, a minimal Tab-cycling trap is achievable without a new dependency by adding a
`keydown` handler for Tab that cycles between the two buttons.

**Implementation note:** `useConfidence`, `useControllerMaybe`, and `useAppStore` are already
imported. No new imports needed for the attribute approach.

---

### P1-D: ShortcutsDialog constants update

**Verdict: FEASIBLE (trivial)**

`V2_SHORTCUTS` in `src/ui/v2/shared/ShortcutsDialog.tsx` is defined `as const` on lines
21–29. Adding new entries is straightforward:

```ts
const V2_SHORTCUTS = [
  { keys: 'Z', description: 'Toggle zen mode' },
  { keys: 'Ctrl + Z', description: 'Undo' },
  { keys: 'Ctrl + Y', description: 'Redo' },
  { keys: 'Ctrl + Shift + Z', description: 'Redo (alternate)' },
  { keys: 'Alt + 1', description: 'Shape tab' },
  { keys: 'Alt + 2', description: 'Style tab' },
  { keys: 'Alt + 3', description: 'Export tab' },
  { keys: '?', description: 'Keyboard shortcuts' },
  { keys: 'Shift + ←/→', description: 'Fine-tune slider (±1)' },
  { keys: 'F11', description: 'Toggle fullscreen' },
] as const;
```

The `as const` annotation widens correctly; `typeof V2_SHORTCUTS[number]` is not read
anywhere externally. No type-narrowing breakage. The `.map(shortcut => ...)` in JSX uses
`shortcut.keys` as key — still unique after additions.

---

### P2-C: WelcomeCard exitTimeoutRef cleanup

**Verdict: FEASIBLE (trivial)**

`exitTimeoutRef` is `useRef<NodeJS.Timeout | null>(null)`.

The cancellation is already done in `handleExit` callback (sets timer, no cleanup on unmount).
Adding cleanup effect:
```tsx
useEffect(() => {
    return () => {
        if (exitTimeoutRef.current) {
            clearTimeout(exitTimeoutRef.current);
        }
    };
}, []);
```
Idiomatic. Empty deps array is correct (cleanup-on-unmount). No TS issues — `clearTimeout`
accepts `NodeJS.Timeout`. This is a pure addition; no existing logic is touched.

---

### Inferred-2: SidebarV2 resize drag-off-window fix

**Verdict: FEASIBLE WITH NOTES (naming correction needed)**

**Confirmed code path** in `src/ui/v2/layout/SidebarV2.tsx`:
The resize `useEffect` (triggered by `isResizing`) registers:
- `document.addEventListener('mousemove', handleResizeMove)`
- `document.addEventListener('mouseup', handleResizeEnd)`

Both `handleResizeMove` and `handleResizeEnd` are defined **inside** the effect. The plan
references `handleResizeCancel` — **this function does not exist** in the file at any line.
The correct target is `handleResizeEnd`.

**Fix:** inside the same `useEffect`, add:
```ts
window.addEventListener('blur', handleResizeEnd);
```
with corresponding cleanup:
```ts
window.removeEventListener('blur', handleResizeEnd);
```

**Why `window.blur` not `document.blur`:** browser fires `blur` on `window` when the window
loses focus (user tabs away, browser loses foreground). `document.addEventListener('blur')`
doesn't fire on window-level focus loss. `window` is the correct target here.

**One subtle issue:** both `mouseup` and `blur` can fire in rapid succession (user clicks
outside browser window). `handleResizeEnd` calls `setIsResizing(false)` which causes the
effect to re-run with `isResizing = false`, immediately removing all listeners. Double-fire
is harmless — the second call to `setIsResizing(false)` is a no-op since React batches state
updates. No guard needed.

---

### OMISSION-3: WelcomeCard Escape key stale closure

**Verdict: FEASIBLE**

**Confirmed stale closure path:**

`handleExit` is defined with `useCallback([exiting, dismissed, unlock])`. The Escape key
effect deps are `[level, dismissed]`. When `exiting` becomes `true`:
- React recreates `handleExit` (new reference)
- But the registered keydown closure holds the **old** `handleExit` (where `exiting = false`)
- A second Escape key press calls stale `handleExit` which does NOT guard on `exiting = true`
  and calls `setExiting(true)` again + `setTimeout(setDismissed, 220)` **a second time**

This means two `setTimeout` calls both resolve after 220ms, both calling `setDismissed(true)`
and `unlock('auto-unlock')`. The double-unlock may be harmless (idempotent in `useConfidence`)
but the double-timeout is sloppy.

**Fix:** add `handleExit` to the Escape effect's dependency array:
```tsx
}, [level, dismissed, handleExit]);
```

**Why this is safe:** `handleExit` changes when `exiting` or `dismissed` changes. The effect
tears down and re-registers. Since `handleExit` itself guards `if (exiting || dismissed) return`
with the **current** values (not stale), and the keydown effect also guards `if (level !== 0 || dismissed) return`,
the combined guard is now correct. No infinite loop risk — the ESLint exhaustive-deps rule
would flag the missing dep without this fix.

---

## Implementation Order

All items are independent. Group them into three atomic phases for incremental review:

### Phase 1 — Pure additions, zero state/interface changes (ship first, lowest risk)

| Order | Item | Files | Notes |
|---|---|---|---|
| 1 | P1-D | `ShortcutsDialog.tsx` | Text array append only |
| 2 | P2-C | `WelcomeCard.tsx` | Add one `useEffect` |
| 3 | OMISSION-3 | `WelcomeCard.tsx` | Add `handleExit` to deps array |
| 4 | Inferred-2 | `SidebarV2.tsx` | One `addEventListener`/`removeEventListener` pair inside existing effect |

These four can be batched in a single commit. Total diff: ~15 lines.

### Phase 2 — Component refactors, no store schema changes

| Order | Item | Files | Notes |
|---|---|---|---|
| 5 | P0-A | `App.tsx`, `main.tsx` | Add `<ErrorBoundary>` wrap + `unhandledrejection` listener |
| 6 | P1-C | `WelcomeCard.tsx` | Change `role`, add `aria-modal`, minimal focus cycling |
| 7 | P1-B | `ToolbarV2.tsx` only | Replace window global accesses with `useAppStore.getState()` |
| 8 | P1-A | `ToolbarV2.tsx` | Add `useAnnounce` + `useToastMaybe`, replace console calls |

Items 7 and 8 both touch ToolbarV2.tsx — do in a **single commit** to avoid an intermediate
state where console calls are removed before toast is wired.

### Phase 3 — Store schema changes (must be last; highest blast radius)

| Order | Item | Files | Notes |
|---|---|---|---|
| 9 | P0-B | `ui.ts` (slice), `types.ts`, `ExportTab.tsx`, `useExport.ts`, `StatusFooter.tsx` | Add `exportFormat` to UI state; update export hook signature |

Phase 3 must be validated with `npx tsc --noEmit` before merging. The slice change is not
covered by existing unit tests (ui.test.ts covers toggles/history, not export format).
Add one unit test to `ui.test.ts` asserting `exportFormat` defaults to `'stl'` and
`setExportFormat('3mf')` updates the slice.

---

## TypeScript / ESLint Risk Assessment

| Item | Risk | Detail |
|---|---|---|
| P0-A | None | `ErrorBoundary` props are typed. `name` is `string \| undefined`. |
| P0-B | **Medium** | `UseExportResult.exportSTL` signature change. All callsites accept new optional param. Import circularity if `ExportFormat` imported from geometry into state — **declare inline in types.ts instead**. |
| P1-A | Low | `useToastMaybe()` returns `null` if no provider — all method calls should be optional-chained (`toast?.error(...)`). |
| P1-B | None | `useAppStore.getState()` is fully typed. Removes three `(window as any)` casts — strict mode improvement. |
| P1-C | None | `role="dialog"` is a valid `aria-*` attribute. `aria-modal` may need `aria-modal="true"` string not boolean in JSX; use `aria-modal` (boolean attr in React). |
| P1-D | None | `as const` widening is safe. `shortcut.keys` is `string` in the JSX key — no type narrowing on individual entries. |
| P2-C | None | `clearTimeout` accepts `NodeJS.Timeout`. Empty deps on cleanup-only effect is correct. |
| Inferred-2 | None | `handleResizeEnd` is already correctly typed as `() => void` within the effect scope. |
| OMISSION-3 | None | Adding `handleExit` to deps satisfies exhaustive-deps. No type change. |

**Net ESLint result:** P1-B removes three `(window as any)` casts — that is a strict-mode
improvement. OMISSION-3 resolves a `react-hooks/exhaustive-deps` warning. No new `any` is
introduced by any item.

---

## E2E Test Impact

**`e2e/v2-undo-redo-verification.spec.ts`** — **ZERO impact if P1-B scope is honoured.**

The spec depends entirely on `window.__POTFOUNDRY_STORE__` (15 occurrences). As long as
`store.ts` L117–119 (`(window as any).__POTFOUNDRY_STORE__ = useAppStore`) is NOT removed,
every test in this spec continues to pass.

No other planned change touches the store-global registration, the undo/redo slice, or the
keyboard shortcuts that the test bypasses.

**Summary of E2E safe/unsafe actions:**

| Action | E2E Safe? |
|---|---|
| Wrap AppUIv2 in ErrorBoundary | ✅ Yes |
| Add `exportFormat` to UI slice | ✅ Yes (not tested by E2E) |
| Refactor ToolbarV2 to use `useAppStore.getState()` | ✅ Yes |
| Remove `window.__POTFOUNDRY_STORE__` from store.ts | ❌ **NO — breaks all 15+ assertions** |
| WelcomeCard changes | ✅ Yes (E2E tests bypass UI layer entirely) |
| ShortcutsDialog text changes | ✅ Yes |
| SidebarV2 blur fix | ✅ Yes |

---

## Executioner Sign-off

**Assessment:** This is a well-scoped audit with one genuine trap (the P1-B store.ts
cleanup) and one naming error (Inferred-2 `handleResizeCancel`). All other items are
straightforward. I recommend proceeding with all three phases.

**Risk summary:**
- Phase 1 and 2: low risk, high confidence, can go out in a single PR with a focused review.
- Phase 3 (P0-B): medium complexity. The four-file change needs tsc + unit test validation
  before merge. The `downloadMesh` function in stlExport.ts is the right call site — it
  already handles 3MF dispatch and was used in the v1 `ExportPanel.tsx` (confirmed via grep).

**Recommendation to Master:** approve all nine items for implementation with the two
constraint annotations:
1. P1-B: ToolbarV2 refactor only — `store.ts` L117–119 is untouchable.
2. Inferred-2: rename `handleResizeCancel` references in the plan to `handleResizeEnd`.

These constraints are minor and do not change the intent of either item. Ready to implement
upon Master's go-ahead.
