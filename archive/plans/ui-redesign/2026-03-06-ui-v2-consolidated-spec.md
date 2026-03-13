# PotFoundry UI v2 — Consolidated Design Specification

**Date**: 2026-03-06  
**Status**: APPROVED — ready for implementation  
**Authority**: Master Approval (unanimous: Generator proposed, Verifier accepted w/ amendments, Executioner confirmed feasibility)  
**Source documents**: Base design doc, Generator R1 elevation, Verifier R1 critique, Executioner review, Master approval

---

## 1. Goal

Build a parallel "v2" UI for PotFoundry with a soft luxury / editorial aesthetic, restructured information architecture, branded motion language, and world-class interaction design. The existing v1 UI remains intact and selectable via a settings toggle.

### North Star

> The digital experience of crafting a pot should feel as tangible and satisfying as the physical objects themselves.

### Core Decisions

1. **Full parallel layout** — new `AppUIv2` component tree alongside existing `AppUI`
2. **Tab-centric sidebar** — three tabs (Shape / Style / Export) replace 7 stacked sections
3. **Parametric export elevated** — default pipeline, no checkbox archaeology
4. **Camera in toolbar** — popover flyout, not in sidebar
5. **Library as overlay** — full-screen drawer/modal triggered from toolbar
6. **Zero modifications to existing UI** — purely additive
7. **Branded motion language** — 4 custom easing curves, choreographed transitions, micro-interactions
8. **Progressive disclosure** — parameters reveal as users gain confidence
9. **Accessible by design** — ARIA announcer, live regions, focus management, contrast compliance

---

## 2. Visual Identity

### Typography
- **Display**: Fraunces (variable serif, optical-size) — wordmark, section headings
- **Body**: Satoshi (geometric sans) — labels, descriptions, buttons, tab labels
- **Mono**: IBM Plex Mono — numeric values, stats, status bar
- **Hosting**: Self-hosted in `public/fonts/` with `font-display: swap`

### Color Palette — Dark (Default)

```css
/* Backgrounds */
--pf2-bg-base:      #0f0f12;
--pf2-bg-surface:   #16161b;
--pf2-bg-elevated:  #1e1e25;
--pf2-bg-hover:     #26262f;

/* Text */
--pf2-text-primary:   #f5f0e8;  /* warm cream — 15.7:1 on base */
--pf2-text-secondary: #a8a29e;  /* CORRECTED from #9a9590 — ~6.3:1 on base, AA compliant */
--pf2-text-muted:     #7a756f;  /* CORRECTED from #5c5753 — ~4.6:1 on base, decorative only */

/* Accents */
--pf2-accent:         #b4975a;  /* muted gold — 5.8:1 on base */
--pf2-accent-hover:   #c9ab6e;  /* use for small text on elevated bg */
--pf2-accent-subtle:  rgba(180,151,90,0.12);

/* Borders */
--pf2-border:         rgba(245,240,232,0.06);
--pf2-border-active:  rgba(245,240,232,0.15);

/* Status */
--pf2-success: #6b8f71;
--pf2-warning: #c49a3c;
--pf2-error:   #b85c5c;

/* Shadows */
--pf2-shadow-float: 0 8px 32px rgba(0,0,0,0.4);
```

### Spacing & Radius
Same scale as v1 (4/8/12/16/24px). Default radius: 8px. Cards/panels: 12px.
Minimal shadows — rely on border + background layering.

---

## 3. Motion & Animation System

### 3.1 Custom Easing Curves

