"""Utility functions for sidebar rendering."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from typing import Any, cast

from pfui._st import get_effective_st as get_st

# Module-level logger
_logger = logging.getLogger(__name__)


def unwrap_scalar(v: Any) -> Any:
    """If v is a list/tuple, return its first element; otherwise return v.

    Annotated to help static analysis (Pylance) reason about downstream
    conversions.
    
    Args:
        v: Value to unwrap
        
    Returns:
        Unwrapped value (first element if list/tuple, otherwise original)

    """
    if isinstance(v, (list, tuple)):
        try:
            return v[0]
        except (IndexError, TypeError):
            return v
    return v


def to_int_scalar(x: Any) -> int:
    """Coerce x to an int in a defensive, editor-friendly way.

    - Unwrap list/tuple-like containers.
    - If the resulting value is a primitive known to be convertible to
      float (int/float/str/bytes), call float(x) safely and cast to int.
    - Otherwise, attempt best-effort conversions with exception guards.
    
    Args:
        x: Value to convert to int
        
    Returns:
        Int value, or 0 if conversion fails

    """
    try:
        xv = unwrap_scalar(x)
        if isinstance(xv, (int, float)):
            return int(xv)
        if isinstance(xv, (str, bytes)):
            try:
                return int(float(xv))
            except (ValueError, TypeError):
                return 0
        # Last-resort: attempt float coercion then int
        try:
            return int(float(xv))
        except (ValueError, TypeError):
            return 0
    except (ValueError, TypeError, AttributeError):
        try:
            return int(x)  # best-effort fallback
        except (ValueError, TypeError):
            return 0


def to_float_scalar(x: Any) -> float:
    """Coerce x to a float in a defensive, editor-friendly way.

    - Unwrap list/tuple-like containers.
    - If x is already int/float/str/bytes, call float(x).
    - Otherwise, attempt a best-effort conversion and fall back to 0.0 on error.
    
    Args:
        x: Value to convert to float
        
    Returns:
        Float value, or 0.0 if conversion fails

    """
    try:
        v = unwrap_scalar(x)
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, (str, bytes)):
            try:
                return float(v)
            except (ValueError, TypeError):
                return 0.0
        # Last-resort numeric coercion
        try:
            return float(v)
        except (ValueError, TypeError):
            return 0.0
    except (ValueError, TypeError, AttributeError):
        try:
            return float(x)
        except (ValueError, TypeError):
            return 0.0


def create_change_marker(on_change_callback: Callable[[], None] | None = None) -> Callable[[], None]:
    """Create a change marker function that updates timestamps and triggers callbacks.
    
    Args:
        on_change_callback: Optional callback to trigger when inputs change
        
    Returns:
        Function that marks changes in session state

    """
    def _mark_changed() -> None:
        st = get_st()
        ss = cast("dict[str, Any]", st.session_state)
        try:
            ss["_last_change_ts"] = time.time()
            # Only mark preview as stale if we're in manual or debounced
            # modes. In auto mode previews update immediately so we
            # shouldn't mark them stale.
            mode = cast("str", ss.get("preview_mode", "manual"))
            if mode in ("manual", "debounced"):
                ss["_preview_stale"] = True
            else:
                ss["_preview_stale"] = False
        except (KeyError, TypeError, AttributeError) as e:
            _logger.debug("Could not mark change: %s", e)

        # Call the external callback if provided
        if on_change_callback is not None:
            try:
                on_change_callback()
            except Exception as e:
                _logger.debug("Change callback error: %s", e)

    return _mark_changed

