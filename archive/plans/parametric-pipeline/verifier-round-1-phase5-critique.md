# Verifier Round 1 — Critique of Phase 5: Responsive, Theme & Polish

Date: 2026-03-06

---

## Summary Verdict: ACCEPT WITH AMENDMENTS

The proposal is well-structured, correctly identifies the three gaps, and proposes reasonable CSS-first solutions. However, it contains **2 CRITICAL**, **5 WARNING**, and **4 NOTE** issues. The most severe: the light-theme accent color `#92782e` has a WCAG contrast ratio of **4.00:1** on `#faf8f5` — not the claimed 4.8:1 — failing AA for normal text. This contaminates the primary button, tab indicators, slider ranges, and focus rings. The warning color also fails. Additionally, the universal touch target expansion to 44px conflicts with the toolbar's mobile layout (10+ buttons × 44px = 440px+, overflowing a 375px viewport).

All issues are fixable without redesigning the approach. The overall architecture (CSS attribute selectors for theme, media queries for responsive, Radix Dialog for shortcuts) is sound.

---

## Feature 1: Responsive Breakpoints

### Verified Claims ✅

1. **CSS `!important` overrides inline styles** — Confirmed per CSS cascade specification. `width: 100% !important` in a media query beats the React inline `style={{ width: '380px' }}` because `!important` always wins over non-`!important`, regardless of specificity. ✅

2. **`max-height: 70dvh` arithmetic** — At iPhone SE (667px), 70dvh = 467px. Generator's calculation: header ~56px + tabs ~44px + footer ~80px = 180px, leaving 287px for content. I verified against `SidebarV2.css` and `StatusFooter.css`: header padding = `24px + 16px + ~28px_h2 = ~68px`, tab-list ~44px, footer = `16px_pad + 12px_gap + ~48px_content + 16px_pad ≈ 92px`. That's ~204px of chrome, leaving ~263px for content. Tighter than claimed but sufficient for scrollable content. ✅

3. **Hiding resize handle via CSS has no JS side effects** — Confirmed. `SidebarV2.tsx` lines 71-72: the resize listeners only attach when `isResizing === true`, and `isResizing` is set via `handleResizeStart` which requires `onMouseDown` on the handle. Hidden handle = no mousedown = no side effects. ✅

4. **Bottom sheet without swipe-down gesture is acceptable for v1** — No objection. Users can close via the X button or `panelOpen` toggle. Swipe-to-dismiss is a progressive enhancement. ✅

5. **Toolbar button CSS class names are correct** — Verified against `ButtonV2.tsx` and `ButtonV2.css`:
   - `pf2-icon-button--sm` ✅ (ButtonV2.css line 191, used via `size="sm"` in ToolbarV2.tsx)
   - `pf2-button--sm`, `pf2-button--md` ✅ (ButtonV2.css lines 47, 52)
   - `pf2-slider__thumb` ✅ (SliderV2.css line 138)
   - `pf2-slider__root` ✅ (SliderV2.css line 110)

6. **`pf2-sheet-up` keyframe added to `motion.css`** — Correct placement. The motion.css file is imported by AppUIv2.css (line 18) which is the global CSS entry point. All components see it. ✅

### Issues Found ⚠️

#### C1 [CRITICAL]: Touch target expansion breaks toolbar on mobile

**Generator's claim**: All `.pf2-icon-button--sm` should become 44×44px on mobile via a universal media query in `ButtonV2.css`.

**Actual behavior**: The toolbar (`ToolbarV2.tsx` lines 183-286) renders approximately 10-11 icon buttons (`Menu`, `SlidersHorizontal`, `RotateCcw`, `RefreshCw`, `Camera`, `BookOpen`, `Save`, `FolderOpen`, `HelpCircle`, `Maximize`, `Shrink`), all with `size="sm"`. With dividers and gaps:

```
10 buttons × 44px + 3 dividers × (1px + 2×4px) + ~9 gaps × 2px = 440 + 27 + 18 = 485px
```

On iPhone (375px viewport), the toolbar has `max-width: calc(100vw - 16px) = 359px`. The content overflows by ~126px. Users cannot reach the rightmost buttons (Help, Fullscreen, Zen).

