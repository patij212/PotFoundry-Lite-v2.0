"""Utility functions for validation.

This module contains helper functions for value coercion, error formatting,
and other validation utilities.
"""

from __future__ import annotations

from typing import Any, Union


def coerce_positive_float(
    value: Any,
    name: str = "value",
    min_val: float = 0.0,
    max_val: float = float('inf'),
) -> float:
    """Coerce value to positive float with range checking.

    Args:
        value: Value to coerce
        name: Parameter name for error messages
        min_val: Minimum allowed value (default: 0.0)
        max_val: Maximum allowed value (default: infinity)

    Returns:
        Coerced float value

    Raises:
        ValueError: If value cannot be coerced or is out of range
    """
    try:
        f = float(value)
    except (TypeError, ValueError) as e:
        raise ValueError(f"{name} must be convertible to float: {e}")
    
    if f < min_val:
        raise ValueError(f"{name} must be >= {min_val}, got {f}")
    if f > max_val:
        raise ValueError(f"{name} must be <= {max_val}, got {f}")
    
    return f


def coerce_positive_int(
    value: Any,
    name: str = "value",
    min_val: int = 0,
    max_val: int = 2**31 - 1,
) -> int:
    """Coerce value to positive integer with range checking.

    Args:
        value: Value to coerce
        name: Parameter name for error messages
        min_val: Minimum allowed value (default: 0)
        max_val: Maximum allowed value (default: max int)

    Returns:
        Coerced integer value

    Raises:
        ValueError: If value cannot be coerced or is out of range
    """
    try:
        i = int(value)
    except (TypeError, ValueError) as e:
        raise ValueError(f"{name} must be convertible to integer: {e}")
    
    if i < min_val:
        raise ValueError(f"{name} must be >= {min_val}, got {i}")
    if i > max_val:
        raise ValueError(f"{name} must be <= {max_val}, got {i}")
    
    return i


def format_validation_error(
    param_name: str,
    value: Any,
    constraint: str,
    suggestion: str = "",
) -> str:
    """Format a validation error message.

    Args:
        param_name: Name of the parameter that failed validation
        value: The invalid value
        constraint: Description of the constraint that was violated
        suggestion: Optional suggestion for fixing the error

    Returns:
        Formatted error message
    """
    msg = f"Invalid {param_name}: {value!r} {constraint}"
    if suggestion:
        msg += f". {suggestion}"
    return msg


def validate_range(
    value: Union[int, float],
    name: str,
    min_val: Union[int, float, None] = None,
    max_val: Union[int, float, None] = None,
    inclusive: bool = True,
) -> Union[int, float]:
    """Validate that a numeric value is within a specified range.

    Args:
        value: Value to validate
        name: Parameter name for error messages
        min_val: Minimum allowed value (None = no minimum)
        max_val: Maximum allowed value (None = no maximum)
        inclusive: Whether range bounds are inclusive (default: True)

    Returns:
        The validated value (unchanged)

    Raises:
        ValueError: If value is out of range
    """
    if min_val is not None:
        if inclusive and value < min_val:
            raise ValueError(f"{name} must be >= {min_val}, got {value}")
        elif not inclusive and value <= min_val:
            raise ValueError(f"{name} must be > {min_val}, got {value}")
    
    if max_val is not None:
        if inclusive and value > max_val:
            raise ValueError(f"{name} must be <= {max_val}, got {value}")
        elif not inclusive and value >= max_val:
            raise ValueError(f"{name} must be < {max_val}, got {value}")
    
    return value


def validate_type(value: Any, expected_type: type, name: str) -> Any:
    """Validate that a value is of the expected type.

    Args:
        value: Value to validate
        expected_type: Expected type
        name: Parameter name for error messages

    Returns:
        The validated value (unchanged)

    Raises:
        TypeError: If value is not of expected type
    """
    if not isinstance(value, expected_type):
        raise TypeError(
            f"{name} must be {expected_type.__name__}, "
            f"got {type(value).__name__}"
        )
    return value


def clamp(
    value: Union[int, float],
    min_val: Union[int, float],
    max_val: Union[int, float],
) -> Union[int, float]:
    """Clamp a value to a range.

    Args:
        value: Value to clamp
        min_val: Minimum value
        max_val: Maximum value

    Returns:
        Clamped value (min_val <= result <= max_val)
    """
    return max(min_val, min(max_val, value))
