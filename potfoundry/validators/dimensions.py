"""Validation utilities for pot dimensions.

This module contains validation functions for physical pot dimensions:
height, radii, thicknesses, and their compatibility relationships.
"""

from __future__ import annotations


def validate_height(H: float, min_val: float = 10.0, max_val: float = 500.0) -> float:
    """Validate pot height.

    Args:
        H: Height value in mm
        min_val: Minimum allowed height (default: 10mm)
        max_val: Maximum allowed height (default: 500mm)

    Returns:
        Validated height value

    Raises:
        ValueError: If height is out of range or invalid
    """
    if not isinstance(H, (int, float)):
        raise ValueError(f"Height must be a number, got {type(H).__name__}")
    if H <= 0:
        raise ValueError(f"Height must be positive, got {H}")
    if H < min_val:
        raise ValueError(f"Height {H}mm too small (minimum: {min_val}mm)")
    if H > max_val:
        raise ValueError(f"Height {H}mm too large (maximum: {max_val}mm)")
    return float(H)


def validate_top_radius(Rt: float, min_val: float = 10.0, max_val: float = 300.0) -> float:
    """Validate top radius.

    Args:
        Rt: Top radius value in mm
        min_val: Minimum allowed radius (default: 10mm)
        max_val: Maximum allowed radius (default: 300mm)

    Returns:
        Validated top radius value

    Raises:
        ValueError: If radius is out of range or invalid
    """
    if not isinstance(Rt, (int, float)):
        raise ValueError(f"Top radius must be a number, got {type(Rt).__name__}")
    if Rt <= 0:
        raise ValueError(f"Top radius must be positive, got {Rt}")
    if Rt < min_val:
        raise ValueError(f"Top radius {Rt}mm too small (minimum: {min_val}mm)")
    if Rt > max_val:
        raise ValueError(f"Top radius {Rt}mm too large (maximum: {max_val}mm)")
    return float(Rt)


def validate_bottom_radius(Rb: float, min_val: float = 10.0, max_val: float = 300.0) -> float:
    """Validate bottom radius.

    Args:
        Rb: Bottom radius value in mm
        min_val: Minimum allowed radius (default: 10mm)
        max_val: Maximum allowed radius (default: 300mm)

    Returns:
        Validated bottom radius value

    Raises:
        ValueError: If radius is out of range or invalid
    """
    if not isinstance(Rb, (int, float)):
        raise ValueError(f"Bottom radius must be a number, got {type(Rb).__name__}")
    if Rb <= 0:
        raise ValueError(f"Bottom radius must be positive, got {Rb}")
    if Rb < min_val:
        raise ValueError(f"Bottom radius {Rb}mm too small (minimum: {min_val}mm)")
    if Rb > max_val:
        raise ValueError(f"Bottom radius {Rb}mm too large (maximum: {max_val}mm)")
    return float(Rb)


def validate_wall_thickness(t_wall: float, min_val: float = 0.8, max_val: float = 10.0) -> float:
    """Validate wall thickness.

    Args:
        t_wall: Wall thickness value in mm
        min_val: Minimum allowed thickness (default: 0.8mm for 3D printing)
        max_val: Maximum allowed thickness (default: 10mm)

    Returns:
        Validated wall thickness value

    Raises:
        ValueError: If thickness is out of range or invalid
    """
    if not isinstance(t_wall, (int, float)):
        raise ValueError(f"Wall thickness must be a number, got {type(t_wall).__name__}")
    if t_wall <= 0:
        raise ValueError(f"Wall thickness must be positive, got {t_wall}")
    if t_wall < min_val:
        raise ValueError(f"Wall thickness {t_wall}mm too thin (minimum: {min_val}mm for 3D printing)")
    if t_wall > max_val:
        raise ValueError(f"Wall thickness {t_wall}mm too thick (maximum: {max_val}mm)")
    return float(t_wall)


