# Master Approval — Phase 5: Responsive, Theme & Polish

Date: 2026-03-06

## Decision: APPROVED WITH CONDITIONS

## Unanimous Agreement Status

- **Generator**: Proposed comprehensive 3-feature plan (F1 Responsive, F2 Light Theme, F3 Shortcuts Dialog) across 14 files. Solid architecture with CSS-first responsive approach.
- **Verifier**: ACCEPTED WITH AMENDMENTS. 2 CRITICAL (accent color AA fail at 4.00:1, toolbar overflow), 7 WARNING, 4 NOTE. All amendments are binding.
- **Executioner**: FEASIBLE WITH NOTES. All 10 binding amendments implementable. Corrected hit-area inset from -4px to -8px. Confirmed 16-step implementation pass across 14 files.
- **Master**: APPROVED. Three tie-breaking decisions below.

## Master Decisions (Tie-Breakers)

### D1: Theme Toggle Placement — TOOLBAR (Keep as proposed)

The toolbar is the correct home for global UI toggles. Zen mode and fullscreen are already there — theme belongs with them. Moving to sidebar would make it inaccessible when sidebar is closed, which is the exact scenario where theme switching matters most (viewing the 3D canvas in ambient lighting conditions).

The 12-button overflow at ≤375px when panel is closed is an acceptable edge case:
- Panel-closed on mobile is transient (tap menu → bottom sheet opens → drops to 11 buttons)
- Accept Executioner's recommendation: hide the toolbar divider on mobile (`display: none` in 768px breakpoint) to reclaim 5px

### D2: Hit-Area Inset — `-8px` (Executioner's correction)

The Verifier's C1 sample code showed `inset: -4px`, which assumes 36px visual size. Toolbar buttons are `sm` (28px). The correct calculation: `(44 - 28) / 2 = 8px`, so `inset: -8px`. Accept the Executioner's correction. Implementation must use `-8px`.

### D3: Keyframe Naming — Keep `pf2-drawer-enter` (No rename)

Renaming to `pf2-dialog-enter` introduces an unnecessary diff in LibraryDrawer.css's animation property for zero functional benefit. The name is descriptive enough. When moving to motion.css, add a comment documenting the `translate(-50%, -50%)` centering constraint.

## Binding Amendments (Final, Consolidated)

All amendments from the Verifier critique plus Executioner corrections, with Master decisions applied:

| # | Source | Amendment | Status |
|---|--------|-----------|--------|
| C1 | Verifier CRITICAL | Toolbar buttons use invisible `::before { inset: -8px }` hit-area, NOT visual 44px expansion | BINDING (inset corrected to -8px per D2) |
| C2 | Verifier CRITICAL | Light accent `#7a6526` (5.33:1), accent-hover `#695518` | BINDING |
| C3 | Verifier WARNING | Light warning `#7d6009` (5.58:1) | BINDING |
| C4 | Verifier WARNING | Primary button uses corrected accent (auto-fixed by C2) | BINDING |
| C5 | Verifier WARNING | SelectV2 mobile touch target: `height: 44px` | BINDING |
| C6 | Verifier WARNING | SectionV2 mobile touch target: `min-height: 44px` | BINDING |
| C7 | Verifier NOTE | Drop `data-viewport` attribute entirely — no JS viewport tracking | BINDING |
| C9 | Verifier WARNING | SliderV2 light theme thumb glow: `rgba(122, 101, 38, 0.3/0.2)` | BINDING |
| C10 | Verifier WARNING | Wrap new `@media` touch-target rules in `@media not (forced-colors: active)` where peer rules do | BINDING |
| C11 | Verifier NOTE | Remove imperative `setAttribute` from useColorMode — React manages `data-theme` via props | BINDING |
| C13 | Verifier WARNING | Move `pf2-drawer-enter` keyframe to motion.css, remove from LibraryDrawer.css. Keep name as-is (D3) | BINDING |
| C14 | Verifier NOTE | Add `setHelpOpen` to useEffect deps array in ToolbarV2 `?` key handler | BINDING |
| E1 | Executioner | Hide toolbar divider on mobile (`display: none` in 768px breakpoint) | BINDING (per D1) |
| E2 | Executioner | Add comment in motion.css documenting `pf2-drawer-enter` centering constraint | BINDING |

