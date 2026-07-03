import React, { useCallback, useEffect } from 'react';
import { GlassSurface } from '../primitives/GlassSurface';
import { useAppStore } from '../../../state';
import { useControllerMaybe } from '../../../context';
import {
  IconUndo, IconRedo, IconCameraReset, IconRotate, IconZen, IconFullscreen, IconOrtho, IconGrid,
} from '../icons';
import './PillToolbar.css';

const PillButton: React.FC<{ label: string; onClick: () => void; active?: boolean; children: React.ReactNode }> = ({
  label, onClick, active, children,
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className={`pf3-pillbtn${active ? ' pf3-pillbtn--active' : ''}`}
    onClick={onClick}
    data-pf3-focusable=""
  >
    {children}
  </button>
);

export const PillToolbar: React.FC = () => {
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const toggleZenMode = useAppStore((s) => s.toggleZenMode);
  const toggleFullscreen = useAppStore((s) => s.toggleFullscreen);
  const zenMode = useAppStore((s) => s.ui.zenMode);
  const controller = useControllerMaybe();
  const autoRotate = controller?.cameraState.autoRotate ?? false;
  const isOrtho = (controller?.cameraState.projection ?? 'perspective') === 'ortho';
  const showGrid = controller?.cameraState.showGrid ?? false;

  const resetCamera = useCallback(() => {
    if (controller?.isReady) controller.resetCamera();
  }, [controller]);

  // Keyboard path: AppUIv3 dispatches pf3:reset-camera when R is pressed.
  useEffect(() => {
    window.addEventListener('pf3:reset-camera', resetCamera);
    return () => window.removeEventListener('pf3:reset-camera', resetCamera);
  }, [resetCamera]);

  const toggleAutoRotate = useCallback(() => {
    if (controller?.isReady) controller.toggleAutoRotate();
  }, [controller]);

  const toggleProjection = useCallback(() => {
    if (controller?.isReady) controller.toggleProjection();
  }, [controller]);

  const toggleGrid = useCallback(() => {
    if (controller?.isReady) controller.toggleGrid();
  }, [controller]);

  return (
    <div className="pf3-toolbar" data-zen={zenMode || undefined}>
      <GlassSurface className="pf3-toolbar__pill"><span data-testid="pf3-pill" className="pf3-toolbar__group">
        <PillButton label="Undo" onClick={undo}><IconUndo /></PillButton>
        <PillButton label="Redo" onClick={redo}><IconRedo /></PillButton>
      </span></GlassSurface>
      <GlassSurface className="pf3-toolbar__pill"><span data-testid="pf3-pill" className="pf3-toolbar__group">
        <PillButton label="Reset camera" onClick={resetCamera}><IconCameraReset /></PillButton>
        <PillButton label="Auto-rotate" onClick={toggleAutoRotate} active={autoRotate}><IconRotate /></PillButton>
        <PillButton label="Orthographic view" onClick={toggleProjection} active={isOrtho}><IconOrtho /></PillButton>
        <PillButton label="Grid" onClick={toggleGrid} active={showGrid}><IconGrid /></PillButton>
      </span></GlassSurface>
      <GlassSurface className="pf3-toolbar__pill"><span data-testid="pf3-pill" className="pf3-toolbar__group">
        <PillButton label="Zen mode" onClick={toggleZenMode} active={zenMode}><IconZen /></PillButton>
        <PillButton label="Fullscreen" onClick={toggleFullscreen}><IconFullscreen /></PillButton>
      </span></GlassSurface>
    </div>
  );
};
