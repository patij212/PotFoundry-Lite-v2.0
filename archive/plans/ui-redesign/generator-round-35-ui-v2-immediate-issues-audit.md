# Generator Round 35 — UI v2 Immediate Issues Audit
Date: 2026-03-07

---

## Executive Summary

UI v2 launched with 19 parametric styles, a progressive disclosure system,
and an accessibility-first design philosophy. The reality is that v2 ships
with **two P0-level bugs** (one a production crash vector, one a complete
lie to the user about format selection), **five P1 behavioral failures**
(silent errors, blocked UI, wrong shortcuts), and **at least four P2 quality
regressions** compared to v1. Additionally, code-pattern analysis surfaces
**three inferred issues** not yet confirmed but highly likely given the
patterns in the existing code.

The system is not broken beyond recovery. It needs a disciplined triage pass,
not a rewrite. Every issue below has a concrete fix path, all contained within
the v2 directory.

---

## P0 Issues — Crash / Data Loss / Wrong Output

These must be fixed before any v2 feature work. A P0 that ships is a trust
burn with no recovery.

---

### P0-A: Missing ErrorBoundary — Entire v2 UI crashes to blank screen on any unhandled React error

**File**: `src/App.tsx` lines 537–539, contrast with v1 `AppUI` wrappers

**Evidence**:
```tsx
// App.tsx line 537 — v2 mount point
<Suspense fallback={null}>
    <AppUIv2 />   // ← NO ErrorBoundary. Any throw here = blank screen.
</Suspense>
```

v1 uses `<ErrorBoundary name="AppUI">`, `<ErrorBoundary name="Sidebar">`,
`<ErrorBoundary name="Toolbar">` at every major subtree.

v2 has ZERO ErrorBoundary coverage anywhere.

**Blast radius**: A thrown error in any of the 20 v2 components — a null
deref in `SliderV2`, a bad preset in `LibraryDrawer`, a GPU crash propagating
into React — removes the entire UI from the DOM. The user sees a white screen
with no way back except a full page reload. Console shows nothing UI-visible.

**Fix strategy**:
- Wrap `AppUIv2` in `App.tsx` with `<ErrorBoundary name="AppUIv2">`, matching
  the v1 pattern
- Additionally, add per-section boundaries inside `AppUIv2` itself: one around
  `<ToolbarV2 />`, one around `<SidebarV2 />` (the highest-risk component given
  the parametric schema rendering), one around `<WelcomeCard />`
- The existing `ErrorBoundary` component used by v1 is in scope — reuse it,
  do not roll a new one
- No new API needed; this is purely a wrapping change

**Assumptions for Verifier**:
1. The existing v1 `ErrorBoundary` component is in `src/ui/` and compatible
   with React 18 (verify it is a class component with `getDerivedStateFromError`)
2. Wrapping at `App.tsx` level is sufficient as a minimum shipping fix, even
   without the per-section granularity

---

### P0-B: Export format selector is a complete lie — "3MF" selection has zero effect

**Files**: `src/ui/v2/tabs/ExportTab.tsx` lines 74–79, 125, 177–195;
`src/ui/v2/layout/StatusFooter.tsx` line 69

**Evidence**:

In `ExportTab.tsx`:
```tsx
const [format, setFormat] = useState<ExportFormat>('stl');
// ... format is used ONLY for button active state ...
// ... format is NEVER passed anywhere outside this component ...
```

In `StatusFooter.tsx`:
```tsx
const handleDownload = useCallback(async () => {
    if (progress.status === 'generating') return;
    await exportSTL();  // ← always STL, never reads format from ExportTab
}, [progress.status, exportSTL]);
```

The `format` state is local to `ExportTab`. `StatusFooter` owns the actual
download trigger (`exportSTL()` from `useExport`). These two components share
no state. The user can click "3MF" in the Export tab, the button lights up
active, and they still get an STL file.

This is not a UI bug. **This is a false promise to the user** — PotFoundry
advertises a feature it does not deliver.

