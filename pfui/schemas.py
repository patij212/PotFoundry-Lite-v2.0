# pfui/schemas.py — UI schemas + aliases (side-effect free, AI-friendly to read)
# This module intentionally contains UI-facing schema data and helpers only.
# It does NOT import or touch potfoundry/core/** and performs no file I/O on import.

from __future__ import annotations

from typing import Any, Dict, Mapping, Literal, TypedDict, Tuple, Optional
from types import MappingProxyType
import warnings

__all__ = [
    # primary schema/aliases
    "GLOBAL_CONTROLS",
    "STYLE_SCHEMAS",
    "GLOBAL_ALIASES",
    "ALIASES_BY_STYLE",
    "normalize_style_opts",
    "to_canonical",
    "to_engine",
    "CANONICAL_CONTROLS",
    "CANONICAL_STYLE_SCHEMAS",
    # schema helpers
    "ControlMeta",
    "ControlType",
    "get_schema",
    "apply_defaults",
    "sanitize_opts",
    "warn_on_legacy_keys",
    "validate_keyset",
    "compress_opts",
     "check_schema_integrity",
]

# =============================================================================
# Aliases: legacy (engine/YAML) <-> canonical (UI/export)
# =============================================================================

def _invert(d: Mapping[str, str]) -> Dict[str, str]:
    """Invert a string->string mapping.

    Purpose:
        Utility used to build canonical->legacy maps for key normalization.

    Inputs:
        d: Mapping[str, str] - mapping to invert.

    Outputs:
        Dict[str, str] - inverted mapping.

    Guarantees:
        - Pure function; does not mutate input.

    Errors:
        - None.

    Example:
        _invert({"a":"b"}) -> {"b":"a"}
    """
    return {v: k for k, v in d.items()}


# -- Canonical names (human-friendly) and alias maps --------------------------

GLOBAL_ALIASES: Mapping[str, str] = {
    # legacy -> canonical
    "spin_turns": "twist_total_turns",
    "spin_phase_deg": "twist_start_angle_deg",
    "spin_curve_exp": "twist_ease_exponent",
    "flare_center": "flare_pivot_height",
    "flare_sharp": "flare_pivot_sharpness",
    "bell_amp": "mid_bulge_amplitude",
    "bell_center": "mid_bulge_height",
    "bell_width": "mid_bulge_width",
}

ALIASES_BY_STYLE: Mapping[str, Mapping[str, str]] = {
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
}

GLOBAL_REVERSE = _invert(GLOBAL_ALIASES)
REVERSE_BY_STYLE: Dict[str, Dict[str, str]] = {s: _invert(m) for s, m in ALIASES_BY_STYLE.items()}


# Accepted directions for key normalization.
Direction = Literal["to_canonical", "to_engine", "both"]

def normalize_style_opts(
    style: str,
    opts: dict | None,
    direction: Direction = "to_canonical",
    *,
    strip_alt: bool = False,
) -> dict:
    """Convert option keys between legacy (engine) and canonical (UI/export).

    Purpose:
        Provide a single way to translate between keyspaces without mutating inputs.

    Inputs:
        style: str - style name (e.g., "HarmonicRipple").
        opts: dict | None - incoming options (may mix old/new keys).
        direction: str - one of:
            "to_canonical" : legacy -> canonical keys preferred
            "to_engine"    : canonical -> legacy keys preferred
            "both"         : include both sets (canonical + legacy)

    Outputs:
        dict - normalized dict (shallow copy).

    Guarantees:
        - Unknown keys are preserved as-is.
        - If both key forms exist, the one "preferred" by direction is kept.

    Errors:
        - ValueError if direction is not supported.

    Example:
        normalize_style_opts("HarmonicRipple", {"hr_petals":7}, "to_canonical")
        -> {"petals_count":7, ...}
    """
    if not opts:
        return {}
    out = dict(opts)

    style_alias = ALIASES_BY_STYLE.get(style, {})
    style_rev = REVERSE_BY_STYLE.get(style, {})

    def _map(d: dict, m: Mapping[str, str], prefer_target: bool) -> dict:
        res = dict(d)
        for src, tgt in m.items():
            # Only map src -> tgt when src exists. If prefer_target is True,
            # do not overwrite an existing tgt value (so the preferred key wins).
            if src in d and (not prefer_target or tgt not in d):
                res[tgt] = d[src]
        return res

    if direction in ("to_canonical", "both"):
        out = _map(out, GLOBAL_ALIASES, True)
        out = _map(out, style_alias, True)

    if direction in ("to_engine", "both"):
        out = _map(out, GLOBAL_REVERSE, True)
        out = _map(out, style_rev, True)

    if strip_alt:
        if direction == "to_canonical":
            # Remove legacy keys (sources) if their canonical targets exist.
            legacy_keys = set(GLOBAL_ALIASES.keys()) | set(style_alias.keys())
            # Remove only the legacy-form keys (sources). Keep canonical targets.
            for k in list(out.keys()):
                if k in legacy_keys:
                    # Only drop if its canonical target exists or was created above.
                    tgt = GLOBAL_ALIASES.get(k) or style_alias.get(k)
                    if tgt in out:
                        del out[k]
        elif direction == "to_engine":
            # Remove canonical keys (targets) if their legacy sources exist.
            canonical_keys = set(GLOBAL_ALIASES.values()) | set(style_alias.values())
            for k in list(out.keys()):
                if k in canonical_keys:
                    # Only drop if corresponding legacy key exists in the map.
                    src = GLOBAL_REVERSE.get(k) or style_rev.get(k)
                    if src in out:
                        del out[k]
    return out


