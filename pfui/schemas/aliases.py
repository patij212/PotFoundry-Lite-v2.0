"""Alias maps for legacy<->canonical names.

This module now defines alias maps directly instead of loading from the
legacy monolithic module. It preserves the same public API and
immutability guarantees using MappingProxyType. This reduces coupling to
the transitional shim and is a step in consolidating pfui.schemas.
"""

from __future__ import annotations

import importlib.util
from typing import Dict, Mapping
from types import MappingProxyType


def _invert(d: Mapping[str, str]) -> Dict[str, str]:
    return {v: k for k, v in d.items()}


# Canonical names (human-friendly) and alias maps (legacy -> canonical)
_GLOBAL_ALIASES: Mapping[str, str] = {
    "spin_turns": "twist_total_turns",
    "spin_phase_deg": "twist_start_angle_deg",
    "spin_curve_exp": "twist_ease_exponent",
    "flare_center": "flare_pivot_height",
    "flare_sharp": "flare_pivot_sharpness",
    "bell_amp": "mid_bulge_amplitude",
    "bell_center": "mid_bulge_height",
    "bell_width": "mid_bulge_width",
}

_ALIASES_BY_STYLE: Mapping[str, Mapping[str, str]] = {
    "HarmonicRipple": {
        "hr_petals": "petals_count",
        "hr_petal_amp": "petals_amplitude",
        "hr_petal_phase_deg": "petals_phase_deg",
        "hr_ripple_freq": "ripple_frequency",
        "hr_ripple_amp": "ripple_amplitude",
        "hr_ripple_phase_deg": "ripple_phase_deg",
        "hr_petal_zgain": "petals_zphase_gain",
        "hr_ripple_zgain": "ripple_zphase_gain",
        "hr_bell": "mid_bulge_boost",
    },
    "SpiralRidges": {
        "spiral_k": "ridge_count",
        "spiral_turns": "ridge_helix_turns",
        "spiral_amp_min": "ridge_amplitude_base",
        "spiral_amp_max": "ridge_amplitude_top",
        "spiral_amp_curve": "ridge_amplitude_growth_exp",
        "spiral_groove_amp": "groove_amplitude",
        "spiral_groove_mult": "groove_frequency_multiplier",
        "spiral_phase_mult": "groove_phase_multiplier",
    },
    "SuperellipseMorph": {
        "se_m_base": "superellipse_power_base",
        "se_m_top": "superellipse_power_top",
        "se_m_curve_exp": "superellipse_power_morph_exp",
        "se_c4_amp": "cos4_amplitude",
        "se_c4_phase_deg": "cos4_phase_deg",
        "se_c8_amp": "cos8_amplitude",
        "se_c8_phase_deg": "cos8_phase_deg",
    },
    "SuperformulaBlossom": {
        "sf_m_base": "blossom_symmetry_base",
        "sf_m_top": "blossom_symmetry_top",
        "sf_m_curve_exp": "blossom_symmetry_morph_exp",
        "sf_a": "blossom_a",
        "sf_b": "blossom_b",
        "sf_n1": "blossom_sharpness_base",
        "sf_n1_top": "blossom_sharpness_top",
        "sf_n2": "blossom_cos_power_base",
        "sf_n2_top": "blossom_cos_power_top",
        "sf_n3": "blossom_sin_power_base",
        "sf_n3_top": "blossom_sin_power_top",
        # Edge reconstruction (peak snap)
        "sf_peak_snap_enable": "blossom_peak_snap_enable",
        "sf_peak_snap_window": "blossom_peak_snap_window",
        "sf_peak_snap_quantile": "blossom_peak_snap_quantile",
        "sf_peak_snap_amount": "blossom_peak_snap_amount",
        # Flow-aware (2D) reconstruction
        "sf_edge_flow_reconstruct_enable": "blossom_edge_flow_reconstruct_enable",
        "sf_edge_flow_window": "blossom_edge_flow_window",
        "sf_edge_flow_quantile": "blossom_edge_flow_quantile",
        "sf_edge_flow_amount": "blossom_edge_flow_amount",
    },
    "FourierBloom": {
        "fb_strength": "harmonic_blend_strength",
        "fb_base_cos8_amp": "base_cos8_amplitude",
        "fb_base_cos8_phase": "base_cos8_phase_rad",
        "fb_base_sin4_amp": "base_sin4_amplitude",
        "fb_base_sin4_phase": "base_sin4_phase_rad",
        "fb_base_cos12_amp": "base_cos12_amplitude",
        "fb_base_cos12_phase": "base_cos12_phase_rad",
        "fb_top_cos11_amp": "top_cos11_amplitude",
        "fb_top_cos11_phase": "top_cos11_phase_rad",
        "fb_top_sin7_amp": "top_sin7_amplitude",
        "fb_top_sin7_phase": "top_sin7_phase_rad",
        "fb_top_cos22_amp": "top_cos22_amplitude",
        "fb_top_cos22_phase": "top_cos22_phase_rad",
        "fb_wobble_amp": "wobble_amplitude",
        "fb_wobble_freq": "wobble_frequency_x_theta",
        "fb_wobble_zgain": "wobble_z_gain_x_tau",
    },
    "LowPolyFacet": {
        "lp_facets": "facets_count",
        "lp_tiers": "tiers_count",
        "lp_amp": "facet_amplitude",
        "lp_jitter": "tier_phase_jitter",
        "lp_phase_deg": "facet_phase_deg",
        "lp_bevel": "bevel_softness",
        "lp_cut_bot_deg": "tier_cut_bot_deg",
        "lp_cut_top_deg": "tier_cut_top_deg",
    },
}

_GLOBAL_REVERSE = _invert(_GLOBAL_ALIASES)
_REVERSE_BY_STYLE: Dict[str, Dict[str, str]] = {
    s: _invert(m) for s, m in _ALIASES_BY_STYLE.items()
}

# Public frozen mappings
GLOBAL_ALIASES: Mapping[str, str] = MappingProxyType(dict(_GLOBAL_ALIASES))
ALIASES_BY_STYLE: Mapping[str, Mapping[str, str]] = MappingProxyType(
    {k: MappingProxyType(dict(v)) for k, v in _ALIASES_BY_STYLE.items()}
)
GLOBAL_REVERSE: Mapping[str, str] = MappingProxyType(dict(_GLOBAL_REVERSE))
REVERSE_BY_STYLE: Mapping[str, Mapping[str, str]] = MappingProxyType(
    {k: MappingProxyType(dict(v)) for k, v in _REVERSE_BY_STYLE.items()}
)


# Lightweight accessors
def get_global_aliases() -> Mapping[str, str]:
    return GLOBAL_ALIASES


def get_aliases_by_style() -> Mapping[str, Mapping[str, str]]:
    return ALIASES_BY_STYLE


def get_global_reverse() -> Mapping[str, str]:
    return GLOBAL_REVERSE


def get_reverse_by_style() -> Mapping[str, Mapping[str, str]]:
    return REVERSE_BY_STYLE


__all__ = [
    "GLOBAL_ALIASES",
    "ALIASES_BY_STYLE",
    "GLOBAL_REVERSE",
    "REVERSE_BY_STYLE",
    "get_global_aliases",
    "get_aliases_by_style",
    "get_global_reverse",
    "get_reverse_by_style",
]
