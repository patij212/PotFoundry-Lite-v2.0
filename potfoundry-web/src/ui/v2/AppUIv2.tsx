/**
 * PotFoundry UI v2 — Root Layout Component
 *
 * Wires the full v2 layout: ToolbarV2 + SidebarV2 (with StatusFooter)
 * overlaid on the viewport. Lazy-loaded via React.lazy() so v1 users
 * pay zero bundle cost.
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
import { useColorMode } from './hooks/useColorMode';
import { ErrorBoundary } from '../shared';
import './AppUIv2.css';
import { WelcomeCard } from './onboarding/WelcomeCard';
import { UnlockToast } from './shared/UnlockToast';

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

export const AppUIv2: React.FC = () => {
  const toggleZenMode = useAppStore((s) => s.toggleZenMode);
  const setV2ActiveTab = useAppStore((s) => s.setV2ActiveTab);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const uiTheme = useAppStore((s) => s.ui.uiTheme);
  const panelOpen = useAppStore((s) => s.ui.panelOpen);
  const zenMode = useAppStore((s) => s.ui.zenMode);
  const density = useAppStore((s) => s.ui.density);
  const { resolvedTheme } = useColorMode();

  // Sync data-theme to <html> so portal-rendered content (modals, drawers,
  // dialogs) inherits the correct theme regardless of DOM position.
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [resolvedTheme]);

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

      // Undo/redo shortcuts — handle before plain Z logic.
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();

        if (key === 'z' && e.shiftKey) {
          e.preventDefault();
          redo();
          return;
        }

        if (key === 'y') {
          e.preventDefault();
          redo();
          return;
        }

        if (key === 'z') {
          e.preventDefault();
          undo();
          return;
        }
      }

      // Z — toggle zen mode
      if (e.key === 'z' || e.key === 'Z') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          toggleZenMode();
        }
      }

      // D — trigger download (dispatches custom event for StatusFooter)
      if (e.key === 'd' || e.key === 'D') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('pf2:download'));
        }
      }

      // R — reset camera (dispatches custom event for ToolbarV2/controller)
      if (e.key === 'r' || e.key === 'R') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('pf2:reset-camera'));
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
  }, [uiTheme, toggleZenMode, setV2ActiveTab, undo, redo]);

  return (
    <ErrorBoundary name="AppUIv2">
      <AnnouncerProvider>
        <div
          className="pf2-root pf2-layout"
          data-theme={resolvedTheme}
          data-density={density}
          data-zen={zenMode || undefined}
          data-panel-open={panelOpen || undefined}
        >
          {/* Toolbar — always visible (even in zen mode) */}
          <ErrorBoundary name="ToolbarV2">
            <ToolbarV2 />
          </ErrorBoundary>

          {/* Sidebar — hidden in zen mode, respects panelOpen */}
          <ErrorBoundary name="SidebarV2">
            <SidebarV2 />
          </ErrorBoundary>
          {/* WelcomeCard — onboarding for first-run */}
          <ErrorBoundary name="WelcomeCard">
            <WelcomeCard />
          </ErrorBoundary>

          {/* Toast for confidence unlock celebrations */}
          <UnlockToast />
        </div>
      </AnnouncerProvider>
    </ErrorBoundary>
  );
};

export default AppUIv2;
