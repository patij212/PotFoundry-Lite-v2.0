/**
 * MobileSheetV2 — Bottom sheet overlay for mobile viewports.
 *
 * Uses `useSheetDrag` for gesture-driven height changes with
 * three snap states (collapsed, half, full). Reuses the same
 * tab structure as SidebarV2 for Shape/Style/Export navigation.
 *
 * Sets `body[data-mobile-sheet-state]` on every state change
 * so other elements can react via CSS attribute selectors.
 *
 * @module ui/v2/layout/MobileSheetV2
 */

import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Layers, Paintbrush, Download } from 'lucide-react';
import { ShapeTab } from '../tabs/ShapeTab';
import { StyleTab } from '../tabs/StyleTab';
import { ExportTab } from '../tabs/ExportTab';
import { StatusFooter } from './StatusFooter';
import { useSheetDrag } from '../../../hooks/useSheetDrag';
import type { SheetState } from '../../../hooks/useSheetDrag';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import './MobileSheetV2.css';

// ============================================================================
// Constants
// ============================================================================

/** Tab configuration — matches SidebarV2 TAB_CONFIG */
const TAB_CONFIG = [
  { id: 'shape' as const, label: 'Shape', icon: Layers },
  { id: 'style' as const, label: 'Style', icon: Paintbrush },
  { id: 'export' as const, label: 'Export', icon: Download },
] as const;

const TAB_ORDER: ReadonlyArray<'shape' | 'style' | 'export'> = [
  'shape',
  'style',
  'export',
];

// ============================================================================
// Props
// ============================================================================

export interface MobileSheetV2Props {
  /** Currently active tab id */
  activeTab: 'shape' | 'style' | 'export';
  /** Called when user switches tabs */
  handleTabChange: (value: string) => void;
  /** Called when close gesture triggers */
  handleClose: () => void;
  /** Screen reader announcer */
  announce: (message: string) => void;
  /** Haptic tap callback */
  tap: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Bottom sheet for mobile that replaces the desktop sidebar.
 * Supports drag gestures, tab switching via swipe, and three snap states.
 */
export const MobileSheetV2: React.FC<MobileSheetV2Props> = ({
  activeTab,
  handleTabChange,
  handleClose,
  announce,
  tap,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Track tab navigation direction for directional animation
  const prevTabRef = useRef(activeTab);
  const [tabDirection, setTabDirection] = useState(1);

  const tabContentStyle = useMemo(
    () => ({ '--pf2-tab-direction': tabDirection } as React.CSSProperties),
    [tabDirection]
  );

  const handleStateChange = useCallback(
    (newState: SheetState) => {
      document.body.setAttribute('data-mobile-sheet-state', newState);
      if (newState === 'collapsed') {
        handleClose();
      }
    },
    [handleClose]
  );

  const { state, dragHandlers, toggle } = useSheetDrag({
    sheetRef,
    onStateChange: handleStateChange,
  });

  // Double-tap handle to snap to full
  const lastTapRef = useRef(0);
  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double-tap detected — snap to full or collapse if already full
      if (state === 'full') {
        toggle(); // cycles to collapsed
      } else {
        // Snap directly to full
        const el = sheetRef.current;
        if (el) {
          const fullH = window.innerHeight * 0.85;
          el.style.height = `${fullH}px`;
        }
        handleStateChange('full' as SheetState);
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [state, toggle, sheetRef, handleStateChange]);

  // Keep body attribute in sync with sheet state; clean up on unmount
  useEffect(() => {
    document.body.setAttribute('data-mobile-sheet-state', state);
    return () => {
      document.body.removeAttribute('data-mobile-sheet-state');
    };
  }, [state]);

  // Swipe left/right on content area to switch tabs
  useSwipeGesture(contentRef, {
    onSwipeLeft: () => {
      const index = TAB_ORDER.indexOf(activeTab);
      if (index < TAB_ORDER.length - 1) {
        const next = TAB_ORDER[index + 1];
        handleTabChange(next);
        tap();
      }
    },
    onSwipeRight: () => {
      const index = TAB_ORDER.indexOf(activeTab);
      if (index > 0) {
        const prev = TAB_ORDER[index - 1];
        handleTabChange(prev);
        tap();
      }
    },
  });

  const onTabChange = useCallback(
    (value: string) => {
      const tab = value as 'shape' | 'style' | 'export';
      const prevIndex = TAB_ORDER.indexOf(prevTabRef.current);
      const nextIndex = TAB_ORDER.indexOf(tab);
      setTabDirection(nextIndex >= prevIndex ? 1 : -1);
      prevTabRef.current = tab;
      handleTabChange(value);
      contentRef.current?.scrollTo({ top: 0 });
      const label = TAB_CONFIG.find((t) => t.id === value)?.label ?? value;
      announce(`${label} tab selected`);
      tap();
    },
    [handleTabChange, announce, tap]
  );

  return (
    <div
      ref={sheetRef}
      className="pf2-mobile-sheet"
      role="region"
      aria-label="Design controls"
    >
      {/* Drag Handle */}
      <div
        className="pf2-mobile-sheet__handle"
        {...dragHandlers}
        onClick={handleDoubleTap}
        role="slider"
        aria-label="Resize sheet (double-tap for full)"
        aria-orientation="vertical"
        aria-valuetext={state}
        tabIndex={0}
      >
        <div className="pf2-mobile-sheet__grip" />
      </div>

      {/* Tabbed Navigation */}
      <Tabs.Root
        className="pf2-mobile-sheet__tabs-root"
        value={activeTab}
        onValueChange={onTabChange}
      >
        <Tabs.List
          className="pf2-mobile-sheet__tab-list"
          aria-label="Design sections"
        >
          {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
            <Tabs.Trigger
              key={id}
              className="pf2-mobile-sheet__tab pf2-focus-ring"
              value={id}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* Scrollable Content */}
        <div className="pf2-mobile-sheet__content" ref={contentRef} style={tabContentStyle}>
          <Tabs.Content
            className="pf2-mobile-sheet__tab-content"
            value="shape"
            forceMount
          >
            <ShapeTab />
          </Tabs.Content>

          <Tabs.Content
            className="pf2-mobile-sheet__tab-content"
            value="style"
            forceMount
          >
            <StyleTab />
          </Tabs.Content>

          <Tabs.Content
            className="pf2-mobile-sheet__tab-content"
            value="export"
            forceMount
          >
            <ExportTab />
          </Tabs.Content>
        </div>
      </Tabs.Root>

      {/* Persistent Footer */}
      <StatusFooter />
    </div>
  );
};
