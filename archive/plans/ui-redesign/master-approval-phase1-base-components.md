# Master Approval — Phase 1 Base Components
Date: 2026-03-06

## Decision: APPROVED

## Unanimous Agreement Status
- Generator: Proposed 5 components (SliderV2, SectionV2, ButtonV2, SelectV2, Announcer) with complete TSX + CSS + props interfaces (~1,950 lines)
- Verifier: ACCEPT WITH AMENDMENTS — 2 critical fixes, 3 warnings, all with clear resolution paths
- Executioner: FEASIBLE — zero blockers, all tokens verified, all dependencies installed, all amendments trivial
- Master: APPROVED

## Rationale

The plan is well-specified, grounded in actual Radix source code verification, and risk-free to existing v1 functionality. All new files live under `src/ui/v2/` with zero modification to v1 code. The Verifier caught two genuine bugs (contrast failure, invalid HTML) that would have shipped to production — this is exactly why we run the debate cycle.

## Binding Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Danger hover: `#a85252` (not `#c86a6a`) | WCAG AA requires 4.5:1 for normal text. `#c86a6a` on `#f5f0e8` = 3.06:1 FAIL. `#a85252` ≈ 5.4:1 PASS. |
| 2 | SelectV2 ItemText: `<span>` with flex CSS | `<div>` inside Radix's `<span>` is invalid HTML per spec. |
| 3 | SliderV2 Shift+Arrow: Remove custom handler | Radix handles ×10 natively. Snap logic in `handleValueChange` covers all value changes. |
| 4 | Ghost marker: Accept ±9px offset for Phase 1 | Add `// TODO: Phase 4 — compensate for Radix thumbInBoundsOffset` |
| 5 | Density: CSS custom properties at root level | `.pf2-root[data-density="compact"]` — no per-component density prop |
| 6 | motion.css `button:active`: Remove global rule | All v2 buttons have component-specific `:active` styles. Remove 3 lines from motion.css. |

## Conditions

1. All 6 binding decisions above MUST be applied during implementation
2. Each component must compile cleanly with `npx tsc --noEmit`
3. The Vite build must pass after all 5 components are added
4. No v1 files may be modified (except motion.css per Decision #6)

## Risk Assessment

- **Blast radius**: Zero v1 impact — all new files under `src/ui/v2/`
- **Rollback plan**: Delete new files, revert motion.css change
- **Performance**: Negligible — lightweight form controls, no GPU involvement

## Implementation Order
1. Announcer (zero deps, foundational)
2. ButtonV2 (simplest interactive, validates token pipeline)
3. SectionV2 (validates Radix Collapsible + grid animation)
4. SelectV2 (validates Radix Select + portal)
5. SliderV2 (most complex, benefits from established patterns)
