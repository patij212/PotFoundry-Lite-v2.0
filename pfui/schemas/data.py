"""Schema data accessors (globals and per-style).

Provides direct access to schema data from the package modules.
"""

from __future__ import annotations

from typing import Mapping

from .canonical_schemas import CANONICAL_CONTROLS, CANONICAL_STYLE_SCHEMAS
from .global_controls import GLOBAL_CONTROLS
from .style_schemas import STYLE_SCHEMAS

# Re-export for backward compatibility
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


# Accessor functions (for API compatibility)
def get_style_schemas() -> Mapping[str, Mapping[str, Mapping[str, object]]]:
    """Return the STYLE_SCHEMAS mapping."""
    return STYLE_SCHEMAS


def get_global_controls() -> Mapping[str, Mapping[str, object]]:
    """Return the GLOBAL_CONTROLS mapping."""
    return GLOBAL_CONTROLS


def get_canonical_controls() -> Mapping[str, Mapping[str, object]]:
    """Return the CANONICAL_CONTROLS mapping."""
    return CANONICAL_CONTROLS


def get_canonical_style_schemas() -> Mapping[str, Mapping[str, Mapping[str, object]]]:
    """Return the CANONICAL_STYLE_SCHEMAS mapping."""
    return CANONICAL_STYLE_SCHEMAS


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
