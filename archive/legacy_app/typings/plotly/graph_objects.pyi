
from collections.abc import Iterable
from typing import Any

import numpy as np

NDArray = np.ndarray


def Mesh3d(*args: Any, **kwargs: Any) -> Any: ...


class Surface:
    def __init__(self, *args: Any, **kwargs: Any) -> None: ...


class Figure:
    def __init__(self, data: Iterable[Any] | None = None) -> None: ...
    def update_layout(self, *args: Any, **kwargs: Any) -> None: ...
    def to_dict(self) -> dict[str, Any]: ...
    def to_image(self, *args: Any, **kwargs: Any) -> bytes: ...


__all__ = ["Figure", "Mesh3d"]