def to_canonical(style: str, opts: dict | None) -> dict:
    """Wrapper: map legacy/mixed keys to canonical names.

    Purpose:
        Convenience helper for UI/export layers.

    Inputs:
        style: str
        opts: dict | None

    Outputs:
        dict - canonicalized options.

    Guarantees:
        - Pure wrapper around normalize_style_opts(..., "to_canonical").

    Errors:
        - None.
    """
    return normalize_style_opts(style, opts, "to_canonical")


def to_engine(style: str, opts: dict | None) -> dict:
    """Wrapper: map canonical/mixed keys to legacy names expected by geometry.

    Purpose:
        Ensure engine-facing calls continue to work while UI migrates to canonical names.

    Inputs:
        style: str
        opts: dict | None

    Outputs:
        dict - legacy-keyed options.

    Guarantees:
        - Pure wrapper around normalize_style_opts(..., "to_engine").

    Errors:
        - None.
    """
    return normalize_style_opts(style, opts, "to_engine")


# =============================================================================
# UI slider schemas (legacy-keyed for compatibility with existing UI)
# =============================================================================

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

STYLE_SCHEMAS: Dict[str, Dict[str, Dict[str, Any]]] = {
    "HarmonicRipple": {
        "hr_petals": {
            "label": "Petal count",
            "help": "Number of large lobes (petals) around the pot.",
            "type": "int",
            "min": 3,
            "max": 24,
            "step": 1,
            "default": 7,
            "canonical": "petals_count",
        },
        "hr_petal_amp": {
            "label": "Petal amplitude",
            "help": "How prominent the petal lobes are (fraction of radius).",
            "type": "float",
            "min": 0.0,
            "max": 0.4,
            "step": 0.01,
            "default": 0.16,
            "canonical": "petals_amplitude",
        },
        "hr_petal_phase_deg": {
            "label": "Petal phase (°)",
            "help": "Rotational offset for petals, in degrees.",
            "type": "int",
            "min": -180,
            "max": 180,
            "step": 1,
            "default": 17,
            "canonical": "petals_phase_deg",
        },
        "hr_ripple_freq": {
            "label": "Ripple frequency",
            "help": "Number of fine ripples around the circumference.",
            "type": "int",
            "min": 5,
            "max": 60,
            "step": 1,
            "default": 31,
            "canonical": "ripple_frequency",
        },
        "hr_ripple_amp": {
            "label": "Ripple amplitude",
            "help": "Height of fine ripples (fraction of radius).",
            "type": "float",
            "min": 0.0,
            "max": 0.12,
            "step": 0.005,
            "default": 0.03,
            "canonical": "ripple_amplitude",
        },
        "hr_ripple_phase_deg": {
            "label": "Ripple phase (°)",
            "help": "Rotational offset for ripples, in degrees.",
            "type": "int",
            "min": -180,
            "max": 180,
            "step": 1,
            "default": 0,
            "canonical": "ripple_phase_deg",
        },
        "hr_petal_zgain": {
            "label": "Petal z-phase gain",
            "help": "How petal phase accumulates along height; 0=no change, 1=1× cycles.",
            "type": "float",
            "min": 0.0,
            "max": 1.2,
            "step": 0.05,
            "default": 0.6,
            "canonical": "petals_zphase_gain",
        },
        "hr_ripple_zgain": {
            "label": "Ripple z-phase gain",
            "help": "How ripple phase accumulates along height.",
            "type": "float",
            "min": 0.0,
            "max": 1.2,
            "step": 0.05,
            "default": 1.0,
            "canonical": "ripple_zphase_gain",
        },
        "hr_bell": {
            "label": "Mid-height boost",
            "help": "Extra bell-like bulge around mid-height specific to this style.",
            "type": "float",
            "min": 0.0,
            "max": 0.25,
            "step": 0.005,
            "default": 0.05,
            "canonical": "mid_bulge_boost",
        },
    },
    "SpiralRidges": {
        "spiral_k": {
            "label": "Ridge count",
            "help": "Number of spiral ridges.",
            "type": "int",
            "min": 3,
            "max": 24,
            "step": 1,
            "default": 9,
            "canonical": "ridge_count",
        },
        "spiral_turns": {
            "label": "Helix turns",
            "help": "Total helical turns from base to rim.",
            "type": "float",
            "min": 0.2,
            "max": 3.0,
            "step": 0.05,
            "default": 1.15,
            "canonical": "ridge_helix_turns",
        },
        "spiral_amp_min": {
            "label": "Ridge amplitude @ base",
            "help": "Ridge height near the base (fraction of radius).",
            "type": "float",
            "min": 0.0,
            "max": 0.7,
            "step": 0.01,
            "default": 0.15,
            "canonical": "ridge_amplitude_base",
        },
        "spiral_amp_max": {
            "label": "Ridge amplitude @ top",
            "help": "Ridge height near the rim (fraction of radius).",
            "type": "float",
            "min": 0.0,
            "max": 0.8,
            "step": 0.01,
            "default": 0.25,
            "canonical": "ridge_amplitude_top",
        },
        "spiral_amp_curve": {
            "label": "Ridge amplitude curve",
            "help": "Exponent controlling how ridge amplitude grows with height.",
            "type": "float",
            "min": 0.6,
            "max": 2.0,
            "step": 0.05,
            "default": 1.3,
            "canonical": "ridge_amplitude_growth_exp",
        },
        "spiral_groove_amp": {
            "label": "Fine groove amplitude",
            "help": "Adds fine grooves on top of ridges (fraction of radius).",
            "type": "float",
            "min": 0.0,
            "max": 0.12,
            "step": 0.005,
            "default": 0.04,
            "canonical": "groove_amplitude",
        },
        "spiral_groove_mult": {
            "label": "Groove frequency × k",
            "help": "Frequency multiplier for grooves relative to ridge count.",
            "type": "float",
            "min": 1.0,
            "max": 5.0,
            "step": 0.1,
            "default": 3.0,
            "canonical": "groove_frequency_multiplier",
        },
        "spiral_phase_mult": {
            "label": "Groove phase × turns",
            "help": "Phase multiplier for grooves relative to helix turns.",
            "type": "float",
            "min": 0.0,
            "max": 3.0,
            "step": 0.1,
            "default": 1.7,
            "canonical": "groove_phase_multiplier",
        },
    },
    "SuperellipseMorph": {
        "se_m_base": {
            "label": "Superellipse power @ base",
            "help": "Lamé exponent near the base; 2=circle, higher=squarer.",
            "type": "float",
            "min": 1.0,
            "max": 6.0,
            "step": 0.1,
            "default": 2.0,
            "canonical": "superellipse_power_base",
        },
        "se_m_top": {
            "label": "Superellipse power @ top",
            "help": "Lamé exponent near the rim.",
            "type": "float",
            "min": 1.0,
            "max": 8.0,
            "step": 0.1,
            "default": 5.5,
            "canonical": "superellipse_power_top",
        },
        "se_m_curve_exp": {
            "label": "Power morph exponent",
            "help": "Exponent controlling how the power morphs along height.",
            "type": "float",
            "min": 0.6,
            "max": 2.0,
            "step": 0.05,
            "default": 1.1,
            "canonical": "superellipse_power_morph_exp",
        },
        "se_c4_amp": {
            "label": "cos(4θ) amplitude",
            "help": "Amplitude for 4-fold modulation (square-like).",
            "type": "float",
            "min": 0.0,
            "max": 0.25,
            "step": 0.005,
            "default": 0.08,
            "canonical": "cos4_amplitude",
        },
        "se_c4_phase_deg": {
            "label": "cos(4θ) phase (°)",
            "help": "Phase for 4-fold modulation, degrees.",
            "type": "int",
            "min": -180,
            "max": 180,
            "step": 1,
            "default": 23,
            "canonical": "cos4_phase_deg",
        },
        "se_c8_amp": {
            "label": "cos(8θ) amplitude",
            "help": "Amplitude for 8-fold modulation (star-like).",
            "type": "float",
            "min": 0.0,
            "max": 0.25,
            "step": 0.005,
            "default": 0.03,
            "canonical": "cos8_amplitude",
        },
        "se_c8_phase_deg": {
            "label": "cos(8θ) phase (°)",
            "help": "Phase for 8-fold modulation, degrees.",
            "type": "int",
            "min": -180,
            "max": 180,
            "step": 1,
            "default": 0,
            "canonical": "cos8_phase_deg",
        },
    },
    "SuperformulaBlossom": {
        "sf_m_base": {
            "label": "Blossom symmetry @ base (m)",
            "help": "Superformula symmetry count near base.",
            "type": "float",
            "min": 2.0,
            "max": 14.0,
            "step": 0.5,
            "default": 6.0,
            "canonical": "blossom_symmetry_base",
        },
        "sf_m_top": {
            "label": "Blossom symmetry @ top (m)",
            "help": "Superformula symmetry count near rim.",
            "type": "float",
            "min": 2.0,
            "max": 18.0,
            "step": 0.5,
            "default": 10.0,
            "canonical": "blossom_symmetry_top",
        },
        "sf_m_curve_exp": {
            "label": "Symmetry morph exponent",
            "help": "Exponent controlling how symmetry morphs along height.",
            "type": "float",
            "min": 0.6,
            "max": 2.0,
            "step": 0.05,
            "default": 1.2,
            "canonical": "blossom_symmetry_morph_exp",
        },
        "sf_a": {
            "label": "a (radius scale)",
            "help": "Superformula parameter a (typically keep at 1).",
            "type": "float",
            "min": 0.4,
            "max": 2.5,
            "step": 0.05,
            "default": 1.0,
            "canonical": "blossom_a",
        },
        "sf_b": {
            "label": "b (radius scale)",
            "help": "Superformula parameter b (typically keep at 1).",
            "type": "float",
            "min": 0.4,
            "max": 2.5,
            "step": 0.05,
            "default": 1.0,
            "canonical": "blossom_b",
        },
        "sf_n1": {
            "label": "Sharpness @ base (n1)",
            "help": "Higher = sharper corners at the base.",
            "type": "float",
            "min": 0.1,
            "max": 4.0,
            "step": 0.05,
            "default": 0.35,
            "canonical": "blossom_sharpness_base",
        },
        "sf_n1_top": {
            "label": "Sharpness @ top (n1)",
            "help": "Higher = sharper corners near the rim.",
            "type": "float",
            "min": 0.1,
            "max": 4.0,
            "step": 0.05,
            "default": 0.50,
            "canonical": "blossom_sharpness_top",
        },
        "sf_n2": {
            "label": "Cos power @ base (n2)",
            "help": "Exponent on cosine term at base.",
            "type": "float",
            "min": 0.2,
            "max": 4.0,
            "step": 0.05,
            "default": 0.80,
            "canonical": "blossom_cos_power_base",
        },
        "sf_n2_top": {
            "label": "Cos power @ top (n2)",
            "help": "Exponent on cosine term near rim.",
            "type": "float",
            "min": 0.2,
            "max": 4.0,
            "step": 0.05,
            "default": 1.40,
            "canonical": "blossom_cos_power_top",
        },
        "sf_n3": {
            "label": "Sin power @ base (n3)",
            "help": "Exponent on sine term at base.",
            "type": "float",
            "min": 0.2,
            "max": 4.0,
            "step": 0.05,
            "default": 0.80,
            "canonical": "blossom_sin_power_base",
        },
        "sf_n3_top": {
            "label": "Sin power @ top (n3)",
            "help": "Exponent on sine term near rim.",
            "type": "float",
            "min": 0.2,
            "max": 4.0,
            "step": 0.05,
            "default": 0.80,
            "canonical": "blossom_sin_power_top",
        },
    },
    "FourierBloom": {
        "fb_strength": {
            "label": "Harmonic blend strength",
            "help": "Intensity of the blended Fourier detail across height.",
            "type": "float",
            "min": 0.0,
            "max": 2.0,
            "step": 0.05,
            "default": 1.0,
            "canonical": "harmonic_blend_strength",
        },
        "fb_base_cos8_amp": {
            "label": "Base cos(8θ) amplitude",
            "help": "Low-level 8-fold modulation at base.",
            "type": "float",
            "min": -1.0,
            "max": 1.0,
            "step": 0.01,
            "default": 0.12,
            "canonical": "base_cos8_amplitude",
        },
        "fb_base_cos8_phase": {
            "label": "Base cos(8θ) phase (rad)",
            "help": "Phase for base cos(8θ) in radians.",
            "type": "float",
            "min": -3.14,
            "max": 3.14,
            "step": 0.01,
            "default": 0.0,
            "canonical": "base_cos8_phase_rad",
        },
        "fb_base_sin4_amp": {
            "label": "Base sin(4θ) amplitude",
            "help": "Low-level 4-fold modulation at base.",
            "type": "float",
            "min": -1.0,
            "max": 1.0,
            "step": 0.01,
            "default": 0.05,
            "canonical": "base_sin4_amplitude",
        },
        "fb_base_sin4_phase": {
            "label": "Base sin(4θ) phase (rad)",
            "help": "Phase for base sin(4θ) in radians.",
            "type": "float",
            "min": -3.14,
            "max": 3.14,
            "step": 0.01,
            "default": 0.6,
            "canonical": "base_sin4_phase_rad",
        },
        "fb_base_cos12_amp": {
            "label": "Base cos(12θ) amplitude",
            "help": "12-fold modulation at base.",
            "type": "float",
            "min": -1.0,
            "max": 1.0,
            "step": 0.01,
            "default": -0.04,
            "canonical": "base_cos12_amplitude",
        },
        "fb_base_cos12_phase": {
            "label": "Base cos(12θ) phase (rad)",
            "help": "Phase for base cos(12θ) in radians.",
            "type": "float",
            "min": -3.14,
            "max": 3.14,
            "step": 0.01,
            "default": 1.3,
            "canonical": "base_cos12_phase_rad",
        },
        "fb_top_cos11_amp": {
            "label": "Top cos(11θ) amplitude",
            "help": "11-fold modulation at top.",
            "type": "float",
            "min": -1.0,
            "max": 1.0,
            "step": 0.01,
            "default": 0.18,
            "canonical": "top_cos11_amplitude",
        },
        "fb_top_cos11_phase": {
            "label": "Top cos(11θ) phase (rad)",
            "help": "Phase for top cos(11θ) in radians.",
            "type": "float",
            "min": -3.14,
            "max": 3.14,
            "step": 0.01,
            "default": 0.5,
            "canonical": "top_cos11_phase_rad",
        },
        "fb_top_sin7_amp": {
            "label": "Top sin(7θ) amplitude",
            "help": "7-fold modulation at top.",
            "type": "float",
            "min": -1.0,
            "max": 1.0,
            "step": 0.01,
            "default": -0.07,
            "canonical": "top_sin7_amplitude",
        },
        "fb_top_sin7_phase": {
            "label": "Top sin(7θ) phase (rad)",
            "help": "Phase for top sin(7θ) in radians.",
            "type": "float",
            "min": -3.14,
            "max": 3.14,
            "step": 0.01,
            "default": 0.0,
            "canonical": "top_sin7_phase_rad",
        },
        "fb_top_cos22_amp": {
            "label": "Top cos(22θ) amplitude",
            "help": "22-fold modulation at top.",
            "type": "float",
            "min": -1.0,
            "max": 1.0,
            "step": 0.01,
            "default": 0.05,
            "canonical": "top_cos22_amplitude",
        },
        "fb_top_cos22_phase": {
            "label": "Top cos(22θ) phase (rad)",
            "help": "Phase for top cos(22θ) in radians.",
            "type": "float",
            "min": -3.14,
            "max": 3.14,
            "step": 0.01,
            "default": 0.9,
            "canonical": "top_cos22_phase_rad",
        },
        "fb_wobble_amp": {
            "label": "Wobble amplitude",
            "help": "Gentle wobble across height.",
            "type": "float",
            "min": 0.0,
            "max": 0.4,
            "step": 0.01,
            "default": 0.06,
            "canonical": "wobble_amplitude",
        },
        "fb_wobble_freq": {
            "label": "Wobble frequency (×θ)",
            "help": "How many wobble cycles around the circumference.",
            "type": "int",
            "min": 1,
            "max": 16,
            "step": 1,
            "default": 5,
            "canonical": "wobble_frequency_x_theta",
        },
        "fb_wobble_zgain": {
            "label": "Wobble z-gain (×τ)",
            "help": "How wobble evolves with height; 0=flat, 1=grows with height.",
            "type": "float",
            "min": 0.0,
            "max": 1.0,
            "step": 0.05,
            "default": 0.5,
            "canonical": "wobble_z_gain_x_tau",
        },
    },
}

