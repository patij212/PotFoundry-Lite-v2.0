# Migration Guide – Phase 5: CI/CD & Automation

Status: Planned
Owner: DevEx + QA
Target version: v2.5.x

This guide aligns with REFACTORING_PLAN.md Phase 5.

## Goals

- Add GitHub Actions workflows for tests, linting, type checks, coverage, and releases.
- Ensure cross-platform matrix (Windows, macOS, Linux) and Python 3.11–3.13 support.

## Non-goals

- No runtime feature changes; infra-only.

## Outcomes and Success Criteria

- CI runs ruff + mypy + pytest with coverage and uploads artifacts.
- Release workflow exists (tag-driven), optionally publishing artifacts.

## Detailed Plan

1) Workflows
- `.github/workflows/tests.yml`: matrix, dependency cache, ruff + mypy + pytest, codecov upload.
- `.github/workflows/lint.yml`: quick ruff on PRs.
- `.github/workflows/type-check.yml`: mypy job (optional to combine with tests).
- `.github/workflows/coverage.yml`: coverage thresholds/report (optional if folded into tests).
- `.github/workflows/release.yml`: semver tag trigger; build artifacts and attach to release.

2) Caching and speed
- Use `actions/cache` for pip.
- Parallelize matrix; split jobs to keep PR feedback fast.

3) Documentation and badges
- Update README with CI and coverage badges.
- Document how to run CI jobs locally (tox or simple scripts).

## Files in scope

- `.github/workflows/*`, `README.md`, `requirements*.txt`

## Compatibility and Backout

- CI-only changes; can disable workflows quickly if needed.

## Acceptance Checklist

- [ ] CI green on PRs across OS and Python versions
- [ ] Coverage artifacts uploaded; optional thresholds enforced
- [ ] Release flow validated with a dry-run tag

## Risks and Mitigation

- Risk: Matrix increases cycle time
  - Mitigation: Allow fast path for docs-only changes; use conditional jobs

---

Implementation notes: Keep jobs minimal and deterministic; reuse REFACTORING_PLAN examples for the tests workflow.
