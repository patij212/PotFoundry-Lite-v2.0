# PotFoundry UI v2 — Soft Luxury Redesign

**Date**: 2026-03-06
**Status**: Design — pending approval

## Goal

Build a parallel "v2" UI for PotFoundry with a soft luxury / editorial aesthetic and restructured information architecture. The existing UI remains intact and selectable via a settings toggle.

## Core Decisions

1. **Full parallel layout** — new `AppUIv2` component tree alongside existing `AppUI`
2. **Tab-centric sidebar** — three tabs (Shape / Style / Export) replace 7 stacked sections
3. **Parametric export elevated** — default pipeline, no checkbox archaeology
4. **Camera in toolbar** — popover flyout, not in sidebar
5. **Library as overlay** — full-screen drawer/modal triggered from toolbar
6. **Zero modifications to existing UI** — purely additive

## Visual Identity

### Typography
- **Display**: Fraunces (variable serif, optical-size) — wordmark, section headings
- **Body**: Satoshi (geometric sans) — labels, descriptions, buttons, tab labels
- **Mono**: IBM Plex Mono — numeric values, stats, status bar

### Color Palette

```css
/* Backgrounds */
--pf2-bg-base:      #0f0f12;
--pf2-bg-surface:   #16161b;
--pf2-bg-elevated:  #1e1e25;
--pf2-bg-hover:     #26262f;

/* Text */
--pf2-text-primary:   #f5f0e8;  /* warm cream */
--pf2-text-secondary: #9a9590;
--pf2-text-muted:     #5c5753;

/* Accents */
--pf2-accent:         #b4975a;  /* muted gold */
--pf2-accent-hover:   #c9ab6e;
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

## Layout Architecture

### Sidebar (340px default, resizable)

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
│  ▲ 12.4k △ · 6.2k ◇ · 42ms        │  Compact stats
│  ┌────────────────────────────────┐  │
│  │    ▼  Download STL             │  │  Gold CTA (persistent)
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### Shape Tab
- **Presets**: 3 featured thumbnails, horizontal scroll, "Browse All" link
- **Size group**: Height, Top Diameter, Bottom Diameter
- **Thickness group**: Wall, Bottom
- **Features group**: Drain Hole, Flare
- **Bell & Twist**: collapsed by default (less common)

### Style Tab
- **Style selector**: dropdown with style name + description
- **Style parameters**: dynamic sliders from schema
- **Advanced Parameters**: collapsed sub-section
- **Appearance group**: color preset swatches + 3 custom pickers + gradient preview
- **Display toggles**: Wireframe, Inner surface
- **Lighting presets**: horizontal chip row
- **Background**: preset swatches + collapsed custom colors + angle slider

### Export Tab
- **Quality profiles**: visual card grid (Draft / Standard / High / Ultra) with triangle estimates
- **Format selector**: STL (Binary) / 3MF radio group
- **Pipeline selector**: Parametric (pre-selected, labeled "Best Quality") / GPU Grid / Legacy CPU
- **Advanced Settings**: collapsed — pipeline tuning params, feature detection toggles, debug overlays (absorbs ExportDialog Pipeline + Debug tab content)
- **Auth/tier banner**: compact, only when relevant
- **Stats line**: triangle count, file size estimate, generation time

### Persistent Footer
Always visible across all tabs:
- Compact stats line (monospace)
- Full-width Download button (gold accent)
- Button states: "Download STL" / "Sign In to Export" / "Generating... X%" / "Limit Reached"

### Toolbar (Slimmed)
**Keeps**: Menu toggle, Reset Camera, Auto-Rotate, Screenshot, Help, Save/Load JSON, Fullscreen
**Removes**: Camera Mode, Projection, Grid (moved to camera popover)
**Adds**: Camera popover button (opens flyout with preset grid + Arcball/Ortho/Grid toggles), Library button (opens overlay)

### Camera Popover
Toolbar button opens a floating popover:
- 3×2 preset grid (Front/Back/Left/Right/Top/Iso)
- Toggle row: Auto-Rotate, Arcball, Ortho, Grid
- Reset View button
- Keyboard hints (R, G, P, O)

### Library Drawer
Full-screen overlay (triggered from toolbar):
- Search + style filter (dynamic from STYLE_REGISTRY)
- Design grid with thumbnails
- Load/Download actions
- Publish section (auth-gated)

## Theme Switching

### State
```ts
// ui slice addition
uiTheme: 'classic' | 'v2'
```

Persisted to localStorage so the choice survives reloads.

### Root Rendering
```tsx
// App.tsx
{uiTheme === 'v2' ? <AppUIv2 /> : <AppUI />}
```

### Access Points
- Existing Settings Modal → new "UI Theme" dropdown
- v2 sidebar header → settings icon with theme toggle
- Both UIs can switch to the other

## File Structure

```
src/ui/
  AppUI.tsx              ← existing (UNTOUCHED)
  AppUI.css
  v2/
    AppUIv2.tsx          ← new root
    AppUIv2.css          ← v2 tokens + global v2 styles
    fonts.css            ← @font-face declarations (Fraunces, Satoshi, IBM Plex Mono)
    layout/
      SidebarV2.tsx      ← tab-centric sidebar
      SidebarV2.css
      ToolbarV2.tsx      ← slimmed toolbar
      ToolbarV2.css
      StatusFooter.tsx   ← persistent download + stats
      StatusFooter.css
    tabs/
      ShapeTab.tsx       ← dimensions + presets
      ShapeTab.css
      StyleTab.tsx       ← style + appearance + lighting + background
      StyleTab.css
      ExportTab.tsx      ← quality + format + pipeline + advanced
      ExportTab.css
    controls/
      SliderV2.tsx       ← v2-styled slider (gold track, Satoshi labels)
      SliderV2.css
      SectionV2.tsx      ← v2-styled collapsible
      SectionV2.css
      ButtonV2.tsx       ← v2-styled button (gold accent)
      ButtonV2.css
      SelectV2.tsx       ← v2-styled select
      SelectV2.css
    shared/
      CameraPopover.tsx  ← toolbar camera flyout
      CameraPopover.css
      LibraryDrawer.tsx  ← full-screen library overlay
      LibraryDrawer.css
