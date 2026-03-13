# Executioner Feasibility Review — Phase 3 Tab Components
Date: 2026-03-06

## Verdict: FEASIBLE — Zero Blockers

All imports resolve. All types match. All actions exist on the store. The `tabs/` directory does not yet exist and will be created. The plan as specified — with the three Verifier amendments applied — can be implemented exactly as written.

---

## Import Path Verification

Tab components live at `src/ui/v2/tabs/`. Import path `../../../state` resolves to `src/state/index.ts`. Verified every symbol:

| Symbol | Export Source | Verified |
|--------|-------------|----------|
| `useAppStore` | `state/store.ts` → `state/index.ts` L29 | ✅ |
| `GEOMETRY_BOUNDS` | `state/types.ts` L64 → `state/index.ts` L57 | ✅ |
| `DEFAULT_GEOMETRY` | `state/types.ts` L47 → `state/index.ts` L57 | ✅ |
| `GeometryParams` type | `state/types.ts` L17 → `state/index.ts` L55 | ✅ |
| `STYLE_SCHEMAS` | `state/slices/style.ts` → `slices/index.ts` L11 → `state/index.ts` L93 | ✅ |
| `StyleName` type | `state/types.ts` L127 → `state/index.ts` L63 | ✅ |
| `ParamSchema` type | `state/types.ts` L88 → `state/index.ts` L62 | ✅ |
| `QUALITY_PRESETS` | `state/slices/mesh.ts` L72 → `slices/index.ts` L19 → `state/index.ts` L99 | ✅ |
| `QualityPreset` type | `state/slices/mesh.ts` L70 → `slices/index.ts` L20 → `state/index.ts` L100 | ✅ |
| `MESH_QUALITY_BOUNDS` | `state/types.ts` L197 → `state/index.ts` L60 | ✅ |
| `MeshQuality` type | `state/types.ts` L163 → `state/index.ts` L62 | ✅ |
| `DEFAULT_MESH_QUALITY` | `state/types.ts` L181 → `state/index.ts` L62 | ✅ |
| `COLOR_SCHEMES` | `state/slices/appearance.ts` L47 → `slices/index.ts` L27 → `state/index.ts` L102 | ✅ |
| `LIGHTING_PRESETS` | `state/slices/appearance.ts` L147 → `slices/index.ts` L28 → `state/index.ts` L103 | ✅ |
| `BACKGROUND_GRADIENTS` | `state/slices/appearance.ts` L208 → `slices/index.ts` L29 → `state/index.ts` L104 | ✅ |

### Control Components (relative `../controls/`)

| Component | File Exists | API Match |
|-----------|------------|-----------|
| `SliderV2` | `src/ui/v2/controls/SliderV2.tsx` | ✅ Props: value, onChange, min, max, step, defaultValue, label, description, unit, decimals |
| `SectionV2` | `src/ui/v2/controls/SectionV2.tsx` | ✅ Props: title, icon, defaultOpen, sectionIndex, className, children |
| `SelectV2` + `SelectV2Option` | `src/ui/v2/controls/SelectV2.tsx` | ✅ Option: value, label, description?. Props: value, onChange, options, label |
| `ButtonV2` / `IconButtonV2` | `src/ui/v2/controls/ButtonV2.tsx` | ✅ Props: variant, size, onClick, disabled, aria-pressed (via spread) |

### Third-party Dependencies

| Package | In `package.json` |
|---------|-------------------|
| `lucide-react` | ✅ |
| `clsx` | ✅ |
| `@radix-ui/react-tabs` | ✅ (used by SidebarV2) |
| `@radix-ui/react-slider` | ✅ (used by SliderV2) |
| `@radix-ui/react-collapsible` | ✅ (used by SectionV2) |

---

## Store Action Verification

Every action used by the tab components exists on the Zustand store (`store.ts`):

| Action | Slice | Signature | Used In |
|--------|-------|-----------|---------|
| `setGeometryParam` | geometry | `<K extends keyof GeometryParams>(key: K, value: GeometryParams[K])` | ShapeTab |
| `setStyle` | style | `(name: StyleName) => void` | StyleTab |
| `setStyleOpt` | style | `(key: string, value: number \| boolean) => void` | StyleTab |
| `getStyleSchema` | style | `() => StyleSchema` | StyleTab |
| `setColorScheme` | appearance | `(schemeId: string) => void` | StyleTab |
| `setPrimaryColor` | appearance | `(color: string) => void` | StyleTab |
| `setMidColor` | appearance | `(color: string) => void` | StyleTab |
| `setSecondaryColor` | appearance | `(color: string) => void` | StyleTab |
| `toggleWireframe` | appearance | `() => void` | StyleTab |
| `toggleInner` | appearance | `() => void` | StyleTab |
| `setLightingPreset` | appearance | `(presetId: string) => void` | StyleTab |
| `setBackgroundGradient` | appearance | `(gradientId: string) => void` | StyleTab |
| `setCustomGradient` | appearance | `(colors: [string, string]) => void` | StyleTab |
| `setGradientAngle` | appearance | `(angle: number) => void` | StyleTab |
| `setMeshParam` | mesh | `<K extends keyof MeshQuality>(key: K, value: MeshQuality[K])` | ExportTab |
| `setQualityPreset` | mesh | `(level: QualityPreset) => void` | ExportTab |

All confirmed on `store.ts` (lines 205-226).

---

## Verifier Amendments — Implementation Plan

### C1 [MANDATORY] — ShapeTab `defaultValue`

**Current (Generator):** `defaultValue={geometry[key]}` — passes live value, making snap-to-default and double-click-to-reset no-ops.

**Fix:** Import `DEFAULT_GEOMETRY` and use `defaultValue={DEFAULT_GEOMETRY[key]}`.

