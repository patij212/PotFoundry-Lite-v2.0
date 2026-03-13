# Generator Phase 1 — Base Components for PotFoundry UI v2

**Date**: 2026-03-06  
**Round**: Generator Phase 1  
**Status**: Proposal — awaiting Verifier critique  
**Depends on**: Phase 0 (Foundation) — COMPLETE

---

## Problem Statement

Phase 0 delivered the design token system (`--pf2-*`), motion CSS, font declarations, state additions, and theme-switching plumbing. Phase 1 must deliver the 5 atomic components that every subsequent phase depends on: **SliderV2**, **SectionV2**, **ButtonV2**, **SelectV2**, and **Announcer**. Without these, Phase 2 (Layout) and Phase 3 (Tabs) cannot begin.

The v1 components (`src/ui/shared/Slider.tsx`, `Section.tsx`, `Button.tsx`, `Select.tsx`) use indigo-tinted Radix primitives with raw `rgba()` colors. The v2 components must use exclusively `--pf2-*` tokens, gold accent palette, branded typography classes, and the v2 motion system — while maintaining the same Radix primitives underneath for accessibility and behavior parity.

---

## Root Cause Analysis

The v1 components are functionally sound but aesthetically coupled to the indigo/cold palette:

| Concern | v1 State | v2 Requirement |
|---------|----------|----------------|
| Colors | Hardcoded `rgba(99, 102, 241, ...)` indigo | `--pf2-accent` gold tokens |
| Typography | System fonts, no classes | `pf2-text-label`, `pf2-text-mono` utility classes |
| Focus ring | Indigo `box-shadow` | Gold halo via `.pf2-focus-ring` |
| Motion | `0.15s ease` everywhere | Branded curves (`--pf2-ease-move`), duration scale |
| Slider extras | None | Snap-to-default, ghost marker, floating tooltip, Shift+Arrow |
| Section anim | `@keyframes` height animation | `grid-template-rows: 0fr → 1fr` CSS transition |
| Accessibility | No live region announcer | `AnnouncerProvider` + `useAnnounce()` hook |

**Key file references:**
- v1 Slider: `src/ui/shared/Slider.tsx` (lines 1–158), `Slider.css`
- v1 Section: `src/ui/shared/Section.tsx` (lines 1–134), `Section.css`
- v1 Button: `src/ui/shared/Button.tsx` (lines 1–148), `Button.css`
- v1 Select: `src/ui/shared/Select.tsx` (lines 1–132), `Select.css`
- v2 tokens: `src/ui/v2/AppUIv2.css` (lines 24–79)
- v2 motion: `src/ui/v2/motion.css` (lines 1–225)

---

## Component 1: SliderV2

**File**: `src/ui/v2/controls/SliderV2.tsx` + `SliderV2.css`  
**Priority**: CRITICAL — used for ALL 13+ geometry parameters and ALL style parameters.

### 1.1 Props Interface

```ts
export interface SliderV2Props {
  /** Current slider value (controlled) */
  value: number;
  /** Continuous callback during drag */
  onChange: (value: number) => void;
  /** Fires on pointer release — use for expensive store updates */
  onValueCommit?: (value: number) => void;
  /** Minimum bound */
  min: number;
  /** Maximum bound */
  max: number;
  /** Step increment (default: 1) */
  step?: number;
  /** Default value — enables ghost marker, snap-to-default, double-click reset */
  defaultValue?: number;
  /** Label text (rendered as uppercase label above track) */
  label?: string;
  /** Description text — rendered as title attribute on label for hover tooltip */
  description?: string;
  /** Unit suffix displayed after value (e.g., "mm", "°") */
  unit?: string;
  /** Decimal places for display (auto-calculated from step if omitted) */
  decimals?: number;
  /** Disabled state */
  disabled?: boolean;
  /** Additional CSS class on outer wrapper */
  className?: string;
}
```

### 1.2 Implementation

```tsx
// src/ui/v2/controls/SliderV2.tsx

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import * as RadixSlider from '@radix-ui/react-slider';
import clsx from 'clsx';
import './SliderV2.css';

export interface SliderV2Props {
  value: number;
  onChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
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
    const [isDragging, setIsDragging] = useState(false);

    // Compute display decimals from step if not explicitly provided
    const displayDecimals =
      decimals ?? (step < 1 ? Math.ceil(-Math.log10(step)) : 0);

    const formatValue = useCallback(
      (v: number) => v.toFixed(displayDecimals),
      [displayDecimals]
    );

    // --- Shift key tracking (global) for snap override ---
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Shift') shiftHeld.current = true;
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Shift') shiftHeld.current = false;
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      };
    }, []);

    // --- Drag state tracking for tooltip visibility ---
    useEffect(() => {
      if (!isDragging) return;
      const handleUp = () => setIsDragging(false);
      window.addEventListener('pointerup', handleUp);
      return () => window.removeEventListener('pointerup', handleUp);
    }, [isDragging]);

    // --- Snap-to-default math ---
    // Snap zone = min(5% of range, step × 5)
    // Engaged when |value - default| ≤ snapZone AND Shift is NOT held
    const applySnap = useCallback(
      (v: number): number => {
        if (defaultValue === undefined || shiftHeld.current) return v;
        const range = max - min;
        const snapZone = Math.min(range * 0.05, step * 5);
        return Math.abs(v - defaultValue) <= snapZone ? defaultValue : v;
      },
      [defaultValue, min, max, step]
    );

    // --- Radix event handlers ---
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

    // --- Double-click to reset ---
    const handleDoubleClick = useCallback(() => {
      if (defaultValue !== undefined && !disabled) {
        onChange(defaultValue);
        onValueCommit?.(defaultValue);
      }
    }, [defaultValue, disabled, onChange, onValueCommit]);

    // --- Shift+Arrow: nudge by step × 10 ---
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!e.shiftKey) return;
        const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
        if (!arrows.includes(e.key)) return;

        e.preventDefault();
        const direction =
          e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1;
        const bigStep = step * 10;
        const raw = safeValue + direction * bigStep;
        const clamped = Math.max(min, Math.min(max, raw));
        const snapped = applySnap(clamped);
        onChange(snapped);
        onValueCommit?.(snapped);
      },
      [step, min, max, safeValue, applySnap, onChange, onValueCommit]
    );

    // --- Numeric input handlers ---
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

    // --- Ghost marker position (percentage of track) ---
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
        {/* Header: label + value input */}
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

        {/* Radix Slider */}
        <RadixSlider.Root
          className="pf2-slider__root"
          value={[safeValue]}
          onValueChange={handleValueChange}
          onValueCommit={handleValueCommit}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onKeyDown={handleKeyDown}
          onPointerDown={() => setIsDragging(true)}
          data-dragging={isDragging || undefined}
        >
          {/* Ghost marker at default value position */}
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
          >
            {/* Floating value tooltip — visible only during drag */}
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
```

