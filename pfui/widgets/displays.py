"""Display widgets for information, metrics, and status messages."""

from __future__ import annotations

from typing import Optional

import streamlit as st


def metric_display(
    label: str,
    value: str,
    delta: Optional[str] = None,
    delta_color: str = "normal",
    help_text: Optional[str] = None,
) -> None:
    """Display a metric with consistent styling.

    Args:
        label: Metric label
        value: Metric value to display
        delta: Optional delta/change value
        delta_color: Color for delta ("normal", "inverse", "off")
        help_text: Optional help text
    """
    st.metric(
        label=label,
        value=value,
        delta=delta,
        delta_color=delta_color,
        help=help_text,
    )


def info_badge(
    text: str,
    icon: str = "ℹ️",
) -> None:
    """Display an informational badge.

    Args:
        text: Badge text
        icon: Optional icon/emoji prefix
    """
    st.info(f"{icon} {text}", icon=icon if len(icon) == 1 else None)


def status_message(
    text: str,
    status: str = "info",
    icon: Optional[str] = None,
) -> None:
    """Display a status message with appropriate styling.

    Args:
        text: Message text
        status: Message type ("info", "success", "warning", "error")
        icon: Optional icon/emoji
    """
    if status == "success":
        st.success(text, icon=icon)
    elif status == "warning":
        st.warning(text, icon=icon)
    elif status == "error":
        st.error(text, icon=icon)
    else:
        st.info(text, icon=icon)
