# Generator Phase 2 — Layout Components for PotFoundry UI v2

**Date**: 2026-03-06  
**Round**: Generator Phase 2  
**Status**: Proposal — awaiting Verifier critique  
**Depends on**: Phase 0 (Foundation) — COMPLETE, Phase 1 (Components) — COMPLETE  

---

## Problem Statement

Phase 1 delivered all 5 atomic components: `ButtonV2`, `IconButtonV2`, `SectionV2`, `SelectV2`, `SliderV2`, and `AnnouncerProvider`. Phase 2 must deliver the **layout shell** — the structural skeleton that positions these components into a usable application:

1. **SidebarV2** — Resizable panel with 3-tab navigation (Shape/Style/Export), placeholder tab content
2. **StatusFooter** — Persistent stats bar + Download button, lives at the sidebar bottom
3. **ToolbarV2** — Floating top toolbar with quick actions (camera, save/load, fullscreen, zen)
4. **AppUIv2 rewrite** — Wire everything together, replacing the stub with the real layout

Without these, Phase 3 (Tabs) has no container to render into.

---

## Root Cause Analysis

The current `AppUIv2.tsx` is a minimal stub with hardcoded inline styles and a "Switch to Classic UI" button. It accepts no `children`, renders no layout structure, and provides no tab navigation. Every aspect must be replaced.

**Key patterns from v1 to preserve (conceptually, not copy):**
- v1 `Sidebar.tsx` (L125–170): Resize via `mousedown → global mousemove/mouseup`, clamped width, `localStorage` persistence
- v1 `Toolbar.tsx` (L1–330): `useControllerMaybe()` pattern for camera ops, `window.__POTFOUNDRY_STORE__` for save/load
- v1 `AppUI.tsx` (L50–120): `children` prop for canvas injection, `ErrorBoundary` wrapping
- v1 `StatusBar.tsx`: `usePerformance()` hook, `formatNumber()` / `formatTime()` helpers

**Key differences in v2:**
- v2 sidebar has 3 tabs (Shape/Style/Export) vs v1's 2 (Design/Library) — using Radix Tabs (confirmed installed: `@radix-ui/react-tabs: ^1.1.13`)
- v2 StatusFooter lives INSIDE the sidebar (persistent at bottom) vs v1's StatusBar (separate bottom bar)
- v2 toolbar adds Zen Mode toggle + reorganized button groupings
- v2 uses `--pf2-*` tokens exclusively, gold accent palette, branded motion
- v2 has zen mode: when `zenMode === true`, sidebar hides, toolbar stays

---

## Proposals

### Proposal 1: Complete Layout Implementation (Recommended)

**Idea**: Deliver all 4 files simultaneously with full Phase 2 scope. Each component is self-contained with its own CSS file. Tab content is deliberately **placeholder-only** to respect the Phase 2/3 boundary.

**Assumptions** (for Verifier to attack):
1. `@radix-ui/react-tabs` is installed and available (CONFIRMED in `package.json` line 29)
2. `useAppStore` selectors for `v2ActiveTab`, `setV2ActiveTab`, `zenMode`, `toggleZenMode` are functional (CONFIRMED in `src/state/slices/ui.ts`)
3. `useControllerMaybe()` from `../../context` provides the controller interface (CONFIRMED in `src/context/ControllerContext.tsx`)
4. `usePerformance()` from `../../state` returns `{ triangleCount, vertexCount, generationTime, volume, isGenerating }` (CONFIRMED in `src/state/store.ts` line 146, types at `src/state/types.ts` line 316)
5. `AnnouncerProvider` from Phase 1 is available at `../shared/Announcer` (CONFIRMED)
6. `ButtonV2` and `IconButtonV2` from Phase 1 are available at `../controls/ButtonV2` (CONFIRMED)
7. The `HelpDialog` from v1 shared is accessible from `../../shared/HelpDialog` for reuse (CONFIRMED export at line 115)
8. Keyboard shortcuts (`Z` for zen, `Alt+1/2/3` for tabs) should be scoped to `uiTheme === 'v2'` — implemented via `useEffect` keydown listeners inside `AppUIv2`
9. The v1 `useToast()` hook is available from `../../shared` for save/load feedback

---

## File-by-File Implementation

---

### FILE: `src/ui/v2/layout/SidebarV2.tsx`

