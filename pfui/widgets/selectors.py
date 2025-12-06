"""Selector widgets (dropdowns, radio buttons, checkboxes)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pfui._st import get_effective_st as get_st


def select_box(
    label: str,
    options: list[Any],
    index: int = 0,
    key: str | None = None,
    help_text: str | None = None,
    format_func: Callable[[Any], str] | None = None,
) -> Any:
    """Create a select box (dropdown) with consistent styling.

    Args:
        label: Display label for the select box
        options: List of options to choose from
        index: Default selected index (default: 0)
        key: Unique key for the widget
        help_text: Optional help text to display
        format_func: Optional function to format option display

    Returns:
        Selected option value

    """
    st = get_st()
    return st.selectbox(
        label=label,
        options=options,
        index=index,
        key=key,
        help=help_text,
        format_func=format_func,
    )


def radio_selector(
    label: str,
    options: list[Any],
    index: int = 0,
    key: str | None = None,
    help_text: str | None = None,
    horizontal: bool = False,
) -> Any:
    """Create a radio button selector with consistent styling.

    Args:
        label: Display label for the radio group
        options: List of options to choose from
        index: Default selected index (default: 0)
        key: Unique key for the widget
        help_text: Optional help text to display
        horizontal: Whether to display options horizontally

    Returns:
        Selected option value

    """
    st = get_st()
    return st.radio(
        label=label,
        options=options,
        index=index,
        key=key,
        help=help_text,
        horizontal=horizontal,
    )


def checkbox_group(
    label: str,
    options: list[str],
    default: list[str] | None = None,
    key: str | None = None,
    help_text: str | None = None,
) -> list[str]:
    """Create a group of checkboxes with consistent styling.

    Args:
        label: Display label for the checkbox group
        options: List of checkbox options
        default: List of initially selected options
        key: Unique key for the widget
        help_text: Optional help text to display

    Returns:
        List of selected option values

    """
    if default is None:
        default = []

    st = get_st()
    st.write(label)
    if help_text:
        st.caption(help_text)

    selected = []
    for option in options:
        option_key = f"{key}_{option}" if key else None
        if st.checkbox(option, value=option in default, key=option_key):
            selected.append(option)

    return selected
