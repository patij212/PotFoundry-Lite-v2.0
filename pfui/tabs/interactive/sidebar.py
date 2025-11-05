"""Sidebar section for Interactive Designer tab.

This module contains all sidebar input controls including model name,
style selector, dimensions, profile, style options, twist/spin, and presets.
"""

from __future__ import annotations

import time
from typing import Any, Optional, cast

import streamlit as st

from pfui.app_components.sidebar import render_dimensions, render_profile_controls
from pfui.app_components.utils import resolve_schema_key
from pfui.controls import style_controls, twist_controls
from pfui.imports import STYLES
from pfui.presets import PRESETS, _read_user_presets, _write_user_presets, apply_preset_dict
import pfui.schemas as SC
from pfui.state import reset_all_defaults, reset_style_defaults, widget_key
from pfui.units import units_selector


def render_sidebar_section(on_change_callback: Optional[callable] = None) -> None:
    """Render the complete sidebar section with all input controls.
    
    Args:
        on_change_callback: Optional callback to trigger when inputs change
    """
    # Get style schemas
    styles = SC.get_style_schemas()
    
    # Narrow the runtime-typed session state to a mapping for type-checker
    ss = cast(dict[str, Any], st.session_state)
    
    # Units at a fixed, stable location
    units_selector()

    st.header("Model")
    
    # Timestamp used to implement debounced preview updates
    if "_last_change_ts" not in ss:
        ss["_last_change_ts"] = 0.0

    def _mark_changed() -> None:
        try:
            ss["_last_change_ts"] = time.time()
            # Only mark preview as stale if we're in manual or debounced
            # modes. In auto mode previews update immediately so we
            # shouldn't mark them stale.
            mode = cast(str, ss.get("preview_mode", "manual"))
            if mode in ("manual", "debounced"):
                ss["_preview_stale"] = True
            else:
                ss["_preview_stale"] = False
        except Exception:
            pass
        
        # Call the external callback if provided
        if on_change_callback is not None:
            try:
                on_change_callback()
            except Exception:
                pass

    def _on_model_name_change() -> None:
        # If user edits model name manually, mark it and disable auto-name
        # so we don't overwrite the user's change.
        ss["_model_name_user_edited"] = True
        ss["_model_name_auto"] = False

    # Ensure user-edited flag exists (default False)
    if "_model_name_user_edited" not in ss:
        ss["_model_name_user_edited"] = False
    # Ensure an explicit auto-name checkbox state exists. Default to True
    # (auto name enabled) unless the user has edited the name previously.
    if "_model_name_auto" not in ss:
        ss["_model_name_auto"] = not ss["_model_name_user_edited"]
    # Compute an auto name (mirrors Snapshot default) from the last-known
    # style/H in session state so we can present the same auto-updating
    # behaviour without moving the widget in the sidebar.
    # If the session doesn't yet have a chosen style (first load), use
    # the first style from STYLES as the default so the auto-name matches
    # what the selectbox will show once rendered.
    all_styles = sorted(STYLES.keys()) if isinstance(STYLES, dict) else []
    # If no style is set in the session (first run), initialize it so the
    # selectbox and our auto-name use the same initial value.
    if "style" not in ss and all_styles:
        ss["style"] = all_styles[0]
    style_guess = cast(
        Optional[str], ss.get("style", all_styles[0] if all_styles else None)
    )

    def _unwrap_scalar(v: Any) -> Any:
        """If v is a list/tuple, return its first element; otherwise return v.

        Annotated to help static analysis (Pylance) reason about downstream
        conversions.
        """
        if isinstance(v, (list, tuple)):
            try:
                return v[0]
            except Exception:
                return v
        return v

    def _to_int_scalar(x: Any) -> int:
        """Coerce x to an int in a defensive, editor-friendly way.

        - Unwrap list/tuple-like containers.
        - If the resulting value is a primitive known to be convertible to
          float (int/float/str/bytes), call float(x) safely and cast to int.
        - Otherwise, attempt best-effort conversions with exception guards.
        """
        try:
            xv = _unwrap_scalar(x)
            if isinstance(xv, (int, float)):
                return int(xv)
            if isinstance(xv, (str, bytes)):
                try:
                    return int(float(xv))
                except Exception:
                    return int(0)
            # Last-resort: attempt float coercion then int
            try:
                return int(float(xv))
            except Exception:
                return 0
        except Exception:
            try:
                return int(x)  # best-effort fallback
            except Exception:
                return 0

    def _to_float_scalar(x: Any) -> float:
        """Coerce x to a float in a defensive, editor-friendly way.

        - Unwrap list/tuple-like containers.
        - If x is already int/float/str/bytes, call float(x).
        - Otherwise, attempt a best-effort conversion and fall back to 0.0 on error.
        """
        try:
            v = _unwrap_scalar(x)
            if isinstance(v, (int, float)):
                return float(v)
            if isinstance(v, (str, bytes)):
                try:
                    return float(v)
                except Exception:
                    return 0.0
            # Last-resort numeric coercion
            try:
                return float(v)
            except Exception:
                return 0.0
        except Exception:
            try:
                return float(x)
            except Exception:
                return 0.0

    # Build auto-name from style + height (if available). If H doesn't
    # exist or is a wacky type, we gracefully degrade to a simple guess.
    # We attempt unwrapping lists/tuples and converting to an int in the name.
    H_val_raw = ss.get("H", 100)  # default to 100 if not set
    try:
        H_val = _to_int_scalar(H_val_raw)
    except Exception:
        H_val = 100
    # If model_name doesn't exist yet, or if auto-name is enabled, we can
    # safely set or update the auto-generated name.
    computed_auto_name = f"{style_guess or 'pot'}_{H_val}mm" if style_guess else "pot_100mm"
    # If auto-naming is enabled, or if the model name is missing, initialize it
    if "_model_name_auto" not in ss:
        ss["_model_name_auto"] = True
    if ("model_name" not in ss) or (ss.get("_model_name_auto", False) is True):
        ss["model_name"] = computed_auto_name

    col1, col2 = st.columns([3, 1])
    with col1:
        st.text_input(
            "Model Name",
            key=widget_key("model_name"),
            on_change=_on_model_name_change,
            help="A descriptive name for your pot model. Used in exports and library.",
        )
    with col2:
        # Small checkbox to re-enable or disable auto-naming
        auto_checked = st.checkbox(
            "Auto",
            value=ss.get("_model_name_auto", True),
            help="Automatically generate model name from style and height",
        )
        # Update auto-name flag in session state
        ss["_model_name_auto"] = auto_checked
        # If user just checked auto-name, reset user-edited flag
        # so future auto-updates take effect
        if auto_checked:
            ss["_model_name_user_edited"] = False
            # Also update the name right now
            ss["model_name"] = computed_auto_name

    # Style selector
    st.selectbox(
        "Style",
        options=all_styles,
        key=widget_key("style"),
        on_change=_mark_changed,
        help="Choose the decorative style for your pot.",
    )
    current_style = cast(str, ss.get("style", ""))
    schema_key = resolve_schema_key(current_style, styles)
    style_schema = styles.get(schema_key, {}) if schema_key else {}

    # --- Dimensions Section (extracted) ---
    with st.expander("Dimensions", expanded=True):
        render_dimensions(on_change=_mark_changed)

    # Compute which twist/spin controls are relevant for this style
    has_spin = style_schema.get("has_spin_controls", False)
    has_twist = style_schema.get("has_twist_controls", False)
    show_twist_spin = has_spin or has_twist
    # If the style supports both, show them in the same expander.
    # Otherwise, show twist (common default) if has_twist is True.
    if show_twist_spin:
        with st.expander("Twist / Spin"):
            twist_controls(on_change=_mark_changed, has_spin=has_spin, has_twist=has_twist)

    # --- Profile Section (extracted) ---
    with st.expander("Profile"):
        render_profile_controls(on_change=_mark_changed)

    # --- Mesh Quality Section (moved into Preview & Export) ---
    # Previously here, now integrated into Preview & Export expander

    # --- Style Options Section (options only) ---
    with st.expander("Style Options"):
        # Render style-specific controls using the extracted style_controls
        style_controls(current_style, on_change=_mark_changed)

    # --- Presets Section ---
    with st.expander("Presets"):
        st.markdown("#### Built-in Presets")
        # List built-in presets from PRESETS
        preset_names = sorted(PRESETS.keys()) if isinstance(PRESETS, dict) else []
        if preset_names:
            chosen_preset = st.selectbox(
                "Select a preset",
                options=[""] + preset_names,
                help="Choose a built-in preset to quickly configure your pot",
            )
            if chosen_preset and st.button("Apply Preset"):
                try:
                    preset_dict = PRESETS.get(chosen_preset, {})
                    apply_preset_dict(preset_dict)
                    st.success(f"Applied preset: {chosen_preset}")
                    _mark_changed()
                    st.rerun()
                except Exception as e:
                    st.error(f"Error applying preset: {e}")
        else:
            st.info("No built-in presets available.")

        st.markdown("---")
        st.markdown("#### User Presets")
        # Load user presets
        user_presets_list = _read_user_presets()
        user_preset_names = [p.get("name", "") for p in user_presets_list if p.get("name")]

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
                    # Build preset dict from current session state
                    preset_data = {
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
                    schema_k = resolve_schema_key(style_val, styles)
                    if schema_k:
                        sch = styles.get(schema_k, {})
                        opts_schema = sch.get("options", {})
                        if opts_schema:
                            for opt_key in opts_schema.keys():
                                if opt_key in ss:
                                    preset_data[opt_key] = ss[opt_key]
                    # Add twist/spin if present
                    if "twist_deg_per_mm" in ss:
                        preset_data["twist_deg_per_mm"] = ss["twist_deg_per_mm"]
                    if "spin_deg" in ss:
                        preset_data["spin_deg"] = ss["spin_deg"]

                    # Save to user presets
                    user_presets_list.append(preset_data)
                    _write_user_presets(user_presets_list)
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
                        preset_data = next(
                            (p for p in user_presets_list if p.get("name") == chosen_user_preset),
                            None
                        )
                        if preset_data:
                            apply_preset_dict(preset_data)
                            st.success(f"Applied user preset: {chosen_user_preset}")
                            _mark_changed()
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
                            if p.get("name") != chosen_user_preset
                        ]
                        _write_user_presets(user_presets_list)
                        st.success(f"Deleted preset: {chosen_user_preset}")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error deleting preset: {e}")
        else:
            st.info("No user presets saved yet.")

    # --- Reset Buttons ---
    st.markdown("---")
    col_reset1, col_reset2 = st.columns(2)
    with col_reset1:
        if st.button("Reset Style Defaults", help="Reset style-specific parameters to defaults"):
            reset_style_defaults()
            st.success("Reset style defaults")
            _mark_changed()
            st.rerun()
    with col_reset2:
        if st.button("Reset All", help="Reset all parameters to defaults"):
            reset_all_defaults()
            st.success("Reset all parameters")
            _mark_changed()
            st.rerun()
