/**
 * UnlockToast — Celebratory toast for confidence level unlocks.
 *
 * Listens for `pf2:confidence-unlock` custom events dispatched by
 * useConfidence and shows a brief animated toast notification.
 *
 * @module ui/v2/shared/UnlockToast
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import './UnlockToast.css';

// ============================================================================
// Constants
// ============================================================================

const LEVEL_LABELS: Record<number, string> = {
  1: 'Style controls unlocked',
  2: 'Advanced controls unlocked',
  3: 'Full controls unlocked',
};

const TOAST_DURATION_MS = 3000;

// ============================================================================
// Component
// ============================================================================

export const UnlockToast: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [exiting, setExiting] = useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, 300);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { from: number; to: number };
      const label = LEVEL_LABELS[detail.to];
      if (!label) return;

      setMessage(label);
      setExiting(false);
      setVisible(true);
    };

    window.addEventListener('pf2:confidence-unlock', handler);
    return () => window.removeEventListener('pf2:confidence-unlock', handler);
  }, []);

  // Auto-dismiss
  useEffect(() => {
    if (!visible || exiting) return;
    const timer = setTimeout(dismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [visible, exiting, dismiss]);

  if (!visible) return null;

  return (
    <div
      className={`pf2-unlock-toast ${exiting ? 'pf2-unlock-toast--exit' : ''}`}
      role="status"
      aria-live="polite"
    >
      <Sparkles size={16} className="pf2-unlock-toast__icon" />
      <span className="pf2-unlock-toast__message">{message}</span>
    </div>
  );
};
