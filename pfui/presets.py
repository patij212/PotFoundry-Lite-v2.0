# pfui/presets.py
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict
import importlib
import streamlit as st

# Lazy-load STYLE_SCHEMAS to avoid importing the heavy pfui.schemas module on import.
STYLE_SCHEMAS: dict = {}


def _ensure_style_schemas() -> dict:
    global STYLE_SCHEMAS
    if not STYLE_SCHEMAS:
        try:
            mod = importlib.import_module('pfui.schemas')
            STYLE_SCHEMAS.update(getattr(mod, 'STYLE_SCHEMAS', {}) or {})
        except Exception:
            STYLE_SCHEMAS = {}
    return STYLE_SCHEMAS

def widget_key(style: str, field: str) -> str:
    """Generate unique widget key for Streamlit session state.
    
    Args:
        style: Style name
        field: Field/parameter name
        
    Returns:
        Unique widget key string
    """
    return f"opt__{style}_{field}"


# Built-in curated presets (unchanged)
PRESETS: Dict[str, Dict[str, Dict[str, Any]]] = {
    # LowPolyFacet presets to quickly match the original look
    "LowPolyFacet": {
        # Crisp, inward chamfer bands with proportional depth
        "Lowpoly crisp chamfer": {
            "lp_facets": 12,
            "lp_tiers": 9,
            "lp_amp": 0.14,
            "lp_jitter": 0.10,
            "lp_phase_deg": 0,
            "lp_bevel": 0.02,
            "lp_facet_dir": "in",
            "lp_outward_mode": False,
            "lp_cut_bot_deg": 30,
            "lp_cut_top_deg": 30,
            "lp_cut_cap_mm": 0.8,
            "lp_cut_depth_frac_of_facet": 0.35,
            "lp_cut_z_window_frac": 12.0,
            "lp_cut_softness_mm": 0.03,
            "lp_uniform_ring": False,
            "lp_edge_cut_mm": 0.0,
            "lp_edge_cut_sharp": 1.2,
        },
        # Classic: single-tier faceted pot, no outward enforcement, gentle bevel
        "Classic Faceted": {
            "lp_facets": 12,
            "lp_tiers": 1,
            "lp_amp": 0.12,
            "lp_jitter": 0.0,
            "lp_phase_deg": 0,
            "lp_bevel": 0.18,
            "lp_outward_mode": False,
            # Tiny tier chamfer present but angles off so shape remains unchanged
            "lp_cut_bot_deg": 0,
            "lp_cut_top_deg": 0,
            "lp_cut_cap_mm": 0.8,
            "lp_cut_z_window_frac": 12.0,
        },
        # Subtle tiered version: low amplitude, a touch of jitter, small cut angles
        "Tiered Subtle": {
            "lp_facets": 12,
            "lp_tiers": 5,
            "lp_amp": 0.10,
            "lp_jitter": 0.12,
            "lp_phase_deg": 0,
            "lp_bevel": 0.15,
            "lp_outward_mode": False,
            "lp_cut_bot_deg": 3,
            "lp_cut_top_deg": 2,
            "lp_cut_cap_mm": 0.8,
            "lp_cut_z_window_frac": 12.0,
        },
        # Gentle outward ridge diagnostic, constrained by small angles and cap
        "Outward Ridge (gentle)": {
            "lp_facets": 12,
            "lp_tiers": 8,
            "lp_amp": 0.08,
            "lp_jitter": 0.10,
            "lp_phase_deg": 0,
            "lp_bevel": 0.12,
            "lp_outward_mode": True,
            "lp_cut_bot_deg": 10,
            "lp_cut_top_deg": 6,
            "lp_cut_cap_mm": 0.7,
            "lp_cut_z_window_frac": 10.0,
        },
        # Yellow-pot-like faceted chamfer look: outward facets + uniform seam rings + edge trims
        "Faceted Chamfer (Yellow-like)": {
            "lp_facets": 12,
            "lp_tiers": 9,
            "lp_amp": 0.18,
            "lp_jitter": 0.08,
            "lp_phase_deg": 0,
            "lp_bevel": 0.08,
            "lp_facet_dir": "out",
            "lp_outward_mode": False,
            "lp_cut_bot_deg": 18,
            "lp_cut_top_deg": 12,
            "lp_cut_cap_mm": 1.5,
            "lp_cut_z_window_frac": 10.0,
            "lp_uniform_ring": True,
            "lp_edge_cut_mm": 0.6,
            "lp_edge_cut_sharp": 2.0,
        },
        # Crisp seams: de-jag and stabilized diagonals without flattening
        "Crisp Seam (De-Jag)": {
            "lp_facets": 14,
            "lp_tiers": 8,
            "lp_amp": 0.12,
            "lp_jitter": 0.10,
            "lp_phase_deg": 0,
            "lp_bevel": 0.08,
            "lp_facet_dir": "in",
            "lp_outward_mode": False,
            "lp_cut_bot_deg": 16,
            "lp_cut_top_deg": 14,
            "lp_cut_cap_mm": 0.8,
            "lp_cut_z_window_frac": 10.0,
            "lp_edge_solidify_enable": True,
            "lp_edge_solidify_strength": 0.8,
            "lp_edge_solidify_thresh": 0.7,
            "lp_edge_solidify_passes": 2,
            "lp_diagonal_smooth_passes": 2,
            "lp_cut_straight_smooth_mode": True,
            "lp_cut_straight_smooth_strength": 0.7,
            "lp_cut_straight_smooth_passes": 2,
        },
    },
    "HarmonicRipple": {
        "Classic Ripple": {"hr_petals": 7,  "hr_petal_amp": 0.16, "hr_ripple_freq": 31, "hr_ripple_amp": 0.03,  "hr_bell": 0.05},
        "Bold Ripple":    {"hr_petals": 9,  "hr_petal_amp": 0.26, "hr_ripple_freq": 27, "hr_ripple_amp": 0.065, "hr_bell": 0.08},
        "Fine Ripple":    {"hr_petals": 12, "hr_petal_amp": 0.08, "hr_ripple_freq": 48, "hr_ripple_amp": 0.02,  "hr_bell": 0.03},
    },
    "SpiralRidges": {
        "Subtle Spiral":   {"spiral_k": 7,  "spiral_turns": 0.8,  "spiral_amp_min": 0.08, "spiral_amp_max": 0.18},
        "Bold Spiral":     {"spiral_k": 9,  "spiral_turns": 1.15, "spiral_amp_min": 0.15, "spiral_amp_max": 0.25},
        "Twisty Showcase": {"spiral_k": 11, "spiral_turns": 1.7,  "spiral_amp_min": 0.12, "spiral_amp_max": 0.32},
    },
    "SuperellipseMorph": {
        "Rounded Square": {"se_m_base": 2.0, "se_m_top": 5.5},
        "Softening":      {"se_m_base": 3.0, "se_m_top": 2.0},
        "Sharper Top":    {"se_m_base": 2.0, "se_m_top": 7.0},
    },
    "SuperformulaBlossom": {
        "Gentle Flower": {"sf_m_base": 6.0,  "sf_m_top": 10.0, "sf_n1": 0.35, "sf_n2": 0.8, "sf_n3": 0.8,  "sf_strength": 0.6},
        "Sharp Petals":  {"sf_m_base": 8.0,  "sf_m_top": 12.0, "sf_n1": 0.6,  "sf_n2": 1.6, "sf_n3": 1.6, "sf_strength": 0.8},
        "Wide Petals":   {"sf_m_base": 5.0,  "sf_m_top": 8.0,  "sf_n1": 0.25, "sf_n2": 0.6, "sf_n3": 0.6, "sf_strength": 0.5},
            # Crisp, de-jagged petals with stabilized seams
        "Crisp Petals (De-Jag)": {
            "sf_strength": 0.75,
            "sf_m_base": 8.0,
            "sf_m_top": 12.0,
            "sf_n1": 0.55,
            "sf_n2": 1.4,
            "sf_n3": 1.4,
                # Flow-aligned edge reconstruction (debug baseline, v2: ridge_paths)
                "sf_edge_flow_reconstruct_enable": True,
                "sf_edge_flow_mode": "ridge_paths",  # follow diagonal ridges strictly
                "sf_edge_flow_window": 9,
                "sf_edge_flow_amount": 0.85,
                "sf_edge_flow_quantile": 0.95,
                "sf_edge_flow_peak_q": 0.94,
                "sf_edge_flow_slopes_max": 2,
                "sf_edge_flow_paths_band": 1,
                "sf_edge_flow_max_paths": 4,
                "sf_edge_flow_valley_band_cols": 8,
                "sf_edge_flow_valley_band_decay": 0.0,
                "sf_edge_flow_twist_compensate": True,
                "sf_edge_flow_valley_only": True,
                # Reduce lateral machinery during debug to avoid spurious peaks
                "sf_edge_flow_theta_snap": 0,
                "sf_edge_flow_auto_deoffset": False,
                "sf_edge_flow_deoffset_max": 0,
                "sf_edge_flow_anchor_enable": False,
                "sf_edge_flow_anchor_radius": 0,
                # Precise valley lock (narrow)
                "sf_edge_flow_valley_lock_enable": True,
                "sf_edge_flow_valley_width_cols": 2,
                "sf_edge_flow_valley_z_halfwin": 1,
                "sf_edge_flow_debug": True,
            "sf_edge_solidify_enable": True,
            "sf_edge_solidify_strength": 0.65,
            "sf_edge_solidify_passes": 2,
            "sf_edge_solidify_sigma_s": 1.2,
            "sf_edge_solidify_sigma_r": 0.12,
            "sf_edge_solidify_micro_thresh": 0.10,
            "sf_diagonal_smooth_passes": 2,
            "sf_edge_tame_strength": 0.3,
            "sf_edge_tame_k": 0.55,
            "sf_edge_sharp": 0.15,
            "sf_spike_clip_enable": True,
            "sf_spike_clip_quantile": 0.985,
            "sf_spike_clip_amount": 0.8,
            "sf_spike_clip_window": 9,
        },
        "Crisp Petals (Edge-Protect)": {
            "sf_strength": 0.8,
            "sf_m_base": 8.0,
            "sf_m_top": 12.0,
            "sf_n1": 0.55,
            "sf_n2": 1.45,
            "sf_n3": 1.45,
            "sf_edge_solidify_enable": True,
            "sf_edge_solidify_strength": 0.6,
            "sf_edge_solidify_passes": 2,
            "sf_edge_solidify_sigma_s": 1.2,
            "sf_edge_solidify_sigma_r": 0.10,
            "sf_edge_solidify_micro_thresh": 0.08,
            "sf_edge_solidify_protect_grad": 0.16,
            "sf_edge_solidify_preserve_q": 0.94,
            "sf_diagonal_smooth_passes": 2,
            "sf_spike_clip_enable": True,
            "sf_spike_clip_quantile": 0.99,
            "sf_spike_clip_amount": 0.75,
            "sf_spike_clip_window": 9,
            "sf_edge_tame_strength": 0.20,
            "sf_edge_tame_k": 0.55,
            "sf_edge_sharp": 0.18,
        },
        "Crisp Petals (Strong Clip)": {
            "sf_strength": 0.82,
            "sf_m_base": 8.0,
            "sf_m_top": 12.0,
            "sf_n1": 0.55,
            "sf_n2": 1.5,
            "sf_n3": 1.5,
            "sf_edge_solidify_enable": True,
            "sf_edge_solidify_strength": 0.6,
            "sf_edge_solidify_passes": 2,
            "sf_edge_solidify_sigma_s": 1.2,
            "sf_edge_solidify_sigma_r": 0.10,
            "sf_edge_solidify_micro_thresh": 0.08,
            "sf_edge_solidify_protect_grad": 0.18,
            "sf_edge_solidify_preserve_q": 0.95,
            "sf_spike_mad_enable": True,
            "sf_spike_mad_k": 3.1,
            "sf_spike_mad_amount": 0.88,
            "sf_spike_mad_window": 9,
            "sf_spike_mad_z_boost_enable": True,
            "sf_spike_mad_z_start": 0.74,
            "sf_spike_mad_z_power": 1.6,
            "sf_spike_mad_k_drop_frac": 0.4,
            "sf_spike_mad_amount_boost": 0.25,
            "sf_spike_clip_enable": True,
            "sf_spike_clip_quantile": 0.992,
            "sf_spike_clip_amount": 0.7,
            "sf_spike_clip_window": 9,
            "sf_diagonal_smooth_passes": 2,
            "sf_edge_tame_strength": 0.18,
            "sf_edge_tame_k": 0.55,
            "sf_edge_sharp": 0.18,
        },
    },
    "FourierBloom": {"Subtle Detail": {"fb_strength": 0.6}, "Medium Detail": {"fb_strength": 1.0}, "Max Detail": {"fb_strength": 1.6}},
}

