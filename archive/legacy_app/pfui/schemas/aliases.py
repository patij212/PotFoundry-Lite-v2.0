# pfui/schemas/aliases.py - Alias mappings and normalization
"""Alias mappings between legacy (engine/YAML) and canonical (UI/export) keys."""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType
from typing import Literal

__all__ = [
    "ALIASES_BY_STYLE",
    "GLOBAL_ALIASES",
    "GLOBAL_REVERSE",
    "REVERSE_BY_STYLE",
    "get_aliases_by_style",
    "get_global_aliases",
    "get_global_reverse",
    "get_reverse_by_style",
    "normalize_style_opts",
    "to_canonical",
    "to_engine",
]


def _invert(d: Mapping[str, str]) -> dict[str, str]:
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

_GLOBAL_ALIASES: dict[str, str] = {
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

_ALIASES_BY_STYLE: dict[str, dict[str, str]] = {
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
_REVERSE_BY_STYLE: dict[str, dict[str, str]] = {
    s: _invert(m) for s, m in _ALIASES_BY_STYLE.items()
}


# Lightweight accessors to avoid heavy constant imports by consumers (helps typing tools)
def get_global_aliases() -> Mapping[str, str]:
    """Return the global alias mapping (legacy -> canonical).

    Brief:
        Provide a lightweight accessor that returns the read-only global alias
        map. Callers should import this function instead of importing the
        `GLOBAL_ALIASES` MappingProxyType directly to avoid binding heavy
        module-level constants at import time.

    Args:
        None

    Returns:
        Mapping[str, str]: A mapping from legacy/engine keys to canonical UI
            keys. The returned object is a read-only mapping (MappingProxyType
            view) and must be treated as immutable by callers.

    Raises:
        None

    Example:
        >>> from pfui.schemas import get_global_aliases
        >>> aliases = get_global_aliases()
        >>> aliases.get('spin_turns')
        'twist_total_turns'

    Performance:
        Fast and allocation-free (returns an existing MappingProxyType). Use
        this accessor to avoid expensive import-time traversal by static
        analysis tools.

    """
    return GLOBAL_ALIASES


def get_aliases_by_style() -> Mapping[str, Mapping[str, str]]:
    """Return per-style alias mappings.

    Brief:
        Accessor for per-style alias maps. Each top-level key is a style name
        (e.g., "HarmonicRipple") and the value is a mapping of legacy ->
        canonical keys for that style.

    Args:
        None

    Returns:
        Mapping[str, Mapping[str, str]]: Read-only mapping of style -> (legacy
            -> canonical) mappings.

    Raises:
        None

    Example:
        >>> get_aliases_by_style()['HarmonicRipple']['hr_petals']
        'petals_count'

    Performance:
        Returns an existing MappingProxyType; calling is cheap and avoids
        import-time binding of large constants.

    """
    return ALIASES_BY_STYLE


def get_global_reverse() -> Mapping[str, str]:
    """Return the inverted global alias map (canonical -> legacy).

    Brief:
        Convenience accessor that yields the canonical->legacy reverse map for
        global aliases. Useful for translating canonical UI keys back to
        legacy engine names when preparing arguments for engine calls.

    Args:
        None

    Returns:
        Mapping[str, str]: Read-only mapping from canonical names to legacy
            names.

    Raises:
        None

    Example:
        >>> get_global_reverse().get('twist_total_turns')
        'spin_turns'

    Performance:
        O(1) to return the existing MappingProxyType; safe for repeated use in
        import-light code paths.

    """
    return GLOBAL_REVERSE


def get_reverse_by_style() -> Mapping[str, Mapping[str, str]]:
    """Return per-style inverted alias maps.

    Brief:
        Accessor for per-style canonical->legacy mappings. Each top-level key
        is a style name and the value is a mapping from canonical key ->
        legacy key for that style.

    Args:
        None

    Returns:
        Mapping[str, Mapping[str, str]]: Read-only mapping of style -> (canonical
            -> legacy) mappings.

    Raises:
        None

    Example:
        >>> get_reverse_by_style()['HarmonicRipple']['petals_count']
        'hr_petals'

    Performance:
        Cheap accessor returning a prebuilt MappingProxyType structure.

    """
    return REVERSE_BY_STYLE


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


# Freeze mappings as read-only. Use `cast` to satisfy the type checker when
# replacing mutable dicts with MappingProxyType instances.
from typing import cast

# Freeze mappings as read-only and cast to Mapping[...] so the type checker
# sees the immutable MappingProxyType as the expected Mapping types.
GLOBAL_ALIASES = cast("Mapping[str, str]", MappingProxyType(dict(_GLOBAL_ALIASES)))
ALIASES_BY_STYLE = cast(
    "Mapping[str, Mapping[str, str]]",
    MappingProxyType({k: MappingProxyType(dict(v)) for k, v in _ALIASES_BY_STYLE.items()}),
)
GLOBAL_REVERSE = cast("Mapping[str, str]", MappingProxyType(dict(_GLOBAL_REVERSE)))
REVERSE_BY_STYLE = cast(
    "Mapping[str, Mapping[str, str]]",
    MappingProxyType({k: MappingProxyType(dict(v)) for k, v in _REVERSE_BY_STYLE.items()}),
)

