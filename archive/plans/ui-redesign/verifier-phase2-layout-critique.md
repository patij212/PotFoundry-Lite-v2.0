# Verifier Phase 2 Critique — Layout Components

**Date**: 2026-03-06  
**Author**: The Verifier  
**Proposal reviewed**: `generator-phase2-layout-components.md`  
**Scope**: 8 files (~1,055 lines) — SidebarV2, StatusFooter, ToolbarV2, AppUIv2 rewrite

---

## Verdict: ACCEPT WITH AMENDMENTS

The proposal is architecturally sound. All state selectors, Radix APIs, and import paths verified against the actual source code. Three critical issues found: a `children` prop mismatch with the actual call site, a `pf2-spin` keyframes duplication, and a default sidebar width deviation from spec. Two amendments required, five warnings noted.

---

## Critical Issues (Must Fix Before Implementation)

### C1 [CRITICAL]: `children` Prop Never Passed — Viewport `<main>` Never Renders

**Generator's claim**: AppUIv2 accepts `children?: React.ReactNode` and wraps it in `<main className="pf2-layout__viewport">`.

**Actual behavior**: In `src/App.tsx` (L534-536):
```tsx
{uiTheme === 'v2' ? (
    <Suspense fallback={null}>
        <AppUIv2 />
    </Suspense>
) : (
    <AppUI />
)}
```

Both `<AppUIv2 />` and `<AppUI />` are rendered **without children**. The canvas is a sibling element rendered separately at `src/App.tsx` L424-428 — it's never passed into the UI component. The v1 `AppUI` also accepts `children` but it's never used at the call site.

**Impact**: The `{children && (<main className="pf2-layout__viewport">...` block will NEVER render. The `.pf2-layout__viewport` CSS is dead code. This is cosmetically harmless for Phase 2 (the canvas sits behind the overlaid UI regardless), but it's misleading architecture.

**Required fix**: Either:
- **(A)** Remove the `children` prop and viewport wrapper entirely. The canvas is managed by `App.tsx`, not by `AppUIv2`. The UI components are overlays. This matches reality.
- **(B)** Keep the `children` prop for future use but add a code comment explicitly noting that `App.tsx` currently does NOT pass children. Do not render `<main>` when there are no children — the current code already handles this (`{children && ...}`), so this is cosmetically fine but architecturally confusing.

**Recommendation**: Option (A). The overlay model is the actual architecture. Don't document a dead code path as if it's load-bearing.

### C2 [CRITICAL]: `@keyframes pf2-spin` Duplication Creates Maintenance Risk

**Generator's claim** (Open Question 5): "CSS keyframes with the same name will coalesce, and since both do `rotate(0deg → 360deg)`, there's no conflict."

**Actual behavior**: `@keyframes pf2-spin` is defined in two places:
1. `src/ui/v2/controls/ButtonV2.css` (L163-166) — used by `.pf2-button__spinner svg`
2. Proposed `StatusFooter.css` — used by `.pf2-status-footer__spinner`

The Generator is correct that duplicate `@keyframes` with the same name is not a CSS error — the last definition wins. But this is fragile:
- If a future agent modifies one definition (e.g., adds easing to the ButtonV2 spinner), the StatusFooter spinner silently picks up or doesn't pick up the change depending on import order.
- Import order in Vite is deterministic but non-obvious — it depends on which component mounts first.

**Required fix**: Move `@keyframes pf2-spin` to `motion.css` (alongside `pf2-shimmer`, `pf2-fade-in`, etc.) and remove it from both `ButtonV2.css` and `StatusFooter.css`. The motion system is the canonical location for all keyframe definitions. This is consistent with the existing architecture where `pf2-slide-in`, `pf2-tab-enter`, `pf2-shimmer`, and `pf2-fade-in` all live in `motion.css`.

### C3 [CRITICAL]: Default Sidebar Width Deviates From Spec

**Generator's claim**: `DEFAULT_WIDTH = 380` in SidebarV2.tsx.

**Spec says** (consolidated design doc, L64): `Sidebar (340px default, resizable)`.

