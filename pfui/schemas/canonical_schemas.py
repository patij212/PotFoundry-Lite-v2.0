# pfui/schemas/canonical_schemas.py - Canonical schema views
"""Canonical (UI-friendly) versions of control schemas."""

from __future__ import annotations

from typing import Any, Dict, Mapping

from .aliases import GLOBAL_ALIASES as _GLOBAL_ALIASES
from .aliases import ALIASES_BY_STYLE as _ALIASES_BY_STYLE
from .global_controls import GLOBAL_CONTROLS
from .style_schemas import STYLE_SCHEMAS

__all__ = ["CANONICAL_CONTROLS", "CANONICAL_STYLE_SCHEMAS"]



def _build_canonical_schema() -> (
    tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Dict[str, Any]]]]
):
    """Construct canonical-keyed schema mirrors.

    Purpose:
        Remap legacy-keyed UI schema blocks to canonical-keyed views.

    Inputs:
        None (uses module-level schema dicts).

    Outputs:
        (canonical_globals, canonical_styles) where both are dicts keyed by canonical names.

    Guarantees:
        - Does not mutate the original schema dicts.

    Errors:
        - None.

    Example:
        CANONICAL_CONTROLS["twist_total_turns"] -> {..., "legacy": "spin_turns"}
    """

    def remap_block(
        block: Mapping[str, Mapping[str, Any]], alias_map: Mapping[str, str]
    ) -> Dict[str, Dict[str, Any]]:
        out: Dict[str, Dict[str, Any]] = {}
        for legacy_key, meta in block.items():
            canon_key = alias_map.get(legacy_key, legacy_key)
            m = dict(meta)
            m.setdefault("label", legacy_key)
            m.setdefault("help", "")
            m["legacy"] = legacy_key
            out[canon_key] = m
        return out

    canonical_globals = remap_block(GLOBAL_CONTROLS, _GLOBAL_ALIASES)
    canonical_styles: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for style, block in STYLE_SCHEMAS.items():
        canonical_styles[style] = remap_block(block, _ALIASES_BY_STYLE.get(style, {}))
    return canonical_globals, canonical_styles


CANONICAL_CONTROLS, CANONICAL_STYLE_SCHEMAS = _build_canonical_schema()

# =============================================================================
