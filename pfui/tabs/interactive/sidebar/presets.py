"""Preset management controls."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pfui.schemas as SC
from pfui._st import get_effective_st as get_st
from pfui.app_components.utils import resolve_schema_key
from pfui.presets import (
    PRESETS,
    _read_user_presets,
    _write_user_presets,
    apply_preset_dict,
)


def render_presets(ss: dict[str, Any], on_change: Callable[[], None]) -> None:
    """Render preset management section.
    
    Args:
        ss: Session state dictionary
        on_change: Callback to trigger when presets are applied

    """
    st = get_st()
    with st.expander("Presets"):
        st.markdown("#### Built-in Presets")
        style_names = sorted(PRESETS.keys()) if isinstance(PRESETS, dict) else []
        if not style_names:
            st.info("No built-in presets available.")
        else:
            col_style, col_preset = st.columns([1, 1])
            chosen_style = col_style.selectbox(
                "Preset style",
                options=[""] + style_names,
                help="Choose a style to view its curated presets",
                key="_builtin_preset_style_select",
            )
            chosen_preset = ""
            preset_options: list[str] = []
            if chosen_style:
                preset_options = sorted(PRESETS.get(chosen_style, {}).keys())
                chosen_preset = col_preset.selectbox(
                    "Preset variant",
                    options=[""] + preset_options,
                    help="Choose a curated preset variant",
                    key="_builtin_preset_variant_select",
                )
            apply_disabled = not (chosen_style and chosen_preset)
            if st.button(
                "Apply Built-in Preset",
                disabled=apply_disabled,
                help="Apply the selected style + preset values",
                key="_apply_builtin_preset_btn",
            ) and not apply_disabled:
                try:
                    opts = PRESETS[chosen_style][chosen_preset]
                    apply_preset_dict({"style": chosen_style, "size": {}, "opts": opts})
                    st.success(f"Applied preset: {chosen_style} / {chosen_preset}")
                    on_change()
                    st.rerun()
                except Exception as e:
                    st.error(f"Error applying preset: {e}")

        st.markdown("---")
        st.markdown("#### User Presets")
        # Load user presets (schema: {"presets": [ ... ]})
        user_presets_data = _read_user_presets()
        user_presets_list = list(user_presets_data.get("presets", [])) if isinstance(user_presets_data, dict) else []
        user_preset_names = [p.get("name", "") for p in user_presets_list if isinstance(p, dict) and p.get("name")]

        # Save current design as a user preset
        st.text_input(
            "Preset name",
            key="_new_preset_name",
            help="Enter a name for your custom preset",
        )
        if st.button("Save Current Design"):
            preset_name = ss.get("_new_preset_name", "").strip()
            if not preset_name:
                st.error("Please enter a preset name")
            else:
                # Collect current parameters from session state
                # Use same logic as snapshots to extract the design
                try:
                    # Get style schemas
                    styles = SC.get_style_schemas()

                    # Build preset dict from current session state
                    new_preset_data = {
                        "name": preset_name,
                        "style": ss.get("style", ""),
                        "H": ss.get("H", 100),
                        "Rt": ss.get("Rt", 50),
                        "Rb": ss.get("Rb", 40),
                        "t_wall": ss.get("t_wall", 2),
                        "t_bottom": ss.get("t_bottom", 2),
                        "r_drain": ss.get("r_drain", 2),
                        "expn": ss.get("expn", 0.5),
                        "profile_bell": ss.get("profile_bell", False),
                        "profile_bell_amp": ss.get("profile_bell_amp", 0.0),
                        "profile_sigmoid": ss.get("profile_sigmoid", False),
                        "profile_sig_mid": ss.get("profile_sig_mid", 0.5),
                        "profile_sig_steep": ss.get("profile_sig_steep", 5.0),
                    }
                    # Add style-specific options if present
                    style_val = ss.get("style", "")
                    schema_k = resolve_schema_key(style_val)
                    if schema_k:
                        sch = styles.get(schema_k, {})
                        opts_schema = sch.get("options", {})
                        if opts_schema:
                            for opt_key in opts_schema.keys():
                                if opt_key in ss:
                                    new_preset_data[opt_key] = ss[opt_key]
                    # Add twist/spin if present
                    if "twist_deg_per_mm" in ss:
                        new_preset_data["twist_deg_per_mm"] = ss["twist_deg_per_mm"]
                    if "spin_deg" in ss:
                        new_preset_data["spin_deg"] = ss["spin_deg"]

                    # Save to user presets
                    user_presets_list.append(new_preset_data)
                    user_presets_data = {"presets": user_presets_list}
                    _write_user_presets(user_presets_data)
                    st.success(f"Saved preset: {preset_name}")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error saving preset: {e}")

        # Load and apply user presets
        if user_preset_names:
            chosen_user_preset = st.selectbox(
                "Load user preset",
                options=[""] + user_preset_names,
                help="Choose one of your saved presets",
            )
            col_a, col_b = st.columns(2)
            with col_a:
                if chosen_user_preset and st.button("Apply User Preset"):
                    try:
                        # Find the preset data
                        preset_data: dict[str, Any] | None = next(
                            (p for p in user_presets_list if p.get("name") == chosen_user_preset),
                            None,
                        )
                        if preset_data:
                            # Convert legacy flat user preset shape to structured form
                            # Identify style-specific option keys via schema if not already split.
                            style_val = preset_data.get("style", "")
                            # Separate size-like keys
                            size_keys = {"H","height","top_od","bottom_od","t_wall","wall","t_bottom","bottom","r_drain","drain","expn","flare_exp"}
                            size_block = {k: v for k, v in preset_data.items() if k in size_keys}
                            # Remaining options
                            opts_block = {
                                k: v for k, v in preset_data.items() if k not in size_keys and k not in {"name","style"}
                            }
                            structured = {"style": style_val, "size": size_block, "opts": opts_block}
                            apply_preset_dict(structured)
                            st.success(f"Applied user preset: {chosen_user_preset}")
                            on_change()
                            st.rerun()
                        else:
                            st.error("Preset not found")
                    except Exception as e:
                        st.error(f"Error applying preset: {e}")
            with col_b:
                if chosen_user_preset and st.button("Delete Preset"):
                    try:
                        # Remove the preset
                        user_presets_list = [
                            p for p in user_presets_list
                            if isinstance(p, dict) and p.get("name") != chosen_user_preset
                        ]
                        user_presets_data = {"presets": user_presets_list}
                        _write_user_presets(user_presets_data)
                        st.success(f"Deleted preset: {chosen_user_preset}")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error deleting preset: {e}")
        else:
            st.info("No user presets saved yet.")
