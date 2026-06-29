# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import re
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict, List
from typing import cast, Callable, Union
from typing import Any as _ArrayLike  # for broad array-or-scalar typing without optional module issues

import math
import streamlit as st
from pfui.preview import render_preview_png_cached
from datetime import datetime

# --- Optional / graceful Plotly import (interactive preview) ---
from typing import Any
try:
    import plotly.graph_objects as go  # type: ignore[import-not-found]
    HAS_PLOTLY = True
except Exception:
    HAS_PLOTLY = False
    # Annotate as Any so attribute access (Figure, Surface, Mesh3d) doesn't upset type checker
    go: Any = None  # type: ignore[assignment]

if not HAS_PLOTLY:
    st.info("Plotly is not available. Interactive 3D preview and mesh features are disabled.")

# --- PotFoundry UI/engine imports ---
from pfui.imports import STYLES, build_pot_mesh, WRITE_STL_BINARY, WRITE_OBJ
from pfui.presets import PRESETS, _read_user_presets, _write_user_presets, apply_preset_dict
from pfui.schemas import STYLE_SCHEMAS
from pfui.state import (
    apply_pending_updates,
    queue_update,
    widget_key,
    reset_style_defaults,
    reset_all_defaults,
)
from pfui.controls import style_controls, twist_controls
from pfui.preview import make_preview_arrays, render_profile, render_mesh_snapshot_cached
from pfui.health import _design_health, _health_badge
from pfui.batch_tab import render_batch_tab
from pfui.units import units_selector
from pfui.snapshot_store import save_png_temp, cleanup_old_tempfiles, read_png_bytes, remove_png_path
from pfui import state_history as Hist
from pfui.deeplink import parse_query_params, apply_state, clear_query_params
from pfui.library_ui import render_library_tab
from potfoundry.integrations.supabase_client import get_singleton_client, SupabaseClient
import time


def _mask_possible_secrets(text: str) -> str:
    """Mask common secret patterns and any known supabase key from st.secrets.

    This is defensive: never reveal raw keys or long hashes in UI text areas.
    """
    try:
        svc_key = None
        if 'st' in globals() and st is not None:
            try:
                svc_key = st.secrets.get("connections", {}).get("supabase", {}).get("key")
            except Exception:
                svc_key = None
        if svc_key and svc_key in text:
            text = text.replace(svc_key, "[REDACTED]")

        # Mask JWT-like tokens
        text = re.sub(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED_JWT]", text)

        # Mask long hex hashes (>=48 hex chars)
        text = re.sub(r"[0-9a-fA-F]{48,}", "[REDACTED_HASH]", text)
    except Exception:
        return text
    return text

# ------------------------------------------------------------
# Boot: apply any queued state changes BEFORE creating widgets
# ------------------------------------------------------------
def _cleanup_stale_media_ids() -> None:
    """Remove values that look like Streamlit media-file ids (hex.png) from
    session_state. These can persist across runs and cause MediaFileStorageError
    when the browser requests a missing id.

    This is defensive and cheap; it only removes strings that exactly match
    a 64-hex-character filename with .png extension or containers that contain
    such strings.
    """
    import re

    pattern = re.compile(r"^[0-9a-f]{64}\.png$")

    def _has_stale(obj: object) -> bool:
        if isinstance(obj, str):
            # treat explicit 64-hex.png ids as stale, and any string that
            # looks like a media path or contains '.png' as potentially stale
            if bool(pattern.match(obj)):
                return True
            if ".png" in obj or "media" in obj.lower():
                return True
            return False
        if isinstance(obj, dict):
            return any(_has_stale(v) for v in obj.values())
        if isinstance(obj, (list, tuple)):
            return any(_has_stale(v) for v in obj)
        if isinstance(obj, (bytes, bytearray)):
            # raw PNG bytes stored in session_state — consider stale
            return True
        return False

    for k in list(st.session_state.keys()):
        # Don't treat our internal debug containers or the snapshots
        # list as stale even if they contain filenames or paths. These are
        # intentionally persisted across runs. Also preserve last preview
        # artifacts so manual mode can continue showing them.
        if k in ("_debug_logs", "_snaps", "_last_surface_png", "_last_surface_fig_json", "_last_mesh_png", "_last_mesh_fig_json", "_preview_stale"):
            try:
                st.session_state.setdefault("_debug_logs", []).append(f"Debug: preserved session key {k}")
            except Exception:
                pass
            continue

        try:
            v = st.session_state.get(k)
        except Exception:
            # If we can't access a key, skip it.
            continue
        try:
            if _has_stale(v):
                try:
                    del st.session_state[k]
                except Exception:
                    # best-effort removal; ignore failures
                    pass
        except Exception:
            # If the predicate throws for an unexpected type, ignore this key.
            continue


# Run cleanup once at import to remove stale Streamlit media ids
try:
    _cleanup_stale_media_ids()
except Exception:
    pass

APP_VERSION = "2.1.0-evo"


def resolve_schema_key(style_name: str) -> str:
    """Resolve a style identifier to a STYLE_SCHEMAS key.

    This is intentionally permissive: if the exact name exists in
    STYLE_SCHEMAS it is returned; otherwise we attempt a case-insensitive
    match and fall back to the original value.
    """
    if style_name in STYLE_SCHEMAS:
        return style_name
    for k in STYLE_SCHEMAS.keys():
        if k.lower() == str(style_name).lower():
            return k
    return style_name


# --- Apply any queued state updates from previous interactions BEFORE
# creating widgets. This ensures queue_update() calls are realized on the
# subsequent run rather than being lost across a rerun.
try:
    # ensure debug log container exists early so boot messages persist
    if "_debug_logs" not in st.session_state:
        st.session_state["_debug_logs"] = []
    apply_pending_updates()
    st.session_state["_debug_logs"].append("Boot: applied pending updates.")
except Exception:
    # Do not crash the UI on boot; best-effort diagnostics only.
    try:
        st.session_state.setdefault("_debug_logs", []).append("Boot: failed to apply pending updates")
    except Exception:
        pass

# ------------ Page config ------------
st.set_page_config(page_title="PotFoundry Pro v2", layout="wide")
st.title("PotFoundry Pro v2 — Designer & Batch")
st.caption(f"Build {APP_VERSION}")
# Undo/Redo buttons and keyboard shortcuts
try:
    c_ur1, c_ur2 = st.columns([1, 1])
    if c_ur1.button("Undo (Ctrl+Z)"):
        Hist.undo()
        st.rerun()
    if c_ur2.button("Redo (Ctrl+Y)"):
        Hist.redo()
        st.rerun()
except Exception:
        pass

# Inject small JS to forward Ctrl+Z / Ctrl+Y to Streamlit buttons (best-effort)
st.markdown(
        """
<script>
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        const btn = Array.from(document.querySelectorAll('button')).find(b=>b.innerText && b.innerText.includes('Undo'));
        if (btn) { btn.click(); e.preventDefault(); }
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        const btn = Array.from(document.querySelectorAll('button')).find(b=>b.innerText && b.innerText.includes('Redo'));
        if (btn) { btn.click(); e.preventDefault(); }
    }
});
</script>
""",
        unsafe_allow_html=True,
)
# NOTE: don't pop the units guard; let units_selector manage it internally
# st.session_state.pop("_units_widget_rendered_this_run", None)

# ============================================================
# Deep Link Handling (load state from URL query param)
# ============================================================
if "_deeplink_applied" not in st.session_state:
    state_from_url = parse_query_params()
    if state_from_url:
        try:
            warnings = apply_state(state_from_url, quiet=True)
            st.session_state["_deeplink_applied"] = True
            clear_query_params()
            if warnings:
                st.info(f"Loaded design from link (with {len(warnings)} adjustments)")
            else:
                st.success("Loaded design from link")
        except Exception as e:
            st.warning(f"Failed to load design from link: {e}")
    st.session_state.setdefault("_deeplink_applied", True)

# ------------ Tabs ------------
# Check if library is configured to show Library tab
_library_client = get_singleton_client()
_has_library = _library_client.is_configured()
_library_read_only = False
try:
    if isinstance(_library_client, SupabaseClient):
        _library_read_only = getattr(_library_client, "read_only", False)
except Exception:
    _library_read_only = False

if _has_library:
    _tab1, _tab2, _tab3 = st.tabs(["Interactive", "Batch from YAML", "Public Library"])
else:
    _tab1, _tab2 = st.tabs(["Interactive", "Batch from YAML"])
    _tab3 = None

