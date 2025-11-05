"""Utility functions for preview rendering."""

from __future__ import annotations

from typing import Any


def to_float_scalar(x: Any) -> float:
    """Coerce x to a float in a defensive way.
    
    Args:
        x: Value to convert to float
        
    Returns:
        Float value, or 0.0 if conversion fails
    """
    def _unwrap(v):
        if isinstance(v, (list, tuple)):
            try:
                return v[0]
            except Exception:
                return v
        return v
    
    try:
        v = _unwrap(x)
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, (str, bytes)):
            try:
                return float(v)
            except Exception:
                return 0.0
        try:
            return float(v)
        except Exception:
            return 0.0
    except Exception:
        try:
            return float(x)
        except Exception:
            return 0.0


def to_int_scalar(x: Any) -> int:
    """Coerce x to an int in a defensive way.
    
    Args:
        x: Value to convert to int
        
    Returns:
        Int value, or 0 if conversion fails
    """
    try:
        return int(to_float_scalar(x))
    except Exception:
        return 0
