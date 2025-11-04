"""Validation, defaults, compression, and integrity helpers.

Initial extraction that re-exports from the legacy module implementation.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Dict, List, Literal, Tuple, TypedDict


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

ControlType = Literal["int", "float", "bool", "text", "select"]


class ControlMeta(TypedDict, total=False):
    label: str
    help: str
    type: ControlType
    min: float | int
    max: float | int
    step: float | int
    default: object
    canonical: str
    options: list[str]
    units: str
    legacy: str


def get_schema(style: str, *, canonical: bool = False) -> Dict[str, ControlMeta]:
    return _legacy.get_schema(style, canonical=canonical)


def apply_defaults(style: str, opts: dict, *, canonical: bool = False) -> dict:
    return _legacy.apply_defaults(style, opts, canonical=canonical)


def sanitize_opts(
    style: str, opts: dict, *, canonical: bool = False
) -> Tuple[dict[str, object], list[str]]:
    return _legacy.sanitize_opts(style, opts, canonical=canonical)


def warn_on_legacy_keys(style: str, opts: dict) -> None:
    return _legacy.warn_on_legacy_keys(style, opts)


def validate_keyset(style: str, opts: dict, *, canonical: bool = False) -> list[str]:
    return _legacy.validate_keyset(style, opts, canonical=canonical)


def compress_opts(
    style: str,
    opts: dict,
    *,
    canonical: bool = True,
    drop_defaults: bool = True,
    round_to: int | None = 4,
) -> dict:
    return _legacy.compress_opts(
        style, opts, canonical=canonical, drop_defaults=drop_defaults, round_to=round_to
    )


def check_schema_integrity() -> List[str]:
    return _legacy.check_schema_integrity()


__all__ = [
    "ControlType",
    "ControlMeta",
    "get_schema",
    "apply_defaults",
    "sanitize_opts",
    "warn_on_legacy_keys",
    "validate_keyset",
    "compress_opts",
    "check_schema_integrity",
]
