# Generator Round 1 — Phase 3 Tab Components (ShapeTab, StyleTab, ExportTab)
Date: 2026-03-06

## Problem Statement

SidebarV2 Phase 2 shipped with placeholder `<div className="pf2-sidebar__placeholder">` blocks in each tab content area. Phase 3 replaces these with real, functional tab content: geometry controls, style/appearance controls, and export quality/format controls. Without these, the v2 UI is non-functional — a shell without its ceramic soul.

## Root Cause Analysis

The placeholders exist at [SidebarV2.tsx](potfoundry-web/src/ui/v2/layout/SidebarV2.tsx#L172-L196). Each Radix `Tabs.Content` contains a static placeholder div instead of real controls. The state infrastructure is already complete:
- Geometry slice: 13 params with `GEOMETRY_BOUNDS`, `setGeometryParam` action
- Style slice: `STYLE_SCHEMAS` (from registry), `setStyle`, `setStyleOpt` actions
- Appearance slice: `COLOR_SCHEMES` (10), `LIGHTING_PRESETS` (5), `BACKGROUND_GRADIENTS` (8), full action set
- Mesh slice: `QUALITY_PRESETS` (4 levels), `setMeshParam`, `setQualityPreset`, `estimateTriangles`

All Phase 1 controls (SliderV2, SectionV2, SelectV2, ButtonV2/IconButtonV2) are production-ready.

## Design Decisions

### Q1: Style selector options from STYLE_SCHEMAS
**Decision**: Map `Object.entries(STYLE_SCHEMAS)` to `SelectV2Option[]` at module scope (outside component). The key is the `StyleName` string, the schema has `.name` (display) and `.description`. This is a static array derived from a static registry — no reason to memo it.

```ts
const STYLE_OPTIONS: SelectV2Option[] = Object.entries(STYLE_SCHEMAS).map(
  ([key, schema]) => ({
    value: key,
    label: schema.name,
    description: schema.description,
  })
);
```

### Q2: Color swatches — use full COLOR_SCHEMES?
**Decision**: Yes, use all 10 `COLOR_SCHEMES`. They're already well-curated (Terracotta, Slate, Ceramic White, Ocean Blue, Forest Green, Sunset Coral, Lavender, Charcoal, Desert Sand, Rose Gold). A 2×5 swatch grid fits perfectly in the sidebar width. Custom color pickers (Top/Mid/Bottom) go below the swatches for fine-tuning.

### Q3: Export triangle estimates — computed or hardcoded?
**Decision**: Computed via `estimateTriangles()` from the store. The function already exists in the mesh slice. However, for the quality *cards*, we want to show estimates for each preset (not just current), so we'll call `estimateTriangleCount`-equivalent logic inline for the card labels. I propose a helper that creates a display estimate from the preset's `export_n_theta × export_n_z`:

```ts
function estimateExportTriangles(preset: MeshQuality): string {
  const count = preset.export_n_theta * preset.export_n_z * 4 + preset.export_n_theta * 6;
  if (count >= 1_000_000) return `~${(count / 1_000_000).toFixed(1)}M`;
  return `~${Math.round(count / 1000)}K`;
}
```

### Q4: Style switch stagger animation
**Decision**: CSS-only approach using `animation-delay` on each param control. When the style changes, the params re-render (new keys), so React mounts fresh DOM nodes — each gets the existing `pf2-tab-enter` keyframe with a stagger delay via inline `--stagger-index` custom property. No FLIP or layout animation library needed.

```css
.pf2-style-tab__param {
  animation: pf2-tab-enter var(--pf2-duration-fast) var(--pf2-ease-enter) both;
  animation-delay: calc(var(--stagger-index, 0) * var(--pf2-duration-stagger));
}
```

## Proposals

### Proposal 1: ShapeTab — Sectioned Geometry Controls (Conservative)

**Idea**: Group the 13 geometry params into 4 `SectionV2` blocks matching the spec: Size (3 params), Thickness (2), Features (2), Bell & Twist (6, collapsed). Phase 4 preset placeholder at top.

**Mechanism**:
- Each param is a `SliderV2` bound to `useAppStore(s => s.geometry)[key]` + `setGeometryParam(key, v)`
- Param metadata (label, unit, decimals) derived from `GEOMETRY_BOUNDS[key]` for min/max/step, with human labels from a static lookup table
- Bell & Twist section uses `defaultOpen={false}`
- `onValueCommit` wired for all sliders (persist to localStorage or just let Zustand handle it)

**Files affected**: New `src/ui/v2/tabs/ShapeTab.tsx`, `ShapeTab.css`

**Trade-offs**: 
- (+) Simple, uses existing components exactly as designed
- (+) Zero new abstractions
- (-) The param label/unit mapping is a manual lookup (but it's only 13 entries)

**Assumptions**:
1. `GEOMETRY_BOUNDS` keys match `GeometryParams` keys exactly (verified: yes, types.ts L63-75)
2. SliderV2's `description` prop renders a tooltip (verified: yes, it renders as a subtitle below the label)
3. All geometry values are numbers (verified: `GeometryParams` is all `number` fields)

---

### Proposal 2: StyleTab — Dynamic Schema-Driven Controls + Appearance (Moderate)

**Idea**: Three-part layout: (1) Style selector dropdown, (2) Dynamic params from schema, (3) Appearance section (colors, display, lighting, background).

**Mechanism**:

**Part 1 — Style Selector**:
- `SelectV2` with `STYLE_OPTIONS` array derived from `STYLE_SCHEMAS`
- `value={style.name}`, `onChange={name => setStyle(name as StyleName)}`
- When style changes, `setStyle` resets opts to defaults (already implemented in slice)

**Part 2 — Dynamic Params**:
- Read `getStyleSchema()` to get current schema
- Render `schema.params` as SliderV2 (for `float`/`int`) or toggle ButtonV2 (for `bool`)
- If `schema.advancedParams` exists, wrap in collapsed `SectionV2`
- Each param keyed by `${style.name}-${paramKey}` to force remount on style change → triggers stagger animation
- Stagger via `style={{ '--stagger-index': index } as React.CSSProperties}` on wrapper div

**Part 3 — Appearance**:
- **Color Schemes**: 10 swatches in a grid. Each is a `<button>` with 3-color gradient background. Active = gold border. Click → `setColorScheme(id)`.
- **Custom Colors**: 3 native `<input type="color">` for Top/Mid/Bottom. Label: "Top Color", "Mid Color", "Bottom Color". Each calls `setSecondaryColor`/`setMidColor`/`setPrimaryColor` (note: "Top" = secondary because gradient goes bottom→top).
- **Gradient Preview**: A thin bar showing `linear-gradient(to top, primary, mid, secondary)`.
- **Display Toggles**: Two ButtonV2 in a row — Wireframe / Inner Surface. Toggle state → gold variant when active.
- **Lighting**: 5 chip buttons in a horizontal row (studio, soft, dramatic, flat, glossy). Active = gold.
- **Background**: Swatch grid of `BACKGROUND_GRADIENTS` (8 items). Collapsed `SectionV2` for custom background color pickers + angle slider.

**Files affected**: New `src/ui/v2/tabs/StyleTab.tsx`, `StyleTab.css`

**Trade-offs**:
- (+) Fully data-driven — adding a new style to the registry auto-generates its UI
- (+) Rich appearance controls without new component abstractions
- (-) StyleTab is the largest component (~250 lines). Could split into sub-components but that adds Phase 1 scope creep
- (-) Color pickers use native `<input type="color">` which has inconsistent styling across browsers. Acceptable for v2 launch; custom picker is Phase 5 territory.

**Assumptions**:
1. `ParamSchema.type === 'bool'` params exist in the registry (need to verify — if none currently use bool, the code path is still correct but dormant)
2. `setColorScheme('custom')` is NOT called directly — the `setPrimaryColor/setMidColor/setSecondaryColor` actions internally set `colorScheme: 'custom'` (verified: yes, appearance.ts L350-370)
3. `STYLE_SCHEMAS` is stable at module load time (verified: it's derived from `STYLE_REGISTRY` which is a static const)
4. `getStyleSchema()` returns undefined-safe (verified: falls back to `HarmonicRipple`, style.ts L180)

---

### Proposal 3: ExportTab — Quality Cards + Format Selector (Moderate)

**Idea**: Three sections: (1) Quality profile cards (4-card grid), (2) Format selector, (3) Advanced settings (collapsed).

**Mechanism**:

**Part 1 — Quality Profiles**:
- 4 cards in a 2×2 grid: Draft / Standard / High / Ultra
- Each card shows: name, description blurb, estimated triangle count, export resolution
- Active card: gold border (`--pf2-accent`), others: subtle border
- Click → `setQualityPreset(level as QualityPreset)`
- Triangle estimates computed from `QUALITY_PRESETS[level]` using the formula

Card metadata:
```ts
const QUALITY_CARDS = [
  { key: 'draft', label: 'Draft', desc: 'Quick preview, lower fidelity', icon: '⚡' },
  { key: 'standard', label: 'Standard', desc: 'Balanced quality & speed', icon: '⬡' },
  { key: 'high', label: 'High', desc: 'Detailed features, longer export', icon: '◆' },
  { key: 'ultra', label: 'Ultra', desc: 'Maximum fidelity, large files', icon: '✦' },
] as const;
```

**Part 2 — Format Selector**:
- Two ButtonV2 in a row: "STL (Binary)" and "3MF"
- Active = primary variant, inactive = secondary
- For now, only STL is functional. 3MF shows as disabled with tooltip "Coming soon"
- State: local `useState<'stl' | '3mf'>('stl')` (format isn't in global state yet — this is purely cosmetic until the export pipeline supports 3MF)

**Part 3 — Advanced Settings** (collapsed SectionV2):
- `export_n_theta` slider: "Angular Resolution", min/max/step from `MESH_QUALITY_BOUNDS`
- `export_n_z` slider: "Vertical Resolution", min/max/step from `MESH_QUALITY_BOUNDS`
- `seamAngle` slider: "Seam Angle", unit="°"
- `optimize` toggle: ButtonV2 "Mesh Optimization"

**Files affected**: New `src/ui/v2/tabs/ExportTab.tsx`, `ExportTab.css`

**Trade-offs**:
- (+) Clean, focused UI. Advanced users can still tune resolution
- (+) Quality cards give users a mental model instead of raw numbers
- (-) Format selector is partially cosmetic (3MF not implemented)
- (-) Triangle estimates are approximations (but clearly labeled with `~`)

**Assumptions**:
1. Export format is NOT yet in global state — it'll need to be added in Phase 4 when actual export is wired. Using local state for now is the right call.
2. `MESH_QUALITY_BOUNDS` has entries for `export_n_theta`, `export_n_z`, `seamAngle` (verified: types.ts L197-204)
3. Changing quality preset should immediately update the sliders in Advanced (verified: `setQualityPreset` overwrites all mesh params, so selectors re-read correctly)
4. The "Export" action button lives in StatusFooter (already built) — ExportTab is settings only

---

### Proposal 4: SidebarV2 Integration (Conservative)

**Idea**: Import ShapeTab/StyleTab/ExportTab and replace the placeholder divs in SidebarV2.tsx.

**Mechanism**:
```tsx
import { ShapeTab } from '../tabs/ShapeTab';
import { StyleTab } from '../tabs/StyleTab';
import { ExportTab } from '../tabs/ExportTab';

// Replace each placeholder:
<Tabs.Content className="pf2-sidebar__tab-content" value="shape">
  <ShapeTab />
</Tabs.Content>
```

**Files affected**: `src/ui/v2/layout/SidebarV2.tsx` (modify imports + 3 JSX blocks)

---

## Recommended Approach

Implement all four proposals. They're independent, compositional, and each solves exactly one piece. Order of implementation:

1. **ShapeTab** (simplest, fewest state dependencies)
2. **ExportTab** (moderate, mostly static card layout)
3. **StyleTab** (most complex, dynamic schema rendering + appearance)
4. **SidebarV2 integration** (trivial wiring)

## File Deliverables

### 1. ShapeTab.tsx

```tsx
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
import { useAppStore, GEOMETRY_BOUNDS, type GeometryParams } from '../../../state';
import { Ruler, Box, CircleDot, Waves } from 'lucide-react';
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
  startIndex?: number;
}

const GeometrySliderGroup: React.FC<GeometrySliderGroupProps> = ({
  keys,
  geometry,
  onChange,
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
            min={bounds.min}
            max={bounds.max}
            step={bounds.step}
            defaultValue={geometry[key]}
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

  const handleChange = useCallback(
    (key: keyof GeometryParams, value: number) => {
      setGeometryParam(key, value);
    },
    [setGeometryParam]
  );

  return (
    <div className="pf2-shape-tab">
      {/* Phase 4: Preset gallery */}

      <SectionV2 title="Size" icon={<Ruler size={14} />} sectionIndex={0}>
        <GeometrySliderGroup
          keys={SIZE_PARAMS}
          geometry={geometry}
          onChange={handleChange}
        />
      </SectionV2>

      <SectionV2 title="Thickness" icon={<Box size={14} />} sectionIndex={1}>
        <GeometrySliderGroup
          keys={THICKNESS_PARAMS}
          geometry={geometry}
          onChange={handleChange}
          startIndex={3}
        />
      </SectionV2>

      <SectionV2 title="Features" icon={<CircleDot size={14} />} sectionIndex={2}>
        <GeometrySliderGroup
          keys={FEATURE_PARAMS}
          geometry={geometry}
          onChange={handleChange}
          startIndex={5}
        />
      </SectionV2>

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
            startIndex={7}
          />
        </div>
        <div className="pf2-shape-tab__subgroup">
          <span className="pf2-shape-tab__subgroup-label pf2-text-label">Twist</span>
          <GeometrySliderGroup
            keys={TWIST_PARAMS}
            geometry={geometry}
            onChange={handleChange}
            startIndex={10}
          />
        </div>
      </SectionV2>
    </div>
  );
};
```

### 2. ShapeTab.css

```css
/* ============================================================================
   ShapeTab — Geometry parameter controls
   ============================================================================ */

.pf2-shape-tab {
  display: flex;
  flex-direction: column;
  gap: var(--pf2-space-lg);
}

/* Individual parameter with stagger animation */
.pf2-shape-tab__param {
  animation: pf2-tab-enter var(--pf2-duration-fast) var(--pf2-ease-enter) both;
  animation-delay: calc(var(--stagger-index, 0) * var(--pf2-duration-stagger));
}

/* Bell & Twist sub-groups */
.pf2-shape-tab__subgroup {
  display: flex;
  flex-direction: column;
  gap: var(--pf2-space-sm);
}

.pf2-shape-tab__subgroup + .pf2-shape-tab__subgroup {
  margin-top: var(--pf2-space-md);
  padding-top: var(--pf2-space-md);
  border-top: 1px solid var(--pf2-border);
}

.pf2-shape-tab__subgroup-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--pf2-text-muted);
  margin-bottom: var(--pf2-space-xs);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .pf2-shape-tab__param {
    animation: none;
  }
}
```

### 3. StyleTab.tsx

```tsx
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
import clsx from 'clsx';
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
  index: number;
}

const StyleParamControl: React.FC<StyleParamControlProps> = ({
  paramKey,
  schema,
  value,
  onChange,
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
          onClick={() => onChange(paramKey, !value)}
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
        min={schema.min ?? 0}
        max={schema.max ?? 1}
        step={schema.step ?? 0.01}
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
  const basicParams = useMemo(() => Object.entries(schema.params), [schema]);
  const advancedParams = useMemo(
    () => (schema.advancedParams ? Object.entries(schema.advancedParams) : []),
    [schema]
  );

  // Handlers
  const handleStyleChange = useCallback(
    (value: string) => setStyle(value as StyleName),
    [setStyle]
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

        {/* Basic parameters — keyed by style name for remount stagger */}
        <div className="pf2-style-tab__params" key={styleName}>
          {basicParams.map(([key, paramSchema], i) => (
            <StyleParamControl
              key={`${styleName}-${key}`}
              paramKey={key}
              schema={paramSchema}
              value={styleOpts[key] ?? paramSchema.default}
              onChange={handleStyleOpt}
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
                index={i}
              />
            ))}
          </SectionV2>
        )}
      </SectionV2>

      {/* ================================================================
          Appearance — Colors
          ================================================================ */}
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
              onClick={() => setColorScheme(scheme.id)}
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
              onChange={(e) => setSecondaryColor(e.target.value)}
              aria-label="Top color"
            />
          </label>
          <label className="pf2-style-tab__color-picker">
            <span className="pf2-text-label">Mid</span>
            <input
              type="color"
              value={appearance.midColor}
              onChange={(e) => setMidColor(e.target.value)}
              aria-label="Mid color"
            />
          </label>
          <label className="pf2-style-tab__color-picker">
            <span className="pf2-text-label">Bottom</span>
            <input
              type="color"
              value={appearance.primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
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

      {/* ================================================================
          Display — Wireframe & Inner
          ================================================================ */}
      <SectionV2 title="Display" icon={<Eye size={14} />} sectionIndex={2}>
        <div className="pf2-style-tab__toggle-row">
          <ButtonV2
            variant={appearance.showWireframe ? 'primary' : 'secondary'}
            size="sm"
            onClick={toggleWireframe}
            aria-pressed={appearance.showWireframe}
          >
            Wireframe
          </ButtonV2>
          <ButtonV2
            variant={appearance.showInner ? 'primary' : 'secondary'}
            size="sm"
            onClick={toggleInner}
            aria-pressed={appearance.showInner}
          >
            Inner Surface
          </ButtonV2>
        </div>
      </SectionV2>

      {/* ================================================================
          Lighting
          ================================================================ */}
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
              onClick={() => setLightingPreset(preset.id)}
              role="radio"
              aria-checked={appearance.lightingPreset === preset.id}
              title={preset.description}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </SectionV2>

      {/* ================================================================
          Background
          ================================================================ */}
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
              onClick={() => setBackgroundGradient(bg.id)}
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
                onChange={handleBgColor1}
                aria-label="Background color 1"
              />
            </label>
            <label className="pf2-style-tab__color-picker">
              <span className="pf2-text-label">Color 2</span>
              <input
                type="color"
                value={appearance.gradient[1]}
                onChange={handleBgColor2}
                aria-label="Background color 2"
              />
            </label>
          </div>
          <SliderV2
            value={appearance.gradientAngle}
            onChange={(v) => setGradientAngle(v)}
            min={0}
            max={360}
            step={5}
            label="Angle"
            unit="°"
            decimals={0}
          />
        </SectionV2>
      </SectionV2>
    </div>
  );
};
```

### 4. StyleTab.css

```css
/* ============================================================================
   StyleTab — Style selection, parameters, and appearance
   ============================================================================ */

.pf2-style-tab {
  display: flex;
  flex-direction: column;
  gap: var(--pf2-space-lg);
}

/* ============================================================================
   Dynamic Style Parameters
   ============================================================================ */

.pf2-style-tab__params {
  display: flex;
  flex-direction: column;
  gap: var(--pf2-space-xs);
  margin-top: var(--pf2-space-md);
}

.pf2-style-tab__param {
  animation: pf2-tab-enter var(--pf2-duration-fast) var(--pf2-ease-enter) both;
  animation-delay: calc(var(--stagger-index, 0) * var(--pf2-duration-stagger));
}

.pf2-style-tab__advanced {
  margin-top: var(--pf2-space-sm);
}

/* ============================================================================
   Color Scheme Swatches
   ============================================================================ */

.pf2-style-tab__swatches {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--pf2-space-sm);
}

.pf2-style-tab__swatch {
  aspect-ratio: 1;
  border-radius: var(--pf2-radius-md);
  border: 2px solid transparent;
  cursor: pointer;
  transition:
    border-color var(--pf2-duration-micro) var(--pf2-ease-move),
    transform var(--pf2-duration-micro) var(--pf2-ease-spring);
  min-height: 36px;
}

.pf2-style-tab__swatch:hover {
  transform: scale(1.08);
  border-color: var(--pf2-border-active);
}

.pf2-style-tab__swatch--active {
  border-color: var(--pf2-accent);
  box-shadow: 0 0 0 1px var(--pf2-accent);
}

/* ============================================================================
   Custom Color Pickers
   ============================================================================ */

.pf2-style-tab__custom-colors {
  display: flex;
  gap: var(--pf2-space-md);
  margin-top: var(--pf2-space-md);
}

.pf2-style-tab__color-picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--pf2-space-xs);
  flex: 1;
  cursor: pointer;
}

.pf2-style-tab__color-picker input[type='color'] {
  width: 100%;
  height: 32px;
  border: 1px solid var(--pf2-border);
  border-radius: var(--pf2-radius-sm);
  background: transparent;
  cursor: pointer;
  padding: 2px;
}

.pf2-style-tab__color-picker input[type='color']::-webkit-color-swatch-wrapper {
  padding: 0;
}

.pf2-style-tab__color-picker input[type='color']::-webkit-color-swatch {
  border: none;
  border-radius: calc(var(--pf2-radius-sm) - 2px);
}

/* ============================================================================
   Gradient Preview
   ============================================================================ */

.pf2-style-tab__gradient-preview {
  height: 8px;
  border-radius: 4px;
  margin-top: var(--pf2-space-sm);
}

/* ============================================================================
   Toggle Row (Wireframe / Inner)
   ============================================================================ */

.pf2-style-tab__toggle-row {
  display: flex;
  gap: var(--pf2-space-sm);
}

.pf2-style-tab__toggle-row .pf2-button {
  flex: 1;
}

/* ============================================================================
   Lighting Chips
   ============================================================================ */

.pf2-style-tab__chip-row {
  display: flex;
  gap: var(--pf2-space-xs);
  flex-wrap: wrap;
}

.pf2-style-tab__chip {
  padding: var(--pf2-space-xs) var(--pf2-space-md);
  border-radius: 100px;
  font-family: var(--pf2-font-body);
  font-size: 12px;
  font-weight: 500;
  color: var(--pf2-text-secondary);
  background: var(--pf2-bg-elevated);
  border: 1px solid var(--pf2-border);
  cursor: pointer;
  transition:
    color var(--pf2-duration-micro) var(--pf2-ease-move),
    background var(--pf2-duration-micro) var(--pf2-ease-move),
    border-color var(--pf2-duration-micro) var(--pf2-ease-move);
  white-space: nowrap;
}

.pf2-style-tab__chip:hover {
  background: var(--pf2-bg-hover);
  color: var(--pf2-text-primary);
}

.pf2-style-tab__chip--active {
  background: var(--pf2-accent-subtle);
  color: var(--pf2-accent);
  border-color: var(--pf2-accent);
}

/* ============================================================================
   Background Swatches
   ============================================================================ */

.pf2-style-tab__bg-swatches {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--pf2-space-sm);
}

.pf2-style-tab__bg-swatch {
  aspect-ratio: 2 / 1;
  border-radius: var(--pf2-radius-sm);
  border: 2px solid transparent;
  cursor: pointer;
  transition:
    border-color var(--pf2-duration-micro) var(--pf2-ease-move),
    transform var(--pf2-duration-micro) var(--pf2-ease-spring);
  min-height: 28px;
}

.pf2-style-tab__bg-swatch:hover {
  transform: scale(1.05);
  border-color: var(--pf2-border-active);
}

.pf2-style-tab__bg-swatch--active {
  border-color: var(--pf2-accent);
  box-shadow: 0 0 0 1px var(--pf2-accent);
}

.pf2-style-tab__bg-custom {
  margin-top: var(--pf2-space-sm);
}

/* ============================================================================
   Reduced Motion
   ============================================================================ */

@media (prefers-reduced-motion: reduce) {
  .pf2-style-tab__param {
    animation: none;
  }

  .pf2-style-tab__swatch:hover,
  .pf2-style-tab__bg-swatch:hover {
    transform: none;
  }
}

/* ============================================================================
   High Contrast
   ============================================================================ */

@media (forced-colors: active) {
  .pf2-style-tab__swatch,
  .pf2-style-tab__bg-swatch {
    border: 2px solid ButtonText;
  }

  .pf2-style-tab__swatch--active,
  .pf2-style-tab__bg-swatch--active {
    border-color: Highlight;
  }

  .pf2-style-tab__chip {
    border: 1px solid ButtonText;
  }

  .pf2-style-tab__chip--active {
    border-color: Highlight;
    color: Highlight;
  }
}
```

### 5. ExportTab.tsx

```tsx
/**
 * ExportTab — Quality profiles, format selection, and advanced export settings.
 *
 * Three sections:
 * 1. Quality profile cards (Draft/Standard/High/Ultra)
 * 2. Format selector (STL/3MF)
 * 3. Advanced settings (collapsed) — resolution sliders, seam angle, optimization
 *
 * Note: The "Export" action button lives in StatusFooter, not here.
 *
 * @module ui/v2/tabs/ExportTab
 */

import React, { useState, useCallback, useMemo } from 'react';
import { SliderV2 } from '../controls/SliderV2';
import { SectionV2 } from '../controls/SectionV2';
import { ButtonV2 } from '../controls/ButtonV2';
import {
  useAppStore,
  QUALITY_PRESETS,
  type QualityPreset,
  MESH_QUALITY_BOUNDS,
  type MeshQuality,
} from '../../../state';
import { Settings, Zap, FileDown } from 'lucide-react';
import clsx from 'clsx';
import './ExportTab.css';

// ============================================================================
// Quality Card Metadata
// ============================================================================

interface QualityCardMeta {
  key: QualityPreset;
  label: string;
  description: string;
  icon: string;
}

const QUALITY_CARDS: QualityCardMeta[] = [
  { key: 'draft',    label: 'Draft',    description: 'Quick preview, lower fidelity', icon: '⚡' },
  { key: 'standard', label: 'Standard', description: 'Balanced quality & speed',      icon: '⬡' },
  { key: 'high',     label: 'High',     description: 'Detailed features, longer export', icon: '◆' },
  { key: 'ultra',    label: 'Ultra',    description: 'Maximum fidelity, large files',    icon: '✦' },
];

// ============================================================================
// Helpers
// ============================================================================

/**
 * Estimate approximate export triangle count for a quality preset.
 * Uses the same formula as the mesh slice: walls (outer+inner) + end caps.
 */
function formatTriangleEstimate(preset: MeshQuality): string {
  const { export_n_theta, export_n_z } = preset;
  const count = export_n_theta * export_n_z * 4 + export_n_theta * 6;
  if (count >= 1_000_000) return `~${(count / 1_000_000).toFixed(1)}M`;
  return `~${Math.round(count / 1000)}K`;
}

/**
 * Determine the active quality preset from current mesh settings.
 * Returns the preset key if settings match exactly, null otherwise (custom).
 */
function detectActivePreset(mesh: MeshQuality): QualityPreset | null {
  for (const [key, preset] of Object.entries(QUALITY_PRESETS)) {
    if (
      mesh.export_n_theta === preset.export_n_theta &&
      mesh.export_n_z === preset.export_n_z
    ) {
      return key as QualityPreset;
    }
  }
  return null;
}

// ============================================================================
// Component
// ============================================================================

export const ExportTab: React.FC = () => {
  const mesh = useAppStore((s) => s.mesh);
  const setMeshParam = useAppStore((s) => s.setMeshParam);
  const setQualityPreset = useAppStore((s) => s.setQualityPreset);

  // Format selector — local state until export pipeline supports 3MF
  const [format, setFormat] = useState<'stl' | '3mf'>('stl');

  // Detect which preset card should be active
  const activePreset = useMemo(() => detectActivePreset(mesh), [mesh]);

  // Handlers
  const handlePresetClick = useCallback(
    (key: QualityPreset) => setQualityPreset(key),
    [setQualityPreset]
  );

  return (
    <div className="pf2-export-tab">
      {/* ================================================================
          Quality Profiles
          ================================================================ */}
      <SectionV2 title="Quality" icon={<Zap size={14} />} sectionIndex={0}>
        <div className="pf2-export-tab__quality-grid" role="radiogroup" aria-label="Quality preset">
          {QUALITY_CARDS.map((card) => {
            const preset = QUALITY_PRESETS[card.key];
            const isActive = activePreset === card.key;
            return (
              <button
                key={card.key}
                className={clsx(
                  'pf2-export-tab__quality-card',
                  'pf2-focus-ring',
                  isActive && 'pf2-export-tab__quality-card--active'
                )}
                onClick={() => handlePresetClick(card.key)}
                role="radio"
                aria-checked={isActive}
                aria-label={`${card.label}: ${card.description}`}
              >
                <span className="pf2-export-tab__quality-icon">{card.icon}</span>
                <span className="pf2-export-tab__quality-label">{card.label}</span>
                <span className="pf2-export-tab__quality-desc pf2-text-body">
                  {card.description}
                </span>
                <span className="pf2-export-tab__quality-triangles pf2-text-mono">
                  {formatTriangleEstimate(preset)} triangles
                </span>
              </button>
            );
          })}
        </div>
      </SectionV2>

      {/* ================================================================
          Format Selector
          ================================================================ */}
      <SectionV2 title="Format" icon={<FileDown size={14} />} sectionIndex={1}>
        <div className="pf2-export-tab__format-row" role="radiogroup" aria-label="Export format">
          <ButtonV2
            variant={format === 'stl' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFormat('stl')}
            aria-pressed={format === 'stl'}
          >
            STL (Binary)
          </ButtonV2>
          <ButtonV2
            variant={format === '3mf' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFormat('3mf')}
            aria-pressed={format === '3mf'}
            disabled
            title="3MF export coming soon"
          >
            3MF
          </ButtonV2>
        </div>
      </SectionV2>

      {/* ================================================================
          Advanced Settings (collapsed)
          ================================================================ */}
      <SectionV2
        title="Advanced"
        icon={<Settings size={14} />}
        defaultOpen={false}
        sectionIndex={2}
      >
        <SliderV2
          value={mesh.export_n_theta}
          onChange={(v) => setMeshParam('export_n_theta', v)}
          min={MESH_QUALITY_BOUNDS.export_n_theta.min}
          max={MESH_QUALITY_BOUNDS.export_n_theta.max}
          step={MESH_QUALITY_BOUNDS.export_n_theta.step}
          label="Angular Resolution"
          description="Samples around the circumference for export"
          decimals={0}
        />
        <SliderV2
          value={mesh.export_n_z}
          onChange={(v) => setMeshParam('export_n_z', v)}
          min={MESH_QUALITY_BOUNDS.export_n_z.min}
          max={MESH_QUALITY_BOUNDS.export_n_z.max}
          step={MESH_QUALITY_BOUNDS.export_n_z.step}
          label="Vertical Resolution"
          description="Samples along the height for export"
          decimals={0}
        />
        <SliderV2
          value={mesh.seamAngle}
          onChange={(v) => setMeshParam('seamAngle', v)}
          min={MESH_QUALITY_BOUNDS.seamAngle.min}
          max={MESH_QUALITY_BOUNDS.seamAngle.max}
          step={MESH_QUALITY_BOUNDS.seamAngle.step}
          label="Seam Angle"
          unit="°"
          description="Width of the seam blending zone"
          decimals={0}
        />
        <div className="pf2-export-tab__optimize-row">
          <ButtonV2
            variant={mesh.optimize ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setMeshParam('optimize', !mesh.optimize)}
            aria-pressed={mesh.optimize}
          >
            Mesh Optimization
          </ButtonV2>
          <span className="pf2-text-body pf2-export-tab__optimize-hint">
            Merge coplanar triangles to reduce file size
          </span>
        </div>
      </SectionV2>
    </div>
  );
};
```

### 6. ExportTab.css

```css
/* ============================================================================
   ExportTab — Quality profiles, format, and advanced settings
   ============================================================================ */

.pf2-export-tab {
  display: flex;
  flex-direction: column;
  gap: var(--pf2-space-lg);
}

/* ============================================================================
   Quality Profile Cards
   ============================================================================ */

.pf2-export-tab__quality-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--pf2-space-sm);
}

.pf2-export-tab__quality-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--pf2-space-xs);
  padding: var(--pf2-space-md) var(--pf2-space-sm);
  background: var(--pf2-bg-elevated);
  border: 1px solid var(--pf2-border);
  border-radius: var(--pf2-radius-md);
  cursor: pointer;
  text-align: center;
  transition:
    border-color var(--pf2-duration-micro) var(--pf2-ease-move),
    background var(--pf2-duration-micro) var(--pf2-ease-move),
    transform var(--pf2-duration-micro) var(--pf2-ease-spring);
}

.pf2-export-tab__quality-card:hover {
  background: var(--pf2-bg-hover);
  border-color: var(--pf2-border-active);
  transform: translateY(-1px);
}

.pf2-export-tab__quality-card--active {
  border-color: var(--pf2-accent);
  background: var(--pf2-accent-subtle);
  box-shadow: 0 0 0 1px var(--pf2-accent);
}

.pf2-export-tab__quality-icon {
  font-size: 20px;
  line-height: 1;
}

.pf2-export-tab__quality-label {
  font-family: var(--pf2-font-body);
  font-size: 13px;
  font-weight: 600;
  color: var(--pf2-text-primary);
}

.pf2-export-tab__quality-desc {
  font-size: 11px;
  color: var(--pf2-text-secondary);
  line-height: 1.3;
  margin: 0;
}

.pf2-export-tab__quality-triangles {
  font-size: 10px;
  color: var(--pf2-text-muted);
  margin-top: var(--pf2-space-xs);
}

.pf2-export-tab__quality-card--active .pf2-export-tab__quality-label {
  color: var(--pf2-accent);
}

/* ============================================================================
   Format Selector
   ============================================================================ */

.pf2-export-tab__format-row {
  display: flex;
  gap: var(--pf2-space-sm);
}

.pf2-export-tab__format-row .pf2-button {
  flex: 1;
}

/* ============================================================================
   Advanced — Optimize Toggle
   ============================================================================ */

.pf2-export-tab__optimize-row {
  display: flex;
  align-items: center;
  gap: var(--pf2-space-md);
  margin-top: var(--pf2-space-sm);
}

.pf2-export-tab__optimize-hint {
  font-size: 12px;
  color: var(--pf2-text-muted);
  flex: 1;
}

/* ============================================================================
   Reduced Motion
   ============================================================================ */

@media (prefers-reduced-motion: reduce) {
  .pf2-export-tab__quality-card:hover {
    transform: none;
  }
}

/* ============================================================================
   High Contrast
   ============================================================================ */

@media (forced-colors: active) {
  .pf2-export-tab__quality-card {
    border: 2px solid ButtonText;
  }

  .pf2-export-tab__quality-card--active {
    border-color: Highlight;
  }
}
```

### 7. SidebarV2.tsx Modifications

**Change 1 — Add imports** (after existing imports, before constants):
```tsx
import { ShapeTab } from '../tabs/ShapeTab';
import { StyleTab } from '../tabs/StyleTab';
import { ExportTab } from '../tabs/ExportTab';
```

**Change 2 — Replace tab content** (replace lines 172-196):

Replace:
```tsx
<Tabs.Content className="pf2-sidebar__tab-content" value="shape">
  <div className="pf2-sidebar__placeholder">
    <h3 className="pf2-text-label">Shape Parameters</h3>
    <p className="pf2-text-body pf2-sidebar__placeholder-text">
      Dimensions, thickness, and features — coming in Phase 3.
    </p>
  </div>
</Tabs.Content>

<Tabs.Content className="pf2-sidebar__tab-content" value="style">
  <div className="pf2-sidebar__placeholder">
    <h3 className="pf2-text-label">Style Controls</h3>
    <p className="pf2-text-body pf2-sidebar__placeholder-text">
      Style selection, parameters, and appearance — coming in Phase 3.
    </p>
  </div>
</Tabs.Content>

<Tabs.Content className="pf2-sidebar__tab-content" value="export">
  <div className="pf2-sidebar__placeholder">
    <h3 className="pf2-text-label">Export Settings</h3>
    <p className="pf2-text-body pf2-sidebar__placeholder-text">
      Quality presets, format selection, and pipeline options — coming in Phase 3.
    </p>
  </div>
</Tabs.Content>
```

With:
```tsx
<Tabs.Content className="pf2-sidebar__tab-content" value="shape">
  <ShapeTab />
</Tabs.Content>

<Tabs.Content className="pf2-sidebar__tab-content" value="style">
  <StyleTab />
</Tabs.Content>

<Tabs.Content className="pf2-sidebar__tab-content" value="export">
  <ExportTab />
</Tabs.Content>
```

## Open Questions (For Verifier)

1. **`getStyleSchema()` is a non-reactive getter** — I call it inside the component and memoize on `styleName`. The Verifier should confirm that `useMemo(() => getStyleSchema(), [styleName, getStyleSchema])` will correctly recompute when style changes. Since `getStyleSchema` itself reads from `get()` (store snapshot) and `styleName` is derived from `s.style.name`, this *should* be correct — but it's a pattern worth scrutinizing because `getStyleSchema` is a stable reference.

2. **Export format as local state** — I chose `useState` for the STL/3MF toggle because there's no `exportFormat` in the Zustand store. The Verifier should confirm this is the right call for Phase 3 (Phase 4 adds real export integration and can promote this to global state then).

3. **SectionV2 `forceMount` on Collapsible.Content** — SectionV2 uses Radix `Collapsible` with `forceMount`. This means collapsed Bell & Twist sliders are rendered but hidden via CSS. For 6 extra sliders this is fine, but the Verifier should confirm there's no perf concern with _all_ style advanced params being force-mounted when collapsed.

4. **`detectActivePreset` matching** — I match only `export_n_theta` and `export_n_z` to detect the active quality preset. The Verifier may argue we should also match `optimize` and `seamAngle`. My reasoning: those are "modifier" settings that the user might tweak independently, and changing them shouldn't deselect the quality card. But this is debatable.

5. **Color picker label mapping** — "Top" maps to `secondaryColor` and "Bottom" maps to `primaryColor` because the gradient runs bottom→top. The Verifier should confirm this matches the WebGPU shader's gradient direction. The appearance slice comments say: `primaryColor` = "bottom of pot gradient", `secondaryColor` = "top of pot gradient" — so the mapping is correct.