```css
:root {
  /* ENTER — Gentle deceleration. Objects arrive with ceramic weight. */
  --pf2-ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
  
  /* EXIT — Quick departure. Confident. */
  --pf2-ease-exit: cubic-bezier(0.7, 0, 0.84, 0);
  
  /* MOVE — Organic repositioning. The "clay on wheel" curve. */
  --pf2-ease-move: cubic-bezier(0.22, 0.61, 0.36, 1);
  
  /* BOUNCE — Subtle spring for micro-interactions. */
  --pf2-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### 3.2 Duration Scale

```css
:root {
  --pf2-duration-instant: 80ms;
  --pf2-duration-micro: 150ms;
  --pf2-duration-fast: 220ms;
  --pf2-duration-normal: 320ms;
  --pf2-duration-slow: 480ms;
  --pf2-duration-dramatic: 700ms;
  --pf2-duration-stagger: 30ms;   /* CORRECTED from 50ms. Max 150ms total. */
}
```

### 3.3 Transition Choreography

**Sidebar Open/Close**: 40px translateX + 4px blur focus-pull, `--pf2-duration-slow` with `--pf2-ease-enter`.

**Tab Switches**: Directional crossfade — 12px displacement based on tab index direction. Content slides left-out/right-in (forward) or reverse.

**Section Expand/Collapse**: `grid-template-rows: 0fr → 1fr` with opacity fade. NOTE: this is a layout animation (not GPU-composited). On tab switch, set sections to final state instantly — only stagger the opacity fade.

**Staggered Enter**: Each section enters with `animation-delay: calc(30ms * var(--section-index))`. Set via inline style. Max 150ms total stagger.

### 3.4 Micro-interactions

**Slider Thumb**: 18px gold-bordered circle. Hover: 4px gold glow expand + `scale(1.1)`. Active/drag: 8px glow + `scale(1.15)`.

**Button Press**: `scale(0.97) translateY(1px)` on `:active`. Subtle physical depression.

**Focus Ring** (Gold Halo):
```css
.pf2-focus-ring:focus-visible {
  outline: none;
  box-shadow: 
    0 0 0 2px var(--pf2-bg-surface),  /* gap bezel */
    0 0 0 4px var(--pf2-accent);       /* gold ring */
}
```

### 3.5 Reduced Motion

Full `prefers-reduced-motion: reduce` support. All animations suppressed to 0.01ms. Opacity-only transitions preserved for non-disorienting state changes. `useReducedMotion()` hook for JS-driven animations.

---

## 4. Layout Architecture

### Sidebar (380px default, resizable)

```
┌──────────────────────────────────────┐
│  P o t F o u n d r y           ×    │  Fraunces wordmark
│  ─────────────────────────────────   │
│  ┌──────────┬──────────┬──────────┐  │
│  │  Shape   │  Style   │  Export  │  │  Gold underline on active
│  └──────────┴──────────┴──────────┘  │
│                                      │
│  [Scrollable tab content]            │
│                                      │
│  ▲ 12.4k △ · 6.2k ◇ · 42ms        │  Compact stats (ARIA live region)
│  ┌────────────────────────────────┐  │
│  │    ▼  Download STL             │  │  Gold CTA (persistent)
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

- **Default width**: 380px (up from 340px)
- **Min width**: 320px  
- **Max width**: `min(480px, 45vw)`
- **Internal padding**: 20px
- **Section gap**: 16px
- **Background**: `rgba(15, 15, 18, 0.96)` (solid). `backdrop-filter: blur(12px)` as should-have progressive enhancement behind `@supports`.
- **Persistence**: `localStorage` key `pf2-sidebar-width`

### Shape Tab
- **Presets**: 3 featured thumbnails, horizontal scroll, "Browse All" link
- **Size group**: Height, Top Diameter, Bottom Diameter
- **Thickness group**: Wall, Bottom
- **Features group**: Drain Hole, Flare
- **Bell & Twist**: collapsed by default

### Style Tab
- **Style selector**: dropdown with style name + description
- **Style parameters**: dynamic SliderV2 controls from schema with description tooltips
- **Advanced Parameters**: collapsed sub-section
- **Appearance group**: color preset swatches + 3 custom pickers + gradient preview
- **Display toggles**: Wireframe, Inner surface
- **Lighting presets**: horizontal chip row
- **Background**: preset swatches + collapsed custom colors + angle slider

### Export Tab
- **Quality profiles**: 4-card grid (Draft / Standard / High / Ultra) with triangle estimates, hover lift, gold selection
- **Format selector**: STL (Binary) / 3MF radio group
- **Pipeline selector**: Parametric (pre-selected, labeled "Best Quality") / GPU Grid / Legacy CPU
- **Advanced Settings**: collapsed — pipeline tuning params, feature detection toggles, debug overlays
- **Auth/tier banner**: compact, only when relevant

### Persistent Footer (StatusFooter)
Always visible across all tabs:
- Compact stats line (monospace, ARIA `role="status" aria-live="polite"`)
- Full-width Download button (gold accent)
- Export progress: indeterminate gold pulse bar during generation, completion celebration on finish

### Toolbar (Slimmed)
**Keeps**: Menu toggle, Reset Camera, Auto-Rotate, Screenshot, Help, Save/Load JSON, Fullscreen  
**Removes**: Camera Mode, Projection, Grid (moved to camera popover)  
**Adds**: Camera popover button, Library button  
**Hover labels**: CSS `::after` pseudo-element with `aria-label` content

---

## 5. Key Interactions

### 5.1 The Download Moment (Export Progress)

