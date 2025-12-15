/**
 * Camera controls component.
 * 
 * Provides camera mode toggles, view presets, and display options.
 * 
 * @module ui/controls/CameraControls
 */

import React, { useCallback } from 'react';
import {
  Video,
  RotateCcw,
  RefreshCw,
  Grid,
  Box,
  Orbit,
  Eye,
  Maximize2,
  Home,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RotateCw,
} from 'lucide-react';
import { Section, SectionGroup } from '../shared/Section';
import { Button } from '../shared/Button';
import { useControllerMaybe } from '../../context';
import './CameraControls.css';

// ============================================================================
// View Preset Buttons
// ============================================================================

interface ViewPresetButtonProps {
  preset: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso';
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

const ViewPresetButton: React.FC<ViewPresetButtonProps> = ({
  label,
  icon,
  onClick,
  disabled,
}) => (
  <button
    className="pf-camera-preset-btn"
    onClick={onClick}
    disabled={disabled}
    title={label}
  >
    {icon}
    <span>{label}</span>
  </button>
);

// ============================================================================
// Toggle Button
// ============================================================================

interface ToggleButtonProps {
  active?: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

const ToggleButton: React.FC<ToggleButtonProps> = ({
  active,
  label,
  icon,
  onClick,
  disabled,
}) => (
  <button
    className={`pf-camera-toggle-btn ${active ? 'pf-camera-toggle-btn--active' : ''}`}
    onClick={onClick}
    disabled={disabled}
    title={label}
  >
    {icon}
    <span>{label}</span>
  </button>
);

// ============================================================================
// Main Component
// ============================================================================

/**
 * Camera controls panel.
 * 
 * Includes:
 * - View presets (front, back, left, right, top, bottom, iso)
 * - Camera mode toggles (turntable/arcball)
 * - Projection toggle (perspective/ortho)
 * - Auto-rotate toggle
 * - Grid toggle
 */
export const CameraControls: React.FC = () => {
  const controller = useControllerMaybe();
  const isReady = controller?.isReady ?? false;
  const cameraState = controller?.cameraState;

  // DEBUG: Log controller state
  console.log('[CameraControls] isReady:', isReady, 'controller:', !!controller, 'cameraState:', cameraState);

  // View preset handlers
  const handleViewPreset = useCallback(
    (preset: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso') => {
      console.log('[CameraControls] handleViewPreset called:', preset, 'controller:', !!controller);
      controller?.applyViewPreset(preset);
    },
    [controller]
  );

  const handleReset = useCallback(() => {
    console.log('[CameraControls] handleReset called, controller:', !!controller);
    controller?.resetCamera();
  }, [controller]);

  const handleToggleAutoRotate = useCallback(() => {
    controller?.toggleAutoRotate();
  }, [controller]);

  const handleToggleCameraMode = useCallback(() => {
    controller?.toggleCameraMode();
  }, [controller]);

  const handleToggleProjection = useCallback(() => {
    controller?.toggleProjection();
  }, [controller]);

  const handleToggleGrid = useCallback(() => {
    controller?.toggleGrid();
  }, [controller]);

  return (
    <Section title="Camera" icon={<Video size={16} />} defaultOpen={false}>
      {/* View Presets */}
      <SectionGroup label="View Presets">
        <div className="pf-camera-presets-grid">
          <ViewPresetButton
            preset="front"
            label="Front"
            icon={<ArrowUp size={14} />}
            onClick={() => handleViewPreset('front')}
            disabled={!isReady}
          />
          <ViewPresetButton
            preset="back"
            label="Back"
            icon={<ArrowDown size={14} />}
            onClick={() => handleViewPreset('back')}
            disabled={!isReady}
          />
          <ViewPresetButton
            preset="left"
            label="Left"
            icon={<ArrowLeft size={14} />}
            onClick={() => handleViewPreset('left')}
            disabled={!isReady}
          />
          <ViewPresetButton
            preset="right"
            label="Right"
            icon={<ArrowRight size={14} />}
            onClick={() => handleViewPreset('right')}
            disabled={!isReady}
          />
          <ViewPresetButton
            preset="top"
            label="Top"
            icon={<Eye size={14} />}
            onClick={() => handleViewPreset('top')}
            disabled={!isReady}
          />
          <ViewPresetButton
            preset="iso"
            label="Iso"
            icon={<Box size={14} />}
            onClick={() => handleViewPreset('iso')}
            disabled={!isReady}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          onClick={handleReset}
          disabled={!isReady}
          iconLeft={<Home size={14} />}
        >
          Reset View
        </Button>
      </SectionGroup>

      {/* Camera Settings */}
      <SectionGroup label="Camera Settings">
        <div className="pf-camera-toggles">
          <ToggleButton
            active={cameraState?.autoRotate}
            label="Auto-Rotate"
            icon={<RefreshCw size={14} />}
            onClick={handleToggleAutoRotate}
            disabled={!isReady}
          />
          <ToggleButton
            active={cameraState?.mode === 'arcball'}
            label="Arcball"
            icon={<Orbit size={14} />}
            onClick={handleToggleCameraMode}
            disabled={!isReady}
          />
        </div>
        <div className="pf-camera-toggles">
          <ToggleButton
            active={cameraState?.projection === 'ortho'}
            label="Ortho"
            icon={<Maximize2 size={14} />}
            onClick={handleToggleProjection}
            disabled={!isReady}
          />
          <ToggleButton
            active={cameraState?.showGrid}
            label="Grid"
            icon={<Grid size={14} />}
            onClick={handleToggleGrid}
            disabled={!isReady}
          />
        </div>
      </SectionGroup>

      {/* Keyboard Hints */}
      <div className="pf-camera-hints">
        <span className="pf-camera-hint">
          <kbd>R</kbd> Auto-rotate
        </span>
        <span className="pf-camera-hint">
          <kbd>G</kbd> Grid
        </span>
        <span className="pf-camera-hint">
          <kbd>P</kbd> Projection
        </span>
        <span className="pf-camera-hint">
          <kbd>O</kbd> Orbit mode
        </span>
      </div>
    </Section>
  );
};