**Counterexample**: iPhone 14 (390px), portrait. User cannot access Help or Zen mode buttons — they're clipped beyond the viewport edge.

**Required fix**: Exclude toolbar buttons from the 44px expansion OR use invisible hit-area expansion (like the existing slider thumb `::before { inset: -8px }` pattern):

```css
@media (max-width: 768px) {
  .pf2-icon-button--sm {
    width: 44px;
    height: 44px;
  }
  /* Toolbar buttons: keep visual size small, expand hit area */
  .pf2-toolbar .pf2-icon-button--sm {
    width: 36px;
    height: 36px;
    position: relative;
  }
  .pf2-toolbar .pf2-icon-button::before {
    content: '';
    position: absolute;
    inset: -4px; /* Expands hit area to 44px without visual growth */
  }
}
```

#### C5 [WARNING]: Missing SelectV2 touch targets

**Generator's claim**: Touch target overrides are added for ButtonV2 and SliderV2.

**Actual behavior**: `SelectV2.css` has `.pf2-select__trigger { height: 36px }` (line 37). On mobile, this is below the 44px WCAG 2.5.8 minimum. The select trigger is used in StyleTab (style selector) and ExportTab (format selector) — both appear inside the mobile bottom sheet where touch targets matter most.

**Counterexample**: User tries to tap the style dropdown on iPhone SE. The 36px trigger is 18% smaller than the recommended touch target.

**Required fix**: Add to the mobile media query additions:
```css
@media (max-width: 768px) {
  .pf2-select__trigger { height: 44px; }
}
```

#### C6 [WARNING]: Missing SectionV2 touch targets

**Generator's claim**: (Not addressed)

**Actual behavior**: `SectionV2.css` has `.pf2-section__trigger` with `padding: var(--pf2-space-md) var(--pf2-space-lg)` (12px 16px). The rendered height depends on content (~36-40px). On mobile, collapsible section headers should have `min-height: 44px`.

**Required fix**: Add:
```css
@media (max-width: 768px) {
  .pf2-section__trigger { min-height: 44px; }
}
```

#### C7 [NOTE]: `data-viewport` attribute adds no value in this proposal

**Generator's claim**: "A viewport tier data attribute for JS-conditional behavior" — but proposes zero JS-conditional behavior in this phase. All responsive handling is CSS `@media` queries.

**Assessment**: The attribute is harmless (~20 lines of JS including the resize listener) but adds complexity for zero current benefit. The Generator acknowledges this: "the primary mechanism is `@media` queries."

**Recommendation**: Defer to Phase 5.1 if a JS-conditional need arises. For now, it's dead code. Not blocking.

#### C8 [NOTE]: Pre-existing width collapse risk on viewport rotation

**Observation**: `SidebarV2.tsx`'s `handleWindowResize` constrains width to `getMaxWidth()`, which at 375px returns `min(480, 169) = 169px`. If the user rotates to portrait and back, the saved width could permanently drop below MIN_WIDTH. This is a pre-existing issue (not introduced by this proposal) but the bottom sheet pattern makes mobile rotation more common.

**Recommendation**: Not blocking. Flag for future — the fix is to preserve "desktop width" separately or skip width constraint when viewport is mobile.

---

## Feature 2: Light Theme

### Verified Claims ✅

1. **Token override specificity** — `.pf2-root[data-theme="light"]` (specificity 0,2,0) beats `:root` (specificity 0,0,1). All token overrides will correctly win. ✅

2. **Glass/translucent surfaces correctly identified** — Generator found the 4 main hardcoded `rgba()` backgrounds:
   - `SidebarV2.css`: `rgba(15, 15, 18, 0.96)` ✅
   - `ToolbarV2.css`: `rgba(15, 15, 18, 0.85)` ✅
   - `CameraPopover.css`: `rgba(30, 30, 36, 0.92)` (in `@supports`) ✅
   - `LibraryDrawer.css`: `rgba(0, 0, 0, 0.7)` (overlay) ✅

3. **HelpDialog export is named** — `export function HelpDialog(...)` at `src/ui/shared/HelpDialog.tsx` line 115. The import `import { HelpDialog } from '...'` is a named import, confirming drop-in replacement will work. ✅

