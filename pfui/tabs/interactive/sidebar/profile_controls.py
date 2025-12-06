"""Profile controls wrapper.

Delegates to `pfui.app_components.sidebar.render_profile_controls`,
which expects keyword-only arguments `(mark_changed, style_key)`.
"""

from __future__ import annotations

from collections.abc import Callable

from pfui.app_components.sidebar import (
    render_profile_controls as _render_profile_controls,
)


def render_profile(style_name: str, mark_changed: Callable[[], None]) -> None:
    """Render profile controls for the given style.

    Args:
        style_name: Current style name (for widget scoping)
        mark_changed: Callback to mark preview stale on change

    """
    _render_profile_controls(mark_changed=mark_changed, style_key=style_name)
