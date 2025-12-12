"""Reset controls rendering."""

from __future__ import annotations

from collections.abc import Callable

from pfui._st import get_effective_st as get_st
from pfui.state import reset_all_defaults, reset_style_defaults


def render_reset_controls(on_change: Callable[[], None]) -> None:
    """Render reset buttons.
    
    Args:
        on_change: Callback to trigger when reset is performed

    """
    st = get_st()
    st.markdown("---")
    col_reset1, col_reset2 = st.columns(2)
    with col_reset1:
        if st.button("Reset Style Defaults", help="Reset style-specific parameters to defaults"):
            # Needs current style; fall back to session 'style' if available
            try:
                cur_style = st.session_state.get("style", "HarmonicRipple")
                reset_style_defaults(cur_style)
            except Exception:
                pass
            st.success("Reset style defaults")
            on_change()
            st.rerun()
    with col_reset2:
        if st.button("Reset All", help="Reset all parameters to defaults"):
            try:
                cur_style = st.session_state.get("style", "HarmonicRipple")
                reset_all_defaults(cur_style)
            except Exception:
                pass
            st.success("Reset all parameters")
            on_change()
            st.rerun()
