/**
 * useSheetDrag — Vertical drag gesture hook for bottom sheet components.
 *
 * Extracts drag/snap logic into a composable hook. Uses direct DOM
 * manipulation during drag (ref.current.style.height) and only syncs
 * to React state on snap (touchend/mouseup) per Amendment A1.
 *
 * Mouse listeners are attached to window only inside mousedown and
 * removed in mouseup per Amendment A2.
 *
 * @module hooks/useSheetDrag
 */

import { useState, useRef, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export type SheetState = 'collapsed' | 'half' | 'full';

export interface SheetDragConfig {
  /** Ref to the sheet DOM element for direct style manipulation during drag */
  sheetRef: React.RefObject<HTMLElement | null>;
  /** Collapsed height in px (default 72) */
  handleHeight?: number;
  /** Half-open as percentage of viewport height (default 50) */
  halfPercent?: number;
  /** Full-open as percentage of viewport height (default 85) */
  maxPercent?: number;
  /** Initial sheet state (default 'half') */
  initialState?: SheetState;
  /** Called when state changes after a snap */
  onStateChange?: (state: SheetState) => void;
}

export interface SheetDragResult {
  /** Current sheet state */
  state: SheetState;
  /** Handlers to attach to the drag handle element */
  dragHandlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onMouseDown: (e: React.MouseEvent) => void;
  };
  /** Cycle through states: collapsed → half → full → collapsed */
  toggle: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Default collapsed height in px */
const DEFAULT_HANDLE_HEIGHT = 72;

/** Default half-open percentage of viewport height */
const DEFAULT_HALF_PERCENT = 50;

/** Default full-open percentage of viewport height */
const DEFAULT_MAX_PERCENT = 85;

// ============================================================================
// Hook
// ============================================================================

/**
 * Manages vertical drag gestures for a bottom sheet element.
 *
 * Uses direct DOM manipulation (`ref.current.style.height`) during drag
 * for smooth 60fps animation, and syncs to React state only on snap.
 *
 * @example
 * ```tsx
 * const sheetRef = useRef<HTMLDivElement>(null);
 * const { state, dragHandlers, toggle } = useSheetDrag({ sheetRef });
 *
 * return (
 *   <div ref={sheetRef}>
 *     <div {...dragHandlers}>Drag handle</div>
 *   </div>
 * );
 * ```
 */
export function useSheetDrag(config: SheetDragConfig): SheetDragResult {
  const {
    sheetRef,
    handleHeight = DEFAULT_HANDLE_HEIGHT,
    halfPercent = DEFAULT_HALF_PERCENT,
    maxPercent = DEFAULT_MAX_PERCENT,
    initialState = 'half',
    onStateChange,
  } = config;

  const [state, setState] = useState<SheetState>(initialState);

  // Drag tracking refs
  const startY = useRef(0);
  const startHeight = useRef(0);
  const isDragging = useRef(false);

  /**
   * Calculate the pixel height for a given sheet state.
   */
  const getStateHeight = useCallback(
    (s: SheetState): number => {
      if (typeof window === 'undefined') return handleHeight;
      const vh = window.innerHeight;
      switch (s) {
        case 'collapsed':
          return handleHeight;
        case 'half':
          return vh * (halfPercent / 100);
        case 'full':
          return vh * (maxPercent / 100);
      }
    },
    [handleHeight, halfPercent, maxPercent]
  );

  /**
   * Snap the sheet to the nearest state based on current height.
   * Updates React state and removes the inline style so CSS takes over.
   */
  const snapToNearest = useCallback(
    (currentPx: number) => {
      const collapsedH = handleHeight;
      const halfH = getStateHeight('half');
      const fullH = getStateHeight('full');

      let newState: SheetState;
      if (currentPx < (collapsedH + halfH) / 2) {
        newState = 'collapsed';
      } else if (currentPx < (halfH + fullH) / 2) {
        newState = 'half';
      } else {
        newState = 'full';
      }

      // Remove the dragging class so CSS transitions kick in
      const el = sheetRef.current;
      if (el) {
        el.classList.remove('pf2-mobile-sheet--dragging');
        // Set final height via style so the transition animates to it,
        // then clear inline style once the transition completes
        el.style.height = `${getStateHeight(newState)}px`;
      }

      setState(newState);
      onStateChange?.(newState);
    },
    [handleHeight, getStateHeight, sheetRef, onStateChange]
  );

  /**
   * Apply a clamped height directly to the DOM element during drag.
   */
  const applyDragHeight = useCallback(
    (clientY: number) => {
      const el = sheetRef.current;
      if (!el) return;

      const deltaY = startY.current - clientY;
      const newHeight = startHeight.current + deltaY;
      const minH = handleHeight;
      const maxH = getStateHeight('full');
      const clamped = Math.max(minH, Math.min(maxH, newHeight));

      // Direct DOM manipulation for 60fps drag — Amendment A1
      el.style.height = `${clamped}px`;
    },
    [sheetRef, handleHeight, getStateHeight]
  );

  // --------------------------------------------------------------------------
  // Touch handlers
  // --------------------------------------------------------------------------

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      const el = sheetRef.current;
      startY.current = touch.clientY;
      startHeight.current = el
        ? el.getBoundingClientRect().height
        : getStateHeight(state);
      isDragging.current = true;

      el?.classList.add('pf2-mobile-sheet--dragging');
    },
    [sheetRef, state, getStateHeight]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current) return;
      applyDragHeight(e.touches[0].clientY);
    },
    [applyDragHeight]
  );

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const el = sheetRef.current;
    const currentPx = el
      ? el.getBoundingClientRect().height
      : getStateHeight(state);
    snapToNearest(currentPx);
  }, [sheetRef, state, getStateHeight, snapToNearest]);

  // --------------------------------------------------------------------------
  // Mouse handlers — Amendment A2: attach to window only inside mousedown
  // --------------------------------------------------------------------------

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const el = sheetRef.current;
      startY.current = e.clientY;
      startHeight.current = el
        ? el.getBoundingClientRect().height
        : getStateHeight(state);
      isDragging.current = true;

      el?.classList.add('pf2-mobile-sheet--dragging');

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        applyDragHeight(ev.clientY);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);

        const currentEl = sheetRef.current;
        const currentPx = currentEl
          ? currentEl.getBoundingClientRect().height
          : getStateHeight(state);
        snapToNearest(currentPx);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [sheetRef, state, getStateHeight, applyDragHeight, snapToNearest]
  );

  // --------------------------------------------------------------------------
  // Toggle: cycle collapsed → half → full → collapsed
  // --------------------------------------------------------------------------

  const toggle = useCallback(() => {
    setState((prev) => {
      const next: SheetState =
        prev === 'collapsed' ? 'half' : prev === 'half' ? 'full' : 'collapsed';

      // Apply height directly so the CSS transition animates
      const el = sheetRef.current;
      if (el) {
        el.style.height = `${getStateHeight(next)}px`;
      }

      onStateChange?.(next);
      return next;
    });
  }, [sheetRef, getStateHeight, onStateChange]);

  return {
    state,
    dragHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onMouseDown,
    },
    toggle,
  };
}