### 1.3 CSS

```css
/* src/ui/v2/controls/SliderV2.css */

/* ============================================================================
   Container
   ============================================================================ */

.pf2-slider {
  display: flex;
  flex-direction: column;
  gap: var(--pf2-space-sm);    /* 8px */
  width: 100%;
  min-width: 0;
  padding: 2px 0;
}

.pf2-slider--disabled {
  opacity: 0.5;
  pointer-events: none;
}

/* ============================================================================
   Header (Label + Value Input)
   ============================================================================ */

.pf2-slider__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pf2-space-sm);
}

.pf2-slider__label {
  /* Inherits pf2-text-label: 12px, 500, uppercase, letter-spacing, secondary color */
  cursor: default;
  user-select: none;
}

.pf2-slider__value-group {
  display: flex;
  align-items: center;
  gap: var(--pf2-space-xs);    /* 4px */
}

.pf2-slider__input {
  width: 56px;
  height: 24px;
  padding: 0 6px;
  font-size: 12px;
  color: var(--pf2-text-primary);
  background: var(--pf2-bg-elevated);
  border: 1px solid var(--pf2-border);
  border-radius: var(--pf2-radius-sm);
  text-align: right;
  transition:
    border-color var(--pf2-duration-micro) var(--pf2-ease-move),
    background var(--pf2-duration-micro) var(--pf2-ease-move);
  appearance: textfield;
  -moz-appearance: textfield;
}

.pf2-slider__input::-webkit-outer-spin-button,
.pf2-slider__input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.pf2-slider__input:hover:not(:focus):not(:disabled) {
  background: var(--pf2-bg-hover);
}

.pf2-slider__input:focus {
  border-color: var(--pf2-accent);
  background: var(--pf2-bg-hover);
}

.pf2-slider__unit {
  font-size: 11px;
  color: var(--pf2-text-muted);
  min-width: 20px;
}

/* ============================================================================
   Radix Slider Root
   ============================================================================ */

.pf2-slider__root {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 24px;
  touch-action: none;
  user-select: none;
}

/* ============================================================================
   Ghost Marker (Default Value Indicator)
   ============================================================================ */

.pf2-slider__ghost {
  position: absolute;
  top: 50%;
  width: 2px;
  height: 12px;
  transform: translate(-50%, -50%);
  background: var(--pf2-accent);
  opacity: 0.3;
  border-radius: 1px;
  pointer-events: none;
  z-index: 1;
}

/* ============================================================================
   Track & Range
   ============================================================================ */

.pf2-slider__track {
  position: relative;
  flex-grow: 1;
  height: 4px;
  background: var(--pf2-border-active);  /* rgba(245,240,232,0.15) */
  border-radius: 2px;
  overflow: hidden;
}

.pf2-slider__range {
  position: absolute;
  height: 100%;
  background: var(--pf2-accent);         /* muted gold */
  border-radius: 2px;
}

/* ============================================================================
   Thumb
   ============================================================================ */

.pf2-slider__thumb {
  display: block;
  width: 18px;
  height: 18px;
  background: var(--pf2-bg-elevated);
  border: 2px solid var(--pf2-accent);
  border-radius: 50%;
  cursor: grab;
  outline: none;
  position: relative;
  transition:
    transform var(--pf2-duration-micro) var(--pf2-ease-move),
    box-shadow var(--pf2-duration-micro) var(--pf2-ease-move);
}

/* Expanded touch target */
.pf2-slider__thumb::before {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: 50%;
}

.pf2-slider__thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 0 0 4px rgba(180, 151, 90, 0.3);
}

.pf2-slider__thumb:active,
.pf2-slider__root[data-dragging] .pf2-slider__thumb {
  cursor: grabbing;
  transform: scale(1.15);
  box-shadow: 0 0 0 8px rgba(180, 151, 90, 0.2);
}

/* Override the global pf2-focus-ring for slider thumb (ring is the glow itself) */
.pf2-slider__thumb.pf2-focus-ring:focus-visible {
  box-shadow:
    0 0 0 2px var(--pf2-bg-surface),
    0 0 0 4px var(--pf2-accent);
}

/* ============================================================================
   Floating Tooltip (visible during drag only)
   ============================================================================ */

.pf2-slider__tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: baseline;
  gap: 2px;
  padding: 2px 8px;
  min-width: 3ch;
  background: var(--pf2-accent);
  color: var(--pf2-bg-base);
  font-family: var(--pf2-font-mono);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  border-radius: var(--pf2-radius-sm);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--pf2-duration-micro) var(--pf2-ease-enter);
  z-index: var(--pf2-z-tooltip);
}

/* Tooltip arrow */
.pf2-slider__tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: var(--pf2-accent);
}

.pf2-slider__root[data-dragging] .pf2-slider__tooltip {
  opacity: 1;
}

.pf2-slider__tooltip-value {
  /* inherits mono font from parent */
}

.pf2-slider__tooltip-unit {
  font-size: 9px;
  opacity: 0.7;
}

/* ============================================================================
   High Contrast
   ============================================================================ */

@media (forced-colors: active) {
  .pf2-slider__thumb {
    border: 2px solid ButtonText;
    background: ButtonFace;
  }

  .pf2-slider__track {
    background: GrayText;
  }

  .pf2-slider__range {
    background: Highlight;
  }

  .pf2-slider__ghost {
    background: GrayText;
  }

  .pf2-slider__input {
    border: 1px solid ButtonText;
  }
}
```

