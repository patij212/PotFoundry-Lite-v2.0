# pfui/schemas.py
from __future__ import annotations
from typing import Any, Dict

GLOBAL_CONTROLS: Dict[str, Dict[str, Any]] = {
    "spin_turns":      {"label": "Twist across height (turns)", "type": "float", "min": -2.0, "max":  2.0, "step": 0.01, "default": 0.0},
    "spin_phase_deg":  {"label": "Spin phase (°)",              "type": "int",   "min": -180, "max": 180, "step": 1,    "default": 0},
    "spin_curve_exp":  {"label": "Twist curve exponent",        "type": "float", "min":  0.5, "max":  2.5, "step": 0.05, "default": 1.0},
    "flare_center":    {"label": "Flare center (0–1)",          "type": "float", "min": 0.15, "max": 0.85, "step": 0.01, "default": 0.5},
    "flare_sharp":     {"label": "Flare sharpness",             "type": "float", "min": 2.0,  "max": 12.0, "step": 0.1,  "default": 6.0},
    "bell_amp":        {"label": "Mid-height bell amp",         "type": "float", "min": 0.0,  "max":  0.5, "step": 0.01, "default": 0.0},
    "bell_center":     {"label": "Bell center (0–1)",           "type": "float", "min": 0.2,  "max":  0.8, "step": 0.01, "default": 0.5},
    "bell_width":      {"label": "Bell width",                  "type": "float", "min": 0.05, "max":  0.6, "step": 0.01, "default": 0.22},
}

