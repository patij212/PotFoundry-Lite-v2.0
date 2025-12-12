"""Reusable Streamlit UI widgets for PotFoundry.

This package provides standardized, reusable UI components to reduce duplication
and prepare for future Qt desktop migration. All widgets are thin wrappers around
Streamlit components with consistent styling and behavior.
"""

from __future__ import annotations

from .buttons import button_with_callback, export_button, reset_button
from .displays import info_badge, metric_display, status_message
from .inputs import number_input_validated, text_input_validated
from .selectors import checkbox_group, radio_selector, select_box
from .sliders import float_slider, int_slider, range_slider

__all__ = [
    # Buttons
    "button_with_callback",
    "export_button",
    "reset_button",
    # Displays
    "info_badge",
    "metric_display",
    "status_message",
    # Inputs
    "number_input_validated",
    "text_input_validated",
    # Selectors
    "radio_selector",
    "select_box",
    "checkbox_group",
    # Sliders
    "float_slider",
    "int_slider",
    "range_slider",
]
