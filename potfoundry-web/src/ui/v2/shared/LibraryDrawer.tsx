/**
 * LibraryDrawer — Full-screen preset library modal.
 *
 * Uses Radix Dialog for overlay, focus trapping, and Escape handling.
 * Displays preset cards with DesignThumbnail, category filtering, search.
 *
 * @module ui/v2/shared/LibraryDrawer
 */

import React, { useState, useMemo, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, X } from 'lucide-react';
import {
  PRESETS,
  getPresetsByCategory,
  getCategories,
  type PotPreset,
  type PresetCategory,
} from '../../../presets';
import { DesignThumbnail } from '../../shared/DesignThumbnail';
import { useAppStore, type StyleName } from '../../../state';
import { useAnnounce } from './Announcer';
import { useConfidence } from '../onboarding/useConfidence';
import type { LibraryDesign } from '../../../context/LibraryContext';
import clsx from 'clsx';
import './LibraryDrawer.css';

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
// Sub-components
// ============================================================================

interface PresetCardProps {
  preset: PotPreset;
  isActive: boolean;
  onApply: () => void;
}

const PresetCard: React.FC<PresetCardProps> = ({ preset, isActive, onApply }) => {
  const design = useMemo(() => presetToDesign(preset), [preset]);

  return (
    <button
      className={clsx(
        'pf2-library-drawer__card pf2-focus-ring',
        isActive && 'pf2-library-drawer__card--active'
      )}
      onClick={onApply}
      title={preset.description}
    >
      <div className="pf2-library-drawer__card-thumb">
        <DesignThumbnail design={design} width={160} height={120} />
      </div>
      <div className="pf2-library-drawer__card-info">
        <span className="pf2-library-drawer__card-title">{preset.title}</span>
        <span className="pf2-library-drawer__card-category pf2-text-label">
          {preset.category}
        </span>
      </div>
    </button>
  );
};

// ============================================================================
// Main Component
// ============================================================================

interface LibraryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const LibraryDrawer: React.FC<LibraryDrawerProps> = ({
  open,
  onOpenChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<PresetCategory | null>(null);

  const announce = useAnnounce();
  const { unlock } = useConfidence();

  // Store actions
  const setGeometryParams = useAppStore((s) => s.setGeometryParams);
  const currentStyle = useAppStore((s) => s.style.name);
  const currentHeight = useAppStore((s) => s.geometry.H);
  const setStyle = useAppStore((s) => s.setStyle);
  const setStyleOpts = useAppStore((s) => s.setStyleOpts);
  const setPrimaryColor = useAppStore((s) => s.setPrimaryColor);
  const setMidColor = useAppStore((s) => s.setMidColor);
  const setSecondaryColor = useAppStore((s) => s.setSecondaryColor);

  const categories = useMemo(() => getCategories(), []);

  const filteredPresets = useMemo(() => {
    let result: PotPreset[] = activeCategory
      ? getPresetsByCategory(activeCategory)
      : PRESETS;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query)
      );
    }

    return result;
  }, [activeCategory, searchQuery]);

  const isPresetActive = useCallback(
    (preset: PotPreset): boolean => {
      return (
        currentStyle === preset.style &&
        Math.abs(currentHeight - preset.size.height) < 0.1
      );
    },
    [currentStyle, currentHeight]
  );

  const applyPreset = useCallback(
    (preset: PotPreset) => {
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

      onOpenChange(false);
      announce(`Applied preset: ${preset.title}`);
      unlock('preset-load');
    },
    [
      setGeometryParams, setStyle, setStyleOpts,
      setPrimaryColor, setMidColor, setSecondaryColor,
      onOpenChange, announce, unlock,
    ]
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pf2-library-drawer__overlay" />
        <Dialog.Content
          className="pf2-library-drawer"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="pf2-library-drawer__header">
            <Dialog.Title className="pf2-library-drawer__title">
              Preset Library
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="pf2-library-drawer__close pf2-focus-ring"
                aria-label="Close library"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* Search */}
          <div className="pf2-library-drawer__search">
            <Search size={14} className="pf2-library-drawer__search-icon" />
            <input
              type="text"
              className="pf2-library-drawer__search-input pf2-focus-ring"
              placeholder="Search presets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search presets"
            />
          </div>

          {/* Category Filters */}
          <div className="pf2-library-drawer__categories" role="radiogroup" aria-label="Filter by category">
            <button
              className={clsx(
                'pf2-library-drawer__chip pf2-focus-ring',
                activeCategory === null && 'pf2-library-drawer__chip--active'
              )}
              onClick={() => setActiveCategory(null)}
              role="radio"
              aria-checked={activeCategory === null}
            >
              All
            </button>
            {categories.map(({ category, label }) => (
              <button
                key={category}
                className={clsx(
                  'pf2-library-drawer__chip pf2-focus-ring',
                  activeCategory === category && 'pf2-library-drawer__chip--active'
                )}
                onClick={() => setActiveCategory(category)}
                role="radio"
                aria-checked={activeCategory === category}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Preset Grid */}
          <div className="pf2-library-drawer__grid">
            {filteredPresets.length > 0 ? (
              filteredPresets.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  isActive={isPresetActive(preset)}
                  onApply={() => applyPreset(preset)}
                />
              ))
            ) : (
              <p className="pf2-library-drawer__empty pf2-text-label">
                No presets match your search.
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
