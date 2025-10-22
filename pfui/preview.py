from __future__ import annotations
from io import BytesIO
from typing import Any, Dict, Tuple, Optional, Callable, cast
import numpy as np
import numpy.typing as npt
import streamlit as st

# --- Fallback cache decorator for test environments where streamlit.cache_data
# may be unavailable or replaced by a SimpleNamespace mock. This prevents
# AttributeError during pytest collection. Declare the type so mypy knows
# _cache_data_impl may be None and we cast before calling it.
_cache_data_impl: Optional[Callable[..., Any]] = getattr(st, "cache_data", None)
if _cache_data_impl is not None:  # pragma: no cover - normal runtime

    def cache_data(*args: Any, **kwargs: Any):  # passthrough to real decorator
        return cast(Callable[..., Any], _cache_data_impl)(*args, **kwargs)
else:  # pragma: no cover - executed only in degraded env (tests)

    def cache_data(*args: Any, **kwargs: Any):
        def _wrap(fn):
            return fn  # no caching fallback

        return _wrap


from .imports import STYLES, base_radius, _spin_twist_radians, build_pot_mesh  # noqa: E402
from .colors import build_gradient_colors  # noqa: E402


def _pyplot(fig, *, fill_width: bool, clear: bool = True) -> None:
    """Render matplotlib figure in Streamlit with compatibility handling.

    Args:
        fig: Matplotlib figure to display
        fill_width: Whether to stretch figure to full width
        clear: Whether to clear figure after rendering
    """
    try:
        st.pyplot(
            fig, clear_figure=clear, width=("stretch" if fill_width else "content")
        )
    except TypeError:
        # Fallback for older Streamlit versions that don't support the width kwarg
        st.pyplot(fig, clear_figure=clear)


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
    """Generate preview arrays for 3D visualization (cached).

    Args:
        H: Pot height in mm
        Rt: Top radius in mm
        Rb: Bottom radius in mm
        expn: Flare exponent
        n_theta: Angular resolution
        n_z: Vertical resolution
        style_name: Style function name
        opts_json: JSON-encoded style options

    Returns:
        Tuple of surface arrays (X, Y, Z) ready for plotting
    """
    import numpy as _np

    opts: Dict[str, Any] = __import__("json").loads(opts_json)
    r_outer_fn = STYLES[style_name][0]

    def _sanitize(
        arr: _np.ndarray, r0: float | npt.NDArray[np.float64]
    ) -> _np.ndarray:
        # Accept either a scalar float or a 0-d numpy array for r0. Coerce to
        # a Python float for sane numeric operations used below.
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
            # Inject base-shape params for styles needing tier-edge envelopes
            _opts = dict(opts)
            _opts.setdefault("_pf_rb", Rb)
            _opts.setdefault("_pf_rt", Rt)
            _opts.setdefault("_pf_expn", expn)
            twist = _spin_twist_radians(z, H, opts)
            cTw, sTw = _np.cos(twist), _np.sin(twist)
            # Rotate precomputed cos/sin by twist: cos(θ+tw)=cosθ·cosTw - sinθ·sinTw; sin(θ+tw)=sinθ·cosTw + cosθ·sinTw
            cx = base_cos * cTw - base_sin * sTw
            sy = base_sin * cTw + base_cos * sTw
            # Vectorized style sampling at raw theta; twist affects placement only.
            # If the style isn't vectorized, gracefully fall back to per-theta sampling.
            r: _np.ndarray
            try:
                r_vec: Any = r_outer_fn(thetas, z, float(r0), H, _opts)
                r = _np.asarray(r_vec, dtype=_np.float64)
                if r.shape != (nt,):
                    raise ValueError("vectorized style returned unexpected shape")
            except Exception:
                # Per-theta fallback ensures previews work even for scalar-only styles
                r = _np.empty(nt, dtype=float)
                local_errors = 0
                for j, th in enumerate(thetas):
                    try:
                        r_val = r_outer_fn(float(th), z, float(r0), H, _opts)
                        r[j] = float(r_val)  # may raise if not castable
                    except Exception:
                        r[j] = float(r0)
                        local_errors += 1
                if local_errors > 0:
                    theta_fallbacks += local_errors
                # Count this ring as a fallback if any scalar samples failed
                ring_fallbacks += 1 if local_errors > 0 else 0
            r = _sanitize(r, r0)
            X[i, :], Y[i, :], Z[i, :] = r * cx, r * sy, z
        # Final guard: ensure arrays are float and finite to avoid Plotly/Matplotlib failures
        try:
            X_arr = _np.asarray(X, dtype=_np.float64)
            Y_arr = _np.asarray(Y, dtype=_np.float64)
            Z_arr = _np.asarray(Z, dtype=_np.float64)
            # Replace any residual NaN/Inf with safe zeros; Z should be finite by construction
            X[:] = _np.nan_to_num(X_arr, nan=0.0, posinf=0.0, neginf=0.0)
            Y[:] = _np.nan_to_num(Y_arr, nan=0.0, posinf=0.0, neginf=0.0)
            Z[:] = _np.nan_to_num(Z_arr, nan=0.0, posinf=0.0, neginf=0.0)
        except Exception:
            # If any coercion fails, leave arrays as-is; downstream will catch and fallback
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
        # Ensure returned arrays are np.float64 typed for mypy/numpy typing
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

    # --- Mesh surface ---
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
        # Use a perceptually-uniform colormap for better visibility on dark background
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

    # Inner wall hint: accept numpy scalars or Python floats. Coerce to float
    # for arithmetic and comparisons.
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

    # Camera + aspect: use orthographic projection and equal XY, with gently compressed Z
    try:
        ax.view_init(elev=float(_np.asarray(view_elev)), azim=float(_np.asarray(view_azim)))
    except Exception:
        pass
    try:
        ax.set_proj_type("ortho")
    except Exception:
        pass

    # Symmetric XY limits based on radius; Z from 0..max
    try:
        rmax = float(_np.max(_np.sqrt(X**2 + Y**2)))
        xlim = (-rmax, rmax)
        ylim = (-rmax, rmax)
        zlim = (0.0, float(_np.max(Z)))
        ax.set_xlim(*xlim)
        ax.set_ylim(*ylim)
        ax.set_zlim(*zlim)
        # Aspect ratios: equal XY, capped Z/XY
        z_ratio = (zlim[1] - zlim[0]) / max(1e-6, (xlim[1] - xlim[0]))
        ax.set_box_aspect((1.0, 1.0, min(0.85, z_ratio)))
    except Exception:
        # Fallback to data-driven aspect
        ax.set_box_aspect((np.ptp(X) or 1.0, np.ptp(Y) or 1.0, np.ptp(Z) or 1.0))
    if show_axes:
        ax.set_xlabel("X (mm)")
        ax.set_ylabel("Y (mm)")
        ax.set_zlabel("Z (mm)")

    _pyplot(fig, fill_width=fill_width)
    _png_ret: Optional[bytes] = None
    if return_png:
        buf = BytesIO()
        fig.savefig(buf, format="png", dpi=dpi)
        _png_ret = buf.getvalue()
    plt.close(fig)
    return _png_ret


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
    # kept for backward compatibility: callers may pass return_png flag
    return_png: bool = False,
    # appearance cache key to invalidate cache on palette/lighting changes
    appearance_key: str = "",
) -> bytes | None:
    """Cacheable renderer that returns PNG bytes for given preview parameters.

    This avoids background threads and uses Streamlit's cache to prevent
    redundant recomputation when inputs haven't changed.
    """
    # Build arrays using the cached make_preview_arrays
    __import__("json").loads(opts_json)
    X, Y, Z = make_preview_arrays(H, Rt, Rb, expn, n_theta, n_z, style_name, opts_json)

    # Reuse much of render_preview's plotting logic but avoid calling st.pyplot
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d import Axes3D  # noqa: F401

    fig = plt.figure(figsize=(fig_w, fig_h), dpi=dpi)
    ax = fig.add_subplot(111, projection="3d")

    if theme == "dark":
        fig.patch.set_facecolor("#0E1117")
        ax.set_facecolor("#0E1117")
        for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
            try:
                axis.set_pane_color((0.06, 0.07, 0.10, 1.0))
            except Exception:
                pass
        ax._axis3don = show_axes
    else:
        ax._axis3don = show_axes

    if show_floor:
        rmax = float(np.max(np.sqrt(X**2 + Y**2)))
        size = max(180.0, rmax * 3.0)
        step = max(10.0, size / 18.0)
        xs = np.arange(-size, size + step, step)
        ys = np.arange(-size, size + step, step)
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

    import numpy as _np

    # Coerce view/elev to float for matplotlib calls
    try:
        _view_elev = float(np.asarray(view_elev))
    except Exception:
        _view_elev = float(20.0)
    try:
        _view_azim = float(np.asarray(view_azim))
    except Exception:
        _view_azim = float(-60.0)

    if (
        not _np.isfinite(X).all()
        or not _np.isfinite(Y).all()
        or not _np.isfinite(Z).all()
    ):
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
        ax.view_init(elev=_view_elev, azim=_view_azim)
    except Exception:
        pass

    # Use orthographic projection to reduce perspective distortion and compress Z for better aesthetics
    try:
        ax.set_proj_type("ortho")
    except Exception:
        pass

    # Explicit limits: symmetric XY around 0, Z from 0..max
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
    if show_axes:
        ax.set_xlabel("X (mm)")
        ax.set_ylabel("Y (mm)")
        ax.set_zlabel("Z (mm)")

    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=dpi)
    png = buf.getvalue()
    plt.close(fig)
    return png


