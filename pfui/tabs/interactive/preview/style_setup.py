"""Style function setup and configuration for preview rendering.

This module handles all style function initialization, adaptation, and
configuration for the preview system.
"""

from __future__ import annotations
import json
from typing import Any, Callable, Union
from dataclasses import dataclass


try:
    from pfui.imports import STYLES
    from pfui.geometry_bridge import adapt_r_outer_fn
    IMPORTS_AVAILABLE = True
except ImportError:
    STYLES = {}
    def adapt_r_outer_fn(fn):
        return fn
    IMPORTS_AVAILABLE = False

# Normalization helper (map canonical UI keys -> engine keys)
try:
    import pfui.schemas as SC  # type: ignore
    _HAS_SCHEMAS = True
except Exception:
    SC = None  # type: ignore
    _HAS_SCHEMAS = False


# Type aliases for array-like types (avoiding numpy dependency)
_ArrayLike = Any


@dataclass
class StyleConfiguration:
    """Container for style configuration results."""
    
    r_outer_fn: Callable
    opts: dict[str, Any]
    opts_json: str
    preview_n_theta: int
    preview_n_z: int
    full_n_theta: int
    full_n_z: int


def setup_preview_style(
    style_name: str,
    ui_opts: dict[str, Any],
    preview_n_theta: int,
    preview_n_z: int,
    full_n_theta: int,
    full_n_z: int
) -> StyleConfiguration:
    """Setup style function and configuration for preview.
    
    This function:
    1. Looks up the raw style function
    2. Adapts it for consistent scalar/vector handling
    3. Prepares options dictionary and JSON serialization
    4. Returns all configuration needed for rendering
    
    Args:
        style_name: Name of the style (e.g., "PetalWave")
        ui_opts: UI options dictionary from session state
        preview_n_theta: Preview theta resolution
        preview_n_z: Preview z resolution
        full_n_theta: Full preview theta resolution
        full_n_z: Full preview z resolution
        
    Returns:
        StyleConfiguration object with all setup results
        
    Example:
        >>> config = setup_preview_style("PetalWave", {}, 84, 42, 168, 84)
        >>> mesh = build_pot_mesh(..., config.r_outer_fn, config.opts, ...)
    """
    # Type alias for style function signature
    ROuterFn = Callable[
        [Union[float, _ArrayLike], float, float, float, dict], 
        Union[float, _ArrayLike]
    ]
    
    # Get raw style function
    if IMPORTS_AVAILABLE and style_name in STYLES:
        _r_outer_raw = STYLES[style_name][0]
    else:
        # Fallback to identity function
        def _r_outer_raw(theta, z, H, Rb, opts):
            return Rb
    
    # Adapt for consistent scalar/vector handling
    r_outer_fn = adapt_r_outer_fn(_r_outer_raw)
    
    # Prepare options (normalize to engine keyspace for geometry)
    if _HAS_SCHEMAS:
        try:
            opts = SC.to_engine(style_name, dict(ui_opts))
        except Exception:
            opts = dict(ui_opts)
    else:
        opts = dict(ui_opts)
    opts_json = json.dumps(opts, sort_keys=True)
    # If global twist is enabled in session, wrap the r_outer_fn so that a
    # global spin/twist is applied after the style function. This allows a
    # user to apply a uniform twist to all styles without changing each
    # style's options.
    try:
        import streamlit as _st
        from pfui.imports import _spin_twist_radians

        g_enabled = bool(_st.session_state.get("global_spin_enable", False))
        if g_enabled:
            # Read global params (fall back to defaults)
            g_turns = float(_st.session_state.get("global_spin_turns", 0.0) or 0.0)
            g_phase = float(_st.session_state.get("global_spin_phase_deg", 0.0) or 0.0)
            g_curve = float(_st.session_state.get("global_spin_curve_exp", 1.0) or 1.0)

            def _global_spin_twist_radians(z_val: float, H_val: float) -> float:
                # Use the geometry-level helper if available for consistency
                try:
                    return float(_spin_twist_radians(z_val, H_val, {"spin_turns": g_turns, "spin_phase_deg": g_phase, "spin_curve_exp": g_curve}))
                except Exception:
                    # Fallback: compute linear turns -> radians
                    return float((g_turns * (z_val / max(H_val, 1e-9)) + (g_phase / 360.0)) * 2.0 * 3.141592653589793)

            # Wrap r_outer_fn to rotate theta by the global twist amount at height z
            def _wrapped_r_outer(theta, z, H_, Rb_, opts_):
                try:
                    delta = _global_spin_twist_radians(z, H_)
                    return r_outer_fn(theta - delta, z, H_, Rb_, opts_)
                except Exception:
                    return r_outer_fn(theta, z, H_, Rb_, opts_)

            r_outer_fn = _wrapped_r_outer
    except Exception:
        # If anything goes wrong, just use the original r_outer_fn
        pass

    return StyleConfiguration(
        r_outer_fn=r_outer_fn,
        opts=opts,
        opts_json=opts_json,
        preview_n_theta=preview_n_theta,
        preview_n_z=preview_n_z,
        full_n_theta=full_n_theta,
        full_n_z=full_n_z,
    )
