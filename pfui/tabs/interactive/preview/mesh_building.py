"""Mesh building for preview with orchestration and debugging."""

from __future__ import annotations

import time
from typing import Any, Optional, cast

import streamlit as st

from pfui.imports import build_pot_mesh


def build_preview_mesh(
    H: float,
    Rt: float,
    Rb: float,
    expn: float,
    preview_n_theta: int,
    preview_n_z: int,
    full_n_theta: int,
    full_n_z: int,
    style_name: str,
    opts_json: str,
    t_wall: float,
    t_bottom: float,
    r_drain: float,
    r_outer_fn: Any,
    opts: dict[str, Any],
    geom_changed: bool,
    interactive_mesh: bool,
    preview_mode: str,
    ss: dict[str, Any],
    geom_sig: Optional[tuple],
    app_sig: Optional[tuple],
    debounce_timeout_seconds: float,
    place_on_ground: bool,
) -> tuple[Optional[tuple], bool]:
    """Build mesh for interactive preview with caching and orchestration.

    Args:
        H: Height
        Rt: Top radius
        Rb: Bottom radius
        expn: Expansion factor
        preview_n_theta: Preview angular divisions
        preview_n_z: Preview vertical divisions
        full_n_theta: Full preview angular divisions
        full_n_z: Full preview vertical divisions
        style_name: Style name
        opts_json: Style options as JSON
        t_wall: Wall thickness
        t_bottom: Bottom thickness
        r_drain: Drain radius
        r_outer_fn: Outer radius function
        opts: Style options dictionary
        geom_changed: Whether geometry changed
        interactive_mesh: Whether interactive mesh is enabled
        preview_mode: Preview mode
        ss: Session state dictionary
        geom_sig: Geometry signature
        app_sig: Appearance signature
        debounce_timeout_seconds: Debounce timeout
        place_on_ground: Whether to place on ground

    Returns:
        Tuple of (mesh_data, built_via_orchestrator)
        where mesh_data is (vertices, faces) or None
    """
    mesh_data = None
    built_via_orchestrator = False

    # Build mesh only when geometry/style changed; appearance-only changes reuse previous mesh
    do_mesh_build = bool(interactive_mesh and geom_changed)

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
                preview_mode=cast(str, ss.get("preview_mode", preview_mode)),
                preview_stale=bool(cast(Any, ss.get("_preview_stale", False))),
                last_geom_sig=cast(Optional[tuple], ss.get("_last_preview_geom_sig")),
                last_app_sig=cast(Optional[tuple], ss.get("_last_preview_app_sig")),
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
                _display_seam_debug(opts, diag, ss)
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
            # If seam debug samples are present, show them
            _display_seam_debug(opts, diag, ss)
        except Exception:
            pass

    return mesh_data, built_via_orchestrator


def _display_seam_debug(opts: dict[str, Any], diag: Any, ss: dict[str, Any]) -> None:
    """Display seam debug samples if debugging is enabled.

    Args:
        opts: Style options dictionary
        diag: Diagnostics dictionary from mesh build
        ss: Session state dictionary
    """
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
        ss.setdefault("_debug_logs", []).append(f"Seam debug display failed: {_e_dbg}")
