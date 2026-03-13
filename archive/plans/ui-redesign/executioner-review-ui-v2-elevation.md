# Executioner Review — UI v2 Elevation

**Date**: 2026-03-06  
**Status**: FEASIBLE — proceed to implementation  
**Documents reviewed**: Generator Round 1, Verifier Round 1, Base Design Doc, Master Rulings  
**Codebase files inspected**: 14 source files across state, hooks, UI, styles, and config  

---

## 1. Feasibility Assessment — Must-Have Items

### 1.1 Motion System (§1)

**Verdict**: FEASIBLE — Low risk

**Can it be built?** Yes. The plan proposes CSS custom properties for easing curves, CSS `@keyframes` animations, a JS `useReducedMotion()` hook, and stagger via CSS `animation-delay`. All standard CSS/React — zero exotic dependencies.

**Codebase validation**:
- Confirmed: current motion is three generic `ease` variables in `AppUI.css:98-100`. No `prefers-reduced-motion` anywhere.
- v2 CSS tokens go in `src/ui/v2/AppUIv2.css` — completely additive, no collision with `--pf-` prefix variables.

**Hidden dependencies**: None.

**Implementation notes**:
- Per Verifier A1.1: `grid-template-rows: 0fr → 1fr` is NOT GPU-composited. Mitigation: on tab switch, set sections to final expand state instantly — only stagger the `opacity` fade (which IS compositable). Per-section user-toggled expand/collapse can animate `grid-template-rows` safely (single element at a time).
- Per Master Ruling #4: stagger = 30ms per item, max 150ms total. Hardcode `--pf2-duration-stagger: 30ms`.
- `filter: blur(4px)` on sidebar enter is fine for one-shot animation. Verify it doesn't re-trigger on route changes (it won't — v2 is a SPA with no routing).

### 1.2 Micro-interactions (§1.4)

**Verdict**: FEASIBLE — Low risk

**Can it be built?** Yes. Slider thumb hover/active states, button press `scale(0.97)`, gold focus rings — all pure CSS transitions on `transform`, `box-shadow`, and `opacity`. These are GPU-compositable properties.

**Hidden dependencies**: None.

**Implementation notes**:
- `--pf2-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` has overshoot. Verify slider thumbs near container edges don't cause scrollbar flicker. Likely fine since thumb is 18px and overshoot is ~1px at that scale.

### 1.3 Export Progress Choreography (§3.1 / A3.2)

