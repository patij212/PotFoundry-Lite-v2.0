"""Validation utilities for geometry parameters.

This module contains validation for mesh resolution, style parameters,
and geometric properties.
"""

from __future__ import annotations

from typing import Any, Dict


def validate_mesh_resolution(
    n_theta: int,
    n_z: int,
    min_theta: int = 16,
    max_theta: int = 512,
    min_z: int = 8,
    max_z: int = 512,
) -> tuple[int, int]:
    """Validate mesh resolution parameters.

    Args:
        n_theta: Number of angular divisions (around pot)
        n_z: Number of vertical divisions (height)
        min_theta: Minimum angular divisions (default: 16)
        max_theta: Maximum angular divisions (default: 512)
        min_z: Minimum vertical divisions (default: 8)
        max_z: Maximum vertical divisions (default: 512)

    Returns:
        Tuple of (validated n_theta, validated n_z)

    Raises:
        ValueError: If resolution values are out of range
    """
    if not isinstance(n_theta, int):
        raise ValueError(f"n_theta must be an integer, got {type(n_theta).__name__}")
    if not isinstance(n_z, int):
        raise ValueError(f"n_z must be an integer, got {type(n_z).__name__}")

    if n_theta < min_theta:
        raise ValueError(
            f"n_theta {n_theta} too low (minimum: {min_theta} for smooth curves)"
        )
    if n_theta > max_theta:
        raise ValueError(
            f"n_theta {n_theta} too high (maximum: {max_theta} to avoid excessive mesh size)"
        )

    if n_z < min_z:
        raise ValueError(
            f"n_z {n_z} too low (minimum: {min_z} for vertical definition)"
        )
    if n_z > max_z:
        raise ValueError(
            f"n_z {n_z} too high (maximum: {max_z} to avoid excessive mesh size)"
        )

    # Warn about extreme mesh sizes
    total_vertices = n_theta * n_z
    if total_vertices > 100000:
        raise ValueError(
            f"Mesh resolution {n_theta}×{n_z} = {total_vertices:,} vertices too high. "
            f"Reduce resolution to avoid memory/performance issues (recommended: <100k vertices)."
        )

    return n_theta, n_z


def validate_exponent(
    expn: float,
    min_val: float = 0.3,
    max_val: float = 4.0,
) -> float:
    """Validate profile exponent (controls pot taper).

    Args:
        expn: Profile exponent value
        min_val: Minimum allowed exponent (default: 0.3 for very tapered)
        max_val: Maximum allowed exponent (default: 4.0 for very straight)

    Returns:
        Validated exponent value

    Raises:
        ValueError: If exponent is out of range
    """
    if not isinstance(expn, (int, float)):
        raise ValueError(f"Exponent must be a number, got {type(expn).__name__}")

    if expn <= 0:
        raise ValueError(f"Exponent must be positive, got {expn}")
    if expn < min_val:
        raise ValueError(f"Exponent {expn} too small (minimum: {min_val})")
    if expn > max_val:
        raise ValueError(f"Exponent {expn} too large (maximum: {max_val})")

    return float(expn)


def validate_style_name(style: str, available_styles: Dict[str, Any]) -> str:
    """Validate style name against available styles.

    Args:
        style: Style name to validate
        available_styles: Dictionary of available style names

    Returns:
        Validated style name (canonical form)

    Raises:
        ValueError: If style is not recognized
    """
    if not isinstance(style, str):
        raise ValueError(f"Style must be a string, got {type(style).__name__}")

    # Check exact match first
    if style in available_styles:
        return style

    # Try case-insensitive match
    style_lower = style.lower()
    for available_style in available_styles:
        if available_style.lower() == style_lower:
            return available_style

    # Not found - provide helpful error
    available_names = ", ".join(sorted(available_styles.keys()))
    raise ValueError(f"Unknown style '{style}'. Available styles: {available_names}")


def validate_style_parameters(
    style_name: str,
    params: Dict[str, Any],
    schema: Dict[str, Any],
) -> Dict[str, Any]:
    """Validate style-specific parameters against schema.

    Args:
        style_name: Name of the style
        params: Parameter dictionary to validate
        schema: Schema defining valid parameters and ranges

    Returns:
        Validated parameter dictionary (may include defaults)

    Raises:
        ValueError: If parameters are invalid
    """
    validated = {}

    # Check for unknown parameters
    for key in params:
        if key not in schema:
            valid_keys = ", ".join(sorted(schema.keys()))
            raise ValueError(
                f"Unknown parameter '{key}' for style '{style_name}'. "
                f"Valid parameters: {valid_keys}"
            )

    # Validate each parameter
    for key, spec in schema.items():
        value = params.get(key, spec.get("default"))

        if value is None and spec.get("required", False):
            raise ValueError(
                f"Required parameter '{key}' missing for style '{style_name}'"
            )

        if value is not None:
            # Type check
            expected_type = spec.get("type", float)
            if not isinstance(value, expected_type):
                raise ValueError(
                    f"Parameter '{key}' must be {expected_type.__name__}, "
                    f"got {type(value).__name__}"
                )

            # Range check
            if "min" in spec and value < spec["min"]:
                raise ValueError(
                    f"Parameter '{key}' value {value} below minimum {spec['min']}"
                )
            if "max" in spec and value > spec["max"]:
                raise ValueError(
                    f"Parameter '{key}' value {value} above maximum {spec['max']}"
                )

            validated[key] = value

    return validated
