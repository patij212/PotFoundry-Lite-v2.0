# pfui/schemas/utils.py - Schema utility functions
"""Utility functions for schema compression and integrity checking."""

from __future__ import annotations

__all__ = ["check_schema_integrity", "compress_opts"]


def compress_opts(opts: dict) -> dict:
    """Remove keys with falsy values (0, False, empty string).

    Purpose:
        Reduce storage size for exported options by dropping zero/false/empty.

    Inputs:
        opts: dict - option dictionary.

    Outputs:
        dict - compressed dictionary.

    Guarantees:
        - Does not mutate input.
        - Preserves truthy values.

    Errors:
        - None.

    Example:
        compress_opts({"a": 0, "b": 5}) -> {"b": 5}

    """
    return {k: v for k, v in opts.items() if v}


def check_schema_integrity() -> list[str]:
    """Validate internal consistency between alias maps and schema blocks.

    Returns:
        list[str]: problems found (empty if OK).

    """
    from .aliases import ALIASES_BY_STYLE, GLOBAL_ALIASES
    from .global_controls import GLOBAL_CONTROLS
    from .style_schemas import STYLE_SCHEMAS

    problems: list[str] = []
    # 1) Every legacy global alias key should exist in GLOBAL_CONTROLS (since UI is legacy-keyed).
    for k in GLOBAL_ALIASES.keys():
        if k not in GLOBAL_CONTROLS:
            problems.append(
                f"GLOBAL_ALIASES legacy key missing from GLOBAL_CONTROLS: {k}",
            )
    # 2) For each style, every legacy key in ALIASES_BY_STYLE[style] should exist in STYLE_SCHEMAS[style].
    for style, amap in ALIASES_BY_STYLE.items():
        block = STYLE_SCHEMAS.get(style, {})
        for legacy_key in amap.keys():
            if legacy_key not in block:
                problems.append(
                    f"{style}: alias legacy key missing from STYLE_SCHEMAS: {legacy_key}",
                )
    return problems