# =============================================================================
# Canonical schema views (for export/docs/UI that prefer canonical keys)
# =============================================================================

def _build_canonical_schema() -> tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Dict[str, Any]]]]:
    """Construct canonical-keyed schema mirrors.

    Purpose:
        Remap legacy-keyed UI schema blocks to canonical-keyed views.

    Inputs:
        None (uses module-level schema dicts).

    Outputs:
        (canonical_globals, canonical_styles) where both are dicts keyed by canonical names.

    Guarantees:
        - Does not mutate the original schema dicts.

    Errors:
        - None.

    Example:
        CANONICAL_CONTROLS["twist_total_turns"] -> {..., "legacy": "spin_turns"}
    """
    def remap_block(block: Dict[str, Dict[str, Any]], alias_map: Mapping[str, str]) -> Dict[str, Dict[str, Any]]:
        out: Dict[str, Dict[str, Any]] = {}
        for legacy_key, meta in block.items():
            canon_key = alias_map.get(legacy_key, legacy_key)
            m = dict(meta)
            m.setdefault("label", legacy_key)
            m.setdefault("help", "")
            m["legacy"] = legacy_key
            out[canon_key] = m
        return out

    canonical_globals = remap_block(GLOBAL_CONTROLS, GLOBAL_ALIASES)
    canonical_styles: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for style, block in STYLE_SCHEMAS.items():
        canonical_styles[style] = remap_block(block, ALIASES_BY_STYLE.get(style, {}))
    return canonical_globals, canonical_styles


