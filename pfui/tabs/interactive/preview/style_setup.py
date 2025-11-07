"""Style function setup and configuration for preview rendering.

This module handles all style function initialization, adaptation, and
configuration for the preview system.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable, Union

try:
    from pfui.geometry_bridge import adapt_r_outer_fn
    from pfui.imports import STYLES

    IMPORTS_AVAILABLE = True
except ImportError:
    STYLES = {}

    def adapt_r_outer_fn(fn):
        return fn

    IMPORTS_AVAILABLE = False


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
    full_n_z: int,
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
        [Union[float, _ArrayLike], float, float, float, dict], Union[float, _ArrayLike]
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

    # Prepare options
    opts = dict(ui_opts)
    opts_json = json.dumps(opts, sort_keys=True)

    return StyleConfiguration(
        r_outer_fn=r_outer_fn,
        opts=opts,
        opts_json=opts_json,
        preview_n_theta=preview_n_theta,
        preview_n_z=preview_n_z,
        full_n_theta=full_n_theta,
        full_n_z=full_n_z,
    )
