/**
 * PresetStrip — Horizontal scrollable preset quick-pick.
 *
 * Compact row of preset thumbnails at the top of ShapeTab for
 * one-tap preset application without opening the full library drawer.
 *
 * @module ui/v2/tabs/PresetStrip
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PRESETS, type PotPreset } from '../../../presets';
import { DesignThumbnail } from '../../shared/DesignThumbnail';
import { useAppStore, type StyleName } from '../../../state';
import { useAnnounce } from '../shared/Announcer';
import { useConfidence } from '../onboarding/useConfidence';
import type { LibraryDesign } from '../../../context/LibraryContext';
import clsx from 'clsx';
import './PresetStrip.css';

// ============================================================================
// Helpers
// ============================================================================

function presetToDesign(preset: PotPreset): LibraryDesign {
  return {
    id: preset.id,
    title: preset.title,
    style: preset.style,
    created_at: new Date().toISOString(),
    size: preset.size,
    opts: preset.opts,
    appearance: preset.appearance,
  };
}

// ============================================================================
// Sub-component
// ============================================================================

interface PresetChipProps {
  preset: PotPreset;
  design: LibraryDesign;
  isActive: boolean;
  isFocused: boolean;
  onApply: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}

const PresetChip: React.FC<PresetChipProps> = React.memo(
  ({ preset, design, isActive, isFocused, onApply, buttonRef }) => (
    <button
      ref={buttonRef}
      className={clsx(
        'pf2-preset-strip__chip pf2-focus-ring',
        isActive && 'pf2-preset-strip__chip--active'
      )}
      onClick={onApply}
      title={preset.description}
      aria-label={`Apply ${preset.title} preset`}
      aria-pressed={isActive}
      tabIndex={isFocused ? 0 : -1}
    >
      <div className="pf2-preset-strip__thumb">
        <DesignThumbnail design={design} width={64} height={48} />
      </div>
      <span className="pf2-preset-strip__label">{preset.title}</span>
    </button>
  ),
  (prev, next) =>
    prev.preset.id === next.preset.id &&
    prev.isActive === next.isActive &&
    prev.isFocused === next.isFocused
);

PresetChip.displayName = 'PresetChip';

// ============================================================================
// Component
// ============================================================================

export const PresetStrip: React.FC = () => {
  const announce = useAnnounce();
  const { unlock } = useConfidence();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const setGeometryParams = useAppStore((s) => s.setGeometryParams);
  const currentStyle = useAppStore((s) => s.style.name);
  const currentHeight = useAppStore((s) => s.geometry.H);
  const setStyle = useAppStore((s) => s.setStyle);
  const setStyleOpts = useAppStore((s) => s.setStyleOpts);
  const setPrimaryColor = useAppStore((s) => s.setPrimaryColor);
  const setMidColor = useAppStore((s) => s.setMidColor);
  const setSecondaryColor = useAppStore((s) => s.setSecondaryColor);
  const beginHistoryTransaction = useAppStore((s) => s.beginHistoryTransaction);
  const commitHistoryTransaction = useAppStore((s) => s.commitHistoryTransaction);

  const designs = useMemo(
    () => PRESETS.map((p) => presetToDesign(p)),
    []
  );

  const isPresetActive = useCallback(
    (preset: PotPreset): boolean =>
      currentStyle === preset.style &&
      Math.abs(currentHeight - preset.size.height) < 0.1,
    [currentStyle, currentHeight]
  );

  const applyPreset = useCallback(
    (preset: PotPreset) => {
      beginHistoryTransaction();

      setGeometryParams({
        H: preset.size.height,
        top_od: preset.size.top_od,
        bottom_od: preset.size.bottom_od,
        t_wall: preset.size.wall_thickness,
        t_bottom: preset.size.bottom_thickness,
        r_drain: preset.size.drain_radius,
        expn: preset.size.flare_exp,
        spinTurns: (preset.opts.spin_turns as number) || 0,
        spinPhase: (preset.opts.spin_phase as number) || 0,
        spinCurve: (preset.opts.spin_curve as number) || 1,
        bellAmp: (preset.opts.bell_amp as number) || 0,
        bellCenter: (preset.opts.bell_center as number) || 0.5,
        bellWidth: (preset.opts.bell_width as number) || 0.22,
      });

      setStyle(preset.style as StyleName);
      const geoKeys = new Set([
        'spin_turns', 'spin_phase', 'spin_curve',
        'bell_amp', 'bell_center', 'bell_width',
      ]);
      const styleParams: Record<string, number | boolean> = {};
      for (const [key, value] of Object.entries(preset.opts)) {
        if (!geoKeys.has(key)) {
          styleParams[key] = value;
        }
      }
      setStyleOpts(styleParams);

      if (preset.appearance) {
        setPrimaryColor(preset.appearance.primaryColor);
        setMidColor(preset.appearance.midColor);
        setSecondaryColor(preset.appearance.secondaryColor);
      }

      commitHistoryTransaction();
      announce(`Applied preset: ${preset.title}`);
      unlock('preset-load');
    },
    [
      beginHistoryTransaction, commitHistoryTransaction,
      setGeometryParams, setStyle, setStyleOpts,
      setPrimaryColor, setMidColor, setSecondaryColor,
      announce, unlock,
    ]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const count = PRESETS.length;
      let next = focusedIndex;

      switch (e.key) {
        case 'ArrowRight':
          next = (focusedIndex + 1) % count;
          break;
        case 'ArrowLeft':
          next = (focusedIndex - 1 + count) % count;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = count - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      setFocusedIndex(next);
      chipRefs.current[next]?.focus();
      chipRefs.current[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },
    [focusedIndex]
  );

  return (
    <div
      className="pf2-preset-strip"
      role="group"
      aria-label="Quick presets"
      onKeyDown={handleKeyDown}
    >
      <div className="pf2-preset-strip__scroll">
        {PRESETS.map((preset, i) => (
          <PresetChip
            key={preset.id}
            preset={preset}
            design={designs[i]}
            isActive={isPresetActive(preset)}
            isFocused={focusedIndex === i}
            onApply={() => applyPreset(preset)}
            buttonRef={(el) => { chipRefs.current[i] = el; }}
          />
        ))}
      </div>
    </div>
  );
};
