"""Interactive Designer tab modules.

Extracted components for the Interactive Designer tab functionality.
"""
from __future__ import annotations

from .metrics import render_metrics_section
from .performance import render_performance_section
from .profile import render_profile_section

__all__ = [
    "render_metrics_section",
    "render_performance_section",
    "render_profile_section",
]