### 1.4 Design Decisions

**D1. Snap-to-default formula**: `snapZone = min(range × 0.05, step × 5)`.
- The 5% cap prevents the zone from exceeding 5 steps (which would feel too "sticky").
- The `step × 5` cap ensures the zone never exceeds 5 discrete stops for coarse sliders.
- For a typical Height slider (min=20, max=500, step=1, default=100): `min(24, 5) = 5`. The thumb snaps within ±5mm of the default. Feels like a gentle magnetic detent.
- For a fine slider (min=0, max=1, step=0.01, default=0.5): `min(0.05, 0.05) = 0.05`. Snaps within ±0.05 of default. Precise and proportional.
- Shift override via global `keydown`/`keyup` listeners on `window`, tracked in a `useRef` to avoid re-renders.

**D2. Floating tooltip as Thumb child**: The tooltip is rendered inside `RadixSlider.Thumb`. Since Radix positions the Thumb via `left: X%` internally, the tooltip inherits correct positioning without manual track-width measurement. Positioned above via `bottom: calc(100% + 8px)` with a CSS arrow. Shown/hidden via `opacity` transition keyed on `[data-dragging]` data attribute.

**D3. Ghost marker alignment**: The ghost marker uses `position: absolute; left: X%` relative to the Radix Root. Radix positions the Thumb using the same percentage basis, so the ghost and thumb are pixel-aligned when value === defaultValue. The `transform: translateX(-50%)` centers the 2px marker at the exact percentage point.

**D4. Drag state tracking**: We track `isDragging` via `onPointerDown` on the Root and `pointerup` on `window`. The `window` listener ensures we catch pointer release even if the pointer leaves the slider area (common during fast drags). The `data-dragging` attribute on Root enables CSS-only tooltip show/hide.

**D5. Shift+Arrow keyboard override**: Radix Slider natively handles Arrow keys (nudge by `step`). We intercept `onKeyDown` on the Root, check for `e.shiftKey`, prevent default, and manually apply `step × 10` nudge. This fires both `onChange` and `onValueCommit` since it's a discrete user action, not a continuous drag.

**D6. No `showInput` prop**: Unlike v1, v2 always shows the value input. The v2 design language treats the number input as essential — it reinforces the "precision tool" feel. If a caller truly needs no input, they can pass `className` with `display: none` on the header. This simplifies the API.

**D7. `description` as `title` attribute**: For Phase 1, the description renders as a native browser tooltip via `title` on the label. A proper Radix Tooltip could be added later (Phase 4 or polish), but adding it now would introduce another component dependency. The `title` approach is accessible and zero-cost.

**D8. `forwardRef` on outer div**: Enables parent components (form libraries, scroll management, stagger orchestrators) to measure or reference the slider container.

### 1.5 Assumptions (for Verifier)

1. **A1**: Radix Slider in controlled mode (`value` prop) positions the Thumb based on the prop value, not the raw pointer position. If the `onValueChange` handler returns a snapped value, the Thumb should render at the snapped position, creating the magnetic effect.

2. **A2**: The ghost marker's `left: X%` aligns with Radix's internal Thumb positioning (also `left: X%` relative to Root). No padding or margin on Root would offset them.

3. **A3**: `onPointerDown` on the Radix Root fires before Radix's internal pointer handling, so setting `isDragging = true` happens before the first `onValueChange` callback.

4. **A4**: The `data-dragging` attribute (set via React state re-render) updates fast enough that the tooltip appears within the same frame as the first pointer interaction. If not, there could be a 1-frame delay where the tooltip is invisible during the first drag frame.

5. **A5**: The `window` `keydown`/`keyup` listeners for Shift tracking don't conflict with Radix's internal keyboard handling.

6. **A6**: The `onDoubleClick` handler on the outer wrapper div doesn't interfere with Radix's pointer-down/up handling for drag initiation. Double-click on the track area should reset, while a single click should still start a drag.

7. **A7**: Step × 10 for Shift+Arrow will never exceed `max - min`. The `Math.max/Math.min` clamping handles edge cases, but the UX of "jump to boundary" on large nudges should be confirmed as acceptable.

---

## Component 2: SectionV2

**File**: `src/ui/v2/controls/SectionV2.tsx` + `SectionV2.css`

### 2.1 Props Interface

```ts
export interface SectionV2Props {
  /** Section title text */
  title: string;
  /** Optional icon before title (e.g., lucide-react icon) */
  icon?: React.ReactNode;
  /** Initial open state (uncontrolled) */
  defaultOpen?: boolean;
  /** Controlled open state */
  open?: boolean;
  /** Callback when open/close state changes */
  onOpenChange?: (open: boolean) => void;
  /** Section content */
  children: React.ReactNode;
  /** Additional CSS class */
  className?: string;
  /** Index for stagger animation (set as CSS variable --section-index) */
  sectionIndex?: number;
}
```

### 2.2 Implementation

```tsx
// src/ui/v2/controls/SectionV2.tsx

import React from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import './SectionV2.css';

export interface SectionV2Props {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  sectionIndex?: number;
}

export const SectionV2: React.FC<SectionV2Props> = ({
  title,
  icon,
  defaultOpen = true,
  open,
  onOpenChange,
  children,
  className,
  sectionIndex = 0,
}) => {
  return (
    <Collapsible.Root
      className={clsx('pf2-section', className)}
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      style={{ '--section-index': sectionIndex } as React.CSSProperties}
    >
      <Collapsible.Trigger className="pf2-section__trigger pf2-focus-ring">
        <div className="pf2-section__header">
          {icon && <span className="pf2-section__icon">{icon}</span>}
          <h3 className="pf2-section__title pf2-text-label">{title}</h3>
        </div>
        <ChevronRight className="pf2-section__chevron" size={14} />
      </Collapsible.Trigger>

      <Collapsible.Content className="pf2-section__body" forceMount>
        <div className="pf2-section__content">{children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
```

