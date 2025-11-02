"""Compatibility shim: re-export stable schema helpers for older import paths.

This module exists to satisfy mypy import checks in `pfui.imports` while keeping
backwards-compatible imports working. It re-exports the public functions from
`potfoundry.schema`.
"""

# Re-export shim for stable schema helpers.

# We import under TYPE_CHECKING for static tools and attempt a runtime import
# at module import time. If the canonical module is unavailable (very rare in
# tests), provide harmless placeholders so imports don't fail during collection.

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    # Static tools: ConfigV2 lives in potfoundry.schema; helpers are implemented
    # in potfoundry.yaml_api.
    from potfoundry.schema import ConfigV2
    from potfoundry.yaml_api import load_config, validate_recipe
else:
    try:
        from potfoundry.schema import ConfigV2
        from potfoundry.yaml_api import load_config, validate_recipe
    except Exception:
        # Runtime fallbacks when the canonical modules are not available
        def load_config(*_a, **_k):
            raise RuntimeError("potfoundry.yaml_api not available")

        def validate_recipe(*_a, **_k):
            raise RuntimeError("potfoundry.yaml_api not available")

        ConfigV2 = Any

__all__ = ["load_config", "validate_recipe", "ConfigV2"]
