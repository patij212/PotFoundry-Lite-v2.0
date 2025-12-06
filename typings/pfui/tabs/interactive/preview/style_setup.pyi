
from collections.abc import Callable
from typing import Any

class StyleConfiguration:
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
) -> StyleConfiguration: ...

__all__ = ["StyleConfiguration", "setup_preview_style"]
