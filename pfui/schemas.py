# pfui/schemas.py
from __future__ import annotations
from typing import Any, Dict

# Control schemas for per-style widgets
STYLE_SCHEMAS: Dict[str, Dict[str, Dict[str, Any]]] = {
    "HarmonicRipple": {
        "hr_petals":      {"label": "Petal count",      "type": "int",   "min": 3,   "max": 24,  "step": 1,    "default": 7},
        "hr_petal_amp":   {"label": "Petal amplitude",  "type": "float", "min": 0.0, "max": 0.4, "step": 0.01, "default": 0.16},
        "hr_ripple_freq": {"label": "Ripple frequency", "type": "int",   "min": 5,   "max": 60,  "step": 1,    "default": 31},
        "hr_ripple_amp":  {"label": "Ripple amplitude", "type": "float", "min": 0.0, "max": 0.12,"step": 0.005,"default": 0.03},
        "hr_bell":        {"label": "Bell factor",      "type": "float", "min": 0.0, "max": 0.25,"step": 0.005,"default": 0.05},
    },
    "SpiralRidges": {
        "spiral_k":       {"label": "Ridge count (k)",  "type": "int",   "min": 3,   "max": 24,  "step": 1,    "default": 9},
        "spiral_turns":   {"label": "Turns",            "type": "float", "min": 0.2, "max": 3.0, "step": 0.05, "default": 1.15},
        "spiral_amp_min": {"label": "Amplitude base",   "type": "float", "min": 0.0, "max": 0.7, "step": 0.01, "default": 0.15},
        "spiral_amp_max": {"label": "Amplitude top",    "type": "float", "min": 0.0, "max": 0.8, "step": 0.01, "default": 0.25},
    },
    "SuperellipseMorph": {
        "se_m_base": {"label": "Exponent @ base", "type": "float", "min": 1.0, "max": 6.0, "step": 0.1, "default": 2.0},
        "se_m_top":  {"label": "Exponent @ top",  "type": "float", "min": 1.0, "max": 8.0, "step": 0.1, "default": 5.5},
    },
    "SuperformulaBlossom": {
        "sf_m_base": {"label": "m base", "type": "float", "min": 2.0,  "max": 14.0, "step": 0.5,  "default": 6.0},
        "sf_m_top":  {"label": "m top",  "type": "float", "min": 2.0,  "max": 18.0, "step": 0.5,  "default": 10.0},
        "sf_n1":     {"label": "n1",     "type": "float", "min": 0.1,  "max": 4.0,  "step": 0.05, "default": 0.35},
        "sf_n2":     {"label": "n2",     "type": "float", "min": 0.2,  "max": 4.0,  "step": 0.05, "default": 0.8},
        "sf_n3":     {"label": "n3",     "type": "float", "min": 0.2,  "max": 4.0,  "step": 0.05, "default": 0.8},
    },
    "FourierBloom": {
        "fb_strength": {"label": "Detail strength", "type": "float", "min": 0.0, "max": 2.0, "step": 0.05, "default": 1.0},
    },
}
