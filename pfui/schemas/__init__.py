"""pfui.schemas package - Schema definitions and utilities.

This package provides schema definitions, validation, and normalization
for PotFoundry UI controls and style parameters.

Public API:
    Aliases:
        - get_global_aliases()
        - get_aliases_by_style()
        - get_global_reverse()
        - get_reverse_by_style()
    
    Data:
        - get_style_schemas()
        - get_global_controls()
        - get_canonical_controls()
        - get_canonical_style_schemas()
    
    Normalization:
        - normalize_style_opts()
        - to_canonical()
        - to_engine()
    
    Validation:
        - get_schema()
        - apply_defaults()
        - sanitize_opts()
        - warn_on_legacy_keys()
        - validate_keyset()
        - compress_opts()
        - check_schema_integrity()
        - ControlMeta (class)

Example:
    >>> import pfui.schemas as SC
    >>> schemas = SC.get_style_schemas()
    >>> SC.apply_defaults(config, schema)
"""

from __future__ import annotations

# Import all public APIs from submodules
from .aliases import (
    get_aliases_by_style,
    get_global_aliases,
    get_global_reverse,
    get_reverse_by_style,
)
from .data import (
    get_canonical_controls,
    get_canonical_style_schemas,
    get_global_controls,
    get_style_schemas,
)
from .normalize import normalize_style_opts, to_canonical, to_engine
from .validators import (
    ControlMeta,
    _coerce_one,  # private but exposed for tests
    apply_defaults,
    check_schema_integrity,
    compress_opts,
    get_schema,
    sanitize_opts,
    validate_keyset,
    warn_on_legacy_keys,
)

__all__ = [
    # Aliases
    "get_global_aliases",
    "get_aliases_by_style",
    "get_global_reverse",
    "get_reverse_by_style",
    # Data
    "get_style_schemas",
    "get_global_controls",
    "get_canonical_controls",
    "get_canonical_style_schemas",
    # Normalization
    "normalize_style_opts",
    "to_canonical",
    "to_engine",
    # Validation
    "get_schema",
    "apply_defaults",
    "sanitize_opts",
    "warn_on_legacy_keys",
    "validate_keyset",
    "compress_opts",
    "check_schema_integrity",
    "ControlMeta",
]
