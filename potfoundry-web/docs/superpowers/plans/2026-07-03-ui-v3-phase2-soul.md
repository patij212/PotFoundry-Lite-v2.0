# UI v3 "Studio at Dusk" — Phase 2: The Soul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the signature layer on top of the Phase-1 shell: the Living Blueprint, the two-surface style system (working set + showroom with real GPU thumbnails), the export certificate + kiln log, the entrance sequence — plus every deferral Phase 1's header recorded (scrub, `?`/F11, View-pill extras, account chip, grid default).

**Architecture:** Everything stays inside `src/ui/v3/` and consumes existing engine APIs: profile math from `src/geometry/profile.ts`, thumbnails from the existing `src/services/ThumbnailRenderer.ts` singleton, camera actions from `ControllerContext` (`useController()`), export diagnostics from `useParametricExport().stats`. Two additive data changes: registry gains `category`/`tags`; new localStorage keys behind a shared `safeStorage` util.

**Tech Stack:** unchanged (React 18 + TS, plain CSS `--pf3-*` tokens, Zustand, Vitest/jsdom, Playwright).

**Spec refinements (approved-by-controller deviations from spec §7/§8.3 — surface at review):**
- **Kiln log:** metadata only in localStorage (last 10); "Export again" **re-fires** with the recorded fidelity+filename. Blob caching (true re-download) deferred — `exportSTL` auto-downloads and returns no Blob, and spec §14 forbids modifying the export pipeline.
- **Thumbnail cache:** in-memory Map keyed `(styleId, geometryHash)` for Phase 2; IndexedDB persistence deferred to the 100-style content expansion.
- **Showroom hover live-apply:** attempted with revert-on-leave behind a module flag; falls back to thumbnail-only preview if style-switch cost proves janky (spec §15 sanctioned fallback). Task 10 verifies `setStyle`'s opts behavior first.
- **Entrance:** CSS-orchestrated chrome entrance (~700ms staggered, once per session). The pot-rise moment needs renderer animation hooks that don't exist — deferred to Phase 4 polish.
- **Grid:** default-off under v3 via one-time migration (same pattern as the backdrop); warm grid *restyle* is WGSL work, deferred.

## Global Constraints

Everything from the Phase-1 plan header still binds (ESLint 0-warnings, GitNexus detect_changes before commits, `--pf3-` token discipline + guard test, gold-on-action-only, tabular-nums, labels never truncate, reduced-motion, style IDs permanent, ui slice not persisted, `pf2-ui-theme` legacy key, e2e needs a running dev server, sentence-case active-verb copy, commit style with co-author trailer). Additions:

- **Typecheck baseline:** 2 pre-existing errors in `src/fidelity/bandRemesh/corridorPave.ts` are known; the rule is no NEW errors. Unit-gate scope: `npx vitest run src/ui/v3 src/state src/styles` green; pre-existing failures outside src/state|ui|hooks|styles are not yours.
- **Do NOT modify** `src/hooks/useParametricExport.ts`, `src/services/ThumbnailRenderer.ts`, or any renderer/geometry engine file. Consume only. (Exception: `src/styles/registry.ts` additive fields, Task 1.)
- **New localStorage keys** (all via the Task-2 `safeStorage` util): `pf3-favorites`, `pf3-recents`, `pf3-kiln-log`, `pf3-grid-migrated`; sessionStorage: `pf3-entered`.
- **One icon family:** new icons go into `src/ui/v3/icons.tsx` with the identical base (16×16, stroke currentColor, 1.5, round).
- **Controller access pattern:** `useControllerMaybe()` (null-safe, jsdom-proof) exactly as PillToolbar does; never invent controller methods — the verified API list is in each task.
- **Phase-1 files may be edited** where a task says so, but only the named files per task.

## File Structure (Phase 2)

```
src/ui/v3/
  utils/safeStorage.ts (+test)         # consolidates the 6 duplicated try/catch guards
  blueprint/
    profileSampler.ts (+test)          # CPU r(z) sampling via geometry/profile.ts
    BlueprintCanvas.tsx/.css (+test)   # SVG section: generatrix, wall, ticks, handles
  showroom/
    styleThumbnails.ts (+test)         # synthetic-design adapter + in-memory cache
    StyleThumb.tsx/.css (+test)        # lazy canvas thumb, quiet silhouette fallback
    ShowroomOverlay.tsx/.css (+test)   # overlay grid, chips, search, apply behaviors
  panel/
    workingSet.ts (+test)              # favorites/recents (localStorage)
    KilnLog.tsx (+test)                # metadata log + re-fire (rendered in ExportTab)
    Certificate.tsx/.css (+test)       # validation checklist card (rendered in footer)
  stage/AccountChip.tsx/.css (+test)   # hosts existing AppSettingsButton + UserMenu
  shared/ShortcutsDialogV3.tsx/.css (+test)
  entrance.css                         # staggered once-per-session entrance
Modify (task-scoped): registry.ts, StyleTab, ExportTab, ExportFooter, ShapeTab,
  PillToolbar(+icons), AppUIv3(+css/test), ParamRow(+test/css), useStudioBackdrop,
  App.tsx (hide legacy header under v3), e2e/ui-v3-smoke.spec.ts (extend)
```

## Task summary (17 tasks)

