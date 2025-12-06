"""WebGPU Streamlit component wrapper."""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from pfui._st import get_components_v1

from ._schema import WebGPUEvent, WebGPUProps

_COMPONENT_NAME = "potfoundry_webgpu"
_COMPONENT_DIR = Path(__file__).parent
_BUILD_DIR = _COMPONENT_DIR / "frontend_build"
_DEV_SERVER_ENV = "POTFOUNDRY_WGPU_DEV_SERVER"
_DEBUG_ENV = "POTFOUNDRY_WGPU_DEBUG"
_DEBUG_PARAM_KEY = "__pf_wgpu_debug__"
_LOGGER = logging.getLogger(__name__)


def _find_repo_root(start_dir: Path) -> Path | None:
    """Return the repository root by walking upward until sentinel files are found."""
    for ancestor in (start_dir, *start_dir.parents):
        if (ancestor / ".git").is_dir() or (ancestor / "pyproject.toml").is_file():
            return ancestor
    return None


def _discover_build_path() -> Path:
    """Locate the WebGPU build directory using a couple of fallback strategies."""
    candidates: list[Path] = [_BUILD_DIR]
    repo_root = _find_repo_root(_COMPONENT_DIR)
    if repo_root:
        legacy_target = repo_root / "pfui" / "pfui" / "components" / "webgpu_component" / "frontend_build"
        if legacy_target not in candidates:
            candidates.append(legacy_target)

        for potential in repo_root.glob("**/webgpu_component/frontend_build"):
            if potential not in candidates:
                candidates.append(potential)
                break

    for path in candidates:
        if path.is_dir():
            _LOGGER.info("WebGPU component using build path %s", path)
            return path

    searched = ", ".join(str(path) for path in candidates)
    raise FileNotFoundError(
        "WebGPU component build missing. Looked in: " f"{searched}. Run `npm run build` inside frontend/.",
    )


@lru_cache(maxsize=1)
def _get_component():
    dev_url = os.environ.get(_DEV_SERVER_ENV)
    if dev_url:
        _LOGGER.info("WebGPU component using dev server %s", dev_url)
        # Resolve the current Streamlit components module at runtime
        comps = get_components_v1()
        return comps.declare_component(_COMPONENT_NAME, url=dev_url)

    build_path = _discover_build_path()
    comps = get_components_v1()
    return comps.declare_component(_COMPONENT_NAME, path=str(build_path))


def _debug_mode_enabled() -> bool:
    value = os.environ.get(_DEBUG_ENV, "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def render_webgpu_component(
    params: dict[str, Any],
    *,
    height_px: int = 600,
    background_color: str = "#242B46",
    background_rgba: tuple[float, float, float, float] | None = None,
    background_mode: str | None = None,
    gradient: tuple[str, str, str] | None = None,
    widget_key: str = "webgpu_preview",
    canvas_id: str = "wgpu-canvas",
    embedded_ui: bool = False,
    panel_open: bool = True,
    live_controls: dict[str, Any] | None = None,
    library_data: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Render the WebGPU component and return the last structured event if present.
    
    Args:
        params: WebGPU parameter payload (geometry, style, etc.)
        height_px: Viewport height in pixels
        background_color: Container background color
        background_rgba: Canvas clear color as normalized RGBA floats
        background_mode: Selected background mode (solid/gradient)
        gradient: Three-stop gradient colors
        widget_key: Streamlit widget key
        canvas_id: DOM id applied to the canvas
        embedded_ui: Enable embedded UI panel with Zustand-powered controls
        panel_open: Initial state of the embedded UI panel
        live_controls: Optional metadata for live controls
        library_data: Library response data (design lists, publish results)
    
    Returns:
        Structured event dict if present, None otherwise
    """
    payload: dict[str, Any] = dict(params or {})
    if gradient is not None and "gradient" not in payload:
        try:
            payload["gradient"] = list(gradient)
        except Exception:
            pass
    debug_enabled = _debug_mode_enabled()
    if debug_enabled:
        payload[_DEBUG_PARAM_KEY] = True
        _LOGGER.debug("WebGPU component running with debug instrumentation enabled")
    gradient_list = list(gradient) if gradient else None
    props = WebGPUProps(
        params=payload,
        height_px=height_px,
        background_color=background_color,
        background_rgba=list(background_rgba) if background_rgba is not None else None,
        background_mode=background_mode,
        gradient=gradient_list,
        widget_key=widget_key,
        canvas_id=canvas_id,
        debug_mode=debug_enabled,
        embedded_ui=embedded_ui,
        panel_open=panel_open,
        live_controls=live_controls,
        library_data=library_data,
    )
    component = _get_component()
    _LOGGER.debug(
        "Rendering WebGPU component key=%s height=%s live_controls=%s",
        widget_key,
        height_px,
        bool(live_controls),
    )
    result = component(**props.model_dump(), key=widget_key, default=None)
    _LOGGER.debug("WebGPU component raw result for key %s: %r", widget_key, result)
    if result is None:
        return None
    event = WebGPUEvent(**result)
    return event.model_dump()


__all__ = ["render_webgpu_component"]
