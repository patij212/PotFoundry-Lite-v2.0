
from collections.abc import Iterable
from typing import Any

import numpy as np

# Use a simple alias for ndarray to keep signatures readable
NDArray = np.ndarray


class PolyData:
    """Conservative stub for `pyvista.PolyData` used by the UI code.

    Only the attributes and methods used in the project are declared here.
    """

    points: NDArray
    point_data: dict[str, NDArray]
    n_cells: int

    def __init__(self, points: NDArray | None = None, faces: NDArray | None = None) -> None: ...

    def copy(self) -> PolyData: ...

    def decimate_pro(self, *args: Any, **kwargs: Any) -> PolyData: ...

    @property
    def bounds(self) -> tuple[float, float, float, float, float, float]: ...


class Camera:
    position: tuple[float, float, float]
    focal_point: tuple[float, float, float]
    up: tuple[float, float, float]
    parallel_projection: bool
    parallel_scale: float
    view_angle: float
    clipping_range: tuple[float, float]

    def zoom(self, factor: float) -> None: ...


class RenderWindow:
    def SetMultiSamples(self, v: int) -> None: ...
    def LineSmoothingOff(self) -> None: ...
    def PointSmoothingOff(self) -> None: ...
    def SetUseOffScreenBuffers(self, v: bool) -> None: ...


class Plotter:
    """Conservative stub for `pyvista.Plotter`.

    Members and methods are restricted to those used in the UI code.
    """

    camera: Camera
    render_window: RenderWindow
    background_color: tuple[float, float, float]
    camera_position: Any

    def __init__(self, window_size: Iterable[int] | None = None, off_screen: bool = False) -> None: ...
    def close(self) -> None: ...
    def add_mesh(self, mesh: PolyData, **kwargs: Any) -> Any: ...
    def render(self) -> None: ...
    def screenshot(self, return_img: bool = False) -> Any: ...
    def reset_camera(self) -> None: ...
    def reset_camera_clipping_range(self) -> None: ...
    def enable_anti_aliasing(self, which: str) -> None: ...
    def enable_eye_dome_lighting(self) -> None: ...
    def enable_lod(self) -> None: ...
    def disable_lod(self) -> None: ...


# Public names for importers
PolyData = PolyData
Plotter = Plotter

__all__ = ["Plotter", "PolyData"]
__version__: str
