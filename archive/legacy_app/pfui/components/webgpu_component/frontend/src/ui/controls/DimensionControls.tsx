/**
 * Dimension controls component.
 * 
 * Provides sliders for all geometric parameters (height, diameters,
 * wall thickness, etc.).
 * 
 * @module ui/controls/DimensionControls
 */

import React, { useCallback } from 'react';
import { Ruler, Circle, Square } from 'lucide-react';
import { Slider } from '../shared/Slider';
import { Section, SectionGroup } from '../shared/Section';
import { useGeometry, useGeometryActions, GEOMETRY_BOUNDS } from '../../state';
import './DimensionControls.css';

// ============================================================================
// Component
// ============================================================================

/**
 * Controls for pot dimensions.
 * 
 * Includes:
 * - Height
 * - Top diameter
 * - Bottom diameter
 * - Wall thickness
 * - Bottom thickness
 * - Drain hole radius
 * - Flare exponent
 */
export const DimensionControls: React.FC = () => {
  const geometry = useGeometry();
  const { setGeometryParam } = useGeometryActions();
  
  // Create memoized handlers to prevent re-renders
  const handleH = useCallback(
    (value: number) => setGeometryParam('H', value),
    [setGeometryParam]
  );
  
  const handleTopOD = useCallback(
    (value: number) => setGeometryParam('top_od', value),
    [setGeometryParam]
  );
  
  const handleBottomOD = useCallback(
    (value: number) => setGeometryParam('bottom_od', value),
    [setGeometryParam]
  );
  
  const handleTWall = useCallback(
    (value: number) => setGeometryParam('t_wall', value),
    [setGeometryParam]
  );
  
  const handleTBottom = useCallback(
    (value: number) => setGeometryParam('t_bottom', value),
    [setGeometryParam]
  );
  
  const handleRDrain = useCallback(
    (value: number) => setGeometryParam('r_drain', value),
    [setGeometryParam]
  );
  
  const handleExpn = useCallback(
    (value: number) => setGeometryParam('expn', value),
    [setGeometryParam]
  );

  return (
    <Section title="Dimensions" icon={<Ruler size={16} />} defaultOpen>
      <SectionGroup label="Size">
        <Slider
          label="Height"
          value={geometry.H}
          onChange={handleH}
          min={GEOMETRY_BOUNDS.H.min}
          max={GEOMETRY_BOUNDS.H.max}
          step={GEOMETRY_BOUNDS.H.step}
          unit="mm"
        />
        
        <div className="pf-dimension-row">
          <Slider
            label="Top ⌀"
            value={geometry.top_od}
            onChange={handleTopOD}
            min={GEOMETRY_BOUNDS.top_od.min}
            max={GEOMETRY_BOUNDS.top_od.max}
            step={GEOMETRY_BOUNDS.top_od.step}
            unit="mm"
          />
          
          <Slider
            label="Bottom ⌀"
            value={geometry.bottom_od}
            onChange={handleBottomOD}
            min={GEOMETRY_BOUNDS.bottom_od.min}
            max={GEOMETRY_BOUNDS.bottom_od.max}
            step={GEOMETRY_BOUNDS.bottom_od.step}
            unit="mm"
          />
        </div>
      </SectionGroup>
      
      <SectionGroup label="Thickness">
        <div className="pf-dimension-row">
          <Slider
            label="Wall"
            value={geometry.t_wall}
            onChange={handleTWall}
            min={GEOMETRY_BOUNDS.t_wall.min}
            max={GEOMETRY_BOUNDS.t_wall.max}
            step={GEOMETRY_BOUNDS.t_wall.step}
            unit="mm"
            decimals={1}
          />
          
          <Slider
            label="Bottom"
            value={geometry.t_bottom}
            onChange={handleTBottom}
            min={GEOMETRY_BOUNDS.t_bottom.min}
            max={GEOMETRY_BOUNDS.t_bottom.max}
            step={GEOMETRY_BOUNDS.t_bottom.step}
            unit="mm"
            decimals={1}
          />
        </div>
      </SectionGroup>
      
      <SectionGroup label="Features">
        <Slider
          label="Drain Hole"
          value={geometry.r_drain}
          onChange={handleRDrain}
          min={GEOMETRY_BOUNDS.r_drain.min}
          max={GEOMETRY_BOUNDS.r_drain.max}
          step={GEOMETRY_BOUNDS.r_drain.step}
          unit="mm"
          decimals={1}
        />
        
        <Slider
          label="Flare"
          value={geometry.expn}
          onChange={handleExpn}
          min={GEOMETRY_BOUNDS.expn.min}
          max={GEOMETRY_BOUNDS.expn.max}
          step={GEOMETRY_BOUNDS.expn.step}
          decimals={2}
        />
      </SectionGroup>
    </Section>
  );
};
