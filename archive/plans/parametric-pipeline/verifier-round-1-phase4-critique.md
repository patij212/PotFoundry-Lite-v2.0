# Verifier Round 1 — Phase 4: Features Critique

Date: 2026-03-06

---

## Overall Verdict: ACCEPT WITH AMENDMENTS

The Generator's proposal is architecturally sound across all five features. The data flow, component boundaries, import paths, and CSS token usage are verified correct against the actual codebase. However, one **CRITICAL** bug exists in Feature 4 (stale closure in `useConfidence.unlock`), several **WARNING**-level issues need resolution before the Executioner proceeds, and there are a handful of **NOTE**-level observations for polish.

No features are rejected. All five are implementable with the amendments listed below.

---

## Feature 1: Export Progress

**Verdict: ACCEPT WITH AMENDMENTS**

### Verified Claims

| Claim | Status | Evidence |
|-------|--------|----------|
| `useExport()` returns `{ exportSTL, progress, stats, reset }` | **Partial** | Actually returns `{ progress, stats, exportSTL, generateMesh, reset }` — 5 fields, not 4. See `UseExportResult` interface at [useExport.ts](src/hooks/useExport.ts#L48-L56) |
| `ExportProgress.status` has 'generating', 'complete', 'error' | ✅ | Confirmed: `'idle' \| 'generating' \| 'complete' \| 'error'` at [useExport.ts](src/hooks/useExport.ts#L27) |
| `ExportStats` has triangleCount, fileSize, volumeMl, generationTimeMs | ✅ | All fields confirmed at [useExport.ts](src/hooks/useExport.ts#L33-L42) |
| `--pf2-success` CSS custom property exists | ✅ | `#6b8f71` at [AppUIv2.css](src/ui/v2/AppUIv2.css#L44) |
| `--pf2-error` CSS custom property exists | ✅ | `#b85c5c` at [AppUIv2.css](src/ui/v2/AppUIv2.css#L46) |
| `--pf2-shadow-float` CSS custom property exists | ✅ | Confirmed at [AppUIv2.css](src/ui/v2/AppUIv2.css#L49) |
| `.pf2-status-footer__progress--indeterminate` CSS class exists | ✅ | Confirmed at [StatusFooter.css](src/ui/v2/layout/StatusFooter.css#L76-L87) |
| `@keyframes pf2-shimmer` exists in motion.css | ✅ | Confirmed at [motion.css](src/ui/v2/motion.css#L114) |
| `@keyframes pf2-tab-enter` exists in motion.css | ✅ | Confirmed at [motion.css](src/ui/v2/motion.css#L73) |
| Progress div at line 83 is `display: none` | ✅ | Confirmed at [StatusFooter.tsx](src/ui/v2/layout/StatusFooter.tsx#L89) |
| StatusFooter currently has no onClick on download button | ✅ | No `onClick` prop at [StatusFooter.tsx](src/ui/v2/layout/StatusFooter.tsx#L94-L100) |

### C1 [NOTE]: `useExport` return type is 5 fields, not 4

**Generator's claim**: "`useExport()` returns `{ exportSTL, progress, stats, reset }`"

**Actual behavior**: The hook returns `{ progress, stats, exportSTL, generateMesh, reset }`. The `generateMesh` method is also exposed. The Generator's proposed StatusFooter code destructures `{ exportSTL, progress, stats, reset }`, which is valid (ignoring `generateMesh`). No functional issue — just an inaccurate description. The Executioner can proceed with the Generator's destructuring.

### C2 [NOTE]: SVG stroke-dasharray math is correct

**Circle**: `r=8.5` → circumference = `2π × 8.5 ≈ 53.41` → Generator uses `stroke-dasharray: 54`. Correct, slight rounding up is fine for draw-on animation.

**Checkmark polyline**: `6.5,10.5 → 9,13 → 13.5,7.5`
- Segment 1: `√((9−6.5)² + (13−10.5)²) = √(6.25 + 6.25) = √12.5 ≈ 3.54`
- Segment 2: `√((13.5−9)² + (7.5−13)²) = √(20.25 + 30.25) = √50.5 ≈ 7.11`
- Total ≈ 10.65 → Generator uses `stroke-dasharray: 14` (3.35 overshoot "for linecaps")

The 31% overshoot is generous but harmless — the animation will simply finish drawing before the dashoffset reaches 0. Acceptable.

### C3 [WARNING]: `formatTime` behavior change

**Generator's claim**: The proposed StatusFooter modifies `formatTime()` to add a `>= 1000` branch returning seconds (e.g., `"1.2s"`).

**Actual behavior**: The existing `formatTime` at [StatusFooter.tsx](src/ui/v2/layout/StatusFooter.tsx#L28-L31) only handles `<1 ms` and `N ms`. The Generator's version adds `ms >= 1000` → `"Xs"`.

This is a reasonable enhancement but changes behavior for existing users. Export times regularly exceed 1s, so this improves readability. **Accept, but note it as a deliberate behavior change in the commit message.**

### C4 [NOTE]: `var(--pf2-success)` in SVG inline stroke

The proposed completion card uses `stroke="var(--pf2-success)"` directly in `<circle>` and `<polyline>` SVG attributes. CSS custom properties work in SVG presentation attributes in all modern browsers (Chrome 49+, Firefox 31+, Safari 9.1+). This is fine.

---

## Feature 2: CameraPopover

**Verdict: ACCEPT WITH AMENDMENTS**

### Verified Claims

| Claim | Status | Evidence |
|-------|--------|----------|
| `useControllerMaybe()` exists | ✅ | Exported from [context/index.ts](src/context/index.ts#L10) |
| Returns `ControllerContextValue \| null` | ✅ | Confirmed at [ControllerContext.tsx](src/context/ControllerContext.tsx#L107-L109) |
| `cameraState` has mode, projection, showGrid, showAxis | ✅ | `CameraState` interface at [ControllerContext.tsx](src/context/ControllerContext.tsx#L22-L28) — also has `autoRotate` |
| `setCameraMode(mode)` exists | ✅ | Interface at [ControllerContext.tsx](src/context/ControllerContext.tsx#L46) |
| `setProjection(mode)` exists | ✅ | Interface at [ControllerContext.tsx](src/context/ControllerContext.tsx#L50) |
| `toggleGrid()` exists | ✅ | Interface at [ControllerContext.tsx](src/context/ControllerContext.tsx#L56) |
| `toggleAxis()` exists | ✅ | Interface at [ControllerContext.tsx](src/context/ControllerContext.tsx#L58) |
| `applyViewPreset(preset)` exists | ✅ | Interface at [ControllerContext.tsx](src/context/ControllerContext.tsx#L62) |
| `@radix-ui/react-focus-scope` is installed | ✅ | `package.json` line 26: `"@radix-ui/react-focus-scope": "^1.1.8"` |
| Import path `'../../../context'` from `src/ui/v2/shared/` | ✅ | Resolves to `src/context/index.ts` which re-exports `useControllerMaybe` |
| `<FocusScope.FocusScope trapped loop>` is valid JSX | ✅ | `FocusScope` is a named export; `trapped` and `loop` are boolean props defaulting to `true` when present without value |

### C5 [WARNING]: Popover positioning requires explicit `position: relative` on parent

**Generator's claim**: "The popover renders as a sibling to the toolbar button inside the `pf2-toolbar__group--center` div, which provides relative positioning."

**Actual behavior**: Looking at [ToolbarV2.tsx](src/ui/v2/layout/ToolbarV2.tsx#L191), the center group `<div className="pf2-toolbar__group pf2-toolbar__group--center">` does NOT have `position: relative` set in CSS. The Generator's modification correctly adds `style={{ position: 'relative' }}` inline, but this is fragile.

**Required fix**: Add `position: relative` to `.pf2-toolbar__group--center` in ToolbarV2.css instead of using an inline style. If another developer removes the inline style without knowing the popover depends on it, the popover breaks silently.

### C6 [WARNING]: Narrow viewport clipping

The popover uses `left: 50%; transform: translateX(-50%)` with `min-width: 240px`. The toolbar center group is already centered via the same transform. On viewports < ~500px, the popover could extend beyond the left or right viewport edge.

The Generator acknowledges this in Q4 and suggests falling back to Radix Popover if the Verifier objects. **My ruling**: The custom approach is acceptable for v1 of this feature, but add a `max-width: calc(100vw - 32px)` and `overflow-x: auto` guard to the popover CSS. If users report clipping issues, upgrade to `@radix-ui/react-popover` in a follow-up.

### C7 [NOTE]: Import style improvement

`import * as FocusScope from '@radix-ui/react-focus-scope'` then `<FocusScope.FocusScope>` is functional but verbose. Prefer `import { FocusScope } from '@radix-ui/react-focus-scope'` for clarity. Minor — Executioner's discretion.

---

## Feature 3: LibraryDrawer

**Verdict: ACCEPT WITH AMENDMENTS**

### Verified Claims

| Claim | Status | Evidence |
|-------|--------|----------|
| `PRESETS` exported from `src/presets/index.ts` | ✅ | [presets/index.ts](src/presets/index.ts#L1) |
| `getPresetsByCategory`, `getCategories` exported | ✅ | Same file |
| `PotPreset` type exported | ✅ | Re-export at [presets/index.ts](src/presets/index.ts#L9) |
| `PresetCategory` type exported | ✅ | Re-export at [presets/index.ts](src/presets/index.ts#L10) |
| `PotPreset` has id, title, description, category, style, size, opts, appearance | ✅ | Interface at [presets/presets.ts](src/presets/presets.ts#L42-L75) |
| `DesignThumbnail` accepts `design`, `width`, `height` | ✅ | Props interface at [DesignThumbnail.tsx](src/ui/shared/DesignThumbnail.tsx#L18-L22) |
| `DesignThumbnail` uses IntersectionObserver for lazy loading | ✅ | [DesignThumbnail.tsx](src/ui/shared/DesignThumbnail.tsx#L43-L57) |
| `setGeometryParams` (plural, batch setter) available on store | ✅ | [store.ts](src/state/store.ts#L162) and [slices/geometry.ts](src/state/slices/geometry.ts#L46) |
| `setStyle`, `setStyleOpts`, `setPrimaryColor`, `setMidColor`, `setSecondaryColor` on store | ✅ | All confirmed at store.ts lines 172-218 |
| `@radix-ui/react-dialog` is installed | ✅ | `package.json` line 25: `"@radix-ui/react-dialog": "^1.1.15"` |
| `useAnnounce` importable from `'./Announcer'` (same directory) | ✅ | Exported at [Announcer.tsx](src/ui/v2/shared/Announcer.tsx#L26) |
| Import path `'../../shared/DesignThumbnail'` from `src/ui/v2/shared/` | ✅ | Resolves to `src/ui/shared/DesignThumbnail.tsx` |
| `LibraryDesign` importable from `'../../../context/LibraryContext'` | ✅ | Exported at [LibraryContext.tsx](src/context/LibraryContext.tsx#L83) |

### C8 [WARNING]: StyleId ≠ StyleName type mismatch

**Generator's claim**: Uses `setStyle(preset.style as StyleName)` in `applyPreset`.

**Actual behavior**: `PotPreset.style` is typed as `StyleId` (from `src/geometry/types.ts`, 20 members). `setStyle()` expects `StyleName` (from `src/state/types.ts`, 15 members). `StyleId` is a superset — it includes `BasketWeave`, `GeometricStar`, `HexagonalHive`, `CelticKnot`, `CelticTriquetra` which are NOT in `StyleName`.

If any preset uses one of these 5 styles that exist in `StyleId` but not `StyleName`, the `as StyleName` assertion masks a type error. At runtime the store would accept the string (it's just stored as a string), but TypeScript won't catch mismatches.

**However**: The v1 `PresetPanel.tsx` at [line ~204](src/ui/controls/PresetPanel.tsx) does the exact same cast: `setStyle(preset.style as StyleName)`. So this is a **pre-existing type debt**, not a new issue. The Generator correctly replicates the v1 pattern.

**Required fix (deferred)**: Not gating this feature on fixing the type mismatch. But file a tech debt item to unify `StyleId` and `StyleName` into one type.

### C9 [NOTE]: `presetToDesign` correctly replicates v1 logic

The Generator's `presetToDesign` function matches the v1 implementation at [PresetPanel.tsx](src/ui/controls/PresetPanel.tsx#L33-L42) exactly. All required `LibraryDesign` fields (`id`, `title`, `style`, `created_at`) are provided. Optional fields (`size`, `opts`, `appearance`) are passed through correctly.

### C10 [NOTE]: `getCategories()` return type matches usage

`getCategories()` returns `Array<{ category: PresetCategory; count: number; label: string }>`. The Generator's LibraryDrawer destructures `{ category, label }` from each entry. The `count` field is unused — acceptable.

---

## Feature 4: Progressive Disclosure

**Verdict: ACCEPT WITH AMENDMENTS**

### C11 [CRITICAL]: Stale closure bug in `unlock` callback

**Generator's claim**: The `unlock` function uses `useCallback` with `[current.triggers]` dependency, where `current` is the render-time snapshot from `useSyncExternalStore`.

**Counterexample**:
1. Initial render: `current = { level: 0, triggers: Set() }`
2. User changes style → `unlock('style-change')` fires:
   - Reads `current.triggers` = `Set()` (from render)
   - Creates `newTriggers = Set('style-change')`
   - Writes `state = { level: 1, triggers: Set('style-change') }`
   - Calls `emitChange()` → listeners fire → React schedules re-render (NOT synchronous)
3. **Before re-render**, in the same event handler or microtask, user also triggers `unlock('dimension-change')`:
   - Reads **stale** `current.triggers` = `Set()` (still from the SAME render)
   - Creates `newTriggers = Set('dimension-change')` — **`style-change` is LOST**
   - Writes `state = { level: 2, triggers: Set('dimension-change') }`

The `style-change` trigger is permanently lost from persisted state.

**Severity**: CRITICAL in theory, low probability in practice (two triggers in the same synchronous event cycle is unusual). But the fix is trivial and eliminates the entire class of bugs.

**Required fix**: Read from module-level `state` instead of the captured `current`:

```typescript
const unlock = useCallback((trigger: ConfidenceTrigger) => {
  if (state.triggers.has(trigger)) return;
  const newTriggers = new Set(state.triggers);
  newTriggers.add(trigger);

  let newLevel: 0 | 1 | 2 | 3 = 0;
  for (const t of newTriggers) {
    const tLevel = TRIGGER_LEVELS[t];
    if (tLevel > newLevel) newLevel = tLevel as 0 | 1 | 2 | 3;
  }

  state = { level: newLevel, triggers: newTriggers };
  saveState();
  emitChange();
}, []); // No dependency on current.triggers — reads module-level state directly
```

This is safe because `state` is a module-level variable, not React state. Reading it synchronously always gives the latest value. No stale closures possible.

### C12 [WARNING]: Dimension-change trigger fires on initial hydration

**Generator's claim**: "Trigger detection for `dimension-change` must not fire for initial store hydration." The Generator acknowledges this concern (Assumption #4) but the proposed code does NOT implement a guard.

**Actual behavior in ShapeTab**: The `handleChange` callback is defined as:
```tsx
const handleChange = useCallback(
  (key: keyof GeometryParams, value: number) => {
    setGeometryParam(key, value);
  },
  [setGeometryParam]
);
```
at [ShapeTab.tsx](src/ui/v2/tabs/ShapeTab.tsx#L105-L110). This only fires on user interaction (slider onChange). It does NOT fire during hydration from URL/localStorage — the store initializes directly.

**However**: Deep link hydration or design loading might call `setGeometryParams` which wouldn't trigger `unlock` unless the Generator wires it. And the `handleChange` in ShapeTab only calls `setGeometryParam` (singular), not `setGeometryParams` (plural). So the trigger fires only on slider interaction, which is correct.

**Conclusion**: The Generator's concern about hydration is a false alarm in this architecture. The trigger point (ShapeTab.handleChange) only fires on user slider interaction. **Accepted without change.** But the Executioner should NOT add unlock calls to `setGeometryParams` (the batch setter) — only to the per-slider handler.

### C13 [WARNING]: Level 0 content contradiction in prose vs code

**Generator's claim**: The narrative text says Level 0 shows "nothing — presets only" in ShapeTab, then revises to "show Size at level 0." The final code block in the `SECTION_LEVELS` constant correctly sets `'shape:size': 0`.

**Required action for Executioner**: Use the code (`'shape:size': 0`), not the original prose. Size section is always visible. This is the right call — an empty tab is worse than a slightly busy one.

### C14 [NOTE]: `useSyncExternalStore` in React 18

Confirmed available since React 18.0. The pattern is correct — module-level `state` object is replaced (not mutated) on change, which satisfies `useSyncExternalStore`'s identity-based change detection. The server snapshot (`getSnapshot` passed as third arg) is the same as the client snapshot, which is correct for a localStorage-backed store.

### C15 [NOTE]: Section stagger indices

The Generator correctly identifies that conditionally rendered sections may have non-sequential `sectionIndex` values (e.g., indices 0, 2, 3 when index 1 is hidden). The Generator recommends accepting this since the stagger delay difference (30ms) is imperceptible. **Agreed** — dynamic index computation adds complexity for negligible UX gain.

---

## Feature 5: Shift+Arrow Enhancement

**Verdict: ACCEPT WITH AMENDMENTS**

### Verified Claims

| Claim | Status | Evidence |
|-------|--------|----------|
| `shiftHeld` ref exists at [SliderV2.tsx](src/ui/v2/controls/SliderV2.tsx#L42) | ✅ | `const shiftHeld = useRef(false)` |
| `safeValue` is available in component scope | ✅ | `const safeValue = value ?? min` at [SliderV2.tsx](src/ui/v2/controls/SliderV2.tsx#L40) |
| Radix Slider Thumb receives keyboard focus (role="slider") | ✅ | Standard Radix Slider behavior |
| Radix Slider Thumb forwards DOM props including `onKeyDown` | ✅ | Radix primitives extend `React.ComponentPropsWithoutRef<Primitive>` and compose event handlers |

### C16 [WARNING]: Narrative self-correction is confusing

The Generator initially proposes adding `onKeyDown` to `RadixSlider.Root`, then self-corrects to `RadixSlider.Thumb` mid-paragraph. The final specification and code sketch correctly target the Thumb. **Executioner: use Thumb, ignore the Root discussion.**

### C17 [WARNING]: Immediate `onValueCommit` on every Shift+Arrow press

**Generator's code**: `onChange(final); onValueCommit?.(final);` — commits on every keypress.

**Current behavior**: During pointer drag, `onValueChange` fires continuously but `onValueCommit` only fires on `pointerup` (via Radix). The existing number input commits on `blur`. Arrow (non-shift) steps from Radix fire `onValueCommit` on each step.

**Analysis**: Radix Slider's built-in keyboard steps DO fire `onValueCommit` on each ArrowLeft/ArrowRight press. So the Generator's approach is consistent with Radix's existing behavior. **Accepted.** But if `onValueCommit` triggers expensive operations (like a renderer rebuild), this could cause lag during rapid Shift+Arrow presses. The Executioner should verify this doesn't cause issues in practice.

### C18 [NOTE]: `e.preventDefault()` correctly prevents Radix default

Radix primitives use `composeEventHandlers()` internally, which checks `event.defaultPrevented` before calling the internal handler. Calling `e.preventDefault()` in the user's `onKeyDown` will correctly prevent Radix from processing its own arrow step. Verified against Radix conventions.

### C19 [NOTE]: Browser default behavior for Shift+Arrow on slider

No browser has a default behavior for Shift+ArrowLeft on a `role="slider"` element. `e.preventDefault()` won't interfere with browser functionality. Safe.

---

## Open Question Responses (Q1–Q8)

### Q1: Level 0 ShapeTab Content

**Verifier ruling: Show Size at Level 0.** The Generator's revised `SECTION_LEVELS` with `'shape:size': 0` is correct. An empty ShapeTab creates confusion. Default sliders (Height, Top Diameter, Bottom Diameter) give immediate spatial feedback. The spec's "Presets + Style selector only" applies to the *recommended workflow*, not a literal UI constraint. Users who ignore presets should still have something to interact with.

### Q2: CameraPopover Positioning

**Verifier ruling: Render inside toolbar DOM (non-portaled), with the viewport guard.** The inline approach is simpler and avoids z-index complexity. Add `max-width: calc(100vw - 32px)` to the popover CSS as noted in C6. The toolbar's `position: fixed` creates its own stacking context, so `z-index: 10` on the popover is sufficient for intra-toolbar layering. On truly narrow viewports (<400px), the popover may overflow, but mobile users will likely use touch gestures instead of the popover.

### Q3: Export Hook Re-renders

**Verifier ruling: No cascading re-renders.** `useExport()` creates local `useState` inside StatusFooter. When `setProgress()` fires, only StatusFooter re-renders. The `useAppStore` selectors in StatusFooter are individual primitive selectors (`s.performance.triangleCount`, etc.) — they won't trigger re-renders unless those specific primitives change. Zustand's selector-based subscriptions guarantee this isolation. **No concern.**

### Q4: Radix Popover vs Custom

**Verifier ruling: Accept custom approach with C6 amendment (viewport guard).** The popover use case here is simple — always anchored below a fixed toolbar, always centered, no collision detection needed. Installing `@radix-ui/react-popover` for one component is unnecessary when FocusScope is already available. If viewport clipping becomes a real user complaint, upgrade in a later pass.

### Q5: Progressive Disclosure Trigger Sensitivity

**Verifier ruling: Current sensitivity is fine.** `dimension-change` firing on ANY geometry slider interaction correctly detects "user is customizing." The alternative (threshold-based "meaningful change") adds complexity without clear UX benefit. Users who accidentally bump a slider are still engaging with the interface — showing more controls is the right response. The triggers are cumulative (Set-based), so there's no cost to early unlocking.

### Q6: Auto-Close Timing on Export Complete

**Verifier ruling: 5 seconds is acceptable, but add click-to-dismiss.** 5 seconds is enough to scan triangle count and file size. However, add `onClick={() => reset()}` to the completion card so users can dismiss it immediately if they want to re-export. The auto-timer is a fallback, not the only dismissal mechanism.

### Q7: Radix Slider Thumb `onKeyDown` Forwarding

**Verifier ruling: Confirmed works.** Radix Slider Thumb extends `React.ComponentPropsWithoutRef<typeof Primitive.span>`, which accepts all standard DOM event handlers including `onKeyDown`. Radix's internal `composeEventHandlers` calls the user's handler first; if `e.preventDefault()` is called, Radix's handler is skipped. Verified against Radix's source conventions.

### Q8: DesignThumbnail Performance in LibraryDrawer

**Verifier ruling: Trust IntersectionObserver lazy loading, no stagger needed.** `DesignThumbnail` already gates WebGPU rendering on visibility via IntersectionObserver with `threshold: 0.1, rootMargin: '50px'`. When the drawer opens with a scrollable grid, only visible cards trigger renders — typically 8–12 at once, not all 20+. The ThumbnailRenderer is a singleton that serializes requests. GPU contention is unlikely with this architecture. Adding artificial stagger would slow perceived load time. **No change needed.**

---

## Summary of Required Amendments

### CRITICAL (1)

1. **C11**: Fix stale closure in `useConfidence.unlock` — read from module-level `state` instead of captured `current.triggers`. Change dependency array to `[]`.

### WARNING (6)

2. **C5**: Move `position: relative` from inline style to `.pf2-toolbar__group--center` CSS rule in ToolbarV2.css.
3. **C6**: Add `max-width: calc(100vw - 32px)` to `.pf2-camera-popover` CSS for narrow viewport guard.
4. **C8**: Acknowledge `StyleId` ≠ `StyleName` type mismatch. File tech debt item. Do NOT block implementation — it replicates v1 behavior.
5. **C12**: Ensure `unlock('dimension-change')` is called ONLY in `ShapeTab.handleChange` (the per-slider handler), NOT in `setGeometryParams` (the batch setter). The Generator's proposal is already correct on this point — just confirming.
6. **C16**: Executioner: add `onKeyDown` to `RadixSlider.Thumb`, not Root. Ignore the narrative self-correction; use the final code specification.
7. **Q6**: Add `onClick={() => reset()}` to the completion card for click-to-dismiss, keeping the 5-second auto-timer as fallback.

### NOTE (9)

8. **C1**: `useExport` returns 5 fields not 4 — destructuring the 4 used fields is fine.
9. **C2**: SVG math verified correct.
10. **C3**: `formatTime` behavior change (adding seconds format for ≥1000ms) — note in commit.
11. **C7**: FocusScope import style is verbose but functional — Executioner's discretion.
12. **C9**: `presetToDesign` correctly replicates v1 logic.
13. **C10**: `getCategories()` `count` field unused — acceptable.
14. **C13**: Use `'shape:size': 0` from the code block, not the original prose.
15. **C14/C15**: `useSyncExternalStore` pattern and stagger indices are both correct.
16. **C17**: Immediate `onValueCommit` on Shift+Arrow is consistent with Radix's built-in behavior.

---

## Implementation Plan for Executioner

### Sequence (unchanged from Generator — validated)

1. `useConfidence` hook (with C11 fix)
2. SliderV2 Shift+Arrow (Thumb, not Root)
3. StatusFooter export wiring (with Q6 click-to-dismiss)
4. CameraPopover (with C5 CSS positioning fix, C6 viewport guard)
5. ToolbarV2 modifications (camera button + library button, C5 CSS change)
6. LibraryDrawer
7. Tab progressive disclosure wiring

### Validation Protocol

After implementation, verify:
- [ ] `useConfidence`: Call `unlock('a'); unlock('b')` synchronously in same event — both triggers must persist
- [ ] Shift+Arrow: Hold Shift, press Right 3x on a slider — value should increase by `step × 30`
- [ ] Export: Click Download → see shimmer → see completion card → click card to dismiss → card disappears
- [ ] Export: Click Download → wait 5s → card auto-hides
- [ ] CameraPopover: Open on 400px viewport — verify no horizontal overflow
- [ ] LibraryDrawer: Apply a CelticKnot preset → style changes correctly (type mismatch doesn't crash)
- [ ] Progressive disclosure: localStorage clear → reload → only Size (Shape) + Style (Style) + Quality (Export) visible
- [ ] Progressive disclosure: Change a dimension slider → Thickness + Features sections appear

---

*End of Verifier Round 1 — Phase 4 Critique*
