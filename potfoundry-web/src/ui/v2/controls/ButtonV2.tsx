import React from 'react';
import clsx from 'clsx';
import './ButtonV2.css';

export type ButtonV2Variant = 'primary' | 'secondary' | 'danger';
export type ButtonV2Size = 'sm' | 'md' | 'lg';

export interface ButtonV2Props
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonV2Variant;
  size?: ButtonV2Size;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

export const ButtonV2 = React.forwardRef<HTMLButtonElement, ButtonV2Props>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      iconLeft,
      iconRight,
      fullWidth = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        className={clsx(
          'pf2-button',
          `pf2-button--${variant}`,
          `pf2-button--${size}`,
          fullWidth && 'pf2-button--full',
          loading && 'pf2-button--loading',
          'pf2-focus-ring',
          className
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <span className="pf2-button__spinner" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="31.4 31.4"
              />
            </svg>
          </span>
        )}
        {!loading && iconLeft && (
          <span className="pf2-button__icon">{iconLeft}</span>
        )}
        {children && <span className="pf2-button__label">{children}</span>}
        {!loading && iconRight && (
          <span className="pf2-button__icon">{iconRight}</span>
        )}
      </button>
    );
  }
);

ButtonV2.displayName = 'ButtonV2';

export interface IconButtonV2Props
  extends Omit<ButtonV2Props, 'iconLeft' | 'iconRight' | 'children'> {
  icon: React.ReactNode;
  'aria-label': string;
}

export const IconButtonV2 = React.forwardRef<
  HTMLButtonElement,
  IconButtonV2Props
>(({ icon, className, variant = 'secondary', size = 'md', ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={clsx(
        'pf2-icon-button',
        `pf2-icon-button--${variant}`,
        `pf2-icon-button--${size}`,
        'pf2-focus-ring',
        className
      )}
      {...props}
    >
      {icon}
    </button>
  );
});

IconButtonV2.displayName = 'IconButtonV2';
