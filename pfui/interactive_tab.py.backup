"""Interactive Designer tab - main UI for PotFoundry.

This module contains the complete Interactive Designer tab logic,
extracted from app.py to improve modularity and maintainability.
"""

from __future__ import annotations

import json
import re
import tempfile
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional, Union, cast

import streamlit as st

# Import all dependencies needed by the interactive tab
from pfui.app_components import (
    render_appearance_settings,
    render_export_widgets,
    render_preview_controls,
    render_snapshots,
)
from pfui.app_components.plotting import should_update_preview as plotting_should_update
from pfui.app_components.sidebar import render_dimensions, render_profile_controls
from pfui.app_components.utils import resolve_schema_key
from pfui.controls import style_controls, twist_controls
from pfui.health import _design_health, _health_badge
import pfui.schemas as SC
from pfui.imports import STYLES, WRITE_STL_BINARY, build_pot_mesh
from pfui.presets import (
    PRESETS,
    _read_user_presets,
    _write_user_presets,
    apply_preset_dict,
)
from pfui.preview import (
    make_preview_arrays,
    render_preview_png_cached,
    render_profile,
)
from pfui.state import (
    queue_update,
    reset_all_defaults,
    reset_style_defaults,
    widget_key,
)
from pfui.tabs.interactive import (
    render_export_section,
    render_metrics_section,
    render_performance_section,
    render_profile_section,
)
from pfui.units import units_selector
from potfoundry.types import StyleOpts

# Typing aliases for array-like objects
_ArrayLike = Any

# Check if Plotly is available for interactive previews
try:
    import plotly.graph_objects as go
    HAS_PLOTLY = True
except Exception:
    HAS_PLOTLY = False
    go = cast(Any, None)

# Get style schemas at module level
styles = SC.get_style_schemas()


