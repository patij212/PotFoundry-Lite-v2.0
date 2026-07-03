# UI v3 "Studio at Dusk" — Phase 3: Mobile UX Cycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bring the v3 shell to phones per spec §9's five approved rules — sheet, thumb-zone tabs+CTA, fat touch instruments, camera coordination, landscape side panel — prototype-grade, ending in an **on-device QA handoff to the owner** (the spec-mandated human exit gate this plan cannot self-satisfy).

**Architecture:** Reuse over rebuild: `useSheetDrag` (src/hooks — round-25 fixes C3/C4/C5 already applied), `useMobile` + `BREAKPOINTS`, the existing `body[data-mobile-sheet-state]` canvas-offset CSS (v3 only emits the attribute), `useSwipeGesture`/`useHaptics` relocated from ui/v2/hooks to shared src/hooks with v2 re-export shims. Touch layout is a MODE of the existing instruments (ParamRow gains a touch variant via context; tabs/Blueprint/Showroom adapt), not a parallel component tree.

**Tech Stack:** unchanged. E2E adds Playwright touch emulation (viewport 390×844 + hasTouch).

**Recorded deviations (owner-visible):**
- **Virtual-keyboard handling** (sheet vs keyboard) deferred — zero precedent app-wide (no visualViewport listeners anywhere); needs its own design.
- **Landscape** ships as the minimal side-panel swap (spec §9 rule 5); deep landscape UX deferred.
- **Two-finger-twist orbit + double-tap recenter** (spec §9 rule 4, gesture half) deferred to the on-device cycle's findings — the renderer's existing touch handling already provides orbit; custom gesture work waits for real-device feel.
- The **on-device QA checklist** (Task 13) is the phase's real exit gate; Playwright emulation is necessary-not-sufficient.

## Global Constraints

Phase-1/2 constraints all bind (ESLint 0-warnings; typecheck no NEW errors [2 known corridorPave]; detect_changes before commits; `--pf3-` tokens + guard tests; gold-on-action; tabular-nums; reduced-motion; safeStorage for all storage; one icon family via icons.tsx; sentence-case active-verb copy; commit trailer). Additions:

- **Round-25 engineering rules are law:** sheet drag via refs + direct style writes (useSheetDrag already complies — do not fork it); listeners drag-scoped; NO console.log in gesture code; NO overshoot easing on the sheet; ≥44px touch targets; `env(safe-area-inset-*)` on bottom-anchored chrome.
- **Canvas offset contract:** v3 emits `document.body.dataset.mobileSheetState` exactly like v2 (`collapsed|half|full`, cleaned up on unmount) — the existing `WebGPUPreview.css` rules do the rest. Do NOT modify WebGPUPreview.css.
- **Breakpoint:** mobile = `useMobile()` `isMobile` (≤768). Landscape side-panel = `isMobile && matchMedia('(orientation: landscape)')`.
- **v1/v2 untouched** except the two named shim files (Task 1) and PricingModal's small-screen CSS (Task 11) — all their tests stay green.
- **E2E:** dev server required; `--project=chromium --workers=1` (blueprint-drag flake under parallel GPU load — known); never hard-kill Playwright.

## File Structure (Phase 3)

```
Move (with re-export shims left behind):
  src/ui/v2/hooks/useSwipeGesture.ts → src/hooks/useSwipeGesture.ts
  src/ui/v2/hooks/useHaptics.ts      → src/hooks/useHaptics.ts
src/ui/v3/
  mobile/
    TouchModeContext.tsx (+test)      # provider + useTouchMode()
    SheetShell.tsx/.css (+test)       # sheet host: useSheetDrag, grabber, attr emission
    MobileTabBar.tsx/.css (+test)     # bottom tabs + Export CTA (thumb zone)
    MobileStageControls.tsx/.css (+test)  # bottom-left camera/undo cluster
  primitives/ParamRow.* (touch variant)
  blueprint/BlueprintCanvas.* (strip mode)
  showroom/ShowroomOverlay.*/StyleThumb.* (long-press + full-screen CSS)
  AppUIv3.tsx (+css/test)             # responsive split
Modify: src/ui/pricing/PricingModal.css (small-screen safety)
Test: e2e/ui-v3-smoke.spec.ts (mobile describe) · docs: on-device QA checklist
```

## Task summary (13 tasks)

