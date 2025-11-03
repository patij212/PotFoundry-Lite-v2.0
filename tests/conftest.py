"""Pytest and Hypothesis configuration for both local and CI runs.

- Registers two Hypothesis profiles:
  - "dev": generous settings for local development
  - "ci": reduced examples and explicit deadlines to stabilize on CI
- Defaults to "dev" locally and switches to "ci" automatically on CI

These settings can be overridden by setting HYPOTHESIS_PROFILE.
"""

from __future__ import annotations

import os

from hypothesis import HealthCheck, settings

# Register profiles
settings.register_profile(
    "dev",
    max_examples=50,
    deadline=2000,
)

settings.register_profile(
    "ci",
    max_examples=10,
    deadline=2000,
    suppress_health_check=[HealthCheck.too_slow],
)

# Auto-select profile: prefer explicit env; otherwise CI -> ci, else dev
_selected = os.environ.get("HYPOTHESIS_PROFILE")
if _selected:
    settings.load_profile(_selected)
else:
    if os.environ.get("GITHUB_ACTIONS") == "true" or os.environ.get("CI"):
        settings.load_profile("ci")
    else:
        settings.load_profile("dev")
