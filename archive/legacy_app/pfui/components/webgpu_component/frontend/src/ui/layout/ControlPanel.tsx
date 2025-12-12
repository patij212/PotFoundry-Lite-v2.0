/**
 * Control Panel component.
 * 
 * The main sidebar containing all pot configuration controls.
 * 
 * @module ui/layout/ControlPanel
 */

import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import { IconButton, Button } from '../shared';
import {
  DimensionControls,
  StyleControls,
  MeshControls,
  AppearanceControls,
  CameraControls,
  ExportPanel,
  PresetPanel,
  LibraryPanel,
} from '../controls';
import { useUI, useUIActions, useGeometryActions, useStyleActions } from '../../state';
import './ControlPanel.css';

// ============================================================================
// Component
// ============================================================================

/**
 * The main control panel sidebar.
 * 
 * Contains all controls organized in collapsible sections:
 * - Dimensions (height, diameters, thickness)
 * - Style (pattern selection and parameters)
 * - Mesh Quality (resolution settings)
 * - Appearance (colors, wireframe, lighting)
 * - Export (STL download)
 */
export const ControlPanel: React.FC = () => {
  const ui = useUI();
  const { setPanelOpen } = useUIActions();
  const { resetGeometry } = useGeometryActions();
  const { resetStyleOpts } = useStyleActions();
  
  const handleClose = () => setPanelOpen(false);
  
  const handleReset = () => {
    resetGeometry();
    resetStyleOpts();
  };

  if (!ui.panelOpen) {
    return null;
  }

  return (
    <aside className="pf-control-panel">
      {/* Header */}
      <header className="pf-control-panel__header">
        <div className="pf-control-panel__title">
          <h2>PotFoundry</h2>
          <span className="pf-control-panel__version">v2.1</span>
        </div>
        <IconButton
          icon={<X size={18} />}
          aria-label="Close panel"
          onClick={handleClose}
          variant="ghost"
          size="sm"
        />
      </header>
      
      {/* Scrollable Content */}
      <div className="pf-control-panel__content">
        <PresetPanel />
        <DimensionControls />
        <StyleControls />
        <CameraControls />
        <MeshControls />
        <AppearanceControls />
        <ExportPanel />
        <LibraryPanel />
      </div>
      
      {/* Footer Actions */}
      <footer className="pf-control-panel__footer">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          iconLeft={<RotateCcw size={14} />}
        >
          Reset All
        </Button>
      </footer>
    </aside>
  );
};

