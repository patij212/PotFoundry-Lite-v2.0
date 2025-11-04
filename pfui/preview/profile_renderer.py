"""Profile rendering utilities.

Renders a simple 2D profile plot of outer/inner radii for a few theta slices.
"""

from __future__ import annotations

from typing import Any, Dict

import numpy as np

from pfui.imports import base_radius

from .utils import _pyplot


def render_profile(
    H: float,
    Rt: float,
    Rb: float,
    expn: float,
    r_outer_fn: Any,
    opts: Dict[str, Any],
    t_wall: float,
) -> None:
    import matplotlib.pyplot as plt
    import numpy as _np

    zvals = np.linspace(0.0, H, 200)
    thetas = [0.0, np.pi / 6.0, np.pi / 3.0]
    fig, ax = plt.subplots(figsize=(5.6, 4.0), dpi=140)
    for th in thetas:
        r_list = []
        for z in zvals:
            r0 = base_radius(z, H, Rb, Rt, expn, opts)
            _opts = dict(opts)
            _opts.setdefault("_pf_rb", Rb)
            _opts.setdefault("_pf_rt", Rt)
            _opts.setdefault("_pf_expn", expn)
            r_list.append(float(r_outer_fn(th, z, r0, H, _opts)))
        ax.plot(zvals, r_list, alpha=0.9, label=f"outer theta={int(th * 180.0 / np.pi)}°")
        inner = _np.maximum(np.array(r_list) - t_wall, 0.0)
        ax.plot(
            zvals,
            inner,
            alpha=0.6,
            linestyle="--",
            label=f"inner theta={int(th * 180.0 / np.pi)}°",
        )
    ax.set_xlabel("z (mm)")
    ax.set_ylabel("radius (mm)")
    ax.set_title("Radial profile")
    ax.legend(ncol=2, fontsize=8)
    _pyplot(fig, fill_width=True)
    plt.close(fig)


__all__ = [
    "render_profile",
]
