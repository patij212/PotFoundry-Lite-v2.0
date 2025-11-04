# Migration Guide – Phase 4: Testing Infrastructure

Status: Planned
Owner: QA + Core
Target version: v2.4.x

This guide aligns with REFACTORING_PLAN.md Phase 4.

## Goals

- Reorganize tests by category (unit, integration, performance, regression, property-based).
- Add missing test categories and fixtures; improve discoverability and speed.

## Non-goals

- No behavioral feature work; tests should reflect current behavior.

## Outcomes and Success Criteria

- Clear test folder structure with category separation per REFACTORING_PLAN.md.
- New tests for property-based geometry invariants and parity/golden coverage.
- Performance tests with reasonable thresholds for default settings.

## Detailed Plan

1) Directory reorg
- Adopt the proposed structure:
  - `tests/unit/potfoundry/*`, `tests/unit/pfui/*`
  - `tests/integration/*`
  - `tests/performance/*`
  - `tests/regression/golden_data/*`
  - `tests/property_based/*`
  - `tests/fixtures/*`, shared `conftest.py`

2) Add missing tests
- Property-based tests (Hypothesis) for watertightness, finite vertices, face index bounds.
- Regression/golden tests for preview/export parity across representative styles.
- Performance tests for mesh gen and STL export within agreed budgets.

3) Speed and isolation
- Prefer unit tests that avoid Streamlit runtime; mock where needed.
- Keep golden data minimal and deterministic.

## Files in scope

- `tests/` tree, fixtures, and `conftest.py`

## Compatibility and Backout

- Reorganization is test-only; runtime unaffected.
- Backout: retain legacy layout while gradually porting tests.

## Acceptance Checklist

- [ ] Tests organized per plan; README/docs updated
- [ ] Property-based + perf + parity tests added
- [ ] Test suite remains performant and stable locally and in CI

## Risks and Mitigation

- Risk: Performance test flakes in CI
  - Mitigation: Looser thresholds; focus on deltas; mark xfail if non-deterministic

---

Implementation notes: Favor small, focused tests; document any thresholds and rationale.
