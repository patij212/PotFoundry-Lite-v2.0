"""Selector widgets (dropdowns, radio buttons, checkboxes)."""

from __future__ import annotations

from typing import Any, Callable, List, Optional

import streamlit as st


def select_box(
    label: str,
    options: List[Any],
    index: int = 0,
    key: Optional[str] = None,
    help_text: Optional[str] = None,
    format_func: Optional[Callable[[Any], str]] = None,
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
    options: List[Any],
    index: int = 0,
    key: Optional[str] = None,
    help_text: Optional[str] = None,
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
    options: List[str],
    default: Optional[List[str]] = None,
    key: Optional[str] = None,
    help_text: Optional[str] = None,
) -> List[str]:
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
    
    st.write(label)
    if help_text:
        st.caption(help_text)
    
    selected = []
    for option in options:
        option_key = f"{key}_{option}" if key else None
        if st.checkbox(option, value=option in default, key=option_key):
            selected.append(option)
    
    return selected