CANONICAL_CONTROLS, CANONICAL_STYLE_SCHEMAS = _build_canonical_schema()

# Freeze alias maps (and their reverses) to avoid runtime mutation.
GLOBAL_ALIASES = MappingProxyType(dict(GLOBAL_ALIASES))
ALIASES_BY_STYLE = MappingProxyType({k: MappingProxyType(v) for k, v in ALIASES_BY_STYLE.items()})
GLOBAL_REVERSE = MappingProxyType(GLOBAL_REVERSE)
REVERSE_BY_STYLE = MappingProxyType({k: MappingProxyType(v) for k, v in REVERSE_BY_STYLE.items()})

# Freeze top-level schema dicts to avoid accidental mutation at runtime.
GLOBAL_CONTROLS = MappingProxyType({k: MappingProxyType(v) for k, v in GLOBAL_CONTROLS.items()})
STYLE_SCHEMAS = MappingProxyType({k: MappingProxyType({kk: MappingProxyType(mm) for kk, mm in v.items()}) for k, v in STYLE_SCHEMAS.items()})
CANONICAL_CONTROLS = MappingProxyType({k: MappingProxyType(v) for k, v in CANONICAL_CONTROLS.items()})
CANONICAL_STYLE_SCHEMAS = MappingProxyType({k: MappingProxyType({kk: MappingProxyType(mm) for kk, mm in v.items()}) for k, v in CANONICAL_STYLE_SCHEMAS.items()})

