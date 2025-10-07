from __future__ import annotations
from io import BytesIO
from typing import Any, Dict, Tuple

import numpy as np
import streamlit as st

# --- Fallback cache decorator for test environments where streamlit.cache_data
# may be unavailable or replaced by a SimpleNamespace mock. This prevents
# AttributeError during pytest collection.
try:  # pragma: no cover - simple attribute probe
    _cache_data_impl = getattr(st, "cache_data")  # type: ignore[attr-defined]
    def cache_data(*args, **kwargs):  # passthrough to real decorator
        return _cache_data_impl(*args, **kwargs)
except Exception:  # pragma: no cover - executed only in degraded env
    def cache_data(*args, **kwargs):  # type: ignore
        def _wrap(fn):
            return fn  # no caching fallback
        return _wrap

from .imports import STYLES, base_radius, _spin_twist_radians, build_pot_mesh


def _pyplot(fig, *, fill_width: bool, clear: bool = True) -> None:
    try:
        st.pyplot(fig, clear_figure=clear, width=("stretch" if fill_width else "content"))
    except TypeError:
        st.pyplot(fig, clear_figure=clear, use_container_width=fill_width)


@cache_data(show_spinner=False)
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
        except Exception as e:
            st.error(f"Preview generation failed (scale={scale}): {e}")
            continue

    st.error("Preview generation failed for all scales. Showing fallback shape.")
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


