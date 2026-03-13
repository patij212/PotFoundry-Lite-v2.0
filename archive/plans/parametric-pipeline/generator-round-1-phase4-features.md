# Generator Round 1 — Phase 4: Features

Date: 2026-03-06

---

## Problem Statement

The v2 UI skeleton is functional but inert. The download button does nothing, camera controls are minimal, the preset library is inaccessible, and all sections are visible regardless of user experience level. Phase 4 wires the live behaviors: export with progress feedback, camera popover, library drawer, progressive disclosure, and enhanced keyboard shortcuts.

## Root Cause Analysis

Five gaps remain between the v2 UI and a shippable product:

1. **StatusFooter download button** has no `onClick` — it renders `<ButtonV2>Download STL</ButtonV2>` with zero wiring ([StatusFooter.tsx](src/ui/v2/layout/StatusFooter.tsx#L93-L100)). The progress `<div>` at line 83 exists but is `style={{ display: 'none' }}`.

2. **Camera controls** are limited to reset/auto-rotate/screenshot in ToolbarV2's center group ([ToolbarV2.tsx](src/ui/v2/layout/ToolbarV2.tsx#L196-L218)). The `ControllerContextValue` exposes `setCameraMode`, `setProjection`, `toggleGrid`, `toggleAxis`, `applyViewPreset` — none are surfaced in v2 UI.

3. **Preset library** is only accessible via v1's `PresetPanel` component ([PresetPanel.tsx](src/ui/controls/PresetPanel.tsx)). No v2 entry point exists. The toolbar has save/load buttons but no library button.

4. **All sections are always visible** — `ShapeTab` renders Size, Thickness, Features, Bell & Twist unconditionally ([ShapeTab.tsx](src/ui/v2/tabs/ShapeTab.tsx#L112-L148)). No learning-curve progressive disclosure.

5. **SliderV2 lacks Shift+Arrow** — the `shiftHeld` ref exists ([SliderV2.tsx](src/ui/v2/controls/SliderV2.tsx#L42-L52)) but only for snap override during pointer drag, not for keyboard nudge.

---

## Feature 1: Export Progress + Download Wiring

### Design Decision: State Architecture

The `useExport()` hook in `src/hooks/useExport.ts` already returns `{ exportSTL, progress, stats, reset }` with exactly the types we need: `ExportProgress` (status/progress/message) and `ExportStats` (triangleCount, vertexCount, fileSize, fileSizeBytes, volumeMm3, volumeMl, surfaceAreaMm2, generationTimeMs).

**Key insight**: StatusFooter is a leaf component rendered inside SidebarV2. It currently imports only `useAppStore`. For export, it needs `useExport()` from `../../../hooks/useExport`, plus `useAnnounce()` from `../shared/Announcer`.

### Proposal 1.1: Three-Phase Export UI (Conservative)

**Idea**: Wire the existing StatusFooter to transition through three visual phases on the existing progress `<div>`.

**Mechanism**:
1. **Idle** — Button shows "Download STL" (current state)
2. **Generating** — Button disabled. Progress div shows (remove `display:none`). Gold shimmer bar via the existing `.pf2-status-footer__progress--indeterminate` CSS class. `aria-busy="true"` on footer. `aria-valuenow` stays undefined for indeterminate.
3. **Complete** — Progress bar fills to 100%. Below it, a completion card fades in with check icon, triangle count, file size, generation time. After 5 seconds, auto-reset to idle. Announcement: "Export complete — N triangles, X size"
4. **Error** — Red-tinted message replaces progress bar. Auto-reset after 4 seconds.

**Why indeterminate (no fake %)**: The `useExport` hook sets progress to 10%, 30%, 70%, 90%, 100% — but these are arbitrary internal milestones, not real progress. Showing them would feel fake. The gold shimmer communicates "working" honestly. The only determinate moment is completion (100%).

**Files affected**:
- `src/ui/v2/layout/StatusFooter.tsx` — MODIFY (add useExport, click handler, phase transitions)
- `src/ui/v2/layout/StatusFooter.css` — MODIFY (add completion card, shimmer activation, error state)

**CSS approach**: The completion card uses `@keyframes pf2-tab-enter` (already exists in motion.css) for spring-scale entrance. The check icon uses an SVG `<circle>` + `<polyline>` with `stroke-dasharray`/`stroke-dashoffset` animation for draw-on effect.

**Assumptions** (for Verifier to attack):
1. `useExport()` can be called inside StatusFooter without issues — it's a hook that accesses Zustand and creates local state. No context dependency beyond `useAppStore`.
2. The shimmer CSS class `.pf2-status-footer__progress--indeterminate` already exists in StatusFooter.css (confirmed at line 83-90 of StatusFooter.css).
3. Auto-reset after 5 seconds via `setTimeout` in a `useEffect` watching `progress.status === 'complete'` won't cause issues — we clear the timeout on unmount.
4. The `@keyframes pf2-shimmer` is defined in `motion.css` (confirmed) and is globally available.

### Proposal 1.2: Completion Card Content

The completion card appears below the progress bar with a staggered entrance:
```
┌─────────────────────────────┐
│  ✓  Export Complete          │
│  ──────────────────────────  │
│  ▲ 42,384 triangles          │
│  📦 4.2 MB · 0.23s           │
│  🧊 125 ml volume            │
└─────────────────────────────┘
```

**Design decision**: Show triangle count, file size + generation time on one line, volume in ml. Surface area is omitted from the card (too technical for most users) but included in the announce message. 

**Mathematical basis**: The card occupies ~80px height. Combined with the 3px progress bar and 8px gap, total added height during completion is ~91px. The sidebar scroll area handles this without layout shift because StatusFooter uses `flex-shrink: 0` — the tab content above will shrink if needed.

**Assumption**: The completion card won't overflow the sidebar at minimum width (320px). At 320px minus padding (32px), content area is 288px — plenty for the stats layout.

---

## Feature 2: CameraPopover

### Design Decision: Implementation Strategy

**Analysis of the three options**:

(a) **Install `@radix-ui/react-popover`** — Adds a new dependency. Popover is purpose-built for this exact pattern (anchored flyout, focus trap, dismiss on escape/outside click). Zero fighting the DOM.

(b) **Use `@radix-ui/react-dialog` as popover** — Dialog is a centered modal. To make it position-anchored to a toolbar button, we'd need to override `position: fixed` with `position: absolute`, disable the overlay, and manually calculate position. Heavy abuse of the component's intent.

(c) **Build custom with `@radix-ui/react-focus-scope`** — FocusScope gives focus trapping. We manually handle: positioning relative to trigger, Escape key, outside click, ARIA attributes. Medium effort, no new dep.

### Proposal 2.1: Custom Popover with FocusScope (Recommended — Moderate)

**Justification**: Installing `@radix-ui/react-popover` adds ~8KB gzipped and a new dependency for one component. A custom implementation using `FocusScope` (already installed) is ~60 lines of behavior logic and gives us precise control over styling and animation. The popover pattern here is simple — always anchored below a fixed toolbar button — no complex anchoring logic needed.

**Mechanism**:
1. CameraPopover is a controlled component: `open: boolean`, `onOpenChange: (open: boolean) => void`
2. Trigger button renders in ToolbarV2's center group (before the reset camera button)
3. When open, a `<div className="pf2-camera-popover">` renders below the toolbar, absolutely positioned relative to the trigger
4. Interior wrapped in `<FocusScope trapped loop>` for keyboard navigation
5. `useEffect` with `mousedown` listener on document for outside-click dismissal
6. `useEffect` with `keydown` listener for Escape dismissal
7. ARIA: trigger has `aria-expanded`, `aria-haspopup="dialog"`, `aria-controls`. Panel has `role="dialog"`, `aria-label="Camera settings"`.

**Layout inside the popover**:
```
┌──────────────────────────────────┐
│ Camera Mode    [Turntable] [Arcball]  │
│ Projection     [Persp]  [Ortho]       │
│ ──────────────────────────────── │
│ ☐ Grid    ☐ Axis                 │
│ ──────────────────────────────── │
│ View Presets                     │
│ [Front] [Back] [Left] [Right]    │
│ [Top]   [Bottom] [Iso]          │
└──────────────────────────────────┘
```

**Active state styling**: The currently active mode/projection gets a gold accent border (`border-color: var(--pf2-accent)`) and slightly brighter text.

**Files to create**:
- `src/ui/v2/shared/CameraPopover.tsx` — NEW
- `src/ui/v2/shared/CameraPopover.css` — NEW

**Files to modify**:
- `src/ui/v2/layout/ToolbarV2.tsx` — Add `Settings2` (or `SlidersHorizontal`) icon button to center group, import + render CameraPopover

**Assumptions** (for Verifier to attack):
1. The popover can be absolutely positioned below the toolbar because the toolbar is `position: fixed`. The popover renders as a sibling to the toolbar button inside the `pf2-toolbar__group--center` div, which provides relative positioning.
2. FocusScope from `@radix-ui/react-focus-scope` correctly traps Tab/Shift+Tab. Based on API: `<FocusScope trapped loop>` does exactly this.
3. The outside-click handler won't conflict with the trigger button click — standard pattern: check if `event.target` is inside the popover or the trigger using refs.
4. The `cameraState` object from `useControllerMaybe()` provides reactive state updates — confirmed: the ControllerProvider maintains `useState<CameraState>` and exposes it via context.
5. `applyViewPreset()` is available on the controller — confirmed in ControllerContext.tsx interface at line ~62.

### Proposal 2.2: Install Radix Popover (Alternative — Conservative)

**Idea**: `npm install @radix-ui/react-popover`, use `<Popover.Root>`, `<Popover.Trigger>`, `<Popover.Content>`. 

**Trade-off**: Smaller code footprint (~30 lines less), automatic positioning/collision-avoidance, but adds a dependency we use once. The Radix Popover is well-maintained and tree-shakeable.

**Recommendation**: If the Verifier objects to the custom approach's outside-click or positioning edge cases, fall back to this.

---

## Feature 3: LibraryDrawer

### Design Decision: Dialog vs Custom Drawer

`@radix-ui/react-dialog` (installed) provides: overlay, focus trap, Escape handling, portal rendering, ARIA. This is the right primitive for a full-screen drawer/modal.

### Proposal 3.1: Full-Screen Dialog Drawer (Conservative)

**Idea**: Render a `<Dialog.Root>` controlled component that opens a nearly-full-screen panel styled as a drawer, with the v1 PresetPanel's functionality ported to v2 tokens.

**Mechanism**:
1. **Trigger**: A `BookOpen` icon button added to ToolbarV2's right group (between Save/Load and the divider)
2. **Dialog content**: Full-screen overlay with subtle backdrop blur. Content panel is 90vw × 90vh, centered, with the dark surface background.
3. **Interior layout**:
   - Top bar: "Preset Library" title + close button
   - Search bar (text input with Search icon)
   - Category filter chips (All, Classic, Modern, Organic, Geometric, Experimental) — from `getCategories()`
   - Preset grid: responsive cards using CSS grid `repeat(auto-fill, minmax(180px, 1fr))`
   - Each card: `DesignThumbnail` (reused from `src/ui/shared/DesignThumbnail.tsx`) + title + category badge
4. **Preset application**: Mirrors `PresetPanel.applyPreset()` logic — sets geometry params, style, style opts, appearance colors via Zustand actions
5. **On apply**: Close drawer, announce "Applied preset: {name}"
6. **Focus management**: Dialog handles focus trap natively. Focus returns to trigger on close (Radix default behavior).

**Data flow**:
```
BookOpen click → Dialog opens → User searches/filters → User clicks preset card
→ applyPreset(preset) [same logic as PresetPanel.tsx:L184-L223] 
→ Dialog closes → announce("Applied preset: {name}")
→ useConfidence().unlock('preset-load') [Feature 4 integration]
```

**The `presetToDesign` helper**: This converts `PotPreset` to `LibraryDesign` for the `DesignThumbnail` component. It's defined inline in `PresetPanel.tsx:L33-L42`. We'll replicate it in LibraryDrawer since importing from a v1 component would create an unwanted coupling.

**Files to create**:
- `src/ui/v2/shared/LibraryDrawer.tsx` — NEW
- `src/ui/v2/shared/LibraryDrawer.css` — NEW

**Files to modify**:
- `src/ui/v2/layout/ToolbarV2.tsx` — Add `BookOpen` icon button to right group

**CSS design**:
- Overlay: `background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px)`
- Content: `background: var(--pf2-bg-base); border: 1px solid var(--pf2-border); border-radius: var(--pf2-radius-md)`
- Entry animation: `animation: pf2-drawer-enter var(--pf2-duration-fast) var(--pf2-ease-spring)` — scale(0.95) + opacity(0) → scale(1) + opacity(1)
- Card hover: `border-color: var(--pf2-accent-subtle); transform: translateY(-2px)`
- Active card (currently applied preset): gold border

**Assumptions** (for Verifier to attack):
1. `DesignThumbnail` can be imported from `../../shared/DesignThumbnail` — it's in `src/ui/shared/`, and from `src/ui/v2/shared/`, the relative path is `../../shared/DesignThumbnail`. This works.
2. `DesignThumbnail` uses `ThumbnailRenderer` which requires WebGPU — if WebGPU is unavailable, thumbnails show "Preview unavailable" via the existing error state. This is acceptable.
3. `getCategories()` and `getPresetsByCategory()` from `../../../presets` work — confirmed exported from `src/presets/index.ts`.
4. The Zustand actions (`setGeometryParams`, `setStyle`, `setStyleOpts`, `setPrimaryColor`, `setMidColor`, `setSecondaryColor`) are all available on `useAppStore` — they are (checked state exports).
5. The `presetToDesign` conversion is straightforward — PotPreset fields map directly to LibraryDesign fields. Confirmed in PresetPanel.tsx.
6. Opening 20+ `DesignThumbnail` instances simultaneously might strain GPU memory — mitigated by `IntersectionObserver` lazy loading already built into `DesignThumbnail`.

---

## Feature 4: Progressive Disclosure

### Design Decision: Section Visibility Strategy

Two approaches to hiding sections:

**(A) Conditional rendering**: Don't render `<SectionV2>` at all when confidence too low. Simplest, but causes layout shifting when sections appear.

**(B) Controlled open state**: Render all sections but set `open={false}` and `disabled` on locked ones, with a visual "locked" indicator. Avoids layout shift but is more complex.

### Proposal 4.1: Conditional Rendering with Animated Entrance (Recommended)

**Idea**: Sections below the user's confidence level are not rendered. When a trigger event bumps the level, new sections appear with the existing `pf2-tab-enter` animation.

**Mechanism**:

The `useConfidence` hook:
```typescript
// src/ui/v2/onboarding/useConfidence.ts

type ConfidenceTrigger =
  | 'preset-load'     // Applied a preset → level 1
  | 'style-change'    // Changed style → level 1
  | 'dimension-change'// Changed any geometry param → level 2
  | 'first-export'    // Completed an export → level 3
  | 'deep-link'       // Loaded from URL → all
  | 'library-load'    // Applied from library → all
  | 'auto-unlock';    // Explicit auto-unlock (e.g., developer)

interface UseConfidenceReturn {
  level: 0 | 1 | 2 | 3;
  unlock: (trigger: ConfidenceTrigger) => void;
  resetAll: () => void;
  isVisible: (sectionId: string) => boolean;
}
```

**Visibility mapping**:
```
Level 0 (first visit):
  ShapeTab:  [nothing — presets only, but presets are in LibraryDrawer now]  
  StyleTab:  Style selection only (Style SectionV2)
  ExportTab: Quality presets only (Quality SectionV2)

Level 1 (first preset/style change):
  ShapeTab:  + Size section
  StyleTab:  + Style parameters (they're inside Style section already)
  ExportTab: (no change)

Level 2 (first dimension change):
  ShapeTab:  + Thickness, Features sections
  StyleTab:  + Colors, Display sections
  ExportTab: + Format section

Level 3 (first export):
  ShapeTab:  + Bell & Twist section
  StyleTab:  + Lighting, Background sections
  ExportTab: + Advanced section
```

**Section ID → Level mapping** (hardcoded in hook):
```typescript
const SECTION_LEVELS: Record<string, number> = {
  // ShapeTab
  'shape:size': 1,
  'shape:thickness': 2,
  'shape:features': 2,
  'shape:bell-twist': 3,
  // StyleTab
  'style:style': 0,      // Always visible
  'style:colors': 2,
  'style:display': 2,
  'style:lighting': 3,
  'style:background': 3,
  // ExportTab
  'export:quality': 0,   // Always visible
  'export:format': 2,
  'export:advanced': 3,
};
```

**Persistence**: `localStorage.setItem('pf2-user-confidence', JSON.stringify({ level, triggers }))`. The `triggers` set records which triggers have been seen, so re-deriving the level from triggers is possible.

**Auto-unlock events**: When `unlock('deep-link')` or `unlock('library-load')` is called, level snaps to 3 immediately. These are the "power user detected" signals.

**Integration with tabs**:
```tsx
// In ShapeTab.tsx:
const { isVisible } = useConfidence();

return (
  <div className="pf2-shape-tab">
    {isVisible('shape:size') && (
      <SectionV2 title="Size" ...> ... </SectionV2>
    )}
    {isVisible('shape:thickness') && (
      <SectionV2 title="Thickness" ...> ... </SectionV2>
    )}
    ...
  </div>
);
```

**Files to create**:
- `src/ui/v2/onboarding/useConfidence.ts` — NEW

**Files to modify**:
- `src/ui/v2/tabs/ShapeTab.tsx` — Wrap sections in `isVisible()` calls
- `src/ui/v2/tabs/StyleTab.tsx` — Wrap sections in `isVisible()` calls
- `src/ui/v2/tabs/ExportTab.tsx` — Wrap sections in `isVisible()` calls

**Trigger wiring** (where the `unlock()` calls happen):
- `StyleTab.handleStyleChange` → `unlock('style-change')`
- `ShapeTab.handleChange` for size params → `unlock('dimension-change')`
- `StatusFooter` on export complete → `unlock('first-export')`
- `LibraryDrawer.applyPreset` → `unlock('preset-load')`
- Deep link handler (existing code, location TBD) → `unlock('deep-link')`

**Assumptions** (for Verifier to attack):
1. Conditional rendering (`{isVisible('x') && <SectionV2>...}`) won't cause Radix Collapsible to throw — Collapsible doesn't maintain external refs, so mount/unmount is safe.
2. `localStorage` key `pf2-user-confidence` won't collide with anything — unique prefix.
3. Level 0 shows virtually nothing in ShapeTab — the idea is that first-time users should click a preset first. **But wait**: the presets are in the LibraryDrawer, which requires clicking the toolbar. This might be confusing for level-0 users. **Counter**: We could show a "Start with a preset" call-to-action card in the ShapeTab at level 0 that opens the LibraryDrawer. Or show Size section at level 0.
4. Trigger detection for `dimension-change` must not fire for initial store hydration — only for user-initiated changes. This can be done by checking if the value actually differs from default geometry.
5. The `sectionIndex` prop on `SectionV2` controls stagger animation delay. When sections are conditionally rendered, the visible sections should renumber their indices. This is a minor visual concern but worth addressing.

### Proposal 4.2: Level 0 "Welcome" Card

**Idea**: At confidence level 0, ShapeTab shows a welcome card instead of empty space:

```
┌─────────────────────────────────┐
│  🎨 Welcome to PotFoundry       │
│                                  │
│  Start by choosing a preset      │
│  from the library, or pick a     │
│  style in the Style tab.         │
│                                  │
│  [Open Library]                  │
└─────────────────────────────────┘
```

The "Open Library" button triggers the LibraryDrawer. This solves the empty-ShapeTab problem at level 0.

**Alternative**: Show Size section at level 0 too, so there's always *something* to interact with. This is simpler. **I recommend this alternative** — progressive disclosure should reveal complexity, not hide all functionality.

**Revised Level 0**:
```
Level 0 (first visit):
  ShapeTab:  Size section (H, top_od, bottom_od)
  StyleTab:  Style selection + basic params
  ExportTab: Quality presets
```

This matches the spec's "Presets + Style selector only" but adds Size for spatial intuition.

---

## Feature 5: Keyboard Shortcuts Enhancement

### Proposal 5.1: Shift+Arrow on SliderV2 (Conservative)

**Idea**: When a SliderV2 has keyboard focus and Shift is held, ArrowLeft/ArrowRight should nudge by `step × 10` instead of `step × 1`.

**Mechanism**: Radix Slider already handles ArrowLeft/ArrowRight for single-step nudge. We need to intercept the `keydown` event on the Slider root and, when Shift is held:
1. Prevent the default Radix behavior
2. Calculate `newValue = clamp(currentValue ± step * 10, min, max)`
3. Call `onChange(newValue)` directly

**The challenge**: Radix Slider uses its own keydown handler internally. We can't easily override it from outside without either:
- (a) Adding an `onKeyDown` prop to `RadixSlider.Root` (Radix supports this — it forwards DOM props)
- (b) Wrapping the root in a div with `onKeyDownCapture` to intercept before Radix

**Recommended approach**: Use `onKeyDown` directly on `RadixSlider.Root`. Radix forwards unknown DOM props. When Shift+Arrow is detected, call `e.preventDefault()` and manually update the value.

**Files to modify**:
- `src/ui/v2/controls/SliderV2.tsx` — Add `onKeyDown` handler to `RadixSlider.Root`

**Code sketch**:
```typescript
const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
  if (!e.shiftKey) return;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && 
      e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  
  e.preventDefault();
  const bigStep = step * 10;
  const direction = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 1 : -1;
  const newValue = Math.max(min, Math.min(max, safeValue + bigStep * direction));
  onChange(newValue);
  onValueCommit?.(newValue);
}, [step, min, max, safeValue, onChange, onValueCommit]);
```

**Assumptions** (for Verifier to attack):
1. `RadixSlider.Root` forwards `onKeyDown` — it's a Radix convention. The Root renders a `<span>` (or div) and spreads extra props. Even if it doesn't forward directly, the Thumb (which receives keyboard focus) does. Actually, the keydown for value changes fires on the **Thumb**, not the Root. So the handler should go on `RadixSlider.Thumb`.
2. **Correction**: The keyboard interaction for Radix Slider happens on the Thumb element (it has `role="slider"` and receives focus). We need to add `onKeyDown` to `<RadixSlider.Thumb>`. Radix Thumb forwards DOM props.
3. `e.preventDefault()` with Shift+Arrow won't be intercepted by the browser (no default browser behavior for Shift+ArrowLeft on a slider).
4. Committing immediately on Shift+Arrow (calling `onValueCommit`) is correct — this matches the behavior of clicking directly on the track.

---

## Recommended Implementation Order

```
1. useConfidence hook           (standalone, no UI deps)
2. SliderV2 Shift+Arrow         (standalone, tiny change)
3. StatusFooter export wiring   (needs useExport, self-contained)
4. CameraPopover                (needs controller, standalone component)
5. ToolbarV2 modifications      (add CameraPopover trigger + Library trigger)
6. LibraryDrawer                (needs presets, DesignThumbnail, larger)
7. Tab progressive disclosure   (needs useConfidence + trigger wiring in tabs)
```

**Rationale**: 
- Steps 1-2 are zero-dependency foundation work.
- Step 3 is self-contained in StatusFooter.
- Step 4 is a new component with no dependencies on other Phase 4 work.
- Step 5 modifies ToolbarV2 — doing this once (adding both camera + library buttons) avoids merge conflicts.
- Step 6 depends on Step 5 (trigger button in toolbar).
- Step 7 is last because it touches all three tab files and wires trigger calls that depend on Features 1 and 3 being complete.

---

## Open Questions (for Verifier)

### Q1: Level 0 ShapeTab Content
Should level 0 show the Size section or just a welcome CTA? The spec says "Presets + Style selector only" which implies *nothing* in ShapeTab. But that creates a confusing empty tab. **My recommendation**: show Size at level 0. Verifier, attack this if the spec must be followed literally.

### Q2: CameraPopover Positioning
The toolbar is `position: fixed; top: 16px; left: 50%; transform: translateX(-50%)`. If we render the popover inside the toolbar DOM, it will be positioned relative to the toolbar. If we portal it, we need to manually compute position. **My recommendation**: render inside the toolbar DOM tree (not portaled), using `position: absolute; top: 100%; left: 50%; transform: translateX(-50%)`. This keeps it simple and avoids z-index wars. Verifier: will this clip against the viewport edges on narrow screens?

### Q3: Export Hook Re-renders
`useExport()` creates local state (`useState` for progress/stats) inside StatusFooter. Every state update during export will re-render StatusFooter. Since StatusFooter also reads `useAppStore` selectors, will this cause cascading re-renders up the Sidebar? **Analysis**: No — React only re-renders the component that called `useState`, and StatusFooter's `useAppStore` selectors are stable (they use individual selectors, not the full state). But the Verifier should sanity-check this.

### Q4: `@radix-ui/react-popover` vs Custom
I chose custom (Proposal 2.1) to avoid a new dependency. The Verifier should challenge whether the edge cases (outside-click interaction with portals, collision detection for small viewports) justify installing the Radix package instead.

### Q5: Progressive Disclosure Trigger Sensitivity
The `dimension-change` trigger fires when any geometry param changes. Should it also distinguish between "moved the Size slider slightly" vs "meaningfully changed the pot shape"? I think not — any slider interaction shows intent to customize. But the Verifier should consider whether this makes level 2 too easy to reach.

### Q6: Auto-Close Timing on Export Complete
I proposed 5 seconds before auto-resetting the completion card. Is this enough time for users to read the stats? Too long and it blocks the next export. The Verifier should propose an alternative (e.g., click-to-dismiss instead of auto-timer, or a "Dismiss" button).

### Q7: Radix Slider Thumb `onKeyDown` Forwarding
Critical for Feature 5. I believe Radix Thumb forwards `onKeyDown`, but if it doesn't, we'll need to use a ref + `addEventListener` or wrap the Thumb in a span. The Verifier should verify this against the Radix Slider source.

### Q8: DesignThumbnail Performance in LibraryDrawer
The preset library has ~20 presets. Each DesignThumbnail uses a WebGPU offscreen render pass via ThumbnailRenderer singleton. The `IntersectionObserver` inside DesignThumbnail provides lazy loading, but opening the drawer reveals many cards at once. Should we add a stagger delay (e.g., render thumbnails 100ms apart) to avoid GPU contention? Or trust the existing lazy-load mechanism?

---

## Summary of Files

### New Files
| File | Purpose |
|------|---------|
| `src/ui/v2/shared/CameraPopover.tsx` | Camera settings popover |
| `src/ui/v2/shared/CameraPopover.css` | Camera popover styles |
| `src/ui/v2/shared/LibraryDrawer.tsx` | Preset library drawer |
| `src/ui/v2/shared/LibraryDrawer.css` | Library drawer styles |
| `src/ui/v2/onboarding/useConfidence.ts` | Progressive disclosure hook |

### Modified Files
| File | Change |
|------|--------|
| `src/ui/v2/layout/StatusFooter.tsx` | Wire useExport, progress UI, completion card |
| `src/ui/v2/layout/StatusFooter.css` | Progress states, completion card, shimmer activation |
| `src/ui/v2/layout/ToolbarV2.tsx` | Add CameraPopover button + LibraryDrawer button |
| `src/ui/v2/controls/SliderV2.tsx` | Add Shift+Arrow keydown on Thumb |
| `src/ui/v2/tabs/ShapeTab.tsx` | Wrap sections in useConfidence isVisible() |
| `src/ui/v2/tabs/StyleTab.tsx` | Wrap sections in useConfidence isVisible() |
| `src/ui/v2/tabs/ExportTab.tsx` | Wrap sections in useConfidence isVisible() |

**Total**: 5 new files, 7 modified files.

---

## Implementation Details (Per-File Specifications)

### File: `src/ui/v2/onboarding/useConfidence.ts`

```typescript
/**
 * useConfidence — Progressive disclosure hook.
 *
 * Tracks user confidence level (0–3) based on interaction triggers.
 * Sections in ShapeTab, StyleTab, ExportTab use isVisible() to gate
 * their rendering based on the current level.
 *
 * Persisted to localStorage key 'pf2-user-confidence'.
 *
 * @module ui/v2/onboarding/useConfidence
 */

import { useCallback, useSyncExternalStore } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ConfidenceTrigger =
  | 'preset-load'
  | 'style-change'
  | 'dimension-change'
  | 'first-export'
  | 'deep-link'
  | 'library-load'
  | 'auto-unlock';

export interface UseConfidenceReturn {
  level: 0 | 1 | 2 | 3;
  unlock: (trigger: ConfidenceTrigger) => void;
  resetAll: () => void;
  isVisible: (sectionId: string) => boolean;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'pf2-user-confidence';

/** Maps triggers to the confidence level they grant */
const TRIGGER_LEVELS: Record<ConfidenceTrigger, 0 | 1 | 2 | 3> = {
  'preset-load': 1,
  'style-change': 1,
  'dimension-change': 2,
  'first-export': 3,
  'deep-link': 3,
  'library-load': 3,
  'auto-unlock': 3,
};

/** Maps section IDs to the minimum confidence level required */
const SECTION_LEVELS: Record<string, number> = {
  // ShapeTab
  'shape:size': 0,
  'shape:thickness': 2,
  'shape:features': 2,
  'shape:bell-twist': 3,
  // StyleTab
  'style:style': 0,
  'style:colors': 2,
  'style:display': 2,
  'style:lighting': 3,
  'style:background': 3,
  // ExportTab
  'export:quality': 0,
  'export:format': 2,
  'export:advanced': 3,
};

// ============================================================================
// External store (shared across all hook instances)
// ============================================================================

type ConfidenceState = {
  level: 0 | 1 | 2 | 3;
  triggers: Set<ConfidenceTrigger>;
};

let listeners: Array<() => void> = [];
let state: ConfidenceState = loadState();

function loadState(): ConfidenceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { level: 0, triggers: new Set() };
    const parsed = JSON.parse(raw) as { level?: number; triggers?: string[] };
    const triggers = new Set<ConfidenceTrigger>(
      (parsed.triggers ?? []) as ConfidenceTrigger[]
    );
    const level = Math.max(
      0,
      Math.min(3, parsed.level ?? 0)
    ) as 0 | 1 | 2 | 3;
    return { level, triggers };
  } catch {
    return { level: 0, triggers: new Set() };
  }
}

function saveState(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        level: state.level,
        triggers: Array.from(state.triggers),
      })
    );
  } catch {
    // localStorage quota exceeded or blocked — silently fail
  }
}

function emitChange(): void {
  for (const fn of listeners) fn();
}

function getSnapshot(): ConfidenceState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useConfidence(): UseConfidenceReturn {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const unlock = useCallback((trigger: ConfidenceTrigger) => {
    if (current.triggers.has(trigger)) return; // Already seen
    const newTriggers = new Set(current.triggers);
    newTriggers.add(trigger);

    // Derive level from all seen triggers
    let newLevel: 0 | 1 | 2 | 3 = 0;
    for (const t of newTriggers) {
      const tLevel = TRIGGER_LEVELS[t];
      if (tLevel > newLevel) newLevel = tLevel as 0 | 1 | 2 | 3;
    }

    state = { level: newLevel, triggers: newTriggers };
    saveState();
    emitChange();
  }, [current.triggers]);

  const resetAll = useCallback(() => {
    state = { level: 0, triggers: new Set() };
    saveState();
    emitChange();
  }, []);

  const isVisible = useCallback(
    (sectionId: string): boolean => {
      const required = SECTION_LEVELS[sectionId];
      if (required === undefined) return true; // Unknown section → always show
      return current.level >= required;
    },
    [current.level]
  );

  return {
    level: current.level,
    unlock,
    resetAll,
    isVisible,
  };
}
```

**Design decisions**:
- Uses `useSyncExternalStore` instead of `useState` so all component instances share the same state without a Context provider. This avoids adding a provider to the tree.
- The `getSnapshot` identity stability: `state` is replaced (not mutated) on every change, so `useSyncExternalStore` correctly detects changes.
- `triggers` stored as a Set internally, serialized as array for localStorage.
- Level is derived from the max trigger level seen, not accumulated. This means if you do an export (level 3) without ever changing style (level 1), you still get level 3.

---

### File: `src/ui/v2/shared/CameraPopover.tsx`

```tsx
/**
 * CameraPopover — Camera settings flyout.
 *
 * Anchored below the toolbar, provides camera mode, projection,
 * grid/axis toggles, and view preset buttons.
 *
 * @module ui/v2/shared/CameraPopover
 */

import React, { useCallback, useEffect, useRef } from 'react';
import * as FocusScope from '@radix-ui/react-focus-scope';
import { useControllerMaybe } from '../../../context';
import clsx from 'clsx';
import './CameraPopover.css';

// ============================================================================
// Types
// ============================================================================

interface CameraPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

// ============================================================================
// Constants
// ============================================================================

const VIEW_PRESETS = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'iso', label: 'Iso' },
] as const;

// ============================================================================
// Component
// ============================================================================

export const CameraPopover: React.FC<CameraPopoverProps> = ({
  open,
  onOpenChange,
  triggerRef,
}) => {
  const controller = useControllerMaybe();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange, triggerRef]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        onOpenChange(false);
      }
    };
    // Use setTimeout to avoid immediately closing from the opening click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [open, onOpenChange, triggerRef]);

  const cameraState = controller?.cameraState;
  const isReady = controller?.isReady ?? false;

  const handleCameraMode = useCallback(
    (mode: 'turntable' | 'arcball') => {
      controller?.setCameraMode(mode);
    },
    [controller]
  );

  const handleProjection = useCallback(
    (mode: 'perspective' | 'ortho') => {
      controller?.setProjection(mode);
    },
    [controller]
  );

  const handleViewPreset = useCallback(
    (preset: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso') => {
      controller?.applyViewPreset(preset);
    },
    [controller]
  );

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="pf2-camera-popover"
      role="dialog"
      aria-label="Camera settings"
    >
      <FocusScope.FocusScope trapped loop>
        <div className="pf2-camera-popover__content">
          {/* Camera Mode */}
          <div className="pf2-camera-popover__row">
            <span className="pf2-camera-popover__label pf2-text-label">Mode</span>
            <div className="pf2-camera-popover__toggle-group">
              <button
                className={clsx(
                  'pf2-camera-popover__toggle pf2-focus-ring',
                  cameraState?.mode === 'turntable' && 'pf2-camera-popover__toggle--active'
                )}
                onClick={() => handleCameraMode('turntable')}
                disabled={!isReady}
                aria-pressed={cameraState?.mode === 'turntable'}
              >
                Turntable
              </button>
              <button
                className={clsx(
                  'pf2-camera-popover__toggle pf2-focus-ring',
                  cameraState?.mode === 'arcball' && 'pf2-camera-popover__toggle--active'
                )}
                onClick={() => handleCameraMode('arcball')}
                disabled={!isReady}
                aria-pressed={cameraState?.mode === 'arcball'}
              >
                Arcball
              </button>
            </div>
          </div>

          {/* Projection */}
          <div className="pf2-camera-popover__row">
            <span className="pf2-camera-popover__label pf2-text-label">Projection</span>
            <div className="pf2-camera-popover__toggle-group">
              <button
                className={clsx(
                  'pf2-camera-popover__toggle pf2-focus-ring',
                  cameraState?.projection === 'perspective' && 'pf2-camera-popover__toggle--active'
                )}
                onClick={() => handleProjection('perspective')}
                disabled={!isReady}
                aria-pressed={cameraState?.projection === 'perspective'}
              >
                Persp
              </button>
              <button
                className={clsx(
                  'pf2-camera-popover__toggle pf2-focus-ring',
                  cameraState?.projection === 'ortho' && 'pf2-camera-popover__toggle--active'
                )}
                onClick={() => handleProjection('ortho')}
                disabled={!isReady}
                aria-pressed={cameraState?.projection === 'ortho'}
              >
                Ortho
              </button>
            </div>
          </div>

          <div className="pf2-camera-popover__divider" />

          {/* Grid & Axis toggles */}
          <div className="pf2-camera-popover__row">
            <button
              className={clsx(
                'pf2-camera-popover__check pf2-focus-ring',
                cameraState?.showGrid && 'pf2-camera-popover__check--active'
              )}
              onClick={() => controller?.toggleGrid()}
              disabled={!isReady}
              role="checkbox"
              aria-checked={cameraState?.showGrid ?? false}
            >
              <span className="pf2-camera-popover__check-indicator" />
              Grid
            </button>
            <button
              className={clsx(
                'pf2-camera-popover__check pf2-focus-ring',
                cameraState?.showAxis && 'pf2-camera-popover__check--active'
              )}
              onClick={() => controller?.toggleAxis()}
              disabled={!isReady}
              role="checkbox"
              aria-checked={cameraState?.showAxis ?? false}
            >
              <span className="pf2-camera-popover__check-indicator" />
              Axis
            </button>
          </div>

          <div className="pf2-camera-popover__divider" />

          {/* View Presets */}
          <div className="pf2-camera-popover__section">
            <span className="pf2-camera-popover__label pf2-text-label">View</span>
            <div className="pf2-camera-popover__preset-grid">
              {VIEW_PRESETS.map((vp) => (
                <button
                  key={vp.id}
                  className="pf2-camera-popover__preset pf2-focus-ring"
                  onClick={() => handleViewPreset(vp.id)}
                  disabled={!isReady}
                >
                  {vp.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </FocusScope.FocusScope>
    </div>
  );
};
```

---

### File: `src/ui/v2/shared/CameraPopover.css`

```css
/* ============================================================================
   CameraPopover — Camera settings flyout
   ============================================================================ */

.pf2-camera-popover {
  position: absolute;
  top: calc(100% + var(--pf2-space-sm));
  left: 50%;
  transform: translateX(-50%);
  z-index: 10; /* Above toolbar siblings */
  min-width: 240px;
  padding: var(--pf2-space-md);
  background: var(--pf2-bg-elevated);
  border: 1px solid var(--pf2-border);
  border-radius: var(--pf2-radius-md);
  box-shadow: var(--pf2-shadow-float);
  animation: pf2-popover-enter var(--pf2-duration-fast) var(--pf2-ease-enter) both;
}

@supports (backdrop-filter: blur(12px)) {
  .pf2-camera-popover {
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    background: rgba(30, 30, 36, 0.92);
  }
}

@keyframes pf2-popover-enter {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* ============================================================================
   Content Layout
   ============================================================================ */

.pf2-camera-popover__content {
  display: flex;
  flex-direction: column;
  gap: var(--pf2-space-sm);
}

.pf2-camera-popover__row {
  display: flex;
  align-items: center;
  gap: var(--pf2-space-sm);
}

.pf2-camera-popover__label {
  min-width: 72px;
  font-size: 11px;
  color: var(--pf2-text-secondary);
}

.pf2-camera-popover__divider {
  height: 1px;
  background: var(--pf2-border);
  margin: var(--pf2-space-xs) 0;
}

/* ============================================================================
   Toggle Buttons (Mode / Projection)
   ============================================================================ */

.pf2-camera-popover__toggle-group {
  display: flex;
  gap: 2px;
  background: var(--pf2-bg-base);
  border-radius: var(--pf2-radius-sm);
  padding: 2px;
}

.pf2-camera-popover__toggle {
  flex: 1;
  padding: 4px 10px;
  font-family: var(--pf2-font-body);
  font-size: 11px;
  font-weight: 500;
  color: var(--pf2-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--pf2-radius-sm);
  cursor: pointer;
  transition:
    color var(--pf2-duration-micro) var(--pf2-ease-move),
    background var(--pf2-duration-micro) var(--pf2-ease-move),
    border-color var(--pf2-duration-micro) var(--pf2-ease-move);
}

.pf2-camera-popover__toggle:hover:not(:disabled) {
  color: var(--pf2-text-primary);
  background: var(--pf2-bg-hover);
}

.pf2-camera-popover__toggle--active {
  color: var(--pf2-accent);
  background: var(--pf2-bg-surface);
  border-color: var(--pf2-accent);
}

.pf2-camera-popover__toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ============================================================================
   Checkbox-Style Toggles (Grid / Axis)
   ============================================================================ */

.pf2-camera-popover__check {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-family: var(--pf2-font-body);
  font-size: 11px;
  font-weight: 500;
  color: var(--pf2-text-secondary);
  background: transparent;
  border: 1px solid var(--pf2-border);
  border-radius: var(--pf2-radius-sm);
  cursor: pointer;
  transition:
    color var(--pf2-duration-micro) var(--pf2-ease-move),
    border-color var(--pf2-duration-micro) var(--pf2-ease-move);
}

.pf2-camera-popover__check:hover:not(:disabled) {
  color: var(--pf2-text-primary);
  border-color: var(--pf2-border-active);
}

.pf2-camera-popover__check--active {
  color: var(--pf2-accent);
  border-color: var(--pf2-accent);
}

.pf2-camera-popover__check-indicator {
  width: 10px;
  height: 10px;
  border: 1.5px solid currentColor;
  border-radius: 2px;
  position: relative;
}

.pf2-camera-popover__check--active .pf2-camera-popover__check-indicator::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: currentColor;
}

.pf2-camera-popover__check:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ============================================================================
   View Presets Grid
   ============================================================================ */

.pf2-camera-popover__section {
  display: flex;
  flex-direction: column;
  gap: var(--pf2-space-xs);
}

.pf2-camera-popover__preset-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 3px;
}

.pf2-camera-popover__preset {
  padding: 5px 4px;
  font-family: var(--pf2-font-body);
  font-size: 10px;
  font-weight: 500;
  color: var(--pf2-text-secondary);
  background: var(--pf2-bg-base);
  border: 1px solid var(--pf2-border);
  border-radius: var(--pf2-radius-sm);
  cursor: pointer;
  text-align: center;
  transition:
    color var(--pf2-duration-micro) var(--pf2-ease-move),
    background var(--pf2-duration-micro) var(--pf2-ease-move),
    border-color var(--pf2-duration-micro) var(--pf2-ease-move);
}

.pf2-camera-popover__preset:hover:not(:disabled) {
  color: var(--pf2-text-primary);
  background: var(--pf2-bg-hover);
  border-color: var(--pf2-accent-subtle);
}

.pf2-camera-popover__preset:active:not(:disabled) {
  background: var(--pf2-accent-subtle);
  border-color: var(--pf2-accent);
}

.pf2-camera-popover__preset:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ============================================================================
   High Contrast
   ============================================================================ */

@media (forced-colors: active) {
  .pf2-camera-popover {
    border: 2px solid ButtonText;
  }

  .pf2-camera-popover__toggle--active,
  .pf2-camera-popover__check--active {
    border-color: Highlight;
    color: Highlight;
  }
}
```

---

### File: `src/ui/v2/shared/LibraryDrawer.tsx`

```tsx
/**
 * LibraryDrawer — Full-screen preset library modal.
 *
 * Uses Radix Dialog for overlay, focus trapping, and Escape handling.
 * Displays preset cards with DesignThumbnail, category filtering, search.
 *
 * @module ui/v2/shared/LibraryDrawer
 */

import React, { useState, useMemo, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, X } from 'lucide-react';
import {
  PRESETS,
  getPresetsByCategory,
  getCategories,
  type PotPreset,
  type PresetCategory,
} from '../../../presets';
import { DesignThumbnail } from '../../shared/DesignThumbnail';
import { useAppStore, type StyleName } from '../../../state';
import { useAnnounce } from './Announcer';
import { useConfidence } from '../onboarding/useConfidence';
import type { LibraryDesign } from '../../../context/LibraryContext';
import clsx from 'clsx';
import './LibraryDrawer.css';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert PotPreset to LibraryDesign for ThumbnailRenderer.
 */
function presetToDesign(preset: PotPreset): LibraryDesign {
  return {
    id: preset.id,
    title: preset.title,
    style: preset.style,
    created_at: new Date().toISOString(),
    size: preset.size,
    opts: preset.opts,
    appearance: preset.appearance,
  };
}

// ============================================================================
// Sub-components
// ============================================================================

interface PresetCardProps {
  preset: PotPreset;
  isActive: boolean;
  onApply: () => void;
}

const PresetCard: React.FC<PresetCardProps> = ({ preset, isActive, onApply }) => {
  const design = useMemo(() => presetToDesign(preset), [preset]);

  return (
    <button
      className={clsx(
        'pf2-library-drawer__card pf2-focus-ring',
        isActive && 'pf2-library-drawer__card--active'
      )}
      onClick={onApply}
      title={preset.description}
    >
      <div className="pf2-library-drawer__card-thumb">
        <DesignThumbnail design={design} width={160} height={120} />
      </div>
      <div className="pf2-library-drawer__card-info">
        <span className="pf2-library-drawer__card-title">{preset.title}</span>
        <span className="pf2-library-drawer__card-category pf2-text-label">
          {preset.category}
        </span>
      </div>
    </button>
  );
};

// ============================================================================
// Main Component
// ============================================================================

interface LibraryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const LibraryDrawer: React.FC<LibraryDrawerProps> = ({
  open,
  onOpenChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<PresetCategory | null>(null);

  const announce = useAnnounce();
  const { unlock } = useConfidence();

  // Store actions
  const setGeometryParams = useAppStore((s) => s.setGeometryParams);
  const currentStyle = useAppStore((s) => s.style.name);
  const currentHeight = useAppStore((s) => s.geometry.H);
  const setStyle = useAppStore((s) => s.setStyle);
  const setStyleOpts = useAppStore((s) => s.setStyleOpts);
  const setPrimaryColor = useAppStore((s) => s.setPrimaryColor);
  const setMidColor = useAppStore((s) => s.setMidColor);
  const setSecondaryColor = useAppStore((s) => s.setSecondaryColor);

  // Categories
  const categories = useMemo(() => getCategories(), []);

  // Filtered presets
  const filteredPresets = useMemo(() => {
    let result: PotPreset[] = activeCategory
      ? getPresetsByCategory(activeCategory)
      : PRESETS;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query)
      );
    }

    return result;
  }, [activeCategory, searchQuery]);

  // Check if preset matches current state
  const isPresetActive = useCallback(
    (preset: PotPreset): boolean => {
      return (
        currentStyle === preset.style &&
        Math.abs(currentHeight - preset.size.height) < 0.1
      );
    },
    [currentStyle, currentHeight]
  );

  // Apply a preset
  const applyPreset = useCallback(
    (preset: PotPreset) => {
      // Geometry
      setGeometryParams({
        H: preset.size.height,
        top_od: preset.size.top_od,
        bottom_od: preset.size.bottom_od,
        t_wall: preset.size.wall_thickness,
        t_bottom: preset.size.bottom_thickness,
        r_drain: preset.size.drain_radius,
        expn: preset.size.flare_exp,
        spinTurns: (preset.opts.spin_turns as number) || 0,
        spinPhase: (preset.opts.spin_phase as number) || 0,
        spinCurve: (preset.opts.spin_curve as number) || 1,
        bellAmp: (preset.opts.bell_amp as number) || 0,
        bellCenter: (preset.opts.bell_center as number) || 0.5,
        bellWidth: (preset.opts.bell_width as number) || 0.22,
      });

      // Style
      setStyle(preset.style as StyleName);
      const geoKeys = new Set([
        'spin_turns', 'spin_phase', 'spin_curve',
        'bell_amp', 'bell_center', 'bell_width',
      ]);
      const styleParams: Record<string, number | boolean> = {};
      for (const [key, value] of Object.entries(preset.opts)) {
        if (!geoKeys.has(key)) {
          styleParams[key] = value;
        }
      }
      setStyleOpts(styleParams);

      // Appearance
      if (preset.appearance) {
        setPrimaryColor(preset.appearance.primaryColor);
        setMidColor(preset.appearance.midColor);
        setSecondaryColor(preset.appearance.secondaryColor);
      }

      // Close drawer, announce, unlock
      onOpenChange(false);
      announce(`Applied preset: ${preset.title}`);
      unlock('preset-load');
    },
    [
      setGeometryParams, setStyle, setStyleOpts,
      setPrimaryColor, setMidColor, setSecondaryColor,
      onOpenChange, announce, unlock,
    ]
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pf2-library-drawer__overlay" />
        <Dialog.Content
          className="pf2-library-drawer"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="pf2-library-drawer__header">
            <Dialog.Title className="pf2-library-drawer__title">
              Preset Library
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="pf2-library-drawer__close pf2-focus-ring"
                aria-label="Close library"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* Search */}
          <div className="pf2-library-drawer__search">
            <Search size={14} className="pf2-library-drawer__search-icon" />
            <input
              type="text"
              className="pf2-library-drawer__search-input pf2-focus-ring"
              placeholder="Search presets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search presets"
            />
          </div>

          {/* Category Filters */}
          <div className="pf2-library-drawer__categories" role="radiogroup" aria-label="Filter by category">
            <button
              className={clsx(
                'pf2-library-drawer__chip pf2-focus-ring',
                activeCategory === null && 'pf2-library-drawer__chip--active'
              )}
              onClick={() => setActiveCategory(null)}
              role="radio"
              aria-checked={activeCategory === null}
            >
              All
            </button>
            {categories.map(({ category, label }) => (
              <button
                key={category}
                className={clsx(
                  'pf2-library-drawer__chip pf2-focus-ring',
                  activeCategory === category && 'pf2-library-drawer__chip--active'
                )}
                onClick={() => setActiveCategory(category)}
                role="radio"
                aria-checked={activeCategory === category}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Preset Grid */}
          <div className="pf2-library-drawer__grid">
            {filteredPresets.length > 0 ? (
              filteredPresets.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  isActive={isPresetActive(preset)}
                  onApply={() => applyPreset(preset)}
                />
              ))
            ) : (
              <p className="pf2-library-drawer__empty pf2-text-label">
                No presets match your search.
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
```

---

### File: `src/ui/v2/shared/LibraryDrawer.css`

```css
/* ============================================================================
   LibraryDrawer — Full-screen preset library
   ============================================================================ */

/* Overlay */
.pf2-library-drawer__overlay {
  position: fixed;
  inset: 0;
  z-index: var(--pf2-z-modal, 1000);
  background: rgba(0, 0, 0, 0.7);
  animation: pf2-overlay-enter var(--pf2-duration-fast) var(--pf2-ease-enter) both;
}

@supports (backdrop-filter: blur(4px)) {
  .pf2-library-drawer__overlay {
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
}

@keyframes pf2-overlay-enter {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Content panel */
.pf2-library-drawer {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: calc(var(--pf2-z-modal, 1000) + 1);
  width: min(90vw, 960px);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--pf2-bg-base);
  border: 1px solid var(--pf2-border);
  border-radius: var(--pf2-radius-md);
  box-shadow: var(--pf2-shadow-float);
  overflow: hidden;
  animation: pf2-drawer-enter var(--pf2-duration-fast) var(--pf2-ease-spring) both;
}

@keyframes pf2-drawer-enter {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

/* ============================================================================
   Header
   ============================================================================ */

.pf2-library-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--pf2-space-lg) var(--pf2-space-xl);
  border-bottom: 1px solid var(--pf2-border);
  flex-shrink: 0;
}

.pf2-library-drawer__title {
  font-family: var(--pf2-font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--pf2-text-primary);
  margin: 0;
}

.pf2-library-drawer__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: 1px solid var(--pf2-border);
  border-radius: var(--pf2-radius-sm);
  color: var(--pf2-text-secondary);
  cursor: pointer;
  transition:
    color var(--pf2-duration-micro) var(--pf2-ease-move),
    border-color var(--pf2-duration-micro) var(--pf2-ease-move);
}

.pf2-library-drawer__close:hover {
  color: var(--pf2-text-primary);
  border-color: var(--pf2-border-active);
}

/* ============================================================================
   Search
   ============================================================================ */

.pf2-library-drawer__search {
  position: relative;
  padding: var(--pf2-space-md) var(--pf2-space-xl);
  flex-shrink: 0;
}

.pf2-library-drawer__search-icon {
  position: absolute;
  top: 50%;
  left: calc(var(--pf2-space-xl) + 10px);
  transform: translateY(-50%);
  color: var(--pf2-text-muted);
  pointer-events: none;
}

.pf2-library-drawer__search-input {
  width: 100%;
  padding: 8px 8px 8px 32px;
  font-family: var(--pf2-font-body);
  font-size: 13px;
  color: var(--pf2-text-primary);
  background: var(--pf2-bg-surface);
  border: 1px solid var(--pf2-border);
  border-radius: var(--pf2-radius-sm);
  outline: none;
  transition: border-color var(--pf2-duration-micro) var(--pf2-ease-move);
}

.pf2-library-drawer__search-input:focus {
  border-color: var(--pf2-accent);
}

.pf2-library-drawer__search-input::placeholder {
  color: var(--pf2-text-muted);
}

/* ============================================================================
   Category Filters
   ============================================================================ */

.pf2-library-drawer__categories {
  display: flex;
  gap: var(--pf2-space-xs);
  padding: 0 var(--pf2-space-xl) var(--pf2-space-md);
  flex-wrap: wrap;
  flex-shrink: 0;
}

.pf2-library-drawer__chip {
  padding: 4px 12px;
  font-family: var(--pf2-font-body);
  font-size: 11px;
  font-weight: 500;
  color: var(--pf2-text-secondary);
  background: var(--pf2-bg-surface);
  border: 1px solid var(--pf2-border);
  border-radius: 999px;
  cursor: pointer;
  transition:
    color var(--pf2-duration-micro) var(--pf2-ease-move),
    background var(--pf2-duration-micro) var(--pf2-ease-move),
    border-color var(--pf2-duration-micro) var(--pf2-ease-move);
}

.pf2-library-drawer__chip:hover {
  color: var(--pf2-text-primary);
  background: var(--pf2-bg-hover);
}

.pf2-library-drawer__chip--active {
  color: var(--pf2-accent);
  background: var(--pf2-accent-subtle);
  border-color: var(--pf2-accent);
}

/* ============================================================================
   Preset Grid
   ============================================================================ */

.pf2-library-drawer__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--pf2-space-md);
  padding: var(--pf2-space-md) var(--pf2-space-xl) var(--pf2-space-xl);
  overflow-y: auto;
  flex: 1;
}

.pf2-library-drawer__empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--pf2-text-muted);
  padding: var(--pf2-space-xl);
}

/* ============================================================================
   Preset Card
   ============================================================================ */

.pf2-library-drawer__card {
  display: flex;
  flex-direction: column;
  background: var(--pf2-bg-surface);
  border: 1px solid var(--pf2-border);
  border-radius: var(--pf2-radius-md);
  overflow: hidden;
  cursor: pointer;
  transition:
    border-color var(--pf2-duration-micro) var(--pf2-ease-move),
    transform var(--pf2-duration-micro) var(--pf2-ease-move),
    box-shadow var(--pf2-duration-micro) var(--pf2-ease-move);
}

.pf2-library-drawer__card:hover {
  border-color: var(--pf2-accent-subtle);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.pf2-library-drawer__card--active {
  border-color: var(--pf2-accent);
  box-shadow: 0 0 0 1px var(--pf2-accent);
}

.pf2-library-drawer__card-thumb {
  aspect-ratio: 4 / 3;
  background: var(--pf2-bg-base);
  overflow: hidden;
}

.pf2-library-drawer__card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--pf2-space-sm) var(--pf2-space-md);
}

.pf2-library-drawer__card-title {
  font-family: var(--pf2-font-body);
  font-size: 12px;
  font-weight: 600;
  color: var(--pf2-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pf2-library-drawer__card-category {
  font-size: 10px;
  color: var(--pf2-text-muted);
}

/* ============================================================================
   High Contrast
   ============================================================================ */

@media (forced-colors: active) {
  .pf2-library-drawer {
    border: 2px solid ButtonText;
  }

  .pf2-library-drawer__card--active {
    border-color: Highlight;
  }

  .pf2-library-drawer__chip--active {
    border-color: Highlight;
  }
}
```

---

### File: `src/ui/v2/layout/StatusFooter.tsx` — MODIFIED

```tsx
/**
 * StatusFooter — Persistent stats bar, download button, and export progress.
 *
 * Lives at the bottom of SidebarV2, visible across all tabs.
 * Displays mesh stats (tris, verts, generation time), a full-width
 * Download button that triggers STL export, and animated progress/completion UI.
 *
 * @module ui/v2/layout/StatusFooter
 */

import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import { Triangle, Box, Activity, Download, Check } from 'lucide-react';
import { ButtonV2 } from '../controls/ButtonV2';
import { useAppStore } from '../../../state';
import { useExport } from '../../../hooks/useExport';
import { useAnnounce } from '../shared/Announcer';
import { useConfidence } from '../onboarding/useConfidence';
import './StatusFooter.css';

// ============================================================================
// Constants
// ============================================================================

const COMPLETION_DISPLAY_MS = 5000;

// ============================================================================
// Helpers
// ============================================================================

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatTime(ms: number): string {
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================================
// Component
// ============================================================================

export const StatusFooter: React.FC = () => {
  const triangleCount = useAppStore((s) => s.performance.triangleCount);
  const vertexCount = useAppStore((s) => s.performance.vertexCount);
  const generationTime = useAppStore((s) => s.performance.generationTime);
  const isGenerating = useAppStore((s) => s.performance.isGenerating);

  const { exportSTL, progress, stats, reset } = useExport();
  const announce = useAnnounce();
  const { unlock } = useConfidence();
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const meshStats = useMemo(
    () => ({
      triangles: formatNumber(triangleCount),
      vertices: formatNumber(vertexCount),
      genTime: formatTime(generationTime),
    }),
    [triangleCount, vertexCount, generationTime]
  );

  // Handle export click
  const handleDownload = useCallback(async () => {
    if (progress.status === 'generating') return; // Prevent double-click
    await exportSTL();
  }, [progress.status, exportSTL]);

  // Auto-reset after completion, announce result
  useEffect(() => {
    if (progress.status === 'complete' && stats) {
      announce(
        `Export complete — ${formatNumber(stats.triangleCount)} triangles, ${stats.fileSize}`
      );
      unlock('first-export');

      resetTimerRef.current = setTimeout(() => {
        reset();
      }, COMPLETION_DISPLAY_MS);
    }

    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, [progress.status, stats, announce, unlock, reset]);

  const isExporting = progress.status === 'generating';
  const isComplete = progress.status === 'complete';
  const isError = progress.status === 'error';
  const showProgress = isExporting || isComplete || isError;

  return (
    <footer
      className="pf2-status-footer"
      aria-busy={isExporting || undefined}
    >
      {/* Stats line */}
      <div
        className="pf2-status-footer__stats pf2-text-mono"
        role="status"
        aria-live="polite"
        aria-label={`Mesh: ${meshStats.triangles} triangles, ${meshStats.vertices} vertices, generated in ${meshStats.genTime}`}
      >
        <span className="pf2-status-footer__stat">
          <Triangle size={11} aria-hidden="true" />
          {meshStats.triangles}
        </span>
        <span className="pf2-status-footer__divider" aria-hidden="true">·</span>
        <span className="pf2-status-footer__stat">
          <Box size={11} aria-hidden="true" />
          {meshStats.vertices}
        </span>
        <span className="pf2-status-footer__divider" aria-hidden="true">·</span>
        <span className="pf2-status-footer__stat">
          <Activity size={11} aria-hidden="true" />
          {meshStats.genTime}
        </span>
        {isGenerating && (
          <span className="pf2-status-footer__generating" aria-label="Generating mesh">
            <span className="pf2-status-footer__spinner" aria-hidden="true" />
          </span>
        )}
      </div>

      {/* Export progress */}
      {showProgress && (
        <div
          className={`pf2-status-footer__progress${
            isExporting ? ' pf2-status-footer__progress--indeterminate' : ''
          }${isComplete ? ' pf2-status-footer__progress--complete' : ''}${
            isError ? ' pf2-status-footer__progress--error' : ''
          }`}
          role="progressbar"
          aria-valuenow={isComplete ? 100 : undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={
            isExporting
              ? 'Generating STL file'
              : isComplete
                ? 'Export complete'
                : progress.message
          }
        >
          <div className="pf2-status-footer__progress-bar" />
        </div>
      )}

      {/* Completion card */}
      {isComplete && stats && (
        <div className="pf2-status-footer__completion" role="status">
          <div className="pf2-status-footer__completion-header">
            <svg
              className="pf2-status-footer__check-icon"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="10"
                cy="10"
                r="8.5"
                stroke="var(--pf2-success)"
                strokeWidth="1.5"
                className="pf2-status-footer__check-circle"
              />
              <polyline
                points="6.5,10.5 9,13 13.5,7.5"
                stroke="var(--pf2-success)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                className="pf2-status-footer__check-mark"
              />
            </svg>
            <span className="pf2-status-footer__completion-title">
              Export Complete
            </span>
          </div>
          <div className="pf2-status-footer__completion-stats pf2-text-mono">
            <span>{formatNumber(stats.triangleCount)} triangles</span>
            <span className="pf2-status-footer__divider" aria-hidden="true">·</span>
            <span>{stats.fileSize}</span>
            <span className="pf2-status-footer__divider" aria-hidden="true">·</span>
            <span>{formatTime(stats.generationTimeMs)}</span>
          </div>
          {stats.volumeMl > 0 && (
            <div className="pf2-status-footer__completion-volume pf2-text-mono">
              {stats.volumeMl.toFixed(1)} ml volume
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {isError && (
        <div className="pf2-status-footer__error" role="alert">
          {progress.message}
        </div>
      )}

      {/* Download button */}
      <ButtonV2
        variant="primary"
        fullWidth
        iconLeft={<Download size={16} />}
        aria-label={isExporting ? 'Generating STL...' : 'Download STL file'}
        onClick={handleDownload}
        disabled={isExporting}
      >
        {isExporting ? 'Generating...' : 'Download STL'}
      </ButtonV2>
    </footer>
  );
};
```

---

### File: `src/ui/v2/layout/StatusFooter.css` — MODIFIED

Additional CSS rules appended after existing content:

```css
/* (existing rules preserved — additions below) */

/* ============================================================================
   Progress Bar — Active States
   ============================================================================ */

/* Complete state — solid gold fill */
.pf2-status-footer__progress--complete .pf2-status-footer__progress-bar {
  width: 100%;
  background: var(--pf2-accent);
  transition: width var(--pf2-duration-fast) var(--pf2-ease-move);
}

/* Error state — red bar */
.pf2-status-footer__progress--error .pf2-status-footer__progress-bar {
  width: 100%;
  background: var(--pf2-error);
}

/* ============================================================================
   Completion Card
   ============================================================================ */

.pf2-status-footer__completion {
  display: flex;
  flex-direction: column;
  gap: var(--pf2-space-xs);
  padding: var(--pf2-space-md);
  background: var(--pf2-bg-elevated);
  border: 1px solid var(--pf2-border);
  border-radius: var(--pf2-radius-sm);
  animation: pf2-tab-enter var(--pf2-duration-fast) var(--pf2-ease-spring) both;
}

.pf2-status-footer__completion-header {
  display: flex;
  align-items: center;
  gap: var(--pf2-space-sm);
}

.pf2-status-footer__completion-title {
  font-family: var(--pf2-font-body);
  font-size: 12px;
  font-weight: 600;
  color: var(--pf2-success);
}

.pf2-status-footer__completion-stats {
  display: flex;
  align-items: center;
  gap: var(--pf2-space-sm);
  font-size: 11px;
  color: var(--pf2-text-secondary);
}

.pf2-status-footer__completion-volume {
  font-size: 10px;
  color: var(--pf2-text-muted);
}

/* Check icon SVG draw-on animation */
.pf2-status-footer__check-circle {
  stroke-dasharray: 54;
  stroke-dashoffset: 54;
  animation: pf2-draw-circle 0.4s var(--pf2-ease-enter) 0.1s forwards;
}

.pf2-status-footer__check-mark {
  stroke-dasharray: 14;
  stroke-dashoffset: 14;
  animation: pf2-draw-check 0.3s var(--pf2-ease-enter) 0.4s forwards;
}

@keyframes pf2-draw-circle {
  to { stroke-dashoffset: 0; }
}

@keyframes pf2-draw-check {
  to { stroke-dashoffset: 0; }
}

/* ============================================================================
   Error Message
   ============================================================================ */

.pf2-status-footer__error {
  padding: var(--pf2-space-sm) var(--pf2-space-md);
  font-family: var(--pf2-font-body);
  font-size: 11px;
  color: var(--pf2-error);
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: var(--pf2-radius-sm);
  animation: pf2-tab-enter var(--pf2-duration-fast) var(--pf2-ease-enter) both;
}
```

---

### File: `src/ui/v2/layout/ToolbarV2.tsx` — MODIFIED

Key changes:
1. Import `SlidersHorizontal` and `BookOpen` from lucide-react
2. Add `CameraPopover` state + trigger button to center group
3. Add `LibraryDrawer` state + trigger button to right group

The center group becomes:
```
[Camera Popover Trigger] [Reset] [Auto-Rotate] [Screenshot]
```

The right group gets `BookOpen` added before Save:
```
[Library] [Save] [Load] | [Help] [Fullscreen] [Zen]
```

In the component, add:
```typescript
import { SlidersHorizontal, BookOpen } from 'lucide-react';
import { CameraPopover } from '../shared/CameraPopover';
import { LibraryDrawer } from '../shared/LibraryDrawer';

// Inside the component:
const [cameraOpen, setCameraOpen] = useState(false);
const [libraryOpen, setLibraryOpen] = useState(false);
const cameraTriggerRef = useRef<HTMLButtonElement>(null);
```

Center group addition (after the group div opens, before Reset button):
```tsx
<div className="pf2-toolbar__group pf2-toolbar__group--center" style={{ position: 'relative' }}>
  <IconButtonV2
    ref={cameraTriggerRef}
    icon={<SlidersHorizontal size={16} />}
    aria-label="Camera settings"
    aria-expanded={cameraOpen}
    aria-haspopup="dialog"
    onClick={() => setCameraOpen((prev) => !prev)}
    size="sm"
    disabled={!isControllerReady}
  />
  <CameraPopover
    open={cameraOpen}
    onOpenChange={setCameraOpen}
    triggerRef={cameraTriggerRef}
  />
  {/* existing buttons... */}
```

Right group addition (before Save button):
```tsx
<IconButtonV2
  icon={<BookOpen size={16} />}
  aria-label="Preset library"
  onClick={() => setLibraryOpen(true)}
  size="sm"
/>
```

And outside the toolbar div, after `<HelpDialog>`:
```tsx
<LibraryDrawer open={libraryOpen} onOpenChange={setLibraryOpen} />
```

---

### File: `src/ui/v2/controls/SliderV2.tsx` — MODIFIED

Add `onKeyDown` to `RadixSlider.Thumb`:

```typescript
// Inside the component, add this handler:
const handleThumbKeyDown = useCallback(
  (e: React.KeyboardEvent) => {
    if (!e.shiftKey) return;
    const isHorizontal = e.key === 'ArrowRight' || e.key === 'ArrowLeft';
    const isVertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
    if (!isHorizontal && !isVertical) return;

    e.preventDefault();
    const bigStep = step * 10;
    const direction = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 1 : -1;
    const raw = safeValue + bigStep * direction;
    const clamped = Math.max(min, Math.min(max, raw));
    // Round to step precision to avoid floating point drift
    const rounded = Math.round(clamped / step) * step;
    const final = Math.max(min, Math.min(max, rounded));
    onChange(final);
    onValueCommit?.(final);
  },
  [step, min, max, safeValue, onChange, onValueCommit]
);
```

Then on the Thumb element, add:
```tsx
<RadixSlider.Thumb
  className="pf2-slider__thumb pf2-focus-ring"
  aria-label={label}
  aria-valuetext={...}
  onKeyDown={handleThumbKeyDown}
>
```

---

### Files: ShapeTab.tsx, StyleTab.tsx, ExportTab.tsx — MODIFIED (Progressive Disclosure)

**ShapeTab.tsx** additions:
```typescript
import { useConfidence } from '../onboarding/useConfidence';

// In component:
const { isVisible } = useConfidence();

// Wrap sections:
{isVisible('shape:size') && (
  <SectionV2 title="Size" ...>...</SectionV2>
)}
{isVisible('shape:thickness') && (
  <SectionV2 title="Thickness" ...>...</SectionV2>
)}
{isVisible('shape:features') && (
  <SectionV2 title="Features" ...>...</SectionV2>
)}
{isVisible('shape:bell-twist') && (
  <SectionV2 title="Bell & Twist" ...>...</SectionV2>
)}
```

Also, in `handleChange`, add confidence trigger:
```typescript
const handleChange = useCallback(
  (key: keyof GeometryParams, value: number) => {
    setGeometryParam(key, value);
    if (SIZE_PARAMS.includes(key)) {
      unlock('dimension-change');
    }
  },
  [setGeometryParam, unlock]
);
```

**StyleTab.tsx** — wrap Colors, Display, Lighting, Background in `isVisible()`:
- `'style:colors'` → Colors section
- `'style:display'` → Display section  
- `'style:lighting'` → Lighting section
- `'style:background'` → Background section

Also trigger `unlock('style-change')` in `handleStyleChange`.

**ExportTab.tsx** — wrap Format and Advanced in `isVisible()`:
- `'export:format'` → Format section
- `'export:advanced'` → Advanced section

---

## Mathematical Notes

### SVG Check Icon Geometry
- Circle: `cx=10, cy=10, r=8.5` → circumference = `2π × 8.5 ≈ 53.4` → `stroke-dasharray: 54`
- Checkmark: polyline `6.5,10.5 → 9,13 → 13.5,7.5` → segments:
  - `√((9-6.5)² + (13-10.5)²) = √(6.25 + 6.25) ≈ 3.54`
  - `√((13.5-9)² + (7.5-13)²) = √(20.25 + 30.25) ≈ 7.11`
  - Total ≈ 10.65 → `stroke-dasharray: 14` (with overhead for linecaps)

### Progressive Disclosure Stagger Indices
When sections are conditionally rendered, the `sectionIndex` prop should reflect the visible position to maintain correct stagger delay. This can be computed dynamically:
```tsx
const visibleSections = ['shape:size', 'shape:thickness', 'shape:features', 'shape:bell-twist']
  .filter((id) => isVisible(id));
// sectionIndex for each = visibleSections.indexOf(id)
```

However, this adds complexity. My recommendation: use fixed `sectionIndex` values (0, 1, 2, 3) and accept that stagger delays may skip indices when sections are hidden. The visual difference is negligible (one stagger unit is 30ms).

---

*End of Generator Round 1 — Phase 4: Features*