**Impact**: 40px wider than spec. This affects first-impression aesthetics and viewport usable area. The spec value was presumably chosen for the luxury editorial feel.

**Required fix**: Change `DEFAULT_WIDTH` to `340`. The `MIN_WIDTH = 320` is fine (allows 20px squeeze below default).

---

## Amendments (Required Changes)

### A1: Fix MIN_WIDTH / MAX_WIDTH_CAP Consistency

Generator sets `MIN_WIDTH = 320`, `MAX_WIDTH_CAP = 480`. The spec says `340px default, resizable` but doesn't specify min/max. The values are reasonable, but the `getMaxWidth()` function uses `window.innerWidth * 0.45` as a cap. On a 1920px display, this is 864px — well above `MAX_WIDTH_CAP = 480`. The `Math.min` ensures 480px is the true max. This is correct but the `0.45` magic number is misleading since it never wins on desktop. Consider a comment explaining that the 0.45 factor only matters on narrow displays (< ~1067px where 0.45 × width < 480).

### A2: HelpDialog Import Path Needs Verification of Relative Depth

**Generator's claim**: `import { HelpDialog } from '../../shared/HelpDialog'` from `src/ui/v2/layout/ToolbarV2.tsx`.

**Actual location of HelpDialog**: `src/ui/shared/HelpDialog.tsx` (exported at L115).

**ToolbarV2.tsx will be at**: `src/ui/v2/layout/ToolbarV2.tsx`.

**Relative path from** `src/ui/v2/layout/` **to** `src/ui/shared/`:
```
src/ui/v2/layout/ToolbarV2.tsx
 → ../../  = src/ui/
 → ../../shared/ = src/ui/shared/ ✓
```

**Verdict**: The path `../../shared/HelpDialog` resolves to `src/ui/shared/HelpDialog.tsx`. **CORRECT.** No amendment needed — I initially flagged this as suspicious because v2 imports from v1 shared, but the spec explicitly states shared components are reusable. Confirmed.

### A3: useAnnounce Import Path Verification

**Generator's claim**: `import { useAnnounce } from '../shared/Announcer'` from `src/ui/v2/layout/SidebarV2.tsx`.

**Actual file**: `src/ui/v2/shared/Announcer.tsx` — exports `useAnnounce` at L28.

**Relative path from** `src/ui/v2/layout/` **to** `src/ui/v2/shared/`:
```
src/ui/v2/layout/SidebarV2.tsx
 → ../  = src/ui/v2/
 → ../shared/ = src/ui/v2/shared/ ✓
```

**Verdict**: Path `../shared/Announcer` resolves correctly. **CORRECT.**

### A4: useControllerMaybe Import Path Verification

**Generator's claim**: `import { useControllerMaybe } from '../../../context'` from `src/ui/v2/layout/ToolbarV2.tsx`.

**Actual file**: `src/context/index.ts` — exports `useControllerMaybe` (confirmed at L10).

**Relative path from** `src/ui/v2/layout/` **to** `src/context/`:
```
src/ui/v2/layout/ToolbarV2.tsx
 → ../../../  = src/
 → ../../../context = src/context ✓
```

**Verdict**: **CORRECT.**

### A5: usePerformance Import Path

**Generator's claim**: `import { usePerformance } from '../../../state'` from `src/ui/v2/layout/StatusFooter.tsx`.

**Actual location**: `src/state/store.ts` L146, re-exported from `src/state/index.ts` L37.

**Relative path from** `src/ui/v2/layout/` **to** `src/state/`:
```
src/ui/v2/layout/StatusFooter.tsx
 → ../../../  = src/
 → ../../../state = src/state ✓
```

**Verdict**: **CORRECT.** Returns `s.performance` which is the full `PerformanceState` object including `triangleCount`, `vertexCount`, `generationTime`, `isGenerating`. ✓

---

## Warnings (Non-blocking but Noteworthy)

### W1 [WARNING]: Alt+N Keyboard Shortcut on macOS

**Generator acknowledges this**: Alt (Option) + Number produces special characters on Mac (e.g., `Alt+1` = `¡`, `Alt+2` = `™`, `Alt+3` = `£`).

