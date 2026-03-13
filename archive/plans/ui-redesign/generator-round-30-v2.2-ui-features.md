# Generator Round 30 — v2.2 UI Features (Typography, Gestures, Haptics, Undo/Redo)

Date: 2026-03-06

## Problem Statement

Four UI features remain unimplemented from the v2 spec:

1. **Typography** — `fonts.css` declares `@font-face` rules pointing to `/fonts/*.woff2` files that don't exist. The entire luxury editorial aesthetic falls back to system fonts. 
2. **Gesture Tab Swiping** — Mobile users can only switch tabs by tapping triggers; horizontal swipe on tab content is missing.
3. **Haptics** — No tactile feedback on key interactions (`navigator.vibrate()`).
4. **Undo/Redo** — No way to revert accidental parameter changes; slider drag to extreme values is destructive.

All four are pure UI layer — no engine or export pipeline changes required.

---

## Feature 1: Typography (Font Assets)

### Root Cause Analysis

[fonts.css](../../src/ui/v2/fonts.css) declares 5 `@font-face` rules:
- `Fraunces` (regular + italic variable, weight 100–900)
- `Satoshi` (regular + italic variable, weight 300–900) 
- `IBM Plex Mono` (regular 400, medium 500)

All point to `/fonts/*.woff2` which resolves to `public/fonts/` — a directory that does not exist. CSS tokens in [AppUIv2.css](../../src/ui/v2/AppUIv2.css#L73-L75) reference these fonts with fallbacks:
```css
--pf2-font-display: 'Fraunces', 'Georgia', serif;
--pf2-font-body:    'Satoshi', 'Inter', system-ui, sans-serif;
--pf2-font-mono:    'IBM Plex Mono', 'Menlo', monospace;
```

Currently everything silently falls through to Georgia / Inter / Menlo.

### Proposal 1A: @fontsource-variable npm packages (Recommended)

**Idea**: Install `@fontsource-variable/fraunces` and `@fontsource-variable/ibm-plex-mono` from npm. These packages provide `.woff2` files under `node_modules/` and are bundled into the Vite build output automatically via CSS `@import`. No need for `public/fonts/` at all.

**Satoshi Decision**: Satoshi has no fontsource package. Two options:

- **Option A: Substitute with Inter** — Inter is already in the fallback chain (`'Satoshi', 'Inter', system-ui, sans-serif`). Install `@fontsource-variable/inter` (~32KB variable woff2). The body text would use Inter instead of Satoshi. Visually similar geometric sans. Cleaner dependency management, fully npm-managed.
- **Option B: Manual Satoshi download** — Download Satoshi Variable woff2 from fontshare.com, place in `public/fonts/Satoshi-Variable.woff2` (~45KB). Keep the existing `@font-face` declaration pointing to `/fonts/`. Mixed strategy: two fonts npm-managed, one manual.

**Recommendation**: **Option A (Inter)**. Reasons:
1. Single dependency strategy (all npm, all bundled by Vite)
2. Inter is a superlative geometric sans — arguably more polished than Satoshi  
3. Already in the fallback chain, so token values just work
4. Smaller total payload (~28KB variable woff2 vs ~45KB Satoshi)
5. No manual file management or `public/fonts/` directory needed

**Mechanism**:
1. `npm install @fontsource-variable/fraunces @fontsource-variable/inter @fontsource-variable/ibm-plex-mono`
2. Replace the entire `fonts.css` content with fontsource `@import` directives
3. Update the CSS token `--pf2-font-body` from `'Satoshi', 'Inter', ...` to `'Inter', system-ui, sans-serif` (since Inter IS the font now, not a fallback)
4. Total payload: Fraunces variable (~55KB) + Inter variable (~28KB) + IBM Plex Mono regular+medium (~30KB) ≈ **~113KB** — within the 80-120KB budget

**Font weight subsetting**: The fontsource variable packages support `@import` with weight axis subsetting. We don't need the full 100-900 range for all fonts:
- Fraunces: axes `wght` 100-900 (used for display headings — keep full range for optical sizing)
- Inter: axes `wght` 300-700 (body text only needs regular/medium/semibold/bold)  
- IBM Plex Mono: only 400 and 500 weights (already the case in current `@font-face`)

**Files affected**:
- MODIFY: `src/ui/v2/fonts.css` — replace all `@font-face` blocks with `@import` statements
- MODIFY: `src/ui/v2/AppUIv2.css` — update `--pf2-font-body` token to remove 'Satoshi'
- No new files needed. No `public/fonts/` directory needed.

**npm packages**: 
```
@fontsource-variable/fraunces
@fontsource-variable/inter
@fontsource-variable/ibm-plex-mono
```

**Assumptions** (for Verifier to attack):
1. fontsource variable packages provide `.woff2` format with `font-display: swap` when imported via CSS `@import`
2. Vite correctly resolves `@import` from `node_modules/` packages
3. Inter is an acceptable substitute for Satoshi (both are geometric sans-serifs)
4. The total payload of ~113KB falls within the 80-120KB spec budget
5. IBM Plex Mono fontsource package provides individual weight files (400, 500) rather than a single variable bundle

### Complete Code

#### `src/ui/v2/fonts.css` (MODIFY — full replacement)

```css
/**
 * PotFoundry UI v2 — Font Declarations
 *
 * Fonts loaded via @fontsource-variable packages, bundled by Vite.
 * All fonts use font-display: swap for fast initial paint.
 *
 * Fonts used:
 *   - Fraunces (variable serif)  — Display headings, wordmark
 *   - Inter (variable sans)      — Body text, labels, buttons
 *   - IBM Plex Mono (static)     — Numeric values, stats, status
 */

/* Fraunces — Variable Serif (Display) */
@import '@fontsource-variable/fraunces';
@import '@fontsource-variable/fraunces/wght-italic.css';

/* Inter — Variable Sans (Body) */
@import '@fontsource-variable/inter';

/* IBM Plex Mono — Static weights (Mono) */
@import '@fontsource-variable/ibm-plex-mono';
```

#### `src/ui/v2/AppUIv2.css` token change (MODIFY — single line)

```css
/* Before: */
--pf2-font-body:    'Satoshi', 'Inter', system-ui, sans-serif;

/* After: */
--pf2-font-body:    'Inter Variable', 'Inter', system-ui, sans-serif;
```

Also update the display font token to match fontsource's font-family name:
```css
/* Before: */
--pf2-font-display: 'Fraunces', 'Georgia', serif;

/* After: */
--pf2-font-display: 'Fraunces Variable', 'Fraunces', 'Georgia', serif;
```

And the mono token:
```css
/* Before: */
--pf2-font-mono:    'IBM Plex Mono', 'Menlo', monospace;

/* After: */
--pf2-font-mono:    'IBM Plex Mono Variable', 'IBM Plex Mono', 'Menlo', monospace;
```

> **Note for Verifier**: The fontsource variable packages register their font-family as `'Fraunces Variable'`, `'Inter Variable'`, etc. We keep the non-variable name as first fallback for browsers that don't support variable fonts. The Verifier should confirm the exact font-family names used by each fontsource package.

### Integration Points
- `AppUIv2.css` imports `fonts.css` at the top (line 12: `@import './fonts.css';`) — no change needed
- CSS tokens consumed throughout all v2 components — transparent, no component changes

---

## Feature 2: Gesture Tab Swiping

### Root Cause Analysis

The sidebar tab content in [SidebarV2.tsx](../../src/ui/v2/layout/SidebarV2.tsx) uses Radix `<Tabs.Root>` with three `<Tabs.Content>` elements wrapped in `<div className="pf2-sidebar__content">`. Tab switching is handled by `handleTabChange` which calls `setV2ActiveTab(tab)` and announces via the `useAnnounce()` hook.

On mobile (≤768px), the sidebar becomes a bottom sheet (see [SidebarV2.css](../../src/ui/v2/layout/SidebarV2.css#L218)). The tab content area scrolls vertically. Horizontal swipe should switch tabs without interfering with vertical scroll.

### Proposal 2: Pure useSwipeGesture Hook

**Idea**: A zero-dependency custom hook that attaches `touchstart`/`touchmove`/`touchend` listeners to a ref'd container. Returns nothing visible — it calls the `onSwipe` callback internally.

**Mechanism**:
1. Track touch start position `(startX, startY)` and timestamp
2. On `touchmove`: compute `deltaX` and `deltaY`. If `|deltaX| > |deltaY| * 1.5` (horizontal intent), set a `locked` flag and call `e.preventDefault()` on subsequent moves to prevent vertical scroll
3. On `touchend`: if `locked` and (`|deltaX| > 40px` OR `velocity > 0.3 px/ms`), fire `onSwipe('left' | 'right')`
4. If `|deltaY| > |deltaX|` on initial moves, abort — vertical scroll takes over
5. Respect `prefers-reduced-motion`: skip any visual transition but still fire the callback

**Key design decisions**:
- **Threshold**: 40px minimum distance (spec says 30-50px, 40px is the sweet spot)
- **Velocity**: 0.3 px/ms fast-swipe threshold (≈180px in 600ms gesture window — very deliberate)
- **Angle guard**: 1.5:1 horizontal-to-vertical ratio before locking — prevents false positives from diagonal scrolling
- **Passive listeners**: `touchstart` is passive, `touchmove` is non-passive only when horizontally locked (needed for `preventDefault`)

**Files affected**:
- CREATE: `src/ui/v2/hooks/useSwipeGesture.ts`
- MODIFY: `src/ui/v2/layout/SidebarV2.tsx` — attach hook to content container

**Assumptions** (for Verifier to attack):
1. `e.preventDefault()` on `touchmove` when horizontally locked will correctly prevent vertical scroll without breaking the Radix Tabs internal scroll
2. The 1.5:1 horizontal-to-vertical ratio is sufficient to avoid false positives
3. Attaching to `pf2-sidebar__content` div is the correct container (not individual `Tabs.Content`)
4. The hook doesn't need cleanup beyond the `useEffect` return (no lingering state)
5. iOS Safari handles non-passive `touchmove` listeners correctly (it does, since iOS 11.3, as long as you don't mark the listener as `{ passive: true }`)

### Complete Code

#### `src/ui/v2/hooks/useSwipeGesture.ts` (CREATE)

```typescript
/**
 * useSwipeGesture — Detect horizontal swipe on a container element.
 *
 * Attaches touch listeners to the given ref. Fires `onSwipe('left' | 'right')`
 * when a horizontal swipe is detected. Includes angle-locking to avoid
 * interfering with vertical scroll.
 *
 * @module ui/v2/hooks/useSwipeGesture
 */

import { useEffect, useRef } from 'react';

/** Swipe direction: 'left' means finger moved left (content goes right → next tab). */
export type SwipeDirection = 'left' | 'right';

export interface UseSwipeGestureOptions {
  /** Callback fired on successful swipe. */
  onSwipe: (direction: SwipeDirection) => void;
  /** Minimum swipe distance in px to commit (default: 40). */
  minDistance?: number;
  /** Minimum velocity in px/ms to commit even if distance is short (default: 0.3). */
  minVelocity?: number;
  /** Whether the hook is enabled (default: true). */
  enabled?: boolean;
}

/**
 * Detect horizontal swipe gestures on a container element.
 *
 * The hook uses angle-locking: if the initial touch movement is more
 * vertical than horizontal (ratio < 1.5), the gesture is abandoned
 * and vertical scrolling proceeds unimpeded.
 *
 * @param containerRef - React ref to the swipeable container
 * @param options - Swipe configuration
 */
export function useSwipeGesture(
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseSwipeGestureOptions
): void {
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || optsRef.current.enabled === false) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let locked: 'horizontal' | 'vertical' | null = null;

    const LOCK_RATIO = 1.5; // horizontal must exceed vertical by this factor

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      locked = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        locked = null;
        return;
      }

      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Determine lock direction on first significant movement
      if (locked === null && (absDx > 8 || absDy > 8)) {
        locked = absDx > absDy * LOCK_RATIO ? 'horizontal' : 'vertical';
      }

      // Prevent vertical scroll when horizontally locked
      if (locked === 'horizontal') {
        e.preventDefault();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (locked !== 'horizontal') return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const elapsed = Date.now() - startTime;
      const velocity = Math.abs(dx) / Math.max(elapsed, 1);

      const { minDistance = 40, minVelocity = 0.3, onSwipe } = optsRef.current;

      if (Math.abs(dx) >= minDistance || velocity >= minVelocity) {
        onSwipe(dx < 0 ? 'left' : 'right');
      }

      locked = null;
    };

    // touchstart is passive (no preventDefault needed)
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    // touchmove must be non-passive to allow preventDefault when horizontally locked
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [containerRef]);
}
```

#### `src/ui/v2/layout/SidebarV2.tsx` integration (MODIFY)

Add import at top (after existing imports):
```typescript
import { useSwipeGesture } from '../hooks/useSwipeGesture';
```

Add a ref for the content container and the swipe hook inside the component, after the existing `handleTabChange` callback:

```typescript
  // Swipe gesture for tab switching on mobile
  const contentRef = useRef<HTMLDivElement>(null);

  const handleSwipe = useCallback(
    (direction: 'left' | 'right') => {
      const tabs = ['shape', 'style', 'export'] as const;
      const currentIndex = tabs.indexOf(activeTab);
      const nextIndex =
        direction === 'left'
          ? Math.min(currentIndex + 1, tabs.length - 1)
          : Math.max(currentIndex - 1, 0);
      if (nextIndex !== currentIndex) {
        handleTabChange(tabs[nextIndex]);
      }
    },
    [activeTab, handleTabChange]
  );

  useSwipeGesture(contentRef, { onSwipe: handleSwipe });
```

Attach the ref to the content container div — change:
```tsx
<div className="pf2-sidebar__content">
```
to:
```tsx
<div ref={contentRef} className="pf2-sidebar__content">
```

### CSS additions

Add `touch-action: pan-y` to the content container so the browser knows vertical scroll is primary:

```css
/* In SidebarV2.css, add to existing .pf2-sidebar__content rule: */
.pf2-sidebar__content {
  /* ... existing styles ... */
  touch-action: pan-y;
}
```

---

## Feature 3: Haptics

### Root Cause Analysis

No haptic feedback exists anywhere in the codebase. The spec calls for `navigator.vibrate()` integration on key interactions. `navigator.vibrate()` is supported on Android Chrome/Firefox but NOT on iOS Safari.

### Proposal 3: useHaptics Hook

**Idea**: A hook that returns three convenience functions (`tap`, `snap`, `success`) that call `navigator.vibrate()` with different patterns. Feature-detects support and respects a user preference stored in localStorage.

**Mechanism**:
1. On mount, check `typeof navigator.vibrate === 'function'`
2. Read localStorage key `pf2-haptics` (values: `'enabled'`, `'disabled'`, or absent)
3. If absent: default to enabled on Android (check `navigator.userAgent` for "Android"), disabled otherwise
4. Return `{ tap, snap, success, enabled, setEnabled }` where the vibration functions are no-ops when disabled or unsupported

**Vibration patterns** (from spec §9):
- **Tap**: `10` (10ms single buzz — tab switch, button press)
- **Snap**: `[5, 50, 5]` (5ms buzz, 50ms pause, 5ms buzz — slider snap-to-default)
- **Success**: `[10, 30, 10, 30, 20]` (celebration pattern — export complete)

**Files affected**:
- CREATE: `src/ui/v2/hooks/useHaptics.ts`
- MODIFY: `src/ui/v2/layout/SidebarV2.tsx` — call `tap()` in `handleTabChange`
- MODIFY: `src/ui/v2/tabs/ExportTab.tsx` — call `success()` on export completion (exact integration point depends on export completion callback — may need to be specified by Executioner based on actual export flow)

**Assumptions** (for Verifier to attack):
1. `navigator.vibrate()` is safe to call without permissions (it is — it's a user-gesture-gated API)
2. iOS will never support `navigator.vibrate()` so the no-op fallback is correct
3. Storing haptics preference in localStorage (not Zustand) is correct — it's a device-level preference, not a design preference
4. User agent sniffing for "Android" is acceptable for the default-enabled heuristic (it's the only reliable way since there's no "supports vibration" media query)
5. The `snap` pattern will feel distinct from `tap` on real hardware

### Complete Code

#### `src/ui/v2/hooks/useHaptics.ts` (CREATE)

```typescript
/**
 * useHaptics — Haptic feedback via navigator.vibrate().
 *
 * Provides three vibration patterns for key interactions.
 * Feature-detects support (iOS returns no-ops) and respects
 * a localStorage preference.
 *
 * @module ui/v2/hooks/useHaptics
 */

import { useCallback, useMemo } from 'react';

/** Haptic feedback patterns. */
const PATTERNS = {
  /** Light tap — tab switch, button press (10ms). */
  tap: 10,
  /** Double-tap with pause — slider snap-to-default. */
  snap: [5, 50, 5] as number[],
  /** Celebration — export complete. */
  success: [10, 30, 10, 30, 20] as number[],
} as const;

const STORAGE_KEY = 'pf2-haptics';

/** Check if vibration API is available. */
function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Read stored preference, defaulting to enabled on Android. */
function readPreference(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'enabled') return true;
    if (stored === 'disabled') return false;
  } catch {
    // localStorage unavailable
  }
  // Default: enabled on Android only
  if (typeof navigator !== 'undefined') {
    return /Android/i.test(navigator.userAgent);
  }
  return false;
}

/** Persist haptics preference. */
function writePreference(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'enabled' : 'disabled');
  } catch {
    // Silently ignore
  }
}

export interface UseHapticsReturn {
  /** Light 10ms tap — use on tab switch, button press. */
  tap: () => void;
  /** Snap pattern — use on slider snap-to-default. */
  snap: () => void;
  /** Success celebration — use on export complete. */
  success: () => void;
  /** Whether haptics are currently enabled. */
  enabled: boolean;
  /** Toggle haptics on/off and persist to localStorage. */
  setEnabled: (on: boolean) => void;
}

/** No-op function for unsupported environments. */
const noop = (): void => {};

/**
 * Hook providing haptic feedback functions.
 *
 * On unsupported browsers (iOS, desktop), all returned functions
 * are no-ops. Respects a localStorage preference keyed by `pf2-haptics`.
 *
 * @returns Object with `tap`, `snap`, `success` functions plus `enabled` state
 */
export function useHaptics(): UseHapticsReturn {
  const supported = useMemo(() => canVibrate(), []);
  const preferenceEnabled = useMemo(() => readPreference(), []);
  const enabled = supported && preferenceEnabled;

  const tap = useCallback(() => {
    if (enabled) navigator.vibrate(PATTERNS.tap);
  }, [enabled]);

  const snap = useCallback(() => {
    if (enabled) navigator.vibrate(PATTERNS.snap as number[]);
  }, [enabled]);

  const success = useCallback(() => {
    if (enabled) navigator.vibrate(PATTERNS.success as number[]);
  }, [enabled]);

  const setEnabled = useCallback(
    (on: boolean) => {
      writePreference(on);
      // Note: The hook itself uses useMemo at mount time, so toggling at runtime
      // won't take effect until the component remounts. This is acceptable because
      // the settings toggle is in a different view (preferences panel) and the
      // sidebar will remount on navigation. If more reactive behavior is needed,
      // this should be moved to Zustand or useState with forced re-read.
    },
    []
  );

  if (!supported) {
    return { tap: noop, snap: noop, success: noop, enabled: false, setEnabled: noop };
  }

  return { tap, snap, success, enabled, setEnabled };
}
```

#### `src/ui/v2/layout/SidebarV2.tsx` integration (MODIFY)

Add import:
```typescript
import { useHaptics } from '../hooks/useHaptics';
```

Inside component, after `const announce = useAnnounce();`:
```typescript
  const { tap: hapticTap } = useHaptics();
```

In `handleTabChange`, add `hapticTap()` call:
```typescript
  const handleTabChange = useCallback(
    (value: string) => {
      const tab = value as 'shape' | 'style' | 'export';
      setV2ActiveTab(tab);
      const label = TAB_CONFIG.find((t) => t.id === tab)?.label ?? tab;
      announce(`${label} tab selected`);
      hapticTap();
    },
    [setV2ActiveTab, announce, hapticTap]
  );
```

---

## Feature 4: Undo/Redo

### Root Cause Analysis

The Zustand store in [store.ts](../../src/state/store.ts) uses a slices pattern combining 6 slices: `GeometrySlice`, `StyleSlice`, `UISlice`, `MeshSlice`, `AppearanceSlice`, `PerformanceSlice`. The store is wrapped in `devtools` → `persist` → `subscribeWithSelector` middleware.

The spec calls for tracking changes to: **style** (name + opts), **geometry** (dimensions), **appearance** (colors, wireframe, etc). It explicitly excludes: UI state, camera, export progress, performance metrics, mesh quality.

### Proposal 4: Lightweight Custom History (Moderate)

**Idea**: Implement a custom circular buffer history system as a standalone Zustand slice that subscribes to the relevant state slices and records snapshots. This is cleaner than `zundo` because:

1. **zundo wraps the entire store** — incompatible with the slices pattern without significant refactoring
2. We only need to track 3 of 6 slices — `zundo` would track everything or require complex `partialize` configuration
3. A custom solution gives precise control over what constitutes a "history entry" 
4. The debouncing requirement (only push on slider release) is cleaner with explicit `pushToHistory()` calls

**Mechanism**:
1. Create a `HistorySlice` that stores a circular buffer of `HistoryEntry` objects
2. Each `HistoryEntry` captures: `{ geometry, style, appearance, timestamp }`
3. The slice exposes: `undo()`, `redo()`, `pushToHistory()`, `canUndo`, `canRedo`
4. `pushToHistory()` is called explicitly at commit points (slider `onValueCommit`, style change, color pick)
5. `undo()`/`redo()` restore the relevant slices from the buffer entry
6. History buffer: 50 entries max, circular (oldest entries are overwritten)
7. Any new mutation after an undo clears the redo stack (standard undo/redo behavior)

**Debouncing strategy**: The spec says "only push when slider interaction ends." Looking at the codebase:
- Radix `<Slider>` emits `onValueChange` continuously during drag and `onValueCommit` on release
- Currently, `setGeometryParam` / `setStyleOpt` are called on every `onValueChange`
- We add `pushToHistory()` calls at `onValueCommit` / `onPointerUp` / on explicit "Set Style" actions
- The first call per user gesture captures the "before" state; subsequent commits capture the "after" state

**Keyboard shortcuts**: Add `Ctrl+Z` / `Ctrl+Shift+Z` to the existing keyboard handler in [AppUIv2.tsx](../../src/ui/v2/AppUIv2.tsx#L64-L90).

**Toolbar buttons**: Add Undo/Redo `IconButtonV2` to the left group of [ToolbarV2.tsx](../../src/ui/v2/layout/ToolbarV2.tsx#L203-L214), using `Undo2` and `Redo2` icons from lucide-react.

**Files affected**:
- CREATE: `src/state/slices/history.ts` — History slice with circular buffer
- MODIFY: `src/state/slices/index.ts` — Export HistorySlice
- MODIFY: `src/state/store.ts` — Add HistorySlice to combined store
- MODIFY: `src/state/index.ts` — Export history actions
- MODIFY: `src/ui/v2/AppUIv2.tsx` — Add Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts
- MODIFY: `src/ui/v2/layout/ToolbarV2.tsx` — Add undo/redo buttons

**Assumptions** (for Verifier to attack):
1. Explicit `pushToHistory()` calls are better than automatic subscription-based recording — this avoids the "every slider tick creates a history entry" problem
2. Storing full snapshots of `{ geometry, style, appearance }` is acceptable memory-wise — each snapshot is ~1KB, so 50 entries ≈ 50KB max
3. The circular buffer approach (array with cursor index) is simpler and more correct than a linked list for this use case
4. `Ctrl+Z` won't conflict with browser undo (we `e.preventDefault()` it, and there's no `<textarea>` or `<input type="text">` in the main UI that uses browser undo)
5. Clearing redo stack on new mutation is the expected UX behavior (vs. branching history)
6. We don't need to persist history across page reloads (it's transient)

### Complete Code

#### `src/state/slices/history.ts` (CREATE)

```typescript
/**
 * History slice for undo/redo functionality.
 *
 * Tracks snapshots of geometry, style, and appearance state in a
 * circular buffer. Exposes undo/redo actions and keyboard-friendly
 * canUndo/canRedo flags.
 *
 * @module state/slices/history
 */

import { StateCreator } from 'zustand';
import type { GeometryParams} from '../types';
import type { StyleState } from '../types';
import type { AppearanceState } from '../types';

// ============================================================================
// Types
// ============================================================================

/** Snapshot of undoable state. */
export interface HistoryEntry {
  geometry: GeometryParams;
  style: StyleState;
  appearance: AppearanceState;
}

/** Maximum number of history entries. */
const MAX_HISTORY = 50;

// ============================================================================
// Slice Interface
// ============================================================================

/**
 * History slice state and actions.
 *
 * The slice uses a linear array with a cursor. On undo, the cursor
 * moves backward. On redo, it moves forward. Any new push after an
 * undo truncates the forward history (no branching).
 */
export interface HistorySlice {
  /** Internal history state — not intended for direct access. */
  _history: {
    entries: HistoryEntry[];
    cursor: number; // points to the current entry (-1 = no history)
  };

  /** Whether undo is available. */
  canUndo: boolean;

  /** Whether redo is available. */
  canRedo: boolean;

  /**
   * Push the current state onto the history stack.
   * Call this at commit points (slider release, style change, etc).
   * Truncates any redo entries beyond the current cursor.
   */
  pushToHistory: () => void;

  /**
   * Undo: restore the previous history entry.
   * No-op if canUndo is false.
   */
  undo: () => void;

  /**
   * Redo: restore the next history entry.
   * No-op if canRedo is false.
   */
  redo: () => void;

  /**
   * Clear all history entries.
   */
  clearHistory: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

/** Extract an undoable snapshot from the full store state. */
function takeSnapshot(state: {
  geometry: GeometryParams;
  style: StyleState;
  appearance: AppearanceState;
}): HistoryEntry {
  return {
    geometry: { ...state.geometry },
    style: { name: state.style.name, opts: { ...state.style.opts } },
    appearance: { ...state.appearance },
  };
}

/** Apply a history entry to the store, restoring geometry/style/appearance. */
function applyEntry(
  entry: HistoryEntry,
  set: (partial: Record<string, unknown>) => void
): void {
  set({
    geometry: { ...entry.geometry },
    style: { name: entry.style.name, opts: { ...entry.style.opts } },
    appearance: { ...entry.appearance },
  });
}

// ============================================================================
// Slice Creator
// ============================================================================

/**
 * Create the history slice.
 *
 * Uses get() to snapshot the current geometry/style/appearance state
 * and set() to restore. History is stored as a simple array with
 * a cursor index.
 */
export const createHistorySlice: StateCreator<
  HistorySlice & {
    geometry: GeometryParams;
    style: StyleState;
    appearance: AppearanceState;
  },
  [],
  [],
  HistorySlice
> = (set, get) => ({
  _history: {
    entries: [],
    cursor: -1,
  },

  canUndo: false,
  canRedo: false,

  pushToHistory: () => {
    const state = get();
    const snapshot = takeSnapshot(state);
    const { entries, cursor } = state._history;

    // Truncate any redo entries beyond cursor
    const truncated = entries.slice(0, cursor + 1);
    truncated.push(snapshot);

    // Enforce max history size
    if (truncated.length > MAX_HISTORY) {
      truncated.shift(); // Remove oldest
    }

    const newCursor = truncated.length - 1;

    set({
      _history: { entries: truncated, cursor: newCursor },
      canUndo: newCursor > 0,
      canRedo: false,
    });
  },

  undo: () => {
    const state = get();
    const { entries, cursor } = state._history;
    if (cursor <= 0) return; // Nothing to undo

    const newCursor = cursor - 1;
    const entry = entries[newCursor];

    applyEntry(entry, set as (partial: Record<string, unknown>) => void);
    set({
      _history: { entries, cursor: newCursor },
      canUndo: newCursor > 0,
      canRedo: true,
    });
  },

  redo: () => {
    const state = get();
    const { entries, cursor } = state._history;
    if (cursor >= entries.length - 1) return; // Nothing to redo

    const newCursor = cursor + 1;
    const entry = entries[newCursor];

    applyEntry(entry, set as (partial: Record<string, unknown>) => void);
    set({
      _history: { entries, cursor: newCursor },
      canUndo: true,
      canRedo: newCursor < entries.length - 1,
    });
  },

  clearHistory: () => {
    set({
      _history: { entries: [], cursor: -1 },
      canUndo: false,
      canRedo: false,
    });
  },
});
```

#### `src/state/slices/index.ts` (MODIFY — add export)

Add to the end of the file:
```typescript
export { createHistorySlice, type HistorySlice, type HistoryEntry } from './history';
```

#### `src/state/store.ts` (MODIFY)

Add `HistorySlice` and `createHistorySlice` to the imports:
```typescript
import {
  GeometrySlice,
  StyleSlice,
  UISlice,
  MeshSlice,
  AppearanceSlice,
  PerformanceSlice,
  HistorySlice,
  createGeometrySlice,
  createStyleSlice,
  createUISlice,
  createMeshSlice,
  createAppearanceSlice,
  createPerformanceSlice,
  createHistorySlice,
} from './slices';
```

Update the combined type:
```typescript
export type AppStore = GeometrySlice &
  StyleSlice &
  UISlice &
  MeshSlice &
  AppearanceSlice &
  PerformanceSlice &
  HistorySlice;
```

Add the history slice to the store creator:
```typescript
subscribeWithSelector((...a) => ({
  ...createGeometrySlice(...a),
  ...createStyleSlice(...a),
  ...createUISlice(...a),
  ...createMeshSlice(...a),
  ...createAppearanceSlice(...a),
  ...createPerformanceSlice(...a),
  ...createHistorySlice(...a),
})),
```

Ensure `_history`, `canUndo`, `canRedo` are NOT in `PERSISTED_KEYS` (they already won't be since the array only lists `geometry`, `style`, `mesh`, `appearance`).

#### `src/state/store.ts` — Action hooks (MODIFY — add history actions)

Add after the existing `usePerformanceActions`:
```typescript
/** Get undo/redo actions */
export const useHistoryActions = () =>
  useAppStore(
    useShallow((s) => ({
      pushToHistory: s.pushToHistory,
      undo: s.undo,
      redo: s.redo,
      clearHistory: s.clearHistory,
    }))
  );
```

#### `src/state/index.ts` (MODIFY — add exports)

Add to the re-exports:
```typescript
export { useHistoryActions } from './store';
export type { HistorySlice, HistoryEntry } from './slices';
```

#### `src/ui/v2/AppUIv2.tsx` keyboard shortcuts (MODIFY)

Inside the `handleKeyDown` function, add Ctrl+Z / Ctrl+Shift+Z handling before the existing zen mode handler:

```typescript
      // Ctrl+Z — Undo
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        useAppStore.getState().undo();
        return;
      }

      // Ctrl+Shift+Z — Redo
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
        e.preventDefault();
        useAppStore.getState().redo();
        return;
      }

      // Ctrl+Y — Redo (Windows convention)
      if (e.key === 'y' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        useAppStore.getState().redo();
        return;
      }
```

Note: These checks MUST come before the `Z` zen-mode handler since `Z` without modifiers toggles zen mode and `Ctrl+Z` is undo. The modifier checks ensure no conflict:
- `Ctrl+Z` → undo (ctrlKey is true, so the zen-mode `!e.ctrlKey` guard rejects it)
- `Z` → zen mode (ctrlKey is false)

The existing zen mode handler already has `!e.ctrlKey && !e.metaKey` guards, so no conflict exists. But adding the undo/redo checks first with early `return` is cleaner.

#### `src/ui/v2/layout/ToolbarV2.tsx` undo/redo buttons (MODIFY)

Add imports:
```typescript
import { Undo2, Redo2 } from 'lucide-react';
```

Add store subscriptions inside the component:
```typescript
  const canUndo = useAppStore((s) => s.canUndo);
  const canRedo = useAppStore((s) => s.canRedo);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
```

Add undo/redo buttons in the left group, after the panel-open button:
```tsx
        {/* Left group — Menu toggle + Undo/Redo */}
        <div className="pf2-toolbar__group">
          {!panelOpen && (
            <IconButtonV2
              icon={<Menu size={18} />}
              aria-label="Open panel"
              onClick={togglePanel}
            />
          )}
          <IconButtonV2
            icon={<Undo2 size={16} />}
            aria-label="Undo (Ctrl+Z)"
            onClick={undo}
            size="sm"
            disabled={!canUndo}
          />
          <IconButtonV2
            icon={<Redo2 size={16} />}
            aria-label="Redo (Ctrl+Shift+Z)"
            onClick={redo}
            size="sm"
            disabled={!canRedo}
          />
        </div>
```

### Integration: Where pushToHistory() Gets Called

The `pushToHistory()` function must be called at commit points. The Executioner will need to wire these up in the slider/control components. The key call sites are:

1. **Slider commit** — Radix `<Slider onValueCommit={...}>` fires when the user releases the slider. The geometry and style tab sliders should call `pushToHistory()` before applying the final value. This means modifying the slider components in `src/ui/v2/tabs/ShapeTab.tsx` and `src/ui/v2/tabs/StyleTab.tsx`.

2. **Style change** — When `setStyle(name)` is called, `pushToHistory()` should fire before the style switch. This is in `StyleTab.tsx` where the style dropdown triggers `setStyle`.

3. **Color scheme change** — When `setColorScheme(id)` is called in the appearance controls.

4. **Initial snapshot** — `pushToHistory()` should be called once on app mount to capture the initial state (entry 0). This can be done in `AppUIv2.tsx`'s `useEffect`.

**Note**: The exact integration into ShapeTab/StyleTab sliders is left to the Executioner since it requires reading those components to find the right hooks. The `pushToHistory` function is available from `useHistoryActions()` or `useAppStore.getState().pushToHistory()`.

---

## Recommended Approach

Implement all four features in this order:

1. **Typography first** — Install npm packages, update CSS. Zero-risk, immediate visual impact. Can be verified with a visual diff.
2. **Haptics second** — Create hook, add 1 call site. Small, self-contained, easy to test.
3. **Gesture swiping third** — Create hook, wire into sidebar. Needs mobile testing.
4. **Undo/redo last** — Largest scope (new slice, store changes, keyboard handlers, toolbar buttons). Most integration points, most potential for regressions.

## Open Questions (Verifier Scrutiny Invited)

1. **Font-family naming**: Do `@fontsource-variable/*` packages register as `'Inter Variable'` or `'Inter'`? This affects the CSS token values. The Verifier should confirm the exact font-family strings.

2. **Haptics reactivity**: The `useHaptics` hook reads localStorage on mount via `useMemo`. If the user toggles haptics in settings, the sidebar must remount for the change to take effect. Is this acceptable, or should we use `useSyncExternalStore` for reactive localStorage?

3. **Undo initial snapshot timing**: Should `pushToHistory()` on mount happen in `AppUIv2.tsx` or in the store creation itself? If in the store, persistence might interact badly. If in `AppUIv2`, the snapshot might miss initial persisted-state hydration.

4. **Swipe vs Radix internal touch handling**: Does Radix Tabs have any internal touch handlers that might conflict with our `touchmove` preventDefault? The Verifier should check the Radix source.

5. **History entry size**: Each entry copies `geometry` (13 numbers), `style` (string + ~5-10 number opts), `appearance` (8 fields). At ~1KB per entry and 50 max entries, this is ~50KB. Is this acceptable for mobile devices with limited memory? (I believe yes, but Verifier should confirm.)