**Verified:** `DEFAULT_GEOMETRY` is exported from `state/index.ts` (line 57). The `SliderV2` snap-to-default logic is at `SliderV2.tsx` lines 81-88 and double-click reset at lines 105-110. Both depend on `defaultValue !== value` to be meaningful. Fix is correct and necessary.

### C2 [MANDATORY per plan] — StyleTab `defaultValue` on schema params

**Current (Generator):** No `defaultValue` passed to style param `SliderV2`.

**Fix:** Add `defaultValue={typeof schema.default === 'number' ? schema.default : undefined}` to `StyleParamControl`.

**Verified:** `ParamSchema.default` is typed `number | boolean` (types.ts L95). The conditional narrows correctly for SliderV2.

### C3 [MANDATORY per plan] — ExportTab `defaultValue` on mesh sliders

**Current (Generator):** No `defaultValue` on advanced settings sliders.

**Fix:** Import `DEFAULT_MESH_QUALITY` and pass e.g. `defaultValue={DEFAULT_MESH_QUALITY.export_n_theta}`.

**Verified:** `DEFAULT_MESH_QUALITY` is exported from `state/index.ts` (line 62 area).

---

## File Impact Analysis

### New Files (6)

| File | Est. Lines | Complexity |
|------|-----------|------------|
| `src/ui/v2/tabs/ShapeTab.tsx` | ~130 | Low — static metadata + SliderV2 binding |
| `src/ui/v2/tabs/ShapeTab.css` | ~50 | Low — flex layout + stagger animation |
| `src/ui/v2/tabs/StyleTab.tsx` | ~280 | Moderate — dynamic schema rendering + appearance controls |
| `src/ui/v2/tabs/StyleTab.css` | ~190 | Moderate — swatch grids, chips, color pickers, toggles |
| `src/ui/v2/tabs/ExportTab.tsx` | ~150 | Low-moderate — card grid + sliders |
| `src/ui/v2/tabs/ExportTab.css` | ~120 | Low — card layout, format row |

### Modified Files (1)

| File | Change | Lines Affected |
|------|--------|---------------|
| `src/ui/v2/layout/SidebarV2.tsx` | Add 3 imports + replace 3 placeholder blocks | ~5 insertions, ~20 deletions |

---

## Risk Assessment

### Low Risk
- **ShapeTab**: Simplest component. 13 static sliders bound to well-tested geometry slice. No dynamic rendering. No surprises.
- **ExportTab**: Mostly static card layout. Local state for format selector is isolated. `detectActivePreset` logic is trivial.
- **SidebarV2 wiring**: Trivial import + JSX swap.

### Medium Risk
- **StyleTab**: Most complex component (~280 lines). Dynamic schema rendering means the UI shape changes when style changes. Key resilience factors:
  - `getStyleSchema()` has a fallback (style.ts L183 — returns HarmonicRipple if name not found)
  - `styleOpts[key] ?? paramSchema.default` provides safe fallback for missing opt values
  - `key={styleName}` on params container forces remount on style change, ensuring clean stagger animation

### Identified Non-Issues (confirmed safe)
1. **`setMeshParam('optimize', !mesh.optimize)`**: Boolean passes through the `typeof value === 'number'` guard in mesh.ts and is set directly. `optimize` is not in `MESH_QUALITY_BOUNDS`. Correct behavior.
2. **`forceMount` on SectionV2**: ~12 hidden sliders across all tabs. Negligible DOM weight.
3. **`QUALITY_PRESETS` all have unique `(export_n_theta, export_n_z)` pairs**: draft(512,256), standard(1024,512), high(2048,1024), ultra(2048,1024). **NOTE**: `high` and `ultra` share the same export resolution (2048×1024). `detectActivePreset` iterates `Object.entries()` and returns the first match — which will be `high`, not `ultra`. This means clicking "Ultra" sets the preset correctly, but if the user manually types 2048×1024 in advanced, the card highlights "High" not "Ultra". This is a minor UX imperfection but not a blocker. The two differ only in `preview_n_theta`/`preview_n_z` and `optimize`, which `detectActivePreset` intentionally ignores per the Verifier's Q4 analysis.

---

## Implementation Sequence

1. **Create `src/ui/v2/tabs/` directory**
2. **ShapeTab.tsx + ShapeTab.css** — with C1 fix (`DEFAULT_GEOMETRY`)
3. **ExportTab.tsx + ExportTab.css** — with C3 fix (`DEFAULT_MESH_QUALITY`)
4. **StyleTab.tsx + StyleTab.css** — with C2 fix (schema `defaultValue`)
5. **SidebarV2.tsx** — add imports + replace placeholders
6. **Validate**: `npx tsc --noEmit` + dev server visual check

---

## Questions for Generator & Verifier

**Q1 — `high` vs `ultra` preset detection ambiguity**: Both presets share `export_n_theta=2048, export_n_z=1024`. The `detectActivePreset` function will always match `high` first (because `Object.entries` iteration order on `QUALITY_PRESETS` yields `draft→standard→high→ultra`). Should we:
- (a) Accept this as a known minor UX quirk (recommended — it only matters if users manually set resolution to exactly match a preset)
- (b) Expand `detectActivePreset` to also check `optimize` flag (would differentiate high vs ultra)
- (c) Update `QUALITY_PRESETS` to give ultra higher export resolution

This is not a blocker — proceeding with (a) unless directed otherwise.

---

## Sign-off

**Verdict: FEASIBLE.** Zero blockers. All imports resolve, all types match, all store actions exist. The three Verifier amendments (C1/C2/C3) are correct and will be applied during implementation. One minor UX note about high/ultra preset detection logged above. Ready to implement on command.
