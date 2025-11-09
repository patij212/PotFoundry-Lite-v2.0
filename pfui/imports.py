from __future__ import annotations

"""Flexible imports to support legacy and refactored module layout.

These helper import wrappers prefer the modern locations under
``potfoundry.core`` but gracefully fall back to legacy module paths.
They are typed as Optionals so callers can handle absence at runtime.
"""

import importlib  # noqa: E402
from typing import TYPE_CHECKING, Any, Callable, Optional, Tuple, cast  # noqa: E402

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
    # Prefer the new core locations but be resilient: obtain STYLES from
    # the dedicated styles package when possible so the UI sees the full
    # registry even if importing the large `geometry` module fails.
    styles_mod = None
    geom_mod = None
    try:
        styles_mod = importlib.import_module("potfoundry.core.styles")
    except Exception:
        styles_mod = None

    try:
        geom_mod = importlib.import_module("potfoundry.core.geometry")
    except Exception:
        geom_mod = None

    # Resolve STYLES: prefer explicit styles package, else geometry, else legacy
    if styles_mod is not None:
        styles_obj = getattr(styles_mod, "STYLES")
    elif geom_mod is not None and hasattr(geom_mod, "STYLES"):
        styles_obj = getattr(geom_mod, "STYLES")
    else:
        # Last-resort legacy location
        legacy = importlib.import_module("potfoundry.geometry")
        styles_obj = getattr(legacy, "STYLES")

    # Resolve other geometry functions: prefer core.geometry, fall back to legacy
    if geom_mod is not None:
        base_radius = getattr(geom_mod, "base_radius")
        # Some refactors renamed the internal spin/twist helper. Accept either name.
        spin = getattr(geom_mod, "_spin_twist_radians", None)
        if spin is None:
            spin = getattr(geom_mod, "spin_twist_radians", None)
        if spin is None:
            # If core.geometry doesn't expose a spin helper, try to derive a safe
            # no-op that returns 0.0 for compatibility so callers don't crash.
            def _spin_noop(z: float, H: float, opts: dict) -> float:
                return 0.0

            spin = _spin_noop
        build = getattr(geom_mod, "build_pot_mesh")
    else:
        legacy = importlib.import_module("potfoundry.geometry")
        base_radius = getattr(legacy, "base_radius")
        # Legacy geometry may also use either name
        spin = getattr(legacy, "_spin_twist_radians", None)
        if spin is None:
            spin = getattr(legacy, "spin_twist_radians", None)
        if spin is None:
            def _spin_noop(z: float, H: float, opts: dict) -> float:
                return 0.0

            spin = _spin_noop
        build = getattr(legacy, "build_pot_mesh")

    return (styles_obj, base_radius, spin, build)


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


def __getattr__(name: str) -> Any:
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
    "WRITE_STL_BINARY",
    "STYLES",
    "base_radius",
    "_spin_twist_radians",
    "build_pot_mesh",
    "validate_recipe",
    "load_config",
    "build_from_yaml",
]


# Provide module-level lazy proxies so consumers can use ``from pfui.imports import STYLES``
# without triggering heavy imports at import-time. Each proxy resolves on first use
# and replaces itself in the module globals with the real object to avoid future
# indirection and to play nicely with monkeypatching in tests.
class _LazyProxy:
    def __init__(self, name: str, resolver: Callable[[], Any]):
        self.__name__ = name
        self._name = name
        self._resolver: Callable[[], Any] = resolver
        self._resolved: bool = False
        self._value: Any | None = None

    def _ensure(self) -> Any:
        if not self._resolved:
            val = self._resolver()
            # replace with the concrete object in module globals for future imports
            globals()[self._name] = val
            self._value = val
            self._resolved = True
        return self._value

    def __call__(self, *args, **kwargs):
        val = self._ensure()
        return val(*args, **kwargs)

    def __getattr__(self, item: str) -> Any:
        val = self._ensure()
        return getattr(val, item)

    def __iter__(self):
        val = self._ensure()
        return iter(val)

    def __len__(self) -> int:
        val = self._ensure()
        return len(val)

    def __getitem__(self, key: object) -> object:
        val = self._ensure()
        return val[key]

    def __contains__(self, key: object) -> bool:
        val = self._ensure()
        try:
            return key in val
        except Exception:
            # Fallback: attempt mapping-style membership
            try:
                return getattr(val, "__contains__", lambda k: False)(key)
            except Exception:
                return False

    def keys(self):
        val = self._ensure()
        return getattr(val, "keys", lambda: [])()

    def items(self):
        val = self._ensure()
        return getattr(val, "items", lambda: [])()

    def get(self, key: object, default: object = None) -> object:
        val = self._ensure()
        return getattr(val, "get", lambda k, d=None: d)(key, default)

    def __repr__(self) -> str:  # pragma: no cover - trivial
        if self._resolved:
            return repr(self._value)
        return f"<LazyProxy {self._name}>"


def _resolve_geometry_attr(idx: int) -> object:
    # Ensure _import_geometry is used so the heavy modules are only imported when
    # actually needed. Returns the selected element from the geometry tuple.
    items = _import_geometry()
    return items[idx]


# Create lazy proxies for exports commonly used via from-import.
STYLES = _LazyProxy("STYLES", lambda: _resolve_geometry_attr(0))
base_radius = _LazyProxy("base_radius", lambda: _resolve_geometry_attr(1))
_spin_twist_radians = _LazyProxy("_spin_twist_radians", lambda: _resolve_geometry_attr(2))
build_pot_mesh = _LazyProxy("build_pot_mesh", lambda: _resolve_geometry_attr(3))
WRITE_STL_BINARY = _LazyProxy("WRITE_STL_BINARY", _import_writer)

# Schema/batch proxies
validate_recipe = _LazyProxy("validate_recipe", lambda: _import_schema_and_batch()[0])
load_config = _LazyProxy("load_config", lambda: _import_schema_and_batch()[1])
build_from_yaml = _LazyProxy("build_from_yaml", lambda: _import_schema_and_batch()[2])