def render_profile(
    H: float,
    Rt: float,
    Rb: float,
    expn: float,
    r_outer_fn,
    opts: Dict[str, Any],
    t_wall: float,
) -> None:
    import numpy as _np
    import matplotlib.pyplot as plt

    zvals = np.linspace(0.0, H, 200)
    thetas = [0.0, np.pi / 6.0, np.pi / 3.0]
    fig, ax = plt.subplots(figsize=(5.6, 4.0), dpi=140)
    for th in thetas:
        r_list = []
        for z in zvals:
            r0 = base_radius(z, H, Rb, Rt, expn, opts)
            # For radial profile we sample style at raw theta (parity with 3D paths)
            _opts = dict(opts)
            _opts.setdefault("_pf_rb", Rb)
            _opts.setdefault("_pf_rt", Rt)
            _opts.setdefault("_pf_expn", expn)
            r_list.append(float(r_outer_fn(th, z, r0, H, _opts)))
        ax.plot(
            zvals, r_list, alpha=0.9, label=f"outer theta={int(th * 180.0 / np.pi)}°"
        )
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
    """Generate an animated PNG (APNG) by rendering several azimuth frames.

    Falls back to returning a single PNG frame if Pillow/APNG support is not
    available or if an error occurs.
    """
    # Build arrays once
    __import__("json").loads(opts_json)
    X, Y, Z = make_preview_arrays(H, Rt, Rb, expn, n_theta, n_z, style_name, opts_json)

    import numpy as _np

    if (
        not _np.isfinite(X).all()
        or not _np.isfinite(Y).all()
        or not _np.isfinite(Z).all()
    ):
        return None

    # Helper to draw a single frame and return PNG bytes
    def _render_frame(elev: float, azim: float) -> bytes:
        import matplotlib.pyplot as plt

        fig = plt.figure(figsize=(fig_w, fig_h), dpi=dpi)
        ax = fig.add_subplot(111, projection="3d")
        if theme == "dark":
            fig.patch.set_facecolor("#0E1117")
            ax.set_facecolor("#0E1117")
            for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
                try:
                    axis.set_pane_color((0.06, 0.07, 0.10, 1.0))
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
            except Exception:
                pass

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

        # View + projection + explicit limits/aspect
        # Coerce numeric frame params to floats (may be numpy scalars)
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
        if show_axes:
            ax.set_xlabel("X (mm)")
            ax.set_ylabel("Y (mm)")
            ax.set_zlabel("Z (mm)")

        from io import BytesIO

        buf = BytesIO()
        fig.savefig(buf, format="png", dpi=dpi)
        png = buf.getvalue()
        plt.close(fig)
        return png

    # Create frames
    imgs = []
    base_az = float(view_azim)
    for i in range(max(1, frames)):
        az = base_az + (float(i) / float(max(1, frames))) * spin_degrees
        try:
            frame_png = _render_frame(view_elev, az)
            imgs.append(frame_png)
        except Exception:
            # If any frame fails, skip it
            continue

    if not imgs:
        return None

    # Try to assemble APNG using Pillow. If Pillow or APNG support is
    # unavailable, fall back to returning the first frame's PNG bytes.
    try:
        from PIL import Image as PILImage
        from io import BytesIO

        pil_frames = [PILImage.open(BytesIO(b)).convert("RGBA") for b in imgs]
        out = BytesIO()
        # duration per frame in ms
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
        # Pillow not available or APNG writing failed: return the first frame
        return imgs[0]


