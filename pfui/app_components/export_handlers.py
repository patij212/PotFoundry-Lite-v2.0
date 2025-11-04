"""Export and preview asset actions extracted from app.py.

This module centralizes the Export STL button, mesh capture, and
preview download buttons while preserving existing app semantics.
"""

from __future__ import annotations

from typing import Any, Optional, cast

import streamlit as st


def render_export_widgets(
    *,
    col_actions: Any,
    col_status: Any,
    model_name: str,
    fig_h_inches: float,
    has_plotly: bool,
) -> bool:
    """Render export/capture/download widgets and return whether export was requested.

    Args:
        col_actions: Streamlit column for action buttons (Export, Capture).
        col_status: Streamlit column for status and downloads.
        model_name: Base name for exported/downloaded files.
        fig_h_inches: Figure height in inches for SVG sizing heuristics.
        has_plotly: Whether Plotly is available for SVG export.

    Returns:
        True if the user clicked Export STL in this run; otherwise False.
    """
    ss = cast(dict[str, Any], st.session_state)

    do_export = col_actions.button("Export STL…", type="primary", key="export_btn")

    # Force static mesh PNG capture (even if only appearance changed)
    if col_actions.button(
        "Capture static mesh PNG",
        key="force_mesh_capture",
        help=(
            "Regeneruj statyczny obraz siatki niezależnie od tego czy geometria się zmieniła."
        ),
    ):
        ss["_force_mesh_png_capture"] = True
        ss["_preview_stale"] = True
        try:
            st.rerun()
        except Exception:
            pass

    # Cached / regen status indicator
    last_mesh_regen = cast(Optional[bool], ss.get("_last_mesh_png_regenerated", None))
    last_mesh_time = cast(Optional[float], ss.get("_last_mesh_png_time_ms", None))
    if last_mesh_regen is not None:
        status = "regenerated" if last_mesh_regen else "cached"
        extra = f" ({last_mesh_time:.0f} ms)" if last_mesh_time is not None else ""
        col_status.caption(f"Mesh PNG: {status}{extra} — auto=off")

    # Offer preview image downloads (PNG, optional SVG) using cached previews
    try:
        surf_png = cast(Optional[bytes], ss.get("_last_surface_png"))
        mesh_png = cast(Optional[bytes], ss.get("_last_mesh_png"))
        # Two compact columns for download buttons if available
        d1, d2 = col_status.columns(2)
        if surf_png:
            d1.download_button(
                "Download Quick Preview PNG",
                data=surf_png,
                file_name=f"{model_name}_preview_quick.png",
                mime="image/png",
            )
            # Optional SVG via Plotly if possible
            if has_plotly and cast(Optional[dict], ss.get("_last_surface_fig_json")):
                try:
                    # Local import to avoid hard dependency
                    import plotly.graph_objects as go

                    fig = go.Figure(
                        cast(Optional[dict], ss.get("_last_surface_fig_json"))
                    )
                    # Heuristic sizing with clamped bounds (px)
                    w = max(400, min(900, int(96 * float(fig_h_inches))))
                    h = max(300, min(800, int(96 * float(fig_h_inches))))
                    svg_bytes = fig.to_image(format="svg", width=w, height=h)
                    if svg_bytes:
                        d2.download_button(
                            "Download Quick Preview SVG",
                            data=svg_bytes,
                            file_name=f"{model_name}_preview_quick.svg",
                            mime="image/svg+xml",
                        )
                except Exception:
                    pass
        if mesh_png:
            col_status.download_button(
                "Download Full Preview PNG",
                data=mesh_png,
                file_name=f"{model_name}_preview_full.png",
                mime="image/png",
            )
    except Exception:
        pass

    return bool(do_export)


__all__ = ["render_export_widgets"]
