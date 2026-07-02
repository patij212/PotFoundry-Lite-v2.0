import React, { useCallback, useRef, useState } from 'react';
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

export const ParamRow: React.FC<ParamRowProps> = ({
  label, value, min, max, step, unit, defaultValue,
  onChange, onInteractionStart, onValueCommit, 'data-testid': testId,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const interacting = useRef(false);

  const apply = useCallback(
    (raw: number, commit: boolean) => {
      const next = snap(clamp(raw, min, max), step, min);
      onChange(next);
      if (commit) onValueCommit?.();
    },
    [min, max, step, onChange, onValueCommit],
  );

  const beginEdit = useCallback(() => {
    setDraft(String(value));
    setEditing(true);
  }, [value]);

  const commitDraft = useCallback(() => {
    setEditing(false);
    const parsed = Number(draft);
    if (!Number.isNaN(parsed)) {
      onInteractionStart?.();
      apply(parsed, true);
    }
  }, [draft, apply, onInteractionStart]);

  const handleChipKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="pf3-param__value pf3-mono"
            data-testid={testId ? `${testId}-value` : undefined}
            data-pf3-focusable=""
            title="Click to type · double-click to reset"
            onClick={beginEdit}
            onDoubleClick={() => {
              if (defaultValue === undefined) return;
              setEditing(false);
              onInteractionStart?.();
              apply(defaultValue, true);
            }}
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
