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

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { X, GripVertical, Layers, Paintbrush, Download } from 'lucide-react';
import { IconButtonV2 } from '../controls/ButtonV2';
import { ShapeTab } from '../tabs/ShapeTab';
import { StyleTab } from '../tabs/StyleTab';
import { ExportTab } from '../tabs/ExportTab';
import { StatusFooter } from './StatusFooter';
import { useAppStore } from '../../../state';
import { useAnnounce } from '../shared/Announcer';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { useHaptics } from '../hooks/useHaptics';
import { useMobile } from '../../../hooks/useMobile';
import { MobileSheetV2 } from './MobileSheetV2';
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
const TAB_ORDER: Array<'shape' | 'style' | 'export'> = ['shape', 'style', 'export'];

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
  const { tap } = useHaptics();
  const { isMobile } = useMobile();

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
  const contentRef = useRef<HTMLDivElement>(null);

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

  // Track tab navigation direction for directional animation
  const prevTabRef = useRef(activeTab);
  const [tabDirection, setTabDirection] = useState(1);

  // Tab change handler
  const handleTabChange = useCallback(
    (value: string) => {
      const tab = value as 'shape' | 'style' | 'export';
      const prevIndex = TAB_ORDER.indexOf(prevTabRef.current);
      const nextIndex = TAB_ORDER.indexOf(tab);
      setTabDirection(nextIndex >= prevIndex ? 1 : -1);
      prevTabRef.current = tab;
      setV2ActiveTab(tab);
      contentRef.current?.scrollTo({ top: 0 });
      const label = TAB_CONFIG.find((t) => t.id === tab)?.label ?? tab;
      announce(`${label} tab selected`);
      tap();
    },
    [setV2ActiveTab, announce, tap]
  );

  const tabContentStyle = useMemo(
    () => ({ '--pf2-tab-direction': tabDirection } as React.CSSProperties),
    [tabDirection]
  );

  useSwipeGesture(contentRef, {
    onSwipeLeft: () => {
      const index = TAB_ORDER.indexOf(activeTab);
      if (index < TAB_ORDER.length - 1) {
        handleTabChange(TAB_ORDER[index + 1]);
      }
    },
    onSwipeRight: () => {
      const index = TAB_ORDER.indexOf(activeTab);
      if (index > 0) {
        handleTabChange(TAB_ORDER[index - 1]);
      }
    },
  });

  // Animated close — play exit animation, then unmount
  const [isClosing, setIsClosing] = useState(false);
  const handleClose = useCallback(() => {
    setIsClosing(true);
  }, []);

  useEffect(() => {
    if (!isClosing) return;
    const timer = setTimeout(() => {
      // Only close the panel if not zen mode (zen mode keeps panel state)
      if (!useAppStore.getState().ui.zenMode) {
        setPanelOpen(false);
      }
      setIsClosing(false);
    }, 220); // matches --pf2-duration-fast
    return () => clearTimeout(timer);
  }, [isClosing, setPanelOpen]);

  // Reset closing state when panel opens externally
  useEffect(() => {
    if (panelOpen) setIsClosing(false);
  }, [panelOpen]);

  // Animate out when zen mode activates
  const prevZenRef = useRef(zenMode);
  useEffect(() => {
    if (zenMode && !prevZenRef.current && panelOpen) {
      setIsClosing(true);
    }
    prevZenRef.current = zenMode;
  }, [zenMode, panelOpen]);

  // Hidden when panel is closed (zen mode closing is handled by animation)
  if (!panelOpen) return null;
  // After close animation finishes during zen mode, hide
  if (zenMode && !isClosing) return null;

  // On mobile, render the bottom sheet instead of the desktop sidebar
  if (isMobile) {
    return (
      <MobileSheetV2
        activeTab={activeTab}
        handleTabChange={handleTabChange}
        handleClose={handleClose}
        announce={announce}
        tap={tap}
      />
    );
  }

  return (
    <aside
      ref={sidebarRef}
      className={clsx(
        'pf2-sidebar',
        isResizing && 'pf2-sidebar--resizing',
        isClosing && 'pf2-sidebar--closing'
      )}
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

        {/* Tab Content */}
        <div className="pf2-sidebar__content" ref={contentRef} style={tabContentStyle}>
          <Tabs.Content className="pf2-sidebar__tab-content" value="shape" forceMount>
            <ShapeTab />
          </Tabs.Content>

          <Tabs.Content className="pf2-sidebar__tab-content" value="style" forceMount>
            <StyleTab />
          </Tabs.Content>

          <Tabs.Content className="pf2-sidebar__tab-content" value="export" forceMount>
            <ExportTab />
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
