"""Normalization between legacy (engine) and canonical (UI/export) keys.

This initial extraction re-exports implementations from the legacy module.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Literal


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

Direction = Literal["to_canonical", "to_engine", "both"]


def normalize_style_opts(
    style: str,
    opts: dict | None,
    direction: Direction = "to_canonical",
    *,
    strip_alt: bool = False,
) -> dict:
    return _legacy.normalize_style_opts(style, opts, direction, strip_alt=strip_alt)


def to_canonical(style: str, opts: dict | None) -> dict:
    return _legacy.to_canonical(style, opts)


def to_engine(style: str, opts: dict | None) -> dict:
    return _legacy.to_engine(style, opts)


__all__ = [
    "Direction",
    "normalize_style_opts",
    "to_canonical",
    "to_engine",
]