| # | Task | Model hint |
|---|---|---|
| 1 | Registry `category`/`tags` for all 20 styles | haiku |
| 2 | `safeStorage` util + hygiene consolidations | haiku |
| 3 | `profileSampler` — CPU cross-section sampling | sonnet |
| 4 | BlueprintCanvas — static SVG section | sonnet |
| 5 | Blueprint drag handles (bidirectional) | sonnet |
| 6 | Blueprint into ShapeTab | haiku |
| 7 | `styleThumbnails` adapter + cache | sonnet |
| 8 | StyleThumb component (lazy, fallback) | haiku |
| 9 | Working set: favorites/recents + StyleTab strip | sonnet |
| 10 | ShowroomOverlay shell + apply/hover behaviors | sonnet |
| 11 | Certificate card | haiku |
| 12 | Kiln log + re-fire | sonnet |
| 13 | AccountChip + legacy-header handoff | sonnet |
| 14 | View-pill extras (ortho/grid/presets) + grid migration | haiku |
| 15 | ParamRow scrub (real this time) | sonnet |
| 16 | ShortcutsDialogV3 (`?`) + F11 | haiku |
| 17 | Entrance sequence + Phase-2 e2e + critique gate | sonnet |

---

### Task 1: Registry categories + tags

**Files:**
- Modify: `src/styles/registry.ts` (additive fields only — IDs and existing fields untouched)
- Modify: `src/state/types.ts` (StyleSchema gains optional `category` + `tags`)
- Test: `src/styles/registry.test.ts` (create)

**Interfaces:**
- Produces: `StyleCategory = 'organic' | 'geometric' | 'woven' | 'architectural'`; every `STYLE_REGISTRY` entry gains `category: StyleCategory` and `tags: string[]`. Exported `STYLE_CATEGORIES: ReadonlyArray<{ key: StyleCategory | 'all'; label: string }>`.

Categorization (fixed data — copy verbatim):

| Style | category | tags |
|---|---|---|
| SuperformulaBlossom | organic | petals, flower, sculptural |
| FourierBloom | organic | waves, bloom, smooth |
| SpiralRidges | geometric | spiral, ridges, helix |
| SuperellipseMorph | geometric | squircle, morph, minimal |
| HarmonicRipple | organic | ripple, petals, classic |
| LowPolyFacet | geometric | facets, lowpoly, crystal |
| GothicArches | architectural | arches, gothic, tracery |
| WaveInterference | organic | waves, interference, water |
| Crystalline | geometric | crystal, sharp, mineral |
| ArtDeco | architectural | deco, stepped, vintage |
| DragonScales | woven | scales, overlap, reptile |
| BambooSegments | organic | bamboo, segments, natural |
| RippleInterference | organic | ripple, rings, water |
| GyroidManifold | geometric | gyroid, lattice, math |
| Voronoi | geometric | cells, voronoi, organic-math |
| BasketWeave | woven | weave, basket, strands |
| CelticKnot | woven | knot, celtic, braid |
| HexagonalHive | geometric | hex, honeycomb, tiling |
| CelticTriquetra | woven | triquetra, celtic, medallion |
| LowPolyFacet | geometric | (already above — registry has 20 ids; Step 1 lists the real key set) |

- [ ] **Step 1: Verify the real key list** — read `src/styles/registry.ts` top-level keys (20 entries, ids 0–19). The table above may name one entry imprecisely; map by the actual keys, keep 4 categories, ≥2 tags each. Record the final mapping in your report.

- [ ] **Step 2: Write the failing test** — `src/styles/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { STYLE_REGISTRY, STYLE_CATEGORIES } from './registry';

describe('registry categories', () => {
  it('every style has a category and at least two tags', () => {
    for (const [key, cfg] of Object.entries(STYLE_REGISTRY)) {
      expect(cfg.category, key).toMatch(/^(organic|geometric|woven|architectural)$/);
      expect(cfg.tags?.length ?? 0, key).toBeGreaterThanOrEqual(2);
    }
  });
  it('exports the category chip list with All first', () => {
    expect(STYLE_CATEGORIES[0]).toEqual({ key: 'all', label: 'All' });
    expect(STYLE_CATEGORIES.length).toBe(5);
  });
  it('ids remain permanent (0-19, unique)', () => {
    const ids = Object.values(STYLE_REGISTRY).map((c) => c.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
});
```

- [ ] **Step 3: Run to verify fail**, **Step 4: implement** (types.ts: `category?: StyleCategory; tags?: string[];` on StyleSchema + the `StyleCategory` type; registry: fill every entry; export `STYLE_CATEGORIES`), **Step 5: run to pass** (`npx vitest run src/styles && npm run typecheck`), **Step 6: commit** `feat(ui-v3): style categories + tags for the showroom` (files: registry.ts, types.ts, registry.test.ts).

---

### Task 2: safeStorage util + hygiene consolidations

**Files:**
- Create: `src/ui/v3/utils/safeStorage.ts`, `src/ui/v3/utils/safeStorage.test.ts`
- Modify: `src/state/slices/ui.ts`, `src/ui/v3/panel/PanelShell.tsx`, `src/ui/v3/primitives/DisclosureSeam.tsx`, `src/ui/v3/stage/HintLine.tsx`, `src/ui/v3/stage/useStudioBackdrop.ts` (swap inline try/catch for the util)
- Modify: `src/ui/v3/panel/PanelShell.css` (rename `.pf3-style-tab__select` → `.pf3-input`), `src/ui/v3/panel/StyleTab.tsx`, `src/ui/v3/panel/ExportTab.tsx` (class usage), `src/ui/v3/primitives/ToggleRow.css` (own `.pf3-toggle__label` instead of borrowing `.pf3-param__label`), `src/ui/v3/primitives/ToggleRow.tsx`

**Interfaces:**
- Produces:

