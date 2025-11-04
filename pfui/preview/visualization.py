"""Visualization functions for surface arrays and static rendering.

Implements generation of preview arrays and a static matplotlib renderer.
"""

from __future__ import annotations

from io import BytesIO
from typing import Any, Tuple

import numpy as np
import numpy.typing as npt
import streamlit as st

from pfui.imports import STYLES, _spin_twist_radians, base_radius

from .utils import _pyplot, cache_data


@cache_data(show_spinner=False)
def make_preview_arrays(
    H: float,
    Rt: float,
    Rb: float,
    expn: float,
    n_theta: int,
    n_z: int,
    style_name: str,
    opts_json: str,
) -> Tuple[npt.NDArray[np.float64], npt.NDArray[np.float64], npt.NDArray[np.float64]]:
    import numpy as _np

    opts: dict[str, Any] = __import__("json").loads(opts_json)
    r_outer_fn = STYLES[style_name][0]

    def _sanitize(arr: _np.ndarray, r0: float | npt.NDArray[np.float64]) -> _np.ndarray:
        try:
            r0_val = float(_np.asarray(r0))
        except Exception:
            r0_val = float(0.0)
        arr = _np.nan_to_num(
            arr,
            nan=r0_val,
            posinf=r0_val,
            neginf=max(0.1, 0.05 * r0_val),
        )
        lo = max(0.1, 0.05 * r0_val)
        hi = max(lo * 2.0, 4.0 * r0_val)
        return _np.clip(arr, lo, hi)

    def _try(
        nt: int, nz: int
    ) -> Tuple[
        npt.NDArray[np.float64], npt.NDArray[np.float64], npt.NDArray[np.float64]
    ]:
        thetas = _np.linspace(0.0, 2.0 * _np.pi, nt, endpoint=False)
        base_cos = _np.cos(thetas)
        base_sin = _np.sin(thetas)
        zvals = _np.linspace(0.0, H, nz)
        X = _np.zeros((nz, nt), dtype=_np.float64)
        Y = _np.zeros((nz, nt), dtype=_np.float64)
        Z = _np.zeros((nz, nt), dtype=_np.float64)
        ring_fallbacks = 0
        theta_fallbacks = 0
        for i, z in enumerate(zvals):
            r0 = base_radius(z, H, Rb, Rt, expn, opts)
            _opts = dict(opts)
            _opts.setdefault("_pf_rb", Rb)
            _opts.setdefault("_pf_rt", Rt)
            _opts.setdefault("_pf_expn", expn)
            twist = _spin_twist_radians(z, H, opts)
            cTw, sTw = _np.cos(twist), _np.sin(twist)
            cx = base_cos * cTw - base_sin * sTw
            sy = base_sin * cTw + base_cos * sTw
            # Vectorized path with scalar fallback
            try:
                r_vec: Any = r_outer_fn(thetas, z, float(r0), H, _opts)
                r = _np.asarray(r_vec, dtype=_np.float64)
                if r.shape != (nt,):
                    raise ValueError("vectorized style returned unexpected shape")
            except Exception:
                r = _np.empty(nt, dtype=float)
                local_errors = 0
                for j, th in enumerate(thetas):
                    try:
                        r_val = r_outer_fn(float(th), z, float(r0), H, _opts)
                        r[j] = float(r_val)
                    except Exception:
                        r[j] = float(r0)
                        local_errors += 1
                if local_errors > 0:
                    theta_fallbacks += local_errors
                ring_fallbacks += 1
            r = _sanitize(r, r0)
            X[i, :], Y[i, :], Z[i, :] = r * cx, r * sy, z
        # Force finiteness
        try:
            X[:] = _np.nan_to_num(
                _np.asarray(X, dtype=_np.float64), nan=0.0, posinf=0.0, neginf=0.0
            )
            Y[:] = _np.nan_to_num(
                _np.asarray(Y, dtype=_np.float64), nan=0.0, posinf=0.0, neginf=0.0
            )
            Z[:] = _np.nan_to_num(
                _np.asarray(Z, dtype=_np.float64), nan=0.0, posinf=0.0, neginf=0.0
            )
        except Exception:
            pass
        if ring_fallbacks > 0:
            try:
                msg = f"Preview recovered from {ring_fallbacks} ring error(s)"
                if theta_fallbacks > 0:
                    msg += f" and {theta_fallbacks} theta sample error(s)"
                msg += "; display may be approximate."
                st.info(msg)
            except Exception:
                pass
        return (
            _np.asarray(X, dtype=_np.float64),
            _np.asarray(Y, dtype=_np.float64),
            _np.asarray(Z, dtype=_np.float64),
        )

    for scale in (1.0, 0.75, 0.5, 0.33):
        try:
            nt = max(24, int(n_theta * scale))
            nz = max(12, int(n_z * scale))
            return _try(nt, nz)
        except Exception as e:
            st.error(f"Preview generation failed (scale={scale}): {e}")
            continue

    st.error("Preview generation failed for all scales. Showing fallback shape.")
    thetas = _np.linspace(0.0, 2.0 * _np.pi, max(24, n_theta // 4), endpoint=False)
    zvals = _np.linspace(0.0, H, max(12, n_z // 4))
    Rmid = 0.5 * (Rt + Rb)
    X = _np.asarray(
        _np.outer(_np.ones_like(zvals), Rmid * _np.cos(thetas)), dtype=_np.float64
    )
    Y = _np.asarray(
        _np.outer(_np.ones_like(zvals), Rmid * _np.sin(thetas)), dtype=_np.float64
    )
    Z = _np.asarray(_np.outer(zvals, _np.ones_like(thetas)), dtype=_np.float64)
    return X, Y, Z


def render_preview(
    X: npt.NDArray[np.float64],
    Y: npt.NDArray[np.float64],
    Z: npt.NDArray[np.float64],
    fig_w: float,
    fig_h: float,
    dpi: int,
    fill_width: bool,
    *,
    inner_wall: float | npt.NDArray[np.float64] | None = None,
    view_elev: float | npt.NDArray[np.float64] = 20.0,
    view_azim: float | npt.NDArray[np.float64] = -60.0,
    return_png: bool = False,
    theme: str = "dark",
    show_floor: bool = True,
    show_axes: bool = False,
) -> bytes | None:
    import matplotlib.pyplot as plt
    import numpy as _np
    from mpl_toolkits.mplot3d import Axes3D  # noqa: F401

    fig = plt.figure(figsize=(fig_w, fig_h), dpi=dpi)
    ax = fig.add_subplot(111, projection="3d")

    if theme == "dark":
        fig.patch.set_facecolor("#0E1117")
        ax.set_facecolor("#0E1117")
        for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
            try:
                # Matplotlib's 3D axis objects expose set_pane_color at runtime,
                # but the type stubs for XAxis/YAxis may not include it; cast to Any.
                from typing import Any, cast

                axis_any = cast(Any, axis)
                axis_any.set_pane_color((0.06, 0.07, 0.10, 1.0))
            except Exception:
                pass
        ax._axis3don = show_axes
    else:
        ax._axis3don = show_axes

    if show_floor:
        rmax = float(_np.max(_np.sqrt(X**2 + Y**2)))
        size = max(180.0, rmax * 3.0)
        step = max(10.0, size / 18.0)
        xs = _np.arange(-size, size + step, step)
        ys = _np.arange(-size, size + step, step)
        z0 = 0.0
        for x in xs:
            ax.plot(
                [x, x],
                [ys[0], ys[-1]],
                [z0, z0],
                linewidth=0.4,
                alpha=0.35,
                color="white",
            )
        for y in ys:
            ax.plot(
                [xs[0], xs[-1]],
                [y, y],
                [z0, z0],
                linewidth=0.4,
                alpha=0.35,
                color="white",
            )

    if (
        not _np.isfinite(X).all()
        or not _np.isfinite(Y).all()
        or not _np.isfinite(Z).all()
    ):
        st.info("Preview fell back due to invalid values; adjust style or detail.")
        _pyplot(fig, fill_width=fill_width)
        if return_png:
            buf = BytesIO()
            fig.savefig(buf, format="png", dpi=dpi)
            png = buf.getvalue()
            plt.close(fig)
            return png
        plt.close(fig)
        return None

    try:
        ax.plot_surface(
            X,
            Y,
            Z,
            linewidth=0,
            antialiased=True,
            shade=True,
            cmap="viridis",
            edgecolor="none",
        )
    except Exception:
        step = max(1, int(max(X.shape[0], X.shape[1]) // 150))
        ax.plot_wireframe(
            X[::step, ::step],
            Y[::step, ::step],
            Z[::step, ::step],
            rstride=1,
            cstride=1,
            linewidth=0.3,
        )
        st.info("Preview shown in wireframe due to resource limits.")

    _inner_wall: float | None
    if inner_wall is None:
        _inner_wall = None
    else:
        try:
            _inner_wall = float(np.asarray(inner_wall))
        except Exception:
            _inner_wall = None

    if _inner_wall is not None and _inner_wall > 0:
        R = _np.maximum(_np.sqrt(X**2 + Y**2), max(1e-3, _inner_wall * 2.0))
        scale = _np.clip(1.0 - _inner_wall / R, 0.2, 0.999)
        ax.plot_wireframe(
            X * scale,
            Y * scale,
            Z,
            rstride=max(1, X.shape[0] // 16),
            cstride=max(1, X.shape[1] // 24),
            linewidth=0.2,
        )

    try:
        ax.view_init(
            elev=float(_np.asarray(view_elev)), azim=float(_np.asarray(view_azim))
        )
    except Exception:
        pass
    try:
        ax.set_proj_type("ortho")
    except Exception:
        pass

    try:
        rmax = float(_np.max(_np.sqrt(X**2 + Y**2)))
        xlim = (-rmax, rmax)
        ylim = (-rmax, rmax)
        zlim = (0.0, float(_np.max(Z)))
        ax.set_xlim(*xlim)
        ax.set_ylim(*ylim)
        ax.set_zlim(*zlim)
        z_ratio = (zlim[1] - zlim[0]) / max(1e-6, (xlim[1] - xlim[0]))
        ax.set_box_aspect((1.0, 1.0, min(0.85, z_ratio)))
    except Exception:
        ax.set_box_aspect((np.ptp(X) or 1.0, np.ptp(Y) or 1.0, np.ptp(Z) or 1.0))
    if show_axes:
        ax.set_xlabel("X (mm)")
        ax.set_ylabel("Y (mm)")
        ax.set_zlabel("Z (mm)")

    _pyplot(fig, fill_width=fill_width)
    _png_ret: bytes | None = None
    if return_png:
        buf = BytesIO()
        fig.savefig(buf, format="png", dpi=dpi)
        _png_ret = buf.getvalue()
    import matplotlib.pyplot as plt  # ensure close after save

    plt.close(fig)
    return _png_ret


__all__ = ["make_preview_arrays", "render_preview"]
