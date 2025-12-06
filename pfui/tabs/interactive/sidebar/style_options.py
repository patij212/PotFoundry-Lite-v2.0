"""Style options expander wrapper."""

from __future__ import annotations

from pfui._st import get_effective_st as get_st
from pfui.controls import style_controls as _style_controls


def render_style_options(current_style: str) -> None:
    """Render style-specific options for the selected style.

    Args:
        current_style: Currently selected style name

    """
    st = get_st()
    with st.expander("Style Options"):
        _style_controls(current_style)
