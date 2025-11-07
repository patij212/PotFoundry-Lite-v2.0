"""PNG rendering and fallback for preview when Plotly unavailable.

This module handles PNG generation for both mesh and surface previews,
with caching and performance tracking.
"""

from __future__ import annotations

import time
from typing import Any, Optional, cast


def render_preview_png_fallback(
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
    fig_w: float,
    fig_h: float,
    dpi: int,
    t_wall: float,
    show_inner: bool,
    place_on_ground: bool,
    view_elev: float,
    view_azim: float,
    interactive_mesh: bool,
    HAS_PLOTLY: bool,
    ss: dict[str, Any],
    to_int_scalar_fn,
) -> Optional[bytes]:
    """Generate PNG fallback when Plotly is unavailable or forced.

    Args:
        H: Height in mm
        Rt: Top radius in mm
        Rb: Bottom radius in mm
        expn: Expansion exponent
        preview_n_theta: Preview theta resolution
        preview_n_z: Preview z resolution
        full_n_theta: Full theta resolution
        full_n_z: Full z resolution
        style_name: Style name
        opts_json: Style options as JSON
        fig_w: Figure width
        fig_h: Figure height
        dpi: DPI for rendering
        t_wall: Wall thickness (for inner wall display)
        show_inner: Whether to show inner wall
        place_on_ground: Whether to place pot on ground
        view_elev: View elevation angle
        view_azim: View azimuth angle
        interactive_mesh: Whether interactive mesh is enabled
        HAS_PLOTLY: Whether Plotly is available
        ss: Session state dictionary
        to_int_scalar_fn: Function to convert to int scalar

    Returns:
        PNG bytes if successful, None otherwise
    """
    try:
        force_capture = bool(cast(Any, ss.get("_force_mesh_png_capture", False)))
        # Cap PNG mesh resolution aggressively to keep it cheap
        png_cap_n = to_int_scalar_fn(ss.get("png_cap_n", 64))

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

            # Build appearance key from session state
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
                if interactive_mesh and force_capture:
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
                    from pfui.preview import render_preview_png_cached

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

        return png_bytes

    except Exception:
        return None  # PNG generation is best-effort; failures shouldn't break the app
