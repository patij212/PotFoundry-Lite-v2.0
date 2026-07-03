import React, { useCallback, useEffect, useRef, useState } from 'react';
import './ParamRow.css';
import { useTouchMode } from '../mobile/TouchModeContext';
import { useHaptics } from '../../../hooks/useHaptics';

export interface ParamRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  defaultValue?: number;
  onChange: (value: number) => void;
  onInteractionStart?: () => void;
  onValueCommit?: () => void;
  'data-testid'?: string;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function snap(v: number, step: number, min: number): number {
  const snapped = min + Math.round((v - min) / step) * step;
  // avoid float debris like 120.00000000001
  const dec = (String(step).split('.')[1] ?? '').length;
  return Number(snapped.toFixed(dec));
}

interface ScrubState {
  startX: number;
  startValue: number;
  /** True once the pointer has moved more than 4px from startX. */
  active: boolean;
}

interface LongPressState {
  dir: 1 | -1;
  startValue: number;
  /** Steps fired so far (0 = delay timer not yet fired). */
  count: number;
  delayTimer: ReturnType<typeof setTimeout> | null;
  repeatInterval: ReturnType<typeof setInterval> | null;
}

export const ParamRow: React.FC<ParamRowProps> = ({
  label, value, min, max, step, unit, defaultValue,
  onChange, onInteractionStart, onValueCommit, 'data-testid': testId,
}) => {
  const touch = useTouchMode();
  const { tap } = useHaptics();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const interacting = useRef(false);
  // F1/F2: set true before setEditing(false) so the trailing unmount-blur is a no-op
  const skipBlurRef = useRef(false);
  // F3: holds the pending single-click timer; second click cancels it and resets
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Scrub: tracks pointer-drag gesture state (shared between desktop chip and touch row)
  const scrubRef = useRef<ScrubState | null>(null);
  // Scrub: set on pointerup after a scrub so the following click is suppressed
  const suppressClickRef = useRef(false);
  // Touch long-press state
  const longPressRef = useRef<LongPressState | null>(null);
  // Suppress the click that fires immediately after a long-press pointerup
  const suppressStepperClickRef = useRef(false);
  // Clamp haptic: fire only on the first step that hits the boundary, not on every repeat
  const clampHapticFiredRef = useRef(false);
  // F1: stable ref so unmount cleanup can call the latest onValueCommit
  const onValueCommitRef = useRef(onValueCommit);
  onValueCommitRef.current = onValueCommit;

  // F4: snap then clamp — rounding cannot push the value past bounds
  const apply = useCallback(
    (raw: number, commit: boolean) => {
      const next = clamp(snap(raw, step, min), min, max);
      onChange(next);
      if (commit) onValueCommit?.();
    },
    [min, max, step, onChange, onValueCommit],
  );

  /**
   * Apply a single stepper step with haptic feedback.
   * Used by touch mode stepper taps and long-press repeats.
   * Fires tap() at the clamp boundary (once per gesture via clampHapticFiredRef)
   * and when crossing defaultValue.
   */
  const stepWithHaptic = useCallback(
    (currentValue: number, dir: 1 | -1, commit: boolean) => {
      const snapped = snap(currentValue + dir * step, step, min);
      const next = clamp(snapped, min, max);
      if (snapped !== next) {
        // Pushed past the boundary — fire tap only once per gesture
        if (!clampHapticFiredRef.current) {
          tap();
          clampHapticFiredRef.current = true;
        }
      } else if ((next === min || next === max) && !clampHapticFiredRef.current) {
        // Arrived exactly at boundary this step (snap landed on bound, no over-shoot)
        tap();
        clampHapticFiredRef.current = true;
      } else {
        clampHapticFiredRef.current = false;
        // Crossing defaultValue detent
        if (
          defaultValue !== undefined &&
          ((currentValue < defaultValue && next >= defaultValue) ||
           (currentValue > defaultValue && next <= defaultValue))
        ) {
          tap();
        }
      }
      onChange(next);
      if (commit) onValueCommit?.();
    },
    [min, max, step, defaultValue, tap, onChange, onValueCommit],
  );

  const beginEdit = useCallback(() => {
    setDraft(String(value));
    setEditing(true);
  }, [value]);

  // Shared commit logic for both Enter-key and blur paths
  const applyDraft = useCallback(() => {
    const parsed = Number(draft);
    if (!Number.isNaN(parsed)) {
      onInteractionStart?.();
      apply(parsed, true);
    }
  }, [draft, apply, onInteractionStart]);

  // F2: set skipBlurRef before closing so the trailing unmount-blur is a no-op
  const commitDraft = useCallback(() => {
    skipBlurRef.current = true;
    setEditing(false);
    applyDraft();
  }, [applyDraft]);

  // F1/F2: skip commit when a preceding Enter or Escape already handled this gesture
  const handleBlur = useCallback(() => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    setEditing(false);
    applyDraft();
  }, [applyDraft]);

  // ---------------------------------------------------------------------------
  // Shared scrub state machine
  // Used by the desktop chip (onPointerDown/Move/Up/Cancel on the value button)
  // and by the touch row body (onPointerDown/Move/Up/Cancel on the root div).
  // ---------------------------------------------------------------------------

  // Scrub — pointerdown: arm the scrub state and capture the pointer
  const handleScrubPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      // setPointerCapture may be absent in jsdom; guard with ?.
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      scrubRef.current = { startX: e.clientX, startValue: value, active: false };
    },
    [value],
  );

  // Scrub — pointermove: enter scrub once |dx|>4px, then apply live value
  const handleScrubPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const state = scrubRef.current;
      if (!state) return;
      const dx = e.clientX - state.startX;
      if (!state.active) {
        if (Math.abs(dx) <= 4) return;
        // Cross the threshold: enter scrub mode and fire onInteractionStart exactly once
        state.active = true;
        onInteractionStart?.();
      }
      const mult = e.shiftKey ? 10 : 1;
      apply(state.startValue + Math.round(dx / 3) * step * mult, false);
    },
    [apply, step, onInteractionStart],
  );

  // Scrub — shared end logic: clear scrubRef, suppress next click if active, optionally restore/commit
  const endScrub = useCallback(
    (action: 'commit' | 'cancel') => {
      const state = scrubRef.current;
      scrubRef.current = null;
      if (!state?.active) return;
      suppressClickRef.current = true;
      if (action === 'cancel') {
        // Pointer cancelled mid-scrub: restore startValue and commit
        apply(state.startValue, true);
      } else {
        // Normal pointerup: commit current value
        onValueCommit?.();
      }
    },
    [apply, onValueCommit],
  );

  // Scrub — pointerup: commit current value if scrub was active, suppress next click
  const handleScrubPointerUp = useCallback(
    () => { endScrub('commit'); },
    [endScrub],
  );

  // Scrub — pointercancel: restore startValue if scrub was active, suppress next click
  const handleScrubPointerCancel = useCallback(
    () => { endScrub('cancel'); },
    [endScrub],
  );

  // Slider — shared pointercancel for both touch and desktop slider inputs (F2)
  const handleSliderPointerCancel = useCallback(() => {
    interacting.current = false;
    onValueCommit?.();
  }, [onValueCommit]);

  // ---------------------------------------------------------------------------
  // Desktop chip-specific click and keyboard handlers (desktop path only)
  // ---------------------------------------------------------------------------

  // F3: first click arms a 250 ms timer; second click within that window resets instead
  const handleChipClick = useCallback(() => {
    // Scrub-then-click suppression: the pointerup after a scrub sets this flag;
    // consume it exactly once so the edit timer never fires.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      if (defaultValue !== undefined) {
        onInteractionStart?.();
        apply(defaultValue, true);
      }
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        beginEdit();
      }, 250);
    }
  }, [defaultValue, beginEdit, onInteractionStart, apply]);

  // F3: clear any pending click timer on unmount
  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) clearTimeout(clickTimerRef.current);
    };
  }, []);

  const handleChipKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Escape mid-scrub: restore startValue, commit once, suppress the following click
      if (e.key === 'Escape') {
        endScrub('cancel');
        return;
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const mult = e.shiftKey ? 10 : 1;
      onInteractionStart?.();
      apply(value + dir * step * mult, true);
    },
    [value, step, apply, onInteractionStart, endScrub],
  );

  // ---------------------------------------------------------------------------
  // Touch stepper long-press machinery
  // ---------------------------------------------------------------------------

  /**
   * End an active long-press gesture.
   * @param source 'up' = pointerup (suppress next click); 'leave'|'cancel' = no click follows.
   */
  const endLongPress = useCallback(
    (source: 'up' | 'leave' | 'cancel') => {
      const lp = longPressRef.current;
      if (!lp) return;
      if (lp.delayTimer !== null) clearTimeout(lp.delayTimer);
      if (lp.repeatInterval !== null) clearInterval(lp.repeatInterval);
      const wasActive = lp.count > 0;
      longPressRef.current = null;
      if (wasActive) {
        if (source === 'up') suppressStepperClickRef.current = true;
        onValueCommit?.();
      }
    },
    [onValueCommit],
  );

  // Clean up any outstanding long-press timer on unmount; commit if a gesture was active
  useEffect(() => {
    return () => {
      const lp = longPressRef.current;
      if (!lp) return;
      if (lp.delayTimer !== null) clearTimeout(lp.delayTimer);
      if (lp.repeatInterval !== null) clearInterval(lp.repeatInterval);
      if (lp.count > 0) {
        onValueCommitRef.current?.();
      }
    };
  }, []);

  const handleIncPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation(); // prevent row scrub from arming
      clampHapticFiredRef.current = false;
      const startValue = value;
      const state: LongPressState = {
        dir: 1, startValue, count: 0, delayTimer: null, repeatInterval: null,
      };
      longPressRef.current = state;
      state.delayTimer = setTimeout(() => {
        state.delayTimer = null;
        onInteractionStart?.();
        state.count = 1;
        stepWithHaptic(startValue, 1, false);
        state.repeatInterval = setInterval(() => {
          state.count += 1;
          // Compute from startValue to avoid stale-closure drift
          stepWithHaptic(startValue + (state.count - 1) * step, 1, false);
        }, 80);
      }, 400);
    },
    [value, step, onInteractionStart, stepWithHaptic],
  );

  const handleDecPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      clampHapticFiredRef.current = false;
      const startValue = value;
      const state: LongPressState = {
        dir: -1, startValue, count: 0, delayTimer: null, repeatInterval: null,
      };
      longPressRef.current = state;
      state.delayTimer = setTimeout(() => {
        state.delayTimer = null;
        onInteractionStart?.();
        state.count = 1;
        stepWithHaptic(startValue, -1, false);
        state.repeatInterval = setInterval(() => {
          state.count += 1;
          stepWithHaptic(startValue - (state.count - 1) * step, -1, false);
        }, 80);
      }, 400);
    },
    [value, step, onInteractionStart, stepWithHaptic],
  );

  const handleStepperPointerUp = useCallback(
    (_e: React.PointerEvent<HTMLButtonElement>) => { endLongPress('up'); },
    [endLongPress],
  );

  const handleStepperPointerLeave = useCallback(
    (_e: React.PointerEvent<HTMLButtonElement>) => { endLongPress('leave'); },
    [endLongPress],
  );

  const handleStepperPointerCancel = useCallback(
    (_e: React.PointerEvent<HTMLButtonElement>) => { endLongPress('cancel'); },
    [endLongPress],
  );

  const handleIncClick = useCallback(() => {
    if (suppressStepperClickRef.current) {
      suppressStepperClickRef.current = false;
      return;
    }
    clampHapticFiredRef.current = false;
    onInteractionStart?.();
    stepWithHaptic(value, 1, true);
  }, [value, onInteractionStart, stepWithHaptic]);

  const handleDecClick = useCallback(() => {
    if (suppressStepperClickRef.current) {
      suppressStepperClickRef.current = false;
      return;
    }
    clampHapticFiredRef.current = false;
    onInteractionStart?.();
    stepWithHaptic(value, -1, true);
  }, [value, onInteractionStart, stepWithHaptic]);

  const dec = (String(step).split('.')[1] ?? '').length;

  // Shared editor JSX (used in both desktop and touch layouts)
  const editorJsx = editing ? (
    <input
      className="pf3-param__input pf3-mono"
      value={draft}
      autoFocus
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commitDraft();
        if (e.key === 'Escape') {
          skipBlurRef.current = true; // F1: guard the trailing blur
          setEditing(false);
        }
      }}
    />
  ) : null;

  // ---------------------------------------------------------------------------
  // Touch layout: 52px fat row with − / + steppers and row-body scrub
  // ---------------------------------------------------------------------------
  if (touch) {
    const valueChip = (
      <button
        type="button"
        className="pf3-param__value pf3-mono"
        data-testid={testId ? `${testId}-value` : undefined}
        data-pf3-focusable=""
        onClick={handleChipClick}
      >
        {value.toFixed(dec)}{unit ? ` ${unit}` : ''}
      </button>
    );

    return (
      <div
        className="pf3-param pf3-param--touch"
        data-testid={testId}
        // The row root is the scrub surface — it owns horizontal pointer
        // movement, so ancestor swipe gestures (tab swipe) must ignore
        // touches starting anywhere inside it (see useSwipeGesture).
        data-swipe-ignore=""
        onPointerDown={handleScrubPointerDown}
        onPointerMove={handleScrubPointerMove}
        onPointerUp={handleScrubPointerUp}
        onPointerCancel={handleScrubPointerCancel}
      >
        <button
          type="button"
          className="pf3-param__stepper pf3-param__stepper--dec"
          data-testid={testId ? `${testId}-dec` : undefined}
          aria-label="Decrement"
          onClick={handleDecClick}
          onPointerDown={handleDecPointerDown}
          onPointerUp={handleStepperPointerUp}
          onPointerLeave={handleStepperPointerLeave}
          onPointerCancel={handleStepperPointerCancel}
        >
          −
        </button>
        <div className="pf3-param__center">
          <span className="pf3-param__label">{label}</span>
          {editing ? editorJsx : valueChip}
        </div>
        <button
          type="button"
          className="pf3-param__stepper pf3-param__stepper--inc"
          data-testid={testId ? `${testId}-inc` : undefined}
          aria-label="Increment"
          onClick={handleIncClick}
          onPointerDown={handleIncPointerDown}
          onPointerUp={handleStepperPointerUp}
          onPointerLeave={handleStepperPointerLeave}
          onPointerCancel={handleStepperPointerCancel}
        >
          +
        </button>
        <input
          type="range"
          role="slider"
          className="pf3-param__slider"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          style={{ ['--pf3-fill' as string]: `${((value - min) / (max - min)) * 100}%` }}
          onPointerDown={(e) => {
            e.stopPropagation(); // prevent row scrub from arming via slider
            if (!interacting.current) {
              interacting.current = true;
              onInteractionStart?.();
            }
          }}
          onChange={(e) => apply(Number(e.target.value), false)}
          onPointerUp={() => {
            interacting.current = false;
            onValueCommit?.();
          }}
          onPointerCancel={handleSliderPointerCancel}
          data-pf3-focusable=""
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Desktop layout (original, byte-identical)
  // ---------------------------------------------------------------------------
  return (
    <div className="pf3-param" data-testid={testId}>
      <div className="pf3-param__head">
        <span className="pf3-param__label">{label}</span>
        {editing ? editorJsx : (
          <button
            type="button"
            className="pf3-param__value pf3-mono"
            data-testid={testId ? `${testId}-value` : undefined}
            data-pf3-focusable=""
            title="Drag to scrub · click to type · double-click to reset"
            onClick={handleChipClick}
            onPointerDown={handleScrubPointerDown}
            onPointerMove={handleScrubPointerMove}
            onPointerUp={handleScrubPointerUp}
            onPointerCancel={handleScrubPointerCancel}
            onKeyDown={handleChipKeyDown}
          >
            {value.toFixed(dec)}{unit ? ` ${unit}` : ''}
          </button>
        )}
      </div>
      <input
        type="range"
        role="slider"
        className="pf3-param__slider"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--pf3-fill' as string]: `${((value - min) / (max - min)) * 100}%` }}
        onPointerDown={() => {
          if (!interacting.current) {
            interacting.current = true;
            onInteractionStart?.();
          }
        }}
        onChange={(e) => apply(Number(e.target.value), false)}
        onPointerUp={() => {
          interacting.current = false;
          onValueCommit?.();
        }}
        onPointerCancel={handleSliderPointerCancel}
        data-pf3-focusable=""
      />
    </div>
  );
};
