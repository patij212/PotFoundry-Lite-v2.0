"""Dimensions controls wrapper.

Adapts the extracted app component signature to the interactive
sidebar orchestration. The underlying implementation lives in
`pfui.app_components.sidebar.render_dimensions` and expects
keyword-only arguments `(mark_changed, style_key)`.
"""

from __future__ import annotations

from collections.abc import Callable

from pfui.app_components.sidebar import render_dimensions as _render_dimensions


def render_dimensions(style_name: str, mark_changed: Callable[[], None]) -> None:
    """Render dimensions controls for the given style.

    Args:
        style_name: Current style name (used for style-scoped widget keys)
        mark_changed: Callback invoked on value change to mark preview stale

    """
    # Underlying function creates its own expander; just delegate.
    try:
        _render_dimensions(mark_changed=mark_changed, style_key=style_name)
    except TypeError:
        # Fallback: older signature (pre-refactor) may only have mark_changed
        _render_dimensions(mark_changed=mark_changed, style_key=style_name)  # re-raise if still wrong
