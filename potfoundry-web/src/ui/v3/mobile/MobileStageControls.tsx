import React, { useCallback } from 'react';
import { GlassSurface } from '../primitives/GlassSurface';
import { useAppStore } from '../../../state';
import { useControllerMaybe } from '../../../context';
import { IconCameraReset, IconUndo } from '../icons';
import './MobileStageControls.css';

const MobileButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({
  label, onClick, children,
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className="pf3-mobile-btn"
    onClick={onClick}
    data-pf3-focusable=""
  >
    {children}
  </button>
);

export const MobileStageControls: React.FC = () => {
  const undo = useAppStore((s) => s.undo);
  const controller = useControllerMaybe();

  const resetCamera = useCallback(() => {
    if (controller?.isReady) controller.resetCamera();
  }, [controller]);

  return (
    <div className="pf3-mobile-stage-controls">
      <GlassSurface className="pf3-mobile-controls__pill">
        <span className="pf3-mobile-controls__group">
          <MobileButton label="Reset camera" onClick={resetCamera}><IconCameraReset /></MobileButton>
          <MobileButton label="Undo" onClick={undo}><IconUndo /></MobileButton>
        </span>
      </GlassSurface>
    </div>
  );
};