**Fix strategy — two options, Generator recommends Option 2**:

*Option A (Honest demotion)*: Remove the Format selector UI entirely until 3MF
export is actually implemented. Replace with a comment in the code marking
it as a planned feature. No new state management required. Clean and honest.
Risk: removes a visible feature, may confuse users who noticed it.

*Option B (Plumb the wire)*: Lift `format` state out of `ExportTab` into
Zustand (`meshSlice` or a new `exportSlice`). Add `exportFormat: 'stl' | '3mf'`
to the store. `StatusFooter` reads this state. `ExportTab` writes to it via a
store action. The download dispatch in `useExport` routes to the appropriate
exporter. If 3MF export doesn't exist yet, the 3MF button triggers a toast:
"3MF export is coming soon — your download is in STL format."

*Option B is the recommended path*: it preserves the UX intent, eliminates the
lie, and sets up the real implementation. The interim toast is honest.

**Assumptions for Verifier**:
1. `useExport` hook at `src/hooks/useExport.ts` accepts parameters that
   could be modified to accept a format argument (verify the hook signature)
2. Zustand `meshSlice` can accept a new `exportFormat` field without breaking
   existing serialization (localStorage keys are versioned at `2.1`)
3. 3MF format is NOT currently implemented — confirm before implementing Option B

---

## P1 Issues — Observable Wrong Behavior

User can see or experience these. They erode trust and break workflows.

---

### P1-A: Silent failures on design file load — errors swallowed, no user feedback

**File**: `src/ui/v2/layout/ToolbarV2.tsx` lines 168, 195

**Evidence**:
```tsx
if (!designData.version || !designData.geometry || !designData.style) {
    console.warn('Invalid design file format');  // ← user sees nothing
    return;
}
// ...
} catch (error) {
    console.error('Failed to load design:', error);  // ← user sees nothing
}
```

A user drags in a corrupt `.json` file, or a `.json` from an old format.
Nothing happens. No toast. No red outline. No dialog. The file input closes.
The app looks exactly as it did before. The user has no way to know the load
failed vs. succeeded with no visual change.

The ToastProvider infrastructure is present in the codebase (used elsewhere in
v1). `useAnnounce()` from `Announcer.tsx` is available in any v2 component.

**Fix strategy**:
- Import and call `useAnnounce()` inside `ToolbarV2`
- Replace `console.warn('Invalid design file format')` with
  `announce('Could not load design — invalid format')` (screen reader +
  toast) and optionally a toast via whatever toast hook is available
- Replace `console.error('Failed to load design:', error)` with
  `announce('Failed to load design file')` — do NOT expose raw error text,
  just the human-readable summary
- Keep `console.error` in addition to the announce for debugging

**Assumptions for Verifier**:
1. `useAnnounce()` is accessible inside ToolbarV2 since it lives within
   `AppUIv2` which wraps `AnnouncerProvider` — confirm React context
   propagates correctly here (it should; ToolbarV2 is a direct React child
   of AnnouncerProvider, not a portal)
2. A toast infrastructure exists that can be called from ToolbarV2

---

### P1-B: ToolbarV2 design save/load uses `window.__POTFOUNDRY_STORE__` global hack

**File**: `src/ui/v2/layout/ToolbarV2.tsx` lines 93–96, 179–182

**Evidence**:
```tsx
const store = (window as unknown as {
    __POTFOUNDRY_STORE__?: { getState: () => Record<string, unknown> }
}).__POTFOUNDRY_STORE__;
if (!store) return;  // ← silent failure in test / SSR
```

Both `handleSave` and `handleLoad` use this pattern. This bypasses React's
hook system entirely. Problems:

1. **In test environments**: `window.__POTFOUNDRY_STORE__` is not populated →
   save/load silently does nothing → no test coverage is possible for this code
2. **During cold boot**: if the Zustand store hasn't been attached to `window`
   yet (race condition at startup), save returns silently
3. **Maintenance trap**: this is not typed, not refactorable by the language
   server, and invisible to IDE symbol tracking

