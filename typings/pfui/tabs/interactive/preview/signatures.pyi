
from typing import Any

def compute_preview_signatures(
    H: float,
    Rt: float,
    Rb: float,
    expn: float,
    preview_n_theta: int,
    preview_n_z: int,
    full_n_theta: int,
    full_n_z: int,
    style_name: str,
    opts_json: str,
    ss: dict[str, Any],
    show_inner: bool,
    view_elev: float,
    view_azim: float,
    fig_w: float,
    fig_h: float,
    dpi: int,
    place_on_ground: bool,
) -> tuple[tuple | None, tuple | None]: ...

__all__ = ["compute_preview_signatures"]