| # | Task | Model hint |
|---|---|---|
| 1 | Relocate useSwipeGesture/useHaptics to src/hooks (+shims) | haiku |
| 2 | TouchModeContext + AppUIv3 responsive split (empty sheet) | sonnet |
| 3 | SheetShell over useSheetDrag + attr emission + safe-area | sonnet |
| 4 | MobileTabBar (tabs + CTA, swipe, haptics) | sonnet |
| 5 | ParamRow touch variant (52px, row-scrub, steppers, keypad, detents) | sonnet |
| 6 | Sheet panel composition (tabs content + footer inside sheet) | haiku |
| 7 | Blueprint strip mode | haiku |
| 8 | Mobile stage chrome (toolbar hide, thumb cluster, hint reposition) | haiku |
| 9 | Mobile showroom (full-screen + long-press preview) | sonnet |
| 10 | Landscape side-panel swap | haiku |
| 11 | PricingModal small-screen safety | haiku |
| 12 | Mobile e2e (touch emulation) + screenshots | sonnet |
| 13 | On-device QA checklist + handoff doc | haiku |

---

### Task 1: Shared gesture hooks

**Files:** `git mv src/ui/v2/hooks/useSwipeGesture.ts src/hooks/useSwipeGesture.ts` and `git mv src/ui/v2/hooks/useHaptics.ts src/hooks/useHaptics.ts`; create one-line re-export shims at the OLD paths (`export * from '../../../hooks/useSwipeGesture';` — adjust relative depth); update `src/hooks/index.ts` barrel if one exists (verify).

- [ ] **Step 1:** verify current v2 import sites (grep `useSwipeGesture|useHaptics` in src/ui/v2) — they keep working via the shims, unchanged.
- [ ] **Step 2:** move + shims; run `npx vitest run src/ui/v2 src/ui/v3 src/hooks && npm run typecheck` — everything green with ZERO v2 test modifications.
- [ ] **Step 3:** commit `refactor(hooks): share swipe + haptics hooks with v3 via src/hooks (v2 shims)`.

### Task 2: TouchModeContext + responsive split

**Files:** Create `src/ui/v3/mobile/TouchModeContext.tsx` (+test); modify `src/ui/v3/AppUIv3.tsx` (+test), `AppUIv3.css`.

**Interfaces:**
- Produces: `TouchModeProvider: React.FC<{ value: boolean; children }>`; `useTouchMode(): boolean` (default false when unwrapped — safe for all existing desktop tests).
- AppUIv3: `const { isMobile } = useMobile();` — when mobile-portrait: render `<SheetShell>` placeholder (Task 3 fills it) INSTEAD of PanelShell/StatusLine/HintLine; PillToolbar hidden (Task 8 refines); AccountChip stays. Desktop path byte-identical. `data-layout="mobile|desktop"` on `.pf3-root` for CSS.

- [ ] **Step 1: failing tests** — useTouchMode default false; provider true propagates; AppUIv3 with mocked `useMobile` → `{isMobile: true}` renders `[data-layout="mobile"]`, no `pf3-panel`, no pills; `{isMobile: false}` → existing desktop assertions green unchanged (mock at module level with a default false).
- [ ] **Step 2: implement** (SheetShell placeholder = `<div data-testid="pf3-sheet" />` until Task 3), **Step 3: gates** (`npx vitest run src/ui/v3 && npm run typecheck`), **Step 4: commit** `feat(ui-v3): touch-mode context + mobile/desktop shell split`.

### Task 3: SheetShell

**Files:** Create `src/ui/v3/mobile/SheetShell.tsx`, `SheetShell.css`, `SheetShell.test.tsx`; modify `AppUIv3.tsx` (mount).

**Interfaces:**
- Consumes: `useSheetDrag` from `src/hooks/useSheetDrag` — verify its exact option/return shape (`{ state, dragHandlers, toggle }`, stops 72px/50%/85%) before coding; `safeStorage` not needed (sheet state is transient).
- Produces: `SheetShell: React.FC<{ children; footer?: React.ReactNode }>` — fixed bottom sheet, glass surface (square top corners? NO — `border-radius: var(--pf3-radius-lg) var(--pf3-radius-lg) 0 0`), grabber (`role="slider"`, `aria-valuetext={state}`, 44px hit area, `{...dragHandlers}`), children in a scrollable content area (`touch-action: pan-y`), footer slot pinned above the safe-area padding (`padding-bottom: max(var(--pf3-space-sm), env(safe-area-inset-bottom, 0))`). Emits `document.body.dataset.mobileSheetState` on every state change; removes it on unmount. Wraps children in `<TouchModeProvider value={true}>`. Snap transition uses `--pf3-ease-enter` (NO spring/overshoot). Escape → toggle to collapsed (guarded input check).

