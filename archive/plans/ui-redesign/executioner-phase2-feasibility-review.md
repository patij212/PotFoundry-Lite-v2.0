# Executioner Feasibility Review — Phase 2: Layout Components

**Date**: 2026-03-06  
**Author**: The Executioner  
**Documents reviewed**:  
- `generator-phase2-layout-components.md`  
- `verifier-phase2-layout-critique.md`  
- Master Decisions (4 binding rulings)

---

## Verdict: FEASIBLE

All 8 files can be implemented as specified with Master amendments applied. No blockers found. Two implementation notes and one minor type adjustment required.

---

## 1. Directory Existence

**`src/ui/v2/layout/`** — Does NOT exist. Must be created. The existing `src/ui/v2/` contains:
```
AppUIv2.css
AppUIv2.tsx
controls/
fonts.css
motion.css
shared/
```

**Action**: Create `src/ui/v2/layout/` directory. Six new files land here.

---

## 2. Import Graph — All Resolved

### SidebarV2.tsx
| Import | Resolves To | Status |
|--------|-------------|--------|
| `react` | node_modules | ✓ |
| `@radix-ui/react-tabs` | node_modules (^1.1.13 in package.json) | ✓ |
| `lucide-react` (X, GripVertical, Layers, Paintbrush, Download) | node_modules | ✓ |
| `../controls/ButtonV2` → `IconButtonV2` | `src/ui/v2/controls/ButtonV2.tsx` L87 | ✓ |
| `./StatusFooter` | `src/ui/v2/layout/StatusFooter.tsx` (created in same changeset) | ✓ |
| `../../../state` → `useAppStore` | `src/state/index.ts` | ✓ |
| `../shared/Announcer` → `useAnnounce` | `src/ui/v2/shared/Announcer.tsx` L28 | ✓ |
| `clsx` | node_modules | ✓ |

### StatusFooter.tsx (with Master Decision #4 applied)
| Import | Resolves To | Status |
|--------|-------------|--------|
| `react` | node_modules | ✓ |
| `lucide-react` (Triangle, Box, Activity, Download) | node_modules | ✓ |
| `../controls/ButtonV2` → `ButtonV2` | `src/ui/v2/controls/ButtonV2.tsx` L20 | ✓ |
| `../../../state` → `useAppStore` | `src/state/index.ts` | ✓ |

**NOTE**: Generator imports `usePerformance` from `../../../state`. Per **Master Decision #4**, replace with `useAppStore` and individual selectors. The import line changes from `import { usePerformance } from '../../../state'` to `import { useAppStore } from '../../../state'`.

### ToolbarV2.tsx
| Import | Resolves To | Status |
|--------|-------------|--------|
| `react` | node_modules | ✓ |
| `lucide-react` (Menu, Maximize, Minimize, Camera, RotateCcw, Save, FolderOpen, HelpCircle, RefreshCw, Shrink, Expand) | node_modules (Verifier runtime-confirmed Shrink/Expand) | ✓ |
| `../controls/ButtonV2` → `IconButtonV2` | `src/ui/v2/controls/ButtonV2.tsx` L87 | ✓ |
| `../../../state` → `useAppStore` | `src/state/index.ts` | ✓ |
| `../../../context` → `useControllerMaybe` | `src/context/index.ts` L10 | ✓ |
| `../../shared/HelpDialog` | `src/ui/shared/HelpDialog.tsx` L115 (v1 shared, intentionally reusable) | ✓ |
| `clsx` | node_modules | ✓ |

### AppUIv2.tsx (rewrite, with Master Decision #1 applied)
| Import | Resolves To | Status |
|--------|-------------|--------|
| `react` | node_modules | ✓ |
| `./shared/Announcer` → `AnnouncerProvider` | `src/ui/v2/shared/Announcer.tsx` | ✓ |
| `./layout/SidebarV2` | `src/ui/v2/layout/SidebarV2.tsx` (created in same changeset) | ✓ |
| `./layout/ToolbarV2` | `src/ui/v2/layout/ToolbarV2.tsx` (created in same changeset) | ✓ |
| `../../state` → `useAppStore` | `src/state/index.ts` | ✓ |

**RESULT**: All imports resolve. Zero compilation failures from import paths.

---

## 3. TypeScript Compatibility

### IconButtonV2 prop usage
`IconButtonV2Props` extends `Omit<ButtonV2Props, 'iconLeft' | 'iconRight' | 'children'>`. Since `ButtonV2Props` extends `React.ButtonHTMLAttributes<HTMLButtonElement>`, the following props used in the proposal are all valid:

| Prop | Source | Valid |
|------|--------|-------|
| `icon` | `IconButtonV2Props` (required) | ✓ |
| `aria-label` | `IconButtonV2Props` (required `string`) | ✓ |
| `onClick` | `React.ButtonHTMLAttributes` | ✓ |
| `size="sm"` | `ButtonV2Props` | ✓ |
| `disabled` | `React.ButtonHTMLAttributes` | ✓ |

