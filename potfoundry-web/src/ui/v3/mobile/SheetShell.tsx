/**
 * SheetShell — three-stop bottom sheet for the v3 mobile layout.
 *
 * Mounts at the bottom of the viewport, driven by `useSheetDrag`
 * (snap states: collapsed 72px / half 50vh / full 85vh). Emits
 * `document.body.dataset.mobileSheetState` on every state change so
 * WebGPUPreview.css can reposition the canvas. Removes the attribute
 * on unmount (desktop resize mid-session leaves no stale attr).
 *
 * Touch-mode context is provided by the AppUIv3 root — SheetShell
 * does NOT re-wrap children in its own provider.
 *
 * @module ui/v3/mobile/SheetShell
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useSheetDrag } from '../../../hooks/useSheetDrag';
import './SheetShell.css';

// ============================================================================
// Props
// ============================================================================

export interface SheetShellProps {
  children: React.ReactNode;
  /** Optional footer slot — rendered above the safe-area padding. */
  footer?: React.ReactNode;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Fixed bottom sheet with three snap stops (collapsed / half / full).
 * Accepts children in a scrollable content area and an optional footer
 * pinned above the device safe-area inset.
 */
export const SheetShell: React.FC<SheetShellProps> = ({ children, footer }) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  const { state, dragHandlers, collapse } = useSheetDrag({
    sheetRef,
    draggingClassName: 'pf3-sheet--dragging',
  });

  // Sync body dataset attr + clean up on unmount so a desktop resize that
  // unmounts SheetShell doesn't leave a stale attribute shifting the canvas.
  useEffect(() => {
    document.body.dataset.mobileSheetState = state;
    return () => {
      delete document.body.dataset.mobileSheetState;
    };
  }, [state]);

  // Escape → collapse (input-guarded: ignore when focus is inside an input).
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement;
      const isInput =
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable;
      if (isInput) return;
      collapse();
    },
    [collapse],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  return (
    <div
      ref={sheetRef}
      className="pf3-sheet"
      data-testid="pf3-sheet"
      data-state={state}
      role="region"
      aria-label="Design controls"
    >
      {/* Drag Handle — ≥44px hit area, role="slider" per spec §11 */}
      <div
        className="pf3-sheet__grabber"
        {...dragHandlers}
        role="slider"
        aria-label="Resize sheet"
        aria-orientation="vertical"
        aria-valuetext={state}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state === 'collapsed' ? 0 : state === 'half' ? 50 : 100}
        tabIndex={0}
        data-pf3-focusable=""
      >
        <div className="pf3-sheet__grip" aria-hidden="true" />
      </div>

      {/* Scrollable content — touch-action: pan-y allows vertical scroll */}
      <div className="pf3-sheet__content">
        {children}
      </div>

      {/* Footer slot — pinned above safe-area inset */}
      {footer != null && (
        <div className="pf3-sheet__footer">{footer}</div>
      )}
    </div>
  );
};

export default SheetShell;
