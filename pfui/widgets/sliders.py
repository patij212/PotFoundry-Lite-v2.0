"""Slider widgets with consistent styling and behavior."""

from __future__ import annotations

from typing import Any, Optional, Union

import streamlit as st


def float_slider(
    label: str,
    min_value: float,
    max_value: float,
    value: float,
    step: float = 0.1,
    key: Optional[str] = None,
    help_text: Optional[str] = None,
    format_str: str = "%.2f",
) -> float:
    """Create a float slider with consistent styling.

    Args:
        label: Display label for the slider
        min_value: Minimum allowed value
        max_value: Maximum allowed value
        value: Default value
        step: Step size for slider (default: 0.1)
        key: Unique key for the widget
        help_text: Optional help text to display
        format_str: Format string for display (default: "%.2f")

    Returns:
        Selected float value
    """
    return st.slider(
        label=label,
        min_value=min_value,
        max_value=max_value,
        value=value,
        step=step,
        key=key,
        help=help_text,
        format=format_str,
    )


def int_slider(
    label: str,
    min_value: int,
    max_value: int,
    value: int,
    step: int = 1,
    key: Optional[str] = None,
    help_text: Optional[str] = None,
) -> int:
    """Create an integer slider with consistent styling.

    Args:
        label: Display label for the slider
        min_value: Minimum allowed value
        max_value: Maximum allowed value
        value: Default value
        step: Step size for slider (default: 1)
        key: Unique key for the widget
        help_text: Optional help text to display

    Returns:
        Selected integer value
    """
    return st.slider(
        label=label,
        min_value=min_value,
        max_value=max_value,
        value=value,
        step=step,
        key=key,
        help=help_text,
    )


def range_slider(
    label: str,
    min_value: Union[int, float],
    max_value: Union[int, float],
    value: tuple[Union[int, float], Union[int, float]],
    step: Union[int, float, None] = None,
    key: Optional[str] = None,
    help_text: Optional[str] = None,
) -> tuple[Union[int, float], Union[int, float]]:
    """Create a range slider (two-value slider) with consistent styling.

    Args:
        label: Display label for the slider
        min_value: Minimum allowed value
        max_value: Maximum allowed value
        value: Default (min, max) tuple
        step: Step size for slider (default: auto)
        key: Unique key for the widget
        help_text: Optional help text to display

    Returns:
        Tuple of (min_selected, max_selected)
    """
    return st.slider(
        label=label,
        min_value=min_value,
        max_value=max_value,
        value=value,
        step=step,
        key=key,
        help=help_text,
    )
