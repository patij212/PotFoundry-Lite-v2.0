"""Interactive Designer tab - main UI for PotFoundry.

This module contains the complete Interactive Designer tab logic,
extracted from app.py to improve modularity and maintainability.

The tab has been fully modularized with components extracted to:
- pfui/tabs/interactive/sidebar.py - All sidebar input controls
- pfui/tabs/interactive/preview.py - Preview rendering and orchestration  
- pfui/tabs/interactive/export.py - STL export and library publishing
- pfui/tabs/interactive/metrics.py - Mesh statistics
- pfui/tabs/interactive/performance.py - Performance logs
- pfui/tabs/interactive/profile.py - 2D profile visualization
"""

from __future__ import annotations

from typing import Any, cast

import streamlit as st

# Import modular components
from pfui.app_components import render_appearance_settings, render_snapshots
from pfui.app_components.utils import resolve_schema_key
from pfui.health import _design_health, _health_badge, HealthBadge
from pfui.tabs.interactive import (
    render_export_section,
    render_metrics_section,
    render_performance_section,
    render_preview_section,
    render_profile_section,
    render_sidebar_section,
)
from pfui.preview import render_profile  # profile visualization
from pfui.imports import build_pot_mesh, STYLES  # geometry + style registry
from pfui.geometry_bridge import adapt_r_outer_fn
from pfui.tabs.interactive.preview.style_setup import setup_preview_style
from pfui.state import widget_key
import pfui.schemas as SC


