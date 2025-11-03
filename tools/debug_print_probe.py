import importlib
import json
from typing import Any, Callable, Optional, Tuple

import numpy as np

from potfoundry.types import StyleOpts

# Dynamically import the heavy geometry module at runtime using importlib so
# static type checkers won't eagerly analyze it when we run focused mypy on
# these small helper scripts.
# Type alias for the mesh builder function signature we expect at runtime.
# Keep Optional here so we can initialize lazily without importing heavy modules
# during static analysis.
MeshBuilder = Callable[..., Tuple[np.ndarray, np.ndarray, dict]]

build_pot_mesh: Optional[MeshBuilder] = None


def _get_build_pot_mesh() -> MeshBuilder:
    """Lazily import and return the `build_pot_mesh` callable.

    Returning a typed Callable lets mypy reason about downstream usage
    without importing the heavy `potfoundry.core.geometry` module at
    module-import time.
    """
    global build_pot_mesh
    if build_pot_mesh is None:
        try:
            mod = importlib.import_module("potfoundry.core.geometry")
            build_pot_mesh = getattr(mod, "build_pot_mesh")
        except Exception as exc:  # pragma: no cover - defensive runtime guard
            raise RuntimeError(
                "Failed to import `build_pot_mesh` from package 'potfoundry.core.geometry'. "
                "At runtime ensure the project is on PYTHONPATH and the package imports cleanly."
            ) from exc
    assert build_pot_mesh is not None
    return build_pot_mesh


n_theta = 24
n_z = 6
Z = n_z + 1
R_grid = np.ones((Z, n_theta), dtype=float) * 120.0
for zi in range(Z):
    R_grid[zi, 6] = 10.0
    R_grid[zi, 0] = 200.0


def synthetic_r_outer_fn(
    thetas: np.ndarray, z: float, r0: float, H_local: float, opts: dict
) -> np.ndarray:
    idx = int(round((float(z) / float(7.0)) * float(n_z)))
    idx = max(0, min(Z - 1, idx))
    return np.asarray(R_grid[idx, :], dtype=float)


style_opts: StyleOpts = {
    "sf_style": "SuperformulaBlossom",
    "sf_edge_flow_reconstruct_enable": True,
    "sf_edge_flow_verbose_diagnostics": True,
    "sf_edge_flow_verbose_write_file": False,
    "sf_edge_flow_probe": True,
    "sf_edge_flow_probe_zi": 2,
    "sf_edge_flow_mode": "quantile",
    "sf_edge_flow_quantile": 0.95,
    "sf_edge_flow_amount": 1.0,
    "sf_edge_flow_twist_compensate": False,
    "sf_edge_flow_auto_deoffset": False,
    "sf_edge_flow_window": 5,
}

build_pot_mesh = _get_build_pot_mesh()

verts, faces, diagnostics = build_pot_mesh(
    H=7.0,
    Rt=40.0,
    Rb=40.0,
    t_wall=2.5,
    t_bottom=4.0,
    r_drain=3.0,
    expn=1.0,
    n_theta=n_theta,
    n_z=n_z,
    r_outer_fn=synthetic_r_outer_fn,
    style_opts=style_opts,
)

print("diag keys:", sorted(diagnostics.keys()))
ev = diagnostics.get("edgeflow_verbose") or []
print("edgeflow_verbose len", len(ev))
for entry in ev:
    print("entry keys", entry.keys())
    for r in entry.get("rows") or []:
        if int(r.get("zi", -1)) == style_opts["sf_edge_flow_probe_zi"]:
            print(json.dumps(r, indent=2))
            break
    else:
        continue
    break
