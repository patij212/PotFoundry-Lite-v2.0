"""Normalization between legacy (engine) and canonical (UI/export) keys.

Provides normalization functions that convert between key formats.
"""

from __future__ import annotations

from typing import Literal

from .aliases import normalize_style_opts as _normalize
from .aliases import to_canonical as _to_canonical
from .aliases import to_engine as _to_engine

Direction = Literal["to_canonical", "to_engine", "both"]


def normalize_style_opts(
    style: str,
    opts: dict | None,
    direction: Direction = "to_canonical",
    *,
    strip_alt: bool = False,
) -> dict:
    """Normalize style options between legacy and canonical key formats.
    
    See aliases.normalize_style_opts for full documentation.
    """
    return _normalize(style, opts, direction, strip_alt=strip_alt)


def to_canonical(style: str, opts: dict | None) -> dict:
    """Convert style options to canonical key format.
    
    See aliases.to_canonical for full documentation.
    """
    return _to_canonical(style, opts)


def to_engine(style: str, opts: dict | None) -> dict:
    """Convert style options to legacy/engine key format.
    
    See aliases.to_engine for full documentation.
    """
    return _to_engine(style, opts)


__all__ = [
    "Direction",
    "normalize_style_opts",
    "to_canonical",
    "to_engine",
]
