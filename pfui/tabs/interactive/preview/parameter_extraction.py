"""Parameter extraction for preview rendering.

This module centralizes extraction of all preview-related parameters from
session state, providing a single source of truth for parameter access.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class PreviewParameters:
    """Container for all preview parameters extracted from session state."""

    # Style parameters
    style_name: str
    ui_opts: dict[str, Any]
    n_theta: int
    n_z: int
    preview_detail: float

    # Geometry parameters
    H: float
    Rt: float
    Rb: float
    expn: float
    t_wall: float
    t_bottom: float
    r_drain: float

    # Appearance parameters
    show_inner: bool
    view_elev: float
    view_azim: float
    fig_w: float
    fig_h: float
    dpi: int
    place_on_ground: bool

    # Preview mode parameters
    interactive_3d: bool
    interactive_mesh: bool


def extract_preview_parameters(ss: dict[str, Any]) -> PreviewParameters:
    """Extract all preview parameters from session state.

    Centralizes parameter extraction to provide a single source of truth
    for all preview-related parameters.

    Args:
        ss: Streamlit session state dictionary

    Returns:
        PreviewParameters object containing all extracted parameters

    Example:
        >>> params = extract_preview_parameters(st.session_state)
        >>> print(params.H, params.Rt, params.Rb)
        100.0 50.0 40.0
    """
    return PreviewParameters(
        # Style parameters
        style_name=ss.get("style", "PetalWave"),
        ui_opts=ss.get("style_opts", {}),
        n_theta=ss.get("n_theta", 168),
        n_z=ss.get("n_z", 84),
        preview_detail=ss.get("preview_detail", 2.0),
        # Geometry parameters
        H=ss.get("H", 100.0),
        Rt=ss.get("Rt", 50.0),
        Rb=ss.get("Rb", 40.0),
        expn=ss.get("expn", 2.0),
        t_wall=ss.get("t_wall", 2.0),
        t_bottom=ss.get("t_bottom", 2.0),
        r_drain=ss.get("r_drain", 5.0),
        # Appearance parameters
        show_inner=ss.get("show_inner", False),
        view_elev=ss.get("view_elev", 20.0),
        view_azim=ss.get("view_azim", -60.0),
        fig_w=ss.get("fig_w", 7.5),
        fig_h=ss.get("fig_h", 7.0),
        dpi=ss.get("dpi", 220),
        place_on_ground=ss.get("place_on_ground", True),
        # Preview mode parameters
        interactive_3d=ss.get("interactive_3d", True),
        interactive_mesh=ss.get("interactive_mesh", True),
    )


def get_preview_resolution(
    params: PreviewParameters, ss: dict[str, Any], to_float_scalar
) -> tuple[int, int, int, int]:
    """Calculate preview and full resolution based on parameters.

    Args:
        params: Preview parameters
        ss: Session state
        to_float_scalar: Scalar conversion function

    Returns:
        Tuple of (preview_n_theta, preview_n_z, full_n_theta, full_n_z)
    """
    # Apply interactive preview scaling
    preview_scale = to_float_scalar(ss.get("preview_res_scale", 1.0))
    target_n_theta = max(
        16, int(params.n_theta * params.preview_detail * preview_scale)
    )
    target_n_z = max(8, int(params.n_z * params.preview_detail * preview_scale))

    preview_n_theta = max(16, min(168, target_n_theta))
    preview_n_z = max(8, min(168, target_n_z))
    full_n_theta = max(16, min(1024, target_n_theta))
    full_n_z = max(8, min(1024, target_n_z))

    return preview_n_theta, preview_n_z, full_n_theta, full_n_z
