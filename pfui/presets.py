# pfui/presets.py
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List
import streamlit as st

from .schemas import STYLE_SCHEMAS       # << import from schemas

def widget_key(style: str, field: str) -> str:
    return f"opt__{style}_{field}"


# Built-in curated presets (unchanged)
PRESETS: Dict[str, Dict[str, Dict[str, Any]]] = {
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
        "Gentle Flower": {"sf_m_base": 6.0,  "sf_m_top": 10.0, "sf_n1": 0.35, "sf_n2": 0.8, "sf_n3": 0.8},
        "Sharp Petals":  {"sf_m_base": 8.0,  "sf_m_top": 12.0, "sf_n1": 0.6,  "sf_n2": 1.6, "sf_n3": 1.6},
        "Wide Petals":   {"sf_m_base": 5.0,  "sf_m_top": 8.0,  "sf_n1": 0.25, "sf_n2": 0.6, "sf_n3": 0.6},
    },
    "FourierBloom": {"Subtle Detail": {"fb_strength": 0.6}, "Medium Detail": {"fb_strength": 1.0}, "Max Detail": {"fb_strength": 1.6}},
}

PRESET_PATH = Path.home() / ".potfoundry_presets.yaml"

def _yaml_available() -> bool:
    try:
        import yaml  # noqa: F401
        return True
    except Exception:
        return False

def _read_user_presets() -> Dict[str, Any]:
    if not _yaml_available() or not PRESET_PATH.exists():
        return {"presets": []}
    try:
        import yaml as _yaml
        data = _yaml.safe_load(PRESET_PATH.read_text("utf-8")) or {}
        if not isinstance(data, dict):
            return {"presets": []}
        data.setdefault("presets", [])
        return data
    except Exception:
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
                         for k, v in STYLE_SCHEMAS.get(style_name, {}).items()},
            }
            pdata.setdefault("presets", []).append(preset)
            st.success("Preset saved.") if _write_user_presets(pdata) else st.error("Failed to save preset.")
        if cols[3].button("Delete") and sel != "<none>":
            idx = names.index(sel)
            del pdata["presets"][idx]
            st.success("Preset deleted.") if _write_user_presets(pdata) else st.error("Failed to update presets file.")
        if sel != "<none>" and st.button("Apply selected"):
            idx = names.index(sel)
            apply_preset_dict(pdata["presets"][idx])
            st.success("Applied preset.")
            st.rerun()
