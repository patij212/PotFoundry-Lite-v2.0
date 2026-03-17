/**
 * SettingsPopover — Settings flyout for v2.
 *
 * Provides theme switching, haptics toggle, and confidence reset.
 * Follows the same pattern as CameraPopover.
 *
 * @module ui/v2/shared/SettingsPopover
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { FocusScope } from '@radix-ui/react-focus-scope';
import { useAppStore } from '../../../state';
import { useConfidence } from '../onboarding/useConfidence';
import { useAnnounce } from './Announcer';
import { useRadioGroupKeys } from '../hooks/useRadioGroupKeys';
import clsx from 'clsx';
import './SettingsPopover.css';

// ============================================================================
// Types
// ============================================================================

interface SettingsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

// ============================================================================
// Component
// ============================================================================

export const SettingsPopover: React.FC<SettingsPopoverProps> = ({
  open,
  onOpenChange,
  triggerRef,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const uiTheme = useAppStore((s) => s.ui.uiTheme);
  const setUITheme = useAppStore((s) => s.setUITheme);
  const density = useAppStore((s) => s.ui.density);
  const setDensity = useAppStore((s) => s.setDensity);
  const hapticsEnabled = useAppStore((s) => s.ui.hapticsEnabled);
  const setHapticsEnabled = useAppStore((s) => s.setHapticsEnabled);
  const { level, resetAll } = useConfidence();
  const announce = useAnnounce();
  const radioGroupKeys = useRadioGroupKeys();

  const handleTheme = useCallback(
    (theme: 'v2' | 'classic') => {
      setUITheme(theme);
      announce(`Theme: ${theme === 'v2' ? 'Modern' : 'Classic'}`);
    },
    [setUITheme, announce]
  );

  const handleDensity = useCallback(
    (d: 'compact' | 'comfortable' | 'spacious') => {
      setDensity(d);
      announce(`Density: ${d}`);
    },
    [setDensity, announce]
  );

  const handleHaptics = useCallback(() => {
    setHapticsEnabled(!hapticsEnabled);
    announce(`Haptics ${hapticsEnabled ? 'off' : 'on'}`);
  }, [setHapticsEnabled, hapticsEnabled, announce]);

  const handleReset = useCallback(() => {
    resetAll();
    announce('UI complexity reset to beginner');
  }, [resetAll, announce]);

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
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [open, onOpenChange, triggerRef]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="pf2-settings-popover"
      role="dialog"
      aria-label="Settings"
    >
      <FocusScope trapped loop>
        <div className="pf2-settings-popover__content">
          {/* UI Theme */}
          <div className="pf2-settings-popover__row">
            <span className="pf2-settings-popover__label pf2-text-label">UI Theme</span>
            <div className="pf2-settings-popover__toggle-group" role="radiogroup" aria-label="UI theme" onKeyDown={radioGroupKeys}>
              <button
                className={clsx(
                  'pf2-settings-popover__toggle pf2-focus-ring',
                  uiTheme === 'v2' && 'pf2-settings-popover__toggle--active'
                )}
                onClick={() => handleTheme('v2')}
                role="radio"
                aria-checked={uiTheme === 'v2'}
              >
                Modern
              </button>
              <button
                className={clsx(
                  'pf2-settings-popover__toggle pf2-focus-ring',
                  uiTheme === 'classic' && 'pf2-settings-popover__toggle--active'
                )}
                onClick={() => handleTheme('classic')}
                role="radio"
                aria-checked={uiTheme === 'classic'}
              >
                Classic
              </button>
            </div>
          </div>

          <div className="pf2-settings-popover__divider" />

          {/* Display Density */}
          <div className="pf2-settings-popover__row">
            <span className="pf2-settings-popover__label pf2-text-label">Density</span>
            <div className="pf2-settings-popover__toggle-group" role="radiogroup" aria-label="Display density" onKeyDown={radioGroupKeys}>
              {(['compact', 'comfortable', 'spacious'] as const).map((d) => (
                <button
                  key={d}
                  className={clsx(
                    'pf2-settings-popover__toggle pf2-focus-ring',
                    density === d && 'pf2-settings-popover__toggle--active'
                  )}
                  onClick={() => handleDensity(d)}
                  role="radio"
                  aria-checked={density === d}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="pf2-settings-popover__divider" />

          {/* Haptics */}
          <div className="pf2-settings-popover__row">
            <button
              className={clsx(
                'pf2-settings-popover__check pf2-focus-ring',
                hapticsEnabled && 'pf2-settings-popover__check--active'
              )}
              onClick={handleHaptics}
              role="checkbox"
              aria-checked={hapticsEnabled}
            >
              <span className="pf2-settings-popover__check-indicator" />
              Haptic Feedback
            </button>
          </div>

          <div className="pf2-settings-popover__divider" />

          {/* Confidence Reset */}
          <div className="pf2-settings-popover__row">
            <span className="pf2-settings-popover__label pf2-text-label">
              UI Complexity: Level {level}
            </span>
            <button
              className="pf2-settings-popover__action pf2-focus-ring"
              onClick={handleReset}
              disabled={level === 0}
            >
              Reset to Beginner
            </button>
          </div>
        </div>
      </FocusScope>
    </div>
  );
};
