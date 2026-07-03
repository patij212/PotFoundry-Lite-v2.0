/**
 * MobileTabBar — thumb-zone navigation bar for the v3 mobile layout.
 *
 * Renders a SegmentedControl (shape / style / export) that fills the available
 * width plus a compact gold Export CTA. Swipe left/right on `contentRef`
 * cycles tabs with haptic feedback; the sequence is clamped at both ends
 * (no wrap: at export, swipe-left is a no-op; at shape, swipe-right is a no-op).
 *
 * Mounted in SheetShell's footer slot (wired in Task 6).
 *
 * @module ui/v3/mobile/MobileTabBar
 */

import React, { type RefObject, useCallback } from 'react';
import { SegmentedControl } from '../primitives/SegmentedControl';
import { useAppStore } from '../../../state';
import type { V3Tab } from '../../../state/types';
import { useSwipeGesture } from '../../../hooks/useSwipeGesture';
import { useHaptics } from '../../../hooks/useHaptics';
import './MobileTabBar.css';

// ============================================================================
// Constants
// ============================================================================

const TABS = [
  { value: 'shape', label: 'Shape' },
  { value: 'style', label: 'Style' },
  { value: 'export', label: 'Export' },
] as const satisfies ReadonlyArray<{ value: V3Tab; label: string }>;

/** Ordered sequence for swipe navigation — index order is the tab order. */
const TAB_ORDER: ReadonlyArray<V3Tab> = ['shape', 'style', 'export'];

// ============================================================================
// Props
// ============================================================================

export interface MobileTabBarProps {
  /** Ref of the scrollable content area where swipe gestures are detected. */
  contentRef: RefObject<HTMLElement>;
  /**
   * Called when the Export CTA is tapped. When provided, AppUIv3 uses the
   * deferred-fire pattern (switch tab → setPendingFire) so ExportFooter's
   * pf3:download listener is mounted before the event fires. Falls back to
   * dispatching pf3:download directly when omitted — keeps the component
   * standalone and existing tests green.
   */
  onExport?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export const MobileTabBar: React.FC<MobileTabBarProps> = ({ contentRef, onExport }) => {
  const activeTab = useAppStore((s) => s.ui.v3ActiveTab);
  const setV3ActiveTab = useAppStore((s) => s.setV3ActiveTab);
  const { tap } = useHaptics();

  /** Switch to a tab — haptic fires only when the tab actually changes. */
  const handleTabChange = useCallback(
    (tab: V3Tab) => {
      if (tab === activeTab) return;
      setV3ActiveTab(tab);
      tap();
    },
    [activeTab, setV3ActiveTab, tap],
  );

  /** Swipe left = advance to next tab. Clamped: no-op when already at export. */
  const handleSwipeLeft = useCallback(() => {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx >= TAB_ORDER.length - 1) return;
    setV3ActiveTab(TAB_ORDER[idx + 1]);
    tap();
  }, [activeTab, setV3ActiveTab, tap]);

  /** Swipe right = go to previous tab. Clamped: no-op when already at shape. */
  const handleSwipeRight = useCallback(() => {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx <= 0) return;
    setV3ActiveTab(TAB_ORDER[idx - 1]);
    tap();
  }, [activeTab, setV3ActiveTab, tap]);

  useSwipeGesture(contentRef, {
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
  });

  const handleExport = useCallback(() => {
    if (onExport) {
      onExport();
    } else {
      window.dispatchEvent(new CustomEvent('pf3:download'));
    }
  }, [onExport]);

  return (
    <div className="pf3-mobile-tab-bar">
      <SegmentedControl<V3Tab>
        options={TABS}
        value={activeTab}
        onChange={handleTabChange}
        ariaLabel="Panel sections"
      />
      <button
        type="button"
        className="pf3-btn pf3-btn--primary pf3-mobile-tab-bar__cta"
        aria-label="Export STL"
        onClick={handleExport}
        data-pf3-focusable=""
      >
        Export
      </button>
    </div>
  );
};
