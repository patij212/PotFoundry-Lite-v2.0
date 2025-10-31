"""Compatibility shim: re-export batch adapter helpers for pfui.imports.

This module re-exports `build_from_yaml` from its canonical location. We use
a TYPE_CHECKING import so static tools see the real signature while runtime
falling back to a simple placeholder when the target module is unavailable
(helps pytest collection in isolated environments).
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from potfoundry.yaml_api import build_from_yaml
else:
    try:
        from potfoundry.yaml_api import build_from_yaml
    except Exception:

        def build_from_yaml(*_a, **_k):
            raise RuntimeError("potfoundry.yaml_api not available")


__all__ = ["build_from_yaml"]