# =============================================================================
# Validation, defaults, and schema helpers
# =============================================================================

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


def get_schema(style: str, *, canonical: bool = False) -> Dict[str, ControlMeta]:
    """Return merged schema (globals + per-style), keyed by legacy or canonical names.

    Purpose:
        Feed UI or export with one dict keyed by the desired keyspace.

    Inputs:
        style: str - style name.
        canonical: bool - True returns canonical-keyed schema; False returns legacy-keyed.

    Outputs:
        Dict[str, ControlMeta] - shallow copies of control meta dicts.

    Guarantees:
        - Pure function; does not mutate module-level dicts.
        - Returns empty per-style block if style unknown.

    Errors:
        - None.
    """
    if canonical:
        block: Dict[str, ControlMeta] = dict(CANONICAL_CONTROLS)  # type: ignore[assignment]
        block.update(CANONICAL_STYLE_SCHEMAS.get(style, {}))  # type: ignore[arg-type]
    else:
        block = dict(GLOBAL_CONTROLS)  # type: ignore[assignment]
        block.update(STYLE_SCHEMAS.get(style, {}))
    return block


def apply_defaults(style: str, opts: dict, *, canonical: bool = False) -> dict:
    """Fill missing keys with schema defaults.

    Purpose:
        Make downstream code simpler by ensuring required keys exist.

    Inputs:
        style: str
        opts: dict - partial or full options
        canonical: bool - interpret keys as canonical if True

    Outputs:
        dict - copy with defaults filled.

    Guarantees:
        - Only fills keys present in schema and missing in opts.
        - Does not mutate inputs.

    Errors:
        - None.
    """
    sch = get_schema(style, canonical=canonical)
    out = {**opts}
    for k, meta in sch.items():
        if k not in out and "default" in meta:
            out[k] = meta["default"]
    return out


