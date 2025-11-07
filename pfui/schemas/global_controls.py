# pfui/schemas/global_controls.py - Global control schemas
"""Global control schemas shared across all styles."""

from __future__ import annotations

from types import MappingProxyType
from typing import Any, Dict

__all__ = ["GLOBAL_CONTROLS"]

GLOBAL_CONTROLS: Dict[str, Dict[str, Any]] = {
    "spin_turns": {
        "label": "Twist across height (turns)",
        "help": "Total rotations from base to rim. Negative values twist the opposite way.",
        "type": "float",
        "min": -2.0,
        "max": 2.0,
        "step": 0.01,
        "default": 0.0,
        "canonical": "twist_total_turns",
    },
    "spin_phase_deg": {
        "label": "Spin start angle (°)",
        "help": "Fixed starting rotation offset, in degrees.",
        "type": "int",
        "min": -180,
        "max": 180,
        "step": 1,
        "default": 0,
        "canonical": "twist_start_angle_deg",
    },
    "spin_curve_exp": {
        "label": "Twist easing exponent",
        "help": "<1 = more twist near base; >1 = more twist near rim; 1 = linear.",
        "type": "float",
        "min": 0.5,
        "max": 2.5,
        "step": 0.05,
        "default": 1.0,
        "canonical": "twist_ease_exponent",
    },
    "flare_center": {
        "label": "Flare pivot height (0–1)",
        "help": "Where the radius growth pivots along height; 0=base, 1=rim.",
        "type": "float",
        "min": 0.15,
        "max": 0.85,
        "step": 0.01,
        "default": 0.5,
        "canonical": "flare_pivot_height",
    },
    "flare_sharp": {
        "label": "Flare pivot sharpness",
        "help": "Higher values concentrate growth at the pivot height.",
        "type": "float",
        "min": 2.0,
        "max": 12.0,
        "step": 0.1,
        "default": 6.0,
        "canonical": "flare_pivot_sharpness",
    },
    "bell_amp": {
        "label": "Mid-height bulge amplitude",
        "help": "Strength of a gentle bell-shaped bulge around mid-height.",
        "type": "float",
        "min": 0.0,
        "max": 0.5,
        "step": 0.01,
        "default": 0.0,
        "canonical": "mid_bulge_amplitude",
    },
    "bell_center": {
        "label": "Mid-height bulge center (0–1)",
        "help": "Where along height the bulge peaks; 0=base, 1=rim.",
        "type": "float",
        "min": 0.2,
        "max": 0.8,
        "step": 0.01,
        "default": 0.5,
        "canonical": "mid_bulge_height",
    },
    "bell_width": {
        "label": "Mid-height bulge width",
        "help": "Spread/width of the bulge; higher = wider effect.",
        "type": "float",
        "min": 0.05,
        "max": 0.6,
        "step": 0.01,
        "default": 0.22,
        "canonical": "mid_bulge_width",
    },
}


# Freeze as read-only
GLOBAL_CONTROLS = MappingProxyType(GLOBAL_CONTROLS)
