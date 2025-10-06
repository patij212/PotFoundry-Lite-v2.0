# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import re
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict, List

import streamlit as st
from pfui.preview import render_preview_png_cached

# --- Optional / graceful Plotly import (interactive preview) ---
try:
    import plotly.graph_objects as go
    HAS_PLOTLY = True
except Exception:
    HAS_PLOTLY = False
    go = None  # type: ignore

if not HAS_PLOTLY:
    st.info("Plotly is not available. Interactive 3D preview and mesh features are disabled.")

# --- PotFoundry UI/engine imports ---
from pfui.imports import STYLES, build_pot_mesh, WRITE_STL_BINARY
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
from pfui.preview import make_preview_arrays, render_preview, render_profile
from pfui.health import _design_health, _health_badge
from pfui.batch_tab import render_batch_tab
from pfui.units import units_selector
from pfui.snapshot_store import save_png_temp, cleanup_old_tempfiles, read_png_bytes
from pfui import state_history as H

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
        # Don't treat our internal debug log container or the snapshots
        # list as stale even if they contain filenames or paths. These are
        # intentionally persisted across runs.
        if k in ("_debug_logs", "_snaps"):
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
                H.undo()
                st.experimental_rerun()
        if c_ur2.button("Redo (Ctrl+Y)"):
                H.redo()
                st.experimental_rerun()
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

# ------------ Tabs ------------
_tab1, _tab2 = st.tabs(["Interactive", "Batch from YAML"])