def _coerce_one(v: Any, meta: ControlMeta) -> Any:
    """Coerce a single value to the type declared by meta.

    Purpose:
        Harden user input before using it.

    Inputs:
        v: Any - incoming value
        meta: ControlMeta - control metadata (type/min/max)

    Outputs:
        Any - coerced value

    Guarantees:
        - int/float are coerced via float -> int round for "int".
        - bool accepts common truthy strings.

    Errors:
        - ValueError for invalid numeric coercions.
    """
    t = meta.get("type")
    if t == "int":
        try:
            v = int(round(float(v)))
        except Exception as e:
            raise ValueError(f"expected int, got {v!r}") from e
    elif t == "float":
        try:
            v = float(v)
        except Exception as e:
            raise ValueError(f"expected float, got {v!r}") from e
    elif t == "bool":
        if isinstance(v, str):
            v = v.strip().lower() in {"1", "true", "yes", "on"}
        else:
            v = bool(v)
    elif t == "select":
        # enforce allowed options if provided (accept list or tuple)
        opts = meta.get("options")
        if isinstance(opts, (list, tuple)) and opts:
            if v not in opts:
                raise ValueError(f"invalid option {v!r}; expected one of {list(opts)!r}")
    return v


def sanitize_opts(style: str, opts: dict, *, canonical: bool = False) -> Tuple[dict, list[str]]:
    """Coerce types, clamp to min/max, and fill defaults.

    Purpose:
        Create safe, engine/preview-ready option dicts.

    Inputs:
        style: str
        opts: dict
        canonical: bool - interpret keys as canonical if True

    Outputs:
        (clean_opts, errors):
            clean_opts: dict - coerced + clamped + defaults-filled
            errors: list[str] - human-friendly conversion errors encountered

    Guarantees:
        - Unknown keys are passed through unchanged.
        - Defaults are applied last.

    Errors:
        - None (errors collected in list instead of raising).
    """
    sch = get_schema(style, canonical=canonical)
    out: dict = {}
    errors: list[str] = []

    for k, v in opts.items():
        meta = sch.get(k)
        if not meta:
            out[k] = v  # unknown key: pass through
            continue
        try:
            vv = _coerce_one(v, meta)
            if isinstance(vv, (int, float)):
                if "min" in meta:
                    vv = max(vv, meta["min"])  # type: ignore[index]
                if "max" in meta:
                    vv = min(vv, meta["max"])  # type: ignore[index]
            out[k] = vv
        except Exception as e:
            errors.append(f"{k}: {e}")

    out = apply_defaults(style, out, canonical=canonical)
    return out, errors