### 2.3 CSS

```css
/* src/ui/v2/controls/SectionV2.css */

/* ============================================================================
   Section Container
   ============================================================================ */

.pf2-section {
  border-radius: var(--pf2-radius-md);
  background: var(--pf2-bg-surface);
  overflow: visible;
  flex-shrink: 0;
}

.pf2-section + .pf2-section {
  margin-top: var(--pf2-space-md);   /* 12px */
}

/* ============================================================================
   Trigger (Collapsible Header)
   ============================================================================ */

.pf2-section__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--pf2-space-md) var(--pf2-space-lg);   /* 12px 16px */
  background: transparent;
  cursor: pointer;
  border-radius: var(--pf2-radius-md);
  transition: background var(--pf2-duration-micro) var(--pf2-ease-move);
}

.pf2-section__trigger:hover {
  background: var(--pf2-bg-hover);
}

/* ============================================================================
   Header (icon + title)
   ============================================================================ */

.pf2-section__header {
  display: flex;
  align-items: center;
  gap: var(--pf2-space-sm);
}

.pf2-section__icon {
  display: flex;
  align-items: center;
  color: var(--pf2-text-muted);
}

.pf2-section__icon svg {
  width: 14px;
  height: 14px;
}

.pf2-section__title {
  /* Inherits pf2-text-label: 12px, 500, uppercase, letter-spacing, secondary color */
  margin: 0;
  transition: color var(--pf2-duration-micro) var(--pf2-ease-move);
}

/* Gold accent on title when section is expanded */
.pf2-section__trigger[data-state='open'] .pf2-section__title {
  color: var(--pf2-accent);
}

/* ============================================================================
   Chevron
   ============================================================================ */

.pf2-section__chevron {
  color: var(--pf2-text-muted);
  transition: transform var(--pf2-duration-fast) var(--pf2-ease-move);
  flex-shrink: 0;
}

.pf2-section__trigger[data-state='open'] .pf2-section__chevron {
  transform: rotate(90deg);
}

/* ============================================================================
   Content Body — grid-template-rows animation
   ============================================================================ */

.pf2-section__body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows var(--pf2-duration-normal) var(--pf2-ease-move),
    opacity var(--pf2-duration-fast) var(--pf2-ease-move);
}

.pf2-section__body[data-state='open'] {
  grid-template-rows: 1fr;
  opacity: 1;
}

/* Delayed visibility toggle for a11y — keep hidden content out of tab order */
.pf2-section__body[data-state='closed'] {
  visibility: hidden;
  transition:
    grid-template-rows var(--pf2-duration-normal) var(--pf2-ease-move),
    opacity var(--pf2-duration-fast) var(--pf2-ease-move),
    visibility 0s var(--pf2-duration-normal);
}

.pf2-section__body[data-state='open'] {
  visibility: visible;
  transition:
    grid-template-rows var(--pf2-duration-normal) var(--pf2-ease-move),
    opacity var(--pf2-duration-fast) var(--pf2-ease-move),
    visibility 0s 0s;
}

/* ============================================================================
   Inner Content
   ============================================================================ */

.pf2-section__content {
  overflow: hidden;
  min-height: 0;                       /* Required for grid-template-rows: 0fr */
  display: flex;
  flex-direction: column;
  gap: var(--pf2-space-lg);            /* 16px */
  padding: var(--pf2-space-md) var(--pf2-space-lg);   /* 12px 16px */
  padding-top: var(--pf2-space-sm);    /* 8px — tighter top since trigger has padding */
}

/* ============================================================================
   High Contrast
   ============================================================================ */

@media (forced-colors: active) {
  .pf2-section {
    border: 1px solid ButtonText;
  }

  .pf2-section__trigger {
    border: 1px solid ButtonText;
  }
}
```

### 2.4 Design Decisions

**D1. `grid-template-rows: 0fr → 1fr` over keyframe height animation**: The v1 Section uses `@keyframes` with `height: var(--radix-collapsible-content-height)`. This requires Radix to measure content height and set a CSS variable. The `grid-template-rows` approach needs no measurement — the browser natively interpolates between `0fr` and `1fr`. Result: smoother animation, no layout thrashing from height measurement, fewer moving parts.

**D2. `forceMount` on Collapsible.Content**: Required for `grid-template-rows` animation. Without it, Radix removes the element from the DOM when closed, preventing any CSS transition. With `forceMount`, we manage visibility ourselves via `visibility: hidden` with a transition delay matching the close animation duration.

**D3. Visibility delayed toggle for a11y**: When closing, `visibility: hidden` is delayed by `--pf2-duration-normal` (320ms) — matching the grid-template-rows transition duration. This ensures:
  - During close animation: content is visible (the animation plays)
  - After close animation: content becomes `visibility: hidden` (removed from tab order and screen readers)
  - During open: `visibility: visible` is immediate (0s delay)

**D4. `sectionIndex` as CSS variable**: Set via inline style `--section-index: N`. Used by the `pf2-animate-section-enter` class from `motion.css` for stagger delays. The parent tab component can apply this class on mount. The Section itself doesn't add the animation class — it only provides the variable. This keeps the Section's responsibility clean.

**D5. Gold accent on open title**: The title transitions from `--pf2-text-secondary` to `--pf2-accent` when the section is open (via `[data-state='open']` selector). This provides a visual signal of which sections are expanded without introducing additional UI chrome.

**D6. Removed `collapsible` prop**: Unlike v1 which had a `collapsible={false}` static mode, v2 sections are always collapsible. A static layout should simply render content directly without wrapping in a Section. This simplifies the component.

### 2.5 Assumptions (for Verifier)