# ============================================================
# Tab 1 — Interactive Designer
# ============================================================
with _tab1:
    # ------------------ SIDEBAR (all inputs) ------------------
    with st.sidebar:
        # Units at a fixed, stable location
        units_selector()

        st.header("Model")
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
            help="Preview only; STL origin is unchanged.",
        )

        st.divider()
        st.subheader("Dimensions (mm)")
        H = float(st.number_input("Height", 60.0, 240.0, st.session_state.get("H", 120.0), 5.0, key="H"))
        top_od = float(st.number_input("Top OD", 60.0, 240.0, st.session_state.get("top_od", 140.0), 5.0, key="top_od"))
        bottom_od = float(st.number_input("Bottom OD", 40.0, 200.0, st.session_state.get("bottom_od", 90.0), 5.0, key="bottom_od"))
        t_wall = float(st.number_input("Wall thickness", 2.0, 8.0, st.session_state.get("t_wall", 3.0), 0.5, key="t_wall"))
        t_bottom = float(st.number_input("Bottom slab", 2.0, 10.0, st.session_state.get("t_bottom", 3.0), 0.5, key="t_bottom"))
        r_drain = float(st.number_input("Drain hole", 3.0, 30.0, st.session_state.get("r_drain", 10.0), 1.0, key="r_drain"))

        Rt, Rb = 0.5 * top_od, 0.5 * bottom_od

        # (model_name auto-default is handled before the text_input above)

        st.subheader("Profile")
        expn = float(st.slider("Flare exponent", 0.7, 1.6, st.session_state.get("expn", 1.1), 0.05, key="expn"))
        c1, c2, c3 = st.columns(3)
        # NOTE: widget keys now use style_key (not style_name)
        k1 = widget_key(style_key, "flare_center")
        k2 = widget_key(style_key, "flare_sharp")
        k3 = widget_key(style_key, "bell_amp")
        flare_center = float(c1.slider("Flare center (0–1)", 0.1, 0.9, st.session_state.get(k1, 0.5), 0.01, key=k1))
        flare_sharp  = float(c2.slider("Flare sharpness",    1.0, 12.0, st.session_state.get(k2, 6.0), 0.1,  key=k2))
        bell_amp     = float(c3.slider("Bell amplitude",     0.0, 0.5,  st.session_state.get(k3, 0.0), 0.01, key=k3))

        c4, c5 = st.columns(2)
        k4 = widget_key(style_key, "bell_center")
        k5 = widget_key(style_key, "bell_width")
        bell_center = float(c4.slider("Bell center (0–1)", 0.1, 0.9, st.session_state.get(k4, 0.5), 0.01, key=k4))
        bell_width  = float(c5.slider("Bell width",        0.05, 0.5, st.session_state.get(k5, 0.22), 0.01, key=k5))

        st.subheader("Mesh quality")
        q1, q2 = st.columns(2)
        n_theta = int(q1.slider("Angular divisions (nθ)", 96, 720, st.session_state.get("n_theta", 168), 12, key="n_theta"))
        n_z     = int(q2.slider("Vertical divisions (nz)", 32, 256, st.session_state.get("n_z", 84), 4, key="n_z"))

        # Per-style controls (schema-safe)
        st.subheader("Style options")
        ui_opts = style_controls(style_key)
        ui_opts.update({
            "flare_center": flare_center,
            "flare_sharp":  flare_sharp,
            "bell_amp":     bell_amp,
            "bell_center":  bell_center,
            "bell_width":   bell_width,
        })

        with st.expander("Twist / Spin"):
            ui_opts.update(twist_controls(style_key))

        with st.expander("Presets"):
            # Built-in presets (look up by UI name, but write using style_key)
            pdefs = PRESETS.get(style_name, {})
            if pdefs:
                cols = st.columns(max(3, min(6, len(pdefs))))
                for i, p in enumerate(pdefs.keys()):
                    if cols[i % len(cols)].button(p, key=f"preset_{style_name}_{p}"):
                        pending = {widget_key(style_key, k): v for k, v in pdefs[p].items()}
                        queue_update(pending); st.rerun()
                st.caption("Built-in presets apply style option values.")

            # User presets
            with st.expander("User presets (save/load)"):
                pdata = _read_user_presets()
                names = [p.get("name", f"Preset {i+1}") for i, p in enumerate(pdata.get("presets", []))]
                cols = st.columns([2, 1, 1, 1])
                sel = cols[0].selectbox("User presets", options=["<none>"] + names, index=0)
                new_name = cols[1].text_input("New name", value=f"{style_name}_H{int(H)}")

                if cols[2].button("Save new"):
                    preset = {
                        "name": new_name or f"{style_name}_H{int(H)}",
                        "style": style_name,  # keep UI style for readability
                        "size": {
                            "height": H, "top_od": top_od, "bottom_od": bottom_od,
                            "wall": t_wall, "bottom": t_bottom, "drain": r_drain, "flare_exp": expn
                        },
                        # NOTE: read widget values using style_key + schema walk
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
                    apply_preset_dict(pdata["presets"][idx])  # uses queue/rerun internally
                    st.success("Applied preset."); st.rerun()

        # Resets
        cL, cR = st.columns(2)
        if cL.button("Reset style to defaults"):
            reset_style_defaults(style_name); st.rerun()
        if cR.button("Reset ALL controls"):
            reset_all_defaults(style_name); st.rerun()

    # --------------- PREVIEW & EXPORT CONTROLS ---------------
    with st.expander("Preview & Export", expanded=True):
        c1, c2, c3, c4 = st.columns([1.2, 1.2, 1.2, 1.2])

        preview_detail = float(
            c1.slider("Preview detail (×)", 0.5, 2.0, st.session_state.get("preview_detail", 1.25), 0.05, key="preview_detail")
        )

        interactive_3d = c2.checkbox(
            "Quick Preview",
            value=st.session_state.get("interactive_3d", HAS_PLOTLY),
            key="interactive_3d",
            help="Quick surface preview (fast pan/orbit).",
        )
        interactive_mesh = c2.checkbox(
            "Full Preview",
            value=False,
            key="interactive_mesh",
            help="Full triangle mesh preview (slower but exact).",
        )

        fig_w = float(c3.slider("Figure width (in)", 4.0, 10.0, st.session_state.get("fig_w", 7.5), 0.1, key="fig_w"))
        fig_h = float(c3.slider("Figure height (in)", 4.0, 8.0,  st.session_state.get("fig_h", 5.2), 0.1, key="fig_h"))
        dpi   = int(c3.slider("DPI", 110, 220, st.session_state.get("dpi", 170), 10, key="dpi"))

        view_elev = float(c4.slider("View elev (°)", -30.0, 75.0,  st.session_state.get("view_elev", 20.0), 1.0, key="view_elev"))
        view_azim = float(c4.slider("View azim (°)", -180.0, 180.0, st.session_state.get("view_azim", -60.0), 1.0, key="view_azim"))
        show_inner = c4.checkbox("Inner wall overlay", value=st.session_state.get("show_inner", False), key="show_inner")

        st.divider()
        cE1, cE2, _ = st.columns([1.2, 1.2, 2.6])
        up = cE1.select_slider(
            "Export quality upscale",
            options=[1, 2, 3],
            value=st.session_state.get("quality_up", 2),
            key="quality_up",
            help="Multiplies nθ & nz when generating the STL.",
        )
        n_theta_export = int(n_theta * up)
        n_z_export     = int(n_z * up)
        do_export = cE2.button("Export STL…", type="primary", key="export_btn")

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
    
    # Manual preview mode: Add Update Preview button
    should_update_preview = auto_preview
    if not auto_preview:
        col1, col2 = st.columns([3, 1])
        with col1:
            if st.button("🔄 Update Preview", use_container_width=True, type="primary"):
                should_update_preview = True
                # Clear cache to force regeneration
                try:
                    st.cache_data.clear()
                except Exception:
                    pass
        with col2:
            st.caption("Manual mode")
    
    r_outer_fn = STYLES[style_name][0]  # geometry comes from UI style name
    opts = dict(ui_opts)
    opts_json = json.dumps(opts, sort_keys=True)

    preview_n_theta = max(16, min(4096, int(n_theta * preview_detail)))
    preview_n_z     = max(8,  min(2048, int(n_z     * preview_detail)))

    # Only generate preview if in auto mode or Update button was clicked
    preview_exists = False
    try:
        if should_update_preview:
            with st.spinner("Computing preview…"):
                X, Y, Z = make_preview_arrays(
                    H, Rt, Rb, expn,
                    preview_n_theta, preview_n_z,
                    style_name, opts_json,
                )
                preview_exists = True
        else:
            # Use cached preview or show placeholder
            X, Y, Z = make_preview_arrays(
                H, Rt, Rb, expn,
                preview_n_theta, preview_n_z,
                style_name, opts_json,
            )
            preview_exists = True
    except Exception as e:
        # If no cached preview exists, show a message
        preview_exists = False
        if not auto_preview:
            st.info("👆 Click 'Update Preview' to generate preview with current parameters")
        else:
            st.error(f"Preview generation failed: {e}")

    # Only proceed with preview rendering if we have data
    if preview_exists:
        if place_on_ground:
            Z = Z - Z.min()

        # Interactive Surface (fast) or Static PNG fallback
        png_bytes = None
        # Aggressively clean session_state media entries before creating placeholders
        try:
            _cleanup_stale_media_ids()
        except Exception:
            pass
        preview_placeholder = st.empty()
        mesh_placeholder = st.empty()
        # Ensure previous preview content is removed when Quick Preview disabled
        if interactive_3d:
            if HAS_PLOTLY:
                fig = go.Figure(data=[
                    go.Surface(
                        x=X, y=Y, z=Z,
                        showscale=False,
                        lighting=dict(ambient=0.5, diffuse=0.8, specular=0.05, roughness=0.8),
                    )
                ])
                height_px = max(360, min(900, int(96 * fig_h)))
                fig.update_layout(
                    height=height_px,
                    scene=dict(
                        aspectmode="data",
                        xaxis=dict(visible=False),
                        yaxis=dict(visible=False),
                        zaxis=dict(visible=False),
                        camera=dict(up=dict(x=0, y=0, z=1)),
                    ),
                    margin=dict(l=0, r=0, t=30, b=0),
                )
                preview_placeholder.plotly_chart(fig, use_container_width=True)
            else:
                # Plotly not available: fallback to static PNG
                try:
                    st.cache_data.clear()
                except Exception:
                    pass
                png_bytes = render_preview_png_cached(
                    H, Rt, Rb, expn,
                    preview_n_theta, preview_n_z,
                    style_name, opts_json,
                    fig_w, fig_h, dpi,
                    inner_wall=t_wall if show_inner else None,
                    view_elev=view_elev, view_azim=view_azim, return_png=False,
                )
                if png_bytes:
                    preview_placeholder.image(png_bytes, caption="Preview", use_container_width=True)
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
            png_bytes = render_preview_png_cached(
                H, Rt, Rb, expn,
                preview_n_theta, preview_n_z,
                style_name, opts_json,
                fig_w, fig_h, dpi,
                inner_wall=t_wall if show_inner else None,
                view_elev=view_elev, view_azim=view_azim,
                return_png=True,
            )
        except Exception:
            pass  # png_bytes generation for snapshots failed, but preview may still work

        # Optional: exact triangle mesh preview (exact mesh)
        if interactive_mesh:
            # If Plotly is present, render an interactive Mesh3d. Otherwise render a
            # static high-detail PNG so Full Preview can be displayed even when the
            # Quick Preview (interactive_3d) is disabled or Plotly is not installed.
            if HAS_PLOTLY:
                try:
                    import numpy as np
                    # Use the full UI options (global + style-specific) so flare/bell/twist
                    # and other global controls are applied to the exact mesh as well.
                    opts_mesh = opts
                    verts, faces, _ = build_pot_mesh(
                        H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
                        expn=expn, n_theta=n_theta, n_z=n_z,
                        r_outer_fn=r_outer_fn, style_opts=opts_mesh,
                    )
                    V = np.asarray(verts)
                    F = np.asarray(faces)
                    if place_on_ground:
                        V[:, 2] -= V[:, 2].min()
                    z_norm = (V[:, 2] - V[:, 2].min()) / max(1e-6, (V[:, 2].max() - V[:, 2].min()))
                    import matplotlib.cm as cm
                    colorscale = cm.get_cmap("viridis")
                    mesh_colors = [
                        [int(255*r), int(255*g), int(255*b)]
                        for r, g, b, _ in colorscale(z_norm)
                    ]
                    fig = go.Figure(data=[
                        go.Mesh3d(
                            x=V[:, 0], y=V[:, 1], z=V[:, 2],
                            i=F[:, 0], j=F[:, 1], k=F[:, 2],
                            flatshading=False,
                            lighting=dict(ambient=0.35, diffuse=0.95, specular=0.25, roughness=0.7, fresnel=0.2),
                            vertexcolor=mesh_colors,
                            hoverinfo="skip",
                            name="mesh",
                            opacity=1.0,
                        )
                    ])
                    height_px = max(400, min(1000, int(110 * fig_h)))
                    fig.update_layout(
                        height=height_px,
                        scene=dict(
                            aspectmode="data",
                            xaxis=dict(visible=False),
                            yaxis=dict(visible=False),
                            zaxis=dict(visible=False),
                            camera=dict(up=dict(x=0, y=0, z=1)),
                            bgcolor="#0E1117",
                        ),
                        margin=dict(l=0, r=0, t=30, b=0),
                    )
                    mesh_placeholder.plotly_chart(fig, use_container_width=True)
                except Exception as e:
                    import traceback
                    st.info(f"Mesh preview unavailable: {e}\n\n{traceback.format_exc()}")
            else:
                # Plotly not available: render a static high-detail PNG for the exact mesh
                try:
                    from pfui.preview import render_preview_png_cached, render_preview_apng_cached
                    try:
                        st.cache_data.clear()
                    except Exception:
                        pass
                    # Prefer an animated APNG for the full preview so the model
                    # can be inspected with a rotation. Fall back to a single
                    # PNG frame if APNG generation isn't available.
                    mesh_apng = render_preview_apng_cached(
                        H, Rt, Rb, expn,
                        n_theta, n_z,
                        style_name, opts_json,
                        fig_w, fig_h, dpi,
                        inner_wall=t_wall if show_inner else None,
                        view_elev=view_elev, view_azim=view_azim,
                    )
                    if mesh_apng:
                        mesh_placeholder.image(mesh_apng, caption="Full Preview (animated)", use_container_width=True)
                    else:
                        mesh_png = render_preview_png_cached(
                            H, Rt, Rb, expn,
                            n_theta, n_z,
                            style_name, opts_json,
                            fig_w, fig_h, dpi,
                            inner_wall=t_wall if show_inner else None,
                            view_elev=view_elev, view_azim=view_azim,
                        )
                        if mesh_png:
                            mesh_placeholder.image(mesh_png, caption="Full Preview (static)", use_container_width=True)
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

    # -------------------- SNAPSHOTS --------------------
    with st.expander("Snapshots (compare)"):
        # Record current snapshots count for debugging (helps trace clears)
        st.session_state.setdefault("_debug_logs", []).append(
            f"Render: _snaps count = {len(st.session_state.get('_snaps', []))}"
        )
        snaps: List[Dict[str, Any]] = st.session_state.get("_snaps", [])
        sc1, sc2 = st.columns([2, 1])
        snap_name = sc1.text_input("Snapshot name", value=f"{style_name}_H{int(H)}")
        if sc2.button("Capture"):
            # Initialize debug logs in session state if not already present
            if "_debug_logs" not in st.session_state:
                st.session_state["_debug_logs"] = []

            def log_debug(message: str):
                st.session_state["_debug_logs"].append(message)

            try:
                # Try to generate a fuller, rotated APNG for the snapshot so the
                # saved preview matches the Full Preview (avoids stretched/odd
                # aspect artifacts). Prefer APNG; fall back to a single PNG.
                try:
                    # If the user has Full Preview enabled and Plotly is
                    # available, attempt to export the same Mesh3d figure to a
                    # high-quality PNG so the snapshot visually matches the
                    # interactive preview. This requires Plotly's image export
                    # support (kaleido/engine). If that fails, fall back to the
                    # APNG/PNG matplotlib renderer.
                    capture_bytes = None
                    # Try Plotly export whenever Plotly is available so
                    # snapshots match the Full Preview style, even if the
                    # 'Full Preview' checkbox isn't currently checked.
                    if HAS_PLOTLY:
                        try:
                            # Build the exact mesh used in the interactive view
                            opts_mesh = opts
                            verts, faces, _ = build_pot_mesh(
                                H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
                                expn=expn, n_theta=n_theta, n_z=n_z,
                                r_outer_fn=r_outer_fn, style_opts=opts_mesh,
                            )
                            import numpy as _np
                            V = _np.asarray(verts)
                            F = _np.asarray(faces)
                            if place_on_ground:
                                V[:, 2] -= V[:, 2].min()
                            z_norm = (V[:, 2] - V[:, 2].min()) / max(1e-6, (V[:, 2].max() - V[:, 2].min()))
                            import matplotlib.cm as cm
                            colorscale = cm.get_cmap("viridis")
                            mesh_colors = [[int(255*r), int(255*g), int(255*b)] for r, g, b, _ in colorscale(z_norm)]

                            fig = go.Figure(data=[
                                go.Mesh3d(
                                    x=V[:, 0], y=V[:, 1], z=V[:, 2],
                                    i=F[:, 0], j=F[:, 1], k=F[:, 2],
                                    flatshading=False,
                                    lighting=dict(ambient=0.35, diffuse=0.95, specular=0.25, roughness=0.7, fresnel=0.2),
                                    vertexcolor=mesh_colors,
                                    hoverinfo="skip",
                                    name="mesh",
                                    opacity=1.0,
                                )
                            ])
                            height_px = max(400, min(1000, int(110 * fig_h)))
                            width_px = max(400, min(1400, int(96 * fig_w)))
                            fig.update_layout(
                                height=height_px,
                                width=width_px,
                                scene=dict(
                                    aspectmode="data",
                                    xaxis=dict(visible=False),
                                    yaxis=dict(visible=False),
                                    zaxis=dict(visible=False),
                                    camera=dict(up=dict(x=0, y=0, z=1)),
                                    bgcolor="#0E1117",
                                ),
                                margin=dict(l=0, r=0, t=30, b=0),
                            )
                            try:
                                # Try export via Plotly / kaleido
                                capture_bytes = fig.to_image(format="png", width=width_px, height=height_px, scale=1)
                            except Exception:
                                # If direct export fails, try plotly.io
                                try:
                                    import plotly.io as pio
                                    capture_bytes = pio.to_image(fig, format="png", width=width_px, height=height_px, scale=1)
                                except Exception:
                                    capture_bytes = None
                        except Exception:
                            capture_bytes = None

                    # If Plotly export didn't produce bytes, fall back to our
                    # existing APNG/PNG matplotlib-based renderer (high-detail)
                    if not capture_bytes:
                        from pfui.preview import render_preview_apng_cached, render_preview_png_cached
                        capture_bytes = render_preview_apng_cached(
                            H, Rt, Rb, expn,
                            n_theta, n_z,
                            style_name, opts_json,
                            fig_w, fig_h, dpi,
                            inner_wall=t_wall if show_inner else None,
                            view_elev=view_elev, view_azim=view_azim,
                        )
                        if not capture_bytes:
                            capture_bytes = render_preview_png_cached(
                                H, Rt, Rb, expn,
                                n_theta, n_z,
                                style_name, opts_json,
                                fig_w, fig_h, dpi,
                                inner_wall=t_wall if show_inner else None,
                                view_elev=view_elev, view_azim=view_azim,
                            )
                except Exception:
                    # If preview rendering fails for any reason, fall back to
                    # the earlier png_bytes (if available) or bail.
                    capture_bytes = png_bytes

                if capture_bytes:
                    log_debug("capture_bytes is available, attempting to save.")
                    log_debug(f"capture_bytes size: {len(capture_bytes)} bytes")
                    png_path = save_png_temp(capture_bytes)
                    if png_path:
                        log_debug(f"Snapshot saved successfully at {png_path}.")
                    else:
                        log_debug("Failed to save snapshot, png_path is None.")
                else:
                    log_debug("capture_bytes is None, cannot save snapshot.")
            except Exception as e:
                log_debug(f"Failed to save PNG temp file: {e}")
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
                H.checkpoint(style_name)
            except Exception:
                pass

        # Display debug logs in a text area
        if "_debug_logs" not in st.session_state:
            st.session_state["_debug_logs"] = []
        st.text_area("Debug Logs", value="\n".join(st.session_state["_debug_logs"]), height=300)

        # Re-read snaps to ensure we display the latest list (capture may
        # have mutated st.session_state earlier in this run).
        snaps = st.session_state.get("_snaps", [])

        if snaps:
            for i, s in enumerate(snaps):
                cc1, cc2, cc3 = st.columns([2, 1, 1])
                # show a small preview image if available
                png_bytes_local = None
                try:
                    png_bytes_local = read_png_bytes(s.get("png"))
                except Exception:
                    png_bytes_local = None
                if png_bytes_local:
                    cc1.image(png_bytes_local, caption=f"{i+1}. {s['name']}", use_container_width=True)
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
                    # Use the queued-update mechanism so values are applied
                    # BEFORE widgets are created on the next run. This avoids
                    # StreamlitAPIException when trying to set widget-backed
                    # keys after their widgets exist.
                    try:
                        queue_update(pending)
                        st.session_state.setdefault("_debug_logs", []).append(f"Queued snapshot {i+1} for apply; rerunning.")
                        st.experimental_rerun()
                    except Exception:
                        # As a fallback (best-effort), attempt direct write for
                        # non-widget keys and log the failure.
                        st.session_state.setdefault("_debug_logs", []).append(f"Failed to queue_update snapshot {i+1}; falling back to direct write.")
                        for _k, _v in pending.items():
                            try:
                                st.session_state[_k] = _v
                            except Exception:
                                pass
                if cc3.button("Delete", key=f"del_{i}"):
                    new_snaps = snaps[:i] + snaps[i+1:]
                    st.session_state["_snaps"] = new_snaps
                    st.session_state.setdefault("_debug_logs", []).append(f"Deleted snapshot {i+1}.")

    # ---------------------- EXPORT ---------------------
    st.subheader("Export STL")
    if do_export:
        try:
            verts, faces, _ = build_pot_mesh(
                H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
                expn=expn, n_theta=n_theta_export, n_z=n_z_export,
                r_outer_fn=r_outer_fn, style_opts=opts,
            )
            safe = re.sub(r"[^A-Za-z0-9._-]+", "_", name)[:80] or "potfoundry_model"
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
        except Exception as e:
            st.error(f"Export failed: {e}")

    # ----------------- 2D PROFILE ----------------------
    with st.expander("2D radial profile"):
        render_profile(H, Rt, Rb, expn, r_outer_fn, opts, t_wall)

# ============================================================
# Tab 2 — Batch from YAML
# ============================================================

with _tab2:
    render_batch_tab()
