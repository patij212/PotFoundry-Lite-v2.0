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
  Orbit,
} from 'lucide-react';
import { IconButton, useToast } from '../shared';
import { HelpDialog } from '../shared/HelpDialog';
import { useUI, useUIActions } from '../../state';
import { useControllerMaybe } from '../../context';
import './Toolbar.css';

// ============================================================================
// Component
// ============================================================================

/**
 * Floating toolbar with quick actions.
 * 
 * Features:
 * - Camera controls (reset, auto-rotate)
 * - View presets (orthographic, grid)
 * - Quick save/load
 */
export const Toolbar: React.FC = () => {
  const ui = useUI();
  const { togglePanel, toggleFullscreen } = useUIActions();
  const controller = useControllerMaybe();
  const toast = useToast();
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

  // Save design as JSON file
  const handleSave = useCallback(() => {
    // Get current state from store
    const store = (window as any).__POTFOUNDRY_STORE__;
    if (!store) {
      console.warn('Store not available for save');
      return;
    }

    const state = store.getState();
    const designData = {
      version: '2.1',
      timestamp: Date.now(),
      name: `PotFoundry Design`,
      geometry: state.geometry,
      style: state.style,
      appearance: {
        colorScheme: state.appearance.colorScheme,
        primaryColor: state.appearance.primaryColor,
        midColor: state.appearance.midColor,
        secondaryColor: state.appearance.secondaryColor,
        showInner: state.appearance.showInner,
        showWireframe: state.appearance.showWireframe,
        gradient: state.appearance.gradient,
        lightingPreset: state.appearance.lightingPreset,
      },
    };

    // Create and download JSON file
    const json = JSON.stringify(designData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PotFoundry_${state.style.name}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Load design from JSON file
  const handleLoad = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const designData = JSON.parse(text);

        // Validate it's a PotFoundry design file
        if (!designData.version || !designData.geometry || !designData.style) {
          toast.error('Invalid design file format');
          return;
        }

        // Get store and apply state
        const store = (window as any).__POTFOUNDRY_STORE__;
        if (!store) {
          console.warn('Store not available for load');
          return;
        }

        const state = store.getState();

        // Apply geometry
        if (designData.geometry) {
          state.setGeometryParams(designData.geometry);
        }

        // Apply style
        if (designData.style) {
          state.setStyle(designData.style.name);
          if (designData.style.opts) {
            state.setStyleOpts(designData.style.opts);
          }
        }

        // Apply appearance
        if (designData.appearance) {
          state.setColorScheme(designData.appearance.colorScheme);
          state.setPrimaryColor(designData.appearance.primaryColor);
          state.setMidColor(designData.appearance.midColor);
          state.setSecondaryColor(designData.appearance.secondaryColor);
          state.setShowWireframe(designData.appearance.showWireframe);
          state.setShowInner(designData.appearance.showInner);
          if (designData.appearance.gradient) {
            state.setBackgroundGradient(designData.appearance.gradient);
          }
          if (designData.appearance.lightingPreset) {
            state.setLightingPreset(designData.appearance.lightingPreset);
          }
        }
      } catch (error) {
        console.error('Failed to load design:', error);
        toast.error('Failed to load design file. Please check the file format.');
      }
    };

    input.click();
  }, []);

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
