
from typing import Any

def build_mesh_kwargs_for_test(Vd: Any, Fd: Any, ss: dict[str, Any], n_theta: int, n_z: int, fig_h: float) -> dict[str, Any]: ...
def resolve_schema_key(style_name: str) -> str: ...

__all__ = ["build_mesh_kwargs_for_test", "resolve_schema_key"]