**Phase 1 — Initiation**: Download button transforms into progress container.

**Phase 2 — Progress**: Indeterminate gold shimmer/pulse bar (CSS-only). No fake percentages. Pipeline phase labels NOT shown during generation (data unavailable until completion).

**Phase 3 — Completion**: 
- Progress bar fills and pulses gold (`brightness(1.3)` flash)
- Completion card enters with spring scale (`scale(0.95) → 1.02 → 1.0`)
- Check icon SVG draw-on animation (24-unit stroke-dashoffset)
- Stats display: triangle count, file size, generation time
- Post-hoc phase timeline from `PipelineDiagnostics.phases`

### 5.2 Preset Load
- Clicked preset card: brief gold border flash
- All sliders animate to new values simultaneously (`transition: left 320ms ease-move`)
- 3D viewport morphs in real-time (GPU preview updates per-frame)

### 5.3 Style Switch
- Old parameters fade out (stagger from bottom, `--pf2-ease-exit`)
- 80ms breathing pause
- New parameters fade in (stagger from top, `--pf2-ease-enter`)

### 5.4 Slider Interaction
- **Floating value tooltip**: Appears during drag only, tracks thumb position, `min-width: 3ch`
- **Default ghost marker**: Faint tick on track at default value position, `opacity: 0.3`
- **Snap-to-default**: Within 5% of range (capped at step × 5), thumb snaps magnetically. Hold Shift to override.
- **Double-click to reset**: Returns to default value

---

## 6. Onboarding & Progressive Disclosure

### First-Run (should-have, v2.1)
- Viewport loads with FourierBloom preset (`fb_n1=8, fb_amp=0.22`) auto-rotating at 0.3 rpm
- Non-modal welcome card overlaid on viewport (bottom-right, `z-index: 150`)
- "Pick a Style" (accent button) / "I know what I'm doing" (ghost button)

### Progressive Disclosure (must-have)
Four confidence levels tracked via `useConfidence` hook, persisted to `localStorage` key `pf2-user-confidence`:

| Level | Trigger | Visible Sections |
|---|---|---|
| 0 | First run | Presets + Style selector only |
| 1 | First style/preset change | + Size group, style parameters |
| 2 | First dimension change | + Thickness, Features |
| 3 | First export | + Advanced, pipeline tuning |

**Auto-unlock**: Preset load, deep link, or library load → all confidence flags set to true.  
**Reset**: "Reset tutorial" option in Settings.

---

## 7. Keyboard & Focus Management

### Shortcuts (v2 only, gated by `uiTheme === 'v2'`)

| Key | Action |
|---|---|
| `Alt+1/2/3` | Switch to Shape/Style/Export tab |
| `Z` | Toggle Zen mode (full-screen viewport) |
| Existing `1-5` | Style selection (PRESERVED, unchanged) |
| Arrow keys (on focused slider) | Nudge by step (Radix native) |
| `Shift+Arrow` | Nudge by step × 10 (custom handler) |

### Focus Trapping
- **CameraPopover**: `@radix-ui/react-focus-scope` `FocusScope` (trapped, loop)
- **LibraryDrawer**: `FocusScope` (trapped, loop) + manual focus-return-to-trigger
- **All modals/dialogs**: Radix Dialog (built-in trapping)

### Focus Indicators
Gold halo (2-layer box-shadow) on all interactive elements via `.pf2-focus-ring:focus-visible`.

---

## 8. Accessibility

### ARIA Announcer
`AnnouncerProvider` + `useAnnounce()` hook. Hidden `role="status" aria-live="polite"` div. Monotonic counter for repeated message uniqueness.

**Announcement triggers**:
- Export complete (triangle count, file size)
- Preset applied (preset name, style name)
- Style changed (style name, parameter count)
- Mesh stats (on `onValueCommit`, not continuous)

### Live Regions
- `StatusFooter` stats: `role="status" aria-live="polite"`
- Export progress: `role="progressbar"` with `aria-valuenow`, `aria-label`

### High Contrast
- `@media (forced-colors: active)` — system colors for all interactive elements
- Optional custom high-contrast token set via `[data-contrast="high"]`

### Focus Return
After modal/drawer close, `requestAnimationFrame(() => triggerRef.current?.focus())`.

---

## 9. Mobile

### Bottom Sheet (v2)
Four states: collapsed (64px) / peek (30vh) / half (50vh) / full (85vh).  
Velocity-aware snapping: finger velocity > 0.5 px/ms → snap in direction of motion.