PRESET_PATH = Path.home() / ".potfoundry_presets.yaml"

def _yaml_available() -> bool:
    """Check if PyYAML is available for preset loading.
    
    Returns:
        True if yaml module can be imported, False otherwise
    """
    try:
        import yaml  # noqa: F401
        return True
    except Exception:
        return False

def _read_user_presets() -> Dict[str, Any]:
    """Load user-defined presets from YAML file.
    
    Returns:
        Dictionary with 'presets' key containing list of user presets
    """
    if not _yaml_available() or not PRESET_PATH.exists():
        return {"presets": []}
    try:
        import yaml as _yaml
        data = _yaml.safe_load(PRESET_PATH.read_text("utf-8")) or {}
        if not isinstance(data, dict):
            st.error("User presets file is corrupted or invalid. You can reset presets below.")
            if st.button("Reset user presets"):
                PRESET_PATH.unlink(missing_ok=True)
                st.success("User presets have been reset.")
                st.rerun()
            return {"presets": []}
        data.setdefault("presets", [])
        return data
    except Exception:
        st.error("Failed to read user presets. You can reset presets below.")
        if st.button("Reset user presets"):
            PRESET_PATH.unlink(missing_ok=True)
            st.success("User presets have been reset.")
            st.rerun()
        return {"presets": []}