- [ ] **Step 1: verify** useSheetDrag's API + that its CSS class hooks (`pf2-mobile-sheet--dragging`?) are parameterizable or class-agnostic — if it hardcodes pf2 classnames, adapt via the hook's options if present, else wrap (do NOT fork the hook; if truly pf2-coupled, add an optional `draggingClassName` option to the HOOK with the pf2 default — one additive change, its v2 tests stay green; record it).
- [ ] **Step 2: failing tests** — renders grabber + children + footer; body attr set on mount ('collapsed' initial or hook default), cleaned on unmount; TouchModeProvider active (probe with a child consuming useTouchMode); Escape collapses (mock/spy toggle or assert attr).
- [ ] **Step 3: implement, Step 4: gates + commit** `feat(ui-v3): SheetShell — three-stop sheet over the shared drag hook`.

### Task 4: MobileTabBar

**Files:** Create `src/ui/v3/mobile/MobileTabBar.tsx`, `.css`, `.test.tsx`.

**Interfaces:**
- Consumes: `SegmentedControl`, store `ui.v3ActiveTab`/`setV3ActiveTab`, `useSwipeGesture` (from src/hooks), `useHaptics`.
- Produces: `MobileTabBar: React.FC<{ contentRef: RefObject<HTMLElement> }>` — a row: SegmentedControl (Shape/Style/Export, flex-1) + a compact gold Export button (dispatches `'pf3:download'`, `aria-label="Export STL"`, min 44px). Swipe left/right on `contentRef` cycles tabs with `tap()` haptic. Rendered by SheetShell's footer slot (wired in Task 6).

- [ ] **Step 1: failing tests** — renders 3 tabs + CTA; tab click sets store + fires haptic (mock useHaptics); CTA dispatches pf3:download; swipe callbacks wired (mock useSwipeGesture capturing options; invoke onSwipeLeft → store tab advances; at 'export' stays or wraps — pick NO wrap, clamp at ends, assert).
- [ ] **Step 2: implement, Step 3: gates + commit** `feat(ui-v3): MobileTabBar — thumb-zone tabs + export`.

### Task 5: ParamRow touch variant

**Files:** Modify `src/ui/v3/primitives/ParamRow.tsx`, `.css`, `.test.tsx`.

**Interfaces:**
- `const touch = useTouchMode();` — when true, render the 52px instrument (spec §9 rule 2): center label + mono value stacked; `−`/`+` stepper buttons at row ends (44px, single-step per tap; LONG-PRESS repeats: 400ms delay then 80ms interval, cleared on up/leave/cancel); the WHOLE ROW is the scrub surface (reuse the existing scrub state machine: pointerdown anywhere on the row body [not steppers] → 4px threshold → dx/3 per step — extract the chip-scrub logic so both surfaces share it); tap (no move) on the value → the existing editor input with `inputMode="decimal"`; haptic `tap()` on detents (crossing defaultValue) and at min/max clamp (gate: only when a haptics hook is available — import `useHaptics`); slider hidden in touch mode (the row IS the slider), keep it rendered `visually-hidden` for AT? NO — keep the range input visible but slim beneath (simplest honest: keep it, 24px touch-height via CSS). Desktop path byte-identical (all existing tests untouched).

- [ ] **Step 1: failing tests** — wrap renders in `<TouchModeProvider value={true}>`: 52px class present; stepper + increments by step and fires history begin/commit per tap; long-press (fake timers: 400ms + 2×80ms) yields 3 increments with ONE begin/commit pair (press = one gesture); row-scrub +30px writes startValue+10·step, begin/commit once; clamp at max fires haptic tap (mock useHaptics); tap value opens editor with inputMode decimal. Desktop (unwrapped) suite untouched and green.
- [ ] **Step 2: implement** (shared scrub helper; steppers must NOT trigger row-scrub — stopPropagation on their pointerdown), **Step 3: gates + commit** `feat(ui-v3): ParamRow touch instrument — fat rows, steppers, detents`.

