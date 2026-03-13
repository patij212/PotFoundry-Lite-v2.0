# Verifier Round 1 — Critique of Phase 3 Tab Components
Date: 2026-03-06

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's Phase 3 proposal is well-structured, comprehensively documented, and demonstrates thorough understanding of the state architecture. All imports resolve. All CSS tokens exist. Type signatures match. Accessibility patterns are correct. However, there is **one critical bug** that must be fixed before implementation, plus several warnings worth addressing.

---

## Critique

### C1 [CRITICAL]: `defaultValue` in ShapeTab passes current value, not schema default

**Generator's claim**: ShapeTab passes `defaultValue={geometry[key]}` to each SliderV2.

**Actual behavior**: SliderV2's `defaultValue` prop serves two purposes:
1. **Snap-to-default**: When the user drags near `defaultValue`, the slider snaps to it ([SliderV2.tsx](potfoundry-web/src/ui/v2/controls/SliderV2.tsx#L81-L84))
2. **Double-click reset**: Double-clicking the slider resets to `defaultValue` ([SliderV2.tsx](potfoundry-web/src/ui/v2/controls/SliderV2.tsx#L105-L107))

By passing `geometry[key]` (the *current* live value), `defaultValue` will always equal `value`. This makes snap-to-default a no-op (it's snapping to itself) and double-click-to-reset pointless (it resets to the current value).

**Counterexample**: User changes Height from 120 to 200. `defaultValue` is now 200. Double-click fires `onChange(200)` — nothing happens. The user cannot double-click to reset to the original 120mm default.

**Required fix**: Import `DEFAULT_GEOMETRY` and use `defaultValue={DEFAULT_GEOMETRY[key]}`:

```tsx
// In ShapeTab.tsx imports:
import { useAppStore, GEOMETRY_BOUNDS, DEFAULT_GEOMETRY, type GeometryParams } from '../../../state';

// In GeometrySliderGroup:
<SliderV2
  value={geometry[key]}
  defaultValue={DEFAULT_GEOMETRY[key]}  // ← schema default, not current value
  ...
/>
```

`DEFAULT_GEOMETRY` is already re-exported from `state/index.ts` ([index.ts](potfoundry-web/src/state/index.ts#L57)), so no new plumbing needed.

---

### C2 [WARNING]: StyleTab missing `defaultValue` on style parameter sliders

**Generator's claim**: StyleParamControl renders SliderV2 for float/int params but does not pass `defaultValue`.

**Actual behavior**: Without `defaultValue`, users lose snap-to-default and double-click-to-reset for style parameters. SliderV2 handles this gracefully (the features simply don't activate when `defaultValue` is `undefined` — see [SliderV2.tsx](potfoundry-web/src/ui/v2/controls/SliderV2.tsx#L81)), so this is not a crash. But it's a missed UX opportunity.

**Recommended fix**: Pass `schema.default` as `defaultValue`:

```tsx
<SliderV2
  value={typeof value === 'number' ? value : schema.default as number}
  defaultValue={typeof schema.default === 'number' ? schema.default : undefined}
  ...
/>
```

**Severity**: WARNING — functional but degraded UX. Acceptable for Phase 3 but should be fixed.

---

### C3 [WARNING]: ExportTab advanced sliders missing `defaultValue`

**Generator's claim**: ExportTab renders resolution and seam angle sliders without `defaultValue`.

**Same issue as C2**: Users cannot double-click to reset export resolution to its default. `DEFAULT_MESH_QUALITY` is already exported from `state/index.ts` ([index.ts](potfoundry-web/src/state/index.ts#L62)).

**Recommended fix**:

```tsx
import { ..., DEFAULT_MESH_QUALITY } from '../../../state';

<SliderV2
  value={mesh.export_n_theta}
  defaultValue={DEFAULT_MESH_QUALITY.export_n_theta}
  ...
/>
```

**Severity**: WARNING — same rationale as C2.

---

### C4 [WARNING]: `setMeshParam('optimize', !mesh.optimize)` type inference

**Generator's claim**: `setMeshParam('optimize', !mesh.optimize)` toggles the optimize boolean.

**Actual behavior**: `setMeshParam` has signature `<K extends keyof MeshQuality>(key: K, value: MeshQuality[K]) => void` ([mesh.ts](potfoundry-web/src/state/slices/mesh.ts#L33-L35)). With literal `'optimize'`, TypeScript infers `K = 'optimize'`, so `value` must be `MeshQuality['optimize']` = `boolean`. `!mesh.optimize` is `boolean`. This **should** type-check correctly.

However, the implementation of `setMeshParam` has a conditional: `typeof value === 'number' && key in MESH_QUALITY_BOUNDS` — if the value is NOT a number (i.e., it's a boolean for `optimize`), it falls through to the else branch and sets the value directly ([mesh.ts](potfoundry-web/src/state/slices/mesh.ts#L168-L175)). This is correct.

Additionally, `optimize` is NOT in `MESH_QUALITY_BOUNDS` (bounds only covers numeric params with min/max/step — see [types.ts](potfoundry-web/src/state/types.ts#L197-L204)). So the `key in MESH_QUALITY_BOUNDS` check would be `false`, and the boolean value passes through unclamped. This is the correct behavior.

**Verdict**: Functionally correct after tracing through. No fix needed. Downgraded from CRITICAL to NOTE.

---

### C5 [NOTE]: Nested SectionV2 in StyleTab omits `sectionIndex`

**Generator's claim**: StyleTab uses nested `<SectionV2 title="Advanced Parameters" defaultOpen={false}>` without `sectionIndex`.

**Actual behavior**: `sectionIndex` defaults to 0 ([SectionV2.tsx](potfoundry-web/src/ui/v2/controls/SectionV2.tsx#L26)). This drives the `--section-index` CSS custom property for stagger animation delay. Since this is a nested section, `sectionIndex=0` is acceptable — it will animate at the same time as its parent, which is fine because it's the only nested section.

**Verdict**: No fix required. Cosmetic only.

---

### C6 [NOTE]: `QUALITY_PRESETS` type is `Record<QualityPreset, MeshQuality>` — not a concern

**Generator's claim**: `QUALITY_PRESETS[card.key]` access in ExportTab.

**Verification**: `QUALITY_PRESETS` is typed as `Record<QualityPreset, MeshQuality>` ([mesh.ts](potfoundry-web/src/state/slices/mesh.ts#L74)), and `QUALITY_CARDS[].key` is typed as `QualityPreset`. Access is type-safe.

---

### C7 [NOTE]: `forceMount` on all SectionV2 instances

**Generator's concern (Q3)**: SectionV2 uses `forceMount` on `Collapsible.Content` ([SectionV2.tsx](potfoundry-web/src/ui/v2/controls/SectionV2.tsx#L44)), meaning collapsed children render to the DOM but are hidden via CSS.

**Assessment**: In ShapeTab, the collapsed "Bell & Twist" section has 6 SliderV2 instances (3 bell + 3 twist). Each SliderV2 is a Radix Slider with a few DOM nodes. 6 extra sliders is negligible. In StyleTab, advanced params are typically 0-3 extra sliders. In ExportTab, collapsed "Advanced" has 3 sliders + 1 button. Total force-mounted hidden content across all tabs: ~12 lightweight slider widgets. **No performance concern.**

---

## Verified Claims (things the Generator got right)

### V1: All imports resolve ✅

| Import | Source | Verified At |
|--------|--------|-------------|
| `STYLE_SCHEMAS` | `state/index.ts` → `slices/` | [index.ts L93](potfoundry-web/src/state/index.ts#L93) |
| `QUALITY_PRESETS` | `state/index.ts` → `slices/` | [index.ts L99](potfoundry-web/src/state/index.ts#L99) |
| `QualityPreset` type | `state/index.ts` → `slices/` | [index.ts L100](potfoundry-web/src/state/index.ts#L100) |
| `MESH_QUALITY_BOUNDS` | `state/index.ts` → `types.ts` | [index.ts L60](potfoundry-web/src/state/index.ts#L60) |
| `MeshQuality` type | `state/index.ts` → `types.ts` | [index.ts L62](potfoundry-web/src/state/index.ts#L62) (implicit via `type MeshQuality`) |
| `COLOR_SCHEMES` | `state/index.ts` → `slices/` | [index.ts L102](potfoundry-web/src/state/index.ts#L102) |
| `LIGHTING_PRESETS` | `state/index.ts` → `slices/` | [index.ts L103](potfoundry-web/src/state/index.ts#L103) |
| `BACKGROUND_GRADIENTS` | `state/index.ts` → `slices/` | [index.ts L104](potfoundry-web/src/state/index.ts#L104) |
| `GEOMETRY_BOUNDS` | `state/index.ts` → `types.ts` | [index.ts L56](potfoundry-web/src/state/index.ts#L56) |
| `GeometryParams` type | `state/index.ts` → `types.ts` | [index.ts L55](potfoundry-web/src/state/index.ts#L55) |
| `StyleName` type | `state/index.ts` → `types.ts` | [index.ts L63](potfoundry-web/src/state/index.ts#L63) |
| `ParamSchema` type | `state/index.ts` → `types.ts` | [index.ts L62](potfoundry-web/src/state/index.ts#L62) |
| `DEFAULT_GEOMETRY` | `state/index.ts` → `types.ts` | [index.ts L57](potfoundry-web/src/state/index.ts#L57) |
| `lucide-react` | `package.json` | [package.json L37](potfoundry-web/package.json#L37) — v0.555.0 |
| `clsx` | `package.json` | [package.json L34](potfoundry-web/package.json#L34) — v2.1.1 |

### V2: All CSS tokens exist ✅

Every `--pf2-*` custom property used in the proposals verified against source:

| Token | Defined At |
|-------|-----------|
| `--pf2-space-xs/sm/md/lg` | [AppUIv2.css L52-55](potfoundry-web/src/ui/v2/AppUIv2.css#L52-L55) |
| `--pf2-accent` | [AppUIv2.css L35](potfoundry-web/src/ui/v2/AppUIv2.css#L35) |
| `--pf2-accent-subtle` | [AppUIv2.css L37](potfoundry-web/src/ui/v2/AppUIv2.css#L37) |
| `--pf2-text-primary/secondary/muted` | [AppUIv2.css L30-32](potfoundry-web/src/ui/v2/AppUIv2.css#L30-L32) |
| `--pf2-border` | [AppUIv2.css L40](potfoundry-web/src/ui/v2/AppUIv2.css#L40) |
| `--pf2-border-active` | [AppUIv2.css L41](potfoundry-web/src/ui/v2/AppUIv2.css#L41) |
| `--pf2-bg-elevated` | [AppUIv2.css L26](potfoundry-web/src/ui/v2/AppUIv2.css#L26) |
| `--pf2-bg-hover` | [AppUIv2.css L27](potfoundry-web/src/ui/v2/AppUIv2.css#L27) |
| `--pf2-radius-sm/md` | [AppUIv2.css L59-60](potfoundry-web/src/ui/v2/AppUIv2.css#L59-L60) |
| `--pf2-font-body` | [AppUIv2.css L65](potfoundry-web/src/ui/v2/AppUIv2.css#L65) |
| `--pf2-duration-micro/fast` | [motion.css L37-38](potfoundry-web/src/ui/v2/motion.css#L37-L38) |
| `--pf2-ease-enter/move/spring` | [motion.css L14-23](potfoundry-web/src/ui/v2/motion.css#L14-L23) |
| `--pf2-duration-stagger` | [motion.css L43](potfoundry-web/src/ui/v2/motion.css#L43) |
| `pf2-tab-enter` keyframe | [motion.css L73](potfoundry-web/src/ui/v2/motion.css#L73) |

### V3: Type signatures match the store ✅

| Action | Declared Signature | Generator Usage | Match? |
|--------|-------------------|-----------------|--------|
| `setGeometryParam` | `<K extends keyof GeometryParams>(key: K, value: GeometryParams[K])` | `(key: keyof GeometryParams, value: number)` | ✅ (all values are `number`) |
| `setStyleOpt` | `(key: string, value: number \| boolean)` | `(key: string, value: number \| boolean)` | ✅ exact |
| `setStyle` | `(name: StyleName)` | `(value as StyleName)` | ✅ |
| `setQualityPreset` | `(level: QualityPreset)` | `(key: QualityPreset)` | ✅ |
| `setMeshParam` | `<K extends keyof MeshQuality>(key: K, value: MeshQuality[K])` | `('export_n_theta', v)`, `('optimize', !mesh.optimize)` | ✅ |
| `getStyleSchema` | `() => StyleSchema` | `useMemo(() => getStyleSchema(), [styleName, getStyleSchema])` | ✅ |

### V4: Component API usage is correct ✅

- **SelectV2**: `options` with `description` renders correctly — `SelectV2Option` has `description?: string` ([SelectV2.tsx L10](potfoundry-web/src/ui/v2/controls/SelectV2.tsx#L10)) and the component renders it ([SelectV2.tsx L83-85](potfoundry-web/src/ui/v2/controls/SelectV2.tsx#L83-L85)).
- **SectionV2**: `sectionIndex`, `className`, `defaultOpen`, `icon` all match the interface ([SectionV2.tsx L7-16](potfoundry-web/src/ui/v2/controls/SectionV2.tsx#L7-L16)).
- **ButtonV2**: `aria-pressed` passes through via `...props` spread, since `ButtonV2Props extends React.ButtonHTMLAttributes<HTMLButtonElement>` ([ButtonV2.tsx L8-9](potfoundry-web/src/ui/v2/controls/ButtonV2.tsx#L8-L9)).
- **SliderV2**: `value`, `onChange`, `min`, `max`, `step`, `defaultValue`, `label`, `description`, `unit`, `decimals` all match `SliderV2Props` ([SliderV2.tsx L6-19](potfoundry-web/src/ui/v2/controls/SliderV2.tsx#L6-L19)).

### V5: Appearance action signatures match ✅

All appearance actions used in StyleTab verified against `appearance.ts`:
- `toggleWireframe: () => void` — [appearance.ts L261](potfoundry-web/src/state/slices/appearance.ts#L261)
- `toggleInner: () => void` — [appearance.ts L273](potfoundry-web/src/state/slices/appearance.ts#L273)
- `setLightingPreset: (presetId: string) => void` — [appearance.ts L310](potfoundry-web/src/state/slices/appearance.ts#L310)
- `setBackgroundGradient: (gradientId: string) => void` — [appearance.ts L288](potfoundry-web/src/state/slices/appearance.ts#L288)
- `setCustomGradient: (colors: [string, string]) => void` — [appearance.ts L296](potfoundry-web/src/state/slices/appearance.ts#L296)
- `setGradientAngle: (angle: number) => void` — [appearance.ts L303](potfoundry-web/src/state/slices/appearance.ts#L303)

### V6: Accessibility patterns are correct ✅

- Color swatch grid uses `role="radiogroup"` with `aria-label`, and each swatch has `role="radio"` with `aria-checked`. Correct.
- Lighting chips use same radio pattern. Correct.
- Quality cards use same radio pattern. Correct.
- Toggle buttons use `aria-pressed`. Correct for stateful toggles.
- `prefers-reduced-motion` and `forced-colors` media queries included in all CSS files. Thorough.

### V7: Color picker label mapping is correct ✅

The Generator maps "Top" → `setSecondaryColor`, "Bottom" → `setPrimaryColor`. This matches the type comments in [types.ts](potfoundry-web/src/state/types.ts):
- `primaryColor`: "Primary mesh color (hex) - bottom of pot gradient"
- `secondaryColor`: "Secondary/accent color (hex) - top of pot gradient"

The gradient `linear-gradient(to right, primary, mid, secondary)` in the preview bar shows the full range. Note: the preview bar uses `to right` (horizontal), not `to top` (vertical like the pot). This is a deliberate UX choice for a narrow horizontal preview bar — **acceptable**.

---

## Open Question Responses

### Q1: `getStyleSchema()` reactivity pattern

**Generator's memo**: `useMemo(() => getStyleSchema(), [styleName, getStyleSchema])`

**Verdict**: CORRECT.

`getStyleSchema` is a stable function reference from the store (the `get()` call inside reads the latest snapshot at call time — [style.ts L183-186](potfoundry-web/src/state/slices/style.ts#L183-L186)). `styleName` is derived from `useAppStore(s => s.style.name)`, which triggers re-render when style changes. When `styleName` changes, `useMemo` recomputes, calling `getStyleSchema()` which internally reads the new `style.name` from the store. The second dep `getStyleSchema` is stable (it doesn't change), but including it satisfies ESLint exhaustive-deps. Sound pattern.

### Q2: Export format as local state

**Verdict**: CORRECT for Phase 3.

There is no `exportFormat` field in any state type. Adding it to the Zustand store would be premature since the export pipeline doesn't support format selection yet. `useState<'stl' | '3mf'>('stl')` is the right scope. When Phase 4 wires real export integration, promote to global state then.

### Q3: `forceMount` performance concern

**Verdict**: NO CONCERN.

As analyzed in C7 above: total force-mounted hidden content across all tabs is ~12 lightweight slider widgets. Each is a Radix Slider (a few DOM nodes). This is negligible. If performance ever becomes an issue, the fix is trivial (remove `forceMount` from SectionV2), but it would break the CSS slide-open animation. Not worth the trade-off.

### Q4: `detectActivePreset` matching only export resolutions

**Verdict**: ACCEPTABLE — Generator's reasoning is sound.

The Generator only checks `export_n_theta` and `export_n_z` for preset detection. Alternative would be checking ALL `MeshQuality` fields (including `seamAngle`, `optimize`, `preview_n_theta`, `preview_n_z`). But the Generator's rationale is correct: the quality "profile" cards represent resolution tiers. `seamAngle` and `optimize` are orthogonal modifiers. Deselecting the quality card when a user toggles mesh optimization would be confusing UX.

One edge case to note: if two quality presets happen to share the same `export_n_theta` and `export_n_z`, the first one found wins. But checking the current presets, all four have unique resolution pairs (verified by examining `QUALITY_PRESETS` type constraints). Acceptable.

### Q5: Color picker label mapping

**Verdict**: CORRECT — verified above in V7.

---

## Implementation Conditions

The Executioner should implement all four proposals (ShapeTab, StyleTab, ExportTab, SidebarV2 wiring) with the following amendments:

### Mandatory (fixes C1)

1. **ShapeTab.tsx**: Import `DEFAULT_GEOMETRY` from `'../../../state'` and change `defaultValue={geometry[key]}` to `defaultValue={DEFAULT_GEOMETRY[key]}` in the `GeometrySliderGroup` component.

### Recommended (addresses C2, C3)

2. **StyleTab.tsx / StyleParamControl**: Add `defaultValue={typeof schema.default === 'number' ? schema.default : undefined}` to the SliderV2 in StyleParamControl.

3. **ExportTab.tsx**: Import `DEFAULT_MESH_QUALITY` and pass appropriate `defaultValue` to each mesh slider (e.g., `defaultValue={DEFAULT_MESH_QUALITY.export_n_theta}`).

### Implementation Order

1. ShapeTab.tsx + ShapeTab.css (with C1 fix applied)
2. StyleTab.tsx + StyleTab.css (with C2 fix applied)
3. ExportTab.tsx + ExportTab.css (with C3 fix applied)
4. SidebarV2.tsx modifications (trivial wiring)

### Validation Protocol

After implementation, the Executioner should verify:
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All three tabs render in the dev server without console errors
- [ ] Double-click on Height slider in ShapeTab resets to 120mm (DEFAULT_GEOMETRY.H)
- [ ] Changing style in SelectV2 re-renders params with stagger animation
- [ ] Clicking a quality card updates the advanced resolution sliders
- [ ] Color swatches show gold border on active scheme
- [ ] `prefers-reduced-motion: reduce` disables all animations (test via DevTools)
