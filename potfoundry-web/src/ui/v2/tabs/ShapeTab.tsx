/**
 * ShapeTab — Geometry parameter controls for the Shape tab.
 *
 * Organized into 4 collapsible sections: Size, Thickness, Features, Bell & Twist.
 * All sliders are bound to the Zustand geometry slice via individual selectors.
 *
 * @module ui/v2/tabs/ShapeTab
 */

import React, { useCallback } from 'react';
import { SliderV2 } from '../controls/SliderV2';
import { SectionV2 } from '../controls/SectionV2';
import {
  useAppStore,
  GEOMETRY_BOUNDS,
  DEFAULT_GEOMETRY,
  type GeometryParams,
} from '../../../state';
import { useConfidence } from '../onboarding/useConfidence';
import { Ruler, Box, CircleDot, Waves } from 'lucide-react';
import { PresetStrip } from './PresetStrip';
import './ShapeTab.css';

// ============================================================================
// Parameter Metadata
// ============================================================================

interface ParamMeta {
  label: string;
  unit?: string;
  decimals?: number;
  description?: string;
}

const PARAM_META: Record<keyof GeometryParams, ParamMeta> = {
  H:          { label: 'Height',           unit: 'mm', decimals: 0, description: 'Total pot height from base to rim' },
  top_od:     { label: 'Top Diameter',     unit: 'mm', decimals: 0, description: 'Outer diameter at the rim' },
  bottom_od:  { label: 'Bottom Diameter',  unit: 'mm', decimals: 0, description: 'Outer diameter at the base' },
  t_wall:     { label: 'Wall Thickness',   unit: 'mm', decimals: 1, description: 'Thickness of the pot wall' },
  t_bottom:   { label: 'Bottom Thickness', unit: 'mm', decimals: 1, description: 'Thickness of the pot base' },
  r_drain:    { label: 'Drain Hole',       unit: 'mm', decimals: 1, description: 'Radius of the drainage hole (0 = none)' },
  expn:       { label: 'Flare',            decimals: 2, description: 'Profile curve exponent (1 = straight, >1 = concave, <1 = convex)' },
  bellAmp:    { label: 'Bell Amplitude',   decimals: 2, description: 'Bulge intensity — positive outward, negative inward' },
  bellCenter: { label: 'Bell Center',      decimals: 2, description: 'Vertical position of the bulge (0=base, 1=rim)' },
  bellWidth:  { label: 'Bell Width',       decimals: 2, description: 'Width of the bulge band (smaller = narrower)' },
  spinTurns:  { label: 'Spin Turns',       decimals: 2, description: 'Number of twist rotations base to rim' },
  spinPhase:  { label: 'Spin Phase',       unit: '°',  decimals: 0, description: 'Starting angle offset for the twist' },
  spinCurve:  { label: 'Spin Curve',       decimals: 2, description: 'Twist distribution (1=linear, <1=front-loaded, >1=back-loaded)' },
};

// ============================================================================
// Grouped parameter keys
// ============================================================================

const SIZE_PARAMS: (keyof GeometryParams)[] = ['H', 'top_od', 'bottom_od'];
const THICKNESS_PARAMS: (keyof GeometryParams)[] = ['t_wall', 't_bottom'];
const FEATURE_PARAMS: (keyof GeometryParams)[] = ['r_drain', 'expn'];
const BELL_PARAMS: (keyof GeometryParams)[] = ['bellAmp', 'bellCenter', 'bellWidth'];
const TWIST_PARAMS: (keyof GeometryParams)[] = ['spinTurns', 'spinPhase', 'spinCurve'];

// ============================================================================
// Helper: Render a group of geometry sliders
// ============================================================================

interface GeometrySliderGroupProps {
  keys: (keyof GeometryParams)[];
  geometry: GeometryParams;
  onChange: (key: keyof GeometryParams, value: number) => void;
  onInteractionStart: () => void;
  onValueCommit: () => void;
  startIndex?: number;
}

