"""Display cached previews when not updating.

This module handles displaying previously cached preview artifacts
when in manual mode or when updates are suppressed.
"""

from __future__ import annotations

from typing import Any, Optional, cast


def display_cached_preview(
    preview_mode: str,
    interactive_mesh: bool,
    HAS_PLOTLY: bool,
    ss: dict[str, Any],
    mesh_placeholder: Any,
    preview_placeholder: Any,
) -> None:
    """Display cached preview artifacts when not updating.

    Shows previously generated previews from session state cache.
    Displays warning in manual mode when preview is out of date.

    Args:
        preview_mode: One of "auto", "manual", or "debounced"
        interactive_mesh: Whether interactive mesh is enabled
        HAS_PLOTLY: Whether Plotly is available
        ss: Session state dictionary
        mesh_placeholder: Streamlit placeholder for mesh preview
        preview_placeholder: Streamlit placeholder for quick preview
    """
    # Cast cached preview artifacts to concrete optionals for the type checker
    last_mesh_png = cast(Optional[bytes], ss.get("_last_mesh_png"))
    last_mesh_json = cast(Optional[dict], ss.get("_last_mesh_fig_json"))
    last_surf_png = cast(Optional[bytes], ss.get("_last_surface_png"))
    last_surf_json = cast(Optional[dict], ss.get("_last_surface_fig_json"))

    stale = bool(cast(Any, ss.get("_preview_stale", False)))
    show_warning = (preview_mode == "manual") and stale

    # Cached display: if Full preview exists, prefer it; otherwise show Quick if available.
    full_exists = bool((HAS_PLOTLY and last_mesh_json) or last_mesh_png)
    quick_exists = bool((HAS_PLOTLY and last_surf_json) or last_surf_png)

    # Show Full if it exists
    if interactive_mesh and full_exists and HAS_PLOTLY and last_mesh_json:
        try:
            import plotly.graph_objects as go

            f_m = go.Figure(last_mesh_json)
            mesh_placeholder.plotly_chart(
                f_m, use_container_width=True, config={"displaylogo": False}
            )
        except Exception:
            if last_mesh_png:
                mesh_placeholder.image(
                    last_mesh_png,
                    caption=(
                        "Full Preview (out of date)" if show_warning else "Full Preview"
                    ),
                    width="stretch",
                )
    elif interactive_mesh and full_exists and last_mesh_png:
        mesh_placeholder.image(
            last_mesh_png,
            caption=("Full Preview (out of date)" if show_warning else "Full Preview"),
            width="stretch",
        )

    # Show Quick preview if Full doesn't exist
    if not full_exists and quick_exists:
        if HAS_PLOTLY and last_surf_json:
            try:
                import plotly.graph_objects as go

                f_s = go.Figure(last_surf_json)
                preview_placeholder.plotly_chart(
                    f_s, use_container_width=True, config={"displaylogo": False}
                )
            except Exception:
                if last_surf_png:
                    preview_placeholder.image(
                        last_surf_png,
                        caption=(
                            "Quick Preview (out of date)"
                            if show_warning
                            else "Quick Preview"
                        ),
                        width="stretch",
                    )
        elif last_surf_png:
            preview_placeholder.image(
                last_surf_png,
                caption=(
                    "Quick Preview (out of date)" if show_warning else "Quick Preview"
                ),
                width="stretch",
            )

    # Dynamic placeholder: use a session flag so static analysis won't mark as unreachable
    if bool(cast(Any, ss.get("_quick_preview_disabled", False))):
        # Quick Preview is explicitly disabled by user: replace any previous preview
        try:
            preview_placeholder.info("Quick Preview is disabled")
        except Exception:
            try:
                preview_placeholder.empty()
            except Exception:
                pass
