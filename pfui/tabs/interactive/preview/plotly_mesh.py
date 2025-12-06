"""Full preview rendering using Plotly 3D mesh."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any, cast

from numpy import ndarray

from pfui._st import get_effective_st as get_st, safe_placeholder_image
from pfui.imports import build_pot_mesh

try:
    import plotly.graph_objects as go
    HAS_PLOTLY = True
except ImportError:
    HAS_PLOTLY = False


def render_full_preview_mesh(
    H: float,
    Rt: float,
    Rb: float,
    expn: float,
    preview_n_theta: int,
    preview_n_z: int,
    full_n_theta: int,
    full_n_z: int,
    n_theta: int,
    n_z: int,
    style_name: str,
    opts_json: str,
    t_wall: float,
    t_bottom: float,
    r_drain: float,
    r_outer_fn: Any,
    opts: dict[str, Any],
    mesh_data: tuple | None,
    geom_changed: bool,
    preview_mode: str,
    ss: dict[str, Any],
    geom_sig: tuple | None,
    app_sig: tuple | None,
    debounce_timeout_seconds: float,
    place_on_ground: bool,
    fig_h: float,
    mesh_placeholder: Any,
    preview_placeholder: Any,
    png_bytes: bytes | None,
    to_float_scalar: Callable[[Any], float],
    to_int_scalar: Callable[[Any], int],
) -> None:
    """Render full interactive mesh preview using Plotly Mesh3d.
    
    Args:
        H: Height
        Rt: Top radius
        Rb: Bottom radius
        expn: Expansion factor
        preview_n_theta: Preview angular divisions
        preview_n_z: Preview vertical divisions
        full_n_theta: Full preview angular divisions
        full_n_z: Full preview vertical divisions
        n_theta: User-selected angular divisions
        n_z: User-selected vertical divisions
        style_name: Style name
        opts_json: Style options as JSON
        t_wall: Wall thickness
        t_bottom: Bottom thickness
        r_drain: Drain radius
        r_outer_fn: Outer radius function
        opts: Style options dictionary
        mesh_data: Prebuilt mesh data (vertices, faces) or None
        geom_changed: Whether geometry changed
        preview_mode: Preview mode
        ss: Session state dictionary
        geom_sig: Geometry signature
        app_sig: Appearance signature
        debounce_timeout_seconds: Debounce timeout
        place_on_ground: Whether to place on ground
        fig_h: Figure height multiplier
        mesh_placeholder: Streamlit placeholder for mesh
        preview_placeholder: Streamlit placeholder for preview
        png_bytes: PNG bytes for fallback
        to_float_scalar: Function to convert to float scalar
        to_int_scalar: Function to convert to int scalar

    """
    st = get_st()
    if not HAS_PLOTLY:
        # Plotly not available: show static PNG fallback
        try:
            current_png = png_bytes or cast(
                "bytes | None", ss.get("_last_mesh_png"),
            )
            if current_png:
                safe_placeholder_image(
                    mesh_placeholder,
                    current_png,
                    caption="Full Preview (static)",
                    width="stretch",
                )
            else:
                mesh_placeholder.info("Full preview PNG not available yet.")
        except Exception:
            pass
        return

    try:
        t0_mesh = time.time()

        import numpy as np

        from pfui.colors import build_gradient_colors

        # Honor exact full preview: when enabled, do not reuse preview-res mesh_data
        use_exact_full = bool(cast("Any", ss.get("exact_full_preview", True)))
        V = None
        F = None

        # Reuse earlier mesh build; if missing (e.g., switched modes) build now
        if (
            (not use_exact_full)
            and (mesh_data is not None)
        ):
            V, F = mesh_data
        else:
            # If only appearance changed, try to reuse last cached geometry
            V = None
            F = None
            try:
                V = cast("Any", ss.get("_last_mesh_V"))
                F = cast("Any", ss.get("_last_mesh_F"))
            except Exception:
                V = None
                F = None
            # If exact is requested but the cached mesh uses different resolution, rebuild
            last_nt = cast("int | None", ss.get("_last_mesh_ntheta"))
            last_nz = cast("int | None", ss.get("_last_mesh_nz"))
            needs_exact_rebuild = bool(
                use_exact_full and ((last_nt != n_theta) or (last_nz != n_z)),
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
                        cast("Any", ss.get("exact_full_preview", True)),
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
                                "str", ss.get("preview_mode", preview_mode),
                            ),
                            preview_stale=bool(
                                cast("Any", ss.get("_preview_stale", False)),
                            ),
                            last_geom_sig=cast(
                                "tuple | None",
                                ss.get("_last_preview_geom_sig"),
                            ),
                            last_app_sig=cast(
                                "tuple | None", ss.get("_last_preview_app_sig"),
                            ),
                            geom_sig=geom_sig,
                            app_sig=app_sig,
                            debounce_timeout_s=to_float_scalar(
                                ss.get("debounce_timeout", 0.8),
                            ),
                            last_change_ts=cast(
                                "Any", ss.get("_last_change_ts", 0.0),
                            ),
                            interactive_mesh=True,
                            build_mesh_fn=build_pot_mesh,
                            t_wall=t_wall,
                            t_bottom=t_bottom,
                            r_drain=r_drain,
                            r_outer_fn=r_outer_fn,
                            style_opts=opts,
                        )
                        m_full = cast("Any", res_full.get("mesh"))
                    except Exception:
                        m_full = None
                    if m_full is not None:
                        try:
                            verts2, faces2, _diag2 = m_full
                        except Exception:
                            verts2, faces2 = m_full
                        V = cast("ndarray", _np_r.asarray(verts2))
                        F = cast("ndarray", _np_r.asarray(faces2))
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
                        V = cast("ndarray", _np_r.asarray(verts2))
                        F = cast("ndarray", _np_r.asarray(faces2))
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
        use_exact_full = bool(cast("Any", ss.get("exact_full_preview", True)))
        use_approx = False

        stride_used = 1
        Vd, Fd = V, F

        # =================================================================
        # MESH COLORING - Exactly matching old render_mesh_snapshot_cached
        # =================================================================
        use_gradient = bool(cast("Any", ss.get("use_gradient_color", True)))
        solid_hex = str(cast("Any", ss.get("solid_color", "#BFC7D5")))
        
        # Color by height - exactly like the old _render_plotly() code
        mesh_colors = None
        if len(Vd) and use_gradient:
            try:
                perf = st.session_state.setdefault("_perf_logs", [])
                perf.append(
                    f"mesh_plot_setup:verts={len(Vd)},faces={len(Fd)},approx={use_approx},stride={stride_used}",
                )
                st.session_state["_perf_logs"] = perf[-40:]
            except Exception:
                pass
            
            # Normalize Z values for gradient coloring
            z_norm = (Vd[:, 2] - Vd[:, 2].min()) / max(1e-6, (Vd[:, 2].max() - Vd[:, 2].min()))
            
            t0_col = time.time()
            try:
                # Exactly like old code: use build_gradient_colors
                preset = ss.get("preview_palette", "Custom")
                custom = [
                    ss.get("preview_grad_c1", "#2850D0"),
                    ss.get("preview_grad_c2", "#5FA8FF"),
                    ss.get("preview_grad_c3", "#E2F3FF"),
                ]
                mesh_colors = build_gradient_colors(
                    z_norm,
                    preset if preset != "Custom" else None,
                    custom,
                )
            except Exception:
                # Fallback to viridis colormap if build_gradient_colors fails
                try:
                    import matplotlib.pyplot as plt
                    colorscale = plt.get_cmap("viridis")
                    mesh_colors = [
                        [int(255 * r), int(255 * g), int(255 * b)]
                        for r, g, b, _ in colorscale(z_norm)
                    ]
                except Exception:
                    mesh_colors = None
            finally:
                try:
                    perf = st.session_state.setdefault("_perf_logs", [])
                    perf.append(
                        f"color_map:{(time.time() - t0_col) * 1000:.1f}ms",
                    )
                    st.session_state["_perf_logs"] = perf[-40:]
                except Exception:
                    pass

        # =================================================================
        # MESH3D CREATION - Exactly matching old _render_plotly() code
        # =================================================================
        # Key: DO NOT set lightposition - let Plotly use its defaults
        # This is the crucial difference from the broken code
        mesh_kwargs = dict(
            x=Vd[:, 0],
            y=Vd[:, 1],
            z=Vd[:, 2],
            i=Fd[:, 0],
            j=Fd[:, 1],
            k=Fd[:, 2],
            flatshading=False,  # Hardcoded like old code
            lighting=dict(
                # Increased ambient (0.5 vs 0.35) acts like soft fill light from all sides
                ambient=min(max(ss.get("mesh_ambient", 0.5), 0.0), 1.0),
                diffuse=min(max(ss.get("mesh_diffuse", 0.95), 0.0), 1.0),
                specular=min(max(ss.get("mesh_specular", 0.25), 0.0), 1.0),
                roughness=min(max(ss.get("mesh_roughness", 0.7), 0.0), 1.0),
                fresnel=min(max(ss.get("mesh_fresnel", 0.2), 0.0), 1.0),
            ),
            # NO lightposition - let Plotly use defaults (x=100000, y=100000, z=0)
            # Higher ambient compensates for single light source
            hoverinfo="skip",
            name="mesh",
            opacity=1.0,
        )
        if mesh_colors is not None:
            mesh_kwargs["vertexcolor"] = mesh_colors
        else:
            mesh_kwargs["color"] = solid_hex
        
        fig = go.Figure(data=[go.Mesh3d(**mesh_kwargs)])
        
        # =================================================================
        # LAYOUT - Matching old _render_plotly() code
        # =================================================================
        # Old code used: height_px = max(400, min(1000, int(110 * fig_h)))
        height_px = max(400, min(1000, to_int_scalar(110 * fig_h)))
        # Symmetric XY extents and ortho projection to avoid elongation
        try:
            rmax = float(max(abs(V[:, 0]).max(), abs(V[:, 1]).max()))
            zmin = float(V[:, 2].min())
            zmax = float(V[:, 2].max())
        except Exception:
            rmax = max(1.0, to_float_scalar(ss.get("top_od", 140.0)) * 0.5)
            zmin, zmax = 0.0, to_float_scalar(ss.get("H", 120.0))
        xlim = [-rmax, rmax]
        ylim = [-rmax, rmax]
        zlim = [zmin, zmax]
        z_ratio = (zmax - zmin) / max(1e-6, (xlim[1] - xlim[0]))
        # Title includes mesh resolution and face count
        try:
            _nt_used = to_int_scalar(ss.get("_last_mesh_ntheta", 0)) or (
                int(V.shape[0]) // max(1, (n_z if n_z else 1))
            )
        except Exception:
            _nt_used = 0
        try:
            _nz_used = to_int_scalar(ss.get("_last_mesh_nz", 0)) or (
                int(V.shape[0]) // max(1, (n_theta if n_theta else 1))
            )
        except Exception:
            _nz_used = 0
        title_txt = (
            f"Full preview (triangles {len(Fd):,}, exact={use_exact_full})"
        )

        # Build scene configuration - exactly matching old app.py code
        scene_config = dict(
            xaxis=dict(visible=False, range=xlim),
            yaxis=dict(visible=False, range=ylim),
            zaxis=dict(visible=False, range=zlim),
            aspectmode="manual",
            aspectratio=dict(x=1, y=1, z=min(0.85, z_ratio)),
            # Matching old code's camera and background exactly
            camera=dict(up=dict(x=0, y=0, z=1), projection=dict(type='orthographic')),
            bgcolor=ss.get("preview_bg_color", "#0E1117"),
        )

        fig.update_layout(
            height=height_px,
            title=title_txt,
            scene=scene_config,
            margin=dict(l=0, r=0, t=30, b=0),
        )

        # Render - Plotly will handle interaction state internally during this render
        mesh_placeholder.plotly_chart(
            fig,
            use_container_width=True,
            config={"displaylogo": False},
        )
        t1_mesh = time.time()
        
        # CRITICAL: Clear quick preview placeholder now that full mesh is displayed
        # This prevents the quick preview from persisting alongside the full mesh
        try:
            if preview_placeholder is not None:
                preview_placeholder.empty()
        except Exception:
            pass
        
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
    except Exception as e:
        # Fallback to last known mesh PNG if available
        try:
            last_png = cast("bytes | None", ss.get("_last_mesh_png"))
            if last_png:
                safe_placeholder_image(
                    mesh_placeholder,
                    last_png,
                    caption="Full Preview (PNG fallback)",
                    width="stretch",
                )
            else:
                mesh_placeholder.info(
                    f"Mesh preview unavailable (no fallback): {e}",
                )
        except Exception:
            mesh_placeholder.info(f"Mesh preview unavailable (error): {e}")
