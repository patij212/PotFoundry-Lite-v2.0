"""Schema data accessors (globals and per-style).

Initial extraction that re-exports constants and accessors from the legacy
module to maintain behavior while structuring the package.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Mapping


def _load_legacy() -> ModuleType:
    pkg_dir = Path(__file__).resolve().parent
    legacy_path = pkg_dir.parent / "schemas.py"
    spec = importlib.util.spec_from_file_location(
        "pfui._schemas_legacy", str(legacy_path)
    )
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load legacy schemas module at {legacy_path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_legacy = _load_legacy()

# Public schema blocks (read-only MappingProxyType in legacy)
GLOBAL_CONTROLS: Mapping[str, Mapping[str, object]] = _legacy.GLOBAL_CONTROLS
STYLE_SCHEMAS: Mapping[str, Mapping[str, Mapping[str, object]]] = _legacy.STYLE_SCHEMAS
CANONICAL_CONTROLS: Mapping[str, Mapping[str, object]] = _legacy.CANONICAL_CONTROLS
CANONICAL_STYLE_SCHEMAS: Mapping[str, Mapping[str, Mapping[str, object]]] = (
    _legacy.CANONICAL_STYLE_SCHEMAS
)


# Accessors (re-exported)
def get_style_schemas() -> Mapping[str, Mapping[str, Mapping[str, object]]]:
    return _legacy.get_style_schemas()


def get_global_controls() -> Mapping[str, Mapping[str, object]]:
    return _legacy.get_global_controls()


def get_canonical_controls() -> Mapping[str, Mapping[str, object]]:
    return _legacy.get_canonical_controls()


def get_canonical_style_schemas() -> Mapping[str, Mapping[str, Mapping[str, object]]]:
    return _legacy.get_canonical_style_schemas()


__all__ = [
    "GLOBAL_CONTROLS",
    "STYLE_SCHEMAS",
    "CANONICAL_CONTROLS",
    "CANONICAL_STYLE_SCHEMAS",
    "get_style_schemas",
    "get_global_controls",
    "get_canonical_controls",
    "get_canonical_style_schemas",
]
