/**
 * StyleTab — Style selector, dynamic parameters, and appearance controls.
 *
 * Three major sections:
 * 1. Style selector (SelectV2 dropdown) + schema-driven parameter sliders
 * 2. Appearance (color schemes, custom colors, gradient preview)
 * 3. Display (wireframe/inner toggles, lighting, background)
 *
 * @module ui/v2/tabs/StyleTab
 */

import React, { useCallback, useMemo } from 'react';
import { SliderV2 } from '../controls/SliderV2';
import { SectionV2 } from '../controls/SectionV2';
import { SelectV2, type SelectV2Option } from '../controls/SelectV2';
import { ButtonV2 } from '../controls/ButtonV2';
import {
  useAppStore,
  STYLE_SCHEMAS,
  COLOR_SCHEMES,
  LIGHTING_PRESETS,
  BACKGROUND_GRADIENTS,
  type StyleName,
  type ParamSchema,
} from '../../../state';
import {
  Palette,
  Eye,
  Sun,
  Monitor,
  Sparkles,
} from 'lucide-react';
import { useConfidence } from '../onboarding/useConfidence';
import clsx from 'clsx';
import { useStyleTransition } from '../hooks/useStyleTransition';
import './StyleTab.css';

// ============================================================================
// Static Data
// ============================================================================

const STYLE_OPTIONS: SelectV2Option[] = Object.entries(STYLE_SCHEMAS).map(
  ([key, schema]) => ({
    value: key,
    label: schema.name,
    description: schema.description,
  })
);

// ============================================================================
// Sub-components
// ============================================================================

interface StyleParamControlProps {
  paramKey: string;
  schema: ParamSchema;
  value: number | boolean;
  onChange: (key: string, value: number | boolean) => void;
  onInteractionStart?: () => void;
  onValueCommit?: () => void;
  index: number;
}

const StyleParamControl: React.FC<StyleParamControlProps> = ({
  paramKey,
  schema,
  value,
  onChange,
  onInteractionStart,
  onValueCommit,
  index,
}) => {
  if (schema.type === 'bool') {
    return (
      <div
        className="pf2-style-tab__param"
        style={{ '--stagger-index': index } as React.CSSProperties}
      >
        <ButtonV2
          variant={value ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => {
            onInteractionStart?.();
            onChange(paramKey, !value);
            onValueCommit?.();
          }}
          aria-pressed={!!value}
        >
          {schema.label}
        </ButtonV2>
      </div>
    );
  }

  return (
    <div
      className="pf2-style-tab__param"
      style={{ '--stagger-index': index } as React.CSSProperties}
    >
      <SliderV2
        value={typeof value === 'number' ? value : schema.default as number}
        onChange={(v) => onChange(paramKey, v)}
        onInteractionStart={onInteractionStart}
        onValueCommit={onValueCommit}
        min={schema.min ?? 0}
        max={schema.max ?? 1}
        step={schema.step ?? 0.01}
        defaultValue={typeof schema.default === 'number' ? schema.default : undefined}
        label={schema.label}
        description={schema.description}
        unit={schema.unit}
        decimals={
          schema.type === 'int'
            ? 0
            : schema.step
              ? Math.max(0, Math.ceil(-Math.log10(schema.step)))
              : 2
        }
      />
    </div>
  );
};

// ============================================================================
// Component
// ============================================================================

