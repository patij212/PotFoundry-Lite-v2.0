"""Cached snapshot rendering utilities.

Includes PNG snapshot rendering and APNG generation, both cached.
"""

from __future__ import annotations

from io import BytesIO
from typing import Any, cast

import numpy as np
import numpy.typing as npt

from .utils import cache_data
from .visualization import make_preview_arrays


@cache_data(show_spinner=False)
def render_preview_png_cached(
    H: float,
    Rt: float,
    Rb: float,
    expn: float,
    n_theta: int,
    n_z: int,
    style_name: str,
    opts_json: str,
    fig_w: float,
    fig_h: float,
    dpi: int,
    *,
    inner_wall: float | npt.NDArray[np.float64] | None = None,
    view_elev: float | npt.NDArray[np.float64] = 20.0,
    view_azim: float | npt.NDArray[np.float64] = -60.0,
    theme: str = "dark",
    show_floor: bool = True,
    show_axes: bool = False,
    # Back-compat flag (ignored here; always returns PNG)
    return_png: bool = False,
    appearance_key: str = "",
) -> bytes | None:
    __import__("json").loads(opts_json)
    X, Y, Z = make_preview_arrays(H, Rt, Rb, expn, n_theta, n_z, style_name, opts_json)

    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d import Axes3D  # noqa: F401

    fig = plt.figure(figsize=(fig_w, fig_h), dpi=dpi)
    ax = fig.add_subplot(111, projection="3d")

    if theme == "dark":
        fig.patch.set_facecolor("#0E1117")
        ax.set_facecolor("#0E1117")
        for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
            try:
                axis_any = cast(Any, axis)
                axis_any.set_pane_color((0.06, 0.07, 0.10, 1.0))
            except Exception:
                pass
        ax._axis3don = show_axes
    else:
        ax._axis3don = show_axes

    import numpy as _np

    if (
        not _np.isfinite(X).all() or not _np.isfinite(Y).all() or not _np.isfinite(Z).all()
    ):
        plt.close(fig)
        return None

    try:
        ax.plot_surface(
            X, Y, Z, linewidth=0, antialiased=True, shade=True, cmap="viridis", edgecolor="none"
        )
    except Exception:
        step = max(1, int(max(X.shape[0], X.shape[1]) // 150))
        ax.plot_wireframe(
            X[::step, ::step], Y[::step, ::step], Z[::step, ::step], rstride=1, cstride=1, linewidth=0.3
        )

    if inner_wall and inner_wall > 0:
        R = _np.maximum(_np.sqrt(X**2 + Y**2), max(1e-3, inner_wall * 2.0))
        scale = _np.clip(1.0 - inner_wall / R, 0.2, 0.999)
        ax.plot_wireframe(
            X * scale,
            Y * scale,
            Z,
            rstride=max(1, X.shape[0] // 16),
            cstride=max(1, X.shape[1] // 24),
            linewidth=0.2,
        )

    try:
        _view_elev = float(np.asarray(view_elev))
    except Exception:
        _view_elev = float(20.0)
    try:
        _view_azim = float(np.asarray(view_azim))
    except Exception:
        _view_azim = float(-60.0)
    try:
        ax.view_init(elev=_view_elev, azim=_view_azim)
    except Exception:
        pass

    try:
        ax.set_proj_type("ortho")
    except Exception:
        pass

    try:
        rmax = float(np.max(np.sqrt(X**2 + Y**2)))
        xlim = (-rmax, rmax)
        ylim = (-rmax, rmax)
        zlim = (0.0, float(np.max(Z)))
        ax.set_xlim(*xlim)
        ax.set_ylim(*ylim)
        ax.set_zlim(*zlim)
        z_ratio = (zlim[1] - zlim[0]) / max(1e-6, (xlim[1] - xlim[0]))
        ax.set_box_aspect((1.0, 1.0, min(0.85, z_ratio)))
    except Exception:
        sx = float(np.ptp(X) or 1.0)
        sy = float(np.ptp(Y) or 1.0)
        sz = float(np.ptp(Z) or 1.0)
        xy = max(sx, sy)
        z_norm = sz / xy if xy > 0 else 1.0
        z_target = min(z_norm, 0.85)
        ax.set_box_aspect((1.0, 1.0, z_target))

    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=dpi)
    png = buf.getvalue()
    import matplotlib.pyplot as plt  # ensure close after save
    plt.close(fig)
    return png


@cache_data(show_spinner=False)
def render_preview_apng_cached(
    H: float,
    Rt: float,
    Rb: float,
    expn: float,
    n_theta: int,
    n_z: int,
    style_name: str,
    opts_json: str,
    fig_w: float,
    fig_h: float,
    dpi: int,
    *,
    inner_wall: float | None = None,
    view_elev: float = 20.0,
    view_azim: float = -60.0,
    theme: str = "dark",
    show_floor: bool = True,
    show_axes: bool = False,
    frames: int = 12,
    spin_degrees: float = 360.0,
    duration_ms: int = 1500,
) -> bytes | None:
    __import__("json").loads(opts_json)
    X, Y, Z = make_preview_arrays(H, Rt, Rb, expn, n_theta, n_z, style_name, opts_json)

    import numpy as _np

    if (
        not _np.isfinite(X).all() or not _np.isfinite(Y).all() or not _np.isfinite(Z).all()
    ):
        return None

    def _render_frame(elev: float, azim: float) -> bytes:
        import matplotlib.pyplot as plt

        fig = plt.figure(figsize=(fig_w, fig_h), dpi=dpi)
        ax = fig.add_subplot(111, projection="3d")
        if theme == "dark":
            fig.patch.set_facecolor("#0E1117")
            ax.set_facecolor("#0E1117")
            for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
                try:
                    axis_any = cast(Any, axis)
                    axis_any.set_pane_color((0.06, 0.07, 0.10, 1.0))
                except Exception:
                    pass
            ax._axis3don = show_axes
        else:
            ax._axis3don = show_axes

        if show_floor:
            try:
                rmax = float(_np.max(_np.sqrt(X**2 + Y**2)))
                size = max(180.0, rmax * 3.0)
                step = max(10.0, size / 18.0)
                xs = _np.arange(-size, size + step, step)
                ys = _np.arange(-size, size + step, step)
                z0 = 0.0
                for x in xs:
                    ax.plot([x, x], [ys[0], ys[-1]], [z0, z0], linewidth=0.4, alpha=0.35, color="white")
                for y in ys:
                    ax.plot([xs[0], xs[-1]], [y, y], [z0, z0], linewidth=0.4, alpha=0.35, color="white")
            except Exception:
                pass

        try:
            ax.plot_surface(
                X, Y, Z, linewidth=0, antialiased=True, shade=True, cmap="viridis", edgecolor="none"
            )
        except Exception:
            step = max(1, int(max(X.shape[0], X.shape[1]) // 150))
            ax.plot_wireframe(
                X[::step, ::step], Y[::step, ::step], Z[::step, ::step], rstride=1, cstride=1, linewidth=0.3
            )

        if inner_wall and inner_wall > 0:
            R = _np.maximum(_np.sqrt(X**2 + Y**2), max(1e-3, inner_wall * 2.0))
            scale = _np.clip(1.0 - inner_wall / R, 0.2, 0.999)
            ax.plot_wireframe(
                X * scale,
                Y * scale,
                Z,
                rstride=max(1, X.shape[0] // 16),
                cstride=max(1, X.shape[1] // 24),
                linewidth=0.2,
            )

        try:
            _elev = float(_np.asarray(elev))
        except Exception:
            _elev = float(20.0)
        try:
            _azim = float(_np.asarray(azim))
        except Exception:
            _azim = float(-60.0)
        try:
            ax.view_init(elev=_elev, azim=_azim)
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
        from io import BytesIO as _BIO

        buf = _BIO()
        fig.savefig(buf, format="png", dpi=dpi)
        png = buf.getvalue()
        import matplotlib.pyplot as plt  # ensure close
        plt.close(fig)
        return png

    imgs = []
    base_az = float(view_azim)
    for i in range(max(1, frames)):
        az = base_az + (float(i) / float(max(1, frames))) * spin_degrees
        try:
            frame_png = _render_frame(view_elev, az)
            imgs.append(frame_png)
        except Exception:
            continue
    if not imgs:
        return None
    try:
        from PIL import Image as PILImage

        pil_frames = [PILImage.open(BytesIO(b)).convert("RGBA") for b in imgs]
        out = BytesIO()
        per_frame = max(20, int(duration_ms / max(1, len(pil_frames))))
        pil_frames[0].save(
            out,
            format="PNG",
            save_all=True,
            append_images=pil_frames[1:],
            duration=per_frame,
            loop=0,
            optimize=False,
        )
        data = out.getvalue()
        return data
    except Exception:
        return imgs[0]


__all__ = [
    "render_preview_png_cached",
    "render_preview_apng_cached",
]
