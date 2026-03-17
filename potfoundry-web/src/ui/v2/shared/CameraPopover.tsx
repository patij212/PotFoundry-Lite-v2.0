/**
 * CameraPopover — Camera settings flyout.
 *
 * Anchored below the toolbar, provides camera mode, projection,
 * grid/axis toggles, and view preset buttons.
 *
 * @module ui/v2/shared/CameraPopover
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { FocusScope } from '@radix-ui/react-focus-scope';
import { useControllerMaybe } from '../../../context';
import { useAnnounce } from './Announcer';
import { useRadioGroupKeys } from '../hooks/useRadioGroupKeys';
import clsx from 'clsx';
import './CameraPopover.css';

// ============================================================================
// Types
// ============================================================================

interface CameraPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

// ============================================================================
// Constants
// ============================================================================

const VIEW_PRESETS = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'iso', label: 'Iso' },
] as const;

// ============================================================================
// Component
// ============================================================================

export const CameraPopover: React.FC<CameraPopoverProps> = ({
  open,
  onOpenChange,
  triggerRef,
}) => {
  const controller = useControllerMaybe();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange, triggerRef]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        onOpenChange(false);
      }
    };
    // Use setTimeout to avoid immediately closing from the opening click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [open, onOpenChange, triggerRef]);

  const announce = useAnnounce();
  const radioGroupKeys = useRadioGroupKeys();
  const cameraState = controller?.cameraState;
  const isReady = controller?.isReady ?? false;

  const handleCameraMode = useCallback(
    (mode: 'turntable' | 'arcball') => {
      controller?.setCameraMode(mode);
      announce(`Camera mode: ${mode}`);
    },
    [controller, announce]
  );

  const handleProjection = useCallback(
    (mode: 'perspective' | 'ortho') => {
      controller?.setProjection(mode);
      announce(`Projection: ${mode === 'ortho' ? 'orthographic' : mode}`);
    },
    [controller, announce]
  );

  const handleViewPreset = useCallback(
    (preset: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso') => {
      controller?.applyViewPreset(preset);
      announce(`View: ${preset}`);
    },
    [controller, announce]
  );

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="pf2-camera-popover"
      role="dialog"
      aria-label="Camera settings"
    >
      <FocusScope trapped loop>
        <div className="pf2-camera-popover__content">
          {/* Camera Mode */}
          <div className="pf2-camera-popover__row">
            <span className="pf2-camera-popover__label pf2-text-label">Mode</span>
            <div className="pf2-camera-popover__toggle-group" role="radiogroup" aria-label="Camera mode" onKeyDown={radioGroupKeys}>
              <button
                className={clsx(
                  'pf2-camera-popover__toggle pf2-focus-ring',
                  cameraState?.mode === 'turntable' && 'pf2-camera-popover__toggle--active'
                )}
                onClick={() => handleCameraMode('turntable')}
                disabled={!isReady}
                role="radio"
                aria-checked={cameraState?.mode === 'turntable'}
              >
                Turntable
              </button>
              <button
                className={clsx(
                  'pf2-camera-popover__toggle pf2-focus-ring',
                  cameraState?.mode === 'arcball' && 'pf2-camera-popover__toggle--active'
                )}
                onClick={() => handleCameraMode('arcball')}
                disabled={!isReady}
                role="radio"
                aria-checked={cameraState?.mode === 'arcball'}
              >
                Arcball
              </button>
            </div>
          </div>

          {/* Projection */}
          <div className="pf2-camera-popover__row">
            <span className="pf2-camera-popover__label pf2-text-label">Projection</span>
            <div className="pf2-camera-popover__toggle-group" role="radiogroup" aria-label="Projection" onKeyDown={radioGroupKeys}>
              <button
                className={clsx(
                  'pf2-camera-popover__toggle pf2-focus-ring',
                  cameraState?.projection === 'perspective' && 'pf2-camera-popover__toggle--active'
                )}
                onClick={() => handleProjection('perspective')}
                disabled={!isReady}
                role="radio"
                aria-checked={cameraState?.projection === 'perspective'}
              >
                Persp
              </button>
              <button
                className={clsx(
                  'pf2-camera-popover__toggle pf2-focus-ring',
                  cameraState?.projection === 'ortho' && 'pf2-camera-popover__toggle--active'
                )}
                onClick={() => handleProjection('ortho')}
                disabled={!isReady}
                role="radio"
                aria-checked={cameraState?.projection === 'ortho'}
              >
                Ortho
              </button>
            </div>
          </div>

          <div className="pf2-camera-popover__divider" />

          {/* Grid & Axis toggles */}
          <div className="pf2-camera-popover__row">
            <button
              className={clsx(
                'pf2-camera-popover__check pf2-focus-ring',
                cameraState?.showGrid && 'pf2-camera-popover__check--active'
              )}
              onClick={() => { controller?.toggleGrid(); announce(cameraState?.showGrid ? 'Grid hidden' : 'Grid visible'); }}
              disabled={!isReady}
              role="checkbox"
              aria-checked={cameraState?.showGrid ?? false}
            >
              <span className="pf2-camera-popover__check-indicator" />
              Grid
            </button>
            <button
              className={clsx(
                'pf2-camera-popover__check pf2-focus-ring',
                cameraState?.showAxis && 'pf2-camera-popover__check--active'
              )}
              onClick={() => { controller?.toggleAxis(); announce(cameraState?.showAxis ? 'Axis hidden' : 'Axis visible'); }}
              disabled={!isReady}
              role="checkbox"
              aria-checked={cameraState?.showAxis ?? false}
            >
              <span className="pf2-camera-popover__check-indicator" />
              Axis
            </button>
          </div>

          <div className="pf2-camera-popover__divider" />

          {/* View Presets */}
          <div className="pf2-camera-popover__section">
            <span className="pf2-camera-popover__label pf2-text-label">View</span>
            <div className="pf2-camera-popover__preset-grid">
              {VIEW_PRESETS.map((vp) => (
                <button
                  key={vp.id}
                  className="pf2-camera-popover__preset pf2-focus-ring"
                  onClick={() => handleViewPreset(vp.id)}
                  disabled={!isReady}
                >
                  {vp.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </FocusScope>
    </div>
  );
};
