"""Validation utilities for PotFoundry dimensions and parameters.

This package provides centralized validation logic shared across UI and YAML API.
All validation functions follow a consistent pattern:
- Return validated/coerced value on success
- Raise ValueError with descriptive message on failure
"""

from __future__ import annotations

from .dimensions import (
    validate_bottom_radius,
    validate_drain_radius,
    validate_height,
    validate_top_radius,
    validate_wall_thickness,
    validate_bottom_thickness,
    validate_dimensions_compatibility,
)
from .geometry import (
    validate_mesh_resolution,
    validate_exponent,
    validate_style_name,
)
from .utils import (
    coerce_positive_float,
    coerce_positive_int,
    format_validation_error,
)

__all__ = [
    # Dimension validators
    "validate_height",
    "validate_top_radius",
    "validate_bottom_radius",
    "validate_wall_thickness",
    "validate_bottom_thickness",
    "validate_drain_radius",
    "validate_dimensions_compatibility",
    # Geometry validators
    "validate_mesh_resolution",
    "validate_exponent",
    "validate_style_name",
    # Utilities
    "coerce_positive_float",
    "coerce_positive_int",
    "format_validation_error",
]