# ============================================================
# Tab 1 — Interactive Designer
# ============================================================
with _tab1:
    # ------------------ SIDEBAR (all inputs) ------------------
    with st.sidebar:
        # Units at a fixed, stable location
        units_selector()

        st.header("Model")
        # Timestamp used to implement debounced preview updates
        if "_last_change_ts" not in st.session_state:
            st.session_state["_last_change_ts"] = 0.0

        def _mark_changed() -> None:
            try:
                st.session_state["_last_change_ts"] = time.time()
                # Only mark preview as stale if we're in manual or debounced
                # modes. In auto mode previews update immediately so we
                # shouldn't mark them stale.
                mode = st.session_state.get("preview_mode", "manual")
                if mode in ("manual", "debounced"):
                    st.session_state["_preview_stale"] = True
                else:
                    st.session_state["_preview_stale"] = False
            except Exception:
                pass
        def _on_model_name_change() -> None:
            # If user edits model name manually, mark it and disable auto-name
            # so we don't overwrite the user's change.
            st.session_state["_model_name_user_edited"] = True
            st.session_state["_model_name_auto"] = False

        # Ensure user-edited flag exists (default False)
        if "_model_name_user_edited" not in st.session_state:
            st.session_state["_model_name_user_edited"] = False
        # Ensure an explicit auto-name checkbox state exists. Default to True
        # (auto name enabled) unless the user has edited the name previously.
        if "_model_name_auto" not in st.session_state:
            st.session_state["_model_name_auto"] = not st.session_state["_model_name_user_edited"]
        # Compute an auto name (mirrors Snapshot default) from the last-known
        # style/H in session state so we can present the same auto-updating
        # behaviour without moving the widget in the sidebar.
        # If the session doesn't yet have a chosen style (first load), use
        # the first style from STYLES as the default so the auto-name matches
        # what the selectbox will show once rendered.
        all_styles = sorted(STYLES.keys()) if isinstance(STYLES, dict) else []
        # If no style is set in the session (first run), initialize it so the
        # selectbox and our auto-name use the same initial value.
        if "style" not in st.session_state and all_styles:
            st.session_state["style"] = all_styles[0]
        style_guess = st.session_state.get("style", all_styles[0] if all_styles else None)
        H_guess = int(st.session_state.get("H", 120.0))
        try:
            auto_name_guess = f"{style_guess}_H{int(H_guess)}" if style_guess else "SpiralRidges_Design"
        except Exception:
            auto_name_guess = st.session_state.get("model_name", "SpiralRidges_Design")

        # If auto-name checkbox is enabled, make sure the session reflects
        # the automatic name before creating the widget so the input shows it.
        if st.session_state.get("_model_name_auto", True):
            st.session_state["model_name"] = auto_name_guess
            st.session_state["_model_name_user_edited"] = False

        # Model name input (placed near the top of the sidebar)
        name = st.text_input(
            "Model name",
            value=st.session_state.get("model_name", "SpiralRidges_Design"),
            key="model_name",
            on_change=_on_model_name_change,
        )

        # Small checkbox to let the user toggle automatic naming back on.
        # Its value is stored in `_model_name_auto` and is respected at the
        # start of the run (above) so checking it will immediately restore
        # the auto-generated name.
        auto_label = "Auto-name (follow style/H)"
        st.checkbox(auto_label, value=st.session_state.get("_model_name_auto", True), key="_model_name_auto")
        prev_style = st.session_state.get("_prev_style", None)
        style_options = sorted(STYLES.keys())
        style_name = st.selectbox("Style family", options=style_options, key="style")
        style_key  = resolve_schema_key(style_name)
        # Jeśli styl nie istnieje w STYLE_SCHEMAS, pokaż ostrzeżenie i wybierz domyślny
        if style_key not in STYLE_SCHEMAS:
            st.warning(f"Style '{style_name}' is not available. Falling back to default style.")
            style_name = style_options[0]
            style_key = resolve_schema_key(style_name)
            st.session_state["style"] = style_name
            reset_style_defaults(style_name)
            st.rerun()
        # Automatycznie resetuj kontrolki stylu po zmianie stylu
        if prev_style != style_name:
            st.session_state["_prev_style"] = style_name
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
        # --- Dimensions Section ---
        with st.expander("Dimensions (mm)", expanded=True):
            H = float(st.number_input(
                "Height", 60.0, 240.0, st.session_state.get("H", 120.0), 5.0, key="H",
                help="Overall height of the pot measured from the base to the rim."
            ))
            top_od = float(st.number_input(
                "Top OD", 60.0, 240.0, st.session_state.get("top_od", 140.0), 5.0, key="top_od",
                help="Outer diameter at the rim (OD = outside diameter)."
            ))
            bottom_od = float(st.number_input(
                "Bottom OD", 40.0, 200.0, st.session_state.get("bottom_od", 90.0), 5.0, key="bottom_od",
                help="Outer diameter at the base. Increase for more stability or reduce for a sleeker profile."
            ))
            t_wall = float(st.number_input(
                "Wall thickness", 2.0, 8.0, st.session_state.get("t_wall", 3.0), 0.5, key="t_wall",
                help="Thickness of the pot wall. Typical FDM prints work well around 2.5–3.0 mm."
            ))
            t_bottom = float(st.number_input(
                "Bottom slab", 2.0, 10.0, st.session_state.get("t_bottom", 3.0), 0.5, key="t_bottom",
                help="Thickness of the bottom solid slab. Thicker improves rigidity and weight."
            ))
            r_drain = float(st.number_input(
                "Drain hole", 3.0, 30.0, st.session_state.get("r_drain", 10.0), 1.0, key="r_drain",
                help="Radius of the drainage hole. Ensure it remains smaller than inner radius at the base."
            ))
            Rt, Rb = 0.5 * top_od, 0.5 * bottom_od

        # (model_name auto-default logic handled earlier)

        # --- Profile Section ---
        with st.expander("Profile / Curve", expanded=True):
            expn = float(st.slider(
                "Flare exponent", 0.7, 1.6, st.session_state.get("expn", 1.1), 0.05, key="expn", on_change=_mark_changed,
                help="Controls how quickly the wall expands from base to rim. >1 favors the top, <1 favors the base."
            ))
            c1, c2, c3 = st.columns(3)
            # NOTE: widget keys now use style_key (not style_name)
            k1 = widget_key(style_key, "flare_center")
            k2 = widget_key(style_key, "flare_sharp")
            k3 = widget_key(style_key, "bell_amp")
            flare_center = float(c1.slider(
                "Flare center (0–1)", 0.1, 0.9, st.session_state.get(k1, 0.5), 0.01, key=k1, on_change=_mark_changed,
                help="Where along the height the flare concentrates. 0=base, 1=top."
            ))
            flare_sharp  = float(c2.slider(
                "Flare sharpness", 1.0, 12.0, st.session_state.get(k2, 6.0), 0.1,  key=k2, on_change=_mark_changed,
                help="Higher values make the flare transition more abrupt."
            ))
            bell_amp     = float(c3.slider(
                "Bell amplitude", 0.0, 0.5,  st.session_state.get(k3, 0.0), 0.01, key=k3, on_change=_mark_changed,
                help="Adds a soft ring-shaped bulge; set to 0 to disable."
            ))
            c4, c5 = st.columns(2)
            k4 = widget_key(style_key, "bell_center")
            k5 = widget_key(style_key, "bell_width")
            bell_center = float(c4.slider(
                "Bell center (0–1)", 0.1, 0.9, st.session_state.get(k4, 0.5), 0.01, key=k4, on_change=_mark_changed,
                help="Height position of the bell-shaped bulge."
            ))
            bell_width  = float(c5.slider(
                "Bell width", 0.05, 0.5, st.session_state.get(k5, 0.22), 0.01, key=k5, on_change=_mark_changed,
                help="Controls how wide the bell bulge spreads."
            ))

    # --- Mesh Quality Section ---
        with st.expander("Mesh Quality", expanded=False):
            q1, q2 = st.columns(2)
            n_theta = int(q1.slider(
                "Angular divisions (nθ)", 96, 720, st.session_state.get("n_theta", 168), 12, key="n_theta", on_change=_mark_changed,
                help="Higher values increase roundness and detail around the pot. Affects both preview and export."
            ))
            n_z     = int(q2.slider(
                "Vertical divisions (nz)", 32, 256, st.session_state.get("n_z", 84), 4, key="n_z", on_change=_mark_changed,
                help="Higher values add more rings along height for smoother vertical transitions."
            ))

        # (Removed duplicate Appearance & Preview Settings block here — consolidated later in the file)

        # --- Style Options Section (options only) ---
        with st.expander("Style Options", expanded=False):
            ui_opts = style_controls(style_key)
            ui_opts.update({
                "flare_center": flare_center,
                "flare_sharp":  flare_sharp,
                "bell_amp":     bell_amp,
                "bell_center":  bell_center,
                "bell_width":   bell_width,
            })

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
                        pending = {widget_key(style_key, k): v for k, v in pdefs[p].items()}
                        queue_update(pending); st.rerun()
                st.caption("Built-in presets apply style option values.")

            with st.expander("User presets (save/load)"):
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
                            "wall": t_wall, "bottom": t_bottom, "drain": r_drain, "flare_exp": expn
                        },
                        "opts": {
                            k: st.session_state.get(widget_key(style_key, k), v["default"])
                            for k, v in STYLE_SCHEMAS.get(style_key, {}).items()
                        },
                    }
                    pdata.setdefault("presets", []).append(preset)
                    st.success("Preset saved.") if _write_user_presets(pdata) else st.error("Failed to save preset.")

                if cols[3].button("Delete") and sel != "<none>":
                    idx = names.index(sel); del pdata["presets"][idx]
                    st.success("Preset deleted.") if _write_user_presets(pdata) else st.error("Failed to update presets.")

                if sel != "<none>" and st.button("Apply selected"):
                    idx = names.index(sel)
                    apply_preset_dict(pdata["presets"][idx])
                    st.success("Applied preset."); st.rerun()

        # Reset buttons (restored top-level)
        cL, cR = st.columns(2)
        if cL.button("Reset style to defaults"):
            reset_style_defaults(style_name); st.rerun()
        if cR.button("Reset ALL controls"):
            reset_all_defaults(style_name); st.rerun()

    # --------------- PREVIEW & EXPORT CONTROLS ---------------
    with st.expander("Preview & Export", expanded=True):
        c1, c2, c3, c4 = st.columns([1.2, 1.2, 1.2, 1.2])

        preview_detail = float(
            c1.slider("Preview detail (×)", 0.5, 2.0, st.session_state.get("preview_detail", 1.25), 0.05, key="preview_detail", on_change=_mark_changed)
        )

        # Preview mode: manual / auto / debounced
        preview_mode = c1.selectbox(
            "Preview mode",
            options=["manual", "auto", "debounced"],
            index={"manual": 0, "auto": 1, "debounced": 2}.get(st.session_state.get("preview_mode", "auto"), 1),
            key="preview_mode",
            help="Choose how previews update: manual (button), automatic, or debounced (wait until inputs settle).",
        )

        debounce_timeout = c1.number_input(
            "Debounce timeout (s)", min_value=0.2, max_value=10.0, value=st.session_state.get("debounce_timeout", 0.8), step=0.1, key="debounce_timeout"
        )

        # Backwards compatible flag
        auto_preview = preview_mode == "auto"

        # Always enable both Quick and Full previews (no checkboxes)
        interactive_3d = True
        interactive_mesh = True
        # Default engine: Interactive Plotly when available; remove engine selector per request
        st.session_state["quick_engine"] = "interactive" if HAS_PLOTLY else "static"

        fig_w = float(c3.slider("Figure width (in)", 4.0, 10.0, st.session_state.get("fig_w", 7.5), 0.1, key="fig_w"))
        fig_h = float(c3.slider("Figure height (in)", 4.0, 8.0,  st.session_state.get("fig_h", 5.2), 0.1, key="fig_h"))
        dpi   = int(c3.slider("DPI", 110, 220, st.session_state.get("dpi", 170), 10, key="dpi"))

        view_elev = float(c4.slider("View elev (°)", -30.0, 75.0,  st.session_state.get("view_elev", 20.0), 1.0, key="view_elev"))
        view_azim = float(c4.slider("View azim (°)", -180.0, 180.0, st.session_state.get("view_azim", -60.0), 1.0, key="view_azim"))
        show_inner = c4.checkbox("Inner wall overlay", value=st.session_state.get("show_inner", False), key="show_inner")

        st.divider()
        cE1, cE2, cE3 = st.columns([1.2, 1.2, 2.6])
        up = cE1.select_slider(
            "Export quality upscale",
            options=[1, 2, 3],
            value=st.session_state.get("quality_up", 2),
            key="quality_up",
            help="Multiplies nθ & nz when generating the STL. Use higher values for ultra-smooth exports.",
        )
        n_theta_export = int(n_theta * up)
        n_z_export     = int(n_z * up)
        do_export = cE2.button("Export STL…", type="primary", key="export_btn")
        # Force static mesh PNG capture (even if only appearance changed)
        if cE2.button("Capture static mesh PNG", key="force_mesh_capture", help="Regeneruj statyczny obraz siatki niezależnie od tego czy geometria się zmieniła."):
            st.session_state["_force_mesh_png_capture"] = True
            st.session_state["_preview_stale"] = True
            try:
                st.rerun()
            except Exception:
                pass
        # Cached / regen status indicator
        last_mesh_regen = st.session_state.get("_last_mesh_png_regenerated", None)
        last_mesh_time  = st.session_state.get("_last_mesh_png_time_ms", None)
        if last_mesh_regen is not None:
            status = "regenerated" if last_mesh_regen else "cached"
            extra = f" ({last_mesh_time:.0f} ms)" if last_mesh_time is not None else ""
            cE3.caption(f"Mesh PNG: {status}{extra} — auto=off")

        # Offer preview image downloads (PNG, optional SVG) using cached previews
        try:
            surf_png = st.session_state.get("_last_surface_png")
            mesh_png = st.session_state.get("_last_mesh_png")
            # Two compact columns for download buttons if available
            d1, d2 = cE3.columns(2)
            if surf_png:
                d1.download_button(
                    "Download Quick Preview PNG",
                    data=surf_png,
                    file_name=f"{name}_preview_quick.png",
                    mime="image/png",
                )
                # Optional SVG via Plotly if possible
                if HAS_PLOTLY and st.session_state.get("_last_surface_fig_json"):
                    try:
                        fig = go.Figure(st.session_state.get("_last_surface_fig_json"))
                        w = max(400, min(900, int(96 * fig_h)))
                        h = max(300, min(800, int(96 * fig_h)))
                        svg_bytes = fig.to_image(format="svg", width=w, height=h)
                        if svg_bytes:
                            d2.download_button(
                                "Download Quick Preview SVG",
                                data=svg_bytes,
                                file_name=f"{name}_preview_quick.svg",
                                mime="image/svg+xml",
                            )
                    except Exception:
                        pass
            if mesh_png:
                cE3.download_button(
                    "Download Full Preview PNG",
                    data=mesh_png,
                    file_name=f"{name}_preview_full.png",
                    mime="image/png",
                )
        except Exception:
            pass

    # ---------------- HEALTH & WARNINGS ----------------
    st.subheader("Design checks")
    issues: List[str] = []
    if r_drain < max(4.0, 0.8 * t_wall):
        issues.append("Drain radius is quite small vs wall thickness.")
    if t_wall > 0.12 * min(top_od, bottom_od):
        issues.append("Wall thickness is very large vs diameter; may self-intersect.")
    if t_bottom > 0.3 * H:
        issues.append("Bottom thickness is large vs height; consider reducing.")
    if min(Rt, Rb) <= t_wall * 1.2:
        issues.append("Wall thickness approaches/exceeds radius; increase diameters or reduce wall.")
    if t_wall < 1.5:
        issues.append("Very thin walls may be fragile in printing.")
    for msg in issues:
        st.warning(msg)

    badges = _design_health(H, Rt, Rb, t_wall, t_bottom, r_drain)
    cols = st.columns(min(3, max(1, len(badges))))
    for c, b in zip(cols, badges):
        _health_badge(c, b.label, b.status, b.tip)

    # -------------------- PREVIEW ----------------------
    st.subheader("Preview")

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
                timeout_ms = int(float(st.session_state.get("debounce_timeout", 0.8)) * 1000)
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
      var btn = findButton(); if(btn){ try{ btn.click(); } catch(e){} }
    }, timeout);
  }
  var observer = new MutationObserver(function(){ scheduleClick(); });
  observer.observe(document.body, {childList:true, subtree:true, attributes:true});
  ['input','change','mouseup','keyup','pointerup'].forEach(function(ev){ document.addEventListener(ev, scheduleClick, true); });
  var finder = setInterval(function(){ if(findButton()) { clearInterval(finder); } }, 250);
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

        # Server-side fallback for debounced mode: if enough time has elapsed
        # since the last change, treat it as ready to update even if the
        # client-side click didn't occur.
        if preview_mode == "debounced":
            try:
                last_ts = st.session_state.get("_last_change_ts", None)
                debounce_timeout_seconds = float(st.session_state.get("debounce_timeout", 0.8))
                if last_ts is not None and (time.time() - float(last_ts)) >= debounce_timeout_seconds:
                    should_update_preview = True
            except Exception:
                # best-effort; ignore failures
                pass

    # Style function can handle scalar or vector theta; cast for type-checker
    # Accept scalar float or any array-like for theta input/return to satisfy Pylance without optional numpy typing
    ROuterFn = Callable[[Union[float, _ArrayLike], float, float, float, dict], Union[float, _ArrayLike]]
    r_outer_fn = cast(ROuterFn, STYLES[style_name][0])  # geometry comes from UI style name
    opts = dict(ui_opts)
    opts_json = json.dumps(opts, sort_keys=True)

    # Apply interactive preview scaling to keep Full Preview responsive
    preview_scale = float(st.session_state.get("preview_res_scale", 1.0))
    target_n_theta = max(16, int(n_theta * preview_detail * preview_scale))
    target_n_z = max(8, int(n_z * preview_detail * preview_scale))
    preview_n_theta = max(16, min(168, target_n_theta))
    preview_n_z     = max(8,  min(168, target_n_z))
    full_n_theta = max(16, min(1024, target_n_theta))
    full_n_z     = max(8,  min(1024, target_n_z))

    # Initialize preview cache & stale flag so manual mode can keep showing
    # the last generated preview until the user explicitly updates it.
    # Keep separate caches for surface (fast) and mesh (exact) previews
    st.session_state.setdefault("_last_surface_png", None)
    st.session_state.setdefault("_last_surface_fig_json", None)
    st.session_state.setdefault("_last_mesh_png", None)
    st.session_state.setdefault("_last_mesh_fig_json", None)
    st.session_state.setdefault("_preview_stale", False)

    # Early placeholders so we can render the cached preview when needed.
    preview_placeholder = st.empty()
    mesh_placeholder = st.empty()

    # Predeclare values so type checker knows they exist regardless of branches
    X = Y = Z = None  # type: ignore[assignment]
    mesh_data = None

    # Only generate preview when allowed (auto mode or Update clicked).
    # In manual mode we must NOT recalculate or render previews automatically.
    preview_exists = False
    if should_update_preview:
        t0_total = time.time()
        # Initialize to satisfy type checkers in all code paths
        t0_arrays = 0.0
        t1_arrays = 0.0
        X = Y = Z = None  # type: ignore[assignment]
        mesh_data = None
        try:
            with st.spinner("Computing preview…"):
                t0_arrays = time.time()
                X, Y, Z = make_preview_arrays(
                    H, Rt, Rb, expn,
                    preview_n_theta, preview_n_z,
                    style_name, opts_json,
                )
                t1_arrays = time.time()
                # Build mesh once (preview resolution) if Full Preview enabled
                if interactive_mesh:
                    try:
                        t0_mb = time.time()
                        import numpy as _np_mb
                        verts, faces, _ = build_pot_mesh(
                            H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
                            expn=expn, n_theta=full_n_theta, n_z=full_n_z,
                            r_outer_fn=r_outer_fn, style_opts=opts,
                        )
                        Vb = _np_mb.asarray(verts); Fb = _np_mb.asarray(faces)
                        if place_on_ground and len(Vb):
                            Vb[:, 2] -= Vb[:, 2].min()
                        mesh_data = (Vb, Fb)
                        t1_mb = time.time()
                        try:
                            perf = st.session_state.setdefault("_perf_logs", [])
                            perf.append(f"mesh_build:{(t1_mb - t0_mb)*1000:.1f}ms")
                            st.session_state["_perf_logs"] = perf[-40:]
                        except Exception:
                            pass
                    except Exception as _e_mb:
                        st.session_state.setdefault("_debug_logs", []).append(f"Mesh build failed (preview): {_e_mb}")
                # In auto mode we consider the new preview current, so clear stale flag
                if preview_mode == "auto":
                    st.session_state["_preview_stale"] = False
                preview_exists = True
        except Exception as e:
            preview_exists = False
            st.error(f"Preview generation failed: {e}")
        finally:
            try:
                perf = st.session_state.setdefault("_perf_logs", [])
                if preview_exists:
                    perf.append(f"arrays:{(t1_arrays - t0_arrays)*1000:.1f}ms total_so_far:{(time.time()-t0_total)*1000:.1f}ms")
                else:
                    perf.append("arrays:ERROR")
                st.session_state["_perf_logs"] = perf[-40:]
            except Exception:
                pass

    # If we're NOT updating (manual mode and Update not clicked), show the
    # previously cached preview so the UI remains usable. Only display the
    # 'out-of-date' warning in explicit manual mode when the stale flag is set.
    if not should_update_preview:
        last_mesh_png = st.session_state.get("_last_mesh_png")
        last_mesh_json = st.session_state.get("_last_mesh_fig_json")
        last_surf_png = st.session_state.get("_last_surface_png")
        last_surf_json = st.session_state.get("_last_surface_fig_json")

        stale = bool(st.session_state.get("_preview_stale", False))
        show_warning = (preview_mode == "manual") and stale
        # Surface (quick) preview cached display
        if interactive_3d and HAS_PLOTLY and last_surf_json:
            try:
                f_s = go.Figure(last_surf_json)
                preview_placeholder.plotly_chart(f_s, use_container_width=True, config={'displaylogo': False})
            except Exception:
                if last_surf_png:
                    preview_placeholder.image(last_surf_png, caption=("Quick Preview (out of date)" if show_warning else "Quick Preview"), width='stretch')
        elif interactive_3d and last_surf_png:
            preview_placeholder.image(last_surf_png, caption=("Quick Preview (out of date)" if show_warning else "Quick Preview"), width='stretch')

        # Mesh (full) preview cached display
        if interactive_mesh and HAS_PLOTLY and last_mesh_json:
            try:
                f_m = go.Figure(last_mesh_json)
                mesh_placeholder.plotly_chart(f_m, use_container_width=True, config={'displaylogo': False})
            except Exception:
                if last_mesh_png:
                    mesh_placeholder.image(last_mesh_png, caption=("Full Preview (out of date)" if show_warning else "Full Preview"), width='stretch')
        elif interactive_mesh and last_mesh_png:
            mesh_placeholder.image(last_mesh_png, caption=("Full Preview (out of date)" if show_warning else "Full Preview"), width='stretch')

        if show_warning:
            st.warning("Preview is out of date — click '🔄 Update Preview' to regenerate with current parameters.")
        elif preview_mode == "manual" and not (last_surf_png or last_surf_json or last_mesh_png or last_mesh_json):
            st.info("👆 Click 'Update Preview' to generate preview with current parameters (manual mode)")

    # Only proceed with preview rendering if we have data
    if preview_exists and (X is not None) and (Y is not None) and (Z is not None):
        if place_on_ground:
            Z = Z - Z.min()

        # Interactive Surface (fast) or Static PNG fallback
        png_bytes = None
        # Aggressively clean session_state media entries before creating placeholders
        try:
            _cleanup_stale_media_ids()
        except Exception:
            pass
        # Ensure previous preview content is removed when Quick Preview disabled
        if interactive_3d:
            use_interactive = HAS_PLOTLY and st.session_state.get("quick_engine", "interactive") == "interactive"
            if use_interactive:
                t0_surface = time.time()
                # Build a simplified mesh from the preview arrays for consistent lighting with Full Preview
                try:
                    import numpy as _np_mesh
                    # Check if we can reuse cached mesh topology (faces don't change if grid size is same)
                    nz, nt = X.shape
                    cache_key = f"qp_topo_{nz}_{nt}"
                    if cache_key in st.session_state:
                        F_quick = st.session_state[cache_key]
                    else:
                        # Build triangle faces using vectorized indexing (only once per grid size)
                        i_idx = _np_mesh.arange(nz - 1).repeat(nt)
                        j_idx = _np_mesh.tile(_np_mesh.arange(nt), nz - 1)

                        # Vertex indices for quads
                        v0 = i_idx * nt + j_idx
                        v1 = i_idx * nt + ((j_idx + 1) % nt)  # Wrap around
                        v2 = (i_idx + 1) * nt + ((j_idx + 1) % nt)
                        v3 = (i_idx + 1) * nt + j_idx

                        # Two triangles per quad (vectorized stacking)
                        F_quick = _np_mesh.vstack([
                            _np_mesh.column_stack([v0, v1, v2]),
                            _np_mesh.column_stack([v0, v2, v3])
                        ])
                        st.session_state[cache_key] = F_quick

                    # Flatten the grid into vertices (always needed since X,Y,Z change)
                    V_quick = _np_mesh.column_stack([X.ravel(), Y.ravel(), Z.ravel()])

                    # Color by height (same as Full Preview)
                    z_norm_v = (V_quick[:, 2] - V_quick[:, 2].min()) / max(1e-6, (V_quick[:, 2].max() - V_quick[:, 2].min()))
                    try:
                        from pfui.colors import build_gradient_colors
                        preset = st.session_state.get("preview_palette", "Custom")
                        custom = [
                            st.session_state.get("preview_grad_c1", "#2850D0"),
                            st.session_state.get("preview_grad_c2", "#5FA8FF"),
                            st.session_state.get("preview_grad_c3", "#E2F3FF"),
                        ]
                        mesh_colors = build_gradient_colors(z_norm_v, preset if preset != "Custom" else None, custom)
                    except Exception:
                        mesh_colors = [[200,200,230] for _ in range(len(V_quick))]

                    fig = go.Figure(data=[
                        go.Mesh3d(
                            x=V_quick[:, 0], y=V_quick[:, 1], z=V_quick[:, 2],
                            i=F_quick[:, 0], j=F_quick[:, 1], k=F_quick[:, 2],
                            flatshading=False,
                            lighting=dict(
                                ambient=min(max(st.session_state.get("mesh_ambient", 0.35), 0.0), 1.0),
                                diffuse=min(max(st.session_state.get("mesh_diffuse", 0.95), 0.0), 1.0),
                                specular=min(max(st.session_state.get("mesh_specular", 0.25), 0.0), 1.0),
                                roughness=min(max(st.session_state.get("mesh_roughness", 0.7), 0.0), 1.0),
                                fresnel=min(max(st.session_state.get("mesh_fresnel", 0.2), 0.0), 1.0),
                            ),
                            vertexcolor=mesh_colors,
                            hoverinfo="skip",
                            name="preview",
                            opacity=1.0,
                        )
                    ])
                except Exception as e:
                    # Fallback to Surface if mesh generation fails
                    st.warning(f"Quick Preview mesh generation failed, using surface: {e}")
                    try:
                        import numpy as _np_qc
                        zmin = float(_np_qc.min(Z)); zmax = float(_np_qc.max(Z));
                        zspan = max(1e-6, zmax - zmin)
                        z_norm = (Z - zmin) / zspan
                    except Exception:
                        z_norm = Z
                    def _hex_to_rgb_str(hx: str) -> str:
                        hx = hx.lstrip('#')
                        if len(hx) == 3:
                            hx = ''.join([c*2 for c in hx])
                        r = int(hx[0:2], 16); g = int(hx[2:4], 16); b = int(hx[4:6], 16)
                        return f"rgb({r},{g},{b})"
                    c1 = st.session_state.get("preview_grad_c1", "#2850D0")
                    c2 = st.session_state.get("preview_grad_c2", "#5FA8FF")
                    c3 = st.session_state.get("preview_grad_c3", "#E2F3FF")
                    colorscale = [
                        [0.0, _hex_to_rgb_str(c1)],
                        [0.5, _hex_to_rgb_str(c2)],
                        [1.0, _hex_to_rgb_str(c3)],
                    ]
                    fig = go.Figure(data=[
                        go.Surface(
                            x=X, y=Y, z=Z,
                            surfacecolor=z_norm,
                            colorscale=colorscale,
                            showscale=False,
                            lighting=dict(
                                ambient=0.5,
                                diffuse=1.0,
                                specular=0.5,
                                roughness=0.3,
                                fresnel=0.4,
                            ),
                        )
                    ])
                height_px = max(360, min(900, int(96 * fig_h)))
                # Compute symmetric XY extents and capped Z aspect to avoid elongation
                try:
                    import numpy as _np_plot
                    rmax = float(_np_plot.max(_np_plot.sqrt(X**2 + Y**2)))
                except Exception:
                    rmax = max(1.0, float(st.session_state.get("top_od", 140.0)) * 0.5)
                try:
                    zmin = float(Z.min()); zmax = float(Z.max())
                except Exception:
                    zmin, zmax = 0.0, float(st.session_state.get("H", 120.0))
                if place_on_ground:
                    zmin = 0.0
                xlim = [-rmax, rmax]
                ylim = [-rmax, rmax]
                zlim = [zmin, zmax]
                z_ratio = (zmax - zmin) / max(1e-6, (xlim[1] - xlim[0]))
                fig.update_layout(
                    height=height_px,
                    scene=dict(
                        xaxis=dict(visible=False, range=xlim),
                        yaxis=dict(visible=False, range=ylim),
                        zaxis=dict(visible=False, range=zlim),
                        aspectmode="manual",
                        aspectratio=dict(x=1, y=1, z=min(0.85, z_ratio)),
                        camera=dict(up=dict(x=0, y=0, z=1), projection=dict(type='orthographic')),
                        bgcolor=st.session_state.get("preview_bg_color", "#0F1724"),
                    ),
                    margin=dict(l=0, r=0, t=30, b=0),
                )
                preview_placeholder.plotly_chart(fig, use_container_width=True, config={'displaylogo': False})
                if interactive_mesh:
                    try:
                        mesh_placeholder.info("Rendering full preview…")
                    except Exception:
                        pass
                t1_surface = time.time()
                try:
                    perf = st.session_state.setdefault("_perf_logs", [])
                    perf.append(f"surface_plotly:{(t1_surface - t0_surface)*1000:.1f}ms")
                    st.session_state["_perf_logs"] = perf[-40:]
                except Exception:
                    pass
                # Persist the last interactive figure and a static PNG so
                # manual mode can continue showing the preview until the
                # user clicks Update.
                try:
                    st.session_state.setdefault("_last_surface_fig_json", None)
                    st.session_state.setdefault("_last_surface_png", None)
                    try:
                        st.session_state["_last_surface_fig_json"] = fig.to_dict()
                    except Exception:
                        pass
                    # Only capture heavy PNG from Plotly figure in manual mode to avoid slowdown
                    if preview_mode == "manual":
                        try:
                            if hasattr(fig, "to_image"):
                                w = max(400, min(900, int(96 * fig_h)))
                                h = max(300, min(800, int(96 * fig_h)))
                                png_from_fig = fig.to_image(format="png", width=w, height=h)
                                if png_from_fig:
                                    st.session_state["_last_surface_png"] = png_from_fig
                                    st.session_state["_preview_stale"] = False
                        except Exception:
                            # non-fatal: skip storing PNG
                            pass
                except Exception:
                    pass
            else:
                # Static engine (Matplotlib) or Plotly unavailable: render a fast PNG
                try:
                    st.cache_data.clear()
                except Exception:
                    pass
                ak = "|".join(str(st.session_state.get(k, "")) for k in (
                    "preview_palette", "preview_grad_c1", "preview_grad_c2", "preview_grad_c3",
                    "mesh_ambient", "mesh_diffuse", "mesh_specular", "mesh_roughness", "mesh_fresnel",
                ))
                png_bytes = render_preview_png_cached(
                    H, Rt, Rb, expn,
                    preview_n_theta, preview_n_z,
                    style_name, opts_json,
                    fig_w, fig_h, dpi,
                    inner_wall=t_wall if show_inner else None,
                    view_elev=view_elev, view_azim=view_azim, return_png=False,
                    appearance_key=ak,
                )
                if png_bytes:
                    preview_placeholder.image(png_bytes, caption="Preview", width='stretch')
                    if interactive_mesh:
                        try:
                            mesh_placeholder.info("Rendering full preview…")
                        except Exception:
                            pass
                    preview_placeholder.download_button(
                        "Download preview PNG",
                        data=png_bytes,
                        file_name=f"{name}_preview.png",
                        mime="image/png",
                    )
        else:
            # Quick Preview is explicitly disabled by user: replace any previous preview
            try:
                preview_placeholder.info("Quick Preview is disabled")
            except Exception:
                try:
                    preview_placeholder.empty()
                except Exception:
                    pass

        # Ensure png_bytes is generated even if Quick Preview is disabled
        try:
            # If user requested the exact mesh preview, prefer rendering the
            # full triangulated mesh (more accurate) and store that PNG as
            # the last preview. Otherwise use the faster surface preview.
            if interactive_mesh:
                # Decide whether to regenerate heavy mesh PNG.
                # Geometry hash: factors that alter vertex positions / topology.
                geom_factors = [H, Rt, Rb, t_wall, t_bottom, r_drain, expn, full_n_theta, full_n_z, place_on_ground, style_name]
                # Include style options that might affect outer radius profile.
                try:
                    for _k, _v in sorted(opts.items()):
                        geom_factors.append((_k, _v))
                except Exception:
                    pass
                import hashlib
                import pickle
                try:
                    geom_hash = hashlib.sha1(pickle.dumps(geom_factors)).hexdigest()
                except Exception:
                    geom_hash = None
                # Appearance hash (colors / lighting only) – changes here do **not** require new mesh PNG.
                appearance_factors = [
                    st.session_state.get("preview_palette"),
                    st.session_state.get("preview_grad_c1"),
                    st.session_state.get("preview_grad_c2"),
                    st.session_state.get("preview_grad_c3"),
                    st.session_state.get("mesh_ambient"),
                    st.session_state.get("mesh_diffuse"),
                    st.session_state.get("mesh_specular"),
                    st.session_state.get("mesh_roughness"),
                    st.session_state.get("mesh_fresnel"),
                ]
                try:
                    appearance_hash = hashlib.sha1(pickle.dumps(appearance_factors)).hexdigest()
                except Exception:
                    appearance_hash = None

                ss = st.session_state
                prev_geom_hash = ss.get("_last_mesh_geom_hash")
                prev_app_hash  = ss.get("_last_mesh_appearance_hash")
                force_capture = ss.get("_force_mesh_png_capture", False)

                regenerate_mesh_png = bool(force_capture)

                # Clear capture flag
                if force_capture:
                    ss["_force_mesh_png_capture"] = False

                t0_meshpng = time.time()
                if regenerate_mesh_png:
                    try:
                        from pfui.preview import render_mesh_snapshot_cached
                        ak = "|".join(str(st.session_state.get(k, "")) for k in (
                            "preview_palette", "preview_grad_c1", "preview_grad_c2", "preview_grad_c3",
                            "mesh_ambient", "mesh_diffuse", "mesh_specular", "mesh_roughness", "mesh_fresnel",
                        ))
                        png_bytes = render_mesh_snapshot_cached(
                            H, Rt, Rb, expn,
                            full_n_theta, full_n_z,  # full preview resolution with cap
                            style_name, opts_json,
                            fig_w, fig_h, dpi,
                            inner_wall=t_wall if show_inner else None,
                            place_on_ground=place_on_ground,
                            view_elev=view_elev, view_azim=view_azim, appearance_key=ak,
                        )
                        ss["_last_mesh_geom_hash"] = geom_hash
                        ss["_last_mesh_appearance_hash"] = appearance_hash
                    except Exception:
                        ak = "|".join(str(st.session_state.get(k, "")) for k in (
                            "preview_palette", "preview_grad_c1", "preview_grad_c2", "preview_grad_c3",
                            "mesh_ambient", "mesh_diffuse", "mesh_specular", "mesh_roughness", "mesh_fresnel",
                        ))
                        png_bytes = render_preview_png_cached(
                            H, Rt, Rb, expn,
                            full_n_theta, full_n_z,
                            style_name, opts_json,
                            fig_w, fig_h, dpi,
                            inner_wall=t_wall if show_inner else None,
                            view_elev=view_elev, view_azim=view_azim,
                            return_png=True, appearance_key=ak,
                        )
                        ss["_last_mesh_geom_hash"] = geom_hash
                        ss["_last_mesh_appearance_hash"] = appearance_hash
                else:
                    # Skip heavy regeneration – keep previous mesh PNG (png_bytes stays None here)
                    png_bytes = None
                # Timing log (not a try/finally scope anymore)
                try:
                    perf = st.session_state.setdefault("_perf_logs", [])
                    elapsed_ms = (time.time()-t0_meshpng)*1000
                    perf.append(f"mesh_png:{elapsed_ms:.1f}ms regen={regenerate_mesh_png}")
                    st.session_state["_last_mesh_png_regenerated"] = regenerate_mesh_png
                    st.session_state["_last_mesh_png_time_ms"] = elapsed_ms
                    st.session_state["_perf_logs"] = perf[-40:]
                except Exception:
                    pass
            else:
                ak = "|".join(str(st.session_state.get(k, "")) for k in (
                    "preview_palette", "preview_grad_c1", "preview_grad_c2", "preview_grad_c3",
                    "mesh_ambient", "mesh_diffuse", "mesh_specular", "mesh_roughness", "mesh_fresnel",
                ))
                png_bytes = render_preview_png_cached(
                    H, Rt, Rb, expn,
                    preview_n_theta, preview_n_z,
                    style_name, opts_json,
                    fig_w, fig_h, dpi,
                    inner_wall=t_wall if show_inner else None,
                    view_elev=view_elev, view_azim=view_azim,
                    return_png=True, appearance_key=ak,
                )
        except Exception:
            pass  # png_bytes generation for snapshots failed, but preview may still work

        # Cache the freshly rendered PNG so manual mode can continue showing
        # the last preview until the user updates again.
        try:
            if png_bytes:
                # we stored png_bytes after choosing mesh vs surface above
                # but if interactive_mesh was false this is from surface
                if interactive_mesh:
                    st.session_state["_last_mesh_png"] = png_bytes
                else:
                    st.session_state["_last_surface_png"] = png_bytes
                st.session_state["_preview_stale"] = False
        except Exception:
            pass

        # Optional: exact triangle mesh preview (exact mesh)
        if interactive_mesh:
            # If Plotly is present, render an interactive Mesh3d. Otherwise render a
            # static high-detail PNG so Full Preview can be displayed even when the
            # Quick Preview (interactive_3d) is disabled or Plotly is not installed.
            if HAS_PLOTLY:
                try:
                    t0_mesh = time.time()
                    import numpy as np
                    from typing import List
                    from pfui.colors import build_gradient_colors


                    # Reuse earlier mesh build; if missing (e.g., switched modes) build now
                    if 'mesh_data' in locals() and mesh_data is not None:
                        V, F = mesh_data
                    else:
                        try:
                            import numpy as _np_r
                            verts2, faces2, _ = build_pot_mesh(
                                H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
                                expn=expn, n_theta=full_n_theta, n_z=full_n_z,
                                r_outer_fn=r_outer_fn, style_opts=opts,
                            )
                            V = _np_r.asarray(verts2); F = _np_r.asarray(faces2)
                            if place_on_ground and len(V):
                                V[:, 2] -= V[:, 2].min()
                        except Exception:
                            V = np.zeros((0,3)); F = np.zeros((0,3), dtype=int)
                    # Gradient coloring using user settings
                    if len(V):
                        span_z = float(np.ptp(V[:, 2])) if len(V) else 0.0
                        z_norm = (V[:, 2] - V[:, 2].min()) / max(1e-6, span_z)
                        t0_col = time.time()
                        try:
                            preset = st.session_state.get("preview_palette", "Custom")
                            custom = [
                                st.session_state.get("preview_grad_c1", "#2850D0"),
                                st.session_state.get("preview_grad_c2", "#5FA8FF"),
                                st.session_state.get("preview_grad_c3", "#E2F3FF"),
                            ]
                            mesh_colors = build_gradient_colors(z_norm, preset if preset != "Custom" else None, custom)
                        except Exception:
                            mesh_colors = [[200,200,230] for _ in range(len(V))]
                        finally:
                            try:
                                perf = st.session_state.setdefault("_perf_logs", [])
                                perf.append(f"color_map:{(time.time()-t0_col)*1000:.1f}ms")
                                st.session_state["_perf_logs"] = perf[-40:]
                            except Exception:
                                pass
                    else:
                        mesh_colors = []
                    fig = go.Figure(data=[
                        go.Mesh3d(
                            x=V[:, 0], y=V[:, 1], z=V[:, 2],
                            i=F[:, 0], j=F[:, 1], k=F[:, 2],
                            flatshading=False,
                            lighting=dict(
                                ambient=min(max(st.session_state.get("mesh_ambient", 0.35), 0.0), 1.0),
                                diffuse=min(max(st.session_state.get("mesh_diffuse", 0.95), 0.0), 1.0),
                                specular=min(max(st.session_state.get("mesh_specular", 0.25), 0.0), 1.0),
                                roughness=min(max(st.session_state.get("mesh_roughness", 0.7), 0.0), 1.0),
                                fresnel=min(max(st.session_state.get("mesh_fresnel", 0.2), 0.0), 1.0),
                            ),
                            vertexcolor=mesh_colors,
                            hoverinfo="skip",
                            name="mesh",
                            opacity=1.0,
                        )
                    ])
                    height_px = max(400, min(1000, int(110 * fig_h)))
                    # Symmetric XY extents and ortho projection to avoid elongation
                    try:
                        rmax = float(max(abs(V[:, 0]).max(), abs(V[:, 1]).max()))
                        zmin = float(V[:, 2].min()); zmax = float(V[:, 2].max())
                    except Exception:
                        rmax = max(1.0, float(st.session_state.get("top_od", 140.0)) * 0.5)
                        zmin, zmax = 0.0, float(st.session_state.get("H", 120.0))
                    xlim = [-rmax, rmax]
                    ylim = [-rmax, rmax]
                    zlim = [zmin, zmax]
                    z_ratio = (zmax - zmin) / max(1e-6, (xlim[1] - xlim[0]))
                    fig.update_layout(
                        height=height_px,
                        scene=dict(
                            xaxis=dict(visible=False, range=xlim),
                            yaxis=dict(visible=False, range=ylim),
                            zaxis=dict(visible=False, range=zlim),
                            aspectmode="manual",
                            aspectratio=dict(x=1, y=1, z=min(0.85, z_ratio)),
                            camera=dict(up=dict(x=0, y=0, z=1), projection=dict(type='orthographic')),
                            bgcolor=st.session_state.get("preview_bg_color", "#0E1117"),
                        ),
                        margin=dict(l=0, r=0, t=30, b=0),
                    )
                    try:
                        preview_placeholder.empty()
                    except Exception:
                        pass
                    mesh_placeholder.plotly_chart(fig, use_container_width=True, config={'displaylogo': False})
                    t1_mesh = time.time()
                    try:
                        perf = st.session_state.setdefault("_perf_logs", [])
                        perf.append(f"mesh_plotly:{(t1_mesh - t0_mesh)*1000:.1f}ms")
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
                    mesh_placeholder.info(f"Mesh preview unavailable (static fallback): {e}")
        else:
            # Full Preview disabled: replace previous mesh with a small note
            try:
                mesh_placeholder.info("Full Preview is disabled")
            except Exception:
                try:
                    mesh_placeholder.empty()
                except Exception:
                    pass

    # -------------------- METRICS ----------------------
    st.subheader("Estimated metrics")
    try:
        _, faces_m, diag_m = build_pot_mesh(
            H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
            expn=expn, n_theta=max(48, n_theta // 2), n_z=max(24, n_z // 2),
            r_outer_fn=r_outer_fn, style_opts=opts,
        )
        m1, m2, m3 = st.columns(3)
        m1.metric("Triangles", f"{len(faces_m):,}")
        m2.metric("Top OD (mm)", f"{diag_m.get('estimated_top_od_mm', 0):.1f}")
        m3.metric("Bottom OD (mm)", f"{diag_m.get('estimated_bottom_od_mm', 0):.1f}")
    except Exception:
        st.info("Metrics unavailable for this configuration.")

    # -------------------- APPEARANCE / PREVIEW SETTINGS --------------------
    with st.expander("Appearance & Preview Settings"):
        # Initialize session defaults only once
        ss = st.session_state
        if "preview_color_mode" not in ss:
            ss.preview_color_mode = "gradient-3"
        if "preview_grad_c1" not in ss:
            ss.preview_grad_c1 = "#2850D0"  # deep blue
        if "preview_grad_c2" not in ss:
            ss.preview_grad_c2 = "#5FA8FF"  # mid blue
        if "preview_grad_c3" not in ss:
            ss.preview_grad_c3 = "#E2F3FF"  # light tint
        if "preview_palette" not in ss:
            ss.preview_palette = "Custom"
        if "mesh_ambient" not in ss:
            ss.mesh_ambient = 0.50
        if "mesh_diffuse" not in ss:
            ss.mesh_diffuse = 1.00
        if "mesh_specular" not in ss:
            ss.mesh_specular = 0.40
        if "mesh_roughness" not in ss:
            ss.mesh_roughness = 0.45
        if "mesh_fresnel" not in ss:
            ss.mesh_fresnel = 0.25
        if "preview_bg_color" not in ss:
            # Slightly brighter blue-gray background that's still dark but more contrasty
            ss.preview_bg_color = "#0F1724"
        # Make Warm Sunset the default initial palette for a more exciting start
        if "preview_palette" not in ss:
            ss.preview_palette = "Warm Sunset"
        if "preview_grad_c1" not in ss:
            ss.preview_grad_c1 = "#FF6E40"
        if "preview_grad_c2" not in ss:
            ss.preview_grad_c2 = "#FFA65A"
        if "preview_grad_c3" not in ss:
            ss.preview_grad_c3 = "#FFEBA0"

        st.markdown("**Color Mapping**")
        palette = st.selectbox(
            "Palette preset",
            ["Custom", "Classic Blue", "Warm Sunset", "Forest", "Mono Height"],
            key="preview_palette",
            help="Choose a predefined palette or 'Custom' to edit colors manually.")

        colc1, colc2, colc3 = st.columns(3)
        with colc1:
            c1 = st.color_picker("Gradient start", key="preview_grad_c1")
        with colc2:
            c2 = st.color_picker("Mid / secondary", key="preview_grad_c2")
        with colc3:
            c3 = st.color_picker("Gradient end", key="preview_grad_c3")

        st.markdown("**Mesh Lighting**")
        lc1, lc2, lc3, lc4, lc5 = st.columns(5)
        with lc1:
            ambient_val = st.slider("Ambient", 0.0, 1.0, ss.mesh_ambient, 0.01, key="mesh_ambient")
        with lc2:
            diffuse_val = st.slider("Diffuse", 0.0, 1.0, min(max(ss.mesh_diffuse,0.0),1.0), 0.01, key="mesh_diffuse")
        with lc3:
            specular_val = st.slider("Specular", 0.0, 1.0, ss.mesh_specular, 0.01, key="mesh_specular")
        with lc4:
            roughness_val = st.slider("Roughness", 0.0, 1.0, ss.mesh_roughness, 0.01, key="mesh_roughness")
        with lc5:
            fresnel_val = st.slider("Fresnel", 0.0, 1.0, ss.mesh_fresnel, 0.01, key="mesh_fresnel")

        # Values already stored in st.session_state by Streamlit (via keys). We keep
        # local variables if later logic wants to detect changes without re-reading.

        st.markdown("**Background**")
        preview_bg_val = st.color_picker("Preview background", key="preview_bg_color")

        st.markdown("**Resolution & Quality**")
        if "preview_res_scale" not in ss:
            ss.preview_res_scale = 1.0
        if "manual_full_res" not in ss:
            ss.manual_full_res = True
        if "preview_dpi" not in ss:
            ss.preview_dpi = 110
        rc1, rc2, rc3 = st.columns(3)
        with rc1:
            preview_res_scale_val = st.slider("Preview resolution scale", 0.2, 1.0, ss.preview_res_scale, 0.05,
                                              key="preview_res_scale",
                                              help="Multiplier applied to n_theta/n_z for interactive previews to improve speed.")
        with rc2:
            manual_full_res_val = st.checkbox("Manual mode full res", value=ss.manual_full_res, key="manual_full_res",
                                              help="In manual mode, use full base resolution when generating mesh PNG.")
        with rc3:
            preview_dpi_val = st.slider("PNG dpi", 80, 220, ss.preview_dpi, 5, key="preview_dpi", help="Higher DPI for crisper static PNG snapshots.")

        st.caption("Settings are applied immediately to new renders. Existing previews update on next recalculation / Update click (manual mode).")

    # -------------------- SNAPSHOTS --------------------
    with st.expander("Snapshots (compare)"):
        # Record current snapshots count for debugging (helps trace clears)
        st.session_state.setdefault("_debug_logs", []).append(
            f"Render: _snaps count = {len(st.session_state.get('_snaps', []))}"
        )
        snaps: List[Dict[str, Any]] = st.session_state.get("_snaps", [])

        # Add Clear All Snapshots button
        if snaps:
            col_clear1, col_clear2 = st.columns([3, 1])
            with col_clear2:
                if st.button("🗑️ Clear All", help="Delete all snapshots"):
                    st.session_state["_snaps"] = []
                    snaps = []
                    cleanup_old_tempfiles()  # Clean up temp files
                    st.rerun()

        sc1, sc2 = st.columns([2, 1])
        snap_name = sc1.text_input("Snapshot name", value=f"{style_name}_H{int(H)}")
        if sc2.button("Capture"):
            # Initialize debug logs in session state if not already present
            if "_debug_logs" not in st.session_state:
                st.session_state["_debug_logs"] = []

            def log_debug(message: str):
                st.session_state["_debug_logs"].append(message)

            try:
                # Delegate snapshot rendering to central cached function which
                # builds the actual triangulated mesh and tries Plotly first.
                opts_json = json.dumps(dict(ui_opts))
                capture_bytes = render_mesh_snapshot_cached(
                    H, Rt, Rb, expn,
                    n_theta, n_z,
                    style_name, opts_json,
                    fig_w, fig_h, dpi,
                    inner_wall=t_wall if show_inner else None,
                    place_on_ground=place_on_ground,
                    view_elev=view_elev, view_azim=view_azim,
                    theme=("dark" if st.get_option("theme.base") == "dark" else "light"),
                )

                if capture_bytes:
                    png_path = save_png_temp(capture_bytes)
                    method = st.session_state.get("_last_snapshot_method", "unknown")
                    st.success(f"✓ Snapshot '{snap_name}' captured successfully! (method: {method})")
                    st.session_state.setdefault("_debug_logs", []).append(f"Snapshot capture used method: {method}")
                else:
                    png_path = None
                    st.error("Failed to generate snapshot image. Ensure Full Preview is enabled and try again.")
            except Exception as e:
                st.error(f"Snapshot capture failed: {e}")
                png_path = None

            log_debug("Updating session state with new snapshot (direct write).")
            new_snaps = snaps + [{
                "name": snap_name,
                "png": png_path,
                "style_ui": style_name,     # store UI & key
                "style_key": style_key,
                "params": {
                    "H": H, "top_od": top_od, "bottom_od": bottom_od, "t_wall": t_wall,
                    "t_bottom": t_bottom, "r_drain": r_drain, "expn": expn, "opts": dict(ui_opts),
                },
            }]
            # Write directly so the UI reflects the new snapshot without a
            # forced rerun. Keep only the last 6 snapshots.
            st.session_state["_snaps"] = new_snaps[-6:]
            log_debug("Session state updated (direct write).")
            # Re-read into local variable so the current run will render the
            # newly added snapshot immediately (avoids needing st.rerun()).
            snaps = st.session_state.get("_snaps", [])

            # checkpoint the UI state when capturing snapshots
            try:
                Hist.checkpoint(style_name)
            except Exception:
                pass

        # Display debug logs in a text area
        if "_debug_logs" not in st.session_state:
            st.session_state["_debug_logs"] = []
        # Mask any potential secrets before showing debug logs in UI
        masked_logs = [_mask_possible_secrets(log_entry) for log_entry in st.session_state.get("_debug_logs", [])]
        st.text_area("Debug Logs", value="\n".join(masked_logs), height=300)

        # Re-read snaps to ensure we display the latest list (capture may
        # have mutated st.session_state earlier in this run).
        snaps = st.session_state.get("_snaps", [])

        # Paginate snapshots (3 per page)
        if snaps:
            per_page = 3
            page = st.session_state.get("_snap_page", 0)
            max_page = max(0, math.ceil(len(snaps) / per_page) - 1)
            nav_col1, nav_col2, nav_col3 = st.columns([1, 1, 6])
            if nav_col1.button("◀ Prev"):
                st.session_state["_snap_page"] = max(0, page - 1); st.rerun()
            if nav_col2.button("Next ▶"):
                st.session_state["_snap_page"] = min(max_page, page + 1); st.rerun()
            nav_col3.caption(f"Showing page {page+1} / {max_page+1}  — total snapshots: {len(snaps)}")

            start = page * per_page
            end = start + per_page
            for idx, s in enumerate(snaps[start:end], start=start):
                i = idx
                cc1, cc2, cc3 = st.columns([2, 1, 1])
                # show a small preview image if available
                png_bytes_local = None
                try:
                    png_bytes_local = read_png_bytes(s.get("png"))
                except Exception:
                    png_bytes_local = None
                if png_bytes_local:
                    cc1.image(png_bytes_local, caption=f"{i+1}. {s['name']}", width='stretch')
                else:
                    cc1.write(f"**{i+1}. {s['name']}**")
                if cc2.button("Apply", key=f"apply_{i}"):
                    pending = {
                        "H": s["params"]["H"],
                        "top_od": s["params"]["top_od"],
                        "bottom_od": s["params"]["bottom_od"],
                        "t_wall": s["params"]["t_wall"],
                        "t_bottom": s["params"]["t_bottom"],
                        "r_drain": s["params"]["r_drain"],
                        "expn": s["params"]["expn"],
                        "style": s.get("style_ui", style_name),  # update visible selectbox
                    }
                    sk = s.get("style_key", resolve_schema_key(s.get("style_ui", style_name)))
                    for k, v in s["params"]["opts"].items():
                        pending[widget_key(sk, k)] = v
                    try:
                        queue_update(pending)
                        st.session_state.setdefault("_debug_logs", []).append(f"Queued snapshot {i+1} for apply; rerunning.")
                        st.rerun()
                    except Exception:
                        st.session_state.setdefault("_debug_logs", []).append(f"Failed to queue_update snapshot {i+1}; falling back to direct write.")
                        for _k, _v in pending.items():
                            try:
                                st.session_state[_k] = _v
                            except Exception:
                                pass
                if cc3.button("Delete", key=f"del_{i}"):
                    # Remove temp file if present and looks safe
                    try:
                        remove_png_path(s.get("png"))
                    except Exception:
                        pass
                    new_snaps = snaps[:i] + snaps[i+1:]
                    st.session_state["_snaps"] = new_snaps
                    st.session_state.setdefault("_debug_logs", []).append(f"Deleted snapshot {i+1}.")

    # ---------------------- EXPORT ---------------------
    st.subheader("Export STL")

    # Library publish controls (if configured)
    publish_enabled = False
    publish_title = ""
    publish_tags = []
    publish_license = "CC BY-NC 4.0"
    license_consent = False

    if _has_library and not _library_read_only:
        with st.expander("📚 Publish to Public Library", expanded=False):
            st.markdown("Share your design with the community. Published designs are public and downloadable by anyone.")

            publish_enabled = st.checkbox("Enable publishing", value=False, key="publish_enable")

            if publish_enabled:
                # Default title from design name
                default_title = f"{style_name} pot - {datetime.now().strftime('%Y-%m-%d')}"
                publish_title = st.text_input(
                    "Title *",
                    value=default_title,
                    max_chars=120,
                    help="Short descriptive title (1-120 characters)"
                )

                publish_tags_input = st.text_input(
                    "Tags",
                    value="",
                    help="Comma-separated tags (max 10, alphanumeric + dash/underscore only)"
                )
                publish_tags = [t.strip() for t in publish_tags_input.split(",") if t.strip()]

                publish_license = st.selectbox(
                    "License *",
                    options=[
                        "CC BY-NC 4.0",
                        "CC BY 4.0",
                        "CC BY-SA 4.0",
                        "CC0 1.0",
                        "MIT",
                        "Apache 2.0",
                    ],
                    index=0,
                    help="License for your design. CC BY-NC 4.0 = Attribution, Non-Commercial"
                )

                license_consent = st.checkbox(
                    f"I grant permission to publish this design under {publish_license}",
                    value=False,
                    help="Required: You must agree to publish under the selected license"
                )

                if not license_consent:
                    st.warning("⚠️ You must agree to the license terms to publish")

                # Dedicated Publish button (independent of Export)
                st.session_state["_publish_clicked"] = st.button("Publish", type="primary", disabled=not (publish_enabled and license_consent))
    elif _has_library and _library_read_only:
        with st.expander("📚 Publish to Public Library", expanded=False):
            st.info("This device is connected to the Public Library in read-only mode (anon key). Browsing works, but publishing is disabled. Provide a service_role key in `.streamlit/secrets.toml` to enable publishing.")

    # Handle explicit Publish click (without requiring Export)
    if st.session_state.get("_publish_clicked"):
        try:
            # Build mesh at export resolution (reuse upscale), else fall back to current n_theta/n_z
            up = float(st.session_state.get("_export_upscale", 1.0)) if "_export_upscale" in st.session_state else 1.0
            n_theta_pub = int(n_theta * up)
            n_z_pub = int(n_z * up)
            verts, faces, _ = build_pot_mesh(
                H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
                expn=expn, n_theta=n_theta_pub, n_z=n_z_pub,
                r_outer_fn=r_outer_fn, style_opts=opts,
            )
            safe = re.sub(r"[^A-Za-z0-9._-]+", "_", str(name or ""))[:80] or "potfoundry_model"
            tmp_path = Path(tempfile.gettempdir()) / f"_pf2_{safe}_{uuid.uuid4().hex[:8]}.stl"
            if WRITE_STL_BINARY is None:
                raise RuntimeError("write_stl_binary not available in this build")
            WRITE_STL_BINARY(str(tmp_path), safe, verts, faces)
            data = tmp_path.read_bytes()
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass

            if publish_enabled and license_consent and _has_library:
                from potfoundry.library import publish_design
                size_dict = {
                    "height": H,
                    "top_od": top_od,
                    "bottom_od": bottom_od,
                    "wall_thickness": t_wall,
                    "bottom_thickness": t_bottom,
                    "drain_radius": r_drain,
                    "flare_exp": expn,
                }
                mesh_dict = {
                    "n_theta": n_theta_pub,
                    "n_z": n_z_pub,
                    "twist": opts.get("twist", 0.0),
                }
                diagnostics_dict = {
                    "triangle_count": len(faces),
                    "vertex_count": len(verts),
                }
                try:
                    import subprocess
                    git_commit = subprocess.check_output(
                        ["git", "rev-parse", "--short", "HEAD"],
                        cwd=Path(__file__).parent,
                        stderr=subprocess.DEVNULL
                    ).decode().strip()
                except Exception:
                    git_commit = None

                with st.spinner("Publishing to library..."):
                    result = publish_design(
                        stl_bytes=data,
                        style=style_name,
                        size=size_dict,
                        opts=opts,
                        mesh=mesh_dict,
                        diagnostics=diagnostics_dict,
                        license=publish_license,
                        title=publish_title,
                        tags=publish_tags,
                        app_commit=git_commit
                    )
                if result.duplicate:
                    st.info(f"✓ Design already published (ID: {result.id[:8]}...)")
                else:
                    st.success(f"✓ Published! ID: {result.id[:8]}...")

        except Exception as e:
            st.error(f"Publish failed: {e}")

    if do_export:
        try:
            from datetime import datetime
            with st.spinner("Exporting STL…"):
                verts, faces, _ = build_pot_mesh(
                    H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
                    expn=expn, n_theta=n_theta_export, n_z=n_z_export,
                    r_outer_fn=r_outer_fn, style_opts=opts,
                )
                safe = re.sub(r"[^A-Za-z0-9._-]+", "_", str(name or ""))[:80] or "potfoundry_model"
                tmp_path = Path(tempfile.gettempdir()) / f"_pf2_{safe}_{uuid.uuid4().hex[:8]}.stl"
                if WRITE_STL_BINARY is None:
                    raise RuntimeError("write_stl_binary not available in this build")
                # Export as binary STL (recommended: smaller, faster, universally supported)
                WRITE_STL_BINARY(str(tmp_path), safe, verts, faces)
                data = tmp_path.read_bytes()
                try:
                    tmp_path.unlink(missing_ok=True)
                except Exception:
                    pass
            st.success(f"STL ready: {safe}.stl  — triangles: {len(faces):,}")
            st.download_button("Download STL", data=data, file_name=f"{safe}.stl", mime="model/stl")

            # Also offer OBJ (welded vertices + smooth/crease normals) for clean
            # Rhino / Grasshopper import. STL arrives as unwelded triangle soup;
            # OBJ keeps shared topology and outward-oriented normals.
            if WRITE_OBJ is not None:
                try:
                    obj_path = Path(tempfile.gettempdir()) / f"_pf2_{safe}_{uuid.uuid4().hex[:8]}.obj"
                    WRITE_OBJ(str(obj_path), safe, verts, faces)
                    obj_data = obj_path.read_bytes()
                    try:
                        obj_path.unlink(missing_ok=True)
                    except Exception:
                        pass
                    st.download_button(
                        "Download OBJ (Rhino/Grasshopper)",
                        data=obj_data,
                        file_name=f"{safe}.obj",
                        mime="model/obj",
                    )
                except Exception as obj_err:  # pragma: no cover - UI safety net
                    st.caption(f"OBJ export unavailable: {obj_err}")

            # Publish to library if enabled
            if publish_enabled and license_consent and _has_library:
                try:
                    from potfoundry.library import publish_design

                    # Prepare size dict
                    size_dict = {
                        "height": H,
                        "top_od": top_od,
                        "bottom_od": bottom_od,
                        "wall_thickness": t_wall,
                        "bottom_thickness": t_bottom,
                        "drain_radius": r_drain,
                        "flare_exp": expn,
                    }

                    # Prepare mesh dict
                    mesh_dict = {
                        "n_theta": n_theta_export,
                        "n_z": n_z_export,
                        "twist": opts.get("twist", 0.0),
                    }

                    # Prepare diagnostics
                    diagnostics_dict = {
                        "triangle_count": len(faces),
                        "vertex_count": len(verts),
                    }

                    # Get git commit (optional)
                    try:
                        import subprocess
                        git_commit = subprocess.check_output(
                            ["git", "rev-parse", "--short", "HEAD"],
                            cwd=Path(__file__).parent,
                            stderr=subprocess.DEVNULL
                        ).decode().strip()
                    except Exception:
                        git_commit = None

                    # Publish
                    with st.spinner("Publishing to library..."):
                        result = publish_design(
                            stl_bytes=data,
                            style=style_name,
                            size=size_dict,
                            opts=opts,
                            mesh=mesh_dict,
                            diagnostics=diagnostics_dict,
                            license=publish_license,
                            title=publish_title,
                            tags=publish_tags,
                            app_commit=git_commit
                        )

                    if result.duplicate:
                        st.info(f"✓ Design already published (ID: {result.id[:8]}...)")
                    else:
                        st.success(f"✓ Published! ID: {result.id[:8]}...")

                    # Show library link
                    from pfui.deeplink import generate_deep_link
                    state_to_encode = {
                        "style": style_name,
                        "H": H,
                        "top_od": top_od,
                        "bottom_od": bottom_od,
                        "t_wall": t_wall,
                        "t_bottom": t_bottom,
                        "r_drain": r_drain,
                        "expn": expn,
                        "opts": opts,
                    }
                    # Resolve base URL for deep links.
                    # Preference: root app_url (secrets) -> nested app_url -> APP_URL env -> localhost default.
                    base_url = st.secrets.get("app_url", None)
                    if not base_url:
                        try:
                            base_url = st.secrets.get("connections", {}).get("supabase", {}).get("app_url")
                        except Exception:
                            base_url = None
                    if not base_url:
                        import os as _os
                        base_url = _os.environ.get("APP_URL")
                    if not base_url:
                        base_url = "http://localhost:8501"
                    deep_link = generate_deep_link(state_to_encode, base_url)

                    # Mask any accidental secrets before showing the link in UI
                    def _mask_possible_secrets(text: str) -> str:
                        try:
                            # Mask exact supabase service key if available in st.secrets
                            svc_key = None
                            if 'st' in globals() and st is not None:
                                try:
                                    svc_key = st.secrets.get("connections", {}).get("supabase", {}).get("key")
                                except Exception:
                                    svc_key = None
                            if svc_key and svc_key in text:
                                text = text.replace(svc_key, "[REDACTED]")

                            # Mask JWT-like tokens (three dot-separated parts)
                            text = re.sub(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED_JWT]", text)

                            # Mask long hex hashes (e.g., 64-char sha256)
                            text = re.sub(r"[0-9a-fA-F]{48,}", "[REDACTED_HASH]", text)
                        except Exception:
                            # If masking fails, return the original text to avoid hiding useful info
                            return text
                        return text

                    safe_link = _mask_possible_secrets(deep_link)
                    # Show a compact link button and tuck the raw URL into a collapsible section
                    try:
                        st.link_button("Open shared link", url=deep_link)
                    except Exception:
                        st.markdown(f"[Open shared link]({deep_link})")

                    with st.expander("Shareable link (URL)", expanded=False):
                        st.code(safe_link, language=None)

                except Exception as e:
                    st.error(f"Publishing failed: {e}")
                    st.exception(e)

        except Exception as e:
            st.error(f"Export failed: {e}")

    # ----------------- 2D PROFILE ----------------------
    with st.expander("2D radial profile"):
        render_profile(H, Rt, Rb, expn, r_outer_fn, opts, t_wall)

    # --------------- PERFORMANCE (DEV) ----------------
    with st.expander("Performance (dev)"):
        perf_logs = st.session_state.get("_perf_logs", [])
        st.text_area("Recent timings", value="\n".join(perf_logs[-30:]), height=180)
        if st.button("Force clear caches"):
            try:
                st.cache_data.clear(); st.success("Caches cleared")
            except Exception:
                st.error("Failed to clear caches")

# ============================================================
# Tab 2 — Batch from YAML
# ============================================================

with _tab2:
    render_batch_tab()

# ============================================================
# Tab 3 — Public Library (if configured)
# ============================================================

if _tab3 is not None:
    with _tab3:
        render_library_tab()
