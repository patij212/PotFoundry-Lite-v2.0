/**
 * Style controls component.
 * 
 * Provides style selection dropdown and dynamic parameter controls
 * for the selected style. Includes collapsible Advanced section for
 * additional style-specific parameters.
 * 
 * @module ui/controls/StyleControls
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { Select, type SelectOption } from '../shared/Select';
import { Slider } from '../shared/Slider';
import { Section, SectionGroup } from '../shared/Section';
import {
  useStyle,
  useStyleActions,
  STYLE_SCHEMAS,
  type StyleName,
  type ParamSchema,
} from '../../state';
import './StyleControls.css';

// ============================================================================
// Style Options
// ============================================================================

const STYLE_OPTIONS: SelectOption[] = Object.entries(STYLE_SCHEMAS).map(
  ([key, schema]) => ({
    value: key,
    label: schema.name,
    description: schema.description,
  })
);

// ============================================================================
// Parameter Control
// ============================================================================

interface ParamControlProps {
  name: string;
  schema: ParamSchema;
  value: number | boolean;
  onChange: (name: string, value: number | boolean) => void;
}

/**
 * Renders a control for a single style parameter based on its schema.
 */
const ParamControl: React.FC<ParamControlProps> = ({
  name,
  schema,
  value,
  onChange,
}) => {
  const handleChange = useCallback(
    (newValue: number | boolean) => onChange(name, newValue),
    [name, onChange]
  );

  if (schema.type === 'bool') {
    // Boolean toggle would go here
    return null;
  }

  // Numeric slider
  return (
    <Slider
      label={schema.label}
      value={value as number}
      onChange={handleChange}
      min={schema.min ?? 0}
      max={schema.max ?? 100}
      step={schema.step ?? 1}
      unit={schema.unit}
      decimals={schema.type === 'int' ? 0 : undefined}
    />
  );
};

// ============================================================================
// Advanced Section Toggle
// ============================================================================

interface AdvancedSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const AdvancedSection: React.FC<AdvancedSectionProps> = ({
  isOpen,
  onToggle,
  children,
}) => {
  return (
    <div className="pf-advanced-section">
      <button
        className="pf-advanced-toggle"
        onClick={onToggle}
        type="button"
        aria-expanded={isOpen}
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Advanced</span>
      </button>
      {isOpen && <div className="pf-advanced-content">{children}</div>}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

/**
 * Controls for selecting and configuring decorative styles.
 */
export const StyleControls: React.FC = () => {
  const style = useStyle();
  const { setStyle, setStyleOpt, getStyleSchema } = useStyleActions();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  
  // Get current style schema
  const schema = useMemo(() => getStyleSchema(), [style.name, getStyleSchema]);
  
  // Handle style change
  const handleStyleChange = useCallback(
    (value: string) => {
      setStyle(value as StyleName);
      // Keep advanced section state when switching styles
    },
    [setStyle]
  );
  
  // Handle parameter change
  const handleParamChange = useCallback(
    (name: string, value: number | boolean) => {
      setStyleOpt(name, value);
    },
    [setStyleOpt]
  );
  
  // Toggle advanced section
  const handleAdvancedToggle = useCallback(() => {
    setAdvancedOpen((prev) => !prev);
  }, []);
  
  // Get parameter entries (basic)
  const paramEntries = useMemo(
    () => Object.entries(schema.params),
    [schema.params]
  );
  
  // Get advanced parameter entries
  const advancedParamEntries = useMemo(
    () => (schema.advancedParams ? Object.entries(schema.advancedParams) : []),
    [schema.advancedParams]
  );
  
  const hasParams = paramEntries.length > 0;
  const hasAdvancedParams = advancedParamEntries.length > 0;

  return (
    <Section title="Style" icon={<Sparkles size={16} />} defaultOpen>
      <Select
        label="Pattern"
        value={style.name}
        onChange={handleStyleChange}
        options={STYLE_OPTIONS}
      />
      
      {hasParams && (
        <SectionGroup label="Parameters">
          {paramEntries.map(([name, paramSchema]) => (
            <ParamControl
              key={name}
              name={name}
              schema={paramSchema}
              value={style.opts[name] ?? paramSchema.default}
              onChange={handleParamChange}
            />
          ))}
        </SectionGroup>
      )}
      
      {hasAdvancedParams && (
        <AdvancedSection isOpen={advancedOpen} onToggle={handleAdvancedToggle}>
          {advancedParamEntries.map(([name, paramSchema]) => (
            <ParamControl
              key={name}
              name={name}
              schema={paramSchema}
              value={style.opts[name] ?? paramSchema.default}
              onChange={handleParamChange}
            />
          ))}
        </AdvancedSection>
      )}
      
      {!hasParams && style.name === 'Plain' && (
        <div className="pf-style-empty">
          <p>Plain style has no configurable parameters.</p>
        </div>
      )}
    </Section>
  );
};