```

## Shared vs. New Components

| Component | Approach |
|---|---|
| Zustand store + hooks | **Shared** — same state |
| Auth context / modals | **Shared** — same auth flow |
| Export hooks (useParametricExport, etc.) | **Shared** — same pipeline logic |
| Toast system | **Shared** |
| ConsoleOverlay (debug) | **Shared** |
| DesignThumbnail | **Shared** |
| Slider / Button / Section / Select | **New v2 variants** — same Radix primitives, new styling |
| Sidebar / Toolbar / StatusBar | **New** — completely different structure |
| ExportPanel / ExportDialog | **New** — merged into ExportTab |

## UX Bug Fixes (applied to v2 only)

These issues in the current UI are fixed by the new architecture:

1. **Parametric export buried** → now default pipeline selection in Export tab
2. **ExportDialog design language mismatch** → eliminated, content absorbed into Export tab with v2 tokens
3. **CSS token inconsistencies** → single `--pf2-*` token system
4. **alert() for export errors** → uses Toast system
5. **7 scrollable sections** → 3 tabs, ~60% less visible content at any time
6. **Library style filter hardcoded** → driven from STYLE_REGISTRY
7. **Duplicate renderer selector** → single location in settings
8. **Boolean style params render null** → v2 StyleTab renders toggle for booleans

## Mobile Strategy

Same breakpoint (≤ 480px) triggers mobile layout:
- SidebarV2 renders as MobileBottomSheetV2 (same three tabs)
- ToolbarV2 moves to bottom strip
- CameraPopover becomes a bottom sheet sub-panel
- LibraryDrawer is already full-screen, works as-is

## Performance Considerations

- Fonts loaded via `<link rel="preload">` in index.html (not CSS @import)
- v2 component tree is lazy-loaded (`React.lazy`) so classic UI users pay no bundle cost
- No new runtime dependencies — reuses existing Radix UI primitives
- CSS is co-located per component, no global style conflicts

## Out of Scope

- Modifying the existing AppUI (v1) code
- Changing the renderer or export pipeline logic
- Mobile-specific optimizations beyond the existing bottom sheet pattern
- New auth flows or pricing UI changes
- Debug console redesign (functional tool, aesthetic doesn't matter)
