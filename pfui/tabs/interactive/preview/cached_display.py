"""Display cached previews when not updating.

This module handles displaying previously cached preview artifacts
when in manual mode or when updates are suppressed.
"""

from __future__ import annotations

from inspect import signature
from typing import Any, cast

from pfui._st import get_effective_st as get_st, safe_placeholder_image
from pfui.colors import resolve_background_style
from pfui.state import get_webgpu_camera_snapshot, webgpu_camera_signature


def _plotly_supports_width() -> bool:
    try:
        return "width" in signature(get_st().plotly_chart).parameters
    except (ValueError, TypeError, AttributeError):
        return False


# Cache the value once so we avoid repeated reflection checks in the hot path.
_PLOTLY_SUPPORTS_WIDTH = _plotly_supports_width()


def _plotly_chart_full_width(target: Any, figure: Any, **kwargs: Any) -> None:
    """Render a Plotly chart that fills the available width across Streamlit versions."""
    width_kwargs: dict[str, Any] = {"width": "stretch"} if _PLOTLY_SUPPORTS_WIDTH else {"use_container_width": True}
    target.plotly_chart(figure, **width_kwargs, **kwargs)


def _render_cached_webgpu_preview(
    ss: dict[str, Any],
    mesh_placeholder: Any,
    show_warning: bool,
) -> bool:
    """Re-render the last WebGPU preview without regenerating geometry."""
    cached = cast("dict[str, Any] | None", ss.get("_webgpu_last_render"))
    if not cached:
        return False
    params = cached.get("params")
    if not isinstance(params, dict) or not params:
        return False

    try:
        from .webgpu_renderer import render_webgpu_preview as _webgpu
    except Exception:
        return False

    params = dict(params)
    camera_state = get_webgpu_camera_snapshot(ss)
    camera_signature = webgpu_camera_signature(camera_state)
    cached_signature = tuple(cached.get("camera_signature") or ())
    params.update(camera_state)
    if camera_signature != cached_signature:
        cached["camera_signature"] = camera_signature
        cached["params"] = dict(params)

    height_px = int(cached.get("height_px", 600))
    bg_mode = str(ss.get("preview_bg_mode", "gradient"))
    bg_color = str(ss.get("preview_bg_color", "#242B46"))
    bg_grad_start = str(ss.get("preview_bg_grad_start", bg_color))
    bg_grad_end = str(ss.get("preview_bg_grad_end", "#060A14"))
    bg_grad_angle = float(ss.get("preview_bg_grad_angle", 180.0))
    default_bg_style, default_bg_rgba, default_bg_mode = resolve_background_style(
        bg_mode,
        bg_color,
        bg_grad_start,
        bg_grad_end,
        bg_grad_angle,
    )
    background_color = str(cached.get("background_color", default_bg_style))
    cached_rgba = cached.get("background_rgba")
    if isinstance(cached_rgba, (list, tuple)) and len(cached_rgba) >= 4:
        background_rgba = tuple(float(x) for x in cached_rgba[:4])  # type: ignore[assignment]
    else:
        background_rgba = default_bg_rgba
    background_mode = str(cached.get("background_mode", default_bg_mode))
    gradient = cached.get("gradient")
    widget_key = str(cached.get("widget_key", "webgpu_full_preview"))
    canvas_id = str(cached.get("canvas_id", "wgpu-canvas"))
    caption_text = str(cached.get("caption", "WebGPU Preview"))

    with mesh_placeholder.container():
        _webgpu(
            None,
            None,
            params=params,
            height_px=height_px,
            background_color=background_color,
            background_rgba=background_rgba,
            background_mode=background_mode,
            gradient=gradient,
            widget_key=widget_key,
            canvas_id=canvas_id,
        )
        suffix = " (out of date)" if show_warning else ""
        get_st().caption(f"{caption_text}{suffix}")

    return True



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
    last_mesh_png = cast("bytes | None", ss.get("_last_mesh_png"))
    last_mesh_json = cast("dict | None", ss.get("_last_mesh_fig_json"))
    last_surf_png = cast("bytes | None", ss.get("_last_surface_png"))
    last_surf_json = cast("dict | None", ss.get("_last_surface_fig_json"))

    stale = bool(cast("Any", ss.get("_preview_stale", False)))
    show_warning = (preview_mode == "manual") and stale

    # Cached display: if Full preview exists, prefer it; otherwise show Quick if available.
    full_exists = bool((HAS_PLOTLY and last_mesh_json) or last_mesh_png)
    quick_exists = bool((HAS_PLOTLY and last_surf_json) or last_surf_png)

    renderer_active = str(ss.get("_active_renderer", ss.get("renderer", "")))
    has_cached_webgpu = isinstance(ss.get("_webgpu_last_render"), dict)
    skip_webgpu_rerender = interactive_mesh and renderer_active == "WebGPU" and has_cached_webgpu

    rendered_webgpu = False
    if skip_webgpu_rerender:
        # Module 11 in preview_impl.py will handle displaying the cached WebGPU
        # component to avoid duplicate Streamlit keys in a single rerun.
        rendered_webgpu = True
        full_exists = True
    elif interactive_mesh and renderer_active == "WebGPU":
        rendered_webgpu = _render_cached_webgpu_preview(ss, mesh_placeholder, show_warning)
        if rendered_webgpu:
            full_exists = True

    # Show Full if it exists
    if not rendered_webgpu:
        if interactive_mesh and full_exists and HAS_PLOTLY and last_mesh_json:
            try:
                import plotly.graph_objects as go
                f_m = go.Figure(last_mesh_json)
                _plotly_chart_full_width(
                    mesh_placeholder,
                    f_m,
                    config={"displaylogo": False},
                )
            except Exception:
                    if last_mesh_png:
                        safe_placeholder_image(
                            mesh_placeholder,
                            last_mesh_png,
                            caption=(
                                "Full Preview (out of date)"
                                if show_warning
                                else "Full Preview"
                            ),
                            width="stretch",
                        )
        elif interactive_mesh and full_exists and last_mesh_png:
                    safe_placeholder_image(
                        mesh_placeholder,
                        last_mesh_png,
                        caption=(
                            "Full Preview (out of date)" if show_warning else "Full Preview"
                        ),
                        width="stretch",
                    )

    # Show Quick preview if Full doesn't exist
    if not full_exists and quick_exists:
        if HAS_PLOTLY and last_surf_json:
            try:
                import plotly.graph_objects as go
                f_s = go.Figure(last_surf_json)
                _plotly_chart_full_width(
                    preview_placeholder,
                    f_s,
                    config={"displaylogo": False},
                )
            except Exception:
                if last_surf_png:
                    safe_placeholder_image(
                        preview_placeholder,
                        last_surf_png,
                        caption=(
                            "Quick Preview (out of date)"
                            if show_warning
                            else "Quick Preview"
                        ),
                        width="stretch",
                    )
        elif last_surf_png:
                safe_placeholder_image(
                    preview_placeholder,
                    last_surf_png,
                    caption=("Quick Preview (out of date)" if show_warning else "Quick Preview"),
                    width="stretch",
                )

    # Dynamic placeholder: use a session flag so static analysis won't mark as unreachable
    if bool(cast("Any", ss.get("_quick_preview_disabled", False))):
        # Quick Preview is explicitly disabled by user: replace any previous preview
        try:
            preview_placeholder.info("Quick Preview is disabled")
        except Exception:
            try:
                preview_placeholder.empty()
            except Exception:
                pass