def warn_on_legacy_keys(style: str, opts: dict) -> None:
    """Emit a warning for legacy keys that have canonical replacements.

    Purpose:
        Nudge UI developers toward to_canonical(...) at display time.

    Inputs:
        style: str
        opts: dict

    Outputs:
        None

    Guarantees:
        - Emits a Python warning only when legacy keys are present.

    Errors:
        - None.
    """
    alias = ALIASES_BY_STYLE.get(style, {})
    # include both style-specific and global legacy aliases
    legacy_seen = [k for k in opts if (k in alias) or (k in GLOBAL_ALIASES)]
    if legacy_seen:
        warnings.warn(
            "Legacy keys detected: "
            + ", ".join(legacy_seen)
            + ". Prefer canonical names via to_canonical(...).",
            stacklevel=2,
        )


def validate_keyset(style: str, opts: dict, *, canonical: bool = False) -> list[str]:
    """Return unknown keys relative to the schema.

    Purpose:
        Aid linting/tests for user presets and imports.

    Inputs:
        style: str
        opts: dict
        canonical: bool

    Outputs:
        list[str] - keys not present in the schema for the chosen keyspace.

    Guarantees:
        - Pure function.

    Errors:
        - None.
    """
    sch = get_schema(style, canonical=canonical)
    return [k for k in opts.keys() if k not in sch]