4. **`@radix-ui/react-dialog` is installed** — `package.json` line 25: `"@radix-ui/react-dialog": "^1.1.15"`. No new dependency needed. ✅

5. **`localStorage` try/catch for private mode** — Correct safeguard. Firefox strict mode and Safari private mode throw on `localStorage.setItem()`. The fallback to 'system' is sensible. ✅

6. **High contrast (`forced-colors: active`) support needs no changes** — Confirmed. Existing high contrast blocks use system colors (`Canvas`, `ButtonText`, `Highlight`) which are theme-agnostic. ✅

7. **Text-primary contrast** — `#1c1917` on `#faf8f5` = **16.50:1**. Generator claimed 16.2:1. Actual is slightly better. AAA. ✅

8. **Text-secondary contrast** — `#57534e` on `#faf8f5` = **7.20:1**. Generator claimed 6.1:1. Actual is significantly better than claimed. AAA. ✅

9. **Error contrast** — `#b91c1c` on `#faf8f5` = **6.10:1**. Generator claimed 5.2:1. Actual is better. AA. ✅

10. **Success contrast** — `#3d7a47` on `#faf8f5` = **4.86:1**. Generator claimed 4.7:1. Actual is slightly better. AA. ✅

### Issues Found ⚠️

#### C2 [CRITICAL]: Accent color `#92782e` fails WCAG AA (4.00:1, not 4.8:1)

**Generator's claim**: "#92782e — darkened gold — 4.8:1 on base"

**Actual contrast ratio**: Computed via WCAG 2.1 relative luminance formula:

| Color | Hex | Luminance | Ratio on #faf8f5 | AA Normal | AA Large |
|-------|-----|-----------|------------------|-----------|----------|
| bg-base | #faf8f5 | 0.94051 | — | — | — |
| accent | #92782e | 0.19741 | **4.00:1** | **FAIL** | PASS |
| accent-hover | #7a6526 | 0.13585 | **5.33:1** | PASS | PASS |

**The Generator's number (4.8:1) is wrong by 20%.** This is not a rounding error — it's a qualitatively different result. 4.0:1 is clearly below the 4.5:1 AA threshold for normal text.

**Impact**: The accent color is used everywhere:
- Tab indicators (`border-bottom-color: var(--pf2-accent)`)
- Focus rings (`box-shadow: 0 0 0 4px var(--pf2-accent)`)
- Slider ranges (`background: var(--pf2-accent)`)
- Progress bars, status spinners, link indicators
- Primary button background

**Counterexample**: A `<kbd>` element in the ShortcutsDialog uses `color: var(--pf2-accent)` at 13px font size. On the light background, this gold text has 4.0:1 contrast — fails AA for normal text. Users with moderate vision impairment may struggle to read shortcut keys.

**Required fix**: Darken the accent to achieve ≥4.5:1. The Generator's own `accent-hover` value `#7a6526` gives 5.33:1 and maintains the gold family. Proposed replacement:

```css
--pf2-accent:       #7a6526;  /* 5.33:1 on base — AA compliant */
--pf2-accent-hover: #695518;  /* darker for hover */
```

Alternatively, darken less aggressively — `#876e28` should hit ~4.5:1 (the Generator should compute the exact hex).

#### C3 [WARNING]: Warning color `#92700e` fails AA normal text (4.36:1, not 4.5:1)

**Generator's claim**: "#92700e — darkened — 4.5:1"

**Actual contrast ratio**: **4.36:1** — below the 4.5:1 threshold for AA normal text.

**Severity lowered to WARNING** because: the warning color is used sparingly (export warnings) and typically in larger text contexts. However, if used in 11-12px body text, it fails.

**Required fix**: Generator already proposed the alternative: `#7d6009` → **5.58:1**. Use this instead.

#### C4 [WARNING]: Primary button contrast fails in light theme (4.00:1)

**Generator's claim**: "The primary button has light text on a dark-ish gold background. `#faf8f5` foreground, `#92782e` background → contrast ratio ≈ 4.8:1. This passes AA for normal text. ✓"

**Actual contrast ratio**: **4.00:1** (symmetric with C2). The Generator convinced itself this was 4.8:1 through the same incorrect calculation.