```tsx
/**
 * SidebarV2 — Resizable left sidebar with 3-tab navigation.
 *
 * Features:
 * - Three tabs: Shape / Style / Export (via Radix Tabs)
 * - Resizable width with localStorage persistence
 * - Zen mode aware (hidden when zenMode === true)
 * - Close button that sets panelOpen to false
 * - Tab switching synced to Zustand store
 *
 * @module ui/v2/layout/SidebarV2
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { X, GripVertical, Layers, Paintbrush, Download } from 'lucide-react';
import { IconButtonV2 } from '../controls/ButtonV2';
import { StatusFooter } from './StatusFooter';
import { useAppStore } from '../../../state';
import { useAnnounce } from '../shared/Announcer';
import clsx from 'clsx';
import './SidebarV2.css';

// ============================================================================
// Constants
// ============================================================================

const SIDEBAR_WIDTH_KEY = 'pf2-sidebar-width';
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 320;
const MAX_WIDTH_CAP = 480;
const getMaxWidth = () => Math.min(MAX_WIDTH_CAP, window.innerWidth * 0.45);

// Tab configuration — ids must match V2Tab type ('shape' | 'style' | 'export')
const TAB_CONFIG = [
  { id: 'shape' as const, label: 'Shape', icon: Layers },
  { id: 'style' as const, label: 'Style', icon: Paintbrush },
  { id: 'export' as const, label: 'Export', icon: Download },
] as const;

// ============================================================================
// Component
// ============================================================================

export const SidebarV2: React.FC = () => {
  const panelOpen = useAppStore((s) => s.ui.panelOpen);
  const zenMode = useAppStore((s) => s.ui.zenMode);
  const activeTab = useAppStore((s) => s.ui.v2ActiveTab);
  const setV2ActiveTab = useAppStore((s) => s.setV2ActiveTab);
  const setPanelOpen = useAppStore((s) => s.setPanelOpen);
  const announce = useAnnounce();

  // Resizable width
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH;
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (!saved) return DEFAULT_WIDTH;
    const parsed = parseInt(saved, 10);
    if (Number.isNaN(parsed)) return DEFAULT_WIDTH;
    return Math.max(MIN_WIDTH, Math.min(getMaxWidth(), parsed));
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleResizeMove = (e: MouseEvent) => {
      const newWidth = Math.max(MIN_WIDTH, Math.min(getMaxWidth(), e.clientX));
      setWidth(newWidth);
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
      setWidth((w) => {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, w.toString());
        return w;
      });
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Update max width on window resize
  useEffect(() => {
    const handleWindowResize = () => {
      const maxW = getMaxWidth();
      setWidth((prev) => (prev > maxW ? maxW : prev));
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  // Tab change handler
  const handleTabChange = useCallback(
    (value: string) => {
      const tab = value as 'shape' | 'style' | 'export';
      setV2ActiveTab(tab);
      const label = TAB_CONFIG.find((t) => t.id === tab)?.label ?? tab;
      announce(`${label} tab selected`);
    },
    [setV2ActiveTab, announce]
  );

  // Close handler
  const handleClose = useCallback(() => {
    setPanelOpen(false);
  }, [setPanelOpen]);

  // Hidden in zen mode or when panel is closed
  if (zenMode || !panelOpen) return null;

  return (
    <aside
      ref={sidebarRef}
      className={clsx('pf2-sidebar', isResizing && 'pf2-sidebar--resizing')}
      style={{ width: `${width}px` }}
      aria-label="Design controls"
    >
      {/* Header */}
      <header className="pf2-sidebar__header">
        <div className="pf2-sidebar__title">
          <h2 className="pf2-text-display">PotFoundry</h2>
          <span className="pf2-sidebar__version pf2-text-mono">v2</span>
        </div>
        <IconButtonV2
          icon={<X size={18} />}
          aria-label="Close panel"
          onClick={handleClose}
          size="sm"
        />
      </header>

      {/* Tabbed Navigation */}
      <Tabs.Root
        className="pf2-sidebar__tabs-root"
        value={activeTab}
        onValueChange={handleTabChange}
      >
        <Tabs.List className="pf2-sidebar__tab-list" aria-label="Sidebar sections">
          {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
            <Tabs.Trigger
              key={id}
              className="pf2-sidebar__tab pf2-focus-ring"
              value={id}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* Tab Content — placeholder for Phase 2, real content in Phase 3 */}
        <div className="pf2-sidebar__content">
          <Tabs.Content className="pf2-sidebar__tab-content" value="shape" forceMount={false}>
            <div className="pf2-sidebar__placeholder">
              <h3 className="pf2-text-label">Shape Parameters</h3>
              <p className="pf2-text-body pf2-sidebar__placeholder-text">
                Dimensions, thickness, and features — coming in Phase 3.
              </p>
            </div>
          </Tabs.Content>

          <Tabs.Content className="pf2-sidebar__tab-content" value="style" forceMount={false}>
            <div className="pf2-sidebar__placeholder">
              <h3 className="pf2-text-label">Style Controls</h3>
              <p className="pf2-text-body pf2-sidebar__placeholder-text">
                Style selection, parameters, and appearance — coming in Phase 3.
              </p>
            </div>
          </Tabs.Content>

          <Tabs.Content className="pf2-sidebar__tab-content" value="export" forceMount={false}>
            <div className="pf2-sidebar__placeholder">
              <h3 className="pf2-text-label">Export Settings</h3>
              <p className="pf2-text-body pf2-sidebar__placeholder-text">
                Quality presets, format selection, and pipeline options — coming in Phase 3.
              </p>
            </div>
          </Tabs.Content>
        </div>
      </Tabs.Root>

      {/* Persistent Footer */}
      <StatusFooter />

      {/* Resize Handle */}
      <div
        className="pf2-sidebar__resize-handle"
        onMouseDown={handleResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH_CAP}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            setWidth((w) => {
              const next = Math.max(MIN_WIDTH, w - 10);
              localStorage.setItem(SIDEBAR_WIDTH_KEY, next.toString());
              return next;
            });
          } else if (e.key === 'ArrowRight') {
            setWidth((w) => {
              const next = Math.min(getMaxWidth(), w + 10);
              localStorage.setItem(SIDEBAR_WIDTH_KEY, next.toString());
              return next;
            });
          }
        }}
      >
        <GripVertical size={12} aria-hidden="true" />
      </div>
    </aside>
  );
};
```

#### Rationale — SidebarV2