def compress_opts(
    style: str,
    opts: dict,
    *,
    canonical: bool = True,
    drop_defaults: bool = True,
    round_to: Optional[int] = 4,
) -> dict:
    """Return a compact copy of options for export (e.g., YAML).

    Purpose:
        Keep exports minimal and human-diffable.

    Inputs:
        style: str
        opts: dict
        canonical: bool - interpret as canonical keys if True
        drop_defaults: bool - omit values equal to schema defaults
        round_to: Optional[int] - decimal places for floats, or None to keep exact

    Outputs:
        dict - compacted options

    Guarantees:
        - Only keys present in opts are returned (minus dropped defaults).
        - Unknown keys are preserved.

    Errors:
        - None.
    """
    sch = get_schema(style, canonical=canonical)
    out: dict = {}
    for k, v in opts.items():
        # Round value first (if requested)
        if round_to is not None and isinstance(v, float):
            v = round(v, round_to)
        # Fetch and round default the same way before comparing
        dv = sch.get(k, {}).get("default", None)
        if drop_defaults and dv is not None:
            dv_cmp = round(dv, round_to) if (round_to is not None and isinstance(dv, float)) else dv
            if v == dv_cmp:
                continue
        out[k] = v
    return out


if __name__ == "__main__":
    # Allow running the module directly without side effects (import-safe).
    print("pfui.schemas loaded OK. Styles:", ", ".join(sorted(STYLE_SCHEMAS.keys())))


# =============================================================================
# Integrity checks and deep-freeze
# =============================================================================

def _freeze_meta(d: Dict[str, Any]) -> MappingProxyType:
    """Return an immutable view of control meta; freeze options to tuple if present."""
    frozen = dict(d)
    if "options" in frozen and isinstance(frozen["options"], list):
        frozen["options"] = tuple(frozen["options"])
    return MappingProxyType(frozen)


def _freeze_block(block: Dict[str, Dict[str, Any]]) -> MappingProxyType:
    """Freeze a block mapping key -> meta."""
    return MappingProxyType({k: _freeze_meta(v) for k, v in block.items()})


def _freeze_style_map(style_map: Dict[str, Dict[str, Dict[str, Any]]]) -> MappingProxyType:
    """Freeze style -> (key -> meta) mapping."""
    return MappingProxyType({style: _freeze_block(b) for style, b in style_map.items()})


def check_schema_integrity() -> list[str]:
    """Validate internal consistency between alias maps and schema blocks.

    Returns:
        list[str]: problems found (empty if OK).
    """
    problems: list[str] = []
    # 1) Every legacy global alias key should exist in GLOBAL_CONTROLS (since UI is legacy-keyed).
    for k in GLOBAL_ALIASES.keys():
        if k not in GLOBAL_CONTROLS:
            problems.append(f"GLOBAL_ALIASES legacy key missing from GLOBAL_CONTROLS: {k}")
    # 2) For each style, every legacy key in ALIASES_BY_STYLE[style] should exist in STYLE_SCHEMAS[style].
    for style, amap in ALIASES_BY_STYLE.items():
        block = STYLE_SCHEMAS.get(style, {})
        for legacy_key in amap.keys():
            if legacy_key not in block:
                problems.append(f"{style}: alias legacy key missing from STYLE_SCHEMAS: {legacy_key}")
    return problems


# Freeze alias maps (and their reverses) to avoid runtime mutation.
GLOBAL_ALIASES = MappingProxyType(dict(GLOBAL_ALIASES))
ALIASES_BY_STYLE = MappingProxyType({k: MappingProxyType(v) for k, v in ALIASES_BY_STYLE.items()})
GLOBAL_REVERSE = MappingProxyType(dict(GLOBAL_REVERSE))
REVERSE_BY_STYLE = MappingProxyType({k: MappingProxyType(v) for k, v in REVERSE_BY_STYLE.items()})

# Build canonical mirrors before freezing schema blocks deeply.
CANONICAL_CONTROLS, CANONICAL_STYLE_SCHEMAS = _build_canonical_schema()

# Deep-freeze schema dicts (blocks and inner meta).
GLOBAL_CONTROLS = _freeze_block(dict(GLOBAL_CONTROLS))  # type: ignore[arg-type]
STYLE_SCHEMAS = _freeze_style_map({k: dict(v) for k, v in STYLE_SCHEMAS.items()})  # type: ignore[dict-item]
CANONICAL_CONTROLS = _freeze_block(dict(CANONICAL_CONTROLS))  # type: ignore[arg-type]
CANONICAL_STYLE_SCHEMAS = _freeze_style_map({k: dict(v) for k, v in CANONICAL_STYLE_SCHEMAS.items()})  # type: ignore[dict-item]
