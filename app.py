# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import re
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict, List

import streamlit as st

from pfui.imports import (
    STYLES,
    build_pot_mesh,
    WRITE_STL_BINARY,
)
from pfui.presets import PRESETS, _read_user_presets, _write_user_presets, apply_preset_dict, render_preset_manager
from pfui.schemas import STYLE_SCHEMAS
from pfui.state import apply_pending_updates, queue_update, widget_key, reset_style_defaults, reset_all_defaults
from pfui.controls import style_controls, adv_shape_controls, twist_controls
from pfui.preview import make_preview_arrays, render_preview, render_profile
from pfui.health import _design_health, _health_badge
from pfui.exporters import export_stl_bytes
from pfui.yaml_tools import dump_recipe_yaml
from pfui.batch_tab import render_batch_tab
from pfui.units import units_selector, unit_number_input, unit_slider, get_units
from pfui.projects import render_project_io

apply_pending_updates()


APP_VERSION = "2.1.0-evo"

# ------------ Page config ------------
st.set_page_config(page_title="PotFoundry Pro v2", layout="wide")
st.title("PotFoundry Pro v2 — Designer & Batch")
st.caption(f"Build {APP_VERSION}")
st.session_state.pop("_units_widget_rendered_this_run", None)

# ------------ Tabs ------------
_tab1, _tab2 = st.tabs(["Interactive", "Batch from YAML"])
units_selector()  # keeps your current behavior


with _tab1:
    # ---------- SIDEBAR ----------
    with st.sidebar:
        st.header("Model")
        name = st.text_input("Name", value=st.session_state.get("model_name", "SpiralRidges_Design"), key="model_name")
        place_on_ground = st.checkbox("Place model on ground (Z=0)", value=True, help="Only affects preview/origin; STL is unchanged.")

        st.divider()
        st.subheader("Dimensions")
        H = float(st.number_input("Height (mm)", 60.0, 240.0, st.session_state.get("H", 120.0), 5.0, key="H"))
        top_od = float(st.number_input("Top OD (mm)", 60.0, 240.0, st.session_state.get("top_od", 140.0), 5.0, key="top_od"))
        bottom_od = float(st.number_input("Bottom OD (mm)", 40.0, 200.0, st.session_state.get("bottom_od", 90.0), 5.0, key="bottom_od"))
        t_wall = float(st.number_input("Wall (mm)", 2.0, 8.0, st.session_state.get("t_wall", 3.0), 0.5, key="t_wall"))
        t_bottom = float(st.number_input("Bottom slab (mm)", 2.0, 10.0, st.session_state.get("t_bottom", 3.0), 0.5, key="t_bottom"))
        r_drain = float(st.number_input("Drain hole (mm)", 3.0, 30.0, st.session_state.get("r_drain", 10.0), 1.0, key="r_drain"))

        Rt, Rb = 0.5 * top_od, 0.5 * bottom_od

        st.subheader("Profile")
        expn = float(st.slider("Flare exponent", 0.7, 1.6, st.session_state.get("expn", 1.1), 0.05, key="expn"))
        c1, c2, c3 = st.columns(3)
        k1, k2, k3 = widget_key(st.session_state.get("style","SpiralRidges"), "flare_center"), widget_key(st.session_state.get("style","SpiralRidges"), "flare_sharp"), widget_key(st.session_state.get("style","SpiralRidges"), "bell_amp")
        flare_center = float(c1.slider("Flare center (0–1)", 0.1, 0.9, st.session_state.get(k1, 0.5), 0.01, key=k1))
        flare_sharp  = float(c2.slider("Flare sharpness", 1.0, 12.0, st.session_state.get(k2, 6.0), 0.1, key=k2))
        bell_amp     = float(c3.slider("Bell amplitude", 0.0, 0.5, st.session_state.get(k3, 0.0), 0.01, key=k3))
        c4, c5 = st.columns(2)
        k4, k5 = widget_key(st.session_state.get("style","SpiralRidges"), "bell_center"), widget_key(st.session_state.get("style","SpiralRidges"), "bell_width")
        bell_center  = float(c4.slider("Bell center (0–1)", 0.1, 0.9, st.session_state.get(k4, 0.5), 0.01, key=k4))
        bell_width   = float(c5.slider("Bell width", 0.05, 0.5, st.session_state.get(k5, 0.22), 0.01, key=k5))

        st.subheader("Mesh quality")
        q1, q2 = st.columns(2)
        n_theta = int(q1.slider("Angular divisions (n_theta)", 96, 720, st.session_state.get("n_theta", 168), 12, key="n_theta"))
        n_z     = int(q2.slider("Vertical divisions (n_z)", 32, 256, st.session_state.get("n_z", 84), 4, key="n_z"))

        st.subheader("Style")
        style_name = st.selectbox("Family", options=sorted(STYLES.keys()), key="style")
        try:
            st.caption(STYLES[style_name][1])
        except Exception:
            pass

        # Per-style controls (same logic, now in sidebar)
        ui_opts = style_controls(style_name)
        ui_opts.update({
            "flare_center": flare_center,
            "flare_sharp":  flare_sharp,
            "bell_amp":     bell_amp,
            "bell_center":  bell_center,
            "bell_width":   bell_width,
        })

        with st.expander("Twist / Spin"):
            ui_opts.update(twist_controls(style_name))

        with st.expander("Presets"):
            # built-ins row
            pdefs = PRESETS.get(style_name, {})
            if pdefs:
                cols = st.columns(max(3, min(6, len(pdefs))))
                for i, p in enumerate(pdefs.keys()):
                    if cols[i % len(cols)].button(p, key=f"preset_{style_name}_{p}"):
                        for k, v in pdefs[p].items():
                            queue_update({widget_key(style_name, k): v})
                            st.rerun()
                        st.rerun()
                if st.button("Reset style to defaults"):
                    reset_style_defaults(style_name); st.rerun()
            # user presets
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
                        "size": {"height": H, "top_od": top_od, "bottom_od": bottom_od, "wall": t_wall, "bottom": t_bottom, "drain": r_drain, "flare_exp": expn},
                        "opts": {k: st.session_state.get(widget_key(style_name, k), v["default"]) for k, v in STYLE_SCHEMAS.get(style_name, {}).items()},
                    }
                    pdata.setdefault("presets", []).append(preset)
                    st.success("Preset saved.") if _write_user_presets(pdata) else st.error("Failed to save preset.")
                if cols[3].button("Delete") and sel != "<none>":
                    idx = names.index(sel); del pdata["presets"][idx]
                    st.success("Preset deleted.") if _write_user_presets(pdata) else st.error("Failed to update presets.")
                if sel != "<none>" and st.button("Apply selected"):
                    idx = names.index(sel); apply_preset_dict(pdata["presets"][idx]); st.success("Applied preset."); st.rerun()

        with st.expander("Style preset JSON (advanced)"):
            left, right = st.columns([1, 2])
            if left.button("Save current as JSON"):
                data = json.dumps(ui_opts, indent=2)
                st.download_button("Download JSON", data=data, file_name=f"{style_name}_preset.json", mime="application/json")
            up = right.file_uploader("Load preset JSON", type=["json"], accept_multiple_files=False)
            if up is not None:
                try:
                    data_obj = json.loads(up.read().decode("utf-8"))
                    if isinstance(data_obj, dict):
                        for k, v in data_obj.items():
                            queue_update({widget_key(style_name, k): v})
                            st.rerun()
                        st.success("Preset loaded into controls."); st.rerun()
                except Exception as e:
                    st.error(f"Failed to load JSON: {e}")

        # Reset all
        if st.button("Reset all controls"):
            reset_all_defaults(style_name); st.rerun()

