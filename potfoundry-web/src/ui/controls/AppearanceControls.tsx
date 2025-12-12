/**
 * Appearance controls component.
 * 
 * Provides controls for visual appearance (colors, wireframe, lighting).
 * Includes color swatches, gradient preview, and display toggles.
 * 
 * @module ui/controls/AppearanceControls
 */

import React, { useCallback, useMemo } from 'react';
import { Palette, Sun, Eye, EyeOff, Grid3x3, Sparkles, Moon, Lightbulb, CircleDot } from 'lucide-react';
import { Section, SectionGroup } from '../shared/Section';
import { Button } from '../shared/Button';
import { Slider } from '../shared/Slider';
import {
  useAppearance,
  useAppearanceActions,
  COLOR_SCHEMES,
  LIGHTING_PRESETS,
  BACKGROUND_GRADIENTS,
} from '../../state';
import './AppearanceControls.css';

// ============================================================================
// Color Swatch Component
// ============================================================================

interface ColorSwatchProps {
  color: string;
  midColor?: string;
  secondaryColor?: string;
  isActive: boolean;
  onClick: () => void;
  label: string;
}

const ColorSwatch: React.FC<ColorSwatchProps> = ({
  color,
  midColor,
  secondaryColor,
  isActive,
  onClick,
  label,
}) => (
  <button
    type="button"
    className={`pf-color-swatch ${isActive ? 'pf-color-swatch--active' : ''}`}
    onClick={onClick}
    title={label}
    aria-label={label}
    aria-pressed={isActive}
  >
    <span
      className="pf-color-swatch__color"
      style={{
        background: midColor && secondaryColor
          ? `linear-gradient(135deg, ${color} 0%, ${midColor} 50%, ${secondaryColor} 100%)`
          : secondaryColor
            ? `linear-gradient(135deg, ${color} 50%, ${secondaryColor} 50%)`
            : color,
      }}
    />
  </button>
);

// ============================================================================
// Gradient Preview Component
// ============================================================================

interface GradientPreviewProps {
  colors: [string, string];
  angle?: number;
}

const GradientPreview: React.FC<GradientPreviewProps> = ({ colors, angle = 135 }) => (
  <div
    className="pf-gradient-preview"
    style={{
      background: `linear-gradient(${angle}deg, ${colors[0]}, ${colors[1]})`,
    }}
  />
);

// ============================================================================
// Lighting Chip Component
// ============================================================================

/**
 * Icon mapping for lighting presets
 */
const LIGHTING_ICONS: Record<string, React.ReactNode> = {
  studio: <Sun size={14} />,
  soft: <Moon size={14} />,
  dramatic: <Sparkles size={14} />,
  flat: <Lightbulb size={14} />,
  glossy: <CircleDot size={14} />,
};

interface LightingChipProps {
  presetId: string;
  name: string;
  isActive: boolean;
  onClick: () => void;
  ambient: number;
  specular: number;
}

const LightingChip: React.FC<LightingChipProps> = ({
  presetId,
  name,
  isActive,
  onClick,
  ambient,
  specular,
}) => (
  <button
    type="button"
    className={`pf-lighting-chip ${isActive ? 'pf-lighting-chip--active' : ''}`}
    onClick={onClick}
    title={name}
    aria-label={name}
    aria-pressed={isActive}
  >
    <span className="pf-lighting-chip__icon">
      {LIGHTING_ICONS[presetId] || <Sun size={14} />}
    </span>
    <span className="pf-lighting-chip__label">{name}</span>
    <span
      className="pf-lighting-chip__indicator"
      style={{
        // Visual indicator based on ambient/specular ratio
        background: `linear-gradient(180deg, 
          rgba(255,255,255,${specular * 0.5}) 0%, 
          rgba(128,128,128,${ambient}) 100%)`,
      }}
    />
  </button>
);

// ============================================================================
// Component
// ============================================================================

/**
 * Controls for visual appearance settings.
 */