@cache_data(show_spinner=False)
def render_mesh_snapshot_cached(
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
    place_on_ground: bool = True,
    view_elev: float = 20.0,
    view_azim: float = -60.0,
    theme: str = "dark",
    # appearance cache key to invalidate cache on palette/lighting changes
    appearance_key: str = "",
) -> bytes | None:
    """Build the actual triangulated mesh and render it to PNG bytes.

    Tries Plotly Mesh3d export first (kaleido). Falls back to a
    matplotlib Poly3DCollection-based renderer. Cached so repeated
    captures with identical inputs are fast.
    """
    import numpy as _np

    opts: Dict[str, Any] = __import__("json").loads(opts_json)

    # Build actual mesh using core geometry
    try:
        # Use import-light bridge to avoid importing heavy numeric modules at
        # UI import time. The bridge will lazily import potfoundry.core.geometry
        # only when the builder is invoked.
        from .geometry_bridge import build_pot_mesh_safe

        verts, faces, _ = build_pot_mesh_safe(
            H=H,
            Rt=Rt,
            Rb=Rb,
            t_wall=opts.get("t_wall", 3.0),
            t_bottom=opts.get("t_bottom", 3.0),
            r_drain=opts.get("r_drain", 10.0),
            expn=expn,
            n_theta=n_theta,
            n_z=n_z,
            r_outer_fn=STYLES[style_name][0],
            style_opts=opts,
        )
    except Exception:
        # If mesh build fails, don't crash the UI; return None
        return None

    V = _np.asarray(verts)
    F = _np.asarray(faces)
    if place_on_ground:
        V[:, 2] -= V[:, 2].min()

    # Choose PNG engine: default to 'matplotlib' for speed; override with st.session_state['mesh_png_engine'] = 'plotly'
    engine = str(st.session_state.get("mesh_png_engine", "matplotlib")).lower()
    capture_bytes = None

    def _render_matplotlib() -> bytes | None:
        try:
            import matplotlib

            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            from mpl_toolkits.mplot3d.art3d import Poly3DCollection

            fig = plt.figure(figsize=(fig_w, fig_h), dpi=dpi)
            ax = fig.add_subplot(111, projection="3d")
            if theme == "dark":
                fig.patch.set_facecolor("#0E1117")
                ax.set_facecolor("#0E1117")
            ax._axis3don = False

            triangles = V[F]
            mesh = Poly3DCollection(
                triangles, alpha=0.95, linewidths=0.1, edgecolors="#555555"
            )

            # Face colors based on height (UI palette)
            z_norm_v = (V[:, 2] - V[:, 2].min()) / max(
                1e-6, (V[:, 2].max() - V[:, 2].min())
            )
            face_z = z_norm_v[F].mean(axis=1)
            try:
                preset = st.session_state.get("preview_palette", "Custom")
                custom = [
                    st.session_state.get("preview_grad_c1", "#2850D0"),
                    st.session_state.get("preview_grad_c2", "#5FA8FF"),
                    st.session_state.get("preview_grad_c3", "#E2F3FF"),
                ]
                rgb255 = build_gradient_colors(
                    face_z, preset if preset != "Custom" else None, custom
                )
                colors = [
                    (r / 255.0, g / 255.0, b / 255.0, 1.0) for (r, g, b) in rgb255
                ]
            except Exception:
                # Some matplotlib backends may not expose cm.viridis as an attribute in tests; guard with getattr
                cmap = getattr(plt.cm, "viridis", None)
                if cmap is not None:
                    colors = cmap(face_z)
                else:
                    # Fallback: produce grayscale mapping
                    colors = [(fz, fz, fz, 1.0) for fz in face_z]
            mesh.set_facecolors(colors)
            ax.add_collection3d(mesh)

            try:
                ax.set_proj_type("ortho")
            except Exception:
                pass
            rmax = float(max(abs(V[:, 0]).max(), abs(V[:, 1]).max()))
            xlim = (-rmax, rmax)
            ylim = (-rmax, rmax)
            zlim = (float(V[:, 2].min()), float(V[:, 2].max()))
            ax.set_xlim(*xlim)
            ax.set_ylim(*ylim)
            ax.set_zlim(*zlim)
            try:
                _ve = float(np.asarray(view_elev))
            except Exception:
                _ve = float(20.0)
            try:
                _va = float(np.asarray(view_azim))
            except Exception:
                _va = float(-60.0)
            try:
                ax.view_init(elev=_ve, azim=_va)
            except Exception:
                pass
            z_ratio = (zlim[1] - zlim[0]) / max(1e-6, (xlim[1] - xlim[0]))
            ax.set_box_aspect((1.0, 1.0, min(0.85, z_ratio)))

            from io import BytesIO

            buf = BytesIO()
            fig.savefig(
                buf,
                format="png",
                dpi=dpi,
                bbox_inches="tight",
                facecolor=fig.get_facecolor(),
            )
            out = buf.getvalue()
            plt.close(fig)
            try:
                st.session_state["_last_snapshot_method"] = "matplotlib"
            except Exception:
                pass
            return out
        except Exception:
            return None

    def _render_plotly() -> bytes | None:
        try:
            import plotly.graph_objects as go
            import plotly.io as pio
        except Exception:
            return None
        try:
            # Color by height
            z_norm = (V[:, 2] - V[:, 2].min()) / max(
                1e-6, (V[:, 2].max() - V[:, 2].min())
            )
            try:
                preset = st.session_state.get("preview_palette", "Custom")
                custom = [
                    st.session_state.get("preview_grad_c1", "#2850D0"),
                    st.session_state.get("preview_grad_c2", "#5FA8FF"),
                    st.session_state.get("preview_grad_c3", "#E2F3FF"),
                ]
                mesh_colors = build_gradient_colors(
                    z_norm, preset if preset != "Custom" else None, custom
                )
            except Exception:
                import matplotlib.pyplot as plt

                colorscale = plt.get_cmap("viridis")
                mesh_colors = [
                    [int(255 * r), int(255 * g), int(255 * b)]
                    for r, g, b, _ in colorscale(z_norm)
                ]

            fig = go.Figure(
                data=[
                    go.Mesh3d(
                        x=V[:, 0],
                        y=V[:, 1],
                        z=V[:, 2],
                        i=F[:, 0],
                        j=F[:, 1],
                        k=F[:, 2],
                        flatshading=False,
                        lighting=dict(
                            ambient=min(
                                max(st.session_state.get("mesh_ambient", 0.35), 0.0),
                                1.0,
                            ),
                            diffuse=min(
                                max(st.session_state.get("mesh_diffuse", 0.95), 0.0),
                                1.0,
                            ),
                            specular=min(
                                max(st.session_state.get("mesh_specular", 0.25), 0.0),
                                1.0,
                            ),
                            roughness=min(
                                max(st.session_state.get("mesh_roughness", 0.7), 0.0),
                                1.0,
                            ),
                            fresnel=min(
                                max(st.session_state.get("mesh_fresnel", 0.2), 0.0), 1.0
                            ),
                        ),
                        vertexcolor=mesh_colors,
                        hoverinfo="skip",
                        name="mesh",
                        opacity=1.0,
                    )
                ]
            )
            height_px = max(400, min(1000, int(110 * fig_h)))
            width_px = max(400, min(1400, int(96 * fig_w)))
            try:
                rmax = float(max(abs(V[:, 0]).max(), abs(V[:, 1]).max()))
                zmin = float(V[:, 2].min())
                zmax = float(V[:, 2].max())
            except Exception:
                try:
                    rmax = max(1.0, float(st.session_state.get("top_od", 140.0)) * 0.5)
                except Exception:
                    rmax = 70.0
                try:
                    zmin, zmax = 0.0, float(st.session_state.get("H", 120.0))
                except Exception:
                    zmin, zmax = 0.0, 120.0
            xlim = [-rmax, rmax]
            ylim = [-rmax, rmax]
            zlim = [zmin, zmax]
            z_ratio = (zmax - zmin) / max(1e-6, (xlim[1] - xlim[0]))
            fig.update_layout(
                height=height_px,
                width=width_px,
                scene=dict(
                    xaxis=dict(visible=False, range=xlim),
                    yaxis=dict(visible=False, range=ylim),
                    zaxis=dict(visible=False, range=zlim),
                    aspectmode="manual",
                    aspectratio=dict(x=1, y=1, z=min(0.85, z_ratio)),
                    camera=dict(
                        up=dict(x=0, y=0, z=1), projection=dict(type="orthographic")
                    ),
                    bgcolor=st.session_state.get("preview_bg_color", "#0E1117"),
                ),
                margin=dict(l=0, r=0, t=30, b=0),
            )
            try:
                out: Any = fig.to_image(
                    format="png", width=width_px, height=height_px, scale=1
                )
            except Exception:
                out = pio.to_image(
                    fig, format="png", width=width_px, height=height_px, scale=1
                )
            try:
                st.session_state["_last_snapshot_method"] = "plotly"
            except Exception:
                pass
            return cast(bytes, out)
        except Exception:
            return None

    # Prefer selected engine; fall back to the other if it fails
    try:
        if engine == "plotly":
            capture_bytes = _render_plotly() or _render_matplotlib()
        else:
            capture_bytes = _render_matplotlib() or _render_plotly()
        return capture_bytes
    except Exception:
        return None