1. **Radix Tabs over custom buttons**: Confirmed `@radix-ui/react-tabs@^1.1.13` in `package.json`. Radix gives us proper `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, arrow-key navigation, and focus management for free. Zero reason to build custom tab logic.

2. **Resize pattern**: Same global `mousemove/mouseup` pattern as v1, but refactored — the event listeners are inside a single `useEffect` gated on `isResizing`, so they're properly cleaned up. The v1 version had separate `handleResizeMove` and `handleResizeEnd` callbacks recreated on rerenders; this version captures them in the effect closure.

3. **Keyboard resize**: The drag handle has `role="separator"` with `aria-orientation="vertical"` per the WAI-ARIA separator pattern, plus `ArrowLeft/ArrowRight` keyboard support for keyboard-accessible resizing.

4. **Zen mode + panelOpen**: Both `zenMode` and `!panelOpen` cause the sidebar to return `null`. This is correct per spec: zen mode hides sidebar, close button sets `panelOpen: false`.

5. **Tab change announcement**: Every tab switch announces via the ARIA announcer ("Shape tab selected") for screen reader users.

6. **forceMount={false}**: Radix Tabs `Content` only renders when active. This avoids mounting placeholder content for all 3 tabs simultaneously.

7. **Placeholder content**: Deliberately minimal — just a label and "coming in Phase 3" text. Phase 3 will replace the content children, not the tab infrastructure.

8. **StatusFooter placement**: Renders after the tab content, outside the `Tabs.Root`, making it persistent across all tabs as specified.

**Assumptions for Verifier:**
1. Radix `Tabs.Trigger` accepts a `className` prop and renders a `<button>` by default — correct per Radix docs.
2. The `forceMount={false}` (actually default) behavior of `Tabs.Content` unmounts inactive tabs — verified in Radix Tabs docs.
3. `localStorage` is synchronously readable during state initialization — standard browser behavior.
4. The `useAnnounce` import path resolves from `../shared/Announcer` — consistent with Phase 1 file structure.

---

### FILE: `src/ui/v2/layout/SidebarV2.css`

```css
/* ============================================================================
   SidebarV2 — Resizable left sidebar with tabs
   ============================================================================ */

.pf2-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  height: 100dvh;
  z-index: var(--pf2-z-panel);
  display: flex;
  flex-direction: column;
  background: rgba(15, 15, 18, 0.96);
  border-right: 1px solid var(--pf2-border);
  animation: pf2-slide-in var(--pf2-duration-slow) var(--pf2-ease-enter) both;
  overflow: hidden;
}

@supports (backdrop-filter: blur(12px)) {
  .pf2-sidebar {
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
}

.pf2-sidebar--resizing {
  transition: none;
  user-select: none;
}

/* ============================================================================
   Header
   ============================================================================ */

.pf2-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--pf2-space-xl) var(--pf2-space-xl) var(--pf2-space-lg);
  flex-shrink: 0;
}

.pf2-sidebar__title {
  display: flex;
  align-items: baseline;
  gap: var(--pf2-space-sm);
}

.pf2-sidebar__title h2 {
  font-size: 20px;
  font-weight: 400;
  margin: 0;
  color: var(--pf2-text-primary);
}

.pf2-sidebar__version {
  font-size: 11px;
  color: var(--pf2-text-muted);
}

/* ============================================================================
   Tab Navigation
   ============================================================================ */

.pf2-sidebar__tabs-root {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.pf2-sidebar__tab-list {
  display: flex;
  padding: 0 var(--pf2-space-xl);
  gap: var(--pf2-space-xs);
  border-bottom: 1px solid var(--pf2-border);
  flex-shrink: 0;
}

.pf2-sidebar__tab {
  display: flex;
  align-items: center;
  gap: var(--pf2-space-sm);
  padding: var(--pf2-space-md) var(--pf2-space-lg);
  font-family: var(--pf2-font-body);
  font-size: 13px;
  font-weight: 500;
  color: var(--pf2-text-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition:
    color var(--pf2-duration-micro) var(--pf2-ease-move),
    border-color var(--pf2-duration-micro) var(--pf2-ease-move);
  /* Offset the parent border-bottom by 1px so active indicator overlaps */
  margin-bottom: -1px;
}

.pf2-sidebar__tab:hover {
  color: var(--pf2-text-primary);
}

.pf2-sidebar__tab[data-state='active'] {
  color: var(--pf2-accent);
  border-bottom-color: var(--pf2-accent);
}

/* ============================================================================
   Tab Content
   ============================================================================ */

.pf2-sidebar__content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--pf2-space-xl);
  /* Custom scrollbar for dark theme */
  scrollbar-width: thin;
  scrollbar-color: var(--pf2-bg-hover) transparent;
}

.pf2-sidebar__content::-webkit-scrollbar {
  width: 6px;
}

.pf2-sidebar__content::-webkit-scrollbar-track {
  background: transparent;
}

.pf2-sidebar__content::-webkit-scrollbar-thumb {
  background: var(--pf2-bg-hover);
  border-radius: 3px;
}

.pf2-sidebar__tab-content {
  animation: pf2-tab-enter var(--pf2-duration-normal) var(--pf2-ease-enter) both;
}

/* ============================================================================
   Placeholder Content
   ============================================================================ */

.pf2-sidebar__placeholder {
  display: flex;
  flex-direction: column;
  gap: var(--pf2-space-sm);
  padding: var(--pf2-space-lg);
  background: var(--pf2-bg-elevated);
  border-radius: var(--pf2-radius-md);
  border: 1px solid var(--pf2-border);
}

.pf2-sidebar__placeholder-text {
  font-size: 13px;
  color: var(--pf2-text-muted);
  margin: 0;
  line-height: 1.5;
}

/* ============================================================================
   Resize Handle
   ============================================================================ */

.pf2-sidebar__resize-handle {
  position: absolute;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ew-resize;
  color: var(--pf2-text-muted);
  opacity: 0;
  transition: opacity var(--pf2-duration-micro) var(--pf2-ease-move);
  z-index: 1;
}

.pf2-sidebar:hover .pf2-sidebar__resize-handle,
.pf2-sidebar__resize-handle:focus-visible {
  opacity: 1;
}

.pf2-sidebar__resize-handle:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--pf2-bg-surface),
    0 0 0 4px var(--pf2-accent);
}

/* ============================================================================
   High Contrast
   ============================================================================ */