**Assessment**: This is a real UX issue but **NOT a Phase 2 blocker**. Reasons:
1. Phase 2 keyboard shortcuts are secondary navigation — tabs are also clickable.
2. The shortcut fires on `keydown` and calls `e.preventDefault()`. The `e.key` check is done against `'1'`, `'2'`, `'3'`. On macOS, when Option+1 is pressed, `e.key` is `'¡'`, NOT `'1'`. So **the shortcut silently does nothing on Mac** — it doesn't produce a conflict, it just doesn't work.
3. A proper fix requires platform detection (`navigator.platform` or `navigator.userAgent.includes('Mac')`) and either using `Cmd+1/2/3` (conflicts with browser tab switching) or a different key set.

**Recommendation for Phase 5 (Polish)**: Add `Ctrl+1/2/3` as a cross-platform alternative. `Ctrl+Number` doesn't produce special characters on Mac and doesn't conflict with Cmd+Number browser shortcuts. Or: detect Mac and show different keybindings in the help dialog. Not a Phase 2 concern.

### W2 [WARNING]: Overlay Sidebar vs Push Sidebar

**Generator's design**: Sidebar is `position: fixed` overlaying the viewport. Canvas is always full-width.

**v1 behavior**: Sidebar pushes the viewport via flex layout.

**Spec says** (L64): "Sidebar (340px default, resizable)" — does not specify overlay vs push.

**Assessment**: The overlay approach is consistent with the "luxury editorial" aesthetic where the 3D pot is always centred and full-bleed. This is a deliberate design upgrade from v1. The canvas handles its own sizing via `ResizeObserver` (confirmed in `WebGPUController.ts` and fallback renderers). The sidebar overlaying the canvas is fine because:
1. The canvas's `ResizeObserver` fires on the container div, not on available space after sidebar.
2. The pot is auto-centred in the 3D scene regardless of viewport shape.
3. Users who want more viewport space can close the sidebar or enter zen mode.

**Verdict**: Overlay is the correct choice for v2. Not a blocker. But add a code comment in `AppUIv2.css` explaining the deliberate overlay model so future agents don't "fix" it to match v1.

### W3 [WARNING]: Resize Handle ARIA Pattern

**Generator's claim**: `role="separator"` with `aria-orientation="vertical"` and keyboard ArrowLeft/ArrowRight.

**Assessment**: The WAI-ARIA `separator` role with `aria-valuenow`/`aria-valuemin`/`aria-valuemax` is the **correct** pattern for an adjustable splitter per [WAI-ARIA Practices - Window Splitter](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/). The Generator correctly provides:
- `role="separator"` ✓
- `aria-orientation="vertical"` ✓  
- `aria-valuenow={width}` ✓
- `aria-valuemin={MIN_WIDTH}` ✓
- `aria-valuemax={MAX_WIDTH_CAP}` ✓
- `tabIndex={0}` for focusability ✓
- ArrowLeft/ArrowRight keyboard navigation ✓

**One minor issue**: The `aria-valuemax` reports `MAX_WIDTH_CAP` (480) but the actual max depends on `getMaxWidth()` which can be lower on narrow screens. This is a cosmetic ARIA inaccuracy, not a functional issue. Consider dynamically computing `aria-valuemax={getMaxWidth()}`. Non-blocking.

### W4 [WARNING]: Save/Load Logic Duplication

**Generator acknowledges** (Rationale ToolbarV2, point 2): The save/load logic is duplicated from v1 `Toolbar.tsx`.

**Assessment**: This is acceptable for Phase 2. The save/load code is ~60 lines of straightforward JSON serialization/deserialization. Extracting to a shared utility would be over-engineering at this stage:
1. v1 and v2 run mutually exclusively (only one is mounted at a time).
2. The logic is simple enough that duplication cost < abstraction cost.
3. If v1 is eventually removed, the shared utility would be unused.

**Recommendation**: Accept for Phase 2. If a future phase adds more save/load variants (e.g., cloud save), extract then. Not now.