**Impact**: The "Export STL" button in ExportTab uses `variant="primary"` — gold background with `var(--pf2-bg-base)` text. At 14px, this is normal text. 4.0:1 fails AA.

**Required fix**: This is automatically resolved by fixing C2 (darkening the accent). If accent becomes `#7a6526`, button background = `#7a6526` with text = `#faf8f5` → 5.33:1 ✅. Alternatively, add an explicit light-theme override for primary button text to use a high-contrast color.

#### C9 [WARNING]: Missed hardcoded `rgba()` values in SliderV2 and CameraPopover

**Generator's claim (Assumption 5)**: "I identified four [glass surfaces]: sidebar, toolbar, camera popover, library overlay. If I missed any, the Verifier should flag them."

**Missed overrides**:

1. **SliderV2.css lines 157-158**: `.pf2-slider__thumb:hover { box-shadow: 0 0 0 4px rgba(180, 151, 90, 0.3) }` — Uses dark-theme gold RGB (180,151,90 = #b4975a). In light theme, this glow should use the light accent color.

2. **SliderV2.css lines 164-165**: `.pf2-slider__thumb:active { box-shadow: 0 0 0 8px rgba(180, 151, 90, 0.2) }` — Same issue.

3. **CameraPopover.css line 25** (inside `@supports backdrop-filter`): `background: rgba(30, 30, 36, 0.92)` — The Generator provided a light override for the non-`@supports` block but the `@supports` block *also* uses a dark-only hardcoded color. The Generator's CameraPopover override uses a *separate* `@supports` block for light, which is correct — but need to verify both override paths are covered.

4. **ButtonV2.css line 205**: `.pf2-icon-button--danger:hover { background: rgba(184, 92, 92, 0.15) }` — Minor, uses dark error RGB.

5. **StatusFooter.css lines 174-175**: `.pf2-status-footer__error { background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2) }` — Uses hardcoded red, but this actually works in both themes (red-tinted background on any surface). Low priority.

**Required fix**: At minimum, add light overrides for SliderV2 thumb glow (items 1-2). The glow color should reference the light-theme accent. Items 3-5 are lower priority — they work visually but use dark-theme color values.

#### C10 [WARNING]: `@media not (forced-colors: active)` wrapping is inconsistent

**Generator's proposal**: Wraps light-theme glass overrides in `@media not (forced-colors: active)`.

**Current behavior**: The existing dark-theme glass (`SidebarV2.css` line 14: `background: rgba(15, 15, 18, 0.96)`) is **NOT** wrapped in `@media not (forced-colors: active)`.

**Assessment**: The `forced-colors: active` media query blocks in each file already set `background: Canvas` which overrides the rgba. So the unwrapped dark glass is already handled. But the inconsistency is confusing — dark glass is unwrapped, light glass is wrapped. Future maintainers may wonder why.

**Recommendation**: Keep the wrapping for light (it's correct and explicit), but add a comment explaining the asymmetry. Not blocking.

#### C11 [NOTE]: `useColorMode` hook's imperative `setAttribute` is redundant

**Generator's proposal**: The hook calls `document.querySelector('.pf2-root')?.setAttribute('data-theme', resolved)` in its useEffect.

**Actual behavior**: Since `AppUIv2.tsx` renders `data-theme={resolvedTheme}`, React already manages this attribute. The imperative call is always in sync but unnecessary — React's reconciliation handles it.

**Assessment**: Not a bug — it's redundant code that works correctly. The only scenario where the imperative approach would matter is if the hook were used outside the AppUIv2 render tree (it won't be).

**Recommendation**: Remove the imperative setAttribute calls from both useEffects. React props are the single source of truth. Not blocking.

#### C12 [NOTE]: Generator's contrast ratio calculations are systematically wrong

**Observation**: Multiple claimed ratios differ significantly from computed values:

| Token | Claimed | Actual | Δ |
|-------|---------|--------|---|
| text-primary | 16.2:1 | 16.50:1 | +0.3 |
| text-secondary | 6.1:1 | 7.20:1 | +1.1 |
| text-muted | 4.5:1 | 4.53:1 | +0.03 |
| accent | 4.8:1 | 4.00:1 | **−0.8** |
| success | 4.7:1 | 4.86:1 | +0.16 |
| warning | 4.5:1 | 4.36:1 | **−0.14** |
| error | 5.2:1 | 6.10:1 | +0.9 |

The errors are not consistent (some over, some under), suggesting the Generator used an unreliable tool or estimation method. The accent and warning calculations are dangerously wrong in the failing direction.

**Required fix**: All contrast ratios in the final implementation should be verified with the standard WCAG relative luminance formula before committing.

---

## Feature 3: Shortcuts Dialog

### Verified Claims ✅

1. **Radix Dialog API usage is correct** — `Dialog.Root`, `Dialog.Portal`, `Dialog.Overlay`, `Dialog.Content`, `Dialog.Title`, `Dialog.Close` — all used correctly. `asChild` on `Dialog.Close` wrapping a `<button>` is canonical Radix usage. ✅

2. **`aria-describedby={undefined}` prevents Radix warning** — Correct. Without `Dialog.Description`, Radix logs a console warning about missing `aria-describedby`. Setting it to `undefined` silences this. ✅

3. **HelpDialog props are interface-compatible** — `HelpDialog` takes `{ open: boolean, onOpenChange: (open: boolean) => void }` (HelpDialog.tsx line 15-19). `ShortcutsDialog` uses the same interface. Drop-in replacement. ✅

4. **No `?` key conflict with browser** — Browsers have no native `?` shortcut. The existing v1 hook also handles `?` (useKeyboardShortcuts.ts line 20, action: `'showHelp'`), but the v1 hook is only active when v1 UI is rendered. When `uiTheme === 'v2'`, the v1 AppUI component doesn't render, so no conflict. ✅

5. **V2 shortcuts list is accurate** — Verified against AppUIv2.tsx (Z for zen, Alt+1/2/3 for tabs) and SliderV2 (Shift+Arrow for fine-step). Space for auto-rotate is in v1 hook and ToolbarV2 button. Ctrl+S/Ctrl+Z/Ctrl+Shift+Z are standard. ✅

### Issues Found ⚠️

#### C13 [WARNING]: `pf2-drawer-enter` keyframe depends on LibraryDrawer.css being loaded

**Generator's claim**: "Since LibraryDrawer.css already defines `pf2-drawer-enter` and is loaded (LibraryDrawer is imported by ToolbarV2), the keyframe is available."

**Actual behavior**: Confirmed — `pf2-drawer-enter` is defined at `LibraryDrawer.css` lines 44-53, NOT in `motion.css`. The Generator correctly identified this cross-dependency.

**Risk scenario**: If LibraryDrawer is ever lazy-loaded, code-split, or removed from ToolbarV2, the ShortcutsDialog animation silently breaks (no CSS error, just no animation).

**The Generator proposed the mitigation**: "we can duplicate the keyframe definition in ShortcutsDialog.css (harmless — duplicate `@keyframes` with the same name just overwrite silently)."

**Required fix**: Either:
- (A) Move `pf2-drawer-enter` to `motion.css` where all other keyframes live (cleaner)
- (B) Duplicate it in `ShortcutsDialog.css` (safer, self-contained)

Option (A) is preferred — it's a refactor that makes the motion system self-contained. The existing definition in LibraryDrawer.css should then be removed.

#### C14 [NOTE]: `setHelpOpen` missing from useEffect dependency array

**Generator's proposal**:
```tsx
useEffect(() => {
  // ... handler uses setHelpOpen((prev) => !prev) ...
}, []); // Empty deps
```

**Assessment**: `setHelpOpen` is a React `useState` setter — React guarantees identity stability. ESLint's `react-hooks/exhaustive-deps` rule would flag this as a lint warning. Functionally, it works correctly because setters are stable and the handler uses the functional updater form `(prev) => !prev` (no stale closure).

**Required fix**: Add `setHelpOpen` to the dependency array to satisfy the linter. No behavioral change:
```tsx
}, [setHelpOpen]);
```

---

## Assumption Verification

### Feature 1 Assumptions

**A1**: "CSS `!important` on `width: 100%` will override React inline style" → **CONFIRMED** ✅. Per CSS cascade spec, `!important` beats inline styles.

**A2**: "`max-height: 70dvh` shows header + tabs + one screen of content + footer" → **CONFIRMED WITH AMENDMENT** ⚠️. My calculation shows ~263px for content at iPhone SE (not 287px as stated), but still sufficient for scrollable content.

**A3**: "Hiding resize handle via CSS won't cause memory leaks" → **CONFIRMED** ✅. Listeners only attach on mousedown, which can't fire on hidden handle.

**A4**: "Bottom sheet without swipe-down gesture is acceptable" → **CONFIRMED** ✅. Progressive enhancement. No objection.

**A5**: "Touch target 44×44 on 16px icon has 14px padding — visually acceptable" → **AMENDED** ⚠️. True for sidebar buttons, but the toolbar can't accommodate 44px visual buttons (see C1). Need invisible hit-area expansion for toolbar.

### Feature 2 Assumptions

**A6**: "Accent color change from `#b4975a` to `#92782e` is acceptable" → **REFUTED** ❌. The proposed `#92782e` fails AA contrast at 4.00:1. Needs to be darker. See C2.

**A7**: "`document.querySelector('.pf2-root')` is safe in the hook" → **CONFIRMED WITH NOTE** ✅. The element exists because the hook runs inside AppUIv2's render tree. But the imperative setAttribute is redundant — see C11.

**A8**: "localStorage is always available" → **CONFIRMED** ✅. try/catch handles private mode. Fallback to 'system' is sensible.

**A9**: "No Zustand changes needed" → **CONFIRMED** ✅. Color mode is pure presentation state. YAGNI for now.

**A10**: "I identified all glass/translucent surfaces" → **AMENDED** ⚠️. Missed SliderV2 thumb glow, ButtonV2 danger hover, and CameraPopover `@supports` block. See C9.

**A11**: "Warning color `#92700e` at 4.5:1 is borderline AA" → **REFUTED** ❌. It's 4.36:1, below 4.5:1. Use the proposed alternative `#7d6009` (5.58:1).

### Feature 3 Assumptions

**A12**: "`@radix-ui/react-dialog` is already installed" → **CONFIRMED** ✅. package.json line 25: `"@radix-ui/react-dialog": "^1.1.15"`.

**A13**: "`pf2-drawer-enter` keyframe is available because LibraryDrawer.css is loaded" → **CONFIRMED BUT FRAGILE** ⚠️. Works currently but depends on a side-effect from another component's CSS. See C13.

**A14**: "Omitting Tips and About sections is intentional" → **CONFIRMED** ✅. Focused shortcuts reference is correct for v2. Tips belong in onboarding tooltips.

**A15**: "`?` handler won't conflict with AppUIv2 keydown" → **CONFIRMED** ✅. AppUIv2 handles `Z` and `Alt+1/2/3`. `?` has no overlap.

**A16**: "`aria-describedby={undefined}` prevents Radix warning" → **CONFIRMED** ✅.

---

## Open Question Responses

### Feature 1

**Q1: Swipe-down gesture?** — Agree to defer. CSS-first is correct for this phase.

**Q2: Auto-close sidebar on mobile breakpoint?** — No action needed. If `panelOpen` is true, showing the bottom sheet is correct. If zen mode, it's hidden. Existing behavior is fine.

**Q3: Toolbar wrap at <360px?** — `overflow: hidden` is acceptable. <360px devices are vanishingly rare. Don't add `flex-wrap` — it creates unpredictable toolbar heights.

### Feature 2

**Q1: Should 3D viewport background adapt?** — Agree with "don't auto-change." The dark viewport behind a light UI creates dramatic contrast (the pot "floats on a dark stage"). Users who want a light viewport can change it in settings.

**Q2: Should ButtonV2--primary adapt?** — The Generator's self-analysis was wrong (claimed 4.8:1, actual is 4.0:1). Fixing C2 (darkening accent) automatically fixes this. After fix, `#faf8f5` on `#7a6526` = 5.33:1 ✅.

**Q3: Theme transition animation?** — Agree with "no transition." Instant swap avoids intermediate-state contrast failures and respects `prefers-reduced-motion` implicitly.

### Feature 3

**Q1: Docs link in footer?** — Not needed for v2 MVP. Keep the footer minimal.

**Q2: Ctrl+P for panel toggle?** — Agree: don't add. Browser print dialog conflict. Users have the toolbar button and Z for zen.

---

## Amendments Required

1. **[C2, CRITICAL]** Replace `--pf2-accent: #92782e` with a darker gold that achieves ≥4.5:1 on `#faf8f5`. Compute exact hex via WCAG formula. Suggest starting from `#7a6526` (5.33:1) or finding a value at ~4.6:1 for minimal visual change. Update `--pf2-accent-hover` accordingly.

2. **[C1, CRITICAL]** Exclude toolbar buttons from the 44px touch target expansion. Use invisible hit-area expansion (`::before { inset: -4px }`) for toolbar icon buttons to reach 44px touch area without visual overflow.

3. **[C3, WARNING]** Replace `--pf2-warning: #92700e` with `#7d6009` (5.58:1) as the Generator already proposed.

4. **[C4, WARNING]** Primary button contrast fix is automatic from amendment #1.

5. **[C5, WARNING]** Add `SelectV2.css` mobile touch target override: `.pf2-select__trigger { height: 44px }`.

6. **[C6, WARNING]** Add `SectionV2.css` mobile touch target override: `.pf2-section__trigger { min-height: 44px }`.

7. **[C9, WARNING]** Add light-theme overrides for `SliderV2.css` thumb glow (`box-shadow` with light accent rgba). At minimum change the two hardcoded `rgba(180, 151, 90, ...)` values.

8. **[C13, WARNING]** Move `pf2-drawer-enter` keyframe from `LibraryDrawer.css` to `motion.css`. Remove the duplicate from LibraryDrawer.css.

9. **[C14, NOTE]** Add `setHelpOpen` to the `?` key useEffect dependency array to satisfy ESLint.

10. **[C12, NOTE]** All final contrast ratios must be verified with the WCAG formula (not estimated) before implementation.

---

## Implementation Conditions (for Executioner)

If the Generator addresses all CRITICAL and WARNING amendments:

1. Implement Feature 2 (Light Theme) first — with corrected accent and warning colors
2. Implement Feature 1 (Responsive) — with toolbar exclusion and SelectV2/SectionV2 additions
3. Implement Feature 3 (Shortcuts Dialog) — with keyframe moved to motion.css
4. Verify all contrast ratios computationally before committing
5. Test toolbar at 375px viewport — confirm all buttons remain accessible
6. Test bottom sheet at 667px viewport — confirm content is scrollable
7. Test theme toggle cycle: system → light → dark → system
8. Verify `pf2-drawer-enter` animation plays on ShortcutsDialog after keyframe move

---

## Issue Summary

| # | Severity | Feature | Title |
|---|----------|---------|-------|
| C1 | CRITICAL | F1 | Touch target 44px breaks toolbar (485px > 375px viewport) |
| C2 | CRITICAL | F2 | Accent #92782e fails AA: 4.00:1, not 4.8:1 |
| C3 | WARNING | F2 | Warning #92700e fails AA: 4.36:1, not 4.5:1 |
| C4 | WARNING | F2 | Primary button contrast fails (consequence of C2) |
| C5 | WARNING | F1 | Missing SelectV2 touch target override |
| C6 | WARNING | F1 | Missing SectionV2 touch target override |
| C9 | WARNING | F2 | Missed SliderV2 thumb glow rgba overrides |
| C10 | WARNING | F2 | Inconsistent @media not (forced-colors) wrapping |
| C13 | WARNING | F3 | pf2-drawer-enter keyframe depends on LibraryDrawer side-effect |
| C7 | NOTE | F1 | data-viewport adds no current value |
| C8 | NOTE | F1 | Pre-existing width collapse on rotation |
| C11 | NOTE | F2 | useColorMode imperative setAttribute is redundant |
| C12 | NOTE | F2 | Generator contrast calculations systematically inaccurate |
| C14 | NOTE | F3 | setHelpOpen missing from useEffect deps |

**Totals: 2 CRITICAL, 7 WARNING, 4 NOTE**
