/**
 * Custom Slider component wrapping Radix UI Slider.
 * 
 * Provides a styled slider with label, value display, and unit support.
 * 
 * @module ui/shared/Slider
 */

import React, { useCallback, useId } from 'react';
import * as RadixSlider from '@radix-ui/react-slider';
import clsx from 'clsx';
import './Slider.css';

// ============================================================================
// Types
// ============================================================================

export interface SliderProps {
  /** Current value */
  value: number;
  /** Callback when value changes */
  onChange: (value: number) => void;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Step increment */
  step?: number;
  /** Label text */
  label?: string;
  /** Unit to display after value */
  unit?: string;
  /** Number of decimal places for display */
  decimals?: number;
  /** Whether the slider is disabled */
  disabled?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Show value input field */
  showInput?: boolean;
  /** Callback on drag end for debounced updates */
  onChangeEnd?: (value: number) => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * A styled slider component with label and value display.
 * 
 * @example
 * ```tsx
 * <Slider
 *   label="Height"
 *   value={height}
 *   onChange={setHeight}
 *   min={20}
 *   max={500}
 *   unit="mm"
 * />
 * ```
 */
export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  unit,
  decimals,
  disabled = false,
  className,
  showInput = true,
  onChangeEnd,
}) => {
  const id = useId();
  // Safe value with fallback to min to prevent undefined errors
  const safeValue = value ?? min;

  // Calculate display decimals from step if not provided
  const displayDecimals = decimals ?? (step < 1 ? Math.ceil(-Math.log10(step)) : 0);

  // Format value for display (guard against undefined/null)
  const formatValue = useCallback(
    (v: number) => (v != null ? v.toFixed(displayDecimals) : '0'),
    [displayDecimals]
  );

  // Handle slider change
  const handleSliderChange = useCallback(
    (values: number[]) => {
      onChange(values[0]);
    },
    [onChange]
  );

  // Handle slider commit (drag end)
  const handleSliderCommit = useCallback(
    (values: number[]) => {
      onChangeEnd?.(values[0]);
    },
    [onChangeEnd]
  );

  // Handle input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      if (!isNaN(newValue)) {
        const clamped = Math.max(min, Math.min(max, newValue));
        onChange(clamped);
      }
    },
    [min, max, onChange]
  );

  // Handle input blur for final commit
  const handleInputBlur = useCallback(() => {
    onChangeEnd?.(safeValue);
  }, [onChangeEnd, safeValue]);

  return (
    <div className={clsx('pf-slider', disabled && 'pf-slider--disabled', className)}>
      {(label || showInput) && (
        <div className="pf-slider__header">
          {label && (
            <label className="pf-slider__label" htmlFor={id}>
              {label}
            </label>
          )}
          {showInput && (
            <div className="pf-slider__value-container">
              <input
                id={id}
                type="number"
                className="pf-slider__input"
                value={formatValue(safeValue)}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
              />
              {unit && <span className="pf-slider__unit">{unit}</span>}
            </div>
          )}
        </div>
      )}

      <RadixSlider.Root
        className="pf-slider__root"
        value={[safeValue]}
        onValueChange={handleSliderChange}
        onValueCommit={handleSliderCommit}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      >
        <RadixSlider.Track className="pf-slider__track">
          <RadixSlider.Range className="pf-slider__range" />
        </RadixSlider.Track>
        <RadixSlider.Thumb className="pf-slider__thumb" aria-label={label} />
      </RadixSlider.Root>

      <div className="pf-slider__bounds">
        <span className="pf-slider__bound">{formatValue(min)}</span>
        <span className="pf-slider__bound">{formatValue(max)}</span>
      </div>
    </div>
  );
};
