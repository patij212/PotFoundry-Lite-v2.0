import React, { useCallback, useEffect, useRef, useState } from 'react';
import './ParamRow.css';

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

export const ParamRow: React.FC<ParamRowProps> = ({
  label, value, min, max, step, unit, defaultValue,
  onChange, onInteractionStart, onValueCommit, 'data-testid': testId,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const interacting = useRef(false);
  // F1/F2: set true before setEditing(false) so the trailing unmount-blur is a no-op
  const skipBlurRef = useRef(false);
  // F3: holds the pending single-click timer; second click cancels it and resets
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Scrub: tracks pointer-drag gesture state
  const scrubRef = useRef<ScrubState | null>(null);
  // Scrub: set on pointerup after a scrub so the following click is suppressed
  const suppressClickRef = useRef(false);

  // F4: snap then clamp — rounding cannot push the value past bounds
  const apply = useCallback(
    (raw: number, commit: boolean) => {
      const next = clamp(snap(raw, step, min), min, max);
      onChange(next);
      if (commit) onValueCommit?.();
    },
    [min, max, step, onChange, onValueCommit],
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

  // Scrub — pointerdown: arm the scrub state and capture the pointer
  const handleChipPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      // setPointerCapture may be absent in jsdom; guard with ?.
      e.currentTarget.setPointerCapture?.(e.pointerId);
      scrubRef.current = { startX: e.clientX, startValue: value, active: false };
    },
    [value],
  );

  // Scrub — pointermove: enter scrub once |dx|>4px, then apply live value
  const handleChipPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
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

  // Scrub — pointerup: commit if scrub was active; always suppress the following click
  const handleChipPointerUp = useCallback(
    () => {
      const state = scrubRef.current;
      scrubRef.current = null;
      if (!state) return;
      if (state.active) {
        onValueCommit?.();
        suppressClickRef.current = true;
      }
    },
    [onValueCommit],
  );

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
        const state = scrubRef.current;
        scrubRef.current = null;
        if (state?.active) {
          suppressClickRef.current = true;
          apply(state.startValue, true);
        }
        return;
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const mult = e.shiftKey ? 10 : 1;
      onInteractionStart?.();
      apply(value + dir * step * mult, true);
    },
    [value, step, apply, onInteractionStart],
  );

  const dec = (String(step).split('.')[1] ?? '').length;

  return (
    <div className="pf3-param" data-testid={testId}>
      <div className="pf3-param__head">
        <span className="pf3-param__label">{label}</span>
        {editing ? (
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
        ) : (
          <button
            type="button"
            className="pf3-param__value pf3-mono"
            data-testid={testId ? `${testId}-value` : undefined}
            data-pf3-focusable=""
            title="Drag to scrub · click to type · double-click to reset"
            onClick={handleChipClick}
            onPointerDown={handleChipPointerDown}
            onPointerMove={handleChipPointerMove}
            onPointerUp={handleChipPointerUp}
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
        data-pf3-focusable=""
      />
    </div>
  );
};
