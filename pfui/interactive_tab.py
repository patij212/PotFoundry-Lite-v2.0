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

from collections.abc import Callable
from typing import TYPE_CHECKING, Any, cast

from pfui._st import get_effective_st as get_st, StreamlitLike
from potfoundry.types import StyleOpts

if TYPE_CHECKING:
    from streamlit import DeltaGenerator
else:
    DeltaGenerator = Any  # type: ignore

# Import modular components
import pfui.schemas as SC
from pfui.app_components import render_appearance_settings, render_snapshots
from pfui.app_components.utils import resolve_schema_key
from pfui.geometry_bridge import adapt_r_outer_fn
from pfui.health import (  # type: ignore[reportPrivateUsage]
    _design_health,
    _health_badge,
)

# Help the type checker by declaring expected call signatures for re-exported
# functions (they are provided by submodules and can be dynamically typed).
# Re-exported render functions are provided by submodules; no cast needed.
from pfui.imports import STYLES  # geometry + style registry
from pfui.state import widget_key
from pfui.tabs.interactive import (
    render_export_section,
    render_metrics_section,
    render_performance_section,
    render_preview_section,
    render_profile_section,
    render_sidebar_section,
)
from pfui.tabs.interactive.preview.style_setup import setup_preview_style


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
    st = get_st()
    ss = cast("dict[str, Any]", st.session_state)
    # Ensure preview_mode and has_pyvista are always defined for static analysis
    preview_mode: str = str(ss.get("preview_mode", "auto"))
    has_pyvista: bool = False

    # ------------------ SIDEBAR (all inputs) ------------------
    with st.sidebar:
        render_sidebar_section()

    # Gather current design parameters from session state after sidebar render
    h = float(ss.get("H", 120.0))
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
        or (next(iter(cast("dict[str, Any]", STYLES).keys())) if STYLES else "HarmonicRipple"),
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
        engine_opts = cast("dict[str, Any]", cast("Any", SC.to_engine)(style_name, opts))
    except Exception:
        engine_opts = dict(opts)
    # Force preview recompute when style actually changed
    if ss.get("_last_style_applied") != style_name:
        ss["_preview_stale"] = True
        ss["_last_style_applied"] = style_name
        # Invalidate PyVista caches to avoid reusing previous style mesh/colors
        try:
            ss.pop("_pyvista_mesh_cache", None)
            ss.pop("_pyvista_colors_cache", None)
        except Exception:
            pass
    ss["style_opts_canonical"] = dict(opts)
    ss["style_opts"] = dict(engine_opts)
    # Obtain outer radius style function
    # default outer-radius function used when STYLES doesn't provide one
    def _fallback_r_outer(th: float, z: float, H_: float, Rb_: float, o: Any) -> float:
        return Rb_

    _default_style_tuple: tuple[Callable[[float, float, float, float, Any], float], dict[str, Any]] = (_fallback_r_outer, {})

    try:
        # STYLES is dynamically provided by imports; cast to a known mapping
        # shape so static analyzers can reason about .get
        r_outer_raw = cast("dict[str, Any]", STYLES).get(style_name, _default_style_tuple)[0]
        # give r_outer_raw a callable signature for the analyzer
        r_outer_raw = cast("Callable[[float, float, float, float, Any], float]", r_outer_raw)
    except Exception:
        r_outer_raw = _fallback_r_outer
    r_outer_fn = adapt_r_outer_fn(r_outer_raw)
    n_theta = int(ss.get("n_theta", ss.get("preview_n_theta", 168)))
    n_z = int(ss.get("n_z", ss.get("preview_n_z", 84)))

    # --------------- PREVIEW & EXPORT CONTROLS ---------------
    with st.expander("Preview & Export", expanded=True):
        cols_12: list[DeltaGenerator] = list(st.columns(2))
        col1, col2 = cols_12[0], cols_12[1]
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
            st.slider(
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

        # Renderer selection (PyVista vs Plotly)
        cols_34: list[DeltaGenerator] = list(st.columns(2))
        col3, col4 = cols_34[0], cols_34[1]
        with col3:
            # Check if PyVista is available (avoid importing modules into local scope)
            try:
                from importlib import util

                has_pyvista = bool(util.find_spec("pyvista") and util.find_spec("stpyvista"))
            except Exception:
                has_pyvista = False

            # Renderer selection expanded (PyVista / WebGPU / Plotly)
            if has_pyvista:
                renderer_choice = st.selectbox(
                    "Renderer",
                    options=["PyVista", "WebGPU", "Plotly"],
                    index=["PyVista", "WebGPU", "Plotly"].index(ss.get("renderer", "PyVista")),
                    key="renderer",
                    help=(
                        "**PyVista**: VTK-backed, camera persistence, high fidelity.\n"
                        "**WebGPU**: Experimental fast path (fragment shader gradient, large mesh friendly).\n"
                        "**Plotly**: Fallback surface/mesh renderer."
                    ),
                )
                if renderer_choice == "PyVista":
                    st.success("✨ PyVista active - camera persists")
                elif renderer_choice == "WebGPU":
                    ss.setdefault("webgpu_live_controls", False)
                    st.info("🚀 WebGPU experimental renderer active")
                    st.checkbox(
                        "WebGPU live controls",
                        key="webgpu_live_controls",
                        help=(
                            "When enabled, the WebGPU preview owns the critical sliders so geometry updates "
                            "instantly without Streamlit reruns. Disable to return controls to the sidebar."
                        ),
                    )
            else:
                st.info(
                    "💡 **PyVista not installed**\n\n"
                    "Install for GPU-accelerated rendering:\n"
                    "`pip install pyvista stpyvista`\n\n"
                    "Benefits: 60+ FPS, camera persistence, professional quality",
                )
        with col4:
            # Show edges option - now works for both PyVista and Plotly
            st.checkbox(
                "Show mesh edges",
                value=bool(ss.get("show_mesh_edges", False)),
                key="show_mesh_edges",
                help="Display wireframe edges on the mesh (PyVista and Plotly)",
            )

    # ---------------- HEALTH & WARNINGS ----------------
    # Collect dimension primitives from session state (fallbacks preserve legacy defaults)
    try:
        h = float(ss.get("H", 120.0))
        top_od = float(ss.get("top_od", 140.0))
        bottom_od = float(ss.get("bottom_od", 90.0))
        t_wall = float(ss.get("t_wall", 3.0))
        t_bottom = float(ss.get("t_bottom", 3.0))
        r_drain = float(ss.get("r_drain", 10.0))
        Rt = 0.5 * top_od
        Rb = 0.5 * bottom_od
        badges = _design_health(h, Rt, Rb, t_wall, t_bottom, r_drain)
    except Exception:
        badges = []
    if badges:
        st.subheader("Design health")
        cols: list[DeltaGenerator] = list(st.columns(len(badges))) if badges else []
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
            _maybe_r = getattr(style_config, "r_outer_fn", None)
            if callable(_maybe_r):
                export_r_outer = cast("Callable[..., Any]", _maybe_r)
            else:
                export_r_outer = r_outer_fn
            export_opts = style_config.opts
        except Exception:
            export_r_outer = r_outer_fn
            export_opts = engine_opts

        render_export_section(
            _has_library=_has_library,
            _library_read_only=_library_read_only,
            style_name=style_name,
            H=h,
            Rt=Rt,
            Rb=Rb,
            t_wall=t_wall,
            t_bottom=t_bottom,
            r_drain=r_drain,
            expn=expn,
            n_theta=n_theta,
            n_z=n_z,
            r_outer_fn=export_r_outer,
            opts=cast("StyleOpts", export_opts),
            name=str(
                ss.get("model_name")
                or ss.get("_design_name")
                or f"{style_name}_{int(h)}mm",
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
            h,
            Rt,
            Rb,
            t_wall,
            t_bottom,
            r_drain,
            expn,
            n_theta,
            n_z,
            r_outer_fn,
            cast("StyleOpts", engine_opts),
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
            H=h,
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
            h,
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
