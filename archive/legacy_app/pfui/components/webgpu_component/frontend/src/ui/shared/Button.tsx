/**
 * Base Button component with variants.
 * 
 * A customizable button component that supports multiple variants,
 * sizes, and states.
 * 
 * @module ui/shared/Button
 */

import React from 'react';
import clsx from 'clsx';
import './Button.css';

// ============================================================================
// Types
// ============================================================================

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Whether the button is in a loading state */
  loading?: boolean;
  /** Icon to show before the label */
  iconLeft?: React.ReactNode;
  /** Icon to show after the label */
  iconRight?: React.ReactNode;
  /** Make button full width */
  fullWidth?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * A versatile button component with multiple variants and states.
 * 
 * @example
 * ```tsx
 * <Button variant="primary" onClick={handleClick}>
 *   Save Design
 * </Button>
 * 
 * <Button variant="ghost" size="sm" iconLeft={<SettingsIcon />}>
 *   Settings
 * </Button>
 * ```
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
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
          'pf-button',
          `pf-button--${variant}`,
          `pf-button--${size}`,
          fullWidth && 'pf-button--full-width',
          loading && 'pf-button--loading',
          className
        )}
        disabled={isDisabled}
        {...props}
      >
        {loading && (
          <span className="pf-button__spinner">
            <svg
              className="pf-button__spinner-icon"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
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
          <span className="pf-button__icon pf-button__icon--left">
            {iconLeft}
          </span>
        )}
        <span className="pf-button__label">{children}</span>
        {!loading && iconRight && (
          <span className="pf-button__icon pf-button__icon--right">
            {iconRight}
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

// ============================================================================
// Icon Button Variant
// ============================================================================

export interface IconButtonProps extends Omit<ButtonProps, 'iconLeft' | 'iconRight' | 'children'> {
  /** The icon to display */
  icon: React.ReactNode;
  /** Accessible label for screen readers */
  'aria-label': string;
}

/**
 * A button that displays only an icon.
 * 
 * @example
 * ```tsx
 * <IconButton
 *   icon={<MenuIcon />}
 *   aria-label="Open menu"
 *   variant="ghost"
 * />
 * ```
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          'pf-icon-button',
          `pf-icon-button--${props.variant || 'ghost'}`,
          `pf-icon-button--${props.size || 'md'}`,
          className
        )}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
