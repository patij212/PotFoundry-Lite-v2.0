import React, { useCallback } from 'react';
import './SegmentedControl.css';

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}

export function SegmentedControl<T extends string>({
  options, value, onChange, ariaLabel,
}: SegmentedControlProps<T>): React.ReactElement {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const idx = options.findIndex((o) => o.value === value);
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      const next = options[(idx + delta + options.length) % options.length];
      onChange(next.value);
    },
    [options, value, onChange],
  );

  return (
    <div className="pf3-seg" role="tablist" aria-label={ariaLabel} onKeyDown={handleKeyDown}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={`pf3-seg__item${o.value === value ? ' pf3-seg__item--on' : ''}`}
          onClick={() => onChange(o.value)}
          data-pf3-focusable=""
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