@media (forced-colors: active) {
  .pf2-sidebar {
    border-right: 1px solid ButtonText;
    background: Canvas;
  }

  .pf2-sidebar__tab[data-state='active'] {
    border-bottom-color: Highlight;
    color: Highlight;
  }

  .pf2-sidebar__resize-handle {
    opacity: 1;
  }
}
```

#### Rationale — SidebarV2 CSS

1. **`100dvh`**: Using `100dvh` as a fallback after `100vh` for mobile browsers where the toolbar takes height. Progressive enhancement.

2. **`rgba(15, 15, 18, 0.96)`**: Per spec — nearly opaque dark background. The `backdrop-filter: blur(12px)` is gated behind `@supports` as a progressive enhancement per the consolidated spec.

3. **Gold underline tabs**: The active tab indicator is a `border-bottom: 2px solid var(--pf2-accent)` gold line, which uses Radix's `[data-state='active']` selector — no JS class toggling needed.

4. **Scrollbar styling**: Thin dark scrollbar matching the UI theme. Dual approach: `scrollbar-width: thin` for Firefox + `::-webkit-scrollbar` for Chrome/Safari.

5. **Resize handle**: Hidden by default (`opacity: 0`), visible on sidebar hover. This is a luxury UI touch — the handle doesn't clutter the interface until the user hovers near the edge.

6. **Animation**: Uses `pf2-slide-in` from `motion.css` for entry. The `pf2-tab-enter` animation fires on each tab content mount for directional crossfade.

---

### FILE: `src/ui/v2/layout/StatusFooter.tsx`

```tsx
/**
 * StatusFooter — Persistent stats bar and download button.
 *
 * Lives at the bottom of SidebarV2, visible across all tabs.
 * Displays mesh stats (tris, verts, generation time) and a full-width
 * Download button. Export progress will be wired in Phase 3/4.
 *
 * @module ui/v2/layout/StatusFooter
 */

import React, { useMemo } from 'react';
import { Triangle, Box, Activity, Download } from 'lucide-react';
import { ButtonV2 } from '../controls/ButtonV2';
import { usePerformance } from '../../../state';
import './StatusFooter.css';

// ============================================================================
// Helpers
// ============================================================================

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatTime(ms: number): string {
  if (ms < 1) return '<1 ms';
  return `${Math.round(ms)} ms`;
}

// ============================================================================
// Component
// ============================================================================

export const StatusFooter: React.FC = () => {
  const performance = usePerformance();

  const stats = useMemo(
    () => ({
      triangles: formatNumber(performance.triangleCount),
      vertices: formatNumber(performance.vertexCount),
      genTime: formatTime(performance.generationTime),
    }),
    [performance.triangleCount, performance.vertexCount, performance.generationTime]
  );

  return (
    <footer className="pf2-status-footer">
      {/* Stats line */}
      <div
        className="pf2-status-footer__stats pf2-text-mono"
        role="status"
        aria-live="polite"
        aria-label={`Mesh: ${stats.triangles} triangles, ${stats.vertices} vertices, generated in ${stats.genTime}`}
      >
        <span className="pf2-status-footer__stat">
          <Triangle size={11} aria-hidden="true" />
          {stats.triangles}
        </span>
        <span className="pf2-status-footer__divider" aria-hidden="true">·</span>
        <span className="pf2-status-footer__stat">
          <Box size={11} aria-hidden="true" />
          {stats.vertices}
        </span>
        <span className="pf2-status-footer__divider" aria-hidden="true">·</span>
        <span className="pf2-status-footer__stat">
          <Activity size={11} aria-hidden="true" />
          {stats.genTime}
        </span>
        {performance.isGenerating && (
          <span className="pf2-status-footer__generating" aria-label="Generating mesh">
            <span className="pf2-status-footer__spinner" aria-hidden="true" />
          </span>
        )}
      </div>

      {/* Export progress placeholder — will be wired in Phase 3/4 */}
      <div
        className="pf2-status-footer__progress"
        role="progressbar"
        aria-valuenow={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Export progress"
        style={{ display: 'none' }}
      >
        <div className="pf2-status-footer__progress-bar" />
      </div>

      {/* Download button */}
      <ButtonV2
        variant="primary"
        fullWidth
        iconLeft={<Download size={16} />}
        aria-label="Download STL file"
      >
        Download STL
      </ButtonV2>
    </footer>
  );
};
```

#### Rationale — StatusFooter

1. **Inside the sidebar**: Per spec, this is NOT a standalone bottom bar like v1's `StatusBar`. It renders as the last child inside `SidebarV2`, after the tab content, using `flex-shrink: 0` so it never scrolls away.

2. **Progress bar hidden**: The `role="progressbar"` element is present in the DOM but `display: none` for Phase 2. Phase 3/4 will wire actual export progress. This ensures the ARIA structure is ready without rendering invisible elements.

3. **ButtonV2 reuse**: Uses the Phase 1 `ButtonV2` with `variant="primary"` and `fullWidth` — gold accent, full-width, matching the spec's "Gold CTA (persistent)".

4. **No export wiring**: The Download button has NO `onClick` handler in Phase 2. It's a visual placeholder. Phase 3 will connect `useExport().exportSTL()`.

5. **Monospace stats**: The stats line uses `pf2-text-mono` class for IBM Plex Mono numerals per spec.

6. **Selective dependency tracking**: `useMemo` depends on the three specific performance values, not the entire `performance` object. This prevents re-renders when unrelated performance metrics change (e.g., `volume`, `surfaceArea`).

**Assumptions for Verifier:**
1. `usePerformance()` returns an object with at least `{ triangleCount, vertexCount, generationTime, isGenerating }` — confirmed in state types.
2. `ButtonV2` accepts `fullWidth` and `iconLeft` props — confirmed in Phase 1 implementation.
3. The progress bar `display: none` doesn't interfere with ARIA tree parsing — acceptable per ARIA spec (hidden elements are excluded from accessibility tree).

---

### FILE: `src/ui/v2/layout/StatusFooter.css`

```css
/* ============================================================================
   StatusFooter — Persistent sidebar footer with stats + download
   ============================================================================ */

.pf2-status-footer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--pf2-space-md);
  padding: var(--pf2-space-lg) var(--pf2-space-xl);
  border-top: 1px solid var(--pf2-border);
  background: var(--pf2-bg-surface);
}