# Control schemas for per-style widgets
STYLE_SCHEMAS: Dict[str, Dict[str, Dict[str, Any]]] = {
    "HarmonicRipple": {
        "hr_petals":           {"label": "Petal count",           "type": "int",   "min": 3,   "max": 24,  "step": 1,     "default": 7},
        "hr_petal_amp":        {"label": "Petal amplitude",       "type": "float", "min": 0.0, "max": 0.4, "step": 0.01,  "default": 0.16},
        "hr_petal_phase_deg":  {"label": "Petal phase (°)",       "type": "int",   "min": -180,"max": 180, "step": 1,     "default": 17},
        "hr_ripple_freq":      {"label": "Ripple frequency",      "type": "int",   "min": 5,   "max": 60,  "step": 1,     "default": 31},
        "hr_ripple_amp":       {"label": "Ripple amplitude",      "type": "float", "min": 0.0, "max": 0.12,"step": 0.005, "default": 0.03},
        "hr_ripple_phase_deg": {"label": "Ripple phase (°)",      "type": "int",   "min": -180,"max": 180, "step": 1,     "default": 0},
        "hr_petal_zgain":      {"label": "Petal z-phase gain",    "type": "float", "min": 0.0, "max": 1.2, "step": 0.05,  "default": 0.6},
        "hr_ripple_zgain":     {"label": "Ripple z-phase gain",   "type": "float", "min": 0.0, "max": 1.2, "step": 0.05,  "default": 1.0},
        "hr_bell":             {"label": "Additional mid bell",   "type": "float", "min": 0.0, "max": 0.25,"step": 0.005, "default": 0.05},
    },

    "SpiralRidges": {
        "spiral_k":            {"label": "Ridge count (k)",       "type": "int",   "min": 3,   "max": 24,  "step": 1,     "default": 9},
        "spiral_turns":        {"label": "Turns",                 "type": "float", "min": 0.2, "max": 3.0, "step": 0.05,  "default": 1.15},
        "spiral_amp_min":      {"label": "Amplitude base",        "type": "float", "min": 0.0, "max": 0.7, "step": 0.01,  "default": 0.15},
        "spiral_amp_max":      {"label": "Amplitude top",         "type": "float", "min": 0.0, "max": 0.8, "step": 0.01,  "default": 0.25},
        "spiral_amp_curve":    {"label": "Amp growth exponent",   "type": "float", "min": 0.6, "max": 2.0, "step": 0.05,  "default": 1.3},
        "spiral_groove_amp":   {"label": "Fine groove amp",       "type": "float", "min": 0.0, "max": 0.12,"step": 0.005, "default": 0.04},
        "spiral_groove_mult":  {"label": "Groove freq × k",       "type": "float", "min": 1.0, "max": 5.0, "step": 0.1,   "default": 3.0},
        "spiral_phase_mult":   {"label": "Groove phase × turns",  "type": "float", "min": 0.0, "max": 3.0, "step": 0.1,   "default": 1.7},
    },

    "SuperellipseMorph": {
        "se_m_base":           {"label": "Exponent @ base",       "type": "float", "min": 1.0, "max": 6.0, "step": 0.1,   "default": 2.0},
        "se_m_top":            {"label": "Exponent @ top",        "type": "float", "min": 1.0, "max": 8.0, "step": 0.1,   "default": 5.5},
        "se_m_curve_exp":      {"label": "Exponent morph curve",  "type": "float", "min": 0.6, "max": 2.0, "step": 0.05,  "default": 1.1},
        "se_c4_amp":           {"label": "Cos(4θ) amp",           "type": "float", "min": 0.0, "max": 0.25,"step": 0.005, "default": 0.08},
        "se_c4_phase_deg":     {"label": "Cos(4θ) phase (°)",     "type": "int",   "min": -180,"max": 180, "step": 1,     "default": 23},
        "se_c8_amp":           {"label": "Cos(8θ) amp",           "type": "float", "min": 0.0, "max": 0.25,"step": 0.005, "default": 0.03},
        "se_c8_phase_deg":     {"label": "Cos(8θ) phase (°)",     "type": "int",   "min": -180,"max": 180, "step": 1,     "default": 0},
    },

    "SuperformulaBlossom": {
        "sf_m_base":           {"label": "m base",                 "type": "float", "min": 2.0, "max": 14.0,"step": 0.5,   "default": 6.0},
        "sf_m_top":            {"label": "m top",                  "type": "float", "min": 2.0, "max": 18.0,"step": 0.5,   "default": 10.0},
        "sf_m_curve_exp":      {"label": "m morph curve",          "type": "float", "min": 0.6, "max": 2.0, "step": 0.05,  "default": 1.2},
        "sf_a":                {"label": "a",                      "type": "float", "min": 0.4, "max": 2.5, "step": 0.05,  "default": 1.0},
        "sf_b":                {"label": "b",                      "type": "float", "min": 0.4, "max": 2.5, "step": 0.05,  "default": 1.0},
        "sf_n1":               {"label": "n1 @ base",              "type": "float", "min": 0.1, "max": 4.0, "step": 0.05,  "default": 0.35},
        "sf_n1_top":           {"label": "n1 @ top",               "type": "float", "min": 0.1, "max": 4.0, "step": 0.05,  "default": 0.50},
        "sf_n2":               {"label": "n2 @ base",              "type": "float", "min": 0.2, "max": 4.0, "step": 0.05,  "default": 0.80},
        "sf_n2_top":           {"label": "n2 @ top",               "type": "float", "min": 0.2, "max": 4.0, "step": 0.05,  "default": 1.40},
        "sf_n3":               {"label": "n3 @ base",              "type": "float", "min": 0.2, "max": 4.0, "step": 0.05,  "default": 0.80},
        "sf_n3_top":           {"label": "n3 @ top",               "type": "float", "min": 0.2, "max": 4.0, "step": 0.05,  "default": 0.80},
    },

    "FourierBloom": {
        "fb_strength":         {"label": "Detail strength",        "type": "float", "min": 0.0, "max": 2.0, "step": 0.05,  "default": 1.0},
        "fb_base_cos8_amp":    {"label": "Base cos(8θ) amp",       "type": "float", "min": -1.0,"max": 1.0, "step": 0.01,  "default": 0.12},
        "fb_base_cos8_phase":  {"label": "Base cos(8θ) phase (rad)","type": "float","min": -3.14,"max": 3.14,"step": 0.01, "default": 0.0},
        "fb_base_sin4_amp":    {"label": "Base sin(4θ) amp",       "type": "float", "min": -1.0,"max": 1.0, "step": 0.01,  "default": 0.05},
        "fb_base_sin4_phase":  {"label": "Base sin(4θ) phase (rad)","type": "float","min": -3.14,"max": 3.14,"step": 0.01, "default": 0.6},
        "fb_base_cos12_amp":   {"label": "Base cos(12θ) amp",      "type": "float", "min": -1.0,"max": 1.0, "step": 0.01,  "default": -0.04},
        "fb_base_cos12_phase": {"label": "Base cos(12θ) phase(rad)","type": "float","min": -3.14,"max": 3.14,"step": 0.01, "default": 1.3},
        "fb_top_cos11_amp":    {"label": "Top cos(11θ) amp",       "type": "float", "min": -1.0,"max": 1.0, "step": 0.01,  "default": 0.18},
        "fb_top_cos11_phase":  {"label": "Top cos(11θ) phase(rad)","type": "float","min": -3.14,"max": 3.14,"step": 0.01,  "default": 0.5},
        "fb_top_sin7_amp":     {"label": "Top sin(7θ) amp",        "type": "float", "min": -1.0,"max": 1.0, "step": 0.01,  "default": -0.07},
        "fb_top_sin7_phase":   {"label": "Top sin(7θ) phase (rad)","type": "float","min": -3.14,"max": 3.14,"step": 0.01,  "default": 0.0},
        "fb_top_cos22_amp":    {"label": "Top cos(22θ) amp",       "type": "float", "min": -1.0,"max": 1.0, "step": 0.01,  "default": 0.05},
        "fb_top_cos22_phase":  {"label": "Top cos(22θ) phase(rad)","type": "float","min": -3.14,"max": 3.14,"step": 0.01,  "default": 0.9},
        "fb_wobble_amp":       {"label": "Wobble amp",             "type": "float", "min": 0.0, "max": 0.4, "step": 0.01,  "default": 0.06},
        "fb_wobble_freq":      {"label": "Wobble freq (×θ)",       "type": "int",   "min": 1,   "max": 16,  "step": 1,     "default": 5},
        "fb_wobble_zgain":     {"label": "Wobble z-gain (×τ)",     "type": "float", "min": 0.0, "max": 1.0, "step": 0.05,  "default": 0.5},
    },
}
