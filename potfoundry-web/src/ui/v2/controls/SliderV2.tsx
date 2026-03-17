import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
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

    // Debounced input: local state tracks raw typed value, store
    // updates after 300ms idle or on blur for responsive typing.
    const [inputText, setInputText] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    // When external value changes (slider drag, undo), clear local override
    const prevExternal = useRef(safeValue);
    if (prevExternal.current !== safeValue) {
      prevExternal.current = safeValue;
      if (inputText !== null) setInputText(null);
    }

    const flushInput = useCallback(
      (raw: string) => {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed)) {
          const clamped = Math.max(min, Math.min(max, parsed));
          onChange(clamped);
          onValueCommit?.(clamped);
        }
        setInputText(null);
      },
      [min, max, onChange, onValueCommit]
    );

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        setInputText(raw);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => flushInput(raw), 300);
      },
      [flushInput]
    );

    // Clean up debounce timer on unmount
    useEffect(() => {
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, []);

    const handleInputBlur = useCallback(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (inputText !== null) {
        flushInput(inputText);
      } else {
        onValueCommit?.(safeValue);
      }
    }, [inputText, flushInput, onValueCommit, safeValue]);

    const displayInputValue = useMemo(
      () => inputText ?? formatValue(safeValue),
      [inputText, formatValue, safeValue]
    );

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

    // Compensate for Radix getThumbInBoundsOffset: the thumb is shifted
    // inward at track edges by thumbRadius × (1 - 2×percent). We apply
    // the same offset to the ghost marker so it aligns with where the
    // thumb would actually be at the default value position.
    const THUMB_RADIUS_PX = 9; // 18px thumb / 2
    const ghostStyle = useMemo(() => {
      if (
        defaultValue === undefined ||
        defaultValue < min ||
        defaultValue > max
      ) {
        return undefined;
      }
      const pct = (defaultValue - min) / (max - min);
      const offsetPx = THUMB_RADIUS_PX * (1 - 2 * pct);
      return { left: `calc(${pct * 100}% + ${offsetPx}px)` };
    }, [defaultValue, min, max]);

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
              value={displayInputValue}
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
          {ghostStyle && (
            <span
              className="pf2-slider__ghost"
              style={ghostStyle}
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
            aria-description={defaultValue !== undefined ? 'Double-click to reset' : undefined}
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
