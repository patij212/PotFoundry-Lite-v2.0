"""Compatibility shim: re-export stable schema helpers for older import paths.

This module exists to satisfy mypy import checks in `pfui.imports` while keeping
backwards-compatible imports working. It re-exports the public functions from
`potfoundry.schema`.
"""

# Re-export from canonical module
from potfoundry.schema import load_config, validate_recipe, ConfigV2  # type: ignore

__all__ = ["load_config", "validate_recipe", "ConfigV2"]