@cache_data(show_spinner=False)
def render_preview_png_cached(
    H: float, Rt: float, Rb: float, expn: float,
    n_theta: int, n_z: int,
    style_name: str, opts_json: str,
    fig_w: float, fig_h: float, dpi: int,
    *, inner_wall: float | None = None,
    view_elev: float = 20.0, view_azim: float = -60.0,
    theme: str = "dark",
    show_floor: bool = True,
    show_axes: bool = False,
    # kept for backward compatibility: callers may pass return_png flag
    return_png: bool = False,
) -> bytes | None:
    """Cacheable renderer that returns PNG bytes for given preview parameters.

    This avoids background threads and uses Streamlit's cache to prevent
    redundant recomputation when inputs haven't changed.
    """
    # Build arrays using the cached make_preview_arrays
    opts: Dict[str, Any] = __import__("json").loads(opts_json)
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
            ax.plot([x, x], [ys[0], ys[-1]], [z0, z0], linewidth=0.4, alpha=0.35, color="white")
        for y in ys:
            ax.plot([xs[0], xs[-1]], [y, y], [z0, z0], linewidth=0.4, alpha=0.35, color="white")

    import numpy as _np
    if not _np.isfinite(X).all() or not _np.isfinite(Y).all() or not _np.isfinite(Z).all():
        plt.close(fig)
        return None

    try:
        ax.plot_surface(X, Y, Z, linewidth=0, antialiased=True, shade=True)
    except Exception:
        step = max(1, int(max(X.shape[0], X.shape[1]) // 150))
        ax.plot_wireframe(X[::step, ::step], Y[::step, ::step], Z[::step, ::step], rstride=1, cstride=1, linewidth=0.3)

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


@cache_data(show_spinner=False)
def render_preview_apng_cached(
    H: float, Rt: float, Rb: float, expn: float,
    n_theta: int, n_z: int,
    style_name: str, opts_json: str,
    fig_w: float, fig_h: float, dpi: int,
    *, inner_wall: float | None = None,
    view_elev: float = 20.0, view_azim: float = -60.0,
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
    opts: Dict[str, Any] = __import__("json").loads(opts_json)
    X, Y, Z = make_preview_arrays(H, Rt, Rb, expn, n_theta, n_z, style_name, opts_json)

    import numpy as _np
    if not _np.isfinite(X).all() or not _np.isfinite(Y).all() or not _np.isfinite(Z).all():
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
                    ax.plot([x, x], [ys[0], ys[-1]], [z0, z0], linewidth=0.4, alpha=0.35, color="white")
                for y in ys:
                    ax.plot([xs[0], xs[-1]], [y, y], [z0, z0], linewidth=0.4, alpha=0.35, color="white")
            except Exception:
                pass

        try:
            ax.plot_surface(X, Y, Z, linewidth=0, antialiased=True, shade=True)
        except Exception:
            step = max(1, int(max(X.shape[0], X.shape[1]) // 150))
            ax.plot_wireframe(X[::step, ::step], Y[::step, ::step], Z[::step, ::step], rstride=1, cstride=1, linewidth=0.3)

        if inner_wall and inner_wall > 0:
            R = _np.maximum(_np.sqrt(X**2 + Y**2), max(1e-3, inner_wall * 2.0))
            scale = _np.clip(1.0 - inner_wall / R, 0.2, 0.999)
            ax.plot_wireframe(X * scale, Y * scale, Z, rstride=max(1, X.shape[0] // 16), cstride=max(1, X.shape[1] // 24), linewidth=0.2)

        try:
            ax.view_init(elev=elev, azim=azim)
        except Exception:
            pass

        ax.set_box_aspect((np.ptp(X) or 1.0, np.ptp(Y) or 1.0, np.ptp(Z) or 1.0))
        if show_axes:
            ax.set_xlabel("X (mm)"); ax.set_ylabel("Y (mm)"); ax.set_zlabel("Z (mm)")

        from io import BytesIO
        buf = BytesIO(); fig.savefig(buf, format="png", dpi=dpi); png = buf.getvalue()
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
    H: float, Rt: float, Rb: float, expn: float,
    n_theta: int, n_z: int,
    style_name: str, opts_json: str,
    fig_w: float, fig_h: float, dpi: int,
    *,
    inner_wall: float | None = None,
    place_on_ground: bool = True,
    view_elev: float = 20.0, view_azim: float = -60.0,
    theme: str = "dark",
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
        verts, faces, _ = build_pot_mesh(
            H=H, Rt=Rt, Rb=Rb, t_wall=opts.get("t_wall", 3.0),
            t_bottom=opts.get("t_bottom", 3.0), r_drain=opts.get("r_drain", 10.0),
            expn=expn, n_theta=n_theta, n_z=n_z,
            r_outer_fn=STYLES[style_name][0], style_opts=opts,
        )
    except Exception:
        # If mesh build fails, don't crash the UI; return None
        return None

    V = _np.asarray(verts)
    F = _np.asarray(faces)
    if place_on_ground:
        V[:, 2] -= V[:, 2].min()

    # Try Plotly export first
    capture_bytes = None
    try:
        try:
            import plotly.graph_objects as go
            import plotly.io as pio
            HAS_PLOTLY = True
        except Exception:
            HAS_PLOTLY = False

        if HAS_PLOTLY:
            try:
                # Color by height
                z_norm = (V[:, 2] - V[:, 2].min()) / max(1e-6, (V[:, 2].max() - V[:, 2].min()))
                import matplotlib.pyplot as plt
                colorscale = plt.get_cmap("viridis")
                mesh_colors = [[int(255 * r), int(255 * g), int(255 * b)] for r, g, b, _ in colorscale(z_norm)]

                fig = go.Figure(data=[
                    go.Mesh3d(
                        x=V[:, 0], y=V[:, 1], z=V[:, 2],
                        i=F[:, 0], j=F[:, 1], k=F[:, 2],
                        flatshading=False,
                        lighting=dict(ambient=0.35, diffuse=0.95, specular=0.25, roughness=0.7, fresnel=0.2),
                        vertexcolor=mesh_colors,
                        hoverinfo="skip",
                        name="mesh",
                        opacity=1.0,
                    )
                ])
                height_px = max(400, min(1000, int(110 * fig_h)))
                width_px = max(400, min(1400, int(96 * fig_w)))
                fig.update_layout(
                    height=height_px,
                    width=width_px,
                    scene=dict(aspectmode="data", xaxis=dict(visible=False), yaxis=dict(visible=False), zaxis=dict(visible=False), bgcolor="#0E1117"),
                    margin=dict(l=0, r=0, t=30, b=0),
                )
                try:
                    capture_bytes = fig.to_image(format="png", width=width_px, height=height_px, scale=1)
                except Exception:
                    capture_bytes = pio.to_image(fig, format="png", width=width_px, height=height_px, scale=1)
                # Record method used for diagnostics in session state (best-effort)
                try:
                    st.session_state["_last_snapshot_method"] = "plotly"
                except Exception:
                    pass
            except Exception:
                capture_bytes = None

        # Matplotlib fallback: render triangles directly
        if not capture_bytes:
            try:
                import matplotlib
                matplotlib.use('Agg')
                import matplotlib.pyplot as plt
                from mpl_toolkits.mplot3d.art3d import Poly3DCollection

                fig = plt.figure(figsize=(fig_w, fig_h), dpi=dpi)
                ax = fig.add_subplot(111, projection='3d')
                if theme == 'dark':
                    fig.patch.set_facecolor("#0E1117")
                    ax.set_facecolor("#0E1117")
                ax._axis3don = False

                triangles = V[F]
                mesh = Poly3DCollection(triangles, alpha=0.95, linewidths=0.1, edgecolors='#555555')

                z_norm_mpl = (V[:, 2] - V[:, 2].min()) / max(1e-6, (V[:, 2].max() - V[:, 2].min()))
                colors = plt.cm.viridis(z_norm_mpl[F].mean(axis=1))
                mesh.set_facecolors(colors)
                ax.add_collection3d(mesh)

                # Set limits and aspect
                ax.set_xlim(V[:, 0].min(), V[:, 0].max())
                ax.set_ylim(V[:, 1].min(), V[:, 1].max())
                ax.set_zlim(V[:, 2].min(), V[:, 2].max())
                ax.set_box_aspect((_np.ptp(V[:, 0]) or 1.0, _np.ptp(V[:, 1]) or 1.0, _np.ptp(V[:, 2]) or 1.0))
                ax.view_init(elev=view_elev, azim=view_azim)

                from io import BytesIO
                buf = BytesIO()
                fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight', facecolor=fig.get_facecolor())
                capture_bytes = buf.getvalue()
                plt.close(fig)
                try:
                    st.session_state["_last_snapshot_method"] = "matplotlib"
                except Exception:
                    pass
            except Exception:
                try:
                    import traceback
                    traceback.print_exc()
                except Exception:
                    pass
                capture_bytes = None

        return capture_bytes
    except Exception:
        return None