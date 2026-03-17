import React, { useEffect, useRef, useState, useCallback } from 'react';
import './WelcomeCard.css';
import { useConfidence } from './useConfidence';
import { useControllerMaybe } from '../../../context';
import { useAppStore } from '../../../state';

/**
 * WelcomeCard — First-run onboarding card for v2.1
 *
 * Appears when confidence level is 0. Initializes FourierBloom preset,
 * enables auto-rotate, and provides onboarding actions.
 */
export const WelcomeCard: React.FC = () => {
  const { level, unlock } = useConfidence();
  const [exiting, setExiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const controller = useControllerMaybe();
  const setStyle = useAppStore((s) => s.setStyle);
  const setPanelOpen = useAppStore((s) => s.setPanelOpen);
  const setV2ActiveTab = useAppStore((s) => s.setV2ActiveTab);
  const accentBtnRef = useRef<HTMLButtonElement>(null);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  // FourierBloom preset initialization (only once)
  useEffect(() => {
    if (level === 0 && !initializedRef.current) {
      setStyle('FourierBloom');
      initializedRef.current = true;
    }
  }, [level, setStyle]);

  // Enable auto-rotate when card is visible and controller is ready
  useEffect(() => {
    if (level === 0 && controller?.isReady) {
      controller.setAutoRotate(true);
    }
  }, [level, controller]);

  // Exit animation handler — declared before effects that depend on it
  const handleExit = useCallback((trigger: 'preset-load' | 'auto-unlock') => {
    if (exiting || dismissed) return;
    setExiting(true);
    exitTimeoutRef.current = setTimeout(() => {
      setDismissed(true);
      unlock(trigger);
    }, 220); // --pf2-duration-fast
  }, [exiting, dismissed, unlock]);

  // Escape key listener to dismiss
  useEffect(() => {
    if (level !== 0 || dismissed) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleExit('auto-unlock');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [level, dismissed, handleExit]);

  // Focus accent button on mount
  useEffect(() => {
    if (level === 0 && accentBtnRef.current) {
      accentBtnRef.current.focus();
    }
  }, [level]);

  if (level !== 0 || dismissed) return null;

  return (
    <div
      className={`pf2-welcome${exiting ? ' pf2-welcome-exit' : ''}`}
      role="complementary"
      aria-label="Welcome to PotFoundry"
    >
      <div className="pf2-welcome-wordmark">PotFoundry</div>
      <div className="pf2-welcome-tagline">
        Parametric pots, ready for 3D printing. Pick a style to get started!
      </div>
      <div className="pf2-welcome-buttons">
        <button
          className="pf2-welcome-btn-accent pf2-focus-ring"
          ref={accentBtnRef}
          autoFocus
          onClick={() => {
            handleExit('preset-load');
            setPanelOpen(true);
            setV2ActiveTab('style');
          }}
        >
          Pick a Style
        </button>
        <button
          className="pf2-welcome-btn-ghost pf2-focus-ring"
          onClick={() => handleExit('auto-unlock')}
        >
          I know what I&apos;m doing
        </button>
      </div>
    </div>
  );
};
