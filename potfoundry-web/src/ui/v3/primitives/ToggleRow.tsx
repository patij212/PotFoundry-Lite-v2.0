import React from 'react';
import './ToggleRow.css';

export interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  'data-testid'?: string;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({ label, checked, onChange, 'data-testid': testId }) => (
  <div className="pf3-toggle" data-testid={testId}>
    <span className="pf3-param__label">{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`pf3-toggle__track${checked ? ' pf3-toggle__track--on' : ''}`}
      onClick={() => onChange(!checked)}
      data-pf3-focusable=""
    >
      <span className="pf3-toggle__thumb" />
    </button>
  </div>
);