### W5 [WARNING]: StatusFooter Re-render Frequency

**Generator's claim** (Rationale 6): "`useMemo` depends on the three specific performance values, not the entire `performance` object."

**Actual behavior**: `const performance = usePerformance()` returns `useAppStore((s) => s.performance)` — this selects the **entire** `PerformanceState` object. Any change to any field in `PerformanceState` (including `renderTime`, `volume`, `surfaceArea`) triggers a re-render of `StatusFooter`, even though only 3 fields are used.

**Impact**: During active interaction (e.g., dragging a slider), `renderTime` updates every frame → StatusFooter re-renders every frame. The `useMemo` prevents expensive formatting recalculation, but the component still reconciles every frame.

**Recommendation**: Replace `usePerformance()` (which selects the full object) with individual selectors:
```tsx
const triangleCount = useAppStore((s) => s.performance.triangleCount);
const vertexCount = useAppStore((s) => s.performance.vertexCount);
const generationTime = useAppStore((s) => s.performance.generationTime);
const isGenerating = useAppStore((s) => s.performance.isGenerating);
```
This scopes re-renders to only the 4 fields actually consumed. Non-blocking for Phase 2 (the component is lightweight), but should be fixed before Phase 3 when tab content adds weight.

---

## Confirmed Claims

✅ **Radix Tabs API** — `@radix-ui/react-tabs@^1.1.13` confirmed in `package.json` L29. `Tabs.Root`, `Tabs.List`, `Tabs.Trigger`, `Tabs.Content` all verified as valid exports. `value`/`onValueChange` on Root: correct. `data-state='active'` on Trigger: correct (standard Radix data attribute). `forceMount` on Content: valid prop (verified by createElement test). ✓

✅ **`Shrink` and `Expand` icons** — Both verified as valid exports from `lucide-react@^0.555.0`. Runtime check: `typeof icons.Shrink === 'object'` and `typeof icons.Expand === 'object'`. ✓

✅ **CSS Token References** — All verified against `src/ui/v2/AppUIv2.css`:
- `--pf2-z-viewport`: L78 (`0`) ✓
- `--pf2-shadow-float`: L66 (`0 8px 32px rgba(0,0,0,0.4)`) ✓
- `--pf2-accent-subtle`: L49 (`rgba(180,151,90,0.12)`) ✓
- `--pf2-bg-hover`: L32 (`#26262f`) ✓
- `--pf2-text-muted`: L38 (`#7a756f`) ✓
- `--pf2-font-body`: L71 (`'Satoshi', 'Inter', system-ui, sans-serif`) ✓
- `--pf2-radius-sm`: L60 (`4px`) ✓

✅ **Animation Keyframe References** — All verified in `src/ui/v2/motion.css`:
- `pf2-slide-in`: L50-59 ✓
- `pf2-fade-in`: L143-146 ✓
- `pf2-tab-enter`: L73-82 ✓
- `pf2-shimmer`: L119-122 ✓
- `pf2-spin`: Exists in `ButtonV2.css` L163-166 (but needs dedup per C2)

✅ **State Selectors** — All verified against `src/state/types.ts` and `src/state/slices/ui.ts`:
- `s.ui.panelOpen`: L265 in types.ts ✓
- `s.ui.zenMode`: L280 ✓
- `s.ui.v2ActiveTab`: L278 ✓
- `s.ui.fullscreen`: L271 ✓
- `s.ui.uiTheme`: L276 ✓
- `s.setPanelOpen`: L63 in ui.ts ✓
- `s.toggleZenMode`: L109 in ui.ts ✓
- `s.setV2ActiveTab`: L104 in ui.ts ✓
- `s.togglePanel`: L55 in ui.ts ✓
- `s.toggleFullscreen`: L86 in ui.ts ✓

✅ **`useControllerMaybe` import path** — Exported from `src/context/index.ts` L10. Resolves correctly from `../../../context`. ✓

✅ **`HelpDialog` import path** — Exported from `src/ui/shared/HelpDialog.tsx` L115. Resolves from `../../shared/HelpDialog`. Accepts `{ open: boolean; onOpenChange: (open: boolean) => void }`. ✓

