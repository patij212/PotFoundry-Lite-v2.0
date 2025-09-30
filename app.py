# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import re
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict, List

import streamlit as st

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

# ------------------------------------------------------------
# Boot: apply any queued state changes BEFORE creating widgets
# ------------------------------------------------------------
apply_pending_updates()

# -------- Style key normalization (schema-safe) ----------
import re as _re
def _norm_style(s: str) -> str:
    return _re.sub(r"[^a-z0-9]+", "", s.lower())

_SCHEMA_KEY_BY_NORM = {_norm_style(k): k for k in STYLE_SCHEMAS.keys()}

def resolve_schema_key(ui_name: str) -> str:
    """Return the STYLE_SCHEMAS key for a UI style name (tolerates spaces/case)."""
    if ui_name in STYLE_SCHEMAS:
        return ui_name
    return _SCHEMA_KEY_BY_NORM.get(_norm_style(ui_name), ui_name)


APP_VERSION = "2.1.0-evo"

# ------------ Page config ------------
st.set_page_config(page_title="PotFoundry Pro v2", layout="wide")
st.title("PotFoundry Pro v2 — Designer & Batch")
st.caption(f"Build {APP_VERSION}")
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
        name = st.text_input(
            "Model name",
            value=st.session_state.get("model_name", "SpiralRidges_Design"),
            key="model_name",
        )
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
            "Interactive 3D (surface)",
            value=st.session_state.get("interactive_3d", HAS_PLOTLY),
            key="interactive_3d",
            help="Pan/orbit/zoom the preview (Plotly surface).",
        )
        interactive_mesh = c2.checkbox(
            "Exact mesh (triangles)",
            value=False,
            key="interactive_mesh",
            help="Use real triangles for preview (slower).",
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
    r_outer_fn = STYLES[style_name][0]  # geometry comes from UI style name
    opts = dict(ui_opts)
    opts_json = json.dumps(opts, sort_keys=True)

    preview_n_theta = max(16, min(4096, int(n_theta * preview_detail)))
    preview_n_z     = max(8,  min(2048, int(n_z     * preview_detail)))

    with st.spinner("Computing preview…"):
        X, Y, Z = make_preview_arrays(
            H, Rt, Rb, expn,
            preview_n_theta, preview_n_z,
            style_name, opts_json,
        )

    if place_on_ground:
        Z = Z - Z.min()

    # Interactive Surface (fast) or Static PNG
    png_bytes = None
    if interactive_3d and HAS_PLOTLY:
        fig = go.Figure(data=[
            go.Surface(
                x=X, y=Y, z=Z,
                showscale=False,
                lighting=dict(ambient=0.5, diffuse=0.8, specular=0.05, roughness=0.8),
            )
        ])
        # Robust height tied to fig_h; clamp to sensible range
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
        st.plotly_chart(fig, use_container_width=True)
    else:
        png_bytes = render_preview(
            X, Y, Z,
            fig_w, fig_h, dpi, True,
            inner_wall=t_wall if show_inner else None,
            view_elev=view_elev, view_azim=view_azim, return_png=True,
        )
        if png_bytes:
            # Show scaled to container and offer download
            st.image(png_bytes, caption="Preview", use_column_width=True)
            st.download_button(
                "Download preview PNG",
                data=png_bytes,
                file_name=f"{name}_preview.png",
                mime="image/png",
            )

    # Optional: exact triangle mesh preview (dokładna siatka)
    if HAS_PLOTLY and interactive_mesh:
        try:
            import numpy as np
            opts_mesh = json.loads(opts_json)
            valid_keys = STYLE_SCHEMAS.get(style_key, {}).keys()
            opts_mesh = {k: v for k, v in opts_mesh.items() if k in valid_keys}
            verts, faces, _ = build_pot_mesh(
                H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
                expn=expn, n_theta=n_theta, n_z=n_z,  # <-- dokładne parametry!
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
            st.plotly_chart(fig, use_container_width=True)
        except Exception as e:
            import traceback
            st.info(f"Mesh preview unavailable: {e}\n\n{traceback.format_exc()}")

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
        snaps: List[Dict[str, Any]] = st.session_state.get("_snaps", [])
        sc1, sc2 = st.columns([2, 1])
        snap_name = sc1.text_input("Snapshot name", value=f"{style_name}_H{int(H)}")
        if sc2.button("Capture"):
            new_snaps = snaps + [{
                "name": snap_name,
                "png": None,
                "style_ui": style_name,     # store UI & key
                "style_key": style_key,
                "params": {
                    "H": H, "top_od": top_od, "bottom_od": bottom_od, "t_wall": t_wall,
                    "t_bottom": t_bottom, "r_drain": r_drain, "expn": expn, "opts": dict(ui_opts),
                },
            }]
            queue_update({"_snaps": new_snaps[-6:]})
            st.rerun()

        if snaps:
            for i, s in enumerate(snaps):
                cc1, cc2, cc3 = st.columns([2, 1, 1])
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
                    queue_update(pending); st.rerun()
                if cc3.button("Delete", key=f"del_{i}"):
                    new_snaps = snaps[:i] + snaps[i+1:]
                    queue_update({"_snaps": new_snaps})
                    st.rerun()

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
            WRITE_STL_BINARY(str(tmp_path), safe, verts, faces)  # binary STL
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

with _tab2:    render_batch_tab()