def validate_bottom_thickness(t_bottom: float, min_val: float = 0.8, max_val: float = 10.0) -> float:
    """Validate bottom thickness.

    Args:
        t_bottom: Bottom thickness value in mm
        min_val: Minimum allowed thickness (default: 0.8mm for 3D printing)
        max_val: Maximum allowed thickness (default: 10mm)

    Returns:
        Validated bottom thickness value

    Raises:
        ValueError: If thickness is out of range or invalid
    """
    if not isinstance(t_bottom, (int, float)):
        raise ValueError(f"Bottom thickness must be a number, got {type(t_bottom).__name__}")
    if t_bottom <= 0:
        raise ValueError(f"Bottom thickness must be positive, got {t_bottom}")
    if t_bottom < min_val:
        raise ValueError(f"Bottom thickness {t_bottom}mm too thin (minimum: {min_val}mm for 3D printing)")
    if t_bottom > max_val:
        raise ValueError(f"Bottom thickness {t_bottom}mm too thick (maximum: {max_val}mm)")
    return float(t_bottom)


def validate_drain_radius(r_drain: float, Rb: float, t_wall: float, min_val: float = 0.0, max_val: float = 50.0) -> float:
    """Validate drain hole radius.

    Args:
        r_drain: Drain hole radius in mm
        Rb: Bottom radius for compatibility check
        t_wall: Wall thickness for compatibility check
        min_val: Minimum allowed radius (default: 0mm for no drain)
        max_val: Maximum allowed radius (default: 50mm)

    Returns:
        Validated drain radius value

    Raises:
        ValueError: If radius is out of range or incompatible with pot dimensions
    """
    if not isinstance(r_drain, (int, float)):
        raise ValueError(f"Drain radius must be a number, got {type(r_drain).__name__}")
    if r_drain < 0:
        raise ValueError(f"Drain radius cannot be negative, got {r_drain}")
    if r_drain < min_val:
        raise ValueError(f"Drain radius {r_drain}mm too small (minimum: {min_val}mm)")
    if r_drain > max_val:
        raise ValueError(f"Drain radius {r_drain}mm too large (maximum: {max_val}mm)")
    
    # Check compatibility with bottom radius and wall thickness
    max_drain = Rb - t_wall
    if r_drain > max_drain:
        raise ValueError(
            f"Drain radius {r_drain}mm too large for bottom radius {Rb}mm "
            f"and wall thickness {t_wall}mm (maximum: {max_drain:.1f}mm)"
        )
    
    return float(r_drain)


def validate_dimensions_compatibility(
    H: float,
    Rt: float,
    Rb: float,
    t_wall: float,
    t_bottom: float,
    r_drain: float = 0.0,
) -> None:
    """Validate that all dimensions are compatible with each other.

    This performs cross-dimensional validation to ensure the pot can be
    physically manufactured without issues.

    Args:
        H: Height in mm
        Rt: Top radius in mm
        Rb: Bottom radius in mm
        t_wall: Wall thickness in mm
        t_bottom: Bottom thickness in mm
        r_drain: Drain hole radius in mm (default: 0)

    Raises:
        ValueError: If dimensions are incompatible
    """
    # Wall thickness must not exceed radii
    if t_wall >= Rt:
        raise ValueError(
            f"Wall thickness {t_wall}mm must be less than top radius {Rt}mm"
        )
    if t_wall >= Rb:
        raise ValueError(
            f"Wall thickness {t_wall}mm must be less than bottom radius {Rb}mm"
        )
    
    # Bottom thickness check (reasonable limit)
    if t_bottom > H / 4:
        raise ValueError(
            f"Bottom thickness {t_bottom}mm too large for height {H}mm "
            f"(should be < {H/4:.1f}mm)"
        )
    
    # Drain hole must fit within bottom
    if r_drain > 0:
        max_drain = Rb - t_wall
        if r_drain > max_drain:
            raise ValueError(
                f"Drain radius {r_drain}mm too large for bottom radius {Rb}mm "
                f"and wall thickness {t_wall}mm (maximum: {max_drain:.1f}mm)"
            )
    
    # Aspect ratio check (warn if extreme)
    aspect_ratio = H / max(Rt, Rb)
    if aspect_ratio > 10:
        raise ValueError(
            f"Aspect ratio {aspect_ratio:.1f} too extreme (height {H}mm / radius {max(Rt, Rb)}mm). "
            f"Reduce height or increase radius for printability."
        )
    if aspect_ratio < 0.2:
        raise ValueError(
            f"Aspect ratio {aspect_ratio:.2f} too flat (height {H}mm / radius {max(Rt, Rb)}mm). "
            f"Increase height or reduce radius for structural integrity."
        )