1. **A1**: Radix Collapsible with `forceMount` still sets `data-state="open"` / `data-state="closed"` on the Content element. If it doesn't, the CSS selectors won't work.

2. **A2**: `grid-template-rows` transition is supported in all target browsers (Chrome 100+, Firefox 100+, Safari 16.4+). Safari 16.3 and earlier do NOT support animating `grid-template-rows`.

3. **A3**: The `visibility: hidden` delayed toggle doesn't cause focus-trapping issues — when a keyboard user is focused inside the section content and the section closes, focus should move to the trigger (Radix handles this) before `visibility: hidden` kicks in.

4. **A4**: The `forceMount` approach doesn't cause measurable performance degradation for typical PotFoundry sections (5-8 sliders per section, ~3-4 sections per tab). Heavy content like canvas elements would be a concern, but our sections contain only lightweight form controls.

---

## Component 3: ButtonV2

**File**: `src/ui/v2/controls/ButtonV2.tsx` + `ButtonV2.css`

### 3.1 Props Interface

```ts
export type ButtonV2Variant = 'primary' | 'secondary' | 'danger';
export type ButtonV2Size = 'sm' | 'md' | 'lg';

export interface ButtonV2Props
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant ('primary' = solid gold, 'secondary' = ghost, 'danger' = destructive) */
  variant?: ButtonV2Variant;
  /** Size preset */
  size?: ButtonV2Size;
  /** Loading spinner state */
  loading?: boolean;
  /** Icon before label */
  iconLeft?: React.ReactNode;
  /** Icon after label */
  iconRight?: React.ReactNode;
  /** Full-width mode */
  fullWidth?: boolean;
}
```

### 3.2 Implementation

```tsx
// src/ui/v2/controls/ButtonV2.tsx

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

/* ============================================================================
   IconButtonV2 — icon-only variant
   ============================================================================ */

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
```

### 3.3 CSS

```css
/* src/ui/v2/controls/ButtonV2.css */

/* ============================================================================
   Base Button
   ============================================================================ */

.pf2-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--pf2-space-sm);
  font-family: var(--pf2-font-body);
  font-weight: 600;
  border: none;
  border-radius: var(--pf2-radius-md);
  cursor: pointer;
  white-space: nowrap;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color var(--pf2-duration-micro) var(--pf2-ease-move),
    border-color var(--pf2-duration-micro) var(--pf2-ease-move),
    color var(--pf2-duration-micro) var(--pf2-ease-move),
    transform var(--pf2-duration-instant) var(--pf2-ease-exit);
}

.pf2-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Button press from motion.css applies globally, but we refine here */
.pf2-button:active:not(:disabled) {
  transform: scale(0.97) translateY(1px);
}

/* ============================================================================
   Size Variants
   ============================================================================ */

.pf2-button--sm {
  height: 28px;
  padding: 0 var(--pf2-space-md);    /* 12px */
  font-size: 12px;
}

.pf2-button--md {
  height: 36px;
  padding: 0 var(--pf2-space-lg);    /* 16px */
  font-size: 13px;
}

.pf2-button--lg {
  height: 44px;
  padding: 0 var(--pf2-space-xl);    /* 24px */
  font-size: 14px;
}

/* ============================================================================
   Primary (Gold)
   ============================================================================ */

.pf2-button--primary {
  background: var(--pf2-accent);
  color: var(--pf2-bg-base);
}

.pf2-button--primary:hover:not(:disabled) {
  background: var(--pf2-accent-hover);
}

.pf2-button--primary:active:not(:disabled) {
  background: var(--pf2-accent);
}

/* ============================================================================
   Secondary (Ghost)
   ============================================================================ */

.pf2-button--secondary {
  background: transparent;
  color: var(--pf2-text-primary);
  border: 1px solid var(--pf2-border);
}

.pf2-button--secondary:hover:not(:disabled) {
  border-color: var(--pf2-accent);
  color: var(--pf2-accent);
}

.pf2-button--secondary:active:not(:disabled) {
  background: var(--pf2-accent-subtle);
}

/* ============================================================================
   Danger
   ============================================================================ */

.pf2-button--danger {
  background: var(--pf2-error);
  color: var(--pf2-text-primary);
}

.pf2-button--danger:hover:not(:disabled) {
  background: #c86a6a; /* slightly lighter error */
}

.pf2-button--danger:active:not(:disabled) {
  background: var(--pf2-error);
}

/* ============================================================================
   Modifiers
   ============================================================================ */

.pf2-button--full {
  width: 100%;
}

.pf2-button--loading {
  pointer-events: none;
}

/* ============================================================================
   Parts
   ============================================================================ */

.pf2-button__icon {
  display: flex;
  align-items: center;
}

.pf2-button__icon svg {
  width: 1em;
  height: 1em;
}

.pf2-button--sm .pf2-button__icon svg {
  width: 14px;
  height: 14px;
}

.pf2-button--lg .pf2-button__icon svg {
  width: 18px;
  height: 18px;
}

.pf2-button__label {
  display: flex;
  align-items: center;
}

.pf2-button__spinner {
  display: flex;
  align-items: center;
}

.pf2-button__spinner svg {
  width: 16px;
  height: 16px;
  animation: pf2-spin 0.8s linear infinite;
}

@keyframes pf2-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ============================================================================
   Icon Button
   ============================================================================ */

.pf2-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--pf2-radius-md);
  cursor: pointer;
  background: transparent;
  color: var(--pf2-text-secondary);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color var(--pf2-duration-micro) var(--pf2-ease-move),
    color var(--pf2-duration-micro) var(--pf2-ease-move);
}

.pf2-icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pf2-icon-button--sm { width: 28px; height: 28px; }
.pf2-icon-button--md { width: 36px; height: 36px; }
.pf2-icon-button--lg { width: 44px; height: 44px; }

.pf2-icon-button--secondary:hover:not(:disabled) {
  background: var(--pf2-bg-hover);
  color: var(--pf2-text-primary);
}

.pf2-icon-button--primary {
  background: var(--pf2-accent);
  color: var(--pf2-bg-base);
}

.pf2-icon-button--primary:hover:not(:disabled) {
  background: var(--pf2-accent-hover);
}

.pf2-icon-button--danger:hover:not(:disabled) {
  background: rgba(184, 92, 92, 0.15);
  color: var(--pf2-error);
}

.pf2-icon-button svg {
  width: 18px;
  height: 18px;
}

.pf2-icon-button--sm svg { width: 14px; height: 14px; }
.pf2-icon-button--lg svg { width: 22px; height: 22px; }

/* ============================================================================
   High Contrast
   ============================================================================ */

@media (forced-colors: active) {
  .pf2-button {
    border: 1px solid ButtonText;
  }

  .pf2-button--primary {
    background: Highlight;
    color: HighlightText;
  }

  .pf2-icon-button {
    border: 1px solid ButtonText;
  }
}
```