export const StyleTab: React.FC = () => {
  // Style state
  const styleName = useAppStore((s) => s.style.name);
  const styleOpts = useAppStore((s) => s.style.opts);
  const setStyle = useAppStore((s) => s.setStyle);
  const setStyleOpt = useAppStore((s) => s.setStyleOpt);
  const getStyleSchema = useAppStore((s) => s.getStyleSchema);
  const beginHistoryTransaction = useAppStore((s) => s.beginHistoryTransaction);
  const commitHistoryTransaction = useAppStore((s) => s.commitHistoryTransaction);

  // Appearance state
  const appearance = useAppStore((s) => s.appearance);
  const setColorScheme = useAppStore((s) => s.setColorScheme);
  const setPrimaryColor = useAppStore((s) => s.setPrimaryColor);
  const setMidColor = useAppStore((s) => s.setMidColor);
  const setSecondaryColor = useAppStore((s) => s.setSecondaryColor);
  const toggleWireframe = useAppStore((s) => s.toggleWireframe);
  const toggleInner = useAppStore((s) => s.toggleInner);
  const setLightingPreset = useAppStore((s) => s.setLightingPreset);
  const setBackgroundGradient = useAppStore((s) => s.setBackgroundGradient);
  const setCustomGradient = useAppStore((s) => s.setCustomGradient);
  const setGradientAngle = useAppStore((s) => s.setGradientAngle);

  // Derived
  const schema = useMemo(() => getStyleSchema(), [styleName, getStyleSchema]);
  const advancedParams = useMemo(
    () => (schema.advancedParams ? Object.entries(schema.advancedParams) : []),
    [schema]
  );

  const { isVisible, unlock } = useConfidence();
  const { phase, displayStyle, onStyleChanged } = useStyleTransition(styleName);

  const runDiscreteHistoryUpdate = useCallback(
    (update: () => void) => {
      beginHistoryTransaction();
      update();
      commitHistoryTransaction();
    },
    [beginHistoryTransaction, commitHistoryTransaction]
  );

  // Handlers
  const handleStyleChange = useCallback(
    (value: string) => {
      runDiscreteHistoryUpdate(() => {
        setStyle(value as StyleName);
        unlock('style-change');
        onStyleChanged(value);
      });
    },
    [runDiscreteHistoryUpdate, setStyle, unlock, onStyleChanged]
  );
  const displaySchema = useMemo(
    () => STYLE_SCHEMAS[displayStyle as StyleName] ?? schema,
    [displayStyle, schema]
  );
  const displayBasicParams = useMemo(
    () => Object.entries(displaySchema.params),
    [displaySchema]
  );

  const handleStyleOpt = useCallback(
    (key: string, value: number | boolean) => setStyleOpt(key, value),
    [setStyleOpt]
  );

  const handleBgColor1 = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCustomGradient([e.target.value, appearance.gradient[1]]);
    },
    [setCustomGradient, appearance.gradient]
  );

  const handleBgColor2 = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCustomGradient([appearance.gradient[0], e.target.value]);
    },
    [setCustomGradient, appearance.gradient]
  );

  return (
    <div className="pf2-style-tab">
      {/* ================================================================
          Style Selection & Parameters
          ================================================================ */}
      <SectionV2 title="Style" icon={<Sparkles size={14} />} sectionIndex={0}>
        <SelectV2
          value={styleName}
          onChange={handleStyleChange}
          options={STYLE_OPTIONS}
          label="Pattern"
        />

        {/* Basic parameters — animated on style switch */}
        <div
          className={clsx('pf2-style-tab__params', {
            'pf2-style-tab__params--exiting': phase === 'exiting',
            'pf2-style-tab__params--pausing': phase === 'pausing',
            'pf2-style-tab__params--entering': phase === 'entering',
          })}
          style={{ '--pf2-param-count': displayBasicParams.length } as React.CSSProperties}
        >
          {displayBasicParams.map(([key, paramSchema], i) => (
            <StyleParamControl
              key={`${displayStyle}-${key}`}
              paramKey={key}
              schema={paramSchema}
              value={styleOpts[key] ?? paramSchema.default}
              onChange={handleStyleOpt}
              onInteractionStart={beginHistoryTransaction}
              onValueCommit={commitHistoryTransaction}
              index={i}
            />
          ))}
        </div>

        {/* Advanced parameters */}
        {advancedParams.length > 0 && (
          <SectionV2
            title="Advanced Parameters"
            defaultOpen={false}
            className="pf2-style-tab__advanced"
          >
            {advancedParams.map(([key, paramSchema], i) => (
              <StyleParamControl
                key={`${styleName}-adv-${key}`}
                paramKey={key}
                schema={paramSchema}
                value={styleOpts[key] ?? paramSchema.default}
                onChange={handleStyleOpt}
                onInteractionStart={beginHistoryTransaction}
                onValueCommit={commitHistoryTransaction}
                index={i}
              />
            ))}
          </SectionV2>
        )}
      </SectionV2>

      {/* ================================================================
          Appearance — Colors
          ================================================================ */}
      {isVisible('style:colors') && (
      <SectionV2 title="Colors" icon={<Palette size={14} />} sectionIndex={1}>
        {/* Color scheme swatches */}
        <div className="pf2-style-tab__swatches" role="radiogroup" aria-label="Color scheme">
          {COLOR_SCHEMES.map((scheme) => (
            <button
              key={scheme.id}
              className={clsx(
                'pf2-style-tab__swatch',
                'pf2-focus-ring',
                appearance.colorScheme === scheme.id && 'pf2-style-tab__swatch--active'
              )}
              onClick={() => runDiscreteHistoryUpdate(() => setColorScheme(scheme.id))}
              role="radio"
              aria-checked={appearance.colorScheme === scheme.id}
              aria-label={scheme.name}
              title={scheme.description}
              style={{
                background: `linear-gradient(135deg, ${scheme.primary}, ${scheme.mid}, ${scheme.secondary})`,
              }}
            />
          ))}
        </div>

        {/* Custom color pickers */}
        <div className="pf2-style-tab__custom-colors">
          <label className="pf2-style-tab__color-picker">
            <span className="pf2-text-label">Top</span>
            <input
              type="color"
              value={appearance.secondaryColor}
              onFocus={beginHistoryTransaction}
              onChange={(e) => setSecondaryColor(e.target.value)}
              onBlur={commitHistoryTransaction}
              aria-label="Top color"
            />
          </label>
          <label className="pf2-style-tab__color-picker">
            <span className="pf2-text-label">Mid</span>
            <input
              type="color"
              value={appearance.midColor}
              onFocus={beginHistoryTransaction}
              onChange={(e) => setMidColor(e.target.value)}
              onBlur={commitHistoryTransaction}
              aria-label="Mid color"
            />
          </label>
          <label className="pf2-style-tab__color-picker">
            <span className="pf2-text-label">Bottom</span>
            <input
              type="color"
              value={appearance.primaryColor}
              onFocus={beginHistoryTransaction}
              onChange={(e) => setPrimaryColor(e.target.value)}
              onBlur={commitHistoryTransaction}
              aria-label="Bottom color"
            />
          </label>
        </div>

        {/* Gradient preview bar */}
        <div
          className="pf2-style-tab__gradient-preview"
          style={{
            background: `linear-gradient(to right, ${appearance.primaryColor}, ${appearance.midColor}, ${appearance.secondaryColor})`,
          }}
          aria-label="Color gradient preview"
          role="img"
        />
      </SectionV2>
      )}

      {/* ================================================================
          Display — Wireframe & Inner
          ================================================================ */}
      {isVisible('style:display') && (
      <SectionV2 title="Display" icon={<Eye size={14} />} sectionIndex={2}>
        <div className="pf2-style-tab__toggle-row">
          <ButtonV2
            variant={appearance.showWireframe ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => runDiscreteHistoryUpdate(toggleWireframe)}
            aria-pressed={appearance.showWireframe}
          >
            Wireframe
          </ButtonV2>
          <ButtonV2
            variant={appearance.showInner ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => runDiscreteHistoryUpdate(toggleInner)}
            aria-pressed={appearance.showInner}
          >
            Inner Surface
          </ButtonV2>
        </div>
      </SectionV2>
      )}

      {/* ================================================================
          Lighting
          ================================================================ */}
      {isVisible('style:lighting') && (
      <SectionV2 title="Lighting" icon={<Sun size={14} />} sectionIndex={3}>
        <div className="pf2-style-tab__chip-row" role="radiogroup" aria-label="Lighting preset">
          {LIGHTING_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className={clsx(
                'pf2-style-tab__chip',
                'pf2-focus-ring',
                appearance.lightingPreset === preset.id && 'pf2-style-tab__chip--active'
              )}
              onClick={() => runDiscreteHistoryUpdate(() => setLightingPreset(preset.id))}
              role="radio"
              aria-checked={appearance.lightingPreset === preset.id}
              title={preset.description}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </SectionV2>
      )}

      {/* ================================================================
          Background
          ================================================================ */}
      {isVisible('style:background') && (
      <SectionV2 title="Background" icon={<Monitor size={14} />} sectionIndex={4}>
        {/* Background gradient swatches */}
        <div className="pf2-style-tab__bg-swatches" role="radiogroup" aria-label="Background gradient">
          {BACKGROUND_GRADIENTS.map((bg) => (
            <button
              key={bg.id}
              className={clsx(
                'pf2-style-tab__bg-swatch',
                'pf2-focus-ring',
                appearance.gradient[0] === bg.colors[0] &&
                  appearance.gradient[1] === bg.colors[1] &&
                  'pf2-style-tab__bg-swatch--active'
              )}
              onClick={() => runDiscreteHistoryUpdate(() => setBackgroundGradient(bg.id))}
              role="radio"
              aria-checked={
                appearance.gradient[0] === bg.colors[0] &&
                appearance.gradient[1] === bg.colors[1]
              }
              aria-label={bg.name}
              title={bg.name}
              style={{
                background: `linear-gradient(135deg, ${bg.colors[0]}, ${bg.colors[1]})`,
              }}
            />
          ))}
        </div>

        {/* Custom background colors (collapsed) */}
        <SectionV2
          title="Custom Background"
          defaultOpen={false}
          className="pf2-style-tab__bg-custom"
        >
          <div className="pf2-style-tab__custom-colors">
            <label className="pf2-style-tab__color-picker">
              <span className="pf2-text-label">Color 1</span>
              <input
                type="color"
                value={appearance.gradient[0]}
                onFocus={beginHistoryTransaction}
                onChange={handleBgColor1}
                onBlur={commitHistoryTransaction}
                aria-label="Background color 1"
              />
            </label>
            <label className="pf2-style-tab__color-picker">
              <span className="pf2-text-label">Color 2</span>
              <input
                type="color"
                value={appearance.gradient[1]}
                onFocus={beginHistoryTransaction}
                onChange={handleBgColor2}
                onBlur={commitHistoryTransaction}
                aria-label="Background color 2"
              />
            </label>
          </div>
          <SliderV2
            value={appearance.gradientAngle}
            onChange={(v) => setGradientAngle(v)}
            onInteractionStart={beginHistoryTransaction}
            onValueCommit={commitHistoryTransaction}
            min={0}
            max={360}
            step={5}
            defaultValue={0}
            label="Angle"
            unit="°"
            decimals={0}
          />
        </SectionV2>
      </SectionV2>
      )}
    </div>
  );
};
