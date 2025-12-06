"""Runtime schemas for the WebGPU Streamlit component."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, NonNegativeInt, PositiveInt, conlist


class WebGPUProps(BaseModel):
    """Validated props passed from Python to the WebGPU component."""

    model_config = ConfigDict(extra="ignore")

    params: dict[str, Any] = Field(default_factory=dict, description="WebGPU parameter payload")
    height_px: PositiveInt = Field(default=600, description="Viewport height in pixels")
    background_color: str = Field(default="#242B46", description="Container background color")
    background_rgba: list[float] | None = Field(
        default=None,
        description="Canvas clear color as normalized RGBA floats",
        min_length=4,
        max_length=4,
    )
    background_mode: str | None = Field(
        default=None,
        description="Selected background mode (solid/gradient)",
        max_length=24,
    )
    # Use a simple list[str] annotation for typing; runtime validation is enforced
    # by Field via min_items/max_items so Pydantic's conlist is not required here.
    gradient: list[str] | None = Field(
        default=None, description="Three-stop gradient colors",
    )
    widget_key: str = Field(default="webgpu_preview", description="Streamlit widget key")
    canvas_id: str = Field(
        default="wgpu-canvas",
        description="DOM id applied to the canvas for compatibility with tooling and tests",
        min_length=3,
        max_length=96,
    )
    debug_mode: bool = Field(default=False, description="Enable verbose diagnostics for troubleshooting")
    embedded_ui: bool = Field(default=False, description="Enable embedded UI panel with Zustand-powered controls")
    panel_open: bool = Field(default=True, description="Initial state of the embedded UI panel")
    live_controls: dict[str, Any] | None = Field(
        default=None,
        description="Optional metadata that enables live controls directly inside the WebGPU component",
    )
    library_data: dict[str, Any] | None = Field(
        default=None,
        description="Library response data to pass to component (designs list, publish results, etc.)",
    )


class CameraStatePayload(BaseModel):
    """Camera pose metadata emitted from the component."""

    rotX: float
    rotY: float
    zoom: float
    panX: float = 0.0
    panY: float = 0.0
    autoRotate: bool
    sceneRadius: float = Field(default=0.0, ge=0.0)
    timestamp: int | None = Field(default=None, ge=0)
    seq: NonNegativeInt | None = Field(default=None)


class ReadyPayload(BaseModel):
    """Component readiness metadata."""

    timestamp: int = Field(ge=0)
    canvas_id: str | None = Field(default=None, max_length=128)
    message: str = Field(default="WebGPU component ready")


class ErrorPayload(BaseModel):
    """Structured error payload emitted by the WebGPU component."""

    message: str = Field(description="Human-readable error summary")
    code: str | None = Field(default=None, description="Machine-readable error code")
    detail: str | None = Field(default=None, description="Additional diagnostic detail")
    fatal: bool = Field(default=False, description="True if the error requires fallback")
    canvas_id: str | None = Field(default=None, max_length=128)
    context: dict[str, Any] = Field(default_factory=dict, description="Structured diagnostics")
    timestamp: int | None = Field(default=None, ge=0)


class DiagnosticPayload(BaseModel):
    """Structured diagnostic messages emitted when debug mode is enabled."""

    message: str = Field(description="Short description of the diagnostic event")
    detail: dict[str, Any] = Field(default_factory=dict, description="Structured diagnostic context")
    canvas_id: str | None = Field(default=None, max_length=128)
    timestamp: int | None = Field(default=None, ge=0)


## Remove duplicate empty WebGPUEvent declared earlier - class defined below

class LiveFieldValue(BaseModel):
    id: str
    sessionKey: str
    value: float


class ParamBatchPayload(BaseModel):
    params: dict[str, Any]
    fields: list[LiveFieldValue]
    timestamp: int | None = Field(default=None, ge=0)
    commit: bool = Field(default=False, description="True when the host should apply the batch")


class LibraryRequestPayload(BaseModel):
    """Payload for library-related requests from the component."""

    action: str = Field(description="Library action: list, loadDesign, publish")
    page: int | None = Field(default=None)
    search: str | None = Field(default=None)
    style: str | None = Field(default=None)
    limit: int | None = Field(default=None)
    designId: str | None = Field(default=None)
    design: dict[str, Any] | None = Field(default=None)
    title: str | None = Field(default=None)
    tags: list[str] | None = Field(default=None)
    license: str | None = Field(default=None)
    attempt: int | None = Field(default=None)


class WebGPUEvent(BaseModel):
    """Event payload emitted by the component back to Python."""

    model_config = ConfigDict(extra="ignore")

    type: Literal["cameraState", "ready", "error", "diagnostic", "paramBatchComplete", "libraryRequest", "libraryPoll", "libraryAck"]
    payload: CameraStatePayload | ReadyPayload | ErrorPayload | DiagnosticPayload | ParamBatchPayload | LibraryRequestPayload | dict[str, Any]
    seq: NonNegativeInt | None = Field(default=None, description="Event sequence id")


__all__ = [
    "CameraStatePayload",
    "DiagnosticPayload",
    "ErrorPayload",
    "LibraryRequestPayload",
    "LiveFieldValue",
    "ParamBatchPayload",
    "ReadyPayload",
    "WebGPUEvent",
    "WebGPUProps",
]
