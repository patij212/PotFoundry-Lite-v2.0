# PotFoundry UI v3 — "Studio at Dusk" Redesign

**Date:** 2026-07-02
**Status:** Approved design, pre-implementation
**Mocks:** `./2026-07-02-ui-v3-mocks/` (HTML fragments from the brainstorm companion + baseline screenshots of current v1/v2)

## 1. Problem

Both existing UI shells read as amateur work despite a strong engine underneath:

- **v1 (classic):** dense dark sidebar, indigo accent, navy blueprint-grid scene, cramped rows.
- **v2 (editorial):** good token DNA (Fraunces + Inter + muted gold) betrayed by execution — a flat strip of ~15 undifferentiated icon buttons, "Preview unavailable" preset placeholders, truncated labels, cryptic status glyphs (`△0 ⬡0`), a cool navy scene fighting the warm UI, mobile toolbar overlapping the gizmo, cut-off download CTA.

Baseline screenshots: `ui-current-desktop-default.png` (v1), `ui-current-desktop-v2*.png`, `ui-current-mobile-v2.png`.

Goal: a UI that feels like a professional, award-caliber product — beautiful, modern, easy for newcomers, fully capable for advanced users.

## 2. Decisions log (all confirmed with the owner)

| Decision | Choice |
|---|---|
| Identity | **Craft studio** — warm gallery feel, pottery-as-craft, matured from v2 DNA |
| Build strategy | **Fresh v3 shell** in `src/ui/v3/`, behind the existing `uiTheme` toggle; v1/v2 retired after parity |
| Platform priority | **Desktop-first**; mobile is a first-class companion with its own later UX cycle |
| Complexity model | **Inline disclosure** — one workspace, no modes; per-section "advanced" seams |
| Workspace layout | **The Stage** — full-bleed viewport, floating glass panel, grouped pill toolbar |
| Style browsing | **Two-surface hybrid** — panel working set + showroom library (designed for 100+ styles) |
| Signature element | **The Living Blueprint** — live technical cross-section, bidirectional (leads); potter's-wheel inertia may follow later, subordinated |
| Themes | **Dark ("Studio at Dusk") ships first**; Daylight (light) is specced in tokens from day one, ships fast-follow |
| Export | Complete 3-state flow: configure → firing → certificate + kiln log |
| Mobile | Five touch rules as foundation; **dedicated on-device UX cycle in Phase 3** (static mocks can't validate gestures) |

## 3. Design language — "Studio at Dusk"

Mock: `design-language.html`.

### 3.1 Color

Dark (default):

- Stage backdrop: radial gradient `#131009 → #0e0b08` (warm brown-black, replaces navy grid)
- Glass panel: `rgba(28,23,18,0.88)` + `blur(12px)` + 1px border `rgba(245,240,232,0.09)`
- Elevated surfaces: `#2a2119`
- Text: primary `#f5f0e8`, secondary `#a8a29e`, muted `#7a756f`
- Gold (action): `#cfa967 → #b4975a` gradient
- Status (desaturated to stay in the craft mood): ok `#7fa886`, warn `#d4a94c`, error `#c9706a`

Daylight (light): surface `#f4efe6`, panel `#fffdf8`, gold `#8a6d4a` (AA on cream). Both themes expressed as `--pf3-*` tokens from day one.

**The gold rule (hard discipline):** gold appears **only on things you can do** — primary CTA, active tab, slider thumbs/fill, focus ring, interactive blueprint curve. Never decoration. One primary (gold) action per screen.

### 3.2 Typography — three voices, one job each

- **Fraunces** 400 (variable, optical sizing): wordmark + dialog titles
- **Fraunces italic** 400: the "section voice" — Size · Profile · Ornament · Fidelity
- **Inter** 400/500/600: labels, buttons, body
- **IBM Plex Mono** 400/500: **every number in the app**, with `font-variant-numeric: tabular-nums` and fixed-width value fields so values never jitter while scrubbing

Labels never truncate; layouts reserve space for the longest label.

### 3.3 Motion

- Keep v2's easing family: enter `cubic-bezier(.16,1,.3,1)`, move ("clay on wheel") `cubic-bezier(.22,.61,.36,1)`. **Drop the overshoot spring** on large surfaces (mobile sheet lurch).
- Durations: 120 ms (controls) · 200 ms (panels) · 320 ms (showroom/dialogs).
- **One orchestrated moment:** a once-per-session entrance (~700 ms): stage light warms → pot rises/fades in → panel settles. Everything else is functional.
- `prefers-reduced-motion`: all animation collapses to instant.

### 3.4 Depth

Two shadow levels only: *float* (panel, toolbar, chips) and *overlay* (showroom, dialogs). Glass treatment reserved for panel/toolbar/chips.

## 4. Workspace — The Stage

Mocks: `layout.html` (options considered), `layout-v2-stage-refined.html` (approved, with the 8 numbered improvements).

Full-bleed 3D viewport; the pot is the hero. Composition:

1. **Grouped pill toolbar** (top-center): three pills — History (undo/redo) · View (orbit presets, ortho, grid, reset) · Scene (auto-rotate, zen, fullscreen) — hover labels, one icon family on a strict grid. Replaces the 15-icon strip.
2. **Floating glass panel** (left, resizable ~300–480 px): wordmark → segmented tabs (Shape / Style / Export) → tab content → sticky export footer.
3. **Panel voice:** Fraunces-italic section headings, essentials first; gold mono values right-aligned.
4. **Preset shelf** ("Start from"): horizontal strip at the top of Shape tab with **real GPU-rendered thumbnails** (universal-shader thumbnail pipeline already exists). Kills "Preview unavailable". *Presets are complete designs (dimensions + style + appearance); not to be confused with the Style tab's style browsing (§7), which changes only the surface pattern.*
5. **The scene is part of the design:** warm backdrop gradient + soft elliptical pedestal shadow under the pot. The renderer's clear color/environment must be theme-controlled (the one place v3 reaches below the UI layer).
6. **Sticky export footer** (always visible in every tab): quality tier + live triangle/file estimate + gold CTA.
7. **Humane status** (bottom-left, quiet mono): `24,412 triangles · 0.20 mm detail · WebGPU`. Axis gizmo docked bottom-right.
8. **Whispered onboarding:** one italic hint line on the stage ("Drag to orbit · pick a starting point on the left") + first-run glow on the preset shelf. Replaces the white welcome card. Zen mode (Z) fades everything but the pot.

Account chip top-right (avatar + tier). Compatibility-mode badge restyled into the same token system.

## 5. Controls — the ParamRow

The app's most repeated element (~40 instances), one primitive:

- Label (Inter 500, never truncates) — value (gold mono) — slider beneath.
- The **value is an input**: click to type, drag to scrub, double-click resets to default. Arrow keys nudge (Shift = ×10).
- **Disclosure seam** per section: hairline + `⌄ advanced — wall, drain, bell, spin` (names its contents). Expands inline; expanded state persists per user.
- Button hierarchy: primary (gold, one per screen) / secondary (outlined) / tertiary (chromeless).

## 6. Signature — The Living Blueprint

Mock: `signature-element.html` (option A, approved over the potter's-wheel).

A live technical cross-section of the pot at the top of the Shape tab, drawn like a vessel study on a craftsman's bench:

- Gold generatrix curve (outer profile), fainter inner line showing wall thickness, dashed centerline, real dimension ticks (⌀ top, height) in mono.
- **Bidirectional:** sliders move the drawing; dragging handles on the curve moves the sliders (dispatches `setGeometryParam`). Computed from geometry state (same math as `profile.ts`), rendered as SVG.
- Compresses on mobile to a strip with 28 px touch handles — never disappears.
- This is where all boldness is spent; everything around it stays quiet. Also serves as the app's screenshot identity.

## 7. Style system — two surfaces for 100+ styles

Mocks: `style-browser.html` (options), `style-browser-v2-hybrid.html` (approved).

- **Surface 1 — panel working set (never grows):** current style card (name, category, param count) + favorites/recents shelf (≤8 thumbs) + "all →" + search field + the current style's parameters with advanced seam.
- **Surface 2 — showroom library (absorbs all scale):** semi-transparent overlay; category chips (All / Organic / Geometric / Woven / Architectural / ♥ Mine), search-as-you-type, lazy grid. **Hover (desktop) / press-and-hold (mobile) live-applies the style to the real pot** visible behind the overlay; click applies & returns.
- **Favorites (♥) bridge the surfaces.**
- Data: `STYLE_REGISTRY` gains `category` + `tags`; favorites/recents persisted.
- Thumbnails: GPU-rendered per current pot dimensions, cached in IndexedDB keyed by (style, geometry hash); rendered lazily.

## 8. Export — configure → fire → certificate

Mocks: `export-and-mobile.html` (v1), `export-and-mobile-v2.html` (approved rework).

### 8.1 Configure

- **All four existing tiers stay** (they map to real mesh presets), renamed by purpose: Draft *(quick look)* / Standard *(everyday prints)* / High *(print-ready · 0.20 mm — default)* / Ultra *(exhibition · 0.05 mm)*. Each row shows honest numbers: ≈ triangles, est. file size, est. time.
- Ultra wears a **PRO chip** (free tier resolution cap).
- Editable **filename** pre-filled from design (`blossom-vase-120.stl`); extension follows format.
- Format segmented control STL / 3MF / OBJ with a fact note ("3MF is ~80% smaller").
- Advanced seam: mesher pipeline choice, resolution, decimation.
- **Quota arc:** free-tier exports left shown as a quiet gold arc + text, always visible. Never a surprise.

### 8.2 Firing

Cancellable progress using the pipeline's **real stages** as a live checklist: ✓ mesh shaped (tri count) → ● verify watertight → ○ write file; est. time remaining; pot glyph warms raw clay → terracotta.

### 8.3 Certificate + kiln log

- **Certificate card** on success: filename + size; verification checklist from data the pipeline already computes (✓ watertight ✓ manifold ✓ triangles ✓ max deviation); "printable on any FDM/SLA slicer"; expandable full report.
- Actions: Download again · one-tap re-export as 3MF · Save design.
- **Kiln log:** last 10 exports (localStorage) with re-download without re-firing.
- **Failure = repair note:** the failed check names its cause and a concrete fix ("2 boundary edges at rim seam — lower Ultra to High").

### 8.4 Gating (dignified)

At quota 0 or gated tier: the CTA becomes "Continue with Pro — unlimited exports & Ultra fidelity" + "not now" (falls back to High). PricingModal opens only on click-through. No mid-flow slap-modals.

## 9. Mobile — five rules + a dedicated UX cycle

Mock: `export-and-mobile-v2.html` (portrait anatomy). **Owner's caveat: mobile needs further UX work — Phase 3 is a dedicated on-device design/prototype cycle. The five rules below are the approved foundation, not the final word.**

1. **Tabs + Export CTA at the sheet's bottom** (thumb arc); top of phone holds only brand + account.
2. **Fat parameter instruments:** 52 px rows — whole row drags (fill shows position), ± steppers, tap value for keypad, haptic detents at defaults/limits (Vibration API hook exists).
3. **Camera cooperates with the sheet:** each stop (peek / half / full) reframes the pot into the visible stage area. Fixes the clipped-pot problem (round-25 critique C1).
4. **Stage controls float bottom-left at thumb height** (camera reset, undo); two-finger twist orbits; double-tap recenters. No icon toolbar on mobile.
5. **Landscape = right-side panel (~40%)**; showroom full-screen with press-and-hold live preview.

Engineering constraints carried from the round-25 critique: sheet drag via transforms + refs (no React state per touchmove — C3), listeners attached only during active drag (C4), no `console.log` in gesture code (C5), no overshoot easing on the sheet, safe-area insets, ≥44 px targets.

## 10. Copy & voice

- Active verbs; a control says what happens: "Export STL", not "Submit".
- The same word for the same action through a flow: Export → "Exported".
- Errors: what happened + what to do, in the interface's voice; never vague, never apologetic.
- Empty states are invitations to act. Sentence case everywhere. Numbers with units (`120 mm`, `4.1 MB`).
- Vocabulary from the craft where it aids understanding (firing, kiln log, certificate) — never at the cost of clarity (tabs stay Shape/Style/Export).

## 11. Quality floor (unannounced, non-negotiable)

- Designed focus ring (gold halo) on every interactive element; full keyboard map (existing shortcuts preserved: Z, D, R, F11, Alt+1/2/3, Ctrl+Z/Y, ?).
- AA contrast verified for both themes; `forced-colors` support kept.
- `prefers-reduced-motion` respected everywhere.
- One icon family, one grid.
- Skeletons shaped like the real layout; designed error/empty states.
- Screen-reader announcements for async results (announcer pattern exists in v2 — carry it over).
- Responsive to 360 px.

## 12. Architecture

```
src/ui/v3/
  AppUIv3.tsx            # root: theme sync, keyboard map, error boundaries
  tokens.css             # --pf3-* (dark + light), z-index scale
  motion.css  fonts.css
  primitives/            # ParamRow, DisclosureSeam, SegmentedControl,
                         # GlassSurface, Button, Dialog, Toast
  stage/                 # PillToolbar, StatusLine, HintLine, GizmoDock,
                         # StageScene (theme → renderer backdrop/pedestal)
  blueprint/             # BlueprintCanvas (SVG section, drag handles)
  panel/                 # PanelShell, ShapeTab, StyleTab, ExportTab
  showroom/              # ShowroomOverlay, thumbnailService (GPU + IndexedDB)
  export/                # FiringProgress, Certificate, KilnLog
  mobile/                # SheetShell, TouchParamRow, MobileTabBar
```

- Lazy-loaded via `React.lazy` like v2; `uiTheme` gains `'v3'`; v1/v2 users pay zero bundle cost.
- Zustand slices reused; additions: `ui.v3ActiveTab`, persisted style favorites/recents, kiln log (localStorage util, not a slice).
- Registry: `category` + `tags` fields (additive, IDs untouched — style IDs are permanent).
- Renderer touchpoints (only two): themable stage environment (clear color / backdrop / pedestal shadow) and a camera-reframe call for mobile sheet states. Thumbnail rendering reuses the existing universal-WGSL path.
- E2E: stable `data-pf3-*` selectors from the start; existing v1/v2 e2e stays green while the flag is off.

## 13. Rollout

| Phase | Contents | Exit gate |
|---|---|---|
| 1 — Desktop core | tokens, primitives, stage, panel, Shape/Style tabs, basic export | v3 selectable in settings; screenshot critique vs mocks |
| 2 — The soul | Blueprint, showroom, certificate + kiln log, entrance sequence | signature works bidirectionally; showroom smooth at 100 styles (synthetic) |
| 3 — Mobile UX cycle | dedicated on-device design + prototype pass; sheet, touch rows, camera coordination | gesture QA on real devices |
| 4 — Default flip | v3 default; v1/v2 deprecated → removed | e2e migrated; no regressions week-over-week |

Every milestone ends with a screenshot self-critique against this spec ("remove one accessory"). A lint-level rule keeps `--pf2-`/`--pf-` tokens out of `src/ui/v3/`.

## 14. Out of scope

- Engine/export-pipeline changes (only consumes existing APIs + diagnostics).
- Auth/pricing backend; PricingModal internals (restyled shell only).
- New styles/content (the redesign only prepares the browsing scale for them).
- Debug console redesign (keeps working as-is behind its flag).

## 15. Risks

- **Blueprint drag ↔ param coupling** (inverse mapping from curve handle to param) — mitigate: handles map 1:1 to named params (height, diameters, bell), not free-form curve editing.
- **Thumbnail rendering cost** at 100+ styles — mitigate: lazy + IndexedDB cache + geometry-hash invalidation.
- **Hover live-apply in showroom** requires per-style pipeline compile — mitigate: 150 ms hover intent delay + pipeline cache (SceneManager already caches per style ID); fall back to thumbnail-only if compile stalls.
- **Scene theming** touches renderer code — smallest possible surface: clear color + backdrop uniforms behind one controller call.
