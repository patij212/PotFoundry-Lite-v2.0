import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import * as RadixSlider from '@radix-ui/react-slider';
import clsx from 'clsx';
import './SliderV2.css';

export interface SliderV2Props {
  value: number;
  onChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
  onInteractionStart?: () => void;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  label?: string;
  description?: string;
  unit?: string;
  decimals?: number;
  disabled?: boolean;
  className?: string;
}

export const SliderV2 = React.forwardRef<HTMLDivElement, SliderV2Props>(
  (
    {
      value,
      onChange,
      onValueCommit,
      onInteractionStart,
      min,
      max,
      step = 1,
      defaultValue,
      label,
      description,
      unit,
      decimals,
      disabled = false,
      className,
    },
    ref
  ) => {
    const id = useId();
    const safeValue = value ?? min;
    const shiftHeld = useRef(false);
    const pointerInteractionActive = useRef(false);
    const [isDragging, setIsDragging] = useState(false);

    const displayDecimals =
      decimals ?? (step < 1 ? Math.ceil(-Math.log10(step)) : 0);

    const formatValue = useCallback(
      (v: number) => v.toFixed(displayDecimals),
      [displayDecimals]
    );

    // Shift key tracking for snap override during pointer drag
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Shift') shiftHeld.current = true;
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Shift') shiftHeld.current = false;
      };
      window.addEventListener('keydown', onKeyDown, { passive: true });
      window.addEventListener('keyup', onKeyUp, { passive: true });
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      };
    }, []);

    // Drag state tracking for tooltip visibility
    useEffect(() => {
      if (!isDragging) return;
      const handleUp = () => {
        setIsDragging(false);
        pointerInteractionActive.current = false;
      };
      window.addEventListener('pointerup', handleUp);
      return () => window.removeEventListener('pointerup', handleUp);
    }, [isDragging]);

    // Snap-to-default: snapZone = min(5% of range, step × 5)
    const applySnap = useCallback(
      (v: number): number => {
        if (defaultValue === undefined || shiftHeld.current) return v;
        const range = max - min;
        const snapZone = Math.min(range * 0.05, step * 5);
        return Math.abs(v - defaultValue) <= snapZone ? defaultValue : v;
      },
      [defaultValue, min, max, step]
    );

    const handleValueChange = useCallback(
      (values: number[]) => {
        onChange(applySnap(values[0]));
      },
      [onChange, applySnap]
    );

    const handleValueCommit = useCallback(
      (values: number[]) => {
        onValueCommit?.(applySnap(values[0]));
      },
      [onValueCommit, applySnap]
    );

    // Double-click to reset to default
    const handleDoubleClick = useCallback(() => {
      if (defaultValue !== undefined && !disabled) {
        onChange(defaultValue);
        onValueCommit?.(defaultValue);
      }
    }, [defaultValue, disabled, onChange, onValueCommit]);

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = parseFloat(e.target.value);
        if (!isNaN(parsed)) {
          onChange(Math.max(min, Math.min(max, parsed)));
        }
      },
      [min, max, onChange]
    );

    const handleInputBlur = useCallback(() => {
      onValueCommit?.(safeValue);
    }, [onValueCommit, safeValue]);

    // Shift+Arrow: step ×10 for faster keyboard nudging
    const handleThumbKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLSpanElement>) => {
        if (
          (e.key.startsWith('Arrow') ||
            e.key === 'Home' ||
            e.key === 'End' ||
            e.key === 'PageUp' ||
            e.key === 'PageDown') &&
          !e.repeat
        ) {
          onInteractionStart?.();
        }

        if (!e.shiftKey) return;
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const bigStep = step * 10;
        const direction = e.key === 'ArrowRight' ? 1 : -1;
        const raw = safeValue + direction * bigStep;
        const clamped = Math.max(min, Math.min(max, raw));
        const rounded =
          displayDecimals > 0
            ? parseFloat(clamped.toFixed(displayDecimals))
            : Math.round(clamped);
        onChange(rounded);
        onValueCommit?.(rounded);
      },
      [safeValue, step, min, max, displayDecimals, onChange, onValueCommit, onInteractionStart]
    );

    const handlePointerDown = useCallback(() => {
      if (!pointerInteractionActive.current) {
        pointerInteractionActive.current = true;
        onInteractionStart?.();
      }
      setIsDragging(true);
    }, [onInteractionStart]);

    // TODO: Phase 4 — compensate for Radix getThumbInBoundsOffset.
    // The ghost marker uses left: X% relative to Root, but Radix adjusts
    // the Thumb position at extremes (0%, 100%) to keep it in bounds.
    // This causes up to ±9px misalignment at the track edges.
    const ghostPercent =
      defaultValue !== undefined &&
      defaultValue >= min &&
      defaultValue <= max
        ? ((defaultValue - min) / (max - min)) * 100
        : undefined;

    return (
      <div
        ref={ref}
        className={clsx(
          'pf2-slider',
          disabled && 'pf2-slider--disabled',
          className
        )}
        onDoubleClick={handleDoubleClick}
      >
        <div className="pf2-slider__header">
          {label && (
            <label
              className="pf2-slider__label pf2-text-label"
              htmlFor={id}
              title={description}
            >
              {label}
            </label>
          )}
          <div className="pf2-slider__value-group">
            <input
              id={id}
              type="number"
              className="pf2-slider__input pf2-text-mono pf2-focus-ring"
              value={formatValue(safeValue)}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              aria-label={label ? `${label} value` : undefined}
            />
            {unit && (
              <span className="pf2-slider__unit pf2-text-mono">{unit}</span>
            )}
          </div>
        </div>

        <RadixSlider.Root
          className="pf2-slider__root"
          value={[safeValue]}
          onValueChange={handleValueChange}
          onValueCommit={handleValueCommit}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onPointerDown={handlePointerDown}
          data-dragging={isDragging || undefined}
        >
          {ghostPercent !== undefined && (
            <span
              className="pf2-slider__ghost"
              style={{ left: `${ghostPercent}%` }}
              aria-hidden="true"
            />
          )}

          <RadixSlider.Track className="pf2-slider__track">
            <RadixSlider.Range className="pf2-slider__range" />
          </RadixSlider.Track>

          <RadixSlider.Thumb
            className="pf2-slider__thumb pf2-focus-ring"
            aria-label={label}
            aria-valuetext={
              `${formatValue(safeValue)}${unit ? ` ${unit}` : ''}`
            }
            onKeyDown={handleThumbKeyDown}
          >
            <span className="pf2-slider__tooltip" aria-hidden="true">
              <span className="pf2-slider__tooltip-value">
                {formatValue(safeValue)}
              </span>
              {unit && (
                <span className="pf2-slider__tooltip-unit">{unit}</span>
              )}
            </span>
          </RadixSlider.Thumb>
        </RadixSlider.Root>
      </div>
    );
  }
);

SliderV2.displayName = 'SliderV2';
