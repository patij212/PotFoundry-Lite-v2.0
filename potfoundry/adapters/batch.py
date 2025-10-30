"""Compatibility shim: re-export batch adapter helpers for pfui.imports.

This small module re-exports the `build_from_yaml` function from the newer
location so mypy and older imports resolve cleanly.
"""

from potfoundry.adapters.batch import build_from_yaml  # type: ignore

__all__ = ["build_from_yaml"]
