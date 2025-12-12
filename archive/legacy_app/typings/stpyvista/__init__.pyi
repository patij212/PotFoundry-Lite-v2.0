# Minimal type stubs for stpyvista used by PotFoundry
from typing import Any

def stpyvista(plotter: Any, key: str | None = ..., panel_kwargs: dict[str, Any] | None = ...) -> Any: ...

# Panel kwargs accepted by the stpyvista wrapper
# Example usage in repo: stpyvista(plotter, key=..., panel_kwargs={...})

class StPyVistaPanel:
    def __init__(self, *args: Any, **kwargs: Any) -> None: ...
    def render(self) -> None: ...
