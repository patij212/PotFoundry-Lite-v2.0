# Migration Guide – Phase 3: Component Extraction & Modularization

Status: Planned
Owner: UI + Core
Target version: v2.3.x

This guide aligns with REFACTORING_PLAN.md Phase 3.

## Goals

- Create `pfui/widgets/` package of reusable Streamlit widgets to reduce duplication and prepare for future Qt.
- Create `potfoundry/validators/` package to centralize validation logic shared across UI and APIs.

## Non-goals

- No visual redesign; widgets wrap existing behaviors.
- No breaking changes to public parameters or schema inputs.

## Outcomes and Success Criteria

- Common UI elements (sliders, selectors, buttons) implemented once in `pfui/widgets/`.
- Validation rules consolidated and reused by UI and YAML API.
- Code duplication reduced; clearer layering and testability.

## Detailed Plan

1) pfui/widgets/
- Structure:
  - `sliders.py` – range/float/int sliders with consistent labeling/help
  - `selectors.py` – dropdowns, radios, checkboxes with semantics
  - `inputs.py` – text/number inputs with validation hooks
  - `buttons.py` – export/actions with callbacks
  - `displays.py` – info/metrics badges, status messages
  - `layouts.py` – containers, columns, expanders helpers
- Add thin wrappers around Streamlit to standardize options, keys, and tooltips.

2) potfoundry/validators/
- Structure:
  - `dimensions.py` – H, Rt, Rb, t_wall, t_bottom, r_drain constraints
  - `parameters.py` – style parameter bounds/types
  - `geometry.py` – geometric invariants and relationships
  - `utils.py` – error formatting, coercion
- Replace scattered checks with shared functions; add targeted unit tests.

## Files in scope

- New: `pfui/widgets/*`, `potfoundry/validators/*`
- Call-site updates in `pfui/controls.py`, `pfui/schemas/*`, and YAML API.

## Compatibility and Backout

- Widgets should be drop-in; fall back to direct Streamlit calls if issues arise.
- Validators provide additive checks; retain previous validations as fallback.

## Acceptance Checklist

- [ ] Widgets package used by at least 3 major UI areas
- [ ] Validators used by UI and YAML API paths
- [ ] Duplication reduced (subjective and by LOC)
- [ ] Tests/Lint/Types PASS; no behavior change

## Risks and Mitigation

- Risk: Over-abstracted widgets hurt flexibility
  - Mitigation: Keep wrappers thin; expose escape hatches
- Risk: Validation tightening causes unexpected rejections
  - Mitigation: Start as warnings; add strict mode behind flag

---

Implementation notes: Keep wrappers small and well-documented; write unit tests for both widgets and validators.
