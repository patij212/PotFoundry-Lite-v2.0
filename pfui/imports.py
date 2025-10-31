from __future__ import annotations

"""Flexible imports to support legacy and refactored module layout.

These helper import wrappers prefer the modern locations under
``potfoundry.core`` but gracefully fall back to legacy module paths.
They are typed as Optionals so callers can handle absence at runtime.
"""

import importlib  # noqa: E402
from typing import TYPE_CHECKING, Callable, Optional, Tuple, cast  # noqa: E402

if TYPE_CHECKING:
    # These imports are only for static analyzers (ruff/mypy). At runtime we
    # continue to provide the attributes lazily via __getattr__ to avoid
    # heavy imports at module import time.
    from potfoundry.core.geometry import (
        STYLES,
        _spin_twist_radians,
        base_radius,
        build_pot_mesh,
    )
    from potfoundry.core.io.stl import write_stl_binary as WRITE_STL_BINARY

    # Prefer the canonical YAML API for static analysis; runtime code will
    # still dynamically resolve these functions from either the new core
    # locations or the legacy `potfoundry.yaml_api` module.
    from potfoundry.yaml_api import build_from_yaml, load_config, validate_recipe


def _import_writer() -> Optional[Callable[..., object]]:
    # Preferred location (dynamic import to avoid static analysis of heavy modules)
    try:
        mod = importlib.import_module("potfoundry.core.io.stl")
        w = getattr(mod, "write_stl_binary", None)
        if callable(w):
            return cast(Callable[..., object], w)
    except Exception:
        # Try older top-level exports or modules using importlib to avoid
        # static import-time complaints from type checkers.
        try:
            mod = importlib.import_module("potfoundry")
            w = getattr(mod, "write_stl_binary", None)
            if callable(w):
                return cast(Callable[..., object], w)
        except Exception:
            pass
        try:
            mod = importlib.import_module("potfoundry.stl")
            w = getattr(mod, "write_stl_binary", None)
            if callable(w):
                return cast(Callable[..., object], w)
        except Exception:
            pass
    return None


def _import_geometry() -> Tuple[object, object, object, object]:
    try:
        mod = importlib.import_module("potfoundry.core.geometry")
        return (
            getattr(mod, "STYLES"),
            getattr(mod, "base_radius"),
            getattr(mod, "_spin_twist_radians"),
            getattr(mod, "build_pot_mesh"),
        )
    except Exception:
        # Fallback to legacy geometry module path
        mod = importlib.import_module("potfoundry.geometry")
        return (
            getattr(mod, "STYLES"),
            getattr(mod, "base_radius"),
            getattr(mod, "_spin_twist_radians"),
            getattr(mod, "build_pot_mesh"),
        )


def _import_schema_and_batch() -> (
    Tuple[
        Optional[Callable[..., object]],
        Optional[Callable[..., object]],
        Optional[Callable[..., object]],
    ]
):
    validate_recipe: Optional[Callable[..., object]] = None
    load_config: Optional[Callable[..., object]] = None
    build_from_yaml: Optional[Callable[..., object]] = None

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


# Caches for lazily-exported attributes. Keep names matching the previous API
# but avoid doing heavy imports at module import time. PEP 562 (__getattr__) is
# used so attribute access triggers the imports on-demand.
_WRITE_STL_BINARY: Optional[Callable[..., object]] = None
_GEOMETRY_CACHE: Optional[Tuple[object, object, object, object]] = None
_SCHEMA_BATCH_CACHE: Optional[
    Tuple[
        Optional[Callable[..., object]],
        Optional[Callable[..., object]],
        Optional[Callable[..., object]],
    ]
] = None


def __getattr__(name: str):
    """Lazily provide attributes matching the old module-level exports.

    Supported names: WRITE_STL_BINARY, STYLES, base_radius,
    _spin_twist_radians, build_pot_mesh, validate_recipe, load_config,
    build_from_yaml.
    """
    global _WRITE_STL_BINARY, _GEOMETRY_CACHE, _SCHEMA_BATCH_CACHE
    if name == "WRITE_STL_BINARY":
        if _WRITE_STL_BINARY is None:
            _WRITE_STL_BINARY = _import_writer()
        return _WRITE_STL_BINARY

    if name in ("STYLES", "base_radius", "_spin_twist_radians", "build_pot_mesh"):
        if _GEOMETRY_CACHE is None:
            _GEOMETRY_CACHE = _import_geometry()
        mapping = {
            "STYLES": 0,
            "base_radius": 1,
            "_spin_twist_radians": 2,
            "build_pot_mesh": 3,
        }
        return _GEOMETRY_CACHE[mapping[name]]

    if name in ("validate_recipe", "load_config", "build_from_yaml"):
        if _SCHEMA_BATCH_CACHE is None:
            _SCHEMA_BATCH_CACHE = _import_schema_and_batch()
        mapping = {"validate_recipe": 0, "load_config": 1, "build_from_yaml": 2}
        return _SCHEMA_BATCH_CACHE[mapping[name]]

    raise AttributeError(name)


__all__ = [
    "_import_writer",
    "_import_geometry",
    "_import_schema_and_batch",
    # lazy attributes available via module attribute access
    "WRITE_STL_BINARY",  # lazy: resolved via __getattr__ on first access
    "STYLES",  # lazy: resolved via __getattr__ on first access
    "base_radius",  # lazy
    "_spin_twist_radians",  # lazy
    "build_pot_mesh",  # lazy
    "validate_recipe",  # lazy
    "load_config",  # lazy
    "build_from_yaml",  # lazy
]
