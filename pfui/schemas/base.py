# pfui/schemas/base.py - Core types and ControlMeta class
"""Base types and schema metadata for UI controls."""

from __future__ import annotations

from typing import Literal, TypedDict

__all__ = ["ControlMeta", "ControlType"]


# Accepted control types for UI elements
ControlType = Literal["int", "float", "bool", "text", "select"]


class ControlMeta(TypedDict, total=False):
    """UI control metadata.

    Purpose:
        Describe a single parameter slider/dropdown.

    Fields:
        label: str - human label
        help: str - short help text
        type: ControlType
        min/max/step: numeric bounds
        default: default value
        canonical: canonical parameter name
        options: list[str] - valid options if type="select"
        units: str - e.g., "deg", "mm"
        legacy: str - legacy key (only in canonical views)
    """

    label: str
    help: str
    type: ControlType
    min: float | int
    max: float | int
    step: float | int
    default: object
    canonical: str
    options: list[str]
    units: str
    legacy: str