# Snapshots in sidebar to declutter main
with st.expander("Snapshots (compare)"):
    snaps: List[Dict[str, Any]] = st.session_state.get("_snaps", [])
    sc1, sc2, sc3 = st.columns([1, 1, 1.2])
    snap_name = sc1.text_input("Name", value=f"{style_name}_H{int(H)}")

    if sc2.button("Capture"):
        new_snaps = snaps + [{
            "name": snap_name,
            "png": None,
            "style": style_name,
            "params": {
                "H": H, "top_od": top_od, "bottom_od": bottom_od, "t_wall": t_wall,
                "t_bottom": t_bottom, "r_drain": r_drain, "expn": expn, "opts": dict(ui_opts)
            }
        }]
        # queue state change, then rerun so widgets pick it up cleanly
        queue_update({"_snaps": new_snaps[-6:]})
        st.rerun()

    if snaps:
        for i, s in enumerate(snaps):
            st.write(f"**{i+1}. {s['name']}**")
            cc1, cc2 = st.columns([1, 1])

            if cc1.button("Apply", key=f"apply_{i}"):
                pending = {
                    "H": s["params"]["H"],
                    "top_od": s["params"]["top_od"],
                    "bottom_od": s["params"]["bottom_od"],
                    "t_wall": s["params"]["t_wall"],
                    "t_bottom": s["params"]["t_bottom"],
                    "r_drain": s["params"]["r_drain"],
                    "expn": s["params"]["expn"],
                    "style": s["style"],
                }
                # also queue all style option widgets
                for k, v in s["params"]["opts"].items():
                    pending[widget_key(s["style"], k)] = v

                queue_update(pending)
                st.rerun()

            if cc2.button("Delete", key=f"del_{i}"):
                new_snaps = snaps[:i] + snaps[i+1:]
                queue_update({"_snaps": new_snaps})
                st.rerun()


        st.divider()
        st.subheader("Preview")
        fig_w = float(st.slider("Figure width (in)", 4.0, 10.0, 7.5, 0.1))
        fig_h = float(st.slider("Figure height (in)", 4.0, 8.0, 5.2, 0.1))
        dpi   = int(st.slider("DPI", 110, 220, 170, 10))
        show_inner = st.checkbox("Show inner wall overlay", value=False)
        view_elev  = float(st.slider("View elev (°)", -30.0, 75.0, 20.0, 1.0))
        view_azim  = float(st.slider("View azim (°)", -180.0, 180.0, -60.0, 1.0))

        st.divider()
        st.subheader("Export")
        up = st.select_slider("Quality upscale", options=[1, 2, 3], value=2, help="Multiplies n_theta & n_z for the STL.")
        n_theta_export = int(n_theta * up); n_z_export = int(n_z * up)
        do_export = st.button("Export STL…", type="primary")

    # ---- Preview & Export controls (always available) ----
    with st.expander("Preview & Export"):
        preview_detail = float(st.slider(
            "Detail multiplier", 0.5, 2.0, st.session_state.get("preview_detail", 1.25),
            0.05, key="preview_detail"
        ))
        fig_w = float(st.slider("Figure width (in)", 4.0, 10.0, st.session_state.get("fig_w", 7.5), 0.1, key="fig_w"))
        fig_h = float(st.slider("Figure height (in)", 4.0, 8.0,  st.session_state.get("fig_h", 5.2), 0.1, key="fig_h"))
        dpi   = int(st.slider("DPI", 110, 220,                     st.session_state.get("dpi", 170), 10,  key="dpi"))
        show_inner = st.checkbox("Show inner wall overlay", value=st.session_state.get("show_inner", False), key="show_inner")
        view_elev  = float(st.slider("View elev (°)", -30.0, 75.0,   st.session_state.get("view_elev", 20.0), 1.0, key="view_elev"))
        view_azim  = float(st.slider("View azim (°)", -180.0, 180.0, st.session_state.get("view_azim", -60.0), 1.0, key="view_azim"))

        st.divider()
        up = st.select_slider("Quality upscale", options=[1, 2, 3],
                            value=st.session_state.get("quality_up", 2), key="quality_up",
                            help="Multiplies n_theta & n_z for the STL.")
        n_theta_export = int(n_theta * up)
        n_z_export     = int(n_z * up)
        do_export      = st.button("Export STL…", type="primary", key="export_btn")


    # ---------- MAIN PANE (Preview + health + metrics) ----------
    st.markdown("### Model preview")
    # health warnings
    issues: List[str] = []
    if r_drain < max(4.0, 0.8 * t_wall): issues.append("Drain radius is quite small vs wall thickness.")
    if t_wall > 0.12 * min(top_od, bottom_od): issues.append("Wall thickness is very large vs diameter; may self-intersect.")
    if t_bottom > 0.3 * H: issues.append("Bottom thickness is large vs height; consider reducing.")
    if min(Rt, Rb) <= t_wall * 1.2: issues.append("Wall thickness approaches/exceeds radius; increase diameters or reduce wall.")
    if t_wall < 1.5: issues.append("Very thin walls may be fragile in printing.")
    for msg in issues: st.warning(msg)

    # health badges
    badges = _design_health(H, Rt, Rb, t_wall, t_bottom, r_drain)
    cols = st.columns(min(3, max(1, len(badges))))
    for c, b in zip(cols, badges):
        _health_badge(c, b.label, b.status, b.tip)


    # build preview
    r_outer_fn = STYLES[style_name][0]
    opts = dict(ui_opts)  # already includes base & twist
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
        Z = Z - Z.min()  # simple ground placement

    png_bytes = render_preview(
        X, Y, Z,
        fig_w, fig_h, dpi, True,
        inner_wall=t_wall if show_inner else None,
        view_elev=view_elev, view_azim=view_azim, return_png=True,
    )

    # metrics (coarse)
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

    # png download
    if png_bytes:
        st.download_button("Download preview PNG", data=png_bytes, file_name=f"{name}_preview.png", mime="image/png")

    # export
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
            try: tmp_path.unlink(missing_ok=True)
            except Exception: pass
            st.success(f"STL ready: {safe}.stl  — triangles: {len(faces):,}")
            st.download_button("Download STL", data=data, file_name=f"{safe}.stl", mime="model/stl")
        except Exception as e:
            st.error(f"Export failed: {e}")

    with st.expander("2D radial profile"):
        render_profile(H, Rt, Rb, expn, r_outer_fn, opts, t_wall)



# =============================
# Tab 2 — Batch from YAML
# =============================
with _tab2:
    render_batch_tab()