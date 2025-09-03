from __future__ import annotations
from io import BytesIO
from typing import Any, Dict, Tuple

import numpy as np
import streamlit as st

from .imports import STYLES, base_radius, _spin_twist_radians


def _pyplot(fig, *, fill_width: bool, clear: bool = True) -> None:
    try:
        st.pyplot(fig, clear_figure=clear, width=("stretch" if fill_width else "content"))
    except TypeError:
        st.pyplot(fig, clear_figure=clear, use_container_width=fill_width)


@st.cache_data(show_spinner=False)
def make_preview_arrays(H: float, Rt: float, Rb: float, expn: float,
                        n_theta: int, n_z: int,
                        style_name: str, opts_json: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    import numpy as _np
    opts: Dict[str, Any] = __import__("json").loads(opts_json)
    r_outer_fn = STYLES[style_name][0]

    def _sanitize(arr: _np.ndarray, r0: float) -> _np.ndarray:
        arr = _np.nan_to_num(arr, nan=r0, posinf=r0, neginf=max(0.1, 0.05 * r0))
        lo = max(0.1, 0.05 * r0)
        hi = max(lo * 2.0, 4.0 * r0)
        return _np.clip(arr, lo, hi)

    def _try(nt: int, nz: int):
        thetas = _np.linspace(0.0, 2.0 * _np.pi, nt, endpoint=False)
        zvals = _np.linspace(0.0, H, nz)
        X = _np.zeros((nz, nt), dtype=float)
        Y = _np.zeros((nz, nt), dtype=float)
        Z = _np.zeros((nz, nt), dtype=float)
        for i, z in enumerate(zvals):
            r0 = base_radius(z, H, Rb, Rt, expn, opts)
            twist = _spin_twist_radians(z, H, opts)
            ang = thetas + twist
            r = _np.array([r_outer_fn(th, z, r0, H, opts) for th in thetas], dtype=float)
            r = _sanitize(r, r0)
            X[i, :], Y[i, :], Z[i, :] = r * _np.cos(ang), r * _np.sin(ang), z
        return X, Y, Z

    for scale in (1.0, 0.75, 0.5, 0.33):
        try:
            nt = max(24, int(n_theta * scale))
            nz = max(12, int(n_z * scale))
            return _try(nt, nz)
        except Exception:
            continue

    thetas = _np.linspace(0.0, 2.0 * _np.pi, max(24, n_theta // 4), endpoint=False)
    zvals = _np.linspace(0.0, H, max(12, n_z // 4))
    Rmid = 0.5 * (Rt + Rb)
    X = _np.outer(_np.ones_like(zvals), Rmid * _np.cos(thetas))
    Y = _np.outer(_np.ones_like(zvals), Rmid * _np.sin(thetas))
    Z = _np.outer(zvals, _np.ones_like(thetas))
    return X, Y, Z


def render_preview(
    X, Y, Z, fig_w: float, fig_h: float, dpi: int, fill_width: bool,
    *, inner_wall: float | None = None,
    view_elev: float = 20.0, view_azim: float = -60.0,
    return_png: bool = False,
    theme: str = "dark",
    show_floor: bool = True,
    show_axes: bool = False,
):
    import numpy as _np
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d import Axes3D  # noqa: F401

    fig = plt.figure(figsize=(fig_w, fig_h), dpi=dpi)
    ax = fig.add_subplot(111, projection="3d")

    # --- Scene styling (desktop-like) ---
    if theme == "dark":
        fig.patch.set_facecolor("#0E1117")
        ax.set_facecolor("#0E1117")
        # Dim panes and grid
        for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
            try:
                axis.set_pane_color((0.06, 0.07, 0.10, 1.0))
            except Exception:
                pass
        ax._axis3don = show_axes  # hide axes completely if False
    else:
        ax._axis3don = show_axes

    # --- Ground grid ---
    if show_floor:
        # Estimate a reasonable floor size from model extents
        rmax = float(_np.max(_np.sqrt(X**2 + Y**2)))
        size = max(180.0, rmax * 3.0)
        step = max(10.0, size / 18.0)
        xs = _np.arange(-size, size + step, step)
        ys = _np.arange(-size, size + step, step)
        z0 = 0.0  # pot is already built from z=0..H
        for x in xs:
            ax.plot([x, x], [ys[0], ys[-1]], [z0, z0], linewidth=0.4, alpha=0.35, color="white")
        for y in ys:
            ax.plot([xs[0], xs[-1]], [y, y], [z0, z0], linewidth=0.4, alpha=0.35, color="white")

    # --- Mesh surface ---
    if not _np.isfinite(X).all() or not _np.isfinite(Y).all() or not _np.isfinite(Z).all():
        st.info("Preview fell back due to invalid values; adjust style or detail.")
        _pyplot(fig, fill_width=fill_width)
        if return_png:
            buf = BytesIO(); fig.savefig(buf, format="png", dpi=dpi); png = buf.getvalue(); plt.close(fig); return png
        plt.close(fig); return None

    try:
        ax.plot_surface(X, Y, Z, linewidth=0, antialiased=True, shade=True)
    except Exception:
        step = max(1, int(max(X.shape[0], X.shape[1]) // 150))
        ax.plot_wireframe(X[::step, ::step], Y[::step, ::step], Z[::step, ::step], rstride=1, cstride=1, linewidth=0.3)
        st.info("Preview shown in wireframe due to resource limits.")

    # Inner wall hint
    if inner_wall and inner_wall > 0:
        R = _np.maximum(_np.sqrt(X**2 + Y**2), max(1e-3, inner_wall * 2.0))
        scale = _np.clip(1.0 - inner_wall / R, 0.2, 0.999)
        ax.plot_wireframe(X * scale, Y * scale, Z, rstride=max(1, X.shape[0] // 16), cstride=max(1, X.shape[1] // 24), linewidth=0.2)

    try:
        ax.view_init(elev=view_elev, azim=view_azim)
    except Exception:
        pass

    ax.set_box_aspect((np.ptp(X) or 1.0, np.ptp(Y) or 1.0, np.ptp(Z) or 1.0))
    if show_axes:
        ax.set_xlabel("X (mm)"); ax.set_ylabel("Y (mm)"); ax.set_zlabel("Z (mm)")

    _pyplot(fig, fill_width=fill_width)
    png = None
    if return_png:
        buf = BytesIO(); fig.savefig(buf, format="png", dpi=dpi); png = buf.getvalue()
    plt.close(fig)
    return png



def render_profile(H: float, Rt: float, Rb: float, expn: float, r_outer_fn, opts: Dict[str, Any], t_wall: float) -> None:
    import numpy as _np
    import matplotlib.pyplot as plt

    zvals = np.linspace(0.0, H, 200)
    thetas = [0.0, np.pi / 6.0, np.pi / 3.0]
    fig, ax = plt.subplots(figsize=(5.6, 4.0), dpi=140)
    for th in thetas:
        r_list = []
        for z in zvals:
            r0 = base_radius(z, H, Rb, Rt, expn, opts)
            tw = _spin_twist_radians(z, H, opts)
            r_list.append(float(r_outer_fn(th + tw, z, r0, H, opts)))
        ax.plot(zvals, r_list, alpha=0.9, label=f"outer theta={int(th * 180.0 / np.pi)}°")
        inner = _np.maximum(np.array(r_list) - t_wall, 0.0)
        ax.plot(zvals, inner, alpha=0.6, linestyle="--", label=f"inner theta={int(th * 180.0 / np.pi)}°")
    ax.set_xlabel("z (mm)"); ax.set_ylabel("radius (mm)"); ax.set_title("Radial profile")
    ax.legend(ncol=2, fontsize=8)
    _pyplot(fig, fill_width=True); plt.close(fig)