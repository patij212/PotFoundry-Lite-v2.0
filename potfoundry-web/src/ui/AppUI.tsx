/**
 * App UI Container component.
 * 
 * The main UI overlay that wraps the 3D viewport with controls.
 * This component should be rendered on top of the WebGPU canvas.
 * 
 * @module ui/AppUI
 */

import React, { useState, useCallback } from 'react';
import { Sidebar, Toolbar, StatusBar } from './layout';
import { HelpDialog, ErrorBoundary } from './shared';
import { useKeyboardShortcuts } from '../hooks';
import { useUIActions, useGeometryActions, useStyleActions } from '../state';
import { useExport } from '../hooks/useExport';
import { ConsoleOverlay } from './debug/ConsoleOverlayV2';
import './AppUI.css';

// ============================================================================
// Props
// ============================================================================

export interface AppUIProps {
  /** Children (typically the 3D canvas) */
  children?: React.ReactNode;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Main application UI container.
 * 
 * Provides the complete UI overlay including:
 * - Control panel (sidebar with all settings)
 * - Toolbar (top floating bar with quick actions)
 * - Status bar (bottom bar with metrics)
 * - Help dialog (keyboard shortcuts)
 * - Error boundary (graceful error handling)
 * - Keyboard shortcuts support
 * 
 * @example
 * ```tsx
 * <AppUI>
 *   <canvas ref={canvasRef} />
 * </AppUI>
 * ```
 */
export const AppUI: React.FC<AppUIProps> = ({ children }) => {
  const [helpOpen, setHelpOpen] = useState(false);

  const { togglePanel } = useUIActions();
  const { resetGeometry } = useGeometryActions();
  const { resetStyleOpts } = useStyleActions();
  const { exportSTL } = useExport();

  // Keyboard shortcut handlers
  const handleExport = useCallback(() => {
    exportSTL('binary');
  }, [exportSTL]);

  const handleReset = useCallback(() => {
    resetGeometry();
    resetStyleOpts();
  }, [resetGeometry, resetStyleOpts]);

  const handleTogglePanel = useCallback(() => {
    togglePanel();
  }, [togglePanel]);

  const handleShowHelp = useCallback(() => {
    setHelpOpen(true);
  }, []);

  const handleEscape = useCallback(() => {
    setHelpOpen(false);
  }, []);

  // Register keyboard shortcuts
  useKeyboardShortcuts({
    onExport: handleExport,
    onReset: handleReset,
    onTogglePanel: handleTogglePanel,
    onShowHelp: handleShowHelp,
    onEscape: handleEscape,
    enabled: true,
  });

  return (
    <ErrorBoundary name="AppUI">
      <div className="pf-app-ui">
        {/* 3D Viewport (canvas goes here as children) - only render if children provided */}
        {children && (
          <div className="pf-app-ui__viewport">
            <ErrorBoundary name="Viewport">
              {children}
            </ErrorBoundary>
          </div>
        )}

        {/* UI Overlays */}
        <ErrorBoundary name="Sidebar">
          <Sidebar />
        </ErrorBoundary>
        <ErrorBoundary name="Toolbar">
          <Toolbar />
        </ErrorBoundary>
        <StatusBar />


        {/* Help Dialog */}
        <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

        {/* Debug Console */}
        <ConsoleOverlay />
      </div>
    </ErrorBoundary>
  );
};