### 3.4 Design Decisions

**D1. Three variants, not four**: v1 had primary/secondary/ghost/danger. v2 merges secondary and ghost into one "secondary" variant (transparent bg, border on hover). In the luxury aesthetic, having two distinct "not-primary" ghost variants creates visual noise. One ghost variant with gold-border hover is cleaner.

**D2. Solid gold primary, no gradient**: v1 used indigo gradients. The spec calls for `--pf2-accent` (solid gold). Gradients add visual complexity that clashes with the "quiet luxury" design language. Solid gold is more authoritative and easier to maintain.

**D3. `aria-busy` on loading**: When `loading` is true, the button gets `aria-busy="true"` to signal screen readers that an operation is in progress. Combined with `disabled`, this prevents double-submission while communicating state.

**D4. `pf2-focus-ring` always applied**: The class is always present (not conditional). It only activates on `:focus-visible`, so it has zero visual impact until keyboard focus. This is simpler than conditional toggling and ensures no focus-ring regressions.

### 3.5 Assumptions (for Verifier)

1. **A1**: The danger variant's hover color `#c86a6a` meets 4.5:1 contrast against `--pf2-bg-base` (#0f0f12). Should be verified.

2. **A2**: The global `button:active` rule in `motion.css` won't conflict with the component-specific `:active` styles. CSS specificity of `.pf2-button:active:not(:disabled)` > `.pf2-root button:active:not(:disabled)`.

---

## Component 4: SelectV2

**File**: `src/ui/v2/controls/SelectV2.tsx` + `SelectV2.css`

### 4.1 Props Interface

```ts
export interface SelectV2Option {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectV2Props {
  /** Current value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Available options */
  options: SelectV2Option[];
  /** Label text (rendered as pf2-text-label) */
  label?: string;
  /** Placeholder when no value selected */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Additional CSS class */
  className?: string;
}
```

### 4.2 Implementation

```tsx
// src/ui/v2/controls/SelectV2.tsx

import React, { useId } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';
import './SelectV2.css';

export interface SelectV2Option {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectV2Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectV2Option[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const SelectV2 = React.forwardRef<HTMLButtonElement, SelectV2Props>(
  (
    {
      value,
      onChange,
      options,
      label,
      placeholder = 'Select…',
      disabled = false,
      className,
    },
    ref
  ) => {
    const id = useId();
    const selectedOption = options.find((o) => o.value === value);

    return (
      <div className={clsx('pf2-select', className)}>
        {label && (
          <label className="pf2-select__label pf2-text-label" htmlFor={id}>
            {label}
          </label>
        )}

        <RadixSelect.Root
          value={value}
          onValueChange={onChange}
          disabled={disabled}
        >
          <RadixSelect.Trigger
            ref={ref}
            id={id}
            className="pf2-select__trigger pf2-focus-ring"
            aria-label={label}
          >
            <RadixSelect.Value placeholder={placeholder}>
              {selectedOption?.label || placeholder}
            </RadixSelect.Value>
            <RadixSelect.Icon className="pf2-select__chevron">
              <ChevronDown size={14} />
            </RadixSelect.Icon>
          </RadixSelect.Trigger>

          <RadixSelect.Portal>
            <RadixSelect.Content
              className="pf2-select__content"
              position="popper"
              sideOffset={4}
            >
              <RadixSelect.Viewport className="pf2-select__viewport">
                {options.map((option) => (
                  <RadixSelect.Item
                    key={option.value}
                    value={option.value}
                    className="pf2-select__item"
                    disabled={option.disabled}
                  >
                    <RadixSelect.ItemText>
                      <div className="pf2-select__item-content">
                        <span className="pf2-select__item-label">
                          {option.label}
                        </span>
                        {option.description && (
                          <span className="pf2-select__item-desc">
                            {option.description}
                          </span>
                        )}
                      </div>
                    </RadixSelect.ItemText>
                    <RadixSelect.ItemIndicator className="pf2-select__check">
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
  }
);

SelectV2.displayName = 'SelectV2';
```

### 4.3 CSS