def _write_user_presets(data: Dict[str, Any]) -> bool:
    if not _yaml_available():
        return False
    try:
        import yaml as _yaml
        data = {"presets": list(data.get("presets", []))}
        PRESET_PATH.write_text(_yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
        return True
    except Exception:
        return False

def apply_preset_dict(p: Dict[str, Any]) -> None:
    style = p.get("style")
    if style:
        st.session_state["style"] = style
    size = p.get("size", {})
    for k, v in size.items():
        st.session_state[
            k if k in ("H", "expn") else {
                "top_od": "top_od", "bottom_od": "bottom_od", "wall": "t_wall",
                "bottom": "t_bottom", "drain": "r_drain", "flare_exp": "expn",
            }.get(k, k)
        ] = v
    opts = p.get("opts", {})
    if style:
        for k, v in opts.items():
            st.session_state[widget_key(style, k)] = v

def render_preset_manager(style_name: str, H: float, top_od: float, bottom_od: float,
                          t_wall: float, t_bottom: float, r_drain: float, expn: float) -> None:
    with st.expander("Preset Manager (user presets)"):
        if not _yaml_available():
            st.info("Install PyYAML to enable user presets (pip install pyyaml).")
        pdata = _read_user_presets()
        names = [p.get("name", f"Preset {i+1}") for i, p in enumerate(pdata.get("presets", []))]
        cols = st.columns([2, 1, 1, 1])
        sel = cols[0].selectbox("User presets", options=["<none>"] + names, index=0)
        new_name = cols[1].text_input("New name", value=f"{style_name}_H{int(H)}")
        if cols[2].button("Save new"):
            preset = {
                "name": new_name or f"{style_name}_H{int(H)}",
                "style": style_name,
                "size": {
                    "height": H, "top_od": top_od, "bottom_od": bottom_od,
                    "wall": t_wall, "bottom": t_bottom, "drain": r_drain, "flare_exp": expn,
                },
                "opts": {k: st.session_state.get(widget_key(style_name, k), v["default"])
                         for k, v in _ensure_style_schemas().get(style_name, {}).items()},
            }
            pdata.setdefault("presets", []).append(preset)
            if _write_user_presets(pdata):
                st.success("Preset saved.")
            else:
                st.error("Failed to save preset.")
        if cols[3].button("Delete") and sel != "<none>":
            idx = names.index(sel)
            del pdata["presets"][idx]
            if _write_user_presets(pdata):
                st.success("Preset deleted.")
            else:
                st.error("Failed to update presets file.")
        if sel != "<none>" and st.button("Apply selected"):
            idx = names.index(sel)
            apply_preset_dict(pdata["presets"][idx])
            st.success("Applied preset.")
            st.rerun()
