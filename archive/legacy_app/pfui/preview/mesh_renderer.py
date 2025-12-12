"""Mesh snapshot renderer.

Builds the actual triangulated mesh and renders a PNG via matplotlib or Plotly,
cached at the function level.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, cast

import numpy as np

from pfui.colors import build_gradient_colors
from pfui.imports import STYLES
from pfui.preview import st

from .utils import cache_data


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
    appearance_key: str = "",
) -> bytes | None:
    import numpy as _np
    # Use preview.st proxy to allow tests to monkeypatch the st object.

    opts: dict[str, Any] = __import__("json").loads(opts_json)

    try:
        from .geometry_bridge import build_pot_mesh_safe

        # STYLES is a lazy proxy that may be typed as `object` for import-light
        # scenarios; cast to a Mapping so the index operation is recognized by
        # static analyzers.
        styles = cast("Mapping[str, Any]", STYLES)

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
            r_outer_fn=styles[style_name][0],
            style_opts=opts,
        )
    except Exception:
        return None

    V = cast("_np.ndarray", _np.asarray(verts))
    F = cast("_np.ndarray", _np.asarray(faces))
    if place_on_ground:
        try:
            V[:, 2] -= V[:, 2].min()
        except Exception:
            pass

    engine = str(st.session_state.get("mesh_png_engine", "matplotlib")).lower()

    def _render_matplotlib() -> bytes | None:
        try:
            import matplotlib

            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            from mpl_toolkits.mplot3d.art3d import Poly3DCollection

            fig = plt.figure(figsize=(fig_w, fig_h), dpi=dpi)
            ax = fig.add_subplot(111, projection="3d")
            if theme == "dark":
                fig.patch.set_facecolor("#242B46")
                ax.set_facecolor("#242B46")
            ax._axis3don = False

            triangles = V[F]
            # Cast to Any so Pylance doesn't flag runtime methods like set_facecolors
            mesh = cast(
                "Any",
                Poly3DCollection(
                    triangles, alpha=0.95, linewidths=0.1, edgecolors="#555555",
                ),
            )

            z_norm_v = (V[:, 2] - V[:, 2].min()) / max(
                1e-6, (V[:, 2].max() - V[:, 2].min()),
            )
            face_z = z_norm_v[F].mean(axis=1)
            try:
                preset = st.session_state.get("preview_palette", "Custom")
                custom = [
                    st.session_state.get("preview_grad_c1", "#1149FF"),
                    st.session_state.get("preview_grad_c2", "#8801DE"),
                    st.session_state.get("preview_grad_c3", "#124FA0"),
                ]
                rgb255 = build_gradient_colors(
                    face_z, preset if preset != "Custom" else None, custom,
                )
                colors = [
                    (r / 255.0, g / 255.0, b / 255.0, 1.0) for (r, g, b) in rgb255
                ]
            except Exception:
                import matplotlib.pyplot as plt

                cmap = getattr(plt.cm, "viridis", None)
                if cmap is not None:
                    colors = cmap(face_z)
                else:
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
                _ve = 20.0
            try:
                _va = float(np.asarray(view_azim))
            except Exception:
                _va = -60.0
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
            z_norm = (V[:, 2] - V[:, 2].min()) / max(
                1e-6, (V[:, 2].max() - V[:, 2].min()),
            )
            try:
                preset = st.session_state.get("preview_palette", "Custom")
                custom = [
                    st.session_state.get("preview_grad_c1", "#1149FF"),
                    st.session_state.get("preview_grad_c2", "#8801DE"),
                    st.session_state.get("preview_grad_c3", "#124FA0"),
                ]
                mesh_colors = build_gradient_colors(
                    z_norm, preset if preset != "Custom" else None, custom,
                )
            except Exception:
                import matplotlib.pyplot as plt

                colorscale = plt.get_cmap("viridis")
                mesh_colors = [
                    [int(255 * r), int(255 * g), int(255 * b)]
                    for r, g, b, _ in colorscale(z_norm)
                ]

            # Ensure Plotly receives a plain Python list (not a numpy ndarray).
            # `build_gradient_colors` may return an ndarray; convert to list
            # to avoid static-analysis complaints about ndarray vs list types.
            try:
                mesh_colors = cast("Any", mesh_colors.tolist() if hasattr(mesh_colors, "tolist") else mesh_colors)
            except Exception:
                mesh_colors = cast("Any", mesh_colors)

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
                                max(st.session_state.get("mesh_fresnel", 0.2), 0.0), 1.0,
                            ),
                        ),
                        vertexcolor=mesh_colors,
                        hoverinfo="skip",
                        name="mesh",
                        opacity=1.0,
                    ),
                ],
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
                        up=dict(x=0, y=0, z=1), projection=dict(type="orthographic"),
                    ),
                    bgcolor=st.session_state.get("preview_bg_color", "#242B46"),
                ),
                margin=dict(l=0, r=0, t=30, b=0),
            )
            try:
                out: Any = fig.to_image(
                    format="png", width=width_px, height=height_px, scale=1,
                )
            except Exception:
                out = pio.to_image(
                    fig, format="png", width=width_px, height=height_px, scale=1,
                )
            try:
                st.session_state["_last_snapshot_method"] = "plotly"
            except Exception:
                pass
            return cast("bytes", out)
        except Exception:
            return None

    try:
        if engine == "plotly":
            return _render_plotly() or _render_matplotlib()
        return _render_matplotlib() or _render_plotly()
    except Exception:
        return None


__all__ = [
    "render_mesh_snapshot_cached",
]
