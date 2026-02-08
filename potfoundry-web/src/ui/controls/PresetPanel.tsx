/**
 * PresetPanel Component
 *
 * Displays a gallery of curated pot presets with category filtering,
 * search functionality, and one-click application.
 *
 * @module ui/controls/PresetPanel
 */

import { useState, useMemo, useCallback } from 'react';
import { Search, Sparkles, Star } from 'lucide-react';
import { useGeometry, useStyle, useGeometryActions, useStyleActions, useAppearanceActions } from '../../state';
import type { StyleName } from '../../state/types';
import {
  PRESETS,
  getPresetsByCategory,
  getCategories,
  type PotPreset,
  type PresetCategory,
} from '../../presets';
import { Section } from '../shared/Section';
import { DesignThumbnail } from '../shared/DesignThumbnail';
import type { LibraryDesign } from '../../context/LibraryContext';
import './PresetPanel.css';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert PotPreset to LibraryDesign for ThumbnailRenderer
 */
function presetToDesign(preset: PotPreset): LibraryDesign {
  return {
    id: preset.id,
    title: preset.title,
    style: preset.style,
    created_at: new Date().toISOString(), // Dummy date
    size: preset.size,
    opts: preset.opts,
    appearance: preset.appearance,
  };
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Individual preset card component
 */
function PresetCard({
  preset,
  isActive,
  onApply,
  featured = false,
}: {
  preset: PotPreset;
  isActive: boolean;
  onApply: () => void;
  featured?: boolean;
}) {
  // Convert to LibraryDesign for thumbnail
  const design = useMemo(() => presetToDesign(preset), [preset]);

  return (
    <button
      className={`preset-card ${isActive ? 'preset-card--active' : ''} ${featured ? 'preset-card--featured' : ''}`}
      onClick={onApply}
      title={preset.description}
    >
      <div className="preset-card-thumb">
        <DesignThumbnail design={design} width={140} height={105} />
      </div>

      <div className="preset-card-info">
        <div className="preset-card-header">
          <span className="preset-card-title">{preset.title}</span>
          {featured && <Star size={12} className="preset-card-star" fill="currentColor" />}
        </div>
        <span className="preset-card-desc">{preset.category}</span>
      </div>
    </button>
  );
}

/**
 * Category filter chips
 */
function CategoryFilters({
  categories,
  activeCategory,
  onSelect,
}: {
  categories: Array<{ category: PresetCategory; count: number; label: string }>;
  activeCategory: PresetCategory | null;
  onSelect: (category: PresetCategory | null) => void;
}) {
  return (
    <div className="preset-category-filters">
      <button
        className={`preset-category-chip ${activeCategory === null ? 'preset-category-chip--active' : ''}`}
        onClick={() => onSelect(null)}
      >
        All
      </button>
      {categories.map(({ category, label }) => (
        <button
          key={category}
          className={`preset-category-chip ${activeCategory === category ? 'preset-category-chip--active' : ''}`}
          onClick={() => onSelect(category)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * PresetPanel Component
 */
export function PresetPanel() {
  // Local UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<PresetCategory | null>(null);

  // Store state
  const currentGeometry = useGeometry();
  const currentStyle = useStyle();

  // Store actions
  const { setGeometryParams } = useGeometryActions();
  const { setStyle, setStyleOpts } = useStyleActions();
  const { setPrimaryColor, setMidColor, setSecondaryColor, setCustomGradient, setGradientAngle, setLightingPreset } = useAppearanceActions();

  // Get available categories
  const categories = useMemo(() => getCategories(), []);

  // Filter presets based on search and category
  const filteredPresets = useMemo(() => {
    let result = activeCategory ? getPresetsByCategory(activeCategory) : PRESETS;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (preset) =>
          preset.title.toLowerCase().includes(query) ||
          preset.description.toLowerCase().includes(query)
      );
    }

    return result;
  }, [activeCategory, searchQuery]);

  // Featured presets (Top 3)
  const featuredPresets = useMemo(() => {
    // Only show featured if no search/filter is active
    if (searchQuery || activeCategory) return [];

    // Pick specific highlighted presets
    return PRESETS.filter(p =>
      ['geo-spiral', 'organic-ripple', 'exp-celtic'].includes(p.id)
    );
  }, [searchQuery, activeCategory]);

  // Remaining presets (excluding featured if showing featured)
  const listPresets = useMemo(() => {
    if (featuredPresets.length > 0) {
      return filteredPresets.filter(p => !featuredPresets.includes(p));
    }
    return filteredPresets;
  }, [filteredPresets, featuredPresets]);

  // Check if a preset matches current state
  const isPresetActive = useCallback(
    (preset: PotPreset): boolean => {
      // Simple heuristic: match style and height
      // Exact geometry match is too brittle for floats
      return (
        currentStyle.name === preset.style &&
        Math.abs(currentGeometry.H - preset.size.height) < 0.1
      );
    },
    [currentGeometry.H, currentStyle.name]
  );

  // Apply a preset to the store
  const applyPreset = useCallback(
    (preset: PotPreset) => {
      // 1. Geometry
      setGeometryParams({
        H: preset.size.height,
        top_od: preset.size.top_od,
        bottom_od: preset.size.bottom_od,
        t_wall: preset.size.wall_thickness,
        t_bottom: preset.size.bottom_thickness,
        r_drain: preset.size.drain_radius,
        expn: preset.size.flare_exp,
        // Extract extra Geometry modifiers from opts (spin/bell)
        spinTurns: (preset.opts.spin_turns as number) || 0,
        spinPhase: (preset.opts.spin_phase as number) || 0,
        spinCurve: (preset.opts.spin_curve as number) || 1,
        bellAmp: (preset.opts.bell_amp as number) || 0,
        bellCenter: (preset.opts.bell_center as number) || 0.5,
        bellWidth: (preset.opts.bell_width as number) || 0.22,
      });

      // 2. Style
      setStyle(preset.style as StyleName);
      // Filter out geometry modifiers from opts before passing to style opts
      // (This prevents warnings, though extra props are usually harmless)
      const styleParams: Record<string, number | boolean> = {};
      const geoKeys = ['spin_turns', 'spin_phase', 'spin_curve', 'bell_amp', 'bell_center', 'bell_width'];

      Object.entries(preset.opts).forEach(([key, value]) => {
        if (!geoKeys.includes(key)) {
          styleParams[key] = value;
        }
      });
      setStyleOpts(styleParams);

      // 3. Appearance
      if (preset.appearance) {
        setPrimaryColor(preset.appearance.primaryColor);
        setMidColor(preset.appearance.midColor);
        setSecondaryColor(preset.appearance.secondaryColor);

        // if (preset.appearance.gradient) {
        //   setCustomGradient(preset.appearance.gradient);
        // }
        // if (preset.appearance.gradientAngle !== undefined) {
        //   setGradientAngle(preset.appearance.gradientAngle);
        // }
        // if (preset.appearance.lightingPreset) {
        //   setLightingPreset(preset.appearance.lightingPreset);
        // }
      }
    },
    [setGeometryParams, setStyle, setStyleOpts, setPrimaryColor, setMidColor, setSecondaryColor, setCustomGradient, setGradientAngle, setLightingPreset]
  );

  return (
    <Section
      title="Presets"
      icon={<Sparkles size={16} />}
      defaultOpen={false}
      className="preset-panel"
    >
      {/* Search Bar */}
      <div className="preset-toolbar">
        <div className="preset-search">
          <Search size={14} className="preset-search-icon" />
          <input
            type="text"
            placeholder="Search presets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="preset-search-input"
          />
        </div>
      </div>

      {/* Category Filters */}
      <CategoryFilters
        categories={categories}
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
      />

      {/* Featured Section (only when no filter) */}
      {featuredPresets.length > 0 && (
        <div className="preset-featured">
          <div className="preset-section-label">Featured</div>
          <div className="preset-grid">
            {featuredPresets.map(preset => (
              <PresetCard
                key={preset.id}
                preset={preset}
                isActive={isPresetActive(preset)}
                onApply={() => applyPreset(preset)}
                featured={true}
              />
            ))}
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="preset-grid">
        {featuredPresets.length > 0 && listPresets.length > 0 && (
          <div className="preset-section-label" style={{ marginTop: '12px' }}>Collection</div>
        )}

        {listPresets.length > 0 ? (
          listPresets.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isActive={isPresetActive(preset)}
              onApply={() => applyPreset(preset)}
            />
          ))
        ) : (
          /* Empty State (if no featured items either) */
          featuredPresets.length === 0 && (
            <div className="preset-empty">
              <span>No presets match your search</span>
            </div>
          )
        )}
      </div>

    </Section>
  );
}
