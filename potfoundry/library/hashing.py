"""Content hashing and canonical payload generation.

Provides functions for generating content-addressed identifiers
and normalizing design payloads for deduplication.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, List


__all__ = [
    "APP_VERSION",
    "canonical_payload",
    "content_id",
    "_normalize_dict",  # Exported for testing
]


# Version constant
APP_VERSION = "2.0.0"


def _round_float(value: float, precision: int = 6) -> float:
    """Round float to specified precision, removing trailing zeros."""
    return round(value, precision)


def _normalize_dict(d: dict[str, Any], precision: int = 6) -> dict[str, Any]:
    """Recursively normalize dictionary: round floats, sort keys.
    
    Args:
        d: Dictionary to normalize
        precision: Float rounding precision
        
    Returns:
        Normalized dictionary with sorted keys and rounded floats
    """
    result: dict[str, Any] = {}
    for key in sorted(d.keys()):
        value = d[key]
        if isinstance(value, dict):
            # child dicts normalize to dict[str, Any]
            result[key] = _normalize_dict(value, precision)
        elif isinstance(value, (list, tuple)):
            # normalize list/tuple entries; ensure Any typing for heterogenous lists
            out_list: List[Any] = []
            for v in value:
                if isinstance(v, dict):
                    out_list.append(_normalize_dict(v, precision))
                elif isinstance(v, float):
                    out_list.append(_round_float(v, precision))
                else:
                    out_list.append(v)
            result[key] = out_list
        elif isinstance(value, float):
            result[key] = _round_float(value, precision)
        else:
            result[key] = value
    return result


def canonical_payload(
    style: str,
    size: dict,
    opts: dict,
    mesh: dict,
    diagnostics: dict,
    license: str,
    version: str = APP_VERSION,
) -> dict:
    """Generate canonical payload with normalized floats and sorted keys.

    Normalizes all floating point values and sorts dictionary keys
    to ensure consistent hashing across equivalent designs.

    Args:
        style: Style name (e.g., "HarmonicRipple")
        size: Size parameters dict (H, Rt, Rb, etc.)
        opts: Style-specific options dict
        mesh: Mesh quality parameters dict (n_theta, n_z)
        diagnostics: Diagnostics dict (triangle_count, etc.)
        license: License identifier
        version: App version string

    Returns:
        Canonical payload dictionary with normalized values
    """
    payload = {
        "version": version,
        "style": style,
        "size": _normalize_dict(size),
        "opts": _normalize_dict(opts),
        "mesh": _normalize_dict(mesh),
        "diagnostics": _normalize_dict(diagnostics),
        "license": license,
    }
    return payload


def content_id(payload: dict) -> str:
    """Generate content-addressed ID (sha256 of canonical JSON).

    Creates a deterministic hash of the payload that serves as
    a unique identifier for the design content.

    Args:
        payload: Canonical payload dictionary

    Returns:
        Hex-encoded sha256 hash (64 characters)
    """
    # Serialize to canonical JSON (sorted keys, no whitespace)
    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))

    # Hash UTF-8 bytes
    hash_bytes = hashlib.sha256(canonical_json.encode("utf-8")).digest()

    # Return hex string
    return hash_bytes.hex()
