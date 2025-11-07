"""Button widgets with consistent styling and callbacks."""

from __future__ import annotations

from typing import Callable, Optional

import streamlit as st


def button_with_callback(
    label: str,
    callback: Callable[[], None],
    key: Optional[str] = None,
    help_text: Optional[str] = None,
    disabled: bool = False,
    use_container_width: bool = False,
) -> bool:
    """Create a button that executes a callback when clicked.

    Args:
        label: Button label text
        callback: Function to call when button is clicked
        key: Unique key for the widget
        help_text: Optional help text to display
        disabled: Whether button is disabled
        use_container_width: Whether to expand button to container width

    Returns:
        True if button was clicked this render
    """
    clicked = st.button(
        label=label,
        key=key,
        help=help_text,
        disabled=disabled,
        use_container_width=use_container_width,
    )

    if clicked:
        callback()

    return clicked


def export_button(
    label: str = "Export",
    key: Optional[str] = None,
    help_text: Optional[str] = None,
    disabled: bool = False,
) -> bool:
    """Create an export button with consistent styling.

    Args:
        label: Button label (default: "Export")
        key: Unique key for the widget
        help_text: Optional help text
        disabled: Whether button is disabled

    Returns:
        True if button was clicked
    """
    return st.button(
        label=label,
        key=key,
        help=help_text,
        disabled=disabled,
        type="primary",
        use_container_width=True,
    )


def reset_button(
    label: str = "Reset to Defaults",
    key: Optional[str] = None,
    help_text: Optional[str] = None,
    disabled: bool = False,
) -> bool:
    """Create a reset button with consistent styling.

    Args:
        label: Button label (default: "Reset to Defaults")
        key: Unique key for the widget
        help_text: Optional help text
        disabled: Whether button is disabled

    Returns:
        True if button was clicked
    """
    return st.button(
        label=label,
        key=key,
        help=help_text,
        disabled=disabled,
        type="secondary",
    )
