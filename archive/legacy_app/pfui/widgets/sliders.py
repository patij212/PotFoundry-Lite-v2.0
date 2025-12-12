"""Slider widgets with consistent styling and behavior."""

from __future__ import annotations

from pfui._st import get_effective_st as get_st


def float_slider(
    label: str,
    min_value: float,
    max_value: float,
    value: float,
    step: float = 0.1,
    key: str | None = None,
    help_text: str | None = None,
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
    st = get_st()
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
    key: str | None = None,
    help_text: str | None = None,
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
    st = get_st()
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
    min_value: float,
    max_value: float,
    value: tuple[int | float, int | float],
    step: float | None = None,
    key: str | None = None,
    help_text: str | None = None,
) -> tuple[int | float, int | float]:
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
    st = get_st()
    return st.slider(
        label=label,
        min_value=min_value,
        max_value=max_value,
        value=value,
        step=step,
        key=key,
        help=help_text,
    )