def render_interactive_tab(
    _has_library: bool = False,
    _library_read_only: bool = False,
) -> None:
    """Render the complete Interactive Designer tab.
    
    This is the main UI for designing and previewing pots interactively.
    All major sections have been extracted to focused modules.
    
    Args:
        _has_library: Whether library is configured
        _library_read_only: Whether library is in read-only mode
    """
    # Get session state reference
    ss = cast(dict[str, Any], st.session_state)
    
    # ------------------ SIDEBAR (all inputs) ------------------
    with st.sidebar:
        render_sidebar_section()

    # Gather current design parameters from session state after sidebar render
    H = float(ss.get("H", 120.0))
    top_od = float(ss.get("top_od", 140.0))
    bottom_od = float(ss.get("bottom_od", 90.0))
    t_wall = float(ss.get("t_wall", 3.0))
    t_bottom = float(ss.get("t_bottom", 3.0))
    r_drain = float(ss.get("r_drain", 10.0))
    expn = float(ss.get("expn", 1.1))
    Rt = 0.5 * top_od
    Rb = 0.5 * bottom_od
    # Resolve style from either legacy key or new widget key; persist canonical key
    _style_from_global = ss.get("style")
    _style_from_widget = ss.get(widget_key("style"))
    style_name = str(
        _style_from_global
        or _style_from_widget
        or (next(iter(STYLES.keys())) if STYLES else "HarmonicRipple")
    )
    ss["style"] = style_name
    # Write Rt/Rb so preview extractor reads current values
    ss["Rt"] = Rt
    ss["Rb"] = Rb
    # Build style options from schema-backed widget keys
    # Canonical (UI) option collection
    opts: dict[str, Any] = {}
    try:
        style_schema = SC.get_style_schemas().get(style_name, {})
        for skey in style_schema.keys():
            wkey = widget_key(style_name, skey)
            if wkey in ss:
                opts[skey] = ss[wkey]
        for gkey in (
            "spin_turns",
            "spin_phase_deg",
            "spin_curve_exp",
            "flare_center",
            "flare_sharp",
            "bell_amp",
            "bell_center",
            "bell_width",
        ):
            wkey = widget_key(style_name, gkey)
            if wkey in ss:
                opts[gkey] = ss[wkey]
    except Exception:
        opts = {}
    # Translate to legacy/engine keyspace for geometry (retain canonical separately)
    try:
        engine_opts = SC.to_engine(style_name, opts)
    except Exception:
        engine_opts = dict(opts)
    # Force preview recompute when style actually changed
    if ss.get("_last_style_applied") != style_name:
        ss["_preview_stale"] = True
        ss["_last_style_applied"] = style_name
    ss["style_opts_canonical"] = dict(opts)
    ss["style_opts"] = dict(engine_opts)
    # Obtain outer radius style function
    try:
        r_outer_raw = STYLES.get(style_name, (lambda th,z,H,Rb,o: Rb, {}))[0]
    except Exception:
        r_outer_raw = lambda th, z, H_, Rb_, o: Rb_  # noqa: E731
    r_outer_fn = adapt_r_outer_fn(r_outer_raw)
    n_theta = int(ss.get("n_theta", ss.get("preview_n_theta", 168)))
    n_z = int(ss.get("n_z", ss.get("preview_n_z", 84)))

    # --------------- PREVIEW & EXPORT CONTROLS ---------------
    with st.expander("Preview & Export", expanded=True):
        col1, col2 = st.columns(2)
        with col1:
            preview_mode = st.radio(
                "Preview Mode",
                options=["manual", "auto", "debounced"],
                index=1,
                horizontal=True,
                key="preview_mode",
                help=(
                    "**Manual**: Click 'Update Preview' button to refresh\n\n"
                    "**Auto**: Preview updates immediately on every change\n\n"
                    "**Debounced**: Preview auto-updates after you stop editing (requires JavaScript)"
                ),
            )
        with col2:
            # Mesh quality slider (restored) controlling preview detail multiplier
            preview_detail = st.slider(
                "Mesh quality",
                0.5,
                3.0,
                float(ss.get("preview_detail", 2.0)),
                0.25,
                key="preview_detail",
                help=(
                    "Controls angular/vertical sampling density for preview surfaces. Higher = more detail."
                ),
            )

    # ---------------- HEALTH & WARNINGS ----------------
    # Collect dimension primitives from session state (fallbacks preserve legacy defaults)
    try:
        H = float(ss.get("H", 120.0))
        top_od = float(ss.get("top_od", 140.0))
        bottom_od = float(ss.get("bottom_od", 90.0))
        t_wall = float(ss.get("t_wall", 3.0))
        t_bottom = float(ss.get("t_bottom", 3.0))
        r_drain = float(ss.get("r_drain", 10.0))
        Rt = 0.5 * top_od
        Rb = 0.5 * bottom_od
        badges = _design_health(H, Rt, Rb, t_wall, t_bottom, r_drain)
    except Exception:
        badges = []
    if badges:
        st.subheader("Design health")
        cols = st.columns(len(badges)) if len(badges) else []
        for i, b in enumerate(badges):
            try:
                _health_badge(cols[i], b.label, b.status, b.tip)
            except Exception:
                # Fallback single-column rendering
                _health_badge(st, b.label, b.status, b.tip)

    # -------------------- PREVIEW ----------------------
    # Inject quick debug panel for style + opts visibility
    with st.expander("Style debug", expanded=False):
        try:
            st.write({
                "style": style_name,
                "canonical_opts_sample": dict(list(ss.get("style_opts_canonical", {}).items())[:8]),
                "engine_opts_sample": dict(list(ss.get("style_opts", {}).items())[:8]),
                "stale": ss.get("_preview_stale"),
            })
        except Exception:
            st.write("(debug unavailable)")
    render_preview_section(preview_mode)

    # ---------------------- EXPORT ---------------------
    # Render Export directly below the Preview so users can export what they see.
    try:
        # Ensure export uses the same wrapped r_outer_fn (including global twist)
        try:
            ui_opts = ss.get("style_opts_canonical", dict(opts))
            style_config = setup_preview_style(
                style_name,
                ui_opts,
                int(ss.get("preview_n_theta", n_theta)),
                int(ss.get("preview_n_z", n_z)),
                int(max(256, n_theta * 2)),
                int(max(128, n_z * 2)),
            )
            export_r_outer = style_config.r_outer_fn
            export_opts = style_config.opts
        except Exception:
            export_r_outer = r_outer_fn
            export_opts = engine_opts

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
            r_outer_fn=export_r_outer,
            opts=export_opts,
            name=str(
                ss.get("model_name")
                or ss.get("_design_name")
                or f"{style_name}_{int(H)}mm"
            ),
            top_od=top_od,
            bottom_od=bottom_od,
            do_export=bool(ss.get("_do_export", False)),
            n_theta_export=int(ss.get("export_n_theta", n_theta)),
            n_z_export=int(ss.get("export_n_z", n_z)),
        )
    except Exception:
        st.info("Export section unavailable.")

    # -------------------- METRICS ----------------------
    # Metrics (lightweight subsample). Guard errors internally.
    try:
        render_metrics_section(
            H,
            Rt,
            Rb,
            t_wall,
            t_bottom,
            r_drain,
            expn,
            n_theta,
            n_z,
            r_outer_fn,
            engine_opts,
        )
    except Exception:
        st.info("Metrics unavailable.")

    # -------------------- APPEARANCE / PREVIEW SETTINGS --------------------
    render_appearance_settings()

    # -------------------- SNAPSHOTS --------------------
    # Provide full keyword-only context required by snapshots module.
    try:
        render_snapshots(
            style_name=style_name,
            style_key=resolve_schema_key(style_name),
            H=H,
            top_od=top_od,
            bottom_od=bottom_od,
            t_wall=t_wall,
            t_bottom=t_bottom,
            r_drain=r_drain,
            expn=expn,
            ui_opts=opts,
            n_theta=n_theta,
            n_z=n_z,
            fig_w=float(ss.get("fig_w", 7.5)),
            fig_h=float(ss.get("fig_h", 7.0)),
            dpi=int(ss.get("preview_dpi", ss.get("dpi", 110))),
            show_inner=bool(ss.get("show_inner", False)),
            place_on_ground=bool(ss.get("place_on_ground", True)),
            view_elev=float(ss.get("view_elev", 20.0)),
            view_azim=float(ss.get("view_azim", -60.0)),
        )
    except Exception:
        st.info("Snapshots unavailable.")

    # ----------------- 2D PROFILE ----------------------
    try:
        render_profile_section(
            H,
            Rt,
            Rb,
            expn,
            r_outer_fn,
            engine_opts,
            t_wall,
        )
    except Exception:
        st.info("Profile section unavailable.")

    # --------------- PERFORMANCE (DEV) ----------------
    render_performance_section()