```css
/* src/ui/v2/controls/SelectV2.css */

/* ============================================================================
   Container
   ============================================================================ */

.pf2-select {
  display: flex;
  flex-direction: column;
  gap: var(--pf2-space-sm);            /* 8px */
  width: 100%;
}

/* ============================================================================
   Label
   ============================================================================ */

.pf2-select__label {
  /* Inherits pf2-text-label styles */
  user-select: none;
}

/* ============================================================================
   Trigger
   ============================================================================ */

.pf2-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 36px;
  padding: 0 var(--pf2-space-md);      /* 12px */
  font-family: var(--pf2-font-body);
  font-size: 13px;
  color: var(--pf2-text-primary);
  background: var(--pf2-bg-elevated);
  border: 1px solid var(--pf2-border);
  border-radius: var(--pf2-radius-md);
  cursor: pointer;
  transition:
    border-color var(--pf2-duration-micro) var(--pf2-ease-move),
    background var(--pf2-duration-micro) var(--pf2-ease-move);
}

.pf2-select__trigger:hover:not(:disabled) {
  background: var(--pf2-bg-hover);
  border-color: var(--pf2-border-active);
}

.pf2-select__trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pf2-select__trigger[data-state='open'] {
  border-color: var(--pf2-accent);
}

.pf2-select__chevron {
  display: flex;
  align-items: center;
  color: var(--pf2-text-muted);
  transition: transform var(--pf2-duration-fast) var(--pf2-ease-move);
}

.pf2-select__trigger[data-state='open'] .pf2-select__chevron {
  transform: rotate(180deg);
}

/* ============================================================================
   Content (Dropdown)
   ============================================================================ */

.pf2-select__content {
  overflow: hidden;
  background: var(--pf2-bg-elevated);
  border: 1px solid var(--pf2-border-active);
  border-radius: var(--pf2-radius-md);
  box-shadow: var(--pf2-shadow-float);
  z-index: var(--pf2-z-tooltip);
  animation: pf2-select-enter var(--pf2-duration-fast) var(--pf2-ease-enter) both;
}

@keyframes pf2-select-enter {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.pf2-select__viewport {
  padding: var(--pf2-space-xs);
  max-height: 280px;
  overflow-y: auto;
}

/* Scrollbar */
.pf2-select__viewport::-webkit-scrollbar {
  width: 6px;
}

.pf2-select__viewport::-webkit-scrollbar-track {
  background: transparent;
}

.pf2-select__viewport::-webkit-scrollbar-thumb {
  background: var(--pf2-border-active);
  border-radius: 3px;
}

/* ============================================================================
   Items
   ============================================================================ */

.pf2-select__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pf2-space-sm);
  padding: var(--pf2-space-sm) var(--pf2-space-md);   /* 8px 12px */
  font-size: 13px;
  color: var(--pf2-text-primary);
  border-radius: var(--pf2-radius-sm);
  cursor: pointer;
  outline: none;
  user-select: none;
  transition:
    background var(--pf2-duration-instant) var(--pf2-ease-move),
    transform var(--pf2-duration-instant) var(--pf2-ease-move);
}

.pf2-select__item:hover,
.pf2-select__item[data-highlighted] {
  background: var(--pf2-accent-subtle);
}

.pf2-select__item[data-disabled] {
  opacity: 0.4;
  pointer-events: none;
}

.pf2-select__item[data-state='checked'] {
  color: var(--pf2-accent);
}

.pf2-select__item-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pf2-select__item-label {
  font-weight: 500;
}

.pf2-select__item-desc {
  font-size: 11px;
  color: var(--pf2-text-muted);
  line-height: 1.3;
}

.pf2-select__check {
  display: flex;
  align-items: center;
  color: var(--pf2-accent);
  flex-shrink: 0;
}

/* ============================================================================
   High Contrast
   ============================================================================ */

@media (forced-colors: active) {
  .pf2-select__trigger {
    border: 1px solid ButtonText;
  }

  .pf2-select__content {
    border: 1px solid ButtonText;
  }

  .pf2-select__item[data-highlighted] {
    background: Highlight;
    color: HighlightText;
  }

  .pf2-select__check {
    color: Highlight;
  }
}
```

### 4.4 Design Decisions

**D1. `forwardRef` on Trigger**: The ref is forwarded to the Radix `SelectTrigger`, not the outer wrapper. This enables focus management from parent components (e.g., `requestAnimationFrame(() => selectRef.current?.focus())` after modal close).

**D2. Gold accent highlight, not gold background**: Item hover uses `--pf2-accent-subtle` (12% opacity gold wash) rather than solid gold. Solid gold-on-dark on hover would feel too aggressive for a dropdown. The subtle wash is elegant and matches the luxury aesthetic.

**D3. Dropdown enter animation with scale**: The `pf2-select-enter` keyframe adds a subtle `scale(0.98 → 1)` alongside the translateY. This gives a "growing in" feel that's more organic than a flat slide.

**D4. Removed `fullWidth` prop**: Always full-width in v2 (the Select fills its container). The sidebar layout is constrained enough that a non-full-width select would look orphaned. If a narrow select is needed (unlikely), `className` with `max-width` suffices.

### 4.5 Assumptions (for Verifier)

1. **A1**: The `div` inside `RadixSelect.ItemText` is valid. Radix renders `ItemText` as a `span`, so a `div` child is technically invalid HTML (`div` inside `span`). Alternative: use two separate `span` elements with `display: flex; flex-direction: column`. **This may need to be fixed.**

2. **A2**: The dropdown `z-index: var(--pf2-z-tooltip)` (300) is sufficient. The Radix Portal renders at document root, so stacking context shouldn't be an issue.

---

## Component 5: Announcer

**File**: `src/ui/v2/shared/Announcer.tsx`  
**No separate CSS file** — uses inline sr-only styles.

### 5.1 API

```ts
/** Hook to announce messages via ARIA live region */
export function useAnnounce(): (message: string) => void;

/** Provider component — wrap the v2 root */
export const AnnouncerProvider: React.FC<{ children: React.ReactNode }>;
```

### 5.2 Implementation