### Task 6: Sheet panel composition

**Files:** Modify `src/ui/v3/AppUIv3.tsx` (+test), `src/ui/v3/mobile/SheetShell.css` (spacing only if needed).

- [ ] Compose mobile: `<SheetShell footer={<><MobileTabBar contentRef={sheetContentRef}/><ExportFooter/></>}>` with tab content (Shape/Style/Export switch on `v3ActiveTab`) inside — reusing the SAME tab components (ParamRow adapts via context). Wait — footer = TabBar + ExportFooter stacks two bars; spec wants tabs + CTA in ONE thumb row and the estimate line compact. Decision (spec §9 rule 1): footer = MobileTabBar only (its CTA replaces the footer's); ExportFooter renders INSIDE the Export tab content on mobile (its estimate/certificate/gating intact). Implement exactly that: mobile Export tab renders `<ExportTab/><ExportFooter/>`; Shape/Style tabs = their components. AppUIv3 test: mobile mode → sheet contains ShapeTab content; switching store tab swaps content; MobileTabBar present once.
- [ ] Gates + commit `feat(ui-v3): mobile panel composition — tabs live in the sheet`.

### Task 7: Blueprint strip mode

**Files:** Modify `src/ui/v3/blueprint/BlueprintCanvas.tsx`, `.css`, `.test.tsx`.

- [ ] `useTouchMode()` → strip variant: height 64 (viewBox unchanged — scale down via CSS height; SVG scales), handles r=9 (≈28px hit at strip scale — compute: strip renders ~2× smaller, so DOUBLE the SVG handle radius in touch mode to net ≥28px), ticks font bumped to 10. Tests: touch-wrapped render has the strip class + larger handle radius attr; drag still writes store (reuse existing pointer test with the touch wrapper). Desktop untouched.
- [ ] Gates + commit `feat(ui-v3): Blueprint strip mode — the signature survives the phone`.

### Task 8: Mobile stage chrome

**Files:** Create `src/ui/v3/mobile/MobileStageControls.tsx`, `.css`, `.test.tsx`; modify `AppUIv3.tsx` (+test), `AppUIv3.css`, `stage/HintLine.css`.

- [ ] Mobile mode: PillToolbar NOT rendered (assert); `MobileStageControls` = two 44px round glass buttons bottom-LEFT (`IconCameraReset` → controller.resetCamera guarded; `IconUndo` → store undo), positioned above the sheet's peek height (`bottom: calc(88px + env(safe-area-inset-bottom, 0))`); AccountChip persists top-right; HintLine: mobile CSS repositions above the controls, text swaps to "Drag to orbit · pull up for controls" via a `useTouchMode` branch (copy change — update its test with a touch-wrapped case). Undo/camera tests mirror PillToolbar's (mock controller).
- [ ] Gates + commit `feat(ui-v3): mobile stage chrome — thumb cluster, no icon strip`.

### Task 9: Mobile showroom

**Files:** Modify `src/ui/v3/showroom/ShowroomOverlay.css`, `StyleThumb.tsx`, `StyleThumb.test.tsx`, `ShowroomOverlay.test.tsx` (only if assertions need the touch wrapper).

- [ ] CSS: `@media (max-width: 768px)` → panel inset 0 (full-screen), grid `repeat(3, 1fr)`, search 44px, chips scrollable row, safe-area padding.
- [ ] StyleThumb long-press: touchstart → 350ms timer → `onHoverIntent` (live preview) + `tap()` haptic; movement >8px or touchend before 350ms cancels; touchend AFTER preview started → `onHoverEnd` (revert — the overlay's existing snapshot logic handles it) and DO NOT fire onClick (suppress the synthetic click; the user was previewing); plain tap (<350ms, no move) → onClick (apply). Fake-timer tests for all three paths (long-press preview + release reverts; quick tap applies; move cancels).
- [ ] Gates + commit `feat(ui-v3): mobile showroom — full-screen library with press-to-preview`.

### Task 10: Landscape side panel

**Files:** Modify `src/ui/v3/AppUIv3.tsx` (+test), `AppUIv3.css`.

- [ ] `isMobile && matchMedia('(orientation: landscape)').matches` (tracked with a change listener) → render the DESKTOP composition (PanelShell etc.) instead of the sheet; `.pf3-root[data-layout="mobile-landscape"]` CSS narrows the panel (`width: 300px !important` cap? no — PanelShell min is already 300; just let it be) and hides StatusLine (height is precious). Test: mock useMobile true + matchMedia landscape true → `pf3-panel` present, `pf3-sheet` absent.
- [ ] Gates + commit `feat(ui-v3): landscape = side panel`.

### Task 11: PricingModal small-screen safety

**Files:** Modify `src/ui/pricing/PricingModal.css` ONLY.

- [ ] `@media (max-width: 480px)`: width 100%, inset auto 0 0 0 (bottom sheet style) or centered with `max-width: calc(100vw - 24px)`; close button inside bounds (`top: 8px; right: 8px`); `padding-bottom: max(16px, env(safe-area-inset-bottom, 0))`; `max-height: 85dvh; overflow-y: auto`. CSS-only — v1/v2 desktop rendering unchanged (rules scoped to the media query). Run `npx vitest run src/ui` green.
- [ ] Commit `fix(pricing): modal fits small screens + safe areas`.

### Task 12: Mobile e2e + screenshots

**Files:** Modify `e2e/ui-v3-smoke.spec.ts` (new `describe('UI v3 mobile')`).

- [ ] New describe with its own `test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })`. Tests: (a) sheet renders, body attr = initial state; (b) grabber drag (touchscreen or mouse fallback — useSheetDrag supports mouse) collapsed→half→full flips the body attr + canvas transform style changes; (c) MobileTabBar tap → Style tab content; (d) touch ParamRow stepper tap writes store (+1); (e) showroom full-screen: `all →` … tap tile applies; (f) no PillToolbar, MobileStageControls present; (g) screenshots `pf3-mobile-shape.png`, `pf3-mobile-sheet-full.png`, `pf3-mobile-showroom.png`. Desktop describe untouched, still green. Run `--workers=1`.
- [ ] Gates + commit `test(ui-v3): mobile e2e — sheet, thumb bar, touch instruments`.

### Task 13: On-device QA handoff

**Files:** Create `docs/superpowers/plans/2026-07-03-ui-v3-phase3-ondevice-qa.md`.

- [ ] A one-page checklist for the owner's real-device pass (the spec-mandated exit gate): how to reach the phone (dev server on LAN IP — include the `npm run dev -- --host` note + HTTPS caveat for WebGPU: Chrome Android needs the origin trusted; suggest `npx vite --host` + chrome://flags unsafely-treat-insecure-origin-as-secure for the LAN IP, or USB port-forwarding via chrome://inspect — list BOTH paths), then 12 checks: sheet drag feel (snap weight, no overshoot), peek/half/full canvas reframing, tab swipe, row-scrub precision vs steppers, long-press preview feel (350ms right?), blueprint strip usability, haptics (perceptible? annoying?), safe-areas on a notched device, landscape swap, showroom scroll+thumbnail perf, export firing + certificate on mobile, anything that feels wrong (free-form). Each check: pass/fail/notes column. Close with: findings feed a Phase-3.5 fix round.
- [ ] Commit `docs(ui-v3): on-device QA checklist — the human exit gate`.

## Plan Self-Review (at write time)

- **Spec §9 coverage:** rule 1 (tabs+CTA bottom) T4/T6; rule 2 (fat instruments) T5; rule 3 (camera coordination) T3 via existing CSS contract; rule 4 (thumb cluster) T8 — gesture half explicitly deviated; rule 5 (landscape) T10. Blueprint strip §9/§6 T7. Engineering constraints (C3/C4/C5, overshoot, safe-area, 44px) inherited via useSheetDrag + per-task rules. On-device gate T13.
- **Placeholders:** none; verify-first steps at T1.1, T3.1 name expected findings + fallback.
- **Type consistency:** `useTouchMode` (T2) consumed T5/T7/T8/HintLine; `SheetShell` footer slot ↔ T6 composition; MobileTabBar contentRef ↔ SheetShell content area (T6 wires); body-attr contract fixed to v2's exact dataset key.
- **Scope check:** virtual keyboard + custom orbit gestures deliberately out (recorded).

## Exit gate for Phase 3

Tasks 1-12 committed + gates green (unit incl. v2 regression, mobile e2e, typecheck, lint); screenshots reviewed against spec §9 (controller critique); THEN Task 13's checklist delivered to the owner — **the phase is "prototype-complete" at that point and "done" only after the owner's on-device pass + the resulting fix round.**