/* ============================================================================
   Stats Line
   ============================================================================ */

.pf2-status-footer__stats {
  display: flex;
  align-items: center;
  gap: var(--pf2-space-sm);
  font-size: 11px;
  color: var(--pf2-text-secondary);
  flex-wrap: wrap;
}

.pf2-status-footer__stat {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.pf2-status-footer__stat svg {
  opacity: 0.6;
}

.pf2-status-footer__divider {
  color: var(--pf2-text-muted);
  font-size: 10px;
}

.pf2-status-footer__generating {
  display: inline-flex;
  align-items: center;
  margin-left: var(--pf2-space-xs);
}

.pf2-status-footer__spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--pf2-text-muted);
  border-top-color: var(--pf2-accent);
  border-radius: 50%;
  animation: pf2-spin 0.8s linear infinite;
}

@keyframes pf2-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ============================================================================
   Progress Bar (placeholder — hidden in Phase 2)
   ============================================================================ */

.pf2-status-footer__progress {
  height: 3px;
  background: var(--pf2-bg-elevated);
  border-radius: 2px;
  overflow: hidden;
}

.pf2-status-footer__progress-bar {
  height: 100%;
  background: var(--pf2-accent);
  border-radius: 2px;
  width: 0%;
  transition: width var(--pf2-duration-normal) var(--pf2-ease-move);
}

/* Shimmer effect for indeterminate state (Phase 3/4) */
.pf2-status-footer__progress--indeterminate .pf2-status-footer__progress-bar {
  width: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--pf2-accent-subtle) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: pf2-shimmer 1.5s linear infinite;
}

/* ============================================================================
   High Contrast
   ============================================================================ */

@media (forced-colors: active) {
  .pf2-status-footer {
    border-top: 1px solid ButtonText;
  }

  .pf2-status-footer__spinner {
    border-color: ButtonText;
    border-top-color: Highlight;
  }
}
```

---

### FILE: `src/ui/v2/layout/ToolbarV2.tsx`

```tsx
/**
 * ToolbarV2 — Floating top toolbar with quick actions.
 *
 * Top-center floating bar with camera controls, save/load, fullscreen,
 * and zen mode toggle. Always visible (even in zen mode per spec).
 *
 * @module ui/v2/layout/ToolbarV2
 */

import React, { useState, useCallback } from 'react';
import {
  Menu,
  Maximize,
  Minimize,
  Camera,
  RotateCcw,
  Save,
  FolderOpen,
  HelpCircle,
  RefreshCw,
  Shrink,
  Expand,
} from 'lucide-react';
import { IconButtonV2 } from '../controls/ButtonV2';
import { useAppStore } from '../../../state';
import { useControllerMaybe } from '../../../context';
import { HelpDialog } from '../../shared/HelpDialog';
import clsx from 'clsx';
import './ToolbarV2.css';

// ============================================================================
// Component
// ============================================================================