### ButtonV2 prop usage (StatusFooter)
| Prop | Source | Valid |
|------|--------|-------|
| `variant="primary"` | `ButtonV2Props` | ✓ |
| `fullWidth` | `ButtonV2Props` (L15) | ✓ |
| `iconLeft` | `ButtonV2Props` (L13) | ✓ |
| `aria-label` | `React.ButtonHTMLAttributes` | ✓ |
| `children` (text) | `React.ButtonHTMLAttributes` (NOT omitted in ButtonV2Props) | ✓ |

### StatusFooter `useMemo` adjustment
With Master Decision #4 (individual selectors), the `useMemo` deps array changes:

**Generator's code:**
```tsx
const performance = usePerformance();
const stats = useMemo(() => ({ ... }),
  [performance.triangleCount, performance.vertexCount, performance.generationTime]
);
```

**After amendment:**
```tsx
const triangleCount = useAppStore((s) => s.performance.triangleCount);
const vertexCount = useAppStore((s) => s.performance.vertexCount);
const generationTime = useAppStore((s) => s.performance.generationTime);
const isGenerating = useAppStore((s) => s.performance.isGenerating);

const stats = useMemo(() => ({
  triangles: formatNumber(triangleCount),
  vertices: formatNumber(vertexCount),
  genTime: formatTime(generationTime),
}), [triangleCount, vertexCount, generationTime]);
```

And `performance.isGenerating` references in JSX become just `isGenerating`. No type issues.

### AppUIv2 type change (Master Decision #1)
Removing `AppUIv2Props` interface and `children` param:
- Component signature changes from `React.FC<AppUIv2Props>` → `React.FC`
- `export default AppUIv2` preserved → `React.lazy()` still works
- Call site `<AppUIv2 />` passes no props → compatible

**RESULT**: Zero predicted TypeScript errors.

---

## 4. CSS Class Name Conflicts

Searched all `src/**/*.css` files for `pf2-sidebar`, `pf2-toolbar`, `pf2-status-footer`:

**No matches found.** All proposed class names are unique to Phase 2.

Additionally verified — no existing v1 CSS classes use these prefixes (v1 uses unprefixed names like `.sidebar`, `.toolbar`, `.status-bar`).

**RESULT**: No CSS conflicts.

---

## 5. motion.css — Insertion Point for `pf2-spin`

Current `motion.css` structure (218 lines total):
```
L1-12:    File header
L13-28:   Easing Curves (:root)
L30-42:   Duration Scale (:root)
L44-48:   Keyframe Animations header
L50-59:   @keyframes pf2-slide-in
L62-71:   @keyframes pf2-slide-out
L73-82:   @keyframes pf2-tab-enter
L84-93:   @keyframes pf2-tab-exit
L95-101:  @keyframes pf2-section-enter
L104-108: @keyframes pf2-completion-spring
L110-113: @keyframes pf2-shimmer (referenced externally)
L115-119: @keyframes pf2-gold-flash
L121-124: @keyframes pf2-check-draw
L127-130: @keyframes pf2-press
L133-136: @keyframes pf2-fade-in
L138-141: @keyframes pf2-fade-out
L143-148: (blank + Utility Animation Classes header)
L149-180: Utility animation classes
L182-195: Micro-interaction transitions
L197-218: Reduced Motion media query
```

**Insert `@keyframes pf2-spin` after `pf2-fade-out` (after L141) and before the Utility Animation Classes section (L143)**. This maintains alphabetical-ish grouping with other keyframes.

Insertion:
```css
/* Spinner rotation */
@keyframes pf2-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
```

---

## 6. ButtonV2.css — Exact Lines to Remove

`@keyframes pf2-spin` in `ButtonV2.css` spans **lines 163–166**:
```css
@keyframes pf2-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
```

The preceding line (L161) references the animation:
```css
  animation: pf2-spin 0.8s linear infinite;
```

**L161 STAYS** — it references the keyframe by name; CSS will resolve `pf2-spin` from `motion.css` which is imported earlier via `AppUIv2.css → @import './motion.css'`.

**L163–166 (the `@keyframes` block) must be REMOVED.** Include the blank line (L162) in the deletion for a clean result.

Also confirm: the Generator's `StatusFooter.css` proposes a duplicate `@keyframes pf2-spin`. Per **Master Decision #2**, this must NOT be included in `StatusFooter.css`. The `.pf2-status-footer__spinner` will reference `pf2-spin` from `motion.css` — no local definition needed.

---

## 7. App.tsx Compatibility

**Lazy import** (App.tsx L21):
```tsx
const AppUIv2 = lazy(() => import('./ui/v2/AppUIv2'));
```

