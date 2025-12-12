"""Camera persistence for 3D preview orientation.

This module provides utilities to persist Plotly 3D camera positions across
preview regenerations using Plotly's uirevision feature.
"""

from __future__ import annotations

from typing import Any

from pfui._st import get_effective_st as get_st


def get_default_camera() -> dict[str, Any]:
    """Get default camera configuration for 3D preview.
    
    Returns:
        Default camera dict compatible with Plotly scene.camera

    """
    return {
        "eye": {"x": 1.25, "y": 1.25, "z": 1.0},
        "center": {"x": 0, "y": 0, "z": 0},
        "up": {"x": 0, "y": 0, "z": 1},
        "projection": {"type": "orthographic"},
    }


def inject_camera_capture() -> None:
    """Inject camera capture - simplified to rely on uirevision.
    
    Plotly's uirevision handles camera persistence automatically when
    the layout has a stable uirevision value across updates.
    """
    # No-op - relying on uirevision in plotly_chart instead


def load_persisted_camera() -> dict[str, Any] | None:
    """Load persisted camera from session state.
    
    Returns:
        Camera dict if available, None otherwise

    """
    return get_st().session_state.get("_preview_camera")


def render_camera_controls() -> None:
    """Render UI info about camera behavior.
    
    Camera persistence now works via Plotly's uirevision feature.
    """
    # uirevision handles camera persistence - no info needed
    pass


def apply_camera_to_scene(
    scene_config: dict[str, Any],
    session_state: dict[str, Any],
) -> dict[str, Any]:
    """Apply persisted camera to Plotly scene configuration.
    
    Args:
        scene_config: Plotly scene dict
        session_state: Streamlit session state
        
    Returns:
        Updated scene_config with camera applied

    """
    persisted = session_state.get("_preview_camera")

    if persisted:
        scene_config["camera"] = persisted
    elif "camera" not in scene_config:
        scene_config["camera"] = get_default_camera()

    return scene_config


__all__ = [
    "apply_camera_to_scene",
    "get_default_camera",
    "inject_camera_capture",
    "load_persisted_camera",
    "render_camera_controls",
]
