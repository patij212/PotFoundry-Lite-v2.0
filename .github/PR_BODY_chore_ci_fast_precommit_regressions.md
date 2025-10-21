## Summary

- Speeds up CI and improves feedback:
  - Adds pip and pre-commit caching, cancels duplicate runs, and publishes JUnit test reports to PRs.
  - Expands Windows smoke tests and fixes inline Python execution.
- Improves dev ergonomics:
  - Adds a “fast” pytest marker and switches pre-commit to a quick test subset.
  - Makes property-based tests optional locally if Hypothesis isn’t installed (warns instead of failing).
- Adds focused regression tests and clarifies geometry semantics in docs.

## Changes

### CI/CD
- `.github/workflows/ci.yml`
  - Pip cache via `actions/setup-python` on Linux and Windows jobs
  - Cache pre-commit (keyed by `.pre-commit-config.yaml`)
  - Concurrency group to cancel in-progress runs for same ref
  - Pytest JUnit XML report upload as artifact
  - Publish unit test results to PR (`EnricoMi/publish-unit-test-result-action`)
  - Windows smoke: run `tests/test_windows_export_path.py` and `tests/test_integration_binary_stl.py`, plus a HarmonicRipple mesh smoke with `python -c`

### Pre-commit and lint/test hooks
- `.pre-commit-config.yaml`
  - Adds `ruff` and `ruff-format` hooks
  - Adds a fast pytest hook: `pytest -q -m fast`

### Property-based testing ergonomics
- `conftest.py`
  - Hypothesis import is optional; profiles only loaded when available; emits a single warning otherwise
- `tests/test_property_based.py`
  - Entire module is skipped if Hypothesis isn’t installed

### Regression tests
- `tests/test_regressions.py` (new)
  - Ensures SuperformulaBlossom is neutral by default for vector and scalar paths
  - Verifies diagnostics diameters equal `2*Rt` and `2*Rb` when style modulation is neutral

### Fast marker tags
- `tests/test_windows_export_path.py`: `@pytest.mark.fast`
- `tests/test_integration_binary_stl.py`: `@pytest.mark.fast` on three quick tests
- `tests/test_regressions.py`: both tests marked `fast`

### Documentation
- `README.md`
  - Adds note on radius vs diameter semantics and neutral default for SuperformulaBlossom

### Pytest
- `pytest.ini`: registers `fast` marker

## Verification

- Fast subset (pre-commit path): 6 passed in ~2s
- Property-based (Hypothesis):
  - CI profile: 10 passed
  - Dev profile: 10 passed
- Full suite:
  - With dev profile: 287 passed, 0 failed
- App runs locally (Streamlit): http://localhost:8501

## Why this helps

- Faster feedback on PRs and commits
- Stable local workflow even if dev-only deps are not installed
- Guardrails for key regressions (style neutrality and diameter semantics)
- Clearer semantics in docs reduce confusion between radii and diameters

## Next steps (optional)

- Enable Codecov badge and add to README
- Adjust `fast` marker set as needed for commit-time latency vs coverage tradeoffs
- Consider adding a separate `smoke` marker if you want an even smaller pre-commit run
