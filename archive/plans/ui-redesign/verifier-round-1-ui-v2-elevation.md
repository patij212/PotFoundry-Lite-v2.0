# Verifier Round 1 — UI v2 Elevation Critique

Date: 2026-03-06

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator produced an ambitious, well-reasoned proposal covering 10 subsystems. The writing quality is excellent and the rationale per-section is clear. However, several claims are inaccurate when checked against the actual codebase, one core feature (export progress phases during generation) is architecturally infeasible without pipeline changes, and there are priority mis-classifications.

Of 10 sections: **6 ACCEPT**, **4 ACCEPT WITH AMENDMENTS**, **0 REJECT**.

---

## Section-by-Section Analysis

### §1 — Motion & Animation System

**Claim**: "Transitions are limited to `--pf-transition-fast: 0.1s ease` / `--pf-transition-normal: 0.15s ease` / `--pf-transition-slow: 0.25s ease` — generic ease curves, no brand personality"

**Verification**: Confirmed. [AppUI.css](../../../potfoundry-web/src/ui/AppUI.css#L98-L100) defines exactly these three variables on `:root`. No custom cubic-bezier curves exist anywhere in the CSS.

**Claim**: "No `prefers-reduced-motion` media query anywhere in the codebase"

**Verification**: Confirmed. `grep` for `prefers-reduced-motion` across `src/` returns zero matches.

**Claim**: "`grid-template-rows: 0fr → 1fr` — proper GPU-composited height animation"

**Verification**: PARTIALLY INCORRECT. `grid-template-rows` is **not** a GPU-compositable property. Only `transform` and `opacity` are truly compositable. `grid-template-rows` triggers **layout recalculation** on every animation frame. The Generator's own §1 Risk section says "never animating layout properties like `width`, `height`, `margin`" — but `grid-template-rows` IS a layout property.

**Assessment**: ACCEPT WITH AMENDMENTS

**Amendments**:
- **A1.1 [WARNING]**: The `grid-template-rows: 0fr → 1fr` animation IS a layout animation. It is far better than `max-height` (no clipping, no arbitrary values), and browser engines do optimize it well (Chrome Blink composites it on the content thread with minimal reflows). But the claim of "GPU-composited" is wrong. Acknowledge this in implementation notes. The real risk: if 6+ sections expand simultaneously during a tab switch with stagger, you get 6× layout recalculations within 250ms. **Mitigation**: only animate the section being toggled by user action; on tab switch, set all sections to their final state instantly (no stagger on expand state — only stagger the fade-in opacity, which IS compositable).
- **A1.2 [NOTE]**: The `filter: blur(4px)` in the sidebar enter animation is an additional compositing cost. Fine for one-time sidebar open, but confirm it doesn't fire on every page load.
- **A1.3 [NOTE]**: The `--pf2-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` has overshoot. On `transform: scale()` this means the element briefly exceeds its final size. Fine for thumbs/buttons, but verify it doesn't cause scrollbar flicker on elements near container edges.

**Path to ACCEPT**: Fix the "GPU-composited" claim. Separate stagger opacity (compositable) from section expand (layout). Rest is sound.

---

### §2 — Onboarding & First-Run Experience

**Claim**: "The `description` field already exists in `STYLE_REGISTRY` for every parameter"

**Verification**: Not verified against actual registry file, but the `ParamSchema` type in [types.ts](../../../potfoundry-web/src/state/types.ts#L93) does define `description?: string` as an optional field. The Generator's claim depends on every param actually having this populated — it's plausible but the Executioner should verify coverage before relying on it.

**Claim**: First-run detection via `localStorage`

**Verification**: Sound pattern. No existing `localStorage` key collisions — current sidebar width uses `pf-sidebar-width` ([Sidebar.tsx](../../../potfoundry-web/src/ui/layout/Sidebar.tsx#L32)), so `pf2-first-run-complete` namespace is clean.

**Assessment**: ACCEPT

**Notes**:
- **N2.1**: The progressive disclosure confidence tracking (`UserConfidence` interface) has no persistence strategy specified. If it's session-only, users see the full UI on second visit regardless. If persisted to `localStorage`, there's no reset mechanism. **Recommendation**: Persist to `localStorage`, add a "Reset tutorial" option in Settings.
- **N2.2**: The welcome card `z-index: 150` sits between `--pf-z-panel: 100` and `--pf-z-modal: 200` ([AppUI.css](../../../potfoundry-web/src/ui/AppUI.css#L105-L106)). This is correctly sandwiched — it floats above the sidebar but below modals. Good.

---

### §3 — Delight Moments (Export Progress)

**Claim**: "The current `useParametricExport` already exposes phase information via `PipelineDiagnostics.phases`"

**Verification**: **MISLEADING**. `PipelineDiagnostics.phases` exists as a type ([types.ts](../../../potfoundry-web/src/renderers/webgpu/parametric/types.ts#L162)) and is populated — BUT only at the END of the pipeline. Looking at [useParametricExport.ts](../../../potfoundry-web/src/hooks/useParametricExport.ts#L260-L360):

1. `setProgress({ status: 'generating', progress: 10, message: '...' })` fires ONCE at the start
2. `await computerRef.current.compute(params)` — a single monolithic async call with NO intermediate progress callbacks
3. `setProgress({ status: 'complete', progress: 100, ... })` fires at the end

There is NO mechanism to get per-phase progress updates during generation. The `PipelineDiagnostics.phases` array is populated INSIDE `ParametricExportComputer.compute()` at [line 1938](../../../potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1938), which is the post-hoc diagnostics assembly. The pipeline does NOT call back to React during execution.

**Counterexample**: User clicks export. The progress bar jumps to 10%, then sits frozen for 2-15 seconds while `compute()` runs, then jumps to 100%. The Generator's beautiful "Probing Surface → Detecting Features → Building Grid → Tessellating → Optimizing → Writing STL" phase labels are **impossible to display in real-time** without adding a progress callback to the compute pipeline.

**Assessment**: ACCEPT WITH AMENDMENTS

**Amendments**:
- **A3.1 [CRITICAL]**: The multi-phase progress display requires a `onProgress` callback parameter in `ParametricExportComputer.compute()`. The compute method must yield control back to the event loop between phases (via `await new Promise(r => setTimeout(r, 0))` between major steps) for React to re-render. This is a non-trivial change to the export pipeline — the Executioner must implement it or the feature is a hallucination.
- **A3.2 [WARNING]**: Until A3.1 is implemented, the progress bar MUST show an indeterminate/pulsing animation, not a fake percentage. Showing "45%" when you have no idea of actual progress is a trust violation.
- **A3.3 [NOTE]**: The completion celebration (brightness pulse + check icon draw) is sound and requires no pipeline changes — it triggers on the existing `status: 'complete'` transition.

**Path to ACCEPT**: Either (a) implement the progress callback in the pipeline (adds ~50 lines to PEC), or (b) redesign the progress display as indeterminate with post-hoc phase timing display on completion. Option (b) is less work and arguably more honest.

---

### §4 — Keyboard & Focus Management

**Claim**: "The current keyboard shortcuts only handle global actions. There's no fine-grained keyboard navigation within the sidebar."

**Verification**: Confirmed. [useKeyboardShortcuts.ts](../../../potfoundry-web/src/hooks/useKeyboardShortcuts.ts#L230-L285) handles Ctrl+S, Ctrl+R, Ctrl+P, 1-5 (style), Space, Escape, ?, Ctrl+Z/Shift+Z — all global actions. No sidebar-internal navigation.

**Claim**: "v2 shortcuts: `1/2/3` for tab switching"

**Verification**: **CONFLICT.** The existing code at [useKeyboardShortcuts.ts](../../../potfoundry-web/src/hooks/useKeyboardShortcuts.ts#L268-L273) already uses `1-5` for STYLE SELECTION:
```ts
if (!ctrl && !shiftKey && key >= '1' && key <= '5') {
    const styleIndex = parseInt(key, 10) - 1;
    const styleName = STYLE_NAMES[styleIndex];
    if (styleName) { setStyle(styleName); }
    return;
}
```
The Generator proposes `1/2/3` for tab navigation. These bindings DIRECTLY CONFLICT with the existing `1/2/3` style shortcuts. You cannot have both.

**Assessment**: ACCEPT WITH AMENDMENTS

**Amendments**:
- **A4.1 [CRITICAL]**: The `1/2/3` tab switching MUST use a different binding. Options: (a) `Alt+1/2/3` for tabs (keeps existing style shortcuts), (b) remove the 1-5 style shortcuts in v2 since the style selector is now a prominent sidebar UI element, (c) use `Ctrl+1/2/3` (but this conflicts with browser tab switching in some browsers). **Recommendation**: `Alt+1/2/3` for tabs is safest.
- **A4.2 [WARNING]**: The `Z` for Zen mode conflicts with `Ctrl+Z` for Undo only in the sense of mental model confusion (user might press Z when they meant Ctrl+Z). The `isInputElement` guard prevents Z from firing in text fields, but verify that `Z` also doesn't fire when a canvas or slider has focus.

**Claim**: "Use Radix's `FocusTrap` (already available via `@radix-ui/react-focus-guard`)"

**Verification**: **INCORRECT.** `@radix-ui/react-focus-guard` is NOT in `package.json`. The installed Radix packages are: `react-collapsible`, `react-dialog`, `react-select`, `react-slider`, `react-tabs`, `react-tooltip` ([package.json](../../../potfoundry-web/package.json#L24-L29)). No `focus-scope` or `focus-guard` package is installed.

- **A4.3 [WARNING]**: `@radix-ui/react-focus-scope` (the correct package name for `FocusScope`) must be added as a dependency. It's ~3KB gzipped, so bundle impact is negligible. But the Generator says "already available" — it isn't. The Executioner must `npm install @radix-ui/react-focus-scope`. Note: Radix Dialog internally uses its own focus trapping, so the dialog use case works without this package.

**Claim**: "Radix Slider already provides [arrow key nudging] natively"

**Verification**: CORRECT. Radix Slider supports ArrowRight/Left/Up/Down, Home, End, and Page navigation out of the box. The existing Slider component at [Slider.tsx](../../../potfoundry-web/src/ui/shared/Slider.tsx#L128-L141) wraps `RadixSlider.Root` and passes `step`, so this behavior is already present. Shift+Arrow for 10× step is NOT built-in — that would need custom handling.

---

### §5 — Advanced Component Design

**Claim**: "SliderV2 floating value tooltip tracks the thumb during drag, updating `left` style"

**Verification**: The existing [Slider.tsx](../../../potfoundry-web/src/ui/shared/Slider.tsx) component uses Radix `Root/Track/Range/Thumb` and does NOT expose the thumb position percentage as a prop or state. To calculate `thumbPercent` for the floating tooltip, the implementation would need:
```ts
const thumbPercent = ((safeValue - min) / (max - min)) * 100;
```
This is trivial math, not a reflow concern.

**Assessment**: ACCEPT WITH AMENDMENTS

**Amendments**:
- **A5.1 [WARNING]**: The floating tooltip uses `position: absolute` + `left: ${thumbPercent}%`. During drag at 60fps, this updates `left` on every `onValueChange`. `left` on a `position: absolute` element does NOT trigger parent reflow (it only triggers compositing of that element). However, if the tooltip contains text that changes width (e.g., "9" → "10" → "100"), the tooltip's intrinsic width changes per frame. Use `min-width` to prevent this:
  ```css
  .pf2-slider__float-value {
    min-width: 3ch; /* prevent width jitter on value change */
    text-align: center;
  }
  ```
- **A5.2 [NOTE]**: The `snap-to-default` with `SNAP_THRESHOLD = step * 2` — confirmed, this is problematic for `sf_m_base` (step=0.5, snap zone = ±1.0 which is 10% of 3-13 range). The Generator's own Open Question #2 correctly identifies this. **Recommendation**: Use `0.05 * (max - min)` as the snap zone (5% of total range), capped at `step * 5`. This gives consistent feel across all parameters.

---

### §6 — Layout Refinements

**Claim**: "Sidebar default width: 380px (up from 340px)"

**Verification**: Confirmed current default is 340px at [Sidebar.tsx](../../../potfoundry-web/src/ui/layout/Sidebar.tsx#L34): `const DEFAULT_WIDTH = 340`. The sidebar is already resizable with user persistence to `localStorage`.

**Claim**: "`backdrop-filter: blur(24px)` for sidebar transparency"

**Verification**: The performance concern is real. `backdrop-filter: blur(24px)` forces the browser to:
1. Render everything behind the sidebar to an offscreen buffer
2. Apply a Gaussian blur (24px radius = ~49×49 kernel)
3. Composite the sidebar over the blurred buffer

On integrated Intel GPUs (common on laptops), this can cost 2-4ms per frame. Combined with a 60fps WebGPU render, that's a significant fraction of the 16.6ms frame budget.

**Assessment**: ACCEPT WITH AMENDMENTS

**Amendments**:
- **A6.1 [WARNING]**: `backdrop-filter: blur(24px)` is aggressive. **Reduce to `blur(12px)`** — still provides frosted glass appearance with roughly 4× less GPU work (kernel area scales quadratically: 25²=625 vs 49²=2401 samples). Add CSS fallback:
  ```css
  .pf2-sidebar {
    background: rgba(15, 15, 18, 0.96); /* solid fallback */
  }
  @supports (backdrop-filter: blur(1px)) {
    .pf2-sidebar {
      background: rgba(15, 15, 18, 0.88);
      backdrop-filter: blur(12px) saturate(1.2);
    }
  }
  ```
- **A6.2 [NOTE]**: Sidebar width 380px on a 1366×768 laptop = 27.8% viewport consumed. The current sidebar is resizable ([Sidebar.tsx](../../../potfoundry-web/src/ui/layout/Sidebar.tsx#L35): `MIN_WIDTH = 280`, max = 50% viewport), and the default is persisted. So users on small screens can resize down. The 380px default is fine — it's a sensible starting point, not a locked constraint.
- **A6.3 [NOTE]**: The Zen mode `Z` shortcut — implement `data-zen` attribute on the app root so CSS can do `[data-zen] .pf2-sidebar { display: none }` without React re-renders. Clean.

---

### §7 — Mobile Experience Elevation

**Claim**: "MobileBottomSheet.tsx has touch tracking (3 states: collapsed/half/full)"

**Verification**: CONFIRMED. [MobileBottomSheet.tsx](../../../potfoundry-web/src/ui/layout/MobileBottomSheet.tsx) defines `SheetState = 'collapsed' | 'half' | 'full'`. Touch handling is at lines 91-120, with basic position-based snapping.

**Claim**: Generator proposes 4 states (collapsed/peek/half/full) with velocity-aware snapping.

**Verification**: The existing code uses position-only snapping ([MobileBottomSheet.tsx](../../../potfoundry-web/src/ui/layout/MobileBottomSheet.tsx#L127-L137)) — no velocity calculation. Adding velocity is straightforward (track `performance.now()` at touch start/end, compute `deltaY / deltaTime`). The 4th "peek" state adds a `30vh` option — architecturally trivial but needs careful snap threshold tuning with 4 states instead of 3.

**Assessment**: ACCEPT

**Notes**:
- **N7.1**: The Vibration API (`navigator.vibrate`) is not available on iOS Safari (still blocked as of 2026). The Generator's feature check guards against this, but the haptic experience will be Android-only. Worth mentioning in implementation docs.
- **N7.2**: The landscape drawer adaptation (bottom sheet → left drawer on `max-height: 500px`) is a significant behavior change. The current MobileBottomSheet component would need to detect orientation and completely change its rendering mode. Suggest implementing this as a separate `MobileLandscapeDrawer` component rather than conditional logic inside `MobileBottomSheet`.

---

### §8 — Accessibility

**Claim**: "No ARIA live regions for dynamic content"

**Verification**: PARTIALLY INCORRECT. [Toast.tsx](../../../potfoundry-web/src/ui/shared/Toast.tsx#L135-L136) uses `role="alert" aria-live="polite"`. But the Generator is correct that the status bar, mesh stats, and export progress have no live regions.

**Assessment**: ACCEPT WITH AMENDMENTS

**Amendments**:
- **A8.1 [WARNING]**: The announcer pattern using `setMessage('')` + `requestAnimationFrame(() => setMessage(msg))` for repeated identical messages is fragile. Some screen readers debounce identical content even across re-renders. A more robust pattern:
  ```tsx
  const announce = useCallback((msg: string) => {
    setMessage(`${msg}\u00A0`.replace(/\u00A0$/, '')); // Append invisible char to force unique
  }, []);
  ```
  Or simpler: append a monotonic counter as a visually-hidden span.
- **A8.2 [WARNING]**: The debounced mesh stats announcement (500ms) — during rapid slider dragging, `onValueChange` fires per frame (60fps). The 500ms debounce means the user hears stats after they STOP dragging, which is correct. But `onValueCommit` (drag end) already exists on the Radix slider. Consider announcing only on commit, not on a timer. Cleaner and no unnecessary intermediate announcements.
- **A8.3 [NOTE]**: The WCAG AAA contrast analysis table is valuable. The corrections for `--pf2-text-secondary` (`#9a9590` → `#b0a9a3`) are numerically correct. HOWEVER: If this pushes secondary text too close to primary text visually, consider an alternative approach — keep secondary darker but increase its font-size from 12px to 13px, which qualifies for "large text" AA (4.5:1) instead of needing AAA (7:1) for normal text.

---

### §9 — Dark/Light Mode

**Claim**: "`useTheme()` hook sets `data-theme` on `documentElement`"

**Verification**: No existing `data-theme` attribute is used in the codebase. All current CSS uses `--pf-` variables set on `:root` in [AppUI.css](../../../potfoundry-web/src/ui/AppUI.css#L64-L107). Adding `data-theme` will NOT conflict with existing styles because ALL v1 variables use the `--pf-` prefix and ALL v2 variables use `--pf2-` prefix. As long as v2 CSS scopes to `[data-theme]` selectors and v1 remains on `:root`, there's no collision.

**Assessment**: ACCEPT

**Notes**:
- **N9.1**: The viewport clear color adaptation (`bgColorDark/Light`) requires the WebGPU renderer to read this value. Check that `clearColor` is actually a Zustand store field that the render loop reads. If it's hardcoded in the shader, this is a deeper change.
- **N9.2**: Light mode doubles QA surface. The Generator acknowledges this. **Recommendation**: Ship dark-only for v2.0, add light mode in v2.1 as proposed. This is correctly classified as Should-have.

---

### §10 — Sound Design

**Claim**: "Web Audio API oscillators — zero bundle cost"

**Verification**: CORRECT. Web Audio API is a browser built-in. The `AudioContext` + oscillator approach adds ~50 lines of TypeScript, zero bytes of audio assets.

**Assessment**: ACCEPT

**Notes**:
- **N10.1**: `AudioContext` creation requires a user gesture on most browsers (autoplay policy). The Generator should note that `getAudioContext()` must be called lazily on first user-triggered sound event, not at app initialization.
- **N10.2**: Opt-in (muted by default) is the correct choice for a tool used in work environments. 3D printing enthusiasts often use PotFoundry at desktops with external monitors + speakers where unexpected sound is disruptive.

---

## Answers to Open Questions

### Q1: Sidebar width 380px vs 340px — is 3% viewport too greedy?

**VERDICT: 380px is fine.** The sidebar is already resizable ([Sidebar.tsx](../../../potfoundry-web/src/ui/layout/Sidebar.tsx#L33-L36)), and the default width is persisted to `localStorage`. Users on 1366px screens who find it cramped will resize once and forget about it. The 40px extra breathing room materially improves the luxury feel for the 90% of users on 1440p+ screens. Ship it as 380px default.

### Q2: Slider snap-to-default — step-relative (±2 steps) vs percentage?

**VERDICT: Use percentage-of-range.** Step-relative creates wildly different snap zones. `sf_m_base` (step=0.5, range=3-13): ±1.0 = 10% of range. `hr_petals` (step=1, range=3-24): ±2 = 9.5% of range. `sf_amp` (step=0.01, range=0.0-1.0): ±0.02 = 2% of range. Use `0.05 * (max - min)` (5% of range) as the snap zone, capped at `step * 5` to prevent snapping across too many discrete steps. This gives consistent tactile behavior.

### Q3: WCAG AAA on `--pf2-text-secondary` — does lightening undermine hierarchy?

**VERDICT: Lighten, but not all the way to AAA.** AAA (7:1) for body text is aspirational but rarely achieved in dark UIs without washing out the hierarchy. `#9a9590` (5.3:1) passes AA for normal text. `#b0a9a3` (7.2:1) passes AAA but is perceptually very close to primary `#f5f0e8`. **Recommendation**: Target `#a8a29e` (~6.3:1) — passes AA generously, provides clear visual hierarchy, and meets AAA for large text (18px+). Document the choice and note that essential information should never rely solely on secondary text color.

### Q4: `grid-template-rows: 0fr → 1fr` — Safari 15 fallback?

**VERDICT: No fallback needed.** Safari 16.4+ supports it (released March 2023, now 3 years old). As of March 2026, Safari 15 usage is <0.5% globally. PotFoundry's target audience (3D printing enthusiasts, designers) skews toward modern browsers. The WebGPU requirement already excludes ancient browsers. Ship without fallback but add a `@supports` check in CSS comments for documentation purposes.

### Q5: Light mode viewport background — warm or cool?

**VERDICT: Warm `#e0d9d1` is correct for dark mode users, but consider `#e8e6e3` (cooler warm) for light mode.** The concern about warm-toned pots blending into a warm background is valid for terracotta colorways. However, the pot renders with full 3D lighting, shadows, and material properties — it won't flatten against the background. A slightly cooler warm (`#e8e6e3`) maintains the editorial warmth while adding just enough blue to separate from amber/brown pot tones. Test with terracotta and gold test presets.

### Q6: Export sound — opt-in or opt-out?

**VERDICT: Opt-in (muted by default).** PotFoundry's audience is not impulse mobile users — they're desk-bound designers running long export jobs. Unexpected sound from a web app violates the principle of least surprise. Stripe's opt-out approach works because checkout success is a brief, infrequent moment. PotFoundry exports can happen dozens of times per session. Muted default, toggle in Settings.

### Q7: Stagger timing — 250ms total too slow?

**VERDICT: Cap at 150ms total.** 250ms means the last of 5 sections appears a quarter-second after the first — noticeable and feels sluggish on fast tab switches. Use `--pf2-duration-stagger: calc(150ms / var(--section-count))` or hardcode `30ms` per item (5 items × 30ms = 150ms total). The stagger should feel like a ripple, not a slow reveal.

### Q8: First-run preset — which is most visually striking?

**VERDICT: FourierBloom with `fb_n1=8, fb_amp=0.22, fb_ring_n=5, fb_ring_amp=0.12`.** This creates an 8-petal flower with ring detail — immediately communicates "this is not a basic cylinder generator." SuperformulaBlossom with extreme parameters creates more dramatic shapes but can look alien/unfamiliar. FourierBloom at moderate settings says "organic, mathematical beauty" without being intimidating. Auto-rotate at 0.3 rpm (slow enough to appreciate, fast enough to demonstrate 3D).

---

## Missing Considerations

### M1: Testing Strategy for Motion System
The proposal specifies 20+ CSS animations and 7 duration tokens but NO testing approach. Motion bugs are notoriously hard to catch.
- **Need**: CSS animation regression tests using Playwright's `page.waitForTimeout()` + screenshot assertions for key states.
- **Need**: A `prefers-reduced-motion` test suite that verifies ALL animations are suppressed.
- **Need**: A motion reference page (Storybook or standalone) showing every animation for manual QA.

### M2: State Persistence Conflicts Between v1 and v2
The proposal adds `zenMode`, `soundEnabled`, `density`, `theme` to UIState. Current `UIState` in [types.ts](../../../potfoundry-web/src/state/types.ts#L250-L260) has `panelOpen`, `activeTab`, `modalOpen`, `fullscreen`. If the Zustand store is persisted (check `persist` middleware), adding new fields requires migration logic or the persisted store will have `undefined` for new fields — which could cause runtime errors if non-null-asserting code doesn't handle `undefined`.

### M3: Bundle Size Impact
The proposal makes no mention of bundle size. New components: `AnnouncerProvider`, `WelcomeCard`, `Spotlight`, `SliderV2`, `SectionV2`, `SelectV2`, `QualityCard`, `PresetCard`, `ColorStrip`, `ZenToolbar`, `useTheme`, `useFirstRun`, `useReducedMotion`, `useAnnounce`, `sounds.ts`, `haptics.ts`. Estimate ~8-12KB gzipped of new JS. CSS additions (motion system, all component styles, light mode tokens) estimate ~5-8KB gzipped. Total ~15-20KB. Not alarming for a single-page app, but worth tracking.

### M4: CSS Specificity Between v1 and v2
All v1 tokens use `--pf-` prefix. All v2 tokens use `--pf2-` prefix. **This is clean and no collision exists.** However, the proposal doesn't address the TRANSITION period — during migration, some components will use v1 CSS classes (`.pf-slider`) and some will use v2 (`.pf2-slider`). If both are mounted simultaneously (e.g., sidebar uses v1 Slider in one section and v2 SliderV2 in another), both CSS files are loaded. No specificity conflict because class names differ, but the CSS bundle temporarily doubles in size until migration is complete. **Recommendation**: Track v1 CSS removal as technical debt tickets.

### M5: Browser Compatibility Edge Cases
- `backdrop-filter` is unsupported in Firefox < 103 (released July 2022). Firefox usage among 3D printing enthusiasts may be non-trivial. The `@supports` fallback is essential — don't treat it as optional.
- `CSS.registerProperty()` (Houdini) is mentioned nowhere but some of the custom property animations would benefit from typed properties. Not critical but a future optimization.
- The Web Audio API `AudioContext` constructor throws in some privacy-focused browser configurations. Wrap in try/catch.

### M6: WebGPU Render Loop Interaction
The sidebar `backdrop-filter: blur()` means the browser must read back the WebGPU canvas content behind the sidebar to apply the blur. Some WebGPU implementations don't support this cleanly (the canvas may appear black behind the sidebar). **Test on multiple GPU vendors** (Intel, AMD, NVIDIA, Apple M-series) before committing to this design.

---

## Priority Reassessment

### Promotions (Should-have → Must-have)
None. The Generator's Must-have list is aggressive but justified.

### Demotions (Must-have → Should-have)
- **§6.2 Sidebar transparency**: Demote from Must-have to Should-have. The `backdrop-filter` blur is expensive, has browser compatibility issues (M5, M6), and may cause visual artifacts with the WebGPU canvas. The "luxury feel" can be achieved with an opaque sidebar at `rgba(15, 15, 18, 0.96)` and good motion design. Add blur as a progressive enhancement in v2.1 after WebGPU canvas readback is tested across GPU vendors.
- **§2.2 First-run welcome card**: This is a fine v2.0 polish item, but should not block ship. Demote to Should-have. The progressive disclosure (§2.3) is more impactful and is correctly classified as Should-have.

### Position Confirmed
- **§3.1 Export progress**: Correctly Must-have BUT with amendment A3.1 (needs pipeline callback) or A3.2 alternative (indeterminate progress).
- **§10 Sound**: Correctly Nice-to-have. No objections.
- **§9 Dark/Light mode**: Correctly Should-have. Avoid shipping with v2.0.

---

## Implementation Conditions (for Executioner)

If this proposal proceeds to implementation, the Executioner MUST:

1. **Add progress callback to `ParametricExportComputer.compute()`** (A3.1) before implementing the multi-phase progress bar. OR implement indeterminate progress (A3.2).
2. **Install `@radix-ui/react-focus-scope`** before implementing focus trapping (A4.3).
3. **Use `Alt+1/2/3`** for tab shortcuts, NOT bare `1/2/3` (A4.1).
4. **Reduce `backdrop-filter` blur to 12px** with solid fallback (A6.1).
5. **Cap stagger at 30ms per item** (not 50ms) with 150ms max total.
6. **Use percentage-based snap threshold** for slider snap-to-default (5% of range, capped at step×5).
7. **Test `backdrop-filter` on WebGPU canvas** on Intel/AMD/NVIDIA before shipping as default. If artifacts, ship as opt-in setting.
8. **Verify `description` field coverage** in STYLE_REGISTRY for all parameters before implementing tooltips.

---

## Validation Protocol

Before the Executioner declares §1-§10 complete:

- [ ] All animations respect `prefers-reduced-motion` — verify with Chrome DevTools Rendering → Emulate CSS media `prefers-reduced-motion: reduce`
- [ ] Sidebar width defaults to 380px, is resizable, persists to localStorage
- [ ] No keyboard shortcut conflicts (test all bindings with no input focused)
- [ ] Export progress shows either real phase data (with callback) or indeterminate animation
- [ ] SliderV2 floating tooltip doesn't cause visual glitches on dense parameter lists
- [ ] Mobile bottom sheet supports 4 states with velocity-aware snapping
- [ ] ARIA announcer fires on export complete, preset apply, style change
- [ ] Focus returns to trigger element after modal/drawer close
- [ ] `backdrop-filter` fallback renders correctly when `@supports` fails
- [ ] Light mode (when implemented) doesn't leak into v1 component styles
- [ ] Bundle size increase is <25KB gzipped total
- [ ] All 1896+ existing tests still pass

---

*End of Verifier Round 1 — UI v2 Elevation Critique*
*Verdict: ACCEPT WITH AMENDMENTS. 8 mandatory conditions listed above.*
*Next step: Generator responds to amendments, then converged plan goes to Executioner.*