✅ **`usePerformance` import** — Exported from `src/state/store.ts` L146, re-exported from `src/state/index.ts` L37. Returns `PerformanceState` with `triangleCount`, `vertexCount`, `generationTime`, `isGenerating`. ✓

✅ **`useAnnounce` import path** — Exported from `src/ui/v2/shared/Announcer.tsx` L28. Resolves from `../shared/Announcer`. ✓

✅ **`ButtonV2` props** — `fullWidth` (L15), `iconLeft` (L13) confirmed in `src/ui/v2/controls/ButtonV2.tsx`. ✓

✅ **`IconButtonV2` export** — Exported from `src/ui/v2/controls/ButtonV2.tsx` L87. ✓

✅ **React.lazy() compatibility** — `src/App.tsx` L21: `const AppUIv2 = lazy(() => import('./ui/v2/AppUIv2'))`. The `export default AppUIv2` in the proposal maintains compatibility. ✓

✅ **forceMount={false} behavior** — `forceMount={false}` is the default for Radix `Tabs.Content`. Content unmounts when tab is inactive. Setting it explicitly is redundant but not harmful. ✓

---

## Conditions for Executioner

### Implementation Order
1. **motion.css first** — Add `@keyframes pf2-spin` to `motion.css`. Remove it from `ButtonV2.css`.
2. **StatusFooter.tsx + StatusFooter.css** — Independent, no layout dependencies. Remove duplicate `@keyframes pf2-spin` from CSS.
3. **SidebarV2.tsx + SidebarV2.css** — Depends on StatusFooter. Change `DEFAULT_WIDTH` to 340.
4. **ToolbarV2.tsx + ToolbarV2.css** — Independent of sidebar.
5. **AppUIv2.tsx rewrite** — Remove `children` prop and `<main>` wrapper (per C1 fix A). Keep all other logic.
6. **AppUIv2.css append** — Add `.pf2-layout` and remove dead `.pf2-layout__viewport` rule. Add comment documenting overlay model.

### Validation Protocol
- [ ] `npm run typecheck` passes (zero errors)
- [ ] `npm run lint` passes (zero warnings)
- [ ] `npx vitest run` — all existing tests pass (no regressions)
- [ ] Dev server starts (`npm run dev`), v2 UI renders with sidebar + toolbar
- [ ] Tab switching works (click + Alt+1/2/3 on non-Mac)
- [ ] Sidebar resize works (drag + ArrowLeft/ArrowRight)
- [ ] Sidebar width persists in localStorage
- [ ] Close button hides sidebar
- [ ] Zen mode: Z key hides sidebar, toolbar stays visible
- [ ] Download button renders (no onClick — Phase 3)
- [ ] Stats line displays (0 tri / 0 vert / <1 ms initially, updates when pot renders)
- [ ] v1 UI untouched (switch back to classic, everything works)

### Mandatory Diff Check
After implementation, verify:
- `src/ui/v2/motion.css` contains exactly one `@keyframes pf2-spin`
- `src/ui/v2/controls/ButtonV2.css` no longer contains `@keyframes pf2-spin`
- `src/ui/v2/layout/StatusFooter.css` does NOT contain `@keyframes pf2-spin`
- `src/App.tsx` is **unchanged** (zero modifications to the call site)

---

## Open Questions Resolved

| # | Question | Verdict |
|---|----------|---------|
| 1 | `Shrink`/`Expand` icons exist? | **YES** — verified at runtime against `lucide-react@^0.555.0` |
| 2 | Alt+N on Mac? | **Non-blocking** — silently does nothing on Mac (e.key returns special char, not digit). Fix in Phase 5 |
| 3 | `forceMount={false}` for Phase 3? | **Phase 3 concern** — Currently fine. Revisit when tab content has scroll state |
| 4 | Overlay vs push sidebar? | **Overlay is correct** — matches luxury aesthetic. Canvas is full-bleed. Comment required. |
| 5 | `pf2-spin` duplication? | **Must deduplicate** — moved to motion.css per C2 |