**Verdict**: FEASIBLE — Low risk (with Master Ruling #1 applied)

**Can it be built?** Yes. Per Master Ruling #1, we use **indeterminate progress** with post-hoc phase display. This means:
1. On export start: show pulsing/indeterminate gold progress bar (CSS animation only, no pipeline changes)
2. On export complete: show completion card with stats from `PipelineDiagnostics.phases` (already populated post-hoc)
3. No modification to `ParametricExportComputer.compute()`

**Codebase validation**:
- Confirmed: `useParametricExport.ts` fires `setProgress({ status: 'generating', progress: 10 })` once, then a monolithic `await computerRef.current.compute(params)`, then `setProgress({ status: 'complete', progress: 100 })`. No intermediate callbacks.
- `PipelineDiagnostics.phases` is populated at the end of compute and returned in `result.pipelineDiagnostics`.
- The hook already broadcasts `status` transitions that v2 components can subscribe to.

**Hidden dependencies**: None — this design specifically avoids pipeline changes.

**Implementation notes**:
- Indeterminate progress bar: CSS `@keyframes` shimmer/pulse on the progress fill. No fake percentages.
- Completion celebration: brightness pulse + check icon SVG draw + stats card. All CSS animation triggered on `status === 'complete'`.
- Post-hoc phase display: after completion, show timeline of phases with durations from `pipelineDiagnostics.phases`. Nice touch, zero pipeline risk.

### 1.4 SliderV2 (§5.1)

**Verdict**: FEASIBLE — Low risk

**Can it be built?** Yes. Wraps `@radix-ui/react-slider` (already installed, v1.3.6). New features are React state + CSS:
- Floating value tooltip: `position: absolute` + `left: ${thumbPercent}%` during drag.
- Default ghost marker: static `position: absolute` element on the track.
- Snap-to-default: JS logic in `onValueChange` callback.
- Double-click reset: `onDoubleClick` handler on track.

**Codebase validation**:
- Existing `Slider.tsx` wraps Radix `Root/Track/Range/Thumb` with `step` passthrough. All params in `STYLE_REGISTRY` have `min`, `max`, `step`, `default`, and `description` populated — confirmed across all 15 styles and 60+ parameters. Full description coverage.

**Hidden dependencies**: None.

**Implementation notes**:
- Per Master Ruling #5: snap threshold = `0.05 * (max - min)`, capped at `step * 5`.
- Per Verifier A5.1: add `min-width: 3ch` on floating tooltip to prevent width jitter.
- `thumbPercent = ((value - min) / (max - min)) * 100` — trivial math, no reflow concern.

### 1.5 Quality Tier Cards (§5.2)

**Verdict**: FEASIBLE — Low risk

**Can it be built?** Yes. Pure JSX + CSS grid. Four cards in a `grid-template-columns: repeat(4, 1fr)` layout. Selection state via CSS class. Mobile drops to `repeat(2, 1fr)`. Icons from `lucide-react` (already installed).

**Hidden dependencies**: Need to define `PROFILES` constant with triangle estimates per quality tier. The existing export pipeline has quality profiles (Draft/Standard/High/Ultra) — these just need to be surfaced as a typed array.

**Implementation notes**:
- Cards have `translateY(-2px)` hover lift — GPU-compositable, safe.
- Selected card gold border + `box-shadow` — standard CSS.

### 1.6 Keyboard / Focus Management (§4)

**Verdict**: FEASIBLE — Medium risk

**Can it be built?** Yes, but requires a new dependency.

**Codebase validation**:
- Confirmed: `useKeyboardShortcuts.ts` uses `1-5` for style selection (lines 268-273). Per Master Ruling #2: `Alt+1/2/3` for tab switching. Existing `1-5` style shortcuts preserved.
- Confirmed: `@radix-ui/react-focus-scope` is NOT installed. It must be added. `package.json` has: `react-collapsible`, `react-dialog`, `react-select`, `react-slider`, `react-tabs`, `react-tooltip`. No `focus-scope` or `focus-guard`.

**Hidden dependencies**:
- **Must install `@radix-ui/react-focus-scope`** (~3KB gzipped). Required for CameraPopover and LibraryDrawer focus trapping. Radix Dialog handles its own focus trapping internally, so existing dialogs are fine.

**Implementation notes**:
- `Alt+1/2/3` bindings: add to existing `useKeyboardShortcuts` handler (v2 only, gated by `uiTheme === 'v2'` check).
- `Z` for Zen mode: verify `isInputElement` guard covers `<canvas>` and Radix slider focus states. Current guard checks `tagName` for `INPUT`, `TEXTAREA`, `SELECT` and `contentEditable`. Canvas gets keyboard events but isn't in the exclusion list — `Z` will fire when canvas is focused, which is correct behavior.
- Focus return after modal/drawer close: Radix Dialog/Popover handle this. Manual implementation needed for LibraryDrawer (custom component) — track `triggerRef` and restore on close.

**Risk**: Medium — keyboard shortcut additions need careful testing against all existing bindings + browser defaults. `Alt` modifier is relatively safe (no common browser conflicts on Windows/Mac).

### 1.7 Accessibility (§8.1-8.4)

**Verdict**: FEASIBLE — Low risk

**Can it be built?** Yes. All proposed features use standard ARIA patterns:
- `AnnouncerProvider`: Context + hidden `role="status" aria-live="polite"` div. ~30 lines of React.
- Live regions on StatusFooter: add `role="status" aria-live="polite"` attributes.
- Focus return: `triggerRef` pattern for non-Radix components.
- Contrast corrections: CSS variable value changes.

**Codebase validation**:
- Confirmed: `Toast.tsx` uses `role="alert" aria-live="polite"` — so the pattern exists, just not for status bar and export progress.
- No existing ARIA announcer infrastructure.

**Hidden dependencies**: None.

**Implementation notes**:
- Per Verifier A8.1: use monotonic counter or invisible character append for repeated identical announcements.
- Per Verifier A8.2: announce stats on `onValueCommit` (drag end) not on debounced `onValueChange`. Radix Slider exposes `onValueCommit`.
- `forced-colors` media query for high contrast: browser-native, no dependency.

### 1.8 Sidebar Breathing Room (§6.1)

**Verdict**: FEASIBLE — Low risk

**Can it be built?** Yes. Change `DEFAULT_WIDTH = 380` in v2's `SidebarV2.tsx`. Internal padding from 16px to 20px. Section gap from 12px to 16px. All CSS.

**Codebase validation**:
- Confirmed: existing `Sidebar.tsx` has `DEFAULT_WIDTH = 340`, `MIN_WIDTH = 280`, persists to `localStorage` key `pf-sidebar-width`. v2 Sidebar will use its own localStorage key (`pf2-sidebar-width`) to avoid collision.

**Hidden dependencies**: None.

**Implementation notes**:
- Per Master Ruling #3: solid background `rgba(15, 15, 18, 0.96)` as default. `backdrop-filter: blur(12px)` behind `@supports` as progressive enhancement. This is a should-have, not must-have.
- Sidebar at 380px on 1366×768 = 27.8% viewport. Acceptable — users can resize down to 320px.

### 1.9 Progressive Disclosure (§2.3)

**Verdict**: FEASIBLE — Medium risk

**Can it be built?** Yes. Confidence tracking via `UserConfidence` interface in React state. Sections start collapsed, expand as user interacts with the app.

**Hidden dependencies**: Need to decide persistence strategy for confidence levels. Per Verifier N2.1: persist to `localStorage`, add "Reset tutorial" option.

**Implementation notes**:
- Four confidence levels gate which sections are visible/expanded.
- `hasChangedDimensions`, `hasChangedStyle`, `hasChangedAppearance`, `hasExported` — tracked by subscribing to store changes.
- Risk is UX tuning: thresholds for what constitutes "has interacted" need testing. Initial implementation: any non-default value = interacted.
- Must ensure v1 UI is completely unaffected — confidence tracking only applies when `uiTheme === 'v2'`.

**Risk**: Medium — the interaction between progressive disclosure and "load preset" is subtle. Loading a preset should reveal all dimension groups (preset changes everything). Need clear state transition rules.

---

## 2. File Structure Verification

### Vite Config (`vite.config.ts`)
- **No path aliases** defined. Uses default Vite resolution (relative imports).
- **No import restrictions**. `include` in `tsconfig.json` is just `["src"]` — any subdirectory under `src/` is included.
- Adding `src/ui/v2/` requires zero config changes.

### TypeScript Config (`tsconfig.json`)
- `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true` — all good, enforces quality.
- `moduleResolution: "bundler"` — supports ESM imports, no issues with new directory.
- `jsx: "react-jsx"` — correct for React 18.
- No `paths` mapping that would need updating.

### Existing `src/ui/v2/` Directory
- **Does not exist** — confirmed via file search. Clean slate.
- `AppUI` is imported via `import { AppUI } from './ui'` in `App.tsx` (line 11). The v2 root will be `import { AppUIv2 } from './ui/v2/AppUIv2'` — no conflict with barrel exports.

**Verdict**: File structure is fully compatible. Zero config changes needed.

---

## 3. State Additions

### Current State Shape

`UIState` interface in `types.ts:260-270`:
```ts
interface UIState {
  panelOpen: boolean;
  activeTab: 'controls' | 'presets' | 'export' | 'metrics';
  modalOpen: 'export' | 'presets' | 'settings' | 'about' | null;
  fullscreen: boolean;
}
```

### Persistence Analysis

**Critical finding**: `PERSISTED_KEYS` in `store.ts:50-53` is:
```ts
['geometry', 'style', 'mesh', 'appearance']
```

**`ui` is NOT in the persisted keys.** This means adding `zenMode`, `density`, and `uiTheme` to `UIState` has **zero migration risk** — the `ui` slice is reconstructed from defaults on every page load. No persisted data to migrate, no `undefined` fields to worry about.

### Proposed Changes

```ts
// types.ts — extend UIState
interface UIState {
  panelOpen: boolean;
  activeTab: 'controls' | 'presets' | 'export' | 'metrics';
  modalOpen: 'export' | 'presets' | 'settings' | 'about' | null;
  fullscreen: boolean;
  // v2 additions
  zenMode: boolean;
  density: 'compact' | 'comfortable' | 'spacious';
  uiTheme: 'classic' | 'v2';
}
```

```ts
// types.ts — extend DEFAULT_UI_STATE
const DEFAULT_UI_STATE: UIState = {
  panelOpen: true,
  activeTab: 'controls',
  modalOpen: null,
  fullscreen: false,
  zenMode: false,
  density: 'comfortable',
  uiTheme: 'classic',  // Ship with v1 as default
};
```

**However**: `uiTheme` needs its own persistence (survive reloads). Two options:

1. **Add `'ui'` to `PERSISTED_KEYS`**: Persists all UI state including `panelOpen`, `modalOpen`, etc. This would mean modals stay open across reloads, which is undesirable.
2. **Use standalone `localStorage`** for `uiTheme` and `density`: The design doc already proposes `localStorage.getItem('pf2-theme')`. This is cleaner — persist only the fields that should survive reloads, not transient UI state like `modalOpen`.

**Recommendation**: Option 2. Use `localStorage` directly for `uiTheme` and `density`. Initialize from localStorage in `DEFAULT_UI_STATE` factory or in the slice creator. This mirrors how `SidebarV2` width and `pf-preferred-renderer` already use standalone localStorage.

### UI Slice Changes (`slices/ui.ts`)

Add three new actions:
```ts
toggleZenMode: () => void;
setDensity: (density: UIState['density']) => void;
setUITheme: (theme: UIState['uiTheme']) => void;
```

These are trivial `set()` calls. `setUITheme` also writes to `localStorage`.

**Verdict**: No migration needed. No persistence conflicts. Straightforward additions.

---

## 4. Implementation Order

### Phase 0: Foundation (must land first)

**Changeset 0.1 — Design Tokens + Fonts**
- Create `src/ui/v2/AppUIv2.css` with all `--pf2-*` CSS custom properties (colors, spacing, easing curves, durations)
- Create `src/ui/v2/fonts.css` with `@font-face` declarations for Fraunces, Satoshi, IBM Plex Mono
- Add font files to `public/fonts/` (or use CDN `@import`)
- Create `src/ui/v2/motion.css` with `@keyframes` definitions and `prefers-reduced-motion` overrides
- Create `src/hooks/useReducedMotion.ts`
- **Test**: visual regression baseline, `prefers-reduced-motion` emulation

**Changeset 0.2 — State Additions**
- Extend `UIState` with `zenMode`, `density`, `uiTheme` (with defaults)
- Add slice actions: `toggleZenMode`, `setDensity`, `setUITheme`
- Add `localStorage` read/write for `uiTheme` and `density`
- **Test**: unit tests for slice actions, localStorage persistence

**Changeset 0.3 — Theme Switch Plumbing**
- Modify `App.tsx` to read `uiTheme` and conditionally render `<AppUIv2 />` vs `<AppUI />`
- Create minimal stub `AppUIv2.tsx` (renders "v2 shell" placeholder)
- Add theme toggle to existing Settings modal
- **Test**: toggling between v1 and v2 works, v1 UI is completely untouched

**Changeset 0.4 — Install Dependency**
- `npm install @radix-ui/react-focus-scope`
- **Test**: existing tests still pass, no bundle regression

### Phase 1: Base Components

**Changeset 1.1 — SliderV2**
- `src/ui/v2/controls/SliderV2.tsx` + `.css`
- Floating value tooltip, default ghost marker, snap-to-default, double-click reset
- Gold track, micro-interaction thumb states
- **Test**: unit tests for snap logic, double-click reset, value formatting

**Changeset 1.2 — SectionV2 + ButtonV2 + SelectV2**
- `src/ui/v2/controls/SectionV2.tsx` — collapsible with `grid-template-rows` animation
- `src/ui/v2/controls/ButtonV2.tsx` — gold accent, press depression
- `src/ui/v2/controls/SelectV2.tsx` — v2-styled Radix Select
- **Test**: unit tests for collapse/expand, ARIA attributes

**Changeset 1.3 — Accessibility Infrastructure**
- `src/ui/v2/shared/Announcer.tsx` — AnnouncerProvider + useAnnounce hook
- `.pf2-sr-only` utility class
- `.pf2-focus-ring` utility class (gold halo)
- **Test**: announcer fires on context invocation, sr-only class hides visually

### Phase 2: Layout Shell

**Changeset 2.1 — SidebarV2 + Tabs**
- `src/ui/v2/layout/SidebarV2.tsx` — tab-centric sidebar with Shape/Style/Export tabs
- Tab switching with directional crossfade animation + stagger
- Resizable with localStorage persistence (`pf2-sidebar-width`)
- `data-density` attribute application
- **Test**: tab switching, resize, stagger animation presence

**Changeset 2.2 — StatusFooter**
- `src/ui/v2/layout/StatusFooter.tsx` — persistent stats + Download button
- ARIA live region on stats
- **Test**: stats display, button state transitions

**Changeset 2.3 — ToolbarV2**
- `src/ui/v2/layout/ToolbarV2.tsx` — slimmed toolbar
- Hover reveal labels via `::after` pseudo-element
- **Test**: button rendering, hover states

**Changeset 2.4 — Wire AppUIv2**
- Replace stub with real SidebarV2 + ToolbarV2 + StatusFooter + viewport integration
- Wrap in AnnouncerProvider
- **Test**: full layout renders, no regressions in v1

### Phase 3: Tab Content

**Changeset 3.1 — ShapeTab**
- `src/ui/v2/tabs/ShapeTab.tsx` — presets, dimensions, thickness, features groups
- Progressive disclosure: sections start collapsed based on confidence level
- **Test**: parameter changes flow to store, sections collapse/expand

**Changeset 3.2 — StyleTab**
- `src/ui/v2/tabs/StyleTab.tsx` — style selector, dynamic params, appearance
- Parameter description tooltips from `STYLE_REGISTRY`
- Style switch animation (param exit/enter stagger)
- **Test**: style switch renders correct params, tooltips show descriptions

**Changeset 3.3 — ExportTab**
- `src/ui/v2/tabs/ExportTab.tsx` — quality cards, format, pipeline, advanced
- Quality tier card grid
- **Test**: profile selection updates export target

### Phase 4: Feature Components

**Changeset 4.1 — Export Progress Choreography**
- Indeterminate progress bar animation in StatusFooter
- Completion celebration (brightness pulse + check draw + stats card)
- Post-hoc phase timeline display
- ARIA progressbar role
- **Test**: progress states transition correctly, ARIA attributes valid

**Changeset 4.2 — Keyboard Shortcuts (v2)**
- Add `Alt+1/2/3` tab switching to `useKeyboardShortcuts`
- Add `Z` for zen mode, `D` for density cycling (gated to v2)
- **Test**: no conflicts with existing 1-5 style shortcuts, Alt+1/2/3 switches tabs

**Changeset 4.3 — CameraPopover + LibraryDrawer**
- `src/ui/v2/shared/CameraPopover.tsx` — FocusScope-wrapped popover
- `src/ui/v2/shared/LibraryDrawer.tsx` — full-screen overlay with FocusScope
- Focus return on close
- **Test**: focus trapping works, Escape closes, focus returns to trigger

**Changeset 4.4 — Progressive Disclosure**
- `useConfidence` hook tracking user interactions
- localStorage persistence for confidence levels
- "Reset tutorial" option in Settings
- **Test**: confidence levels advance correctly, reset works

### Phase 5: Polish + Validation

**Changeset 5.1 — Reduced Motion Audit**
- Verify ALL v2 animations respect `prefers-reduced-motion`
- Test with Chrome DevTools emulation

**Changeset 5.2 — Contrast Corrections**
- Apply `--pf2-text-secondary: #a8a29e` (per Verifier Q3 verdict)
- Verify all text/background pairs meet WCAG AA minimum

**Changeset 5.3 — Final Integration Test**
- All existing tests pass
- Bundle size delta < 25KB gzipped
- Manual QA across desktop Chrome, Firefox, Safari; mobile Chrome, Safari

---

## 5. Risk Summary

### Risk 1: Keyboard Shortcut Conflicts (Medium)

**What**: Adding `Alt+1/2/3`, `Z`, `D` shortcuts in v2 mode alongside existing `1-5`, `Ctrl+S/R/P/Z` bindings. `Z` (zen mode) could cause confusion near `Ctrl+Z` (undo). `Alt` combinations may conflict with browser chrome on Windows (Alt activates menu bar).

**Mitigation**:
1. All v2-only shortcuts gated by `uiTheme === 'v2'` check.
2. `Z` only fires when `!isInputElement && !e.ctrlKey && !e.metaKey`. Test canvas focus explicitly.
3. `Alt+1/2/3`: on Windows, `Alt` alone opens browser menu, but `Alt+number` is not a standard browser shortcut. Safe on Chrome/Firefox/Edge. Safari on Mac uses `Cmd` not `Alt`.
4. Build a comprehensive shortcut conflict matrix before implementation.

### Risk 2: Progressive Disclosure UX Edge Cases (Medium)

**What**: The confidence-level system interacts with presets, style switches, URL deep links, and the Library in non-obvious ways. Loading a preset that changes geometry + style + appearance should set all three confidence flags simultaneously. Deep link loading should bypass progressive disclosure entirely (user arrived via shared design). Library-loaded designs same.

**Mitigation**:
1. Define explicit state transition rules: preset load → all confidence flags true. Deep link → all true. Library load → all true.
2. Add `resetConfidence()` and `setFullConfidence()` utility functions.
3. Test the matrix: first-run + preset, first-run + deep link, first-run + style change, returning user (localStorage has confidence), returning user + clear localStorage.

### Risk 3: CSS/Visual Regression Between v1 and v2 (Low-Medium)

**What**: Both UI trees coexist in the bundle. v1 uses `--pf-` tokens, v2 uses `--pf2-` tokens. CSS class names differ (`.pf-slider` vs `.pf2-slider`). No specificity collision. But shared components (Toast, Auth modals, export hooks) render inside both UI shells — their styling must work in both contexts.

**Mitigation**:
1. Shared components (Toast, Auth) use their own CSS classes unchanged.
2. v2 wrapper components can add v2-specific overrides scoped to `.pf2-app` parent selector.
3. Test both UIs on every PR — add Playwright screenshot tests for both themes.
4. Track v1 CSS removal as future tech debt after v2 ships as default.

---

## Unstated Dependencies

| Dependency | Source | Impact |
|---|---|---|
| `@radix-ui/react-focus-scope` | §4.2 Focus trapping | Must install. ~3KB gzipped. |
| Font files (Fraunces, Satoshi, IBM Plex Mono) | Base design doc | Must source and host. Google Fonts has Fraunces and IBM Plex Mono. Satoshi is from Fontshare (free license). Self-host vs CDN decision needed. |
| `PROFILES` quality tier constant | §5.2 Quality cards | Must define triangle estimates per profile. Data exists in export pipeline but isn't surfaced as a typed constant yet. |
| `COLOR_PALETTES` curated palette set | §5.4 Color strip | Must curate 6-8 palettes. Content task, not engineering risk. |

---

## Questions for Generator & Verifier

1. **Font hosting**: Self-host in `public/fonts/` or use Google Fonts / Fontshare CDN? Self-hosting gives reliability and eliminates GDPR/tracking concerns. CDN gives zero bundle impact. Recommendation: self-host with `font-display: swap`.

2. **v2 tab naming**: The base design doc uses `'shape' | 'style' | 'export'` for v2 tabs, but existing `UIState.activeTab` is `'controls' | 'presets' | 'export' | 'metrics'`. Should we add a separate `v2ActiveTab` field or repurpose `activeTab`? Recommendation: add `v2ActiveTab: 'shape' | 'style' | 'export'` as a separate field to avoid v1/v2 type union pollution.

3. **Confidence persistence key**: The Verifier recommended `localStorage` for confidence tracking. Proposed key: `pf2-user-confidence`. Confirm no collision with existing keys (`pf-sidebar-width`, `pf-preferred-renderer`, `potfoundry-store`).

---

## Implementation Conditions Checklist (from Verifier)

| # | Condition | Status |
|---|---|---|
| 1 | Export progress: indeterminate or real phases | ✅ Master Ruling #1: indeterminate (A3.2). No pipeline changes. |
| 2 | Install `@radix-ui/react-focus-scope` | ✅ Phase 0.4. Confirmed not installed. |
| 3 | `Alt+1/2/3` for tabs, not bare `1/2/3` | ✅ Master Ruling #2. |
| 4 | `backdrop-filter` blur 12px with solid fallback | ✅ Master Ruling #3: should-have, solid default. |
| 5 | Stagger 30ms per item, 150ms max | ✅ Master Ruling #4. |
| 6 | Percentage-based snap threshold (5% range, cap step×5) | ✅ Master Ruling #5. |
| 7 | Test `backdrop-filter` on WebGPU canvas | ✅ Deferred to Phase 5 validation. Should-have feature. |
| 8 | Verify `description` field coverage in STYLE_REGISTRY | ✅ **Verified**: all 60+ params across all 15 styles have `description` populated. |

---

*End of Executioner Review — UI v2 Elevation*  
*Verdict: FEASIBLE. No blockers. One npm dependency to add. Proceed to implementation in 5 phases.*
