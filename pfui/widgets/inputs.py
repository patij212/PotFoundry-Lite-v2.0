"""Input widgets for text and numbers."""

from __future__ import annotations

from collections.abc import Callable

from pfui._st import get_effective_st as get_st


def number_input_validated(
    label: str,
    min_value: float | None = None,
    max_value: float | None = None,
    value: float | None = None,
    step: float | None = None,
    key: str | None = None,
    help_text: str | None = None,
    validator: Callable[[int | float], int | float] | None = None,
) -> int | float:
    """Create a number input with optional validation.

    Args:
        label: Display label for the input
        min_value: Minimum allowed value
        max_value: Maximum allowed value
        value: Default value
        step: Step size for increment/decrement
        key: Unique key for the widget
        help_text: Optional help text to display
        validator: Optional validation function (raises ValueError on invalid)

    Returns:
        Input number value (validated if validator provided)

    """
    st = get_st()
    input_value = st.number_input(
        label=label,
        min_value=min_value,
        max_value=max_value,
        value=value,
        step=step,
        key=key,
        help=help_text,
    )

    if validator is not None:
        try:
            validated = validator(input_value)
            return validated
        except ValueError as e:
            st.error(f"Validation error: {e}")
            return value if value is not None else 0

    return input_value


def text_input_validated(
    label: str,
    value: str = "",
    max_chars: int | None = None,
    key: str | None = None,
    help_text: str | None = None,
    placeholder: str | None = None,
    validator: Callable[[str], str] | None = None,
) -> str:
    """Create a text input with optional validation.

    Args:
        label: Display label for the input
        value: Default value
        max_chars: Maximum character count
        key: Unique key for the widget
        help_text: Optional help text to display
        placeholder: Optional placeholder text
        validator: Optional validation function (raises ValueError on invalid)

    Returns:
        Input text value (validated if validator provided)

    """
    st = get_st()
    input_value = st.text_input(
        label=label,
        value=value,
        max_chars=max_chars,
        key=key,
        help=help_text,
        placeholder=placeholder,
    )

    if validator is not None:
        try:
            validated = validator(input_value)
            return validated
        except ValueError as e:
            st.error(f"Validation error: {e}")
            return value

    return input_value
