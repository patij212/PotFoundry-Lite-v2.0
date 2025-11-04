# Migration Guide – Phase 2: Code Structure Refactoring

Status: Planned
Owner: Core + UI
Target version: v2.2.x

This guide aligns with REFACTORING_PLAN.md Phase 2 (2.1–2.4).

## Goals

- Split the monolithic `app.py` into focused components (2.1).
- Refactor `pfui/schemas.py` into a package with clear boundaries (2.2).
- Split `pfui/preview.py` by rendering concerns (2.3).
- Consolidate dual geometry implementations or archive the alternative (2.4).

## Non-goals

- No visual redesign of the UI.
- No changes to core mesh algorithms beyond signatures/typing.

## Outcomes and Success Criteria

- `app.py` is reduced to ≤600 LOC and mostly wiring.
- `pfui/schemas/` package exists with public API compatibility via `__init__.py`.
- `pfui/preview/` package exists with renderer/cache modules.
- Decision on geometry consolidation executed (keep primary; archive or merge features).
- All tests green, lint/type clean; no perf regression.

## Detailed Plan

1) 2.1 Split app.py
- Create `pfui/app_components/` with:
  - `mesh_generation.py` – mesh-building UI logic
  - `parameter_controls.py` – main parameter panel
  - `export_handlers.py` – STL export actions
  - `sidebar_config.py` – sidebar setup
  - `tabs_manager.py` – tab navigation/state
- Keep `app.py` as thin entry/orchestrator; use delayed imports; preserve session-state keys.

2) 2.2 Refactor pfui/schemas.py
- New package `pfui/schemas/`:
  - `base.py`, `global_controls.py`, `style_schemas.py`, `aliases.py`, `validators.py`, `utils.py`
- Maintain backward compatibility via `pfui/schemas/__init__.py` re-exports.
- Add unit tests for validation and alias resolution.

3) 2.3 Refactor pfui/preview.py
- New package `pfui/preview/`:
  - `mesh_renderer.py`, `profile_renderer.py`, `snapshot_cache.py`, `visualization.py`, `utils.py`
- Localize typing casts near untyped 3D APIs; no behavior changes.

4) 2.4 Consolidate dual geometry implementations
- Prefer keeping `potfoundry/geometry.py` as the primary implementation.
- Document differences; archive `potfoundry/core/geometry.py` or merge select features.
- Ensure tests reflect final decision; no API breakage.

## Files in scope

- `app.py`, `pfui/app_components/*`
- `pfui/schemas/*` (new package)
- `pfui/preview/*` (new package)
- `potfoundry/geometry.py`, `potfoundry/core/geometry.py`

## Compatibility and Backout

- Maintain import paths via re-exports; add shims for risky moves.
- Backout: keep `app.py` unchanged behind a feature flag; defer package splits.

## Acceptance Checklist

- [ ] `app.py` ≤ 600 LOC and composed of extracted components
- [ ] `pfui/schemas/` package with compatibility re-exports
- [ ] `pfui/preview/` package with split responsibilities
- [ ] Geometry consolidation decision implemented and documented
- [ ] Tests/Lint/Types PASS; performance unchanged

## Risks and Mitigation

- Risk: Hidden cross-module coupling
  - Mitigation: Extract smallest pure helpers first; add focused tests
- Risk: Import churn for internal modules
  - Mitigation: Provide re-exports and compatibility layer in `__init__.py`

---

Implementation notes: Follow REFACTORING_PLAN.md guidance and coding standards; prefer delayed imports and keep the core UI-agnostic.