**NOT binding (deferred):**
- C8 (pre-existing sidebar width collapse on rotation) — pre-existing issue, not Phase 5 scope
- C12 (Generator contrast calculation method) — process improvement, not code change
- Executioner Q1 (theme toggle to sidebar) — decided against per D1
- Executioner Q2 (rename keyframe) — decided against per D3

## Rationale

This plan serves PotFoundry's strategic goals:
1. **Mobile responsiveness** is Priority 1 on the ROADMAP — this delivers it for the v2 UI system
2. **Light theme** addresses user request for bright working environments — dark-only was a v1 limitation
3. **Keyboard shortcuts** improves power-user workflow and accessibility compliance
4. **Zero new dependencies** — all imports from existing packages
5. **CSS-first responsive** is the right architectural choice — no JS viewport tracking, no layout thrash, composes naturally with the theme system
6. **Net bundle impact ~2.2 KB gzipped** — negligible

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Toolbar overflow at ≤375px panel-closed | Moderate | Low | Panel-closed is transient on mobile; divider hidden saves 5px |
| `pf2-drawer-enter` centering constraint | Low | Very Low | Comment documents constraint; name implies dialog use |
| Theme toggle increases toolbar density | Low | N/A | 28px button, consistent with existing toolbar items |
| Pre-existing width collapse on rotation | Low | Rare | Out of scope; bottom sheet ignores width on mobile |

**Blast radius:** CSS-only changes to responsive and theme. The only TSX changes are in ToolbarV2.tsx (swap HelpDialog → ShortcutsDialog, add theme toggle, add ? handler) and AppUIv2.tsx (import useColorMode, use resolvedTheme). Rollback is straightforward — revert the 14 files.

## Implementation Order

Follow the Executioner's 16-step sequence. Single pass through all 14 files:

### Phase A: Foundation (CSS tokens + hook)
1. CREATE `src/ui/v2/hooks/useColorMode.ts` (amended per C11 — no imperative setAttribute)
2. MODIFY `motion.css` — add `pf2-sheet-up` keyframe + move `pf2-drawer-enter` from LibraryDrawer.css (C13) + add centering comment (E2)
3. MODIFY `AppUIv2.css` — add light token block (corrected colors C2/C3) + breakpoint doc tokens

### Phase B: Component CSS overrides
4. MODIFY `SidebarV2.css` — mobile bottom sheet + tablet narrow + light glass
5. MODIFY `ToolbarV2.css` — mobile compact + tablet + light glass + hide divider on mobile (E1)
6. MODIFY `StatusFooter.css` — mobile compact
7. MODIFY `ButtonV2.css` — touch targets with toolbar hit-area exclusion (C1, inset -8px per D2)
8. MODIFY `SliderV2.css` — touch targets + light thumb glow (C9)
9. MODIFY `SelectV2.css` — touch target (C5)
10. MODIFY `SectionV2.css` — touch target (C6)
11. MODIFY `CameraPopover.css` — light glass override
12. MODIFY `LibraryDrawer.css` — remove `pf2-drawer-enter` keyframe (C13) + add light overlay

### Phase C: New component + TSX modifications
13. CREATE `ShortcutsDialog.tsx`
14. CREATE `ShortcutsDialog.css`
15. MODIFY `ToolbarV2.tsx` — swap HelpDialog→ShortcutsDialog, add theme toggle, add ? handler (C14)
16. MODIFY `AppUIv2.tsx` — import useColorMode, drop hardcoded `data-theme="dark"`, use `data-theme={resolvedTheme}` (C7 — no data-viewport)

### Validation Protocol
1. `tsc --noEmit` — zero TypeScript errors
2. `vite build` — clean production build
3. Visual verification at 375px, 768px, 1024px, 1440px viewports
4. Theme toggle cycle: system → light → dark → system
5. `?` key opens/closes ShortcutsDialog
6. Bottom sheet animation on ≤768px
7. All forced-colors blocks remain functional

## Conditions

1. All 14 binding amendments in the table above must be applied. No exceptions.
2. The Executioner must implement the amended hit-area inset value (`-8px`), not the Verifier's original (`-4px`).
3. The `useColorMode` hook must NOT contain imperative DOM setAttribute calls. React manages the attribute.
4. Build must be clean (`tsc --noEmit` + `vite build`) before sign-off.
