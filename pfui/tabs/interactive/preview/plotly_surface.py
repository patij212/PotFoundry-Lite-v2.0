"""Quick preview rendering using Plotly surface plots."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any, cast

try:
    import plotly.graph_objects as go
    HAS_PLOTLY = True
except ImportError:
    HAS_PLOTLY = False


def render_quick_preview_surface(
    X: Any,
    Y: Any,
    Z: Any,
    preview_n_theta: int,
    preview_n_z: int,
    fig_h: float,
    place_on_ground: bool,
    ss: dict[str, Any],
    preview_placeholder: Any,
    to_float_scalar: Callable[[Any], float],
    to_int_scalar: Callable[[Any], int],
) -> None:
    """Render quick preview using Plotly surface plot.
    
    Args:
        X: X coordinate array
        Y: Y coordinate array
        Z: Z coordinate array
        preview_n_theta: Preview angular divisions
        preview_n_z: Preview vertical divisions
        fig_h: Figure height multiplier
        place_on_ground: Whether to place on ground
        ss: Session state dictionary
        preview_placeholder: Streamlit placeholder for preview
        to_float_scalar: Function to convert to float scalar
        to_int_scalar: Function to convert to int scalar

    """
    if not HAS_PLOTLY or X is None or Y is None or Z is None:
        return

    t0_surface = time.time()

    # Build colorscale for Quick preview from Appearance & Preview Settings
    use_grad_q = bool(cast("Any", ss.get("use_gradient_color", True)))
    solid_hex_q = str(cast("Any", ss.get("solid_color", "#BFC7D5")))
    c1_q = str(cast("Any", ss.get("preview_grad_c1", "#1149FF")))
    c2_q = str(cast("Any", ss.get("preview_grad_c2", "#8801DE")))
    c3_q = str(cast("Any", ss.get("preview_grad_c3", "#124FA0")))

    if use_grad_q:
        cs_q = [[0.0, c1_q], [0.5, c2_q], [1.0, c3_q]]
    else:
        cs_q = [[0.0, solid_hex_q], [1.0, solid_hex_q]]

    fig = go.Figure(
        data=[go.Surface(x=X, y=Y, z=Z, colorscale=cs_q, showscale=False)],
    )

    # Make the Quick preview window twice as tall by default
    height_px = max(360, min(1800, to_int_scalar(192 * fig_h)))

    try:
        import numpy as _np_plot

        rmax = float(_np_plot.max(_np_plot.sqrt(X**2 + Y**2)))
        zmin = float(Z.min())
        zmax = float(Z.max())
    except Exception:
        rmax = max(1.0, to_float_scalar(ss.get("top_od", 140.0)) * 0.5)
        zmin, zmax = 0.0, to_float_scalar(ss.get("H", 120.0))

    if place_on_ground:
        zmin = 0.0

    xlim = [-rmax, rmax]
    ylim = [-rmax, rmax]
    zlim = [zmin, zmax]
    z_ratio = (zmax - zmin) / max(1e-6, (xlim[1] - xlim[0]))

    # Title includes grid size to make resolution explicit
    nz_q, nt_q = (
        (Z.shape[0], Z.shape[1])
        if hasattr(Z, "shape") and len(Z.shape) == 2
        else (preview_n_z, preview_n_theta)
    )

    # Build scene configuration
    scene_config = dict(
        xaxis=dict(visible=False, range=xlim),
        yaxis=dict(visible=False, range=ylim),
        zaxis=dict(visible=False, range=zlim),
        aspectmode="manual",
        aspectratio=dict(x=1, y=1, z=min(0.85, z_ratio)),
        bgcolor=cast("Any", ss.get("preview_bg_color", "#242B46")),
    )

    # Always apply default camera - DO NOT try to persist
    # (Plotly resets on new figure creation regardless)
    scene_config["camera"] = dict(
        up=dict(x=0, y=0, z=1),
        projection=dict(type="orthographic"),
    )

    fig.update_layout(
        height=height_px,
        title=f"Quick preview (grid {nt_q}×{nz_q})",
        scene=scene_config,
        margin=dict(l=0, r=0, t=30, b=0),
    )

    # Render - Plotly will handle interaction state internally during this render
    preview_placeholder.plotly_chart(
        fig,
        use_container_width=True,
        config={"displaylogo": False},
    )

    # Persist latest quick preview figure for cached mode
    try:
        ss["_last_surface_fig_json"] = fig.to_dict()
    except Exception:
        pass

    try:
        perf = ss.setdefault("_perf_logs", [])
        perf.append(
            f"surface_plotly:{(time.time() - t0_surface) * 1000:.1f}ms",
        )
        ss["_perf_logs"] = perf[-40:]
    except Exception:
        pass