### Gestures (should-have)
Horizontal swipe on tab bar to switch Shape/Style/Export with inertia.

### Haptics (should-have)
`navigator.vibrate()` with feature check. Tap (10ms), Snap ([5,50,5]ms), Success ([10,30,10,30,20]ms). Android-only (iOS blocked).

### Responsive
Quality cards: `repeat(2, 1fr)` at ≤480px. Preset thumbnails: 2-column.

---

## 10. Theme Switching

### State
```ts
uiTheme: 'classic' | 'v2'    // in UIState
v2ActiveTab: 'shape' | 'style' | 'export'  // separate from v1 activeTab
```

Persisted to `localStorage` key `pf2-ui-theme`.

### Root Rendering
```tsx
{uiTheme === 'v2' ? <AppUIv2 /> : <AppUI />}
```
`AppUIv2` lazy-loaded via `React.lazy()`.

### Access Points
- Settings Modal → "UI Theme" dropdown
- Both UIs can switch to the other

---

## 11. File Structure

```
src/ui/
  AppUI.tsx              ← existing (UNTOUCHED)
  AppUI.css
  v2/
    AppUIv2.tsx          ← new root (lazy-loaded)
    AppUIv2.css          ← v2 tokens + global styles
    fonts.css            ← @font-face declarations
    motion.css           ← @keyframes + reduced motion
    layout/
      SidebarV2.tsx
      SidebarV2.css
      ToolbarV2.tsx
      ToolbarV2.css
      StatusFooter.tsx
      StatusFooter.css
    tabs/
      ShapeTab.tsx
      ShapeTab.css
      StyleTab.tsx
      StyleTab.css
      ExportTab.tsx
      ExportTab.css
    controls/
      SliderV2.tsx
      SliderV2.css
      SectionV2.tsx
      SectionV2.css
      ButtonV2.tsx
      ButtonV2.css
      SelectV2.tsx
      SelectV2.css
    shared/
      Announcer.tsx
      CameraPopover.tsx
      CameraPopover.css
      LibraryDrawer.tsx
      LibraryDrawer.css
    onboarding/         ← should-have (v2.1)
      WelcomeCard.tsx
      Spotlight.tsx
      useConfidence.ts
      useFirstRun.ts
```

---

## 12. Dependencies

### New (1 package)
- `@radix-ui/react-focus-scope` (~3KB gzipped)

### New Assets
- Fraunces (Google Fonts, variable, self-hosted)
- Satoshi (Fontshare, free license, self-hosted)
- IBM Plex Mono (Google Fonts, self-hosted)

### Performance Budget
- v2 JS: ~8-12KB gzipped (lazy-loaded — v1 users pay zero)
- v2 CSS: ~5-8KB gzipped
- Fonts: ~80-120KB (preloaded in index.html)
- Total delta: <25KB excluding fonts (fonts only loaded for v2 users)

---

## 13. What's Deferred

| Feature | Target | Reason |
|---|---|---|
| Light mode | v2.1 | Doubles QA surface. Dark ships first. |
| Sound design | v2.2+ | Nice-to-have. Opt-in oscillators, zero bundle cost. |
| Export progress callbacks | v2.1 | Requires `ParametricExportComputer.compute()` refactor. Not blocking. |
| Sidebar backdrop-filter | v2.1 | Needs multi-GPU WebGPU canvas readback testing. |
| Landscape mobile drawer | v2.2+ | Significant behavior change. Separate component needed. |

---

## 14. Implementation Plan

5 phases, 16 atomic changesets. Each phase has a merge gate.

| Phase | Changesets | Gate |
|---|---|---|
| **0: Foundation** | Tokens, fonts, motion CSS, state additions, theme plumbing, dep install | v2 stub renders, v1 untouched, tests pass |
| **1: Components** | SliderV2, SectionV2, ButtonV2, SelectV2, Announcer | Components render in isolation, unit tests pass |
| **2: Layout** | SidebarV2, StatusFooter, ToolbarV2, wire AppUIv2 | Full layout renders, tab switching works |
| **3: Tabs** | ShapeTab, StyleTab, ExportTab with store bindings | All parameters functional, presets & exports work |
| **4: Features** | Export progress, keyboard shortcuts, CameraPopover, LibraryDrawer, progressive disclosure | All must-haves functional |
| **5: Polish** | Reduced motion audit, contrast corrections, integration tests, bundle check | Ship: Playwright screenshots, <25KB gzip, all tests green |

---

*This document supersedes all previous UI v2 design documents.*  
*Implementation authority: Master Approved, 2026-03-06.*