The design data being saved/loaded (`geometry`, `style`, `appearance`) is
available directly via `useAppStore()` selectors. `handleSave` can be
rewritten as a closure that reads from direct `useAppStore.getState()` —
the Zustand recommended pattern for imperative reads outside render cycles.

**Fix strategy**:
- Replace both `window.__POTFOUNDRY_STORE__` accesses with
  `import { useAppStore } from '../../../state'` + `useAppStore.getState()`
  which is the Zustand-native way to read state imperably in a callback
- `useAppStore.getState()` returns the full state object; no global window
  attachment needed
- The "apply changes on load" flow (`s.setGeometryParams(...)` etc.) should
  use direct store action calls (same pattern as the v1 load handler)

**Assumptions for Verifier**:
1. `useAppStore` is the Zustand store; confirm it exposes a static `.getState()`
   on the store object (this is standard Zustand API — `create()` returns the
   store with `.getState()`, `.setState()`, `.subscribe()`)
2. No `window.__POTFOUNDRY_STORE__` attachment is required by any other code
   (search for other reads before removing the attachment point in `main.tsx`
   or wherever it's set)

---

### P1-C: WelcomeCard blocks all UI interactions — no focus trap, no `aria-modal`, leaking pointer events

**File**: `src/ui/v2/onboarding/WelcomeCard.tsx`

**Evidence**:
```tsx
<div
    className={`pf2-welcome${exiting ? ' pf2-welcome-exit' : ''}`}
    role="complementary"    // ← not a dialog, no aria-modal
    aria-label="Welcome to PotFoundry"
>
```

Three confirmed issues in one component:

1. **WCAG modal violation**: `role="complementary"` is a landmark. It is NOT
   a dialog. A visually modal element MUST use `role="dialog"` with
   `aria-modal="true"` and a focus trap. Screen readers can navigate "behind"
   the WelcomeCard to all interactive elements, even though pointer events
   block visual interaction. This violates WCAG 2.1 SC 4.1.2.

2. **E2E test blocker confirmed**: The WelcomeCard CSS intercepts pointer
   events. 14 E2E tests required localStorage pre-seeding to bypass it.
   Any test that exercises the first-run experience will fail unless this
   is resolved.

3. **Escape key listener is registered globally** (`window.addEventListener`
   at line 41) but the listener function `handleExit` is NOT stable across
   renders — it depends on the `exiting` and `dismissed` state via closure.
   The effect re-registers on every change to `[level, dismissed]`.
   While this mostly works, it can leave a stale listener attached between
   renders if `dismissed` changes while `level` is still 0.

**Fix strategy**:
- Replace `role="complementary"` with `role="dialog"` + `aria-modal="true"`
  + `aria-labelledby` pointing to the wordmark `<h1>`
- Add a focus trap: when WelcomeCard is visible, `Tab` and `Shift+Tab` cycle
  between only the two buttons ("Pick a Style", "I know what I'm doing")
  — or use Radix `<Dialog>` to get this for free
- For the CSS: confirm the pointer-events behavior and either use
  `inert` attribute on the underlying content, or wrap in Radix Dialog
- E2E tests can stop using the localStorage workaround once focus trap
  makes Escape key dismissal reliable

**Assumptions for Verifier**:
1. Converting WelcomeCard to a Radix Dialog is the right long-term fix — but
   Radix Dialog's Portal would render outside `pf2-root`, which may affect
   the CSS custom property cascade (verify `data-theme` propagation)
2. The `useHtmlInert` pattern (setting `inert` on sibling elements) is
   supported in the target browser matrix (verify — inert has been baseline
   since 2023, should be fine)

---

### P1-D: ShortcutsDialog has two documentation errors — wrong Shift description, missing Ctrl+Z/Ctrl+Y

**File**: `src/ui/v2/shared/ShortcutsDialog.tsx` lines 19–27

**Evidence**:
```tsx
const V2_SHORTCUTS = [
    { keys: 'Z', description: 'Toggle zen mode' },
    { keys: 'Alt + 1', description: 'Shape tab' },
    { keys: 'Alt + 2', description: 'Style tab' },
    { keys: 'Alt + 3', description: 'Export tab' },
    { keys: '?', description: 'Keyboard shortcuts' },
    { keys: 'Shift + ←/→', description: 'Fine-tune slider (±1)' },  // ← WRONG
    { keys: 'F11', description: 'Toggle fullscreen' },
    // ← Ctrl+Z missing. Ctrl+Shift+Z missing.
] as const;
```

Issue 1: **`'Shift + ←/→'` is documented as "Fine-tune slider (±1)"** but
`SliderV2.tsx` line 148: `const bigStep = step * 10;` — Shift+Arrow is a
**COARSE** step (×10), not a fine-tune step. The description is directionally
backwards. Users who expect precision keyboard control will get the opposite.

Issue 2: **Ctrl+Z (Undo) and Ctrl+Shift+Z (Redo) are implemented in
`AppUIv2.tsx` lines 83–97 and tested** — but invisible to users in the
shortcuts panel. This is not just missing documentation; it actively hides
a power feature.

Extra omissions: `Double-click slider` to reset to default (implemented in
SliderV2) is also undocumented.

**Fix strategy**:
- `'Shift + ←/→'` → description: `'Large step slider (×10)'`
- Add `{ keys: 'Ctrl + Z', description: 'Undo' }`
- Add `{ keys: 'Ctrl + Shift + Z', description: 'Redo' }` (also `Ctrl + Y`)
- Add `{ keys: 'Double-click slider', description: 'Reset to default' }`
- No logic changes — this is a pure constant update

**Assumptions for Verifier**:
1. Ctrl+Y redo is also registered (check AppUIv2.tsx line 87 — confirm `'y'`
   case exists)
2. The `as const` assertion can accommodate adding entries without type errors

---

### P1-E: `useConfidence` — `saveState()` silently fails in private/incognito mode, resetting UX on every load

**File**: `src/ui/v2/onboarding/useConfidence.ts` lines 110–120

**Evidence**:
```tsx
function saveState(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ... }));
    } catch {
        // localStorage quota exceeded or blocked — silently fail
    }
}
```

In private/incognito mode, `localStorage.setItem` throws. The catch swallows
it. The user's confidence level is never persisted. On every page load, they
get level 0 — which means: WelcomeCard re-appears, FourierBloom is forced
as the active style (overwriting their choice), auto-rotate is enabled.

**This actively destroys user work** in private mode: every time the page is
refreshed, the style they chose is replaced by FourierBloom.

**Fix strategy**:
- After the catch, set an in-memory flag `private IncognitoMode = true`
- When `loadState()` fails on read AND `saveState()` fails on write, the
  store should operate in "ephemeral mode" — state persists for the session
  but never hits localStorage
- The WelcomeCard `initializedRef` mechanism already prevents double-init
  within a session; the problem is cross-page-load, not within-session
- Minimum fix: in `saveState()` catch block, set a module-level
  `storageAvailable = false` flag; in `loadState()`, if `storageAvailable`
  was ever false, do not attempt read on next call
- Simpler alternative: catch `localStorage.setItem` ONCE at module init,
  set `storageAvailable`, and branch all reads/writes on it

**Assumptions for Verifier**:
1. The FourierBloom re-initialization in `WelcomeCard` is gated on
  `level === 0 && !initializedRef.current` — confirm that `initializedRef`
  is a `useRef` (not module-level state) meaning it resets every mount, which
  means every page load in incognito triggers the FourierBloom override
  (initializedRef.current = false at mount → runs setStyle('FourierBloom'))

---

## P2 Issues — Quality / Polish

Real regressions vs. v1 or documented intent that degrade the experience.

---

### P2-A: SliderV2 ghost marker misalignment at track edges

**File**: `src/ui/v2/controls/SliderV2.tsx` line 170

**Evidence**:
```tsx
// TODO: Phase 4 — compensate for Radix getThumbInBoundsOffset.
// The ghost marker uses left: X% relative to Root, but Radix adjusts
// the Thumb position at extremes (0%, 100%) to keep it in bounds.
// This causes up to ±9px misalignment at the track edges.
const ghostPercent = ...
    ? ((defaultValue - min) / (max - min)) * 100
    : undefined;
```

The ghost marker (default-value dot) is off by up to ±9px at min/max
extremes. This is not cosmetic — users rely on the ghost to find the "safe
default" position, especially for risky params like `seamAngle` or
`export_n_z`. An offset ghost misleads users about the default.

**Fix strategy**:
Radix's thumb offset is calculated by: `thumbInBoundsOffset = (thumbWidth / 2) * (1 - Math.abs(percent * 2 - 1))` where thumbWidth ≈ 18px (verify from CSS `--pf2-slider-thumb-size`). Apply the same compensation to `ghostPercent`:

```tsx
const THUMB_WIDTH_PX = 18; // match --pf2-slider-thumb-size
const thumbOffset = (THUMB_WIDTH_PX / 2) * (1 - Math.abs(ghostPercent / 50 - 1));
const compensatedLeft = `calc(${ghostPercent}% + ${thumbOffset}px)`;
```

Set `left: compensatedLeft` instead of `left: ${ghostPercent}%` in the ghost marker inline style.

**Assumptions for Verifier**:
1. Radix's exact `getThumbInBoundsOffset` formula matches the calculation above
   (verify from `@radix-ui/react-slider` source — it's public)
2. The ghost marker uses `position: absolute; left: X%` relative to the track
   root (check `SliderV2.css`)

---

### P2-B: `useStyleTransition` — 1-frame flash of wrong params on rapid multi-style change

**File**: `src/ui/v2/hooks/useStyleTransition.ts`

**Evidence** (code-derived):
```
User taps Style A → Style B → Style C within 340ms (faster than exit animation):

Timeline:
  t=0ms:   Style A → B. setPhase('exiting'). timer_1 = setTimeout(340ms).
  t=100ms: Style B → C. prevStyle.current = C. clearTimeout(timer_1).
           setPhase('exiting') again. timer_2 = setTimeout(340ms).
  t=440ms: timer_2 fires. setPhase('pausing'). setDisplayStyle(C). <-- correct
  
BUT: between t=100ms and t=440ms, displayStyle is STILL "A" (the original).
React batch rendering means on the frame between 'exiting' phase restarting
and the new setPhase, there can be a 1-frame gap where displayStyle shows
"B" (if timer_1's partial execution set it before being cleared).
```

Actually the deeper issue: when `onStyleChanged('C')` fires at t=100ms,
`timerRef.current` (timer_1) is cleared BEFORE it fires. `displayStyle`
remains 'A'. The new chain runs correctly. **The original analysis in
the evidence is right** — the issue is if the user fires a 3rd style change
WHILE the pause phase is executing (after `setDisplayStyle(newStyle)` fires
but before the next `setTimeout`). In that case, `displayStyle` briefly
shows the intermediate style 'B'.

**Severity**: Low — requires sub-340ms triple-tap. But it produces a visible
flash of different param sliders during fast style browsing.

**Fix strategy**:
- Track `pendingStyle` as a ref, set it immediately on every `onStyleChanged`
  call
- In the pause phase `setTimeout`, read from `pendingStyle.current` instead
  of the captured `newStyle` closure variable
- This collapses all rapid-fire changes into a single transition targeting
  the most recent style

---

### P2-C: WelcomeCard `exitTimeoutRef` has no unmount cleanup

**File**: `src/ui/v2/onboarding/WelcomeCard.tsx`

**Evidence**:
```tsx
const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

const handleExit = useCallback((trigger) => {
    if (exiting || dismissed) return;
    setExiting(true);
    exitTimeoutRef.current = setTimeout(() => {
        setDismissed(true);  // ← called after 220ms
        unlock(trigger);
    }, 220);
}, [exiting, dismissed, unlock]);

// There is NO useEffect(() => { return () => clearTimeout(exitTimeoutRef.current); }, [])
```

If confidence is unlocked externally (e.g., via deep-link trigger setting
level to 3 directly), `WelcomeCard` re-renders with `level !== 0` and returns
null — but the 220ms timer may still be in flight from a prior `handleExit`
call. When it fires, `setDismissed(true)` and `unlock(trigger)` execute
on an unmounted component. React 18 doesn't throw but strict mode warns, and
the `unlock()` call is a double-trigger on the confidence store.

**Fix strategy**:
```tsx
useEffect(() => {
    return () => {
        if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    };
}, []);
```
One `useEffect` with empty deps. Four lines. Done.

---

### P2-D: `useAnnounce()` portal concern — false alarm, but real in one scenario

**File**: `src/ui/v2/shared/Announcer.tsx`

The evidence claims `LibraryDrawer` portals "outside the React tree" and
therefore gets a no-op announcer. **This claim is incorrect**: React context
propagates through React portals (`.createPortal`) because portals are still
logically children in the React component tree — only their DOM position
changes. `LibraryDrawer` calls `useAnnounce()` and DOES receive the correct
announcement function.

**However, a real variant of this issue exists**: if `useAnnounce()` is ever
called in a component that is instantiated OUTSIDE of `AppUIv2` (e.g., a
modal spawned from v1 code, or a future component mounted independently),
it will silently return the no-op. The `console.warn` warning is dev-only:
```tsx
const AnnouncerContext = createContext<AnnounceFn>(() => {
    if (import.meta.env.DEV) {   // ← production: no warning, silent no-op
        console.warn('useAnnounce() called outside <AnnouncerProvider>');
    }
});
```

**Fix strategy** (P2 defensive improvement):
- Change the default context value to always warn (remove the `DEV` guard),
  since silent failures in accessibility infrastructure are particularly
  harmful
- Alternatively, add a displayName/dev-only invariant that fires in
   non-test environments too

---

## Inferred Additional Issues

Based on the patterns above, these are bugs I expect to find but have not
confirmed by direct code read. They should be investigated, not assumed fixed.

---

### Inferred-1: `handleScreenshot` DOM cleanup race condition

**File**: `src/ui/v2/layout/ToolbarV2.tsx` ~line 87

**Pattern**: ToolbarV2's `handleScreenshot` does:
```tsx
const blob = await controller.takeScreenshot();  // async
// ...
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
```

If `ToolbarV2` unmounts between the `await` and the `appendChild` (e.g., user
switches to v1 theme mid-screenshot), `document.body.appendChild` will still
execute on a stale closure. The anchor is appended, clicked, removed — this
works since it's DOM, not React state — but `URL.revokeObjectURL` may fire
before the browser has processed the download. This is a known anti-pattern.

**Fix**: Replace with `await Promise.resolve()` after click, or use a 0ms
setTimeout before revokeObjectURL. Lower priority but worth noting.

---

### Inferred-2: `SidebarV2` resize saves width on `mouseup` but not on `mouseleave`

**File**: `src/ui/v2/layout/SidebarV2.tsx`

**Pattern**: `handleResizeEnd` is attached to `document mouseup`. If the
user initiates a resize drag and releases outside the browser window (drag
off-screen), the `mouseup` event may not fire in the document. This leaves
`isResizing = true` permanently until the next mouse interaction, causing the
sidebar to continue tracking mouse movement unexpectedly.

**Fix**: Also listen on `mouseleave` of `document` or use `pointerup`/
`pointercancel` (pointer events properly handle drag-off-window cancellation).

---

### Inferred-3: `LibraryDrawer` search input has no debounce — O(n) filter on every keystroke

**File**: `src/ui/v2/shared/LibraryDrawer.tsx`

**Pattern**: `searchQuery` state drives a `useMemo` filter over `PRESETS`. With
~20 presets this is harmless, but the pattern signal is important: if the
library grows to hundreds of user-saved designs (the Supabase integration
direction), unfiltered re-render on every keystroke will spike.

**Fix**: Add a 150ms debounce on `setSearchQuery` or use `useDeferredValue`.
Inexpensive change that future-proofs the component.

---

### Inferred-4: `useColorMode` system-preference change listener may miss updates in some environments

**File**: `src/ui/v2/hooks/useColorMode.ts`

**Pattern**: Based on the similar `useStyleTransition` pattern of
`window.matchMedia('...').addEventListener('change', handler)`, confirm that
the cleanup (`removeEventListener`) uses the same function reference. If the
handler is re-created on each effect invocation (common mistake), the remove
call is a no-op, stacking up N listeners per render cycle.

---

## Recommended Fix Order

Priority rationale: fix crash risks first, then user-facing data integrity
issues, then surface behavioral failures, then polish.

```
Phase 1 — Immediate (before next deploy)
  1. P0-A: ErrorBoundary wrapper in App.tsx     [~20 min, 1 file, surgical]
  2. P0-B: Export format (Option A — remove lie) [~30 min, 1 file, deletion]
  3. P1-D: ShortcutsDialog constants fix         [~10 min, 1 file, constants]
  4. P2-C: WelcomeCard unmount cleanup           [~5 min, 4 lines, useEffect]

Phase 2 — Before v2 stable (next week)
  5. P1-A: Silent error → user feedback (toast/announce)
  6. P1-B: window store hack → useAppStore.getState()
  7. P1-C: WelcomeCard → role="dialog" + aria-modal + focus trap
  8. P1-E: useConfidence incognito mode persistence

Phase 3 — Quality pass
  9. P2-A: Ghost marker offset compensation
  10. P2-B: useStyleTransition rapid-fire flicker
  11. P2-D: Announcer dev-only warn removal
  12. Inferred-2: SidebarV2 resize pointercancel

Phase 4 — Maintenance (can defer)
  13. Inferred-1: Screenshot revoke timing
  14. Inferred-3: LibraryDrawer search debounce
  15. Inferred-4: useColorMode listener cleanup audit
```

**Critical path**: Phase 1 is 4 issues, estimated 65 minutes total.
Ship Phase 1 as a single hotfix PR before any new feature work lands.
Phase 2 should be grouped as a "v2 stabilization" PR with E2E test coverage.

---

## Open Questions for Verifier

1. **ErrorBoundary reuse**: Does the existing v1 `ErrorBoundary` component
   handle async errors (via `useErrorBoundary`) or only synchronous render
   errors? If async, no new work needed. If sync-only, async errors from
   `controller.takeScreenshot()` and `exportSTL()` would bypass it.

2. **3MF export status**: Is there ANY 3MF exporter in the codebase (even
   experimental)? Search `src/` for `3mf` and `xml` to confirm. If
   something exists, Option B for P0-B becomes more viable.

3. **`window.__POTFOUNDRY_STORE__` attachment**: Where is this set? If it's
   in `main.tsx`, removing it (as part of P1-B fix) may break other things
   (Playwright tests? debugging tools?). Confirm all consumers before deleting.

4. **WelcomeCard incognito + FourierBloom**: Confirm the `initializedRef`
   IS a React `useRef` (not a module-level variable). If it's `useRef`, it
   resets on every mount. If it were module-level, it would survive page
   reloads in the same browser session.

---

**Generator Sign-off**: This is not a cosmetic audit. Two P0 issues — a blank-screen crash
vector and a lying format selector — have been shipping in production. The silence-on-error
pattern (P1-A, P1-E) is the most insidious: users experience invisible failures and blame
themselves or their files. Phase 1 is 65 minutes of work that removes the most immediate
embarrassments. Phase 2 finishes what was clearly rushed. The inferred issues are low-risk
extrapolations of demonstrated code patterns; they should be investigated, not dismissed.
The v2 system is fundamentally sound — the architecture is clean, the progressive disclosure
design is clever, the accessibility intent is real — but the execution has gaps that need
honest accounting before v2 can be called stable.