```ts
export const safeStorage = {
  get(key: string): string | null,          // try/catch → null
  set(key: string, value: string): void,    // try/catch → no-op
  remove(key: string): void,
  getSession(key: string): string | null,
  setSession(key: string, value: string): void,
};
```

- [ ] **Step 1: failing tests** (get/set round-trip; a throwing Storage mock → get returns null, set doesn't throw — stub `globalThis.localStorage` getter via `vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); })`).
- [ ] **Step 2: implement util; sweep the five call sites** — behavior identical (each already has tests; they stay green untouched).
- [ ] **Step 3: class rename + ToggleRow self-containment** — pure rename, all existing tests must stay green; add `.pf3-input` to PanelShell.css (same rules), update the two consumers, give ToggleRow its own label rule.
- [ ] **Step 4: gates** — `npx vitest run src/ui/v3 src/state && npm run typecheck`.
- [ ] **Step 5: commit** `refactor(ui-v3): safeStorage util + shared input class + ToggleRow self-containment`.

---

### Task 3: profileSampler — the Blueprint's math

**Files:**
- Create: `src/ui/v3/blueprint/profileSampler.ts`, `profileSampler.test.ts`

**Interfaces:**
- Consumes: `baseRadius(z, H, Rb, Rt, expn, opts?)` from `src/geometry/profile.ts:30` (opts carries bell params — verify the exact `StyleOptions` bell keys in profile.ts before coding: expected `bellAmp`/`bellCenter`/`bellWidth` or snake_case variants; adapt).
- Produces:

```ts
export interface ProfileSample { z: number; rOuter: number; rInner: number; }
export interface ProfileGeometry {
  samples: ProfileSample[];       // n+1 points, z from 0 (base) to H (rim)
  maxR: number;                   // for viewBox scaling
  H: number;
  topOD: number; bottomOD: number;
}
export function sampleProfile(g: GeometryParams, n?: number): ProfileGeometry; // default n=48
```

Rules: `rOuter(z) = baseRadius(z, H, bottom_od/2, top_od/2, expn, bellOpts)`; `rInner = max(rOuter - t_wall, 0.5)`; pure function, no store access.

- [ ] **Step 1: verify** profile.ts bell option keys + argument order (Rb = bottom radius? confirm from the source and its callers in meshBuilder).
- [ ] **Step 2: failing tests** — with `DEFAULT_GEOMETRY`: sample count n+1; `samples[0].rOuter ≈ bottom_od/2` (±0.5, bell may perturb — assert with bell zeroed); `samples[n].rOuter ≈ top_od/2`; `rInner = rOuter - t_wall` everywhere above the floor; monotonic z; `maxR = max(rOuter)`; bellAmp > 0 bulges the middle (`rOuter(H/2)` grows vs bell-zero baseline).
- [ ] **Step 3: implement, Step 4: pass, Step 5: commit** `feat(ui-v3): profileSampler — CPU cross-section for the Blueprint`.

---

### Task 4: BlueprintCanvas — the living technical drawing (static)

**Files:**
- Create: `src/ui/v3/blueprint/BlueprintCanvas.tsx`, `BlueprintCanvas.css`, `BlueprintCanvas.test.tsx`

**Interfaces:**
- Consumes: `sampleProfile`; `useAppStore((s) => s.geometry)`; `GEOMETRY_LABELS` (units).
- Produces: `BlueprintCanvas: React.FC<{ height?: number }>` (default 150px tall, full panel width) rendering an SVG vessel study per spec §6: gold outer generatrix mirrored left/right, fainter inner wall line, dashed centerline, dimension ticks — `⌀ {top_od}` above, `{H}` right, mono 9px. `data-testid="pf3-blueprint"`. Re-renders live from geometry state.

Layout math (deterministic, test it): viewBox `0 0 200 130`; drawing area x∈[24,176], y∈[14,116]; scale = min(76 / maxR, 102 / H); pot centered on x=100; y = 116 − z·scale (base at bottom). Path: right generatrix = `M` at base, `L` through samples; left = mirrored (200−x… no: mirrored around x=100). Inner wall: same at rInner, opacity 0.45, strokeWidth 1.

- [ ] **Step 1: failing tests** — renders `[data-testid="pf3-blueprint"]` with: 2 outer paths (`.pf3-bp__outer`, stroke uses gold token class), 2 inner paths, 1 centerline (`stroke-dasharray`), tick texts `⌀ 140` and `120` (mono class) for DEFAULT_GEOMETRY; changing store H to 200 re-renders tick `200`.
- [ ] **Step 2: implement** (component + CSS: `.pf3-blueprint { border: 1px dashed rgba(180,151,90,0.25); border-radius: var(--pf3-radius-md); background: rgba(0,0,0,0.2); }`, paths `stroke: var(--pf3-gold)`; ticks `fill: var(--pf3-text-secondary)` — gold only on the interactive curve, ticks are informational).
- [ ] **Step 3: pass, Step 4: commit** `feat(ui-v3): BlueprintCanvas — live SVG cross-section`.

---

### Task 5: Blueprint drag handles — bidirectional

**Files:**
- Modify: `src/ui/v3/blueprint/BlueprintCanvas.tsx`, `.css`, `.test.tsx`

**Interfaces:**
- Consumes: `setGeometryParam`, `beginHistoryTransaction`, `commitHistoryTransaction`, `GEOMETRY_BOUNDS`.
- Produces: four handles (SVG circles r=6, `data-testid="pf3-bp-handle-<name>"`, `data-pf3-focusable`, `role="slider"` + `aria-label` + `aria-valuenow`), each mapped 1:1 to a named param (spec §15 mitigation — no free-form curve editing):
  - `rim` (at top-right generatrix end): horizontal drag → `top_od` (dx / scale × 2)
  - `base` (bottom-right end): horizontal → `bottom_od`
  - `height` (top of centerline): vertical → `H` (−dy / scale)
  - `belly` (right generatrix at bellCenter height): horizontal → `bellAmp` (dx × 0.01/px)

Drag contract (same discipline as PanelShell): pointerdown → `setPointerCapture?.()` + `beginHistoryTransaction()` + record start; pointermove → clamp+snap to `GEOMETRY_BOUNDS[param]`, `setGeometryParam` live; pointerup → `commitHistoryTransaction()`. Keyboard on focused handle: arrows nudge ±step (Shift ×10), same history wrapping (reuse the exact semantics ParamRow established).

- [ ] **Step 1: failing tests** — pointer sequence on `rim` handle (down at clientX 150 → move +19px → up) writes a larger `top_od` to the store and calls begin/commit exactly once each; `height` drag decreasing y increases H; keyboard ArrowUp on `height` handle → H+1; values clamp at GEOMETRY_BOUNDS extremes. (jsdom: mock `getBoundingClientRect` on the SVG for stable px→unit math — set it in the test via `vi.spyOn(Element.prototype, 'getBoundingClientRect')` returning a 200×130-proportioned rect.)
- [ ] **Step 2: implement** — px→param conversion derives from the SAME scale used for rendering (export a `computeLayout(profile)` helper from the component module so tests can pin it).
- [ ] **Step 3: pass, Step 4: commit** `feat(ui-v3): Blueprint drag handles — the section drives the sliders`.

---

### Task 6: Blueprint into ShapeTab

**Files:**
- Modify: `src/ui/v3/panel/ShapeTab.tsx`, `ShapeTab.test.tsx`

- [ ] **Step 1: failing test** — ShapeTab renders `[data-testid="pf3-blueprint"]` above the Size section voice.
- [ ] **Step 2: implement** — `<BlueprintCanvas />` as the first child; nothing else moves.
- [ ] **Step 3: full v3 gate + commit** `feat(ui-v3): mount the Living Blueprint in ShapeTab`.

---

### Task 7: styleThumbnails — adapter + in-memory cache

**Files:**
- Create: `src/ui/v3/showroom/styleThumbnails.ts`, `styleThumbnails.test.ts`

**Interfaces:**
- Consumes: `ThumbnailRenderer.getInstance()` from `src/services/ThumbnailRenderer.ts` — `renderThumbnail(design: LibraryDesign, width, height): Promise<ImageData | null>` (verify the exact `LibraryDesign` shape it reads — check the type import in ThumbnailRenderer.ts and how `DesignThumbnail.tsx` builds/receives it; the adapter must construct a valid one from `{ styleName, geometry, styleOpts }`).
- Produces:

```ts
export function geometryHash(g: GeometryParams): string;        // stable join of the 13 values
export function getStyleThumbnail(
  styleName: string,
  geometry: GeometryParams,
  size?: number,                                                 // default 96
): Promise<ImageData | null>;                                    // cached per (styleId, geometryHash, size)
export function clearThumbnailCache(): void;                     // called when geometry hash changes (caller decides)
export const __cacheSize: () => number;                          // test hook
```

Rules: default style opts from the registry schema (each param's `default`); cache hit returns the same promise/ImageData without re-render; a null render result is NOT cached (retry allowed); no IndexedDB (Phase-2 deviation, recorded in header).

- [ ] **Step 1: verify** `LibraryDesign` shape + how DesignThumbnail invokes the renderer (read both files; note required fields — id/name/geometry/style/opts — and any snake_case).
- [ ] **Step 2: failing tests** — mock `ThumbnailRenderer.getInstance` (`vi.mock('../../../services/ThumbnailRenderer', ...)`) returning a stub whose `renderThumbnail` resolves a 1×1 ImageData and counts calls: two calls same (style, geometry) → 1 render; different geometry → 2; null result → not cached (second call re-renders); `geometryHash(DEFAULT_GEOMETRY)` stable and ≠ hash of modified geometry.
- [ ] **Step 3: implement, Step 4: pass** (`npx vitest run src/ui/v3/showroom`), **Step 5: commit** `feat(ui-v3): style thumbnail adapter over ThumbnailRenderer with in-memory cache`.

---

### Task 8: StyleThumb — lazy thumbnail tile

**Files:**
- Create: `src/ui/v3/showroom/StyleThumb.tsx`, `StyleThumb.css`, `StyleThumb.test.tsx`

**Interfaces:**
- Consumes: `getStyleThumbnail`; `sampleProfile` (silhouette fallback); IntersectionObserver (already mocked globally in `src/test/setup.ts`).
- Produces: `StyleThumb: React.FC<{ styleName: string; size?: number; selected?: boolean; onClick?: () => void; onHoverIntent?: () => void; onHoverEnd?: () => void; 'data-testid'?: string }>` — a button tile: canvas (putImageData on resolve) → until then / on null, a **quiet silhouette fallback** (tiny SVG generatrix from `sampleProfile` of the CURRENT geometry, gold at 0.35 opacity — never a "Preview unavailable" string, spec §4.4's whole point); style display name label; `selected` ring (gold border); 150ms hover-intent timer → `onHoverIntent` (cleared on leave/unmount → `onHoverEnd`); `data-pf3-focusable`.

- [ ] **Step 1: failing tests** — renders button with display-name label + fallback SVG immediately (mock `getStyleThumbnail` pending); resolves → a canvas appears (mock resolved ImageData; assert canvas element present); `selected` adds the ring class; fake timers: 150ms hover fires `onHoverIntent` once, leaving before 150ms fires nothing, leave after fires `onHoverEnd`.
- [ ] **Step 2: implement** (canvas ref + `getContext('2d')` guarded — setup.ts mocks it; putImageData in an effect after resolve; IO-gated fetch like DesignThumbnail but with the silhouette instead of an icon).
- [ ] **Step 3: pass, Step 4: commit** `feat(ui-v3): StyleThumb — lazy GPU thumbnail with silhouette fallback`.

---

### Task 9: Working set — favorites/recents + the StyleTab strip

**Files:**
- Create: `src/ui/v3/panel/workingSet.ts`, `workingSet.test.ts`
- Modify: `src/ui/v3/panel/StyleTab.tsx`, `StyleTab.test.tsx`, `PanelShell.css` (strip styles)

**Interfaces:**
- Produces (workingSet.ts, all via `safeStorage`, keys `pf3-favorites` / `pf3-recents`, JSON arrays of style names):

```ts
export function getFavorites(): string[];
export function toggleFavorite(name: string): string[];   // returns new list
export function isFavorite(name: string): boolean;
export function getRecents(): string[];                   // max 8, most recent first
export function pushRecent(name: string): string[];       // dedupes, caps at 8
```

- StyleTab changes (spec §7 surface 1): under the current-style card, a `Favorites & recent` label + horizontal strip of `StyleThumb`s (size 44): favorites first (♥ badge), then recents not already shown, max 8 tiles, then an `all →` tertiary Button (`data-testid="pf3-open-showroom"`) that dispatches `window` CustomEvent `'pf3:showroom'` (consumed in Task 10). Clicking a tile applies the style (`setStyle` + `pushRecent`). A ♥ toggle on the current-style card (`aria-pressed`) calls `toggleFavorite`. The native `<select>` from Phase 1 is REMOVED (the strip + showroom replace it — update the tests that referenced it; the store-write coverage moves to a tile-click test).

- [ ] **Step 1: failing tests** — workingSet: toggle on/off round-trip; pushRecent dedupe + cap 8; corrupted JSON in storage → empty list (safeStorage + try/catch on parse). StyleTab: strip renders after favoriting (♥ click) with the favorite first; tile click sets `style.name` in store and prepends to recents; `all →` dispatches `pf3:showroom` (spy on window listener).
- [ ] **Step 2: implement; Step 3: pass** (StyleTab suite reworked — the old select tests replaced deliberately, note it in the report), **Step 4: commit** `feat(ui-v3): style working set — favorites, recents, showroom launcher`.

---

### Task 10: ShowroomOverlay — the library

**Files:**
- Create: `src/ui/v3/showroom/ShowroomOverlay.tsx`, `ShowroomOverlay.css`, `ShowroomOverlay.test.tsx`
- Modify: `src/ui/v3/AppUIv3.tsx` (+test) — mount the overlay host

**Interfaces:**
- Consumes: `STYLE_REGISTRY`, `STYLE_CATEGORIES` (Task 1), `StyleThumb`, `workingSet`, style slice (`setStyle`), `safeStorage`.
- Produces: `ShowroomOverlay: React.FC` — self-hosting: listens for `'pf3:showroom'` to open; renders nothing when closed. Open state (spec §7 surface 2): fixed overlay at `--pf3-z-overlay`, dimmed backdrop (`rgba(10,8,6,0.8)`, click closes), GlassSurface panel: title "Style library" (display italic), search input (`.pf3-input`, autofocus, filters by name+tags case-insensitive), category chips (from `STYLE_CATEGORIES` + `♥ Mine`), grid of `StyleThumb` size 96 (all 20 styles, filtered), footer hint line "hover to preview on your pot · click to apply". Behaviors: click tile → `setStyle` + `pushRecent` + close; Escape closes; hover-intent → live-apply preview with revert-on-leave (see Step 1), gated by module flag `LIVE_PREVIEW = true`.

- [ ] **Step 1: verify `setStyle` semantics** — read `src/state/slices/style.ts`: what happens to `opts` on `setStyle(name)` (reset to defaults? preserved per style?). Decide revert safety: if switching styles destroys the prior style's custom opts, hover-preview must snapshot `{ name, opts }` before the first preview and restore BOTH on leave/close-without-click. Implement whichever restore the slice makes correct; record in report. If restore is impossible without data loss, set `LIVE_PREVIEW = false` (thumbnail-only, spec-sanctioned) and say so.
- [ ] **Step 2: failing tests** — closed by default; `pf3:showroom` event opens (panel role="dialog" aria-modal, title present); search "gothic" filters grid to GothicArches; category chip "Woven" shows only woven styles; `♥ Mine` shows favorites only; Escape closes; click tile applies + closes + pushes recent; hover-intent (fake timers) previews (store name changes) and mouseleave restores the prior `{name, opts}` snapshot — or, if Step 1 chose thumbnail-only, assert hover does NOT touch the store.
- [ ] **Step 3: implement** (focus: return focus to the `all →` launcher on close; `role="dialog"` + `aria-modal="true"`; keydown handler local to the overlay, not global). Mount `<ShowroomOverlay />` inside AppUIv3 (always mounted, zen-independent — it's an overlay, opens rarely; add to the AppUIv3 test: dispatching `pf3:showroom` renders the dialog).
- [ ] **Step 4: pass + full v3 gate, Step 5: commit** `feat(ui-v3): the Showroom — searchable style library with live preview`.

---

### Task 11: Certificate — the verification card

**Files:**
- Create: `src/ui/v3/panel/Certificate.tsx`, `Certificate.css`, `Certificate.test.tsx`
- Modify: `src/ui/v3/panel/ExportFooter.tsx`, `ExportFooter.test.tsx`

**Interfaces:**
- Consumes: `ParametricExportStats` + `ValidationSummary` types from `src/hooks/useParametricExport` / `src/renderers/webgpu/parametric/types` (types only — no hook changes).
- Produces: `Certificate: React.FC<{ filename: string; stats: ParametricExportStats }>` — spec §8.3 card: `{filename}.stl · {stats.fileSize}` header; checklist from `stats.validationSummary` when present: `✓/✗ watertight` (`manifoldOk`), `✓/✗ mesh valid` (`valid`), `✓ {triangleCount.toLocaleString()} triangles`, and when defined `✓ {p95PosErrorMm} mm p95 deviation`; ok rows in `--pf3-ok` mono, failed rows in `--pf3-error` with the first relevant `warnings[]` string as the repair note; subline "printable on any FDM/SLA slicer" only when `valid && manifoldOk`; a `full report ⌄` DisclosureSeam (id `certificate-report`) listing every remaining ValidationSummary boolean + numbers, quiet mono. No validationSummary → card renders header + triangles only (no fake checks).
- ExportFooter: on success, replace the 4s "Exported ✓" button text with the Certificate rendered above the CTA for 12s (then collapses back; new export resets the timer); pass the captured `stats` (the hook exposes it — capture at fire-resolution time so a late store change can't swap it).

- [ ] **Step 1: failing tests** — Certificate with a full mock stats: all four checks render ✓ with ok class; `manifoldOk: false` + warnings ["2 boundary edges at rim seam"] → ✗ row in error class + the warning text; no validationSummary → only header + triangles; seam expands to show `minAngleDeg`. ExportFooter: successful fire → certificate visible (mock hook's `stats`), gone after 12s (fake timers).
- [ ] **Step 2: implement, Step 3: pass, Step 4: commit** `feat(ui-v3): the Certificate — verification checklist after firing`.

---

### Task 12: Kiln log — metadata + re-fire

**Files:**
- Create: `src/ui/v3/panel/kilnLog.ts`, `kilnLog.test.ts`, `src/ui/v3/panel/KilnLog.tsx`, `KilnLog.test.tsx`
- Modify: `src/ui/v3/panel/ExportFooter.tsx` (+test) — record entries; `src/ui/v3/panel/ExportTab.tsx` (+test) — render the log

**Interfaces:**
- Produces (kilnLog.ts, key `pf3-kiln-log` via safeStorage, JSON):

```ts
export interface KilnEntry {
  filename: string; sizeLabel: string; triangles: number;
  fidelity: string;                    // active preset key at fire time ('custom' allowed)
  firedAt: number;                     // Date.now() at record time
  ok: boolean;                         // validationSummary?.valid !== false
}
export function recordFiring(e: KilnEntry): KilnEntry[];   // prepend, cap 10
export function getKilnLog(): KilnEntry[];
```

- `KilnLog: React.FC` — "Kiln log" section voice + up to 10 rows: `{filename}.stl · {sizeLabel} · {relative time}` mono, ok/✗ tint, and an "Export again" tertiary button per row (`aria-label="Export {filename} again"`) that: `setExportFilename(entry.filename)`, applies `setQualityPreset(entry.fidelity)` when not 'custom', then dispatches `'pf3:download'`. Empty state: "Nothing fired yet — your exports will appear here." Relative time: minutes/hours/days, computed from `firedAt` (inject `now` as a prop default `Date.now()` for testability).
- ExportFooter records `recordFiring` on success (alongside the certificate), with fidelity read the same way ExportTab derives `activeKey`.

- [ ] **Step 1: failing tests** — kilnLog: prepend+cap 10, corrupted JSON → []; KilnLog: empty state; 2 entries render with names+sizes; "Export again" sets filename in store, applies the preset, and dispatches `pf3:download` (window spy); ExportFooter: successful fire appends an entry (mock storage via real localStorage, assert `getKilnLog()[0].filename`).
- [ ] **Step 2: implement** (ExportTab renders `<KilnLog />` after the quota block), **Step 3: pass, Step 4: commit** `feat(ui-v3): kiln log — firing history with one-click re-fire`.

---

### Task 13: AccountChip — retiring the legacy header under v3

**Files:**
- Create: `src/ui/v3/stage/AccountChip.tsx`, `AccountChip.css`, `AccountChip.test.tsx`
- Modify: `src/App.tsx` (hide `.pf-app__header` when `uiTheme === 'v3'`), `src/ui/v3/AppUIv3.tsx` (+test) — mount the chip

**Interfaces:**
- Consumes: the EXISTING `AppSettingsButton` (`src/ui/settings`) and `UserMenu` (`src/ui/auth`) components — reused as-is (they own all auth/settings logic); GlassSurface.
- Produces: `AccountChip: React.FC` — top-right GlassSurface pill (`position: absolute; top: var(--pf3-space-lg); right: var(--pf3-space-lg); z-index: var(--pf3-z-toolbar); pointer-events: auto;`) hosting both components side by side, with pf3-scoped CSS overrides neutralizing their v1 look (`.pf3-account .pf-*` background/border overrides to transparent + pf3 text colors — override ONLY chrome, never behavior). Visible in zen (it's account access, like the toolbar).

- [ ] **Step 1: verify** the two components' root class names and any fixed positioning they carry (read both; UserMenu may position its own dropdown — confirm the dropdown still anchors correctly inside a positioned parent).
- [ ] **Step 2: failing tests** — AccountChip renders both children (mock Supabase-dependent internals if UserMenu requires config — check how existing UserMenu tests (if any) or AuthContext handle unconfigured mode: `isSupabaseConfigured()` false path renders a Login/disabled state, fine for jsdom); AppUIv3 renders the chip inside `.pf3-root` (also in zen: set zen, chip still present).
- [ ] **Step 3: App.tsx change** — wrap the `.pf-app__header` block: `{uiTheme !== 'v3' && (<div className="pf-app__header">…)}`. v1/v2 untouched.
- [ ] **Step 4: pass + full v3 gate, Step 5: commit** `feat(ui-v3): AccountChip — settings+auth in the v3 identity, legacy header retired under v3`.

---

### Task 14: View-pill extras + grid default migration

**Files:**
- Modify: `src/ui/v3/icons.tsx` (add `IconOrtho`, `IconGrid`, 16×16 same base), `src/ui/v3/stage/PillToolbar.tsx`, `PillToolbar.test.tsx`, `src/ui/v3/stage/useStudioBackdrop.ts`, `useStudioBackdrop.test.ts`

**Interfaces:**
- Consumes (all verified to exist in `ControllerContext.tsx:35-79`): `toggleProjection()`, `toggleGrid()`, `cameraState.showGrid`, plus `cameraState`'s projection field (verify its exact name — expected `projection: 'perspective' | 'ortho'` or similar — before asserting active states).
- Produces: View pill grows to 4 buttons: reset camera · auto-rotate · **ortho** (active when projection is ortho) · **grid** (active from `cameraState.showGrid`). Same PillButton pattern, aria-labels "Orthographic view" / "Grid". Grid migration in `useStudioBackdrop` (rename NOT allowed — extend in place): one-time flag `pf3-grid-migrated` via safeStorage; when unset and `cameraState.showGrid` is true and the controller is ready → `toggleGrid()` once, set flag. (User can re-enable via the new button; the flag never fires again.) Note: this effect now needs the controller — convert the hook to accept it or use `useControllerMaybe` inside; keep the backdrop logic untouched.

- [ ] **Step 1: verify** the projection field name in `CameraState` and that jsdom-safe null-controller renders stay no-op.
- [ ] **Step 2: failing tests** — PillToolbar: 8 buttons total, ortho/grid call the mocked controller actions, active classes derive from mocked cameraState; useStudioBackdrop: grid on + no flag → `toggleGrid` called once + flag set; flag present → not called; grid already off → not called but flag set.
- [ ] **Step 3: implement, Step 4: pass, Step 5: commit** `feat(ui-v3): ortho + grid controls; grid defaults off under the studio scene`.

---

### Task 15: ParamRow scrub — the promised instrument

**Files:**
- Modify: `src/ui/v3/primitives/ParamRow.tsx`, `ParamRow.css`, `ParamRow.test.tsx`

**Interfaces:**
- Produces (spec §5, completing the Phase-1 deferral): pointer-based scrubbing on the value chip that COEXISTS with the click-timer/double-click logic:
  - pointerdown on chip → capture (`setPointerCapture?.`), record `{startX, startValue, scrubbing: false}`.
  - pointermove with |dx| > 4px → enter scrub: fire `onInteractionStart` once, then per move `apply(startValue + Math.round(dx/3) * step, false)` (3px per step; Shift held → ×10 per step).
  - pointerup: if scrubbed → `onValueCommit`, and SUPPRESS the click that follows (flag consumed by the click handler so no edit-timer starts); if not scrubbed → existing click/double-click logic runs unchanged.
  - Escape during scrub → restore `startValue` (apply + commit) and end.
  - CSS: chip cursor back to `ew-resize` (the affordance is honest now); `title` becomes "Drag to scrub · click to type · double-click to reset".

- [ ] **Step 1: failing tests** (non-vacuous — full pointer sequences): down→move+30px→up fires onInteractionStart once, live onChange calls ending at startValue+10×step, onValueCommit once, and does NOT open the editor (no textbox after fake-timer advance); down→up with <4px move behaves exactly as before (timer click opens editor — existing tests stay green); Shift-scrub applies ×10 steps; scrub respects clamp at max.
- [ ] **Step 2: implement** (careful: the existing chip click handler must check-and-clear the scrub-suppression flag; keyboard nudge/dblclick/Enter/Escape paths untouched — all existing tests must pass unmodified except the cursor/title assertions if any).
- [ ] **Step 3: pass, Step 4: commit** `feat(ui-v3): ParamRow drag-to-scrub — spec §5 complete`.

---

### Task 16: ShortcutsDialogV3 (`?`) + F11

**Files:**
- Create: `src/ui/v3/shared/ShortcutsDialogV3.tsx`, `ShortcutsDialogV3.css`, `ShortcutsDialogV3.test.tsx`
- Modify: `src/ui/v3/AppUIv3.tsx` (+test) — `?` and F11 handling + mount

**Interfaces:**
- Consumes: the v2 pattern (`src/ui/v2/shared/ShortcutsDialog.tsx` — Radix Dialog is a dependency; reuse `@radix-ui/react-dialog` the same way) restyled with pf3 tokens (GlassSurface look, display-font title "Shortcuts", mono key chips).
- Produces: `ShortcutsDialogV3: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void }>` with the v3 list:

```
Z zen · D export STL · R reset camera · Alt+1/2/3 tabs ·
Ctrl/⌘+Z undo · Ctrl/⌘+Shift+Z / Ctrl/⌘+Y redo · ? shortcuts · F11 fullscreen ·
drag value = scrub · double-click value = reset
```

- AppUIv3 keyboard map additions: `?` (Shift+/ — check `e.key === '?'`) toggles the dialog (state local to AppUIv3); `F11` `preventDefault()` + `toggleFullscreen()` (store action — same as v1's F11 intercept). Both respect the input guard.

- [ ] **Step 1: failing tests** — dialog: open renders `role="dialog"` with title and at least the Z/D/R rows; onOpenChange(false) on Escape (Radix built-in — assert via close). AppUIv3: pressing `?` opens (dialog present), F11 flips `ui.fullscreen` in the store and the event default is prevented.
- [ ] **Step 2: implement, Step 3: pass + full v3 gate, Step 4: commit** `feat(ui-v3): shortcuts dialog + F11 — the keyboard map is discoverable`.

---

### Task 17: Entrance sequence + Phase-2 e2e + critique gate

**Files:**
- Create: `src/ui/v3/entrance.css`
- Modify: `src/ui/v3/AppUIv3.tsx` (+test), `e2e/ui-v3-smoke.spec.ts`

**Interfaces:**
- Produces (spec §3.3, CSS-only per header deviation): once per session (`safeStorage.getSession('pf3-entered')`), the root gets `data-entrance`; `entrance.css` staggers: panel `translateX(-16px)→0` + fade (dur `--pf3-dur-overlay`, ease `--pf3-ease-enter`, delay 0), toolbar `translateY(-8px)→0` (delay 120ms), AccountChip (delay 200ms), status+hint fade (delay 400ms) — total ≈ 700ms; flag set after mount so it never replays; `prefers-reduced-motion` collapses everything via the existing token override (durations already 0.01ms — verify no `animation` bypasses the media query).

- [ ] **Step 1: failing tests** — first mount (no session flag): root has `data-entrance` and the flag becomes set; second mount: no attribute.
- [ ] **Step 2: implement.**
- [ ] **Step 3: extend the e2e** (`e2e/ui-v3-smoke.spec.ts`, same describe): new tests — Blueprint visible in Shape tab and dragging the rim handle changes the stored `top_od` (mouse.down/move/up on the handle's bounding box); `all →` opens the showroom, category chip filters, clicking a tile applies (store style name changes) and closes; `?` opens the shortcuts dialog; grid/ortho buttons present; entrance attribute present on first load and absent after reload (sessionStorage persists per context — assert within one page: reload and re-check). Screenshots: re-capture `pf3-shape.png` / `pf3-style.png` / `pf3-export.png` + new `pf3-showroom.png`.
- [ ] **Step 4: run** — dev server running, `npx playwright test e2e/ui-v3-smoke.spec.ts --project=chromium` all green; `npx vitest run src/ui/v3 src/state src/styles` green; typecheck no new errors.
- [ ] **Step 5: the screenshot critique gate (exit gate — do not skip):** view all four PNGs against `docs/superpowers/specs/2026-07-02-ui-v3-mocks/` (`layout-v2-stage-refined.html`, `style-browser-v2-hybrid.html`, `signature-element.html`): Blueprint reads as a technical drawing (gold curve, ticks, quiet); showroom reads as a library (grid breathes, chips quiet, search prominent); certificate/kiln log in the Export tab read as verification, not log spam; gold still only on actionables; "remove one accessory" pass. Record findings in the commit body.
- [ ] **Step 6: commit** `feat(ui-v3): entrance sequence + Phase-2 e2e — the soul is in`.

---

## Plan Self-Review (completed at write time)

- **Spec coverage (Phase-2 scope):** Blueprint §6 → Tasks 3–6 (bidirectional exit gate in Task 5's tests + e2e drag); two-surface style system §7 → Tasks 1, 7–10 (working set never grows: ≤8 strip; showroom absorbs scale; favorites bridge; hover live-apply w/ sanctioned fallback); certificate + kiln log §8.3 → Tasks 11–12 (blob-cache deviation recorded in header); entrance §3.3 → Task 17 (CSS-only deviation recorded); inherited Phase-1 deferrals → scrub Task 15, `?`/F11 Task 16, View-pill extras + grid Task 14, account chip Task 13. "Showroom smooth at 100 styles" exit gate: covered by lazy IO tiles + in-memory cache + the e2e; a synthetic 100-style stress test is NOT included — the registry has 20 real styles and synthesizing fakes would mock the exact GPU path under test; the gate is deferred to the content expansion (recorded here explicitly).
- **Placeholder scan:** verify-first steps (1.1, 3.1, 7.1, 10.1, 13.1, 14.1) each name the expected finding and the fallback action. No TBDs.
- **Type consistency:** `safeStorage` (Task 2) consumed by Tasks 9/12/14/17; `sampleProfile`/`ProfileGeometry` (Task 3) consumed by 4/8; `getStyleThumbnail` (7) by 8; `StyleThumb` (8) by 9/10; `STYLE_CATEGORIES` (1) by 10; `KilnEntry.fidelity` aligns with ExportTab's `activeKey` union including `'custom'`; Certificate consumes hook types read-only.
- **Not-in-scope reminder:** High/Ultra preset differentiation is a mesh-slice/product change awaiting Patryk's decision — deliberately excluded; one line in ExportTab would not change.

## Exit gate for Phase 2

All 17 tasks committed; unit + e2e + typecheck + lint green; the four critique screenshots reviewed against the mocks with findings recorded; Blueprint bidirectionality proven in tests AND e2e; deviations (kiln blob, IndexedDB, live-preview fallback if taken, entrance pot-rise, 100-style stress) all recorded in this header. Then: Phase 3 (mobile UX cycle, on-device) or the High/Ultra product decision.