export const AppearanceControls: React.FC = () => {
  const appearance = useAppearance();
  const {
    setColorScheme,
    setPrimaryColor,
    setMidColor,
    setSecondaryColor,
    setLightingPreset,
    setBackgroundGradient,
    setGradientAngle,
    setCustomGradient,
    toggleWireframe,
    toggleInner,
  } = useAppearanceActions();

  // Angle handler
  const handleAngle = useCallback(
    (value: number) => setGradientAngle(value),
    [setGradientAngle]
  );

  // Memoize current gradient ID lookup
  const currentGradientId = useMemo(() => {
    const found = BACKGROUND_GRADIENTS.find(
      (g) =>
        g.colors[0] === appearance.gradient[0] &&
        g.colors[1] === appearance.gradient[1]
    );
    return found?.id || 'dark_blue';
  }, [appearance.gradient]);

  // Color scheme handlers
  const handleColorScheme = useCallback(
    (schemeId: string) => setColorScheme(schemeId),
    [setColorScheme]
  );

  const handlePrimaryColor = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setPrimaryColor(e.target.value),
    [setPrimaryColor]
  );

  const handleMidColor = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setMidColor(e.target.value),
    [setMidColor]
  );

  const handleSecondaryColor = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setSecondaryColor(e.target.value),
    [setSecondaryColor]
  );

  // Lighting handler
  const handleLighting = useCallback(
    (value: string) => setLightingPreset(value),
    [setLightingPreset]
  );

  // Background handler
  const handleBackground = useCallback(
    (value: string) => setBackgroundGradient(value),
    [setBackgroundGradient]
  );

  // Custom background color handlers
  // FLIPPED: Top (Color 1) sets gradient[1] (Top in shader)
  //          Bottom (Color 2) sets gradient[0] (Bottom in shader)
  // Because in Shader: 0 is start (bottom), 1 is end (top)
  const handleBgColor1 = useCallback( // "Color 1 (Top)" in UI
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCustomGradient([appearance.gradient[0], e.target.value]); // Set Top
    },
    [setCustomGradient, appearance.gradient]
  );

  const handleBgColor2 = useCallback( // "Color 2 (Bottom)" in UI
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCustomGradient([e.target.value, appearance.gradient[1]]); // Set Bottom
    },
    [setCustomGradient, appearance.gradient]
  );

  return (
    <Section title="Appearance" icon={<Palette size={16} />} defaultOpen={false}>
      <SectionGroup label="Pot Color">
        {/* Color scheme swatches */}
        <div className="pf-color-swatches">
          {COLOR_SCHEMES.map((scheme) => (
            <ColorSwatch
              key={scheme.id}
              color={scheme.primary}
              midColor={scheme.mid}
              secondaryColor={scheme.secondary}
              isActive={appearance.colorScheme === scheme.id}
              onClick={() => handleColorScheme(scheme.id)}
              label={scheme.name}
            />
          ))}
        </div>

        {/* Custom color pickers - 3 stops (Top → Middle → Bottom) */}
        <div className="pf-appearance-color-pickers">
          <div className="pf-appearance-color-row">
            <label className="pf-appearance-color-label">Top</label>
            <div className="pf-appearance-color-picker">
              <input
                type="color"
                value={appearance.secondaryColor}
                onChange={handleSecondaryColor}
                className="pf-appearance-color-input"
              />
              <span className="pf-appearance-color-value">
                {appearance.secondaryColor}
              </span>
            </div>
          </div>

          <div className="pf-appearance-color-row">
            <label className="pf-appearance-color-label">Middle</label>
            <div className="pf-appearance-color-picker">
              <input
                type="color"
                value={appearance.midColor}
                onChange={handleMidColor}
                className="pf-appearance-color-input"
              />
              <span className="pf-appearance-color-value">
                {appearance.midColor}
              </span>
            </div>
          </div>

          <div className="pf-appearance-color-row">
            <label className="pf-appearance-color-label">Bottom</label>
            <div className="pf-appearance-color-picker">
              <input
                type="color"
                value={appearance.primaryColor}
                onChange={handlePrimaryColor}
                className="pf-appearance-color-input"
              />
              <span className="pf-appearance-color-value">
                {appearance.primaryColor}
              </span>
            </div>
          </div>
        </div>

        {/* Pot gradient preview */}
        <div className="pf-pot-gradient-preview">
          <div
            className="pf-pot-gradient-preview__bar"
            style={{
              background: `linear-gradient(90deg, ${appearance.secondaryColor} 0%, ${appearance.midColor} 50%, ${appearance.primaryColor} 100%)`,
            }}
          />
          <span className="pf-pot-gradient-preview__label">Pot gradient: top → bottom</span>
        </div>
      </SectionGroup>

      <SectionGroup label="Display">
        <div className="pf-appearance-toggles">
          <Button
            variant={appearance.showWireframe ? 'primary' : 'ghost'}
            size="sm"
            onClick={toggleWireframe}
            iconLeft={<Grid3x3 size={14} />}
            className={appearance.showWireframe ? 'pf-toggle-active' : ''}
            title="Toggle wireframe overlay"
          >
            Wireframe
          </Button>

          <Button
            variant={appearance.showInner ? 'primary' : 'ghost'}
            size="sm"
            onClick={toggleInner}
            iconLeft={appearance.showInner ? <Eye size={14} /> : <EyeOff size={14} />}
            className={appearance.showInner ? 'pf-toggle-active' : ''}
            title="Toggle inner surface visibility"
          >
            Inner
          </Button>
        </div>
      </SectionGroup>

      <SectionGroup label="Lighting">
        <div className="pf-lighting-chips">
          {LIGHTING_PRESETS.map((preset) => (
            <LightingChip
              key={preset.id}
              presetId={preset.id}
              name={preset.name}
              isActive={appearance.lightingPreset === preset.id}
              onClick={() => handleLighting(preset.id)}
              ambient={preset.ambient}
              specular={preset.specular}
            />
          ))}
        </div>
      </SectionGroup>

      <SectionGroup label="Background">
        <div className="pf-gradient-chips">
          {BACKGROUND_GRADIENTS.map((gradient) => (
            <button
              key={gradient.id}
              type="button"
              className={`pf-gradient-chip ${currentGradientId === gradient.id ? 'pf-gradient-chip--active' : ''}`}
              onClick={() => handleBackground(gradient.id)}
              title={gradient.name}
              aria-label={gradient.name}
              aria-pressed={currentGradientId === gradient.id}
            >
              <span
                className="pf-gradient-chip__preview"
                style={{
                  background: `linear-gradient(135deg, ${gradient.colors[0]}, ${gradient.colors[1]})`,
                }}
              />
            </button>
          ))}
        </div>

        {/* Custom background color pickers */}
        <div className="pf-appearance-color-pickers pf-bg-color-pickers">
          <div className="pf-appearance-color-row">
            <label className="pf-appearance-color-label">Color 1 (Top)</label>
            <div className="pf-appearance-color-picker">
              <input
                type="color"
                value={appearance.gradient[1]} // Top
                onChange={handleBgColor1}
                className="pf-appearance-color-input"
              />
              <span className="pf-appearance-color-value">
                {appearance.gradient[1]}
              </span>
            </div>
          </div>
          <div className="pf-appearance-color-row">
            <label className="pf-appearance-color-label">Color 2 (Bottom)</label>
            <div className="pf-appearance-color-picker">
              <input
                type="color"
                value={appearance.gradient[0]} // Bottom
                onChange={handleBgColor2}
                className="pf-appearance-color-input"
              />
              <span className="pf-appearance-color-value">
                {appearance.gradient[0]}
              </span>
            </div>
          </div>
        </div>

        <div className="pf-control-row">
          <Slider
            label="Angle"
            value={appearance.gradientAngle ?? 0}
            min={0}
            max={360}
            step={1}
            onChange={handleAngle}
            unit="°"
          />
        </div>

        <div className="pf-current-gradient">
          <GradientPreview colors={appearance.gradient} angle={appearance.gradientAngle ?? 0} />
          <span className="pf-current-gradient__label">
            {BACKGROUND_GRADIENTS.find((g) => g.id === currentGradientId)?.name || 'Custom'}
          </span>
        </div>
      </SectionGroup>
    </Section>
  );
};
