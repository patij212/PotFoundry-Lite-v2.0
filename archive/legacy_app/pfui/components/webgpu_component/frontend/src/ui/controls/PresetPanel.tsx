/**
 * PresetPanel Component
 *
 * Displays a gallery of curated pot presets with category filtering,
 * search functionality, and one-click application.
 *
 * @module ui/controls/PresetPanel
 */

import { useState, useMemo, useCallback } from 'react';
import { Search, Filter, Grid, List, Check, Sparkles } from 'lucide-react';
import { useGeometry, useStyle, useGeometryActions, useStyleActions, useAppearanceActions } from '../../state';
import {
  PRESETS,
  getPresetsByCategory,
  getCategories,
  presetStyleToId,
  type PotPreset,
  type PresetCategory,
} from '../../presets';
import { Section } from '../shared/Section';
import './PresetPanel.css';

/** View mode for preset display */
type ViewMode = 'grid' | 'list';

/**
 * Preview thumbnail for a preset
 * Uses CSS-based visual representation of the pot shape
 */
function PresetThumbnail({ preset }: { preset: PotPreset }) {
  const { geometry } = preset.config;

  // Calculate shape characteristics for CSS visualization
  const taperRatio = geometry.bottomOd / geometry.topOd;
  const aspectRatio = geometry.H / geometry.topOd;

  // Derive visual properties from preset
  const borderRadius = taperRatio > 0.8 ? '8px' : taperRatio > 0.5 ? '4px 4px 12px 12px' : '4px 4px 20px 20px';

  return (
    <div
      className="preset-thumbnail"
      style={{
        '--preset-color': preset.color,
        '--preset-aspect': aspectRatio,
        '--preset-taper': taperRatio,
        borderRadius,
      } as React.CSSProperties}
    >
      <div className="preset-thumbnail-inner">
        <div className="preset-thumbnail-pattern" />
      </div>
    </div>
  );
}

/**
 * Individual preset card component
 */
function PresetCard({
  preset,
  isActive,
  viewMode,
  onApply,
}: {
  preset: PotPreset;
  isActive: boolean;
  viewMode: ViewMode;
  onApply: () => void;
}) {
  return (
    <button
      className={`preset-card preset-card--${viewMode} ${isActive ? 'preset-card--active' : ''}`}
      onClick={onApply}
      title={preset.description}
    >
      <PresetThumbnail preset={preset} />
      <div className="preset-card-info">
        <span className="preset-card-name">{preset.name}</span>
        <span className="preset-card-category">{preset.category}</span>
      </div>
      {isActive && (
        <div className="preset-card-active-indicator">
          <Check size={14} />
        </div>
      )}
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

/**
 * PresetPanel Component
 *
 * Features:
 * - Visual preset gallery with thumbnails
 * - Category filtering
 * - Search functionality
 * - Grid/list view toggle
 * - One-click preset application
 * - Active preset highlighting
 */
export function PresetPanel() {
  // Local UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<PresetCategory | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Store state
  const currentGeometry = useGeometry();
  const currentStyle = useStyle();

  // Store actions
  const { setGeometryParams } = useGeometryActions();
  const { setStyle, setStyleOpts } = useStyleActions();
  const { setPrimaryColor, setCustomGradient } = useAppearanceActions();

  // Get available categories
  const categories = useMemo(() => getCategories(), []);

  // Filter presets based on search and category
  const filteredPresets = useMemo(() => {
    let result = activeCategory ? getPresetsByCategory(activeCategory) : PRESETS;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (preset) =>
          preset.name.toLowerCase().includes(query) ||
          preset.description.toLowerCase().includes(query)
      );
    }

    return result;
  }, [activeCategory, searchQuery]);

  // Check if a preset matches current state (simplified check)
  const isPresetActive = useCallback(
    (preset: PotPreset): boolean => {
      const { geometry, style } = preset.config;
      const styleName = presetStyleToId(style.type);

      return (
        currentGeometry.H === geometry.H &&
        currentGeometry.top_od === geometry.topOd &&
        currentGeometry.bottom_od === geometry.bottomOd &&
        currentStyle.name === styleName
      );
    },
    [currentGeometry, currentStyle.name]
  );

  // Apply a preset to the store
  const applyPreset = useCallback(
    (preset: PotPreset) => {
      const { geometry, style, appearance } = preset.config;

      // Convert style type to style name
      const styleName = presetStyleToId(style.type);

      // Apply geometry
      setGeometryParams({
        H: geometry.H,
        top_od: geometry.topOd,
        bottom_od: geometry.bottomOd,
        t_wall: geometry.tWall,
        t_bottom: geometry.tBottom,
        r_drain: geometry.rDrain,
        expn: geometry.expn,
      });

      // Apply style
      setStyle(styleName);
      setStyleOpts(style.params);

      // Apply appearance if available
      if (appearance?.primaryColor) {
        setPrimaryColor(appearance.primaryColor);
      }
      if (appearance?.gradient && appearance.gradient.length >= 2) {
        setCustomGradient([appearance.gradient[0], appearance.gradient[1]]);
      }
    },
    [setGeometryParams, setStyle, setStyleOpts, setPrimaryColor, setCustomGradient]
  );

  return (
    <Section
      title="Presets"
      icon={<Sparkles size={16} />}
      defaultOpen={false}
      className="preset-panel"
    >
      {/* Search and view controls */}
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
        <div className="preset-view-toggle">
          <button
            className={`preset-view-btn ${viewMode === 'grid' ? 'preset-view-btn--active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <Grid size={14} />
          </button>
          <button
            className={`preset-view-btn ${viewMode === 'list' ? 'preset-view-btn--active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {/* Category filters */}
      <CategoryFilters
        categories={categories}
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
      />

      {/* Preset grid/list */}
      <div className={`preset-gallery preset-gallery--${viewMode}`}>
        {filteredPresets.length > 0 ? (
          filteredPresets.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isActive={isPresetActive(preset)}
              viewMode={viewMode}
              onApply={() => applyPreset(preset)}
            />
          ))
        ) : (
          <div className="preset-empty">
            <Filter size={24} />
            <span>No presets match your search</span>
          </div>
        )}
      </div>

      {/* Preset count */}
      <div className="preset-footer">
        <span className="preset-count">
          {filteredPresets.length} of {PRESETS.length} presets
        </span>
      </div>
    </Section>
  );
}