const GeometrySliderGroup: React.FC<GeometrySliderGroupProps> = ({
  keys,
  geometry,
  onChange,
  onInteractionStart,
  onValueCommit,
  startIndex = 0,
}) => (
  <>
    {keys.map((key, i) => {
      const meta = PARAM_META[key];
      const bounds = GEOMETRY_BOUNDS[key];
      return (
        <div
          key={key}
          className="pf2-shape-tab__param"
          style={{ '--stagger-index': startIndex + i } as React.CSSProperties}
        >
          <SliderV2
            value={geometry[key]}
            onChange={(v) => onChange(key, v)}
            onInteractionStart={onInteractionStart}
            onValueCommit={onValueCommit}
            min={bounds.min}
            max={bounds.max}
            step={bounds.step}
            defaultValue={DEFAULT_GEOMETRY[key]}
            label={meta.label}
            description={meta.description}
            unit={meta.unit}
            decimals={meta.decimals}
          />
        </div>
      );
    })}
  </>
);

// ============================================================================
// Component
// ============================================================================

export const ShapeTab: React.FC = () => {
  const geometry = useAppStore((s) => s.geometry);
  const setGeometryParam = useAppStore((s) => s.setGeometryParam);
  const beginHistoryTransaction = useAppStore((s) => s.beginHistoryTransaction);
  const commitHistoryTransaction = useAppStore((s) => s.commitHistoryTransaction);
  const { isVisible, unlock } = useConfidence();

  const handleChange = useCallback(
    (key: keyof GeometryParams, value: number) => {
      setGeometryParam(key, value);
      unlock('dimension-change');
    },
    [setGeometryParam, unlock]
  );

  return (
    <div className="pf2-shape-tab">
      <PresetStrip />

      <SectionV2 title="Size" icon={<Ruler size={14} />} sectionIndex={0}>
        <GeometrySliderGroup
          keys={SIZE_PARAMS}
          geometry={geometry}
          onChange={handleChange}
          onInteractionStart={beginHistoryTransaction}
          onValueCommit={commitHistoryTransaction}
        />
      </SectionV2>

      {isVisible('shape:thickness') && (
        <SectionV2 title="Thickness" icon={<Box size={14} />} sectionIndex={1}>
          <GeometrySliderGroup
            keys={THICKNESS_PARAMS}
            geometry={geometry}
            onChange={handleChange}
            onInteractionStart={beginHistoryTransaction}
            onValueCommit={commitHistoryTransaction}
            startIndex={3}
          />
        </SectionV2>
      )}

      {isVisible('shape:features') && (
        <SectionV2 title="Features" icon={<CircleDot size={14} />} sectionIndex={2}>
          <GeometrySliderGroup
            keys={FEATURE_PARAMS}
            geometry={geometry}
            onChange={handleChange}
            onInteractionStart={beginHistoryTransaction}
            onValueCommit={commitHistoryTransaction}
            startIndex={5}
          />
        </SectionV2>
      )}

      {isVisible('shape:bell-twist') && (
        <SectionV2
          title="Bell & Twist"
          icon={<Waves size={14} />}
          defaultOpen={false}
          sectionIndex={3}
        >
          <div className="pf2-shape-tab__subgroup">
            <span className="pf2-shape-tab__subgroup-label pf2-text-label">Bell</span>
            <GeometrySliderGroup
              keys={BELL_PARAMS}
              geometry={geometry}
              onChange={handleChange}
              onInteractionStart={beginHistoryTransaction}
              onValueCommit={commitHistoryTransaction}
              startIndex={7}
            />
          </div>
          <div className="pf2-shape-tab__subgroup">
            <span className="pf2-shape-tab__subgroup-label pf2-text-label">Twist</span>
            <GeometrySliderGroup
              keys={TWIST_PARAMS}
              geometry={geometry}
              onChange={handleChange}
              onInteractionStart={beginHistoryTransaction}
              onValueCommit={commitHistoryTransaction}
              startIndex={10}
            />
          </div>
        </SectionV2>
      )}
    </div>
  );
};
