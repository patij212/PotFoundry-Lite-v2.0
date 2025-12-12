/**
 * Toolbar component.
 * 
 * The floating toolbar at the top of the viewport with quick actions.
 * Includes camera controls, view presets, and quick actions.
 * 
 * @module ui/layout/Toolbar
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
  Grid,
  Box,
  Eye,
  Orbit,
  Move3D,
} from 'lucide-react';
import { IconButton } from '../shared';
import { HelpDialog } from '../shared/HelpDialog';
import { useUI, useUIActions } from '../../state';
import { useControllerMaybe } from '../../context';
import './Toolbar.css';

// ============================================================================
// Component
// ============================================================================

/**
 * The floating toolbar with quick actions.
 * 
 * Includes:
 * - Menu toggle (opens control panel)
 * - Camera controls (reset view, mode toggle, auto-rotate)
 * - View controls (grid, projection)
 * - Fullscreen toggle
 * - Quick save/load
 */
export const Toolbar: React.FC = () => {
  const ui = useUI();
  const { togglePanel, toggleFullscreen, openModal } = useUIActions();
  const controller = useControllerMaybe();
  const [helpOpen, setHelpOpen] = useState(false);
  
  // Camera controls with controller
  const handleResetCamera = useCallback(() => {
    if (controller?.isReady) {
      controller.resetCamera();
    }
  }, [controller]);
  
  const handleScreenshot = useCallback(async () => {
    if (!controller?.isReady) return;
    
    const blob = await controller.takeScreenshot();
    if (blob) {
      // Create download link
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
  
  const handleToggleAutoRotate = useCallback(() => {
    if (controller?.isReady) {
      controller.toggleAutoRotate();
    }
  }, [controller]);
  
  const handleToggleCameraMode = useCallback(() => {
    if (controller?.isReady) {
      controller.toggleCameraMode();
    }
  }, [controller]);
  
  const handleToggleGrid = useCallback(() => {
    if (controller?.isReady) {
      controller.toggleGrid();
    }
  }, [controller]);
  
  const handleToggleProjection = useCallback(() => {
    if (controller?.isReady) {
      controller.toggleProjection();
    }
  }, [controller]);
  
  const handleSave = () => {
    openModal('presets');
  };
  
  const handleLoad = () => {
    openModal('presets');
  };

  const isControllerReady = controller?.isReady ?? false;

  return (
    <div className="pf-toolbar">
      {/* Left group - Menu */}
      <div className="pf-toolbar__group">
        {!ui.panelOpen && (
          <IconButton
            icon={<Menu size={20} />}
            aria-label="Open menu"
            onClick={togglePanel}
            variant="secondary"
          />
        )}
      </div>
      
      {/* Center group - Camera & View Controls */}
      <div className="pf-toolbar__group pf-toolbar__group--center">
        <IconButton
          icon={<RotateCcw size={18} />}
          aria-label="Reset camera view (press Home)"
          onClick={handleResetCamera}
          variant="ghost"
          size="sm"
          disabled={!isControllerReady}
        />
        <IconButton
          icon={<RefreshCw size={18} />}
          aria-label="Toggle auto-rotate (press R)"
          onClick={handleToggleAutoRotate}
          variant="ghost"
          size="sm"
          disabled={!isControllerReady}
        />
        <IconButton
          icon={<Orbit size={18} />}
          aria-label="Toggle camera mode: turntable/arcball (press O)"
          onClick={handleToggleCameraMode}
          variant="ghost"
          size="sm"
          disabled={!isControllerReady}
        />
        <IconButton
          icon={<Box size={18} />}
          aria-label="Toggle projection: perspective/ortho (press P)"
          onClick={handleToggleProjection}
          variant="ghost"
          size="sm"
          disabled={!isControllerReady}
        />
        <IconButton
          icon={<Grid size={18} />}
          aria-label="Toggle grid (press G)"
          onClick={handleToggleGrid}
          variant="ghost"
          size="sm"
          disabled={!isControllerReady}
        />
        <IconButton
          icon={<Camera size={18} />}
          aria-label="Take screenshot"
          onClick={handleScreenshot}
          variant="ghost"
          size="sm"
          disabled={!isControllerReady}
        />
      </div>
      
      {/* Right group - Actions */}
      <div className="pf-toolbar__group">
        <IconButton
          icon={<HelpCircle size={18} />}
          aria-label="Help &amp; shortcuts (press ?)"
          onClick={() => setHelpOpen(true)}
          variant="ghost"
          size="sm"
        />
        <IconButton
          icon={<FolderOpen size={18} />}
          aria-label="Load preset"
          onClick={handleLoad}
          variant="ghost"
          size="sm"
        />
        <IconButton
          icon={<Save size={18} />}
          aria-label="Save preset"
          onClick={handleSave}
          variant="ghost"
          size="sm"
        />
        <IconButton
          icon={ui.fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          aria-label={ui.fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          onClick={toggleFullscreen}
          variant="ghost"
          size="sm"
        />
      </div>
      
      {/* Help Dialog */}
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
};
