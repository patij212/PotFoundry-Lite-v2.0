import React from 'react';
import './Button.css';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'tertiary';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  'data-testid'?: string;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary', children, onClick, disabled, title, 'data-testid': testId,
}) => (
  <button
    type="button"
    className={`pf3-btn pf3-btn--${variant}`}
    onClick={onClick}
    disabled={disabled}
    title={title}
    data-pf3-focusable=""
    data-testid={testId}
  >
    {children}
  </button>
);
