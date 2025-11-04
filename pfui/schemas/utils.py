# pfui/schemas/utils.py - Schema utility functions
"""Utility functions for schema compression and integrity checking."""

from __future__ import annotations

from typing import Any, Dict

from .base import ControlMeta

__all__ = ["compress_opts", "check_schema_integrity"]

# =============================================================================


def _freeze_meta(d: Mapping[str, Any]) -> MappingProxyType:
    """Return an immutable view of control meta; freeze options to tuple if present."""
    frozen = dict(d)
    if "options" in frozen and isinstance(frozen["options"], list):
        frozen["options"] = tuple(frozen["options"])
    return MappingProxyType(frozen)


def _freeze_block(block: Mapping[str, Mapping[str, Any]]) -> MappingProxyType:
    """Freeze a block mapping key -> meta.

    Accept Mapping inputs (including MappingProxyType) so callers that
    pass already-frozen mappings don't trigger mypy arg-type errors.
    """
    return MappingProxyType({k: _freeze_meta(v) for k, v in block.items()})


def _freeze_style_map(
    style_map: Mapping[str, Mapping[str, Mapping[str, Any]]],
) -> MappingProxyType:
    """Freeze style -> (key -> meta) mapping.

    Accept Mapping inputs to be compatible with already-frozen structures.
    """
    return MappingProxyType({style: _freeze_block(b) for style, b in style_map.items()})


def check_schema_integrity() -> list[str]:
    """Validate internal consistency between alias maps and schema blocks.

    Returns:
        list[str]: problems found (empty if OK).
    """
    problems: list[str] = []
    # 1) Every legacy global alias key should exist in GLOBAL_CONTROLS (since UI is legacy-keyed).
    for k in GLOBAL_ALIASES.keys():
        if k not in GLOBAL_CONTROLS:
            problems.append(
                f"GLOBAL_ALIASES legacy key missing from GLOBAL_CONTROLS: {k}"
            )
    # 2) For each style, every legacy key in ALIASES_BY_STYLE[style] should exist in STYLE_SCHEMAS[style].
    for style, amap in ALIASES_BY_STYLE.items():
        block = STYLE_SCHEMAS.get(style, {})
        for legacy_key in amap.keys():
            if legacy_key not in block:
                problems.append(
                    f"{style}: alias legacy key missing from STYLE_SCHEMAS: {legacy_key}"
                )
    return problems


# Freeze alias maps (and their reverses) to avoid runtime mutation.
GLOBAL_ALIASES: Mapping[str, str] = MappingProxyType(dict(_GLOBAL_ALIASES))
ALIASES_BY_STYLE: Mapping[str, Mapping[str, str]] = MappingProxyType(
    {k: MappingProxyType(v) for k, v in _ALIASES_BY_STYLE.items()}
)
GLOBAL_REVERSE: Mapping[str, str] = MappingProxyType(dict(_GLOBAL_REVERSE))
REVERSE_BY_STYLE: Mapping[str, Mapping[str, str]] = MappingProxyType(
    {k: MappingProxyType(v) for k, v in _REVERSE_BY_STYLE.items()}
)

# Build canonical mirrors before freezing schema blocks deeply.
# (Use the previously-created private canonical mirrors: _CANONICAL_CONTROLS/_CANONICAL_STYLE_SCHEMAS)

# Deep-freeze schema dicts (blocks and inner meta).
GLOBAL_CONTROLS: Mapping[str, Mapping[str, Any]] = _freeze_block(_GLOBAL_CONTROLS)
STYLE_SCHEMAS: Mapping[str, Mapping[str, Mapping[str, Any]]] = _freeze_style_map(
    _STYLE_SCHEMAS
)
CANONICAL_CONTROLS: Mapping[str, Mapping[str, Any]] = _freeze_block(_CANONICAL_CONTROLS)
CANONICAL_STYLE_SCHEMAS: Mapping[str, Mapping[str, Mapping[str, Any]]] = (
    _freeze_style_map(_CANONICAL_STYLE_SCHEMAS)
)


# Conservative accessors for large schema constants. Callers should prefer
# these to importing the raw MappingProxyType objects directly (reduces
# import-time noise for type-checkers and editors).
def get_style_schemas() -> Mapping[str, Mapping[str, Mapping[str, Any]]]:
    """Return the per-style schema mapping (legacy-keyed blocks).

    Brief:
        Provide an import-light accessor that returns the per-style UI schema
        blocks. Each style maps to a dict of legacy-keyed control metadata
        (ControlMeta-like dicts). Callers who only need read access should use
        this function instead of importing `STYLE_SCHEMAS` directly.

    Args:
        None

    Returns:
        Mapping[str, Mapping[str, Mapping[str, Any]]]: Read-only mapping of
            style -> key -> control metadata.

    Raises:
        None

    Example:
        >>> ss = get_style_schemas()
        >>> 'HarmonicRipple' in ss
        True

    Performance:
        Returns a MappingProxyType view; inexpensive to call and suitable for
        use in editor/type-checker friendly code paths.
    """
    return STYLE_SCHEMAS


def get_global_controls() -> Mapping[str, Mapping[str, Any]]:
    """Return the global (legacy-keyed) control block.

    Brief:
        Accessor for global UI controls (legacy-keyed). Each returned value is
        a control metadata mapping (see `ControlMeta`). This accessor should
        be preferred over importing `GLOBAL_CONTROLS` directly to avoid
        heavy import-time coupling.

    Args:
        None

    Returns:
        Mapping[str, Mapping[str, Any]]: Read-only mapping of legacy key ->
            control metadata.

    Raises:
        None

    Example:
        >>> gc = get_global_controls()
        >>> gc['spin_turns']['canonical']
        'twist_total_turns'

    Performance:
        Constant-time return of a MappingProxyType; callers should not
        attempt to mutate the returned mapping.
    """
    return GLOBAL_CONTROLS


def get_canonical_controls() -> Mapping[str, Mapping[str, Any]]:
    """Return the canonical-keyed global control block.

    Brief:
        Accessor returning the global controls keyed by their canonical names
        (human-friendly UI/export naming). The returned items include a
        "legacy" field that records the original legacy key.

    Args:
        None

    Returns:
        Mapping[str, Mapping[str, Any]]: Read-only canonical-keyed control
            metadata mapping.

    Raises:
        None

    Example:
        >>> cc = get_canonical_controls()
        >>> cc['twist_total_turns']['legacy']
        'spin_turns'

    Performance:
        Lightweight accessor returning an immutable view; suitable for use in
        documentation generation and export code paths.
    """
    return CANONICAL_CONTROLS


def get_canonical_style_schemas() -> Mapping[str, Mapping[str, Mapping[str, Any]]]:
    """Return canonical-keyed style schema views.

    Brief:
        Return per-style schema blocks keyed by canonical names. Each block's
        entries include a "legacy" field to map back to the original
        legacy key. Use this accessor when preparing export-ready option
        dictionaries or documentation.

    Args:
        None

    Returns:
        Mapping[str, Mapping[str, Mapping[str, Any]]]: Read-only mapping of
            style -> canonical-key -> control metadata.

    Raises:
        None

    Example:
        >>> css = get_canonical_style_schemas()
        >>> css['HarmonicRipple']['petals_count']['legacy']
        'hr_petals'

    Performance:
        Returns an existing MappingProxyType; cheap to call and safe for use in
        import-light code.
    """
    return CANONICAL_STYLE_SCHEMAS
