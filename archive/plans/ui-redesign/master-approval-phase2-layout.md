# Master Approval — Phase 2 Layout Components

Date: 2026-03-06

## Decision: APPROVED WITH CONDITIONS

## Unanimous Agreement Status
- Generator: Proposed 8 files (~1,055 lines) — comprehensive layout shell
- Verifier: ACCEPT WITH AMENDMENTS (3 critical, 5 warnings). C3 overruled by Master.
- Executioner: FEASIBLE — zero blockers, confirmed implementation order
- Master: APPROVED with 5 binding decisions

## Rationale

The Generator's Phase 2 proposal is architecturally sound and well-structured. It delivers exactly what the consolidated spec §14 requires for Phase 2: "SidebarV2, StatusFooter, ToolbarV2, wire AppUIv2. Gate: Full layout renders, tab switching works."

The Verifier found 3 critical issues, but C3 (sidebar width) was a false positive — the Verifier cited a stale reference (340px) when the consolidated spec explicitly states 380px at §4 L146 and L165. C1 (children prop) and C2 (pf2-spin duplication) are valid and must be fixed. W5 (StatusFooter selector granularity) is promoted to a binding decision for Phase 3 readiness.

## Binding Decisions

### Decision #1: Remove `children` prop from AppUIv2
The canvas is a sibling in `App.tsx`, not a child of `AppUIv2`. Remove `AppUIv2Props` interface, `children` param, and `<main className="pf2-layout__viewport">` wrapper. Remove `.pf2-layout__viewport` from CSS. The component should be `React.FC` with no props.

### Decision #2: Deduplicate `@keyframes pf2-spin` to motion.css
Move the `pf2-spin` keyframe to `motion.css` (after `pf2-fade-out`, before Utility Animation Classes). Remove from `ButtonV2.css` L162-166. Do NOT add to `StatusFooter.css`.

### Decision #3: DEFAULT_WIDTH = 380 (Generator is correct)
The Verifier's C3 is OVERRULED. The consolidated spec §4 L146 reads "Sidebar (380px default, resizable)" and L165 reads "Default width: 380px (up from 340px)". Keep 380.

### Decision #4: Individual selectors in StatusFooter
Replace `usePerformance()` in StatusFooter with individual `useAppStore` selectors for `triangleCount`, `vertexCount`, `generationTime`, `isGenerating`. This prevents unnecessary re-renders during slider interaction.

### Decision #5: Implementation order
1. motion.css — add `pf2-spin`, remove from ButtonV2.css
2. StatusFooter.tsx + StatusFooter.css
3. SidebarV2.tsx + SidebarV2.css
4. ToolbarV2.tsx + ToolbarV2.css
5. AppUIv2.tsx rewrite + AppUIv2.css append

## Risk Assessment

**Blast radius**: LOW — All changes are in `src/ui/v2/` except motion.css and ButtonV2.css. Zero v1 file modifications. Zero `App.tsx` modifications. The v2 UI is lazy-loaded and only active when `uiTheme === 'v2'`.

**Rollback plan**: Delete `src/ui/v2/layout/` directory and revert AppUIv2.tsx to the Phase 1 stub. Restore `pf2-spin` to ButtonV2.css.

**Known deferred issues**:
- Alt+1/2/3 silently fails on macOS (Phase 5)
- Save/load logic duplicated from v1 (acceptable, extract if needed later)
- StatusFooter progress bar is a hidden placeholder (Phase 3/4)

## Implementation Order
Per Decision #5, five atomic changesets in sequence.
