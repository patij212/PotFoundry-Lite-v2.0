from __future__ import annotations

"""Flexible imports to support legacy and refactored module layout.

These helper import wrappers prefer the modern locations under
``potfoundry.core`` but gracefully fall back to legacy module paths.
They are typed as Optionals so callers can handle absence at runtime.
"""

from typing import Any, Callable, Optional, Tuple
import importlib


def _import_writer() -> Optional[Callable[..., Any]]:
    # Preferred location
    try:
        from potfoundry.core.io.stl import write_stl_binary
        return write_stl_binary
    except Exception:
        # Try older top-level exports or modules using importlib to avoid
        # static import-time complaints from type checkers.
        try:
            mod = importlib.import_module("potfoundry")
            w = getattr(mod, "write_stl_binary", None)
            if callable(w):
                return w
        except Exception:
            pass
        try:
            mod = importlib.import_module("potfoundry.stl")
            w = getattr(mod, "write_stl_binary", None)
            if callable(w):
                return w
        except Exception:
            pass
    return None


def _import_geometry() -> Tuple[Any, Any, Any, Any]:
    try:
        from potfoundry.core.geometry import STYLES, base_radius, _spin_twist_radians, build_pot_mesh
        return STYLES, base_radius, _spin_twist_radians, build_pot_mesh
    except Exception:
        mod = importlib.import_module("potfoundry.geometry")
        return (
            getattr(mod, "STYLES"),
            getattr(mod, "base_radius"),
            getattr(mod, "_spin_twist_radians"),
            getattr(mod, "build_pot_mesh"),
        )


def _import_schema_and_batch() -> Tuple[Optional[Callable[..., Any]], Optional[Callable[..., Any]], Optional[Callable[..., Any]]]:
    validate_recipe: Optional[Callable[..., Any]] = None
    load_config: Optional[Callable[..., Any]] = None
    build_from_yaml: Optional[Callable[..., Any]] = None

    try:
        mod = importlib.import_module("potfoundry.core.schema")
        validate_recipe = getattr(mod, "validate_recipe", None)
        load_config = getattr(mod, "load_config", None)
    except Exception:
        try:
            mod = importlib.import_module("potfoundry.yaml_api")
            load_config = getattr(mod, "load_config", None)
            validate_recipe = getattr(mod, "validate_recipe", None)
        except Exception:
            pass

    try:
        mod = importlib.import_module("potfoundry.adapters.batch")
        build_from_yaml = getattr(mod, "build_from_yaml", None)
    except Exception:
        try:
            mod = importlib.import_module("potfoundry.yaml_api")
            build_from_yaml = getattr(mod, "build_from_yaml", None)
        except Exception:
            pass

    return validate_recipe, load_config, build_from_yaml


WRITE_STL_BINARY = _import_writer()
STYLES, base_radius, _spin_twist_radians, build_pot_mesh = _import_geometry()
validate_recipe, load_config, build_from_yaml = _import_schema_and_batch()