This uses the **default import**. The rewritten `AppUIv2.tsx` maintains `export default AppUIv2`, so `React.lazy()` continues to work.

**Call site** (App.tsx L534-536 per Verifier):
```tsx
<AppUIv2 />
```

No `children` passed. Removing the `children` prop per Master Decision #1 makes this consistent — the type signature matches the usage.

**No changes to App.tsx required.** Zero risk of breaking the lazy import.

---

## 8. Implementation Order — CONFIRMED

The Verifier's suggested order is correct. Confirmed with dependency analysis:

```
Step 1: motion.css edit + ButtonV2.css edit
          ↓  (no deps — keyframe housekeeping)
Step 2: StatusFooter.tsx + StatusFooter.css  (CREATE)
          ↓  (depends on: ButtonV2 from Phase 1, motion.css keyframe)
Step 3: SidebarV2.tsx + SidebarV2.css  (CREATE)
          ↓  (depends on: StatusFooter, IconButtonV2, Radix Tabs, Announcer)
Step 4: ToolbarV2.tsx + ToolbarV2.css  (CREATE)
          ↓  (depends on: IconButtonV2, HelpDialog, useControllerMaybe)
          Note: Steps 3 & 4 are independent of each other
Step 5: AppUIv2.tsx  (REWRITE)
          ↓  (depends on: SidebarV2, ToolbarV2, Announcer)
Step 6: AppUIv2.css  (APPEND)
          (depends on: nothing — pure CSS addition)
```

Steps 3 and 4 have no mutual dependency and could technically be done in either order. The sequence above is correct as stated.

---

## Implementation Notes

### Note 1: StatusFooter.css — Remove duplicate `@keyframes pf2-spin`
The Generator's `StatusFooter.css` contains a local `@keyframes pf2-spin` definition (L57-60 in the proposal). Per Master Decision #2, this must be **omitted** during implementation. The `.pf2-status-footer__spinner` animation on L55 (`animation: pf2-spin 0.8s linear infinite`) will resolve from `motion.css`.

### Note 2: StatusFooter.tsx — useAppStore individual selectors
Per Master Decision #4, replace the Generator's `usePerformance()` hook with four individual `useAppStore` selectors. This changes:
- The import line
- Four const declarations replacing one
- The `useMemo` dependency array (uses bare variable names instead of `performance.` prefix)
- JSX references (`performance.isGenerating` → `isGenerating`)

### Note 3: AppUIv2.css — Remove `.pf2-layout__viewport`
Per Master Decision #1, the `<main className="pf2-layout__viewport">` wrapper is removed. Therefore the `.pf2-layout__viewport` CSS rule proposed in the AppUIv2.css additions should also be omitted. Only `.pf2-layout` needs to be added.

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| CSS cascade order for `pf2-spin` | Low | `motion.css` is imported before `ButtonV2.css` via `AppUIv2.css` → `@import './motion.css'` at L18. Animation reference in ButtonV2 will resolve correctly. |
| Radix Tabs runtime behavior | Low | Verifier confirmed API surface. `data-state='active'` selector is stable Radix pattern. |
| Save/load `window.__POTFOUNDRY_STORE__` | Low | Same pattern as v1 — proven in production. |
| HelpDialog cross-theme import | Low | V1 shared component, theme-independent. Verifier confirmed props match. |

**No high-severity risks identified.**

---

## Unstated Dependencies

1. **`clsx` package** — Used by SidebarV2 and ToolbarV2. Already installed (used by Phase 1 ButtonV2). ✓
2. **`lucide-react` icons** — Triangle, Box, Activity, GripVertical must exist. These are standard icons in the lucide set. Shrink/Expand were explicitly runtime-verified by Verifier. ✓
3. **CSS custom properties** — All `--pf2-*` tokens referenced in the new CSS files are defined in `AppUIv2.css` `:root`. Verifier checked each one. ✓

---

## Questions for Generator/Verifier

None. All open questions from the Generator proposal were resolved by the Verifier. All Master Decisions are clear and implementable.

---

## Summary

**FEASIBLE** — Ready for implementation.

**Implementation order confirmed:**
1. `motion.css` + `ButtonV2.css` (keyframe consolidation)
2. `StatusFooter.tsx` + `StatusFooter.css` (with Master amendments #2, #4)
3. `SidebarV2.tsx` + `SidebarV2.css` (with Master amendment #3 — DEFAULT_WIDTH = 380 is CORRECT)
4. `ToolbarV2.tsx` + `ToolbarV2.css`
5. `AppUIv2.tsx` rewrite (with Master amendment #1 — no children, no viewport wrapper)
6. `AppUIv2.css` append (`.pf2-layout` only, no `.pf2-layout__viewport`)

**Changeset**: 6 files created, 3 files modified. Estimated ~950 lines net (after removing dead code per Master decisions).