def render_interactive_tab(
    _has_library: bool = False,
    _library_read_only: bool = False,
) -> None:
    """Render the complete Interactive Designer tab.
    
    This is the main UI for designing and previewing pots interactively.
    
    Args:
        _has_library: Whether library is configured
        _library_read_only: Whether library is in read-only mode
    """
    # ------------------ SIDEBAR (all inputs) ------------------
    with st.sidebar:
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
                return 0.0

        H_guess = _to_int_scalar(ss.get("H", 120.0))
        try:
            auto_name_guess = (
                f"{style_guess}_H{int(H_guess)}"
                if style_guess
                else "SpiralRidges_Design"
            )
        except Exception:
            auto_name_guess = cast(Any, ss.get("model_name", "SpiralRidges_Design"))

        # If auto-name checkbox is enabled, make sure the session reflects
        # the automatic name before creating the widget so the input shows it.
        if cast(Any, ss.get("_model_name_auto", True)):
            ss["model_name"] = auto_name_guess
            ss["_model_name_user_edited"] = False

        # Model name input (placed near the top of the sidebar)
        name = st.text_input(
            "Model name",
            value=cast(Any, ss.get("model_name", "SpiralRidges_Design")),
            key="model_name",
            on_change=_on_model_name_change,
        )

        # Small checkbox to let the user toggle automatic naming back on.
        # Its value is stored in `_model_name_auto` and is respected at the
        # start of the run (above) so checking it will immediately restore
        # the auto-generated name.
        auto_label = "Auto-name (follow style/H)"
        st.checkbox(
            auto_label,
            value=cast(Any, ss.get("_model_name_auto", True)),
            key="_model_name_auto",
        )
        prev_style = cast(Optional[str], ss.get("_prev_style", None))
        style_options = sorted(STYLES.keys())
        style_name = st.selectbox("Style family", options=style_options, key="style")
        style_key = resolve_schema_key(style_name)
        # Jeśli styl nie istnieje w STYLE_SCHEMAS, pokaż ostrzeżenie i wybierz domyślny
        if style_key not in styles:
            st.warning(
                f"Style '{style_name}' is not available. Falling back to default style."
            )
            style_name = style_options[0]
            style_key = resolve_schema_key(style_name)
            ss["style"] = style_name
            reset_style_defaults(style_name)
            st.rerun()
        # Automatycznie resetuj kontrolki stylu po zmianie stylu
        if prev_style != style_name:
            ss["_prev_style"] = style_name
            # NIE resetuj stylu i NIE wywołuj st.rerun()
            # reset_style_defaults(style_name)
            # st.rerun()

        # Style caption (if available)
        try:
            st.caption(STYLES[style_name][1])
        except Exception:
            pass

        place_on_ground = st.checkbox(
            "Place model on ground (Z=0)",
            value=True,
            help="Preview-only option that shifts the pot so the lowest vertex sits at Z=0. The exported STL keeps its original origin.",
        )

        st.divider()
        # --- Dimensions Section (extracted) ---
        _dims = render_dimensions(mark_changed=_mark_changed, style_key=style_key)
        H = float(_dims.get("H", 120.0))
        top_od = float(_dims.get("top_od", 140.0))
        bottom_od = float(_dims.get("bottom_od", 90.0))
        t_wall = float(_dims.get("t_wall", 3.0))
        t_bottom = float(_dims.get("t_bottom", 3.0))
        r_drain = float(_dims.get("r_drain", 10.0))
        Rt = float(_dims.get("Rt", 0.5 * top_od))
        Rb = float(_dims.get("Rb", 0.5 * bottom_od))
        _dim_issues = _dims.get("_dim_issues", [])

        # (model_name auto-default logic handled earlier)

        # --- Profile Section (extracted) ---
        _profile = render_profile_controls(
            mark_changed=_mark_changed, style_key=style_key
        )
        expn = float(_profile.get("expn", _to_float_scalar(ss.get("expn", 1.1))))
        flare_center = float(
            _profile.get(
                "flare_center",
                _to_float_scalar(ss.get(widget_key(style_key, "flare_center"), 0.5)),
            )
        )
        flare_sharp = float(
            _profile.get(
                "flare_sharp",
                _to_float_scalar(ss.get(widget_key(style_key, "flare_sharp"), 6.0)),
            )
        )
        bell_amp = float(
            _profile.get(
                "bell_amp",
                _to_float_scalar(ss.get(widget_key(style_key, "bell_amp"), 0.0)),
            )
        )
        bell_center = float(
            _profile.get(
                "bell_center",
                _to_float_scalar(ss.get(widget_key(style_key, "bell_center"), 0.5)),
            )
        )
        bell_width = float(
            _profile.get(
                "bell_width",
                _to_float_scalar(ss.get(widget_key(style_key, "bell_width"), 0.22)),
            )
        )

        # --- Mesh Quality Section (moved into Preview & Export) ---
        # n_theta and n_z will be configured in the Preview & Export section below

        # (Removed duplicate Appearance & Preview Settings block here — consolidated later in the file)

        # --- Style Options Section (options only) ---
        with st.expander("Style Options", expanded=False):
            ui_opts = style_controls(style_key)
            # Ensure SuperformulaBlossom responds to UI changes by enabling its strength from UI
            if style_name == "SuperformulaBlossom":
                ui_opts.setdefault("sf_strength", 1.0)
            ui_opts.update(
                {
                    "flare_center": flare_center,
                    "flare_sharp": flare_sharp,
                    "bell_amp": bell_amp,
                    "bell_center": bell_center,
                    "bell_width": bell_width,
                }
            )

        # Twist / Spin (restored outside Style Options)
        with st.expander("Twist / Spin", expanded=False):
            ui_opts.update(twist_controls(style_key))

        # Presets (restored outside Style Options)
        with st.expander("Presets", expanded=False):
            pdefs = PRESETS.get(style_name, {})
            if pdefs:
                cols = st.columns(max(3, min(6, len(pdefs))))
                for i, p in enumerate(pdefs.keys()):
                    if cols[i % len(cols)].button(p, key=f"preset_{style_name}_{p}"):
                        pending = {
                            widget_key(style_key, k): v for k, v in pdefs[p].items()
                        }
                        queue_update(pending)
                        st.rerun()
                st.caption("Built-in presets apply style option values.")

            with st.expander("User presets (save/load)"):
                pdata = _read_user_presets()
                names = [
                    p.get("name", f"Preset {i + 1}")
                    for i, p in enumerate(pdata.get("presets", []))
                ]
                cols = st.columns([2, 1, 1, 1])
                sel = cols[0].selectbox(
                    "User presets", options=["<none>"] + names, index=0
                )
                new_name = cols[1].text_input(
                    "New name", value=f"{style_name}_H{int(H)}"
                )

                if cols[2].button("Save new"):
                    preset = {
                        "name": new_name or f"{style_name}_H{int(H)}",
                        "style": style_name,
                        "size": {
                            "height": H,
                            "top_od": top_od,
                            "bottom_od": bottom_od,
                            "wall": t_wall,
                            "bottom": t_bottom,
                            "drain": r_drain,
                            "flare_exp": expn,
                        },
                        "opts": {
                            k: cast(Any, ss.get(widget_key(style_key, k), v["default"]))
                            for k, v in styles.get(style_key, {}).items()
                        },
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
                        st.error("Failed to update presets.")

                if sel != "<none>" and st.button("Apply selected"):
                    idx = names.index(sel)
                    apply_preset_dict(pdata["presets"][idx])
                    st.success("Applied preset.")
                    st.rerun()

        # Reset buttons (restored top-level)
        cL, cR = st.columns(2)
        if cL.button("Reset style to defaults"):
            reset_style_defaults(style_name)
            st.rerun()
        if cR.button("Reset ALL controls"):
            reset_all_defaults(style_name)
            st.rerun()

    # --------------- PREVIEW & EXPORT CONTROLS ---------------
    with st.expander("Preview & Export", expanded=True):
        # Render consolidated preview controls via modular component
        _controls = render_preview_controls(
            mark_changed=_mark_changed, has_plotly=HAS_PLOTLY
        )
        # Unpack for downstream logic (keep names stable)
        preview_detail = float(_controls["preview_detail"])
        preview_mode = cast(str, _controls["preview_mode"])
        fig_w = float(_controls["fig_w"])
        fig_h = float(_controls["fig_h"])
        dpi = int(_controls["dpi"])
        view_elev = float(_controls["view_elev"])
        view_azim = float(_controls["view_azim"])
        show_inner = bool(_controls["show_inner"])
        n_theta = int(_controls["n_theta"])
        n_z = int(_controls["n_z"])
        up = int(_controls["quality_up"])
        interactive_3d = bool(_controls["interactive_3d"])
        interactive_mesh = bool(_controls["interactive_mesh"])
        preset_name = cast(str, _controls["preset_name"])

        # Backwards compatible flag
        auto_preview = preview_mode == "auto"

        # Create a row for export actions aligned similarly to controls
        _cE1, cE2, cE3 = st.columns([1.2, 1.2, 2.6])
        # Ensure typed session mapping in this scope
        ss = cast(dict[str, Any], st.session_state)
        # Render export & download widgets (preserves previous behavior)
        do_export = render_export_widgets(
            col_actions=cE2,
            col_status=cE3,
            model_name=name,
            fig_h_inches=fig_h,
            has_plotly=HAS_PLOTLY,
        )
        # Defensive conversion helpers remain available for downstream export dims
        try:
            a = _unwrap_scalar(n_theta)
            b = _unwrap_scalar(up)
            try:
                prod = float(a) * float(b)
            except Exception:
                try:
                    prod = a * b
                except Exception:
                    prod = a
            n_theta_export = _to_int_scalar(prod)
        except Exception:
            n_theta_export = _to_int_scalar(n_theta * up)  # fallback, best-effort
        try:
            a = _unwrap_scalar(n_z)
            b = _unwrap_scalar(up)
            try:
                prod = float(a) * float(b)
            except Exception:
                try:
                    prod = a * b
                except Exception:
                    prod = a
            n_z_export = _to_int_scalar(prod)
        except Exception:
            n_z_export = _to_int_scalar(n_z * up)  # fallback, best-effort

    # ---------------- HEALTH & WARNINGS ----------------
    st.subheader("Design checks")

    badges = _design_health(H, Rt, Rb, t_wall, t_bottom, r_drain)
    cols = st.columns(min(3, max(1, len(badges))))
    for c, b in zip(cols, badges):
        _health_badge(c, b.label, b.status, b.tip)

    # -------------------- PREVIEW ----------------------
    st.subheader("Preview")
    ss = cast(dict[str, Any], st.session_state)

    # Preview update decision: respect preview_mode (auto/manual/debounced)
    should_update_preview = False
    if preview_mode == "auto":
        should_update_preview = True
    else:
        # Render manual update controls (button + caption). The debounced
        # mode will attempt a client-side auto-click, but we also implement a
        # server-side fallback below in case the JS doesn't run in the client.
        col1, col2 = st.columns([3, 1])
        with col1:
            update_clicked = st.button("🔄 Update Preview", type="primary")
            if update_clicked:
                should_update_preview = True
                # Clear cache to force regeneration
                try:
                    st.cache_data.clear()
                except Exception:
                    pass

            if preview_mode == "debounced":
                # Inject a more robust debounce helper that schedules a click
                # on the Update button when inputs stop changing.
                timeout_ms = int(
                    _to_float_scalar(ss.get("debounce_timeout", 0.8)) * 1000
                )
                js = """
<script>
(function(){
  if (window._pf_debounce_installed) return;
  window._pf_debounce_installed = true;
  var timeout = %d;
  var timer = null;
  function findButton(){
    var byText = Array.from(document.querySelectorAll('button')).find(function(b){
      return b.innerText && b.innerText.trim().startsWith('🔄 Update Preview');
    });
    if(byText) return byText;
    var byAttr = Array.from(document.querySelectorAll('button')).find(function(b){
      return (b.getAttribute('data-testid') && b.getAttribute('data-testid').toLowerCase().includes('button')) || (b.className && b.className.toLowerCase().includes('stButton'));
    });
    return byAttr || null;
  }
  function scheduleClick(){
    if(timer) clearTimeout(timer);
    timer = setTimeout(function(){
      var btn = findButton()
      if(btn){ try{ btn.click()
      } catch(e){} }
    }, timeout);
  }
  var observer = new MutationObserver(function(){ scheduleClick()
  })
  observer.observe(document.body, {childList:true, subtree:true, attributes:true});
  ['input','change','mouseup','keyup','pointerup'].forEach(function(ev){ document.addEventListener(ev, scheduleClick, true)
  })
  var finder = setInterval(function(){ if(findButton()) { clearInterval(finder)
  } }, 250)
})();
</script>
""" % (timeout_ms,)
                try:
                    import streamlit.components.v1 as components

                    components.html(js, height=0)
                except Exception:
                    pass
        with col2:
            st.caption("Manual mode" if preview_mode == "manual" else "Debounced mode")
            # Quick utility: allow clearing preview caches if rendering gets stuck
            if st.button("Reset preview cache", key="btn_reset_preview_cache"):
                try:
                    st.cache_data.clear()
                except Exception:
                    pass
                # Clear session-cached arrays and figures
                for k in (
                    "_last_X",
                    "_last_Y",
                    "_last_Z",
                    "_last_mesh_V",
                    "_last_mesh_F",
                    "_last_mesh_fig_json",
                    "_last_surface_fig_json",
                    "_last_mesh_png",
                    "_last_surface_png",
                ):
                    try:
                        if k in ss:
                            del ss[k]
                    except Exception:
                        pass
                ss["_preview_stale"] = True
                st.rerun()

        # Server-side fallback for debounced/manual modes: use centralized helper
        try:
            last_ts = cast(Any, ss.get("_last_change_ts", None))
            debounce_timeout_seconds = _to_float_scalar(ss.get("debounce_timeout", 0.8))
            if not should_update_preview:
                try:
                    if plotting_should_update(
                        preview_mode,
                        last_change_ts=last_ts,
                        debounce_timeout_s=debounce_timeout_seconds,
                        stale=bool(cast(Any, ss.get("_preview_stale", False))),
                    ):
                        should_update_preview = True
                except Exception:
                    # best-effort; ignore failures
                    pass
        except Exception:
            # best-effort; ignore failures
            pass

    # Style function can handle scalar or vector theta; cast for type-checker
    # Accept scalar float or any array-like for theta input/return to satisfy Pylance without optional numpy typing
    ROuterFn = Callable[
        [Union[float, _ArrayLike], float, float, float, dict], Union[float, _ArrayLike]
    ]
    # Raw style function (may accept scalar or vector theta, and may return scalar or array-like)
    _r_outer_raw = cast(
        ROuterFn, STYLES[style_name][0]
    )  # geometry comes from UI style name

    # Use the centralized adapter (imported from pfui.geometry_bridge) so callers
    # across the codebase get consistent behavior. This also avoids duplicating
    # the adapter logic in multiple places.
    from pfui.geometry_bridge import adapt_r_outer_fn

    r_outer_fn = adapt_r_outer_fn(_r_outer_raw)
    opts: StyleOpts | dict[str, Any] = dict(ui_opts)
    opts_json = json.dumps(opts, sort_keys=True)

    # Apply interactive preview scaling to keep Full Preview responsive
    # Narrow typing: preview_res_scale is expected to be a float; use a direct cast
    preview_scale = _to_float_scalar(ss.get("preview_res_scale", 1.0))
    target_n_theta = max(16, int(n_theta * preview_detail * preview_scale))
    target_n_z = max(8, int(n_z * preview_detail * preview_scale))
    preview_n_theta = max(16, min(168, target_n_theta))
    preview_n_z = max(8, min(168, target_n_z))
    full_n_theta = max(16, min(1024, target_n_theta))
    full_n_z = max(8, min(1024, target_n_z))

    # Initialize preview cache & stale flag so manual mode can keep showing
    # the last generated preview until the user explicitly updates it.
    # Keep separate caches for surface (fast) and mesh (exact) previews
    ss.setdefault("_last_surface_png", None)
    ss.setdefault("_last_surface_fig_json", None)
    ss.setdefault("_last_mesh_png", None)
    ss.setdefault("_last_mesh_fig_json", None)
    ss.setdefault("_preview_stale", False)

    # Early placeholders so we can render the cached preview when needed.
    preview_placeholder = st.empty()
    mesh_placeholder = st.empty()

    # Predeclare values so type checker knows they exist regardless of branches
    X: Optional[Any] = None
    Y: Optional[Any] = None
    Z: Optional[Any] = None
    mesh_data: Optional[tuple[Any, Any]] = None

    # Only generate preview when allowed (auto mode or Update clicked).
    # In manual mode we must NOT recalculate or render previews automatically.
    preview_exists = False

    # Build signatures to classify changes (geometry vs appearance)
    # Predeclare signature variables with Optional types so assigning None in
    # exception paths doesn't conflict with the tuple types constructed below.
    geom_sig: Optional[
        tuple[float, float, float, float, int, int, str, str, int, int]
    ] = None
    app_sig: Optional[
        tuple[
            Any,
            Any,
            Any,
            Any,
            float,
            float,
            float,
            float,
            float,
            bool,
            float,
            float,
            float,
            float,
            int,
            bool,
        ]
    ] = None
    try:
        # Use plotting helpers to compute signatures (centralized and testable)
        from pfui.app_components.plotting import (
            compute_app_sig,
            compute_geom_sig,
        )

        geom_sig = compute_geom_sig(
            H,
            Rt,
            Rb,
            expn,
            preview_n_theta,
            preview_n_z,
            style_name,
            opts_json,
            full_n_theta,
            full_n_z,
        )

        app_sig = compute_app_sig(
            cast(Any, ss.get("preview_palette")),
            cast(Any, ss.get("preview_grad_c1")),
            cast(Any, ss.get("preview_grad_c2")),
            cast(Any, ss.get("preview_grad_c3")),
            _to_float_scalar(ss.get("mesh_ambient", 0.35)),
            _to_float_scalar(ss.get("mesh_diffuse", 0.95)),
            _to_float_scalar(ss.get("mesh_specular", 0.25)),
            _to_float_scalar(ss.get("mesh_roughness", 0.7)),
            _to_float_scalar(ss.get("mesh_fresnel", 0.2)),
            bool(show_inner),
            float(view_elev),
            float(view_azim),
            float(fig_w),
            float(fig_h),
            int(dpi),
            bool(place_on_ground),
        )
    except Exception:
        geom_sig = None
        app_sig = None

    # Compare with last-run signatures
    last_geom_sig = cast(Optional[tuple], ss.get("_last_preview_geom_sig"))
    last_app_sig = cast(Optional[tuple], ss.get("_last_preview_app_sig"))
    geom_changed = (geom_sig is None) or (geom_sig != last_geom_sig)
    app_changed = (app_sig is None) or (app_sig != last_app_sig)

    # One-shot suppression for non-model reruns (e.g., snapshot pagination)
    if bool(cast(Optional[bool], ss.get("_suppress_preview_once", False))):
        should_update_preview = False
        ss["_suppress_preview_once"] = False

    # Centralize cached-vs-regenerate decision into plotting.should_regenerate
    if should_update_preview:
        try:
            # cached_any: whether we have any surface/mesh cached artifacts
            cached_any = any(
                [
                    cast(Optional[bytes], ss.get("_last_surface_png")),
                    cast(Optional[dict], ss.get("_last_surface_fig_json")),
                    cast(Optional[bytes], ss.get("_last_mesh_png")),
                    cast(Optional[dict], ss.get("_last_mesh_fig_json")),
                ]
            )
            # Import the centralized decision helper (keeps imports local and safe)
            from pfui.app_components.plotting import should_regenerate

            should_update_preview = should_regenerate(
                geom_sig,
                app_sig,
                last_geom_sig=cast(Optional[tuple], ss.get("_last_preview_geom_sig")),
                last_app_sig=cast(Optional[tuple], ss.get("_last_preview_app_sig")),
                preview_mode=cast(str, ss.get("preview_mode", preview_mode)),
                preview_stale=bool(
                    cast(Optional[bool], ss.get("_preview_stale", False))
                ),
                cached_any=bool(cached_any),
                last_change_ts=cast(Any, ss.get("_last_change_ts", 0.0)),
                debounce_timeout_s=debounce_timeout_seconds,
            )
        except Exception:
            # Best-effort: on error, preserve previous decision (safe fallback)
            pass
    if should_update_preview:
        t0_total = time.time()
        # Initialize to satisfy type checkers in all code paths
        t0_arrays = 0.0
        t1_arrays = 0.0
        X = None
        Y = None
        Z = None
        mesh_data = None
        try:
            with st.spinner("Computing preview…"):
                t0_arrays = time.time()
                # Reuse cached arrays when geometry unchanged
                if (not geom_changed) and all(
                    k in st.session_state for k in ("_last_X", "_last_Y", "_last_Z")
                ):
                    try:
                        X = cast(Any, ss.get("_last_X"))
                        Y = cast(Any, ss.get("_last_Y"))
                        Z = cast(Any, ss.get("_last_Z"))
                    except Exception:
                        X = Y = Z = None
                if (X is None) or (Y is None) or (Z is None):
                    # Use centralized orchestrator for array generation; preserves behavior and enables further refactor
                    try:
                        from pfui.app_components.plotting import (
                            orchestrate_preview as _orchestrate_preview,
                        )

                        res = _orchestrate_preview(
                            H,
                            Rt,
                            Rb,
                            expn,
                            preview_n_theta,
                            preview_n_z,
                            full_n_theta,
                            full_n_z,
                            style_name,
                            opts_json,
                            preview_mode=cast(
                                str, ss.get("preview_mode", preview_mode)
                            ),
                            preview_stale=bool(
                                cast(Any, ss.get("_preview_stale", False))
                            ),
                            last_geom_sig=cast(
                                Optional[tuple], ss.get("_last_preview_geom_sig")
                            ),
                            last_app_sig=cast(
                                Optional[tuple], ss.get("_last_preview_app_sig")
                            ),
                            geom_sig=geom_sig,
                            app_sig=app_sig,
                            debounce_timeout_s=debounce_timeout_seconds,
                            last_change_ts=cast(Any, ss.get("_last_change_ts", 0.0)),
                            interactive_mesh=bool(interactive_mesh),
                        )
                        arrs = cast(Any, res.get("arrays"))
                        if arrs is not None:
                            try:
                                X, Y, Z = arrs
                            except Exception:
                                X = Y = Z = None
                    except Exception:
                        # Fall back to direct call if orchestrator fails
                        X = Y = Z = None

                    if (X is None) or (Y is None) or (Z is None):
                        X, Y, Z = make_preview_arrays(
                            H,
                            Rt,
                            Rb,
                            expn,
                            preview_n_theta,
                            preview_n_z,
                            style_name,
                            opts_json,
                        )
                    # Cache for appearance-only changes
                    try:
                        ss["_last_X"] = X
                        ss["_last_Y"] = Y
                        ss["_last_Z"] = Z
                    except Exception:
                        pass
                t1_arrays = time.time()
                # Build mesh only when geometry/style changed; appearance-only changes reuse previous mesh
                do_mesh_build = bool(interactive_mesh and geom_changed)
                built_via_orchestrator = False
                if do_mesh_build:
                    # Prefer orchestrator for mesh build when available
                    try:
                        from pfui.app_components.plotting import (
                            orchestrate_preview as _orchestrate_preview,
                        )

                        res2 = _orchestrate_preview(
                            H,
                            Rt,
                            Rb,
                            expn,
                            preview_n_theta,
                            preview_n_z,
                            full_n_theta,
                            full_n_z,
                            style_name,
                            opts_json,
                            preview_mode=cast(
                                str, ss.get("preview_mode", preview_mode)
                            ),
                            preview_stale=bool(
                                cast(Any, ss.get("_preview_stale", False))
                            ),
                            last_geom_sig=cast(
                                Optional[tuple], ss.get("_last_preview_geom_sig")
                            ),
                            last_app_sig=cast(
                                Optional[tuple], ss.get("_last_preview_app_sig")
                            ),
                            geom_sig=geom_sig,
                            app_sig=app_sig,
                            debounce_timeout_s=debounce_timeout_seconds,
                            last_change_ts=cast(Any, ss.get("_last_change_ts", 0.0)),
                            interactive_mesh=True,
                            build_mesh_fn=build_pot_mesh,
                            t_wall=t_wall,
                            t_bottom=t_bottom,
                            r_drain=r_drain,
                            r_outer_fn=r_outer_fn,
                            style_opts=opts,
                        )
                        m = cast(Any, res2.get("mesh"))
                        if m is not None:
                            import numpy as _np_mb

                            try:
                                verts, faces, diag = m
                            except Exception:
                                # Gracefully handle mesh without diag
                                verts, faces = m
                                diag = None
                            Vb = _np_mb.asarray(verts)
                            Fb = _np_mb.asarray(faces)
                            if place_on_ground and len(Vb):
                                Vb[:, 2] -= Vb[:, 2].min()
                            mesh_data = (Vb, Fb)
                            # Cache geometry for reuse when only appearance changes
                            try:
                                ss["_last_mesh_V"] = Vb
                                ss["_last_mesh_F"] = Fb
                            except Exception:
                                pass
                            # Mark that we used orchestrator for perf log
                            try:
                                perf = ss.setdefault("_perf_logs", [])
                                perf.append("mesh_build:orchestrator")
                                ss["_perf_logs"] = perf[-40:]
                            except Exception:
                                pass
                            # If seam debug samples are present, show them
                            try:
                                if (
                                    opts.get("lp_debug_seam", False)
                                    and isinstance(diag, dict)
                                    and "seam_debug_samples" in diag
                                ):
                                    with st.expander(
                                        "Seam debug samples (lp_debug_seam)",
                                        expanded=False,
                                    ):
                                        all_groups = diag.get("seam_debug_samples", [])
                                        for gi, group in enumerate(all_groups):
                                            st.markdown(f"**Sample group {gi + 1}**")
                                            for samp in group:
                                                try:
                                                    (
                                                        theta_mid,
                                                        zc,
                                                        r_base_mid,
                                                        Rstart_mid,
                                                    ) = samp
                                                    delta = r_base_mid - Rstart_mid
                                                    st.write(
                                                        f"θ_mid={theta_mid:.3f}, z={zc:.3f}, r_base={r_base_mid:.3f}, R_start={Rstart_mid:.3f}, delta={delta:.6f}"
                                                    )
                                                except Exception:
                                                    st.write(repr(samp))
                            except Exception as _e_dbg:
                                ss.setdefault("_debug_logs", []).append(
                                    f"Seam debug display failed: {_e_dbg}"
                                )
                            built_via_orchestrator = True
                    except Exception:
                        built_via_orchestrator = False

                if do_mesh_build and (not built_via_orchestrator):
                    # Fallback to direct local mesh build
                    try:
                        t0_mb = time.time()
                        import numpy as _np_mb

                        verts, faces, diag = build_pot_mesh(
                            H=H,
                            Rt=Rt,
                            Rb=Rb,
                            t_wall=t_wall,
                            t_bottom=t_bottom,
                            r_drain=r_drain,
                            # Use preview resolution for interactive mesh to keep UI responsive
                            expn=expn,
                            n_theta=preview_n_theta,
                            n_z=preview_n_z,
                            r_outer_fn=r_outer_fn,
                            style_opts=opts,
                        )
                        Vb = _np_mb.asarray(verts)
                        Fb = _np_mb.asarray(faces)
                        if place_on_ground and len(Vb):
                            Vb[:, 2] -= Vb[:, 2].min()
                        mesh_data = (Vb, Fb)
                        # Cache geometry for reuse when only appearance changes
                        try:
                            ss["_last_mesh_V"] = Vb
                            ss["_last_mesh_F"] = Fb
                        except Exception:
                            pass
                        t1_mb = time.time()
                        try:
                            perf = ss.setdefault("_perf_logs", [])
                            perf.append(f"mesh_build:{(t1_mb - t0_mb) * 1000:.1f}ms")
                            ss["_perf_logs"] = perf[-40:]
                        except Exception:
                            pass
                        # If seam debug samples are present, show them in a collapsible panel
                        try:
                            if (
                                opts.get("lp_debug_seam", False)
                                and isinstance(diag, dict)
                                and "seam_debug_samples" in diag
                            ):
                                with st.expander(
                                    "Seam debug samples (lp_debug_seam)", expanded=False
                                ):
                                    all_groups = diag.get("seam_debug_samples", [])
                                    # all_groups is a list of sample groups; each group may be a list of tuples
                                    for gi, group in enumerate(all_groups):
                                        st.markdown(f"**Sample group {gi + 1}**")
                                        for samp in group:
                                            try:
                                                (
                                                    theta_mid,
                                                    zc,
                                                    r_base_mid,
                                                    Rstart_mid,
                                                ) = samp
                                                delta = r_base_mid - Rstart_mid
                                                st.write(
                                                    f"θ_mid={theta_mid:.3f}, z={zc:.3f}, r_base={r_base_mid:.3f}, R_start={Rstart_mid:.3f}, delta={delta:.6f}"
                                                )
                                            except Exception:
                                                st.write(repr(samp))
                        except Exception as _e_dbg:
                            ss.setdefault("_debug_logs", []).append(
                                f"Seam debug display failed: {_e_dbg}"
                            )
                    except Exception as _e_mb:
                        ss.setdefault("_debug_logs", []).append(
                            f"Mesh build failed (preview): {_e_mb}"
                        )
                # In auto mode we consider the new preview current, so clear stale flag
                if preview_mode == "auto":
                    ss["_preview_stale"] = False
                preview_exists = True
        except Exception as e:
            preview_exists = False
            st.error(f"Preview generation failed: {e}")
        finally:
            try:
                perf = ss.setdefault("_perf_logs", [])
                if preview_exists:
                    perf.append(
                        f"arrays:{(t1_arrays - t0_arrays) * 1000:.1f}ms total_so_far:{(time.time() - t0_total) * 1000:.1f}ms"
                    )
                else:
                    perf.append("arrays:ERROR")
                ss["_perf_logs"] = perf[-40:]
            except Exception:
                pass
            # Remember last successful preview signatures
            try:
                if preview_exists and geom_sig is not None and app_sig is not None:
                    ss["_last_preview_geom_sig"] = geom_sig
                    ss["_last_preview_app_sig"] = app_sig
            except Exception:
                pass

    # If we're NOT updating (manual mode and Update not clicked), show the
    # previously cached preview so the UI remains usable. Only display the
    # 'out-of-date' warning in explicit manual mode when the stale flag is set.
    if not should_update_preview:
        # Cast cached preview artifacts to concrete optionals for the type checker
        last_mesh_png = cast(Optional[bytes], ss.get("_last_mesh_png"))
        last_mesh_json = cast(Optional[dict], ss.get("_last_mesh_fig_json"))
        last_surf_png = cast(Optional[bytes], ss.get("_last_surface_png"))
        last_surf_json = cast(Optional[dict], ss.get("_last_surface_fig_json"))

        stale = bool(cast(Any, ss.get("_preview_stale", False)))
        show_warning = (preview_mode == "manual") and stale

        # Cached display: if Full preview exists, prefer it; otherwise show Quick if available.
        full_exists = bool((HAS_PLOTLY and last_mesh_json) or last_mesh_png)
        quick_exists = bool((HAS_PLOTLY and last_surf_json) or last_surf_png)

        # Show Full if it exists
        if interactive_mesh and full_exists and HAS_PLOTLY and last_mesh_json:
            try:
                f_m = go.Figure(last_mesh_json)  # noqa: F823
                mesh_placeholder.plotly_chart(
                    f_m, use_container_width=True, config={"displaylogo": False}
                )
            except Exception:
                if last_mesh_png:
                    mesh_placeholder.image(
                        last_mesh_png,
                        caption=(
                            "Full Preview (out of date)"
                            if show_warning
                            else "Full Preview"
                        ),
                        width="stretch",
                    )
        elif interactive_mesh and full_exists and last_mesh_png:
            mesh_placeholder.image(
                last_mesh_png,
                caption=(
                    "Full Preview (out of date)" if show_warning else "Full Preview"
                ),
                width="stretch",
            )

        # Only generate mesh PNGs when Plotly is unavailable (fallback), or when explicitly forced by the user.
        try:
            ss = cast(dict[str, Any], st.session_state)
            force_capture = bool(cast(Any, ss.get("_force_mesh_png_capture", False)))
            # Cap PNG mesh resolution aggressively to keep it cheap
            png_cap_n = _to_int_scalar(ss.get("png_cap_n", 64))

            t0_meshpng = time.time()
            png_bytes = None
            regen = False
            mode = "auto=off"

            if (not HAS_PLOTLY) or force_capture:
                regen = True
                mode = "force" if force_capture else "no_plotly"
                # Clear the flag immediately to avoid repeated regeneration
                if force_capture:
                    ss["_force_mesh_png_capture"] = False
                ak = "|".join(
                    str(cast(Any, ss.get(k, "")))
                    for k in (
                        "preview_palette",
                        "preview_grad_c1",
                        "preview_grad_c2",
                        "preview_grad_c3",
                        "mesh_ambient",
                        "mesh_diffuse",
                        "mesh_specular",
                        "mesh_roughness",
                        "mesh_fresnel",
                    )
                )
                try:
                    if interactive_mesh and (force_capture):
                        # Explicit mesh PNG capture: use snapshot renderer, but at capped mesh resolution
                        from pfui.preview import render_mesh_snapshot_cached

                        png_n_theta = int(max(8, min(png_cap_n, full_n_theta)))
                        png_n_z = int(max(8, min(png_cap_n, full_n_z)))
                        png_bytes = render_mesh_snapshot_cached(
                            H,
                            Rt,
                            Rb,
                            expn,
                            png_n_theta,
                            png_n_z,
                            style_name,
                            opts_json,
                            fig_w,
                            fig_h,
                            dpi,
                            inner_wall=t_wall if show_inner else None,
                            place_on_ground=place_on_ground,
                            view_elev=view_elev,
                            view_azim=view_azim,
                            appearance_key=ak,
                        )
                    else:
                        # Fallback to fast preview PNG (static engine) at capped resolution
                        png_n_theta = int(max(8, min(png_cap_n, preview_n_theta)))
                        png_n_z = int(max(8, min(png_cap_n, preview_n_z)))
                        png_bytes = render_preview_png_cached(
                            H,
                            Rt,
                            Rb,
                            expn,
                            png_n_theta,
                            png_n_z,
                            style_name,
                            opts_json,
                            fig_w,
                            fig_h,
                            dpi,
                            inner_wall=t_wall if show_inner else None,
                            view_elev=view_elev,
                            view_azim=view_azim,
                            return_png=True,
                            appearance_key=ak,
                        )
                except Exception:
                    png_bytes = None

            # Timing log for visibility
            try:
                perf = ss.setdefault("_perf_logs", [])
                elapsed_ms = (time.time() - t0_meshpng) * 1000
                perf.append(f"mesh_png:{elapsed_ms:.1f}ms regen={regen} {mode}")
                ss["_last_mesh_png_regenerated"] = regen
                ss["_last_mesh_png_time_ms"] = elapsed_ms
                ss["_perf_logs"] = perf[-40:]
            except Exception:
                pass
        except Exception:
            pass  # PNG generation is best-effort; failures shouldn't break the app

        # Dynamic placeholder: use a session flag so static analysis won't mark as unreachable
        if bool(cast(Any, ss.get("_quick_preview_disabled", False))):
            # Quick Preview is explicitly disabled by user: replace any previous preview
            try:
                preview_placeholder.info("Quick Preview is disabled")
            except Exception:
                try:
                    preview_placeholder.empty()
                except Exception:
                    pass

    # (No-op now: PNG generation is handled above in the gated block.)
    png_bytes = locals().get("png_bytes", None)

    # Quick Preview (live) — Plotly surface if available, otherwise static PNG fallback
    try:
        if should_update_preview:
            if HAS_PLOTLY and (X is not None) and (Y is not None) and (Z is not None):
                import plotly.graph_objects as go

                t0_surface = time.time()
                # Build colorscale for Quick preview from Appearance & Preview Settings
                ss = cast(dict[str, Any], st.session_state)
                use_grad_q = bool(cast(Any, ss.get("use_gradient_color", True)))
                solid_hex_q = str(cast(Any, ss.get("solid_color", "#BFC7D5")))
                c1_q = str(cast(Any, ss.get("preview_grad_c1", "#2850D0")))
                c2_q = str(cast(Any, ss.get("preview_grad_c2", "#5FA8FF")))
                c3_q = str(cast(Any, ss.get("preview_grad_c3", "#E2F3FF")))
                if use_grad_q:
                    cs_q = [[0.0, c1_q], [0.5, c2_q], [1.0, c3_q]]
                else:
                    cs_q = [[0.0, solid_hex_q], [1.0, solid_hex_q]]
                fig = go.Figure(
                    data=[go.Surface(x=X, y=Y, z=Z, colorscale=cs_q, showscale=False)]
                )
                # Make the Quick preview window twice as tall by default
                height_px = max(360, min(1800, _to_int_scalar(192 * fig_h)))
                try:
                    import numpy as _np_plot

                    rmax = float(_np_plot.max(_np_plot.sqrt(X**2 + Y**2)))
                    zmin = float(Z.min())
                    zmax = float(Z.max())
                except Exception:
                    rmax = max(1.0, _to_float_scalar(ss.get("top_od", 140.0)) * 0.5)
                    zmin, zmax = 0.0, _to_float_scalar(ss.get("H", 120.0))
                if place_on_ground:
                    zmin = 0.0
                xlim = [-rmax, rmax]
                ylim = [-rmax, rmax]
                zlim = [zmin, zmax]
                z_ratio = (zmax - zmin) / max(1e-6, (xlim[1] - xlim[0]))
                # Title includes grid size to make resolution explicit
                nz_q, nt_q = (
                    (Z.shape[0], Z.shape[1])
                    if hasattr(Z, "shape") and len(Z.shape) == 2
                    else (preview_n_z, preview_n_theta)
                )
                fig.update_layout(
                    height=height_px,
                    title=f"Quick preview (grid {nt_q}×{nz_q})",
                    scene=dict(
                        xaxis=dict(visible=False, range=xlim),
                        yaxis=dict(visible=False, range=ylim),
                        zaxis=dict(visible=False, range=zlim),
                        aspectmode="manual",
                        aspectratio=dict(x=1, y=1, z=min(0.85, z_ratio)),
                        camera=dict(
                            up=dict(x=0, y=0, z=1), projection=dict(type="orthographic")
                        ),
                        bgcolor=cast(Any, ss.get("preview_bg_color", "#0F1724")),
                    ),
                    margin=dict(l=0, r=0, t=30, b=0),
                )
                preview_placeholder.plotly_chart(
                    fig, use_container_width=True, config={"displaylogo": False}
                )
                # Persist latest quick preview figure for cached mode
                try:
                    ss["_last_surface_fig_json"] = fig.to_dict()
                except Exception:
                    pass
                try:
                    perf = ss.setdefault("_perf_logs", [])
                    perf.append(
                        f"surface_plotly:{(time.time() - t0_surface) * 1000:.1f}ms"
                    )
                    ss["_perf_logs"] = perf[-40:]
                except Exception:
                    pass
            elif not HAS_PLOTLY:
                # Static fallback when Plotly is unavailable
                ak = "|".join(
                    str(cast(Any, ss.get(k, "")))
                    for k in (
                        "preview_palette",
                        "preview_grad_c1",
                        "preview_grad_c2",
                        "preview_grad_c3",
                        "mesh_ambient",
                        "mesh_diffuse",
                        "mesh_specular",
                        "mesh_roughness",
                        "mesh_fresnel",
                    )
                )
                png_bytes_q = render_preview_png_cached(
                    H,
                    Rt,
                    Rb,
                    expn,
                    preview_n_theta,
                    preview_n_z,
                    style_name,
                    opts_json,
                    fig_w,
                    fig_h,
                    dpi,
                    inner_wall=t_wall if show_inner else None,
                    view_elev=view_elev,
                    view_azim=view_azim,
                    return_png=False,
                    appearance_key=ak,
                )
                if png_bytes_q:
                    preview_placeholder.image(
                        png_bytes_q, caption="Preview", width="stretch"
                    )
    except Exception:
        pass

    # Cache the freshly rendered PNG so manual mode can continue showing
    # the last preview until the user updates again.
    try:
        if png_bytes:
            # we stored png_bytes after choosing mesh vs surface above
            # but if interactive_mesh was false this is from surface
            if interactive_mesh:
                ss["_last_mesh_png"] = png_bytes
            else:
                ss["_last_surface_png"] = png_bytes
            ss["_preview_stale"] = False
    except Exception:
        pass

    # Full Preview (interactive Mesh3d or static fallback). Render only when updating.
    if should_update_preview and interactive_mesh:
        # If Plotly is present, render an interactive Mesh3d. Otherwise render a static PNG fallback.
        if HAS_PLOTLY:
            try:
                t0_mesh = time.time()

                import numpy as np

                from pfui.colors import build_gradient_colors

                # Honor exact full preview: when enabled, do not reuse preview-res mesh_data
                use_exact_full = bool(cast(Any, ss.get("exact_full_preview", True)))
                V = None
                F = None

                # Reuse earlier mesh build; if missing (e.g., switched modes) build now
                if (
                    (not use_exact_full)
                    and ("mesh_data" in locals())
                    and (mesh_data is not None)
                ):
                    V, F = mesh_data
                else:
                    # If only appearance changed, try to reuse last cached geometry
                    V = None
                    F = None
                    try:
                        V = cast(Any, ss.get("_last_mesh_V"))
                        F = cast(Any, ss.get("_last_mesh_F"))
                    except Exception:
                        V = None
                        F = None
                    # If exact is requested but the cached mesh uses different resolution, rebuild
                    # use_exact_full already set above
                    last_nt = cast(Optional[int], ss.get("_last_mesh_ntheta"))
                    last_nz = cast(Optional[int], ss.get("_last_mesh_nz"))
                    needs_exact_rebuild = bool(
                        use_exact_full and ((last_nt != n_theta) or (last_nz != n_z))
                    )
                    if (
                        (V is None)
                        or (F is None)
                        or geom_changed
                        or needs_exact_rebuild
                    ):
                        # Build mesh geometry depending on exact/preview mode
                        try:
                            import numpy as _np_r

                            use_exact_full = bool(
                                cast(Any, ss.get("exact_full_preview", True))
                            )
                            # When exact is requested, use the user-selected raw sliders (n_theta, n_z)
                            # rather than the scaled/clamped full_n_* values.
                            ntheta = n_theta if use_exact_full else preview_n_theta
                            nz = n_z if use_exact_full else preview_n_z
                            # Prefer orchestrator for exact/preview mesh build
                            try:
                                from pfui.app_components.plotting import (
                                    orchestrate_preview as _orchestrate_preview,
                                )

                                res_full = _orchestrate_preview(
                                    H,
                                    Rt,
                                    Rb,
                                    expn,
                                    int(ntheta),
                                    int(nz),
                                    full_n_theta,
                                    full_n_z,
                                    style_name,
                                    opts_json,
                                    preview_mode=cast(
                                        str, ss.get("preview_mode", preview_mode)
                                    ),
                                    preview_stale=bool(
                                        cast(Any, ss.get("_preview_stale", False))
                                    ),
                                    last_geom_sig=cast(
                                        Optional[tuple],
                                        ss.get("_last_preview_geom_sig"),
                                    ),
                                    last_app_sig=cast(
                                        Optional[tuple], ss.get("_last_preview_app_sig")
                                    ),
                                    geom_sig=geom_sig,
                                    app_sig=app_sig,
                                    debounce_timeout_s=_to_float_scalar(
                                        ss.get("debounce_timeout", 0.8)
                                    ),
                                    last_change_ts=cast(
                                        Any, ss.get("_last_change_ts", 0.0)
                                    ),
                                    interactive_mesh=True,
                                    build_mesh_fn=build_pot_mesh,
                                    t_wall=t_wall,
                                    t_bottom=t_bottom,
                                    r_drain=r_drain,
                                    r_outer_fn=r_outer_fn,
                                    style_opts=opts,
                                )
                                m_full = cast(Any, res_full.get("mesh"))
                            except Exception:
                                m_full = None
                            if m_full is not None:
                                try:
                                    verts2, faces2, _diag2 = m_full
                                except Exception:
                                    verts2, faces2 = m_full
                                V = _np_r.asarray(verts2)
                                F = _np_r.asarray(faces2)
                            else:
                                # Fallback direct build
                                verts2, faces2, _ = build_pot_mesh(
                                    H=H,
                                    Rt=Rt,
                                    Rb=Rb,
                                    t_wall=t_wall,
                                    t_bottom=t_bottom,
                                    r_drain=r_drain,
                                    expn=expn,
                                    n_theta=int(ntheta),
                                    n_z=int(nz),
                                    r_outer_fn=r_outer_fn,
                                    style_opts=opts,
                                )
                                V = _np_r.asarray(verts2)
                                F = _np_r.asarray(faces2)
                            if place_on_ground and len(V):
                                V[:, 2] -= V[:, 2].min()
                            # Persist cache for future appearance-only updates
                            try:
                                ss["_last_mesh_V"] = V
                                ss["_last_mesh_F"] = F
                                ss["_last_mesh_ntheta"] = int(ntheta)
                                ss["_last_mesh_nz"] = int(nz)
                            except Exception:
                                pass
                        except Exception:
                            V = np.zeros((0, 3))
                            F = np.zeros((0, 3), dtype=int)

                # Decimation removed per request; always use V,F as built (exact when enabled, preview-res otherwise)
                use_exact_full = bool(cast(Any, ss.get("exact_full_preview", True)))
                use_approx = False

                stride_used = 1
                Vd, Fd = V, F

                # Gradient coloring using user settings based on the final plotted vertices Vd
                use_gradient = bool(cast(Any, ss.get("use_gradient_color", True)))
                solid_hex = str(cast(Any, ss.get("solid_color", "#BFC7D5")))
                if len(Vd) and use_gradient:
                    try:
                        perf = st.session_state.setdefault("_perf_logs", [])
                        perf.append(
                            f"mesh_plot_setup:verts={len(Vd)},faces={len(Fd)},approx={use_approx},stride={stride_used}"
                        )
                        st.session_state["_perf_logs"] = perf[-40:]
                    except Exception:
                        pass
                    span_z = float(np.ptp(Vd[:, 2])) if len(Vd) else 0.0
                    z_norm = (Vd[:, 2] - Vd[:, 2].min()) / max(1e-6, span_z)
                    # Optional: subsample colors to reduce JSON size for very large meshes
                    color_stride = 1
                    try:
                        # Dense meshes benefit from lighter color payload
                        if len(Vd) > 200_000:
                            color_stride = 2
                        if len(Vd) > 500_000:
                            color_stride = 4
                    except Exception:
                        color_stride = 1
                    t0_col = time.time()
                    try:
                        preset = cast(Any, ss.get("preview_palette", "Custom"))
                        custom = [
                            cast(Any, ss.get("preview_grad_c1", "#2850D0")),
                            cast(Any, ss.get("preview_grad_c2", "#5FA8FF")),
                            cast(Any, ss.get("preview_grad_c3", "#E2F3FF")),
                        ]
                        if color_stride > 1:
                            # Build on downsample and expand to full length to cut compute + JSON size
                            from pfui.colors import build_gradient_colors as _bgc

                            z_sub = z_norm[::color_stride]
                            cols_sub = _bgc(
                                z_sub, preset if preset != "Custom" else None, custom
                            )
                            # Repeat each color 'color_stride' times and trim to len(Vd)
                            mesh_colors = [
                                c for c in cols_sub for _ in range(color_stride)
                            ][: len(Vd)]
                            if len(mesh_colors) < len(Vd):
                                mesh_colors.extend(
                                    [cols_sub[-1]] * (len(Vd) - len(mesh_colors))
                                )
                        else:
                            mesh_colors = build_gradient_colors(
                                z_norm, preset if preset != "Custom" else None, custom
                            )
                    except Exception:
                        mesh_colors = [[200, 200, 230] for _ in range(len(Vd))]
                    finally:
                        try:
                            perf = st.session_state.setdefault("_perf_logs", [])
                            perf.append(
                                f"color_map:{(time.time() - t0_col) * 1000:.1f}ms"
                            )
                            st.session_state["_perf_logs"] = perf[-40:]
                        except Exception:
                            pass
                else:
                    mesh_colors = []

                # Build mesh kwargs unconditionally. Previously the dict was
                # only created in the non-gradient branch which could leave it
                # undefined when gradient coloring was enabled, causing a
                # NameError at runtime: "name 'mesh_kwargs' is not defined".
                mesh_kwargs = dict(
                    x=Vd[:, 0],
                    y=Vd[:, 1],
                    z=Vd[:, 2],
                    i=Fd[:, 0],
                    j=Fd[:, 1],
                    k=Fd[:, 2],
                    flatshading=bool(cast(Any, ss.get("mesh_flatshading", False))),
                    lighting=dict(
                        ambient=min(
                            max(_to_float_scalar(ss.get("mesh_ambient", 0.35)), 0.0),
                            1.0,
                        ),
                        diffuse=min(
                            max(_to_float_scalar(ss.get("mesh_diffuse", 0.95)), 0.0),
                            1.0,
                        ),
                        specular=min(
                            max(_to_float_scalar(ss.get("mesh_specular", 0.25)), 0.0),
                            1.0,
                        ),
                        roughness=min(
                            max(_to_float_scalar(ss.get("mesh_roughness", 0.7)), 0.0),
                            1.0,
                        ),
                        fresnel=min(
                            max(_to_float_scalar(ss.get("mesh_fresnel", 0.2)), 0.0), 1.0
                        ),
                    ),
                    hoverinfo="skip",
                    name="mesh",
                    opacity=1.0,
                )
                if use_gradient and len(mesh_colors):
                    mesh_kwargs["vertexcolor"] = mesh_colors
                else:
                    mesh_kwargs["color"] = solid_hex
                fig = go.Figure(data=[go.Mesh3d(**mesh_kwargs)])
                # Make the Full preview window twice as tall by default
                height_px = max(400, min(2000, _to_int_scalar(220 * fig_h)))
                # Symmetric XY extents and ortho projection to avoid elongation
                try:
                    rmax = float(max(abs(V[:, 0]).max(), abs(V[:, 1]).max()))
                    zmin = float(V[:, 2].min())
                    zmax = float(V[:, 2].max())
                except Exception:
                    rmax = max(1.0, _to_float_scalar(ss.get("top_od", 140.0)) * 0.5)
                    zmin, zmax = 0.0, _to_float_scalar(ss.get("H", 120.0))
                xlim = [-rmax, rmax]
                ylim = [-rmax, rmax]
                zlim = [zmin, zmax]
                z_ratio = (zmax - zmin) / max(1e-6, (xlim[1] - xlim[0]))
                # Title includes mesh resolution and face count, and whether exact or approximate was used
                try:
                    nt_used = _to_int_scalar(ss.get("_last_mesh_ntheta", 0)) or (
                        int(V.shape[0]) // max(1, (n_z if n_z else 1))
                    )
                except Exception:
                    nt_used = 0
                try:
                    nz_used = _to_int_scalar(ss.get("_last_mesh_nz", 0)) or (
                        int(V.shape[0]) // max(1, (n_theta if n_theta else 1))
                    )
                except Exception:
                    nz_used = 0
                title_txt = (
                    f"Full preview (triangles {len(Fd):,}, exact={use_exact_full})"
                )
                fig.update_layout(
                    height=height_px,
                    title=title_txt,
                    scene=dict(
                        xaxis=dict(visible=False, range=xlim),
                        yaxis=dict(visible=False, range=ylim),
                        zaxis=dict(visible=False, range=zlim),
                        aspectmode="manual",
                        aspectratio=dict(x=1, y=1, z=min(0.85, z_ratio)),
                        camera=dict(
                            up=dict(x=0, y=0, z=1), projection=dict(type="orthographic")
                        ),
                        bgcolor=cast(Any, ss.get("preview_bg_color", "#0E1117")),
                    ),
                    margin=dict(l=0, r=0, t=30, b=0),
                )
                try:
                    preview_placeholder.empty()
                except Exception:
                    pass
                mesh_placeholder.plotly_chart(
                    fig, use_container_width=True, config={"displaylogo": False}
                )
                t1_mesh = time.time()
                try:
                    perf = st.session_state.setdefault("_perf_logs", [])
                    perf.append(f"mesh_plotly:{(t1_mesh - t0_mesh) * 1000:.1f}ms")
                    st.session_state["_perf_logs"] = perf[-40:]
                except Exception:
                    pass
                # Persist the exact mesh figure so manual mode can show it
                try:
                    st.session_state["_last_mesh_fig_json"] = fig.to_dict()
                except Exception:
                    pass
                # Removed auto/manual mesh PNG capture here; snapshots and publish handle PNG generation explicitly
            except Exception as e:
                # Fallback to last known mesh PNG if available
                try:
                    last_png = cast(Optional[bytes], ss.get("_last_mesh_png"))
                    if last_png:
                        mesh_placeholder.image(
                            last_png,
                            caption="Full Preview (PNG fallback)",
                            width="stretch",
                        )
                    else:
                        mesh_placeholder.info(
                            f"Mesh preview unavailable (no fallback): {e}"
                        )
                except Exception:
                    mesh_placeholder.info(f"Mesh preview unavailable (error): {e}")
        else:
            # Plotly not available: show static PNG
            try:
                current_png = png_bytes or cast(
                    Optional[bytes], ss.get("_last_mesh_png")
                )
                if current_png:
                    mesh_placeholder.image(
                        current_png, caption="Full Preview (static)", width="stretch"
                    )
                else:
                    mesh_placeholder.info("Full preview PNG not available yet.")
            except Exception:
                pass

    # -------------------- METRICS ----------------------
    render_metrics_section(
        H=H,
        Rt=Rt,
        Rb=Rb,
        t_wall=t_wall,
        t_bottom=t_bottom,
        r_drain=r_drain,
        expn=expn,
        n_theta=n_theta,
        n_z=n_z,
        r_outer_fn=r_outer_fn,
        opts=opts,
    )

    # -------------------- APPEARANCE / PREVIEW SETTINGS --------------------
    with st.expander("Appearance & Preview Settings"):
        render_appearance_settings()

    # -------------------- SNAPSHOTS --------------------
    with st.expander("Snapshots (compare)"):
        render_snapshots(
            style_name=style_name,
            style_key=style_key,
            H=H,
            top_od=top_od,
            bottom_od=bottom_od,
            t_wall=t_wall,
            t_bottom=t_bottom,
            r_drain=r_drain,
            expn=expn,
            ui_opts=dict(ui_opts),
            n_theta=n_theta,
            n_z=n_z,
            fig_w=fig_w,
            fig_h=fig_h,
            dpi=dpi,
            show_inner=show_inner,
            place_on_ground=place_on_ground,
            view_elev=view_elev,
            view_azim=view_azim,
        )

    # ---------------------- EXPORT ---------------------
    render_export_section(
        _has_library=_has_library,
        _library_read_only=_library_read_only,
        style_name=style_name,
        H=H,
        Rt=Rt,
        Rb=Rb,
        t_wall=t_wall,
        t_bottom=t_bottom,
        r_drain=r_drain,
        expn=expn,
        n_theta=n_theta,
        n_z=n_z,
        r_outer_fn=r_outer_fn,
        opts=opts,
        name=name,
        top_od=top_od,
        bottom_od=bottom_od,
        do_export=do_export,
        n_theta_export=n_theta_export,
        n_z_export=n_z_export,
    )

    # ----------------- 2D PROFILE ----------------------
    render_profile_section(H, Rt, Rb, expn, r_outer_fn, dict(opts), t_wall)

    # --------------- PERFORMANCE (DEV) ----------------
    render_performance_section()

# ============================================================
# Tab 2 — Batch from YAML
# ============================================================

