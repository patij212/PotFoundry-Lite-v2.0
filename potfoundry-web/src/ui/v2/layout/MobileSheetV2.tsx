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

import React, { useRef, useCallback, useEffect } from 'react';
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

  const handleStateChange = useCallback(
    (newState: SheetState) => {
      document.body.setAttribute('data-mobile-sheet-state', newState);
      if (newState === 'collapsed') {
        handleClose();
      }
    },
    [handleClose]
  );

  const { state, dragHandlers } = useSheetDrag({
    sheetRef,
    onStateChange: handleStateChange,
  });

  // Set initial body attribute and clean up on unmount
  useEffect(() => {
    document.body.setAttribute('data-mobile-sheet-state', state);
    return () => {
      document.body.removeAttribute('data-mobile-sheet-state');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only on mount/unmount

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
      handleTabChange(value);
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
        role="slider"
        aria-label="Resize sheet"
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
        <div className="pf2-mobile-sheet__content" ref={contentRef}>
          <Tabs.Content
            className="pf2-mobile-sheet__tab-content"
            value="shape"
          >
            <ShapeTab />
          </Tabs.Content>

          <Tabs.Content
            className="pf2-mobile-sheet__tab-content"
            value="style"
          >
            <StyleTab />
          </Tabs.Content>

          <Tabs.Content
            className="pf2-mobile-sheet__tab-content"
            value="export"
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
