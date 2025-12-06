/**
 * Custom Select component wrapping Radix UI Select.
 * 
 * Provides a styled dropdown select with label support.
 * 
 * @module ui/shared/Select
 */

import React, { useId } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';
import './Select.css';

// ============================================================================
// Types
// ============================================================================

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps {
  /** Current value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Available options */
  options: SelectOption[];
  /** Label text */
  label?: string;
  /** Placeholder when no value selected */
  placeholder?: string;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Full width mode */
  fullWidth?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * A styled select dropdown component.
 * 
 * @example
 * ```tsx
 * <Select
 *   label="Style"
 *   value={style}
 *   onChange={setStyle}
 *   options={[
 *     { value: 'harmonic', label: 'Harmonic Ripple' },
 *     { value: 'spiral', label: 'Spiral Ridges' },
 *   ]}
 * />
 * ```
 */
export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  label,
  placeholder = 'Select...',
  disabled = false,
  className,
  fullWidth = true,
}) => {
  const id = useId();
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className={clsx('pf-select', fullWidth && 'pf-select--full-width', className)}>
      {label && (
        <label className="pf-select__label" htmlFor={id}>
          {label}
        </label>
      )}
      
      <RadixSelect.Root value={value} onValueChange={onChange} disabled={disabled}>
        <RadixSelect.Trigger
          id={id}
          className="pf-select__trigger"
          aria-label={label}
        >
          <RadixSelect.Value placeholder={placeholder}>
            {selectedOption?.label || placeholder}
          </RadixSelect.Value>
          <RadixSelect.Icon className="pf-select__icon">
            <ChevronDown size={14} />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            className="pf-select__content"
            position="popper"
            sideOffset={4}
          >
            <RadixSelect.Viewport className="pf-select__viewport">
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  className="pf-select__item"
                  disabled={option.disabled}
                >
                  <RadixSelect.ItemText>
                    <div className="pf-select__item-content">
                      <span className="pf-select__item-label">{option.label}</span>
                      {option.description && (
                        <span className="pf-select__item-description">
                          {option.description}
                        </span>
                      )}
                    </div>
                  </RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="pf-select__item-indicator">
                    <Check size={14} />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
};