```tsx
// src/ui/v2/shared/Announcer.tsx

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

// ============================================================================
// Context
// ============================================================================

type AnnounceFn = (message: string) => void;

const AnnouncerContext = createContext<AnnounceFn>(() => {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('useAnnounce() called outside <AnnouncerProvider>');
  }
});

/**
 * Returns a function to announce a message via ARIA live region.
 *
 * Announcements are queued to a hidden `role="status" aria-live="polite"` div.
 * Identical consecutive messages are still announced (guaranteed by
 * a two-slot double-buffer mechanism).
 *
 * @example
 * ```tsx
 * const announce = useAnnounce();
 * announce('Export complete: 12,400 triangles, 1.2 MB');
 * ```
 */
export function useAnnounce(): AnnounceFn {
  return useContext(AnnouncerContext);
}

// ============================================================================
// Provider
// ============================================================================

/**
 * Screen-reader-only visually hidden styles.
 * Defined as a constant to avoid re-creating the object on each render.
 */
const srOnlyStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * Provides an ARIA live region announcer for the v2 UI.
 *
 * Uses a double-buffer strategy: two `role="status"` divs alternate
 * between active and empty. This forces the browser to detect a DOM
 * change on every announcement, even if the message text is identical
 * to the previous one.
 *
 * Place this inside the `<div className="pf2-root">` so the live region
 * inherits the v2 root's language and direction attributes.
 */
export const AnnouncerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [slots, setSlots] = useState<[string, string]>(['', '']);
  const activeSlot = useRef(0);
  const rafId = useRef(0);

  const announce = useCallback((message: string) => {
    // Cancel any pending announcement from the same frame
    cancelAnimationFrame(rafId.current);

    // Step 1: Clear both slots to ensure the browser sees a DOM change
    setSlots(['', '']);

    // Step 2: In the next frame, write the message to the active slot
    rafId.current = requestAnimationFrame(() => {
      const slot = activeSlot.current;
      activeSlot.current = 1 - slot;
      setSlots((prev) => {
        const next: [string, string] = [prev[0], prev[1]];
        next[slot] = message;
        return next;
      });
    });
  }, []);

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div style={srOnlyStyle} data-pf2-announcer>
        <div role="status" aria-live="polite" aria-atomic="true">
          {slots[0]}
        </div>
        <div role="status" aria-live="polite" aria-atomic="true">
          {slots[1]}
        </div>
      </div>
    </AnnouncerContext.Provider>
  );
};
```

### 5.3 Design Decisions

**D1. Double-buffer over counter suffix**: The spec mentions "monotonic counter for repeated message uniqueness." A counter-suffix approach (appending invisible characters) is fragile — some screen readers announce trailing whitespace or zero-width characters. The double-buffer strategy (two live-region divs, alternating between active and empty) is the industry-standard approach used by Chakra UI, Reach UI, and others. It guarantees re-announcement of identical messages by ensuring the DOM always changes: clear → write.

**D2. `requestAnimationFrame` for two-phase update**: React 18 batches state updates within the same synchronous context. A simple `setSlots(['', ''])` followed by `setSlots([msg, ''])` would be batched into a single render with the final value — the browser would never see the cleared state. By using `requestAnimationFrame`, the clear and write happen in separate frames, giving the browser time to process the empty state before seeing the new message.

**D3. `cancelAnimationFrame` debounce**: If `announce()` is called multiple times within the same frame (e.g., during rapid state updates), only the last message is announced. This prevents announcement spam.

**D4. Dev-mode warning in default context**: Calling `useAnnounce()` outside the provider logs a warning in development. In production, the no-op function silently does nothing. This catches integration bugs during development without breaking production.

**D5. No CSS file**: The announcer's only visual element is a sr-only container. An inline `CSSProperties` constant is simpler than a separate CSS file for a single declaration. The `data-pf2-announcer` attribute enables easy DevTools identification.

**D6. `role="status" aria-live="polite"`**: Uses `polite` (not `assertive`) so announcements don't interrupt active screen reader speech. Export completion and preset application are informational, not urgent. If urgent announcements are needed later (e.g., errors), a second `aria-live="assertive"` region can be added.

### 5.4 Assumptions (for Verifier)

1. **A1**: The `requestAnimationFrame` two-step (clear → set) reliably forces screen reader re-announcement across NVDA (Firefox), JAWS (Chrome), and VoiceOver (Safari). If any screen reader coalesces rapid DOM changes across frames, this could fail silently.

2. **A2**: Having two `role="status"` divs inside a single parent doesn't cause screen readers to double-announce. Each slot is either empty (no announcement) or has content (announced). Only one slot has content at any time.

3. **A3**: `cancelAnimationFrame` correctly cancels the pending callback and the previous message is never announced. This depends on the rAF callback not having been already dispatched.

---

## Recommended Implementation Order

1. **Announcer** first — zero dependencies, small, foundational for a11y
2. **ButtonV2** — simplest interactive component, validates token usage
3. **SectionV2** — validates Radix Collapsible + animation pattern
4. **SelectV2** — validates Radix Select + v2 styling
5. **SliderV2** last — most complex, benefits from patterns established in 1-4

**Rationale**: Doing the simplest components first establishes the CSS token patterns and Radix styling approach. The SliderV2's complexity (snap math, drag tracking, tooltip, ghost marker) is easier to get right once the team has visceral familiarity with the v2 token system.

---

## Open Questions (Inviting Verifier Scrutiny)

1. **Q1 (SliderV2 A1)**: Does Radix Slider in controlled mode truly position the Thumb based on the `value` prop during an active drag? Or does it show the pointer position and only update on the next render? If the latter, the snap-to-default might show a flicker between raw and snapped positions.

2. **Q2 (SliderV2 A6)**: Could the `onDoubleClick` handler fire simultaneously with a drag initiation? If the user double-clicks the track, does Radix initiate a drag on the first click and ignore the second? Or does the second click fire `onDoubleClick` and reset the value mid-drag?

3. **Q3 (SectionV2 A2)**: Safari 16.3 doesn't support `grid-template-rows` animation. Our browser support floor needs to be stated. If Safari 16.0-16.3 are in scope, we need a fallback (e.g., `max-height` animation or a `@supports` query).

4. **Q4 (SelectV2 A1)**: The `div` inside `RadixSelect.ItemText` creates invalid HTML (block inside inline). Should we use `span` with `display: flex; flex-direction: column` instead?

5. **Q5 (Announcer A1)**: Should we defensively test the rAF double-buffer with NVDA + Firefox, JAWS + Chrome, and VoiceOver + Safari before shipping? Or is the pattern well-established enough to trust?

6. **Q6 (General)**: Should the components accept a `density` prop (reading `UIDensity` from store) to adjust sizes/padding, or should density be handled purely via CSS custom properties at the root level? If root-level, the Section padding and Slider gap would need density-aware values.

---

*Generator out. Let the Verifier do their worst.*