export const ToolbarV2: React.FC = () => {
  const panelOpen = useAppStore((s) => s.ui.panelOpen);
  const fullscreen = useAppStore((s) => s.ui.fullscreen);
  const zenMode = useAppStore((s) => s.ui.zenMode);
  const togglePanel = useAppStore((s) => s.togglePanel);
  const toggleFullscreen = useAppStore((s) => s.toggleFullscreen);
  const toggleZenMode = useAppStore((s) => s.toggleZenMode);
  const controller = useControllerMaybe();
  const [helpOpen, setHelpOpen] = useState(false);

  const isControllerReady = controller?.isReady ?? false;

  // Camera controls
  const handleResetCamera = useCallback(() => {
    if (controller?.isReady) controller.resetCamera();
  }, [controller]);

  const handleToggleAutoRotate = useCallback(() => {
    if (controller?.isReady) controller.toggleAutoRotate();
  }, [controller]);

  const handleScreenshot = useCallback(async () => {
    if (!controller?.isReady) return;
    const blob = await controller.takeScreenshot();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `potfoundry-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [controller]);

  // Save design as JSON
  const handleSave = useCallback(() => {
    const store = (window as unknown as { __POTFOUNDRY_STORE__?: { getState: () => Record<string, unknown> } })
      .__POTFOUNDRY_STORE__;
    if (!store) return;

    const state = store.getState() as {
      geometry: unknown;
      style: { name: string; opts?: unknown };
      appearance: {
        colorScheme: unknown;
        primaryColor: unknown;
        midColor: unknown;
        secondaryColor: unknown;
        showInner: unknown;
        showWireframe: unknown;
        gradient: unknown;
        lightingPreset: unknown;
      };
    };

    const designData = {
      version: '2.1',
      timestamp: Date.now(),
      name: 'PotFoundry Design',
      geometry: state.geometry,
      style: state.style,
      appearance: {
        colorScheme: state.appearance.colorScheme,
        primaryColor: state.appearance.primaryColor,
        midColor: state.appearance.midColor,
        secondaryColor: state.appearance.secondaryColor,
        showInner: state.appearance.showInner,
        showWireframe: state.appearance.showWireframe,
        gradient: state.appearance.gradient,
        lightingPreset: state.appearance.lightingPreset,
      },
    };

    const json = JSON.stringify(designData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PotFoundry_${(state.style as { name?: string }).name ?? 'design'}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Load design from JSON
  const handleLoad = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const designData = JSON.parse(text) as {
          version?: string;
          geometry?: Record<string, unknown>;
          style?: { name: string; opts?: Record<string, unknown> };
          appearance?: Record<string, unknown>;
        };

        if (!designData.version || !designData.geometry || !designData.style) {
          console.warn('Invalid design file format');
          return;
        }

        const store = (window as unknown as { __POTFOUNDRY_STORE__?: { getState: () => Record<string, (...args: unknown[]) => void> } })
          .__POTFOUNDRY_STORE__;
        if (!store) return;

        const s = store.getState();

        if (designData.geometry) s.setGeometryParams(designData.geometry);
        if (designData.style) {
          s.setStyle(designData.style.name);
          if (designData.style.opts) s.setStyleOpts(designData.style.opts);
        }
        if (designData.appearance) {
          const app = designData.appearance as Record<string, unknown>;
          if (app.colorScheme) s.setColorScheme(app.colorScheme);
          if (app.primaryColor) s.setPrimaryColor(app.primaryColor);
          if (app.midColor) s.setMidColor(app.midColor);
          if (app.secondaryColor) s.setSecondaryColor(app.secondaryColor);
          if (app.showWireframe !== undefined) s.setShowWireframe(app.showWireframe);
          if (app.showInner !== undefined) s.setShowInner(app.showInner);
          if (app.gradient) s.setBackgroundGradient(app.gradient);
          if (app.lightingPreset) s.setLightingPreset(app.lightingPreset);
        }
      } catch (error) {
        console.error('Failed to load design:', error);
      }
    };

    input.click();
  }, []);

  return (
    <>
      <div className={clsx('pf2-toolbar', zenMode && 'pf2-toolbar--zen')} role="toolbar" aria-label="Quick actions">
        {/* Left group — Menu toggle */}
        <div className="pf2-toolbar__group">
          {!panelOpen && (
            <IconButtonV2
              icon={<Menu size={18} />}
              aria-label="Open panel"
              onClick={togglePanel}
            />
          )}
        </div>

        {/* Center group — Camera actions */}
        <div className="pf2-toolbar__group pf2-toolbar__group--center">
          <IconButtonV2
            icon={<RotateCcw size={16} />}
            aria-label="Reset camera"
            onClick={handleResetCamera}
            size="sm"
            disabled={!isControllerReady}
          />
          <IconButtonV2
            icon={<RefreshCw size={16} />}
            aria-label="Toggle auto-rotate"
            onClick={handleToggleAutoRotate}
            size="sm"
            disabled={!isControllerReady}
          />
          <IconButtonV2
            icon={<Camera size={16} />}
            aria-label="Take screenshot"
            onClick={handleScreenshot}
            size="sm"
            disabled={!isControllerReady}
          />
        </div>

        {/* Right group — File & View actions */}
        <div className="pf2-toolbar__group">
          <IconButtonV2
            icon={<Save size={16} />}
            aria-label="Save design"
            onClick={handleSave}
            size="sm"
          />
          <IconButtonV2
            icon={<FolderOpen size={16} />}
            aria-label="Load design"
            onClick={handleLoad}
            size="sm"
          />

          <div className="pf2-toolbar__divider" aria-hidden="true" />

          <IconButtonV2
            icon={<HelpCircle size={16} />}
            aria-label="Help and shortcuts"
            onClick={() => setHelpOpen(true)}
            size="sm"
          />
          <IconButtonV2
            icon={fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={toggleFullscreen}
            size="sm"
          />
          <IconButtonV2
            icon={zenMode ? <Expand size={16} /> : <Shrink size={16} />}
            aria-label={zenMode ? 'Exit zen mode' : 'Enter zen mode'}
            onClick={toggleZenMode}
            size="sm"
          />
        </div>
      </div>

      {/* Help Dialog — uses v1 shared component */}
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
};
```

#### Rationale — ToolbarV2

1. **`role="toolbar"`**: Per WAI-ARIA toolbar pattern. Groups interactive controls with a descriptive label.

2. **Reused save/load logic**: Same `window.__POTFOUNDRY_STORE__` pattern as v1, but with proper `unknown` type casting instead of `any`. The save/load format is backward-compatible with v1 files.

3. **HelpDialog reuse**: Imports from v1 `../../shared/HelpDialog` — this is a shared component that works independently of theme. No duplication needed.

4. **Zen mode icon**: `Shrink` (enter zen) / `Expand` (exit zen) from lucide-react. The spec says toolbar stays visible in zen mode. The `pf2-toolbar--zen` class allows visual adjustments (e.g., slightly more transparency).

5. **Menu button visibility**: Only shown when `!panelOpen` — same pattern as v1. When the sidebar is open, the close button on the sidebar itself is the toggle.

6. **Camera mode / Projection / Grid removed from toolbar**: Per spec, these move to the Camera Popover (Phase 4). Only Reset Camera, Auto-Rotate, and Screenshot remain as toolbar buttons.

7. **Divider between groups**: A vertical line separates camera/file actions from view actions for visual hierarchy.

**Assumptions for Verifier:**
1. `Shrink` and `Expand` icons exist in `lucide-react` — if not, `Minimize2`/`Maximize2` are alternatives. **Verify this.**
2. `HelpDialog` accepts `{ open: boolean; onOpenChange: (open: boolean) => void }` — confirmed from grep.
3. The `toggleZenMode` action in the store simply toggles `ui.zenMode` boolean — confirmed in `ui.ts`.
4. `useControllerMaybe()` returns `null` when outside `ControllerProvider` — confirmed in context implementation.

---

### FILE: `src/ui/v2/layout/ToolbarV2.css`

```css
/* ============================================================================
   ToolbarV2 — Floating top toolbar
   ============================================================================ */

.pf2-toolbar {
  position: fixed;
  top: var(--pf2-space-lg);
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--pf2-z-toolbar);
  display: flex;
  align-items: center;
  gap: var(--pf2-space-xs);
  padding: var(--pf2-space-xs) var(--pf2-space-sm);
  background: rgba(15, 15, 18, 0.85);
  border: 1px solid var(--pf2-border);
  border-radius: var(--pf2-radius-lg);
  box-shadow: var(--pf2-shadow-float);
  animation: pf2-fade-in var(--pf2-duration-fast) var(--pf2-ease-enter) both;
}

@supports (backdrop-filter: blur(12px)) {
  .pf2-toolbar {
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
}

/* In zen mode — slightly more transparent, subtle */
.pf2-toolbar--zen {
  opacity: 0.7;
  transition: opacity var(--pf2-duration-micro) var(--pf2-ease-move);
}

.pf2-toolbar--zen:hover {
  opacity: 1;
}

/* ============================================================================
   Button Groups
   ============================================================================ */

.pf2-toolbar__group {
  display: flex;
  align-items: center;
  gap: var(--pf2-space-xs);
}

.pf2-toolbar__group--center {
  padding: 0 var(--pf2-space-sm);
}

/* ============================================================================
   Divider
   ============================================================================ */

.pf2-toolbar__divider {
  width: 1px;
  height: 20px;
  background: var(--pf2-border);
  margin: 0 var(--pf2-space-xs);
}

/* ============================================================================
   Hover Labels (CSS-only tooltip via aria-label)
   ============================================================================ */

.pf2-toolbar .pf2-icon-button {
  position: relative;
}

.pf2-toolbar .pf2-icon-button::after {
  content: attr(aria-label);
  position: absolute;
  bottom: -32px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 8px;
  font-family: var(--pf2-font-body);
  font-size: 11px;
  font-weight: 500;
  color: var(--pf2-text-primary);
  background: var(--pf2-bg-elevated);
  border: 1px solid var(--pf2-border);
  border-radius: var(--pf2-radius-sm);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--pf2-duration-micro) var(--pf2-ease-move);
}

.pf2-toolbar .pf2-icon-button:hover::after {
  opacity: 1;
}

/* ============================================================================
   High Contrast
   ============================================================================ */

@media (forced-colors: active) {
  .pf2-toolbar {
    background: Canvas;
    border: 1px solid ButtonText;
  }

  .pf2-toolbar__divider {
    background: ButtonText;
  }

  .pf2-toolbar .pf2-icon-button::after {
    background: Canvas;
    border: 1px solid ButtonText;
  }
}
```

#### Rationale — ToolbarV2 CSS

1. **`top-center, floating`**: `position: fixed; top: 16px; left: 50%; transform: translateX(-50%)` — centered horizontally with rounded corners, floating above the viewport.

2. **CSS-only hover labels**: The spec calls for "CSS `::after` pseudo-element with `aria-label` content". Implemented via `content: attr(aria-label)` — zero JS overhead, inherently accessible (the `aria-label` is the tooltip text AND the accessible name).

3. **Zen mode fade**: In zen mode, toolbar fades to 70% opacity and restores on hover. This keeps it discoverable but non-intrusive, matching the "zen" philosophy of maximizing viewport space.

4. **Shadow**: Uses `--pf2-shadow-float` token for the floating appearance.

5. **`backdrop-filter`**: Same progressive enhancement approach as sidebar, gated behind `@supports`.

---

### FILE: `src/ui/v2/AppUIv2.tsx` (REWRITE)

```tsx
/**
 * PotFoundry UI v2 — Root Layout Component
 *
 * Wires the full v2 layout: ToolbarV2 + SidebarV2 (with StatusFooter)
 * + viewport area. Lazy-loaded via React.lazy() so v1 users pay zero
 * bundle cost.
 *
 * Keyboard shortcuts:
 * - Z: Toggle zen mode
 * - Alt+1/2/3: Switch to Shape/Style/Export tab
 *
 * @module ui/v2/AppUIv2
 */

import React, { useEffect } from 'react';
import { AnnouncerProvider } from './shared/Announcer';
import { SidebarV2 } from './layout/SidebarV2';
import { ToolbarV2 } from './layout/ToolbarV2';
import { useAppStore } from '../../state';
import './AppUIv2.css';

// ============================================================================
// Types
// ============================================================================

export interface AppUIv2Props {
  /** Children (typically the 3D canvas) */
  children?: React.ReactNode;
}

// ============================================================================
// Tab index mapping for Alt+N shortcuts
// ============================================================================

const TAB_KEYS: Record<string, 'shape' | 'style' | 'export'> = {
  '1': 'shape',
  '2': 'style',
  '3': 'export',
};

// ============================================================================
// Component
// ============================================================================

export const AppUIv2: React.FC<AppUIv2Props> = ({ children }) => {
  const toggleZenMode = useAppStore((s) => s.toggleZenMode);
  const setV2ActiveTab = useAppStore((s) => s.setV2ActiveTab);
  const uiTheme = useAppStore((s) => s.ui.uiTheme);
  const panelOpen = useAppStore((s) => s.ui.panelOpen);
  const zenMode = useAppStore((s) => s.ui.zenMode);

  // Keyboard shortcuts — only active when v2 theme is selected
  useEffect(() => {
    if (uiTheme !== 'v2') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // Z — toggle zen mode
      if (e.key === 'z' || e.key === 'Z') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          toggleZenMode();
        }
      }

      // Alt+1/2/3 — tab switching
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const tab = TAB_KEYS[e.key];
        if (tab) {
          e.preventDefault();
          setV2ActiveTab(tab);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [uiTheme, toggleZenMode, setV2ActiveTab]);

  return (
    <AnnouncerProvider>
      <div
        className="pf2-root pf2-layout"
        data-theme="dark"
        data-zen={zenMode || undefined}
        data-panel-open={panelOpen || undefined}
      >
        {/* Toolbar — always visible (even in zen mode) */}
        <ToolbarV2 />

        {/* Sidebar — hidden in zen mode, respects panelOpen */}
        <SidebarV2 />

        {/* Viewport — takes remaining space */}
        {children && (
          <main className="pf2-layout__viewport">
            {children}
          </main>
        )}
      </div>
    </AnnouncerProvider>
  );
};

export default AppUIv2;
```

#### Rationale — AppUIv2

1. **`AnnouncerProvider` at root**: Wraps the entire v2 tree so any component can call `useAnnounce()`. This is the architectural decision from Phase 1 — the provider must be at the root.

2. **Keyboard shortcuts in AppUIv2**: The Z and Alt+1/2/3 shortcuts are registered via a single `useEffect` on `document.addEventListener('keydown', ...)`. They're gated by `uiTheme === 'v2'` so they don't interfere with v1.

3. **Input filtering**: Keyboard shortcuts are suppressed when focus is in an `<input>`, `<textarea>`, `<select>`, or `contentEditable` element to prevent conflicts with text entry.

4. **`data-zen` / `data-panel-open`**: Data attributes on the root for CSS-driven layout changes. When `data-zen` is present, CSS can adjust viewport sizing. When `data-panel-open` is present, the viewport accounts for sidebar width.

5. **`children` prop**: Same pattern as v1 `AppUI` — the canvas is injected as children. The `<main>` wrapper ensures semantic HTML and provides the flex target for viewport sizing.

6. **No ErrorBoundary wrapping**: Deliberately omitted. The v1 `ErrorBoundary` is a v1 component. If needed, a v2 error boundary can be added in Phase 5 (Polish).

7. **`export default`**: Preserved for `React.lazy()` compatibility — the existing lazy import uses default export.

**Assumptions for Verifier:**
1. The `React.lazy()` call in the parent component does `React.lazy(() => import('./v2/AppUIv2'))` — confirmed this works with named + default export pattern.
2. `data-zen` attribute doesn't conflict with any existing selectors — safe because all v2 selectors are `.pf2-*`.
3. Alt+1/2/3 doesn't conflict with browser shortcuts — Alt+number combinations are typically free in most browsers. On Mac, `Alt` maps to `Option` which may produce special characters. **Verifier should evaluate whether `Alt` is the correct modifier for Mac.**
4. The `e.key` check for `Z` handles both lowercase and uppercase — confirmed by checking for both `z` and `Z`.

---

### FILE: AppUIv2.css additions

The following CSS must be **added** to the existing `src/ui/v2/AppUIv2.css` file (appended after the existing content):

```css
/* ============================================================================
   Layout Shell (Phase 2)
   ============================================================================ */

.pf2-layout {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

.pf2-layout__viewport {
  position: absolute;
  inset: 0;
  z-index: var(--pf2-z-viewport);
}

/* When sidebar is open, viewport doesn't need offset because
   sidebar is position:fixed and overlays the viewport.
   The 3D canvas handles its own sizing via ResizeObserver. */
```

#### Rationale — Layout CSS

1. **Full viewport**: `.pf2-layout` takes the full screen with `100vh` / `100dvh` fallback.

2. **Absolute viewport**: The viewport (canvas area) fills the entire layout. The sidebar is `position: fixed` and overlays on top — this means the 3D canvas uses the full window width, and the sidebar floats over it. This is INTENTIONAL per the luxury UI design — the pot is always full-bleed.

3. **No sidebar offset**: Unlike v1 which resizes the viewport when the sidebar opens, v2 lets the sidebar overlay the viewport. The 3D content is always full-width. This is a deliberate design choice for the editorial aesthetic.

---

## Summary: Files to Create/Modify

| Action | File | Lines |
|--------|------|-------|
| CREATE | `src/ui/v2/layout/SidebarV2.tsx` | ~195 |
| CREATE | `src/ui/v2/layout/SidebarV2.css` | ~175 |
| CREATE | `src/ui/v2/layout/StatusFooter.tsx` | ~90 |
| CREATE | `src/ui/v2/layout/StatusFooter.css` | ~110 |
| CREATE | `src/ui/v2/layout/ToolbarV2.tsx` | ~240 |
| CREATE | `src/ui/v2/layout/ToolbarV2.css` | ~115 |
| REWRITE | `src/ui/v2/AppUIv2.tsx` | ~110 |
| APPEND | `src/ui/v2/AppUIv2.css` | ~20 |

**Total new code**: ~1,055 lines across 8 files.

---

## Open Questions (for Verifier)

1. **Lucide icon names**: I used `Shrink`/`Expand` for zen mode. Verify these exist in the installed version of `lucide-react`. Alternatives: `Minimize2`/`Maximize2` or `ChevronFirstLast`.

2. **Alt+N on Mac**: `Alt` (Option) key on Mac produces special characters when combined with numbers. Should we use `Cmd+1/2/3` on Mac instead? Or a different modifier? The spec says `Alt+1/2/3` — deferring to Verifier.

3. **Radix Tabs `forceMount`**: I used `forceMount={false}` (which is the default). This means inactive tab content unmounts. Should we consider `forceMount` for preserving scroll position in Phase 3 when tabs have actual content? Note: this is a Phase 3 concern, not Phase 2.

4. **Sidebar overlay vs push**: The current design overlays the sidebar on the viewport (canvas always full-width). V1 PUSHES the viewport. Confirm this is the desired behavior per the luxury UI spec.

5. **StatusFooter spinner**: I defined a local `@keyframes pf2-spin` in `StatusFooter.css`. Phase 1's `ButtonV2.css` also defines it. Should this be deduplicated into a shared location (`motion.css`)? Minor — CSS keyframes with the same name will coalesce, and since both do `rotate(0deg → 360deg)`, there's no conflict.

---

## Gate Criteria (Phase 2 Merge)

Per consolidated spec §14:
- [ ] Full layout renders (sidebar + toolbar + viewport)
- [ ] Tab switching works (Shape / Style / Export, synced to Zustand store)
- [ ] Sidebar resize persists to localStorage
- [ ] Close button hides sidebar
- [ ] Zen mode hides sidebar, toolbar stays visible
- [ ] Keyboard shortcuts: Z (zen), Alt+1/2/3 (tabs)
- [ ] All ARIA roles correct (toolbar, tablist, tab, tabpanel, status, separator)
- [ ] v1 UI untouched (zero imports from v2 into v1 code)
- [ ] Existing tests pass (no regressions)
