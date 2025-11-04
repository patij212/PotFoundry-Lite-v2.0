"""Appearance and preview settings panel extracted from app.py.

This component renders color mapping, mesh lighting, background, and
resolution/quality controls, storing values in st.session_state with the
same keys used by the legacy inline implementation. Extracted to keep
app.py slim and modular.
"""

from __future__ import annotations

from typing import Any, cast

import streamlit as st


def _unwrap_scalar(v: Any) -> Any:
    if isinstance(v, (list, tuple)):
        try:
            return v[0]
        except Exception:
            return v
    return v


def _to_int_scalar(x: Any) -> int:
    try:
        xv = _unwrap_scalar(x)
        if isinstance(xv, (int, float)):
            return int(xv)
        if isinstance(xv, (str, bytes)):
            try:
                return int(float(xv))
            except Exception:
                return 0
        try:
            return int(float(xv))
        except Exception:
            return 0
    except Exception:
        try:
            return int(x)
        except Exception:
            return 0


def _to_float_scalar(x: Any) -> float:
    try:
        v = _unwrap_scalar(x)
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, (str, bytes)):
            try:
                return float(v)
            except Exception:
                return 0.0
        try:
            return float(v)
        except Exception:
            return 0.0
    except Exception:
        return 0.0


def ensure_appearance_defaults(ss: dict[str, Any]) -> None:
    """Ensure expected appearance keys exist in the provided session mapping.

    This helper is side-effect free aside from populating missing keys and is
    intended for unit testing without rendering Streamlit widgets.
    """
    ss.setdefault("preview_color_mode", "gradient-3")
    ss.setdefault("preview_grad_c1", "#2850D0")  # deep blue
    ss.setdefault("preview_grad_c2", "#5FA8FF")  # mid blue
    ss.setdefault("preview_grad_c3", "#E2F3FF")  # light tint
    ss.setdefault("preview_palette", "Custom")
    ss.setdefault("mesh_ambient", 0.50)
    ss.setdefault("mesh_diffuse", 1.00)
    ss.setdefault("mesh_specular", 0.40)
    ss.setdefault("mesh_roughness", 0.45)
    ss.setdefault("mesh_fresnel", 0.25)
    ss.setdefault("preview_bg_color", "#0F1724")  # dark blue-gray
    ss.setdefault("use_gradient_color", True)
    ss.setdefault("solid_color", "#BFC7D5")
    ss.setdefault("mesh_flatshading", False)
    # Resolution/quality defaults
    ss.setdefault("preview_res_scale", 1.0)
    ss.setdefault("exact_full_preview", True)
    ss.setdefault("manual_full_res", True)
    ss.setdefault("preview_dpi", 110)


def render_appearance_settings() -> None:
    """Render the Appearance & Preview Settings UI.

    Stores values in st.session_state under the same keys as the legacy
    inline implementation to preserve behavior across the app.
    """
    ss = cast(dict[str, Any], st.session_state)

    # Initialize defaults once
    ensure_appearance_defaults(ss)

    st.markdown("**Color Mapping**")
    cols_toggle = st.columns([1, 1])
    with cols_toggle[0]:
        use_solid = st.checkbox(
            "Use solid color",
            value=(not cast(Any, ss.get("use_gradient_color", True))),
            help="When enabled, surfaces and mesh use a single solid color (faster for very large meshes).",
        )
        ss["use_gradient_color"] = not use_solid
    with cols_toggle[1]:
        st.selectbox(
            "Palette preset",
            ["Custom", "Classic Blue", "Warm Sunset", "Forest", "Mono Height"],
            key="preview_palette",
            help="Choose a predefined palette or 'Custom' to edit colors manually.",
        )

    if cast(Any, ss.get("use_gradient_color", True)):
        colc1, colc2, colc3 = st.columns(3)
        with colc1:
            st.color_picker("Gradient start", key="preview_grad_c1")
        with colc2:
            st.color_picker("Mid / secondary", key="preview_grad_c2")
        with colc3:
            st.color_picker("Gradient end", key="preview_grad_c3")
    st.color_picker(
        "Solid color", key="solid_color", help="Used when gradient is disabled."
    )

    st.markdown("**Mesh Lighting**")
    ss.setdefault("mesh_flatshading", False)
    lc1, lc2, lc3, lc4, lc5, lc6 = st.columns(6)
    with lc1:
        st.slider(
            "Ambient",
            0.0,
            1.0,
            _to_float_scalar(ss.get("mesh_ambient", 0.50)),
            0.01,
            key="mesh_ambient",
        )
    with lc2:
        st.slider(
            "Diffuse",
            0.0,
            1.0,
            min(max(_to_float_scalar(ss.get("mesh_diffuse", 1.0)), 0.0), 1.0),
            0.01,
            key="mesh_diffuse",
        )
    with lc3:
        st.slider(
            "Specular",
            0.0,
            1.0,
            _to_float_scalar(ss.get("mesh_specular", 0.40)),
            0.01,
            key="mesh_specular",
        )
    with lc4:
        st.slider(
            "Roughness",
            0.0,
            1.0,
            _to_float_scalar(ss.get("mesh_roughness", 0.45)),
            0.01,
            key="mesh_roughness",
        )
    with lc5:
        st.slider(
            "Fresnel",
            0.0,
            1.0,
            _to_float_scalar(ss.get("mesh_fresnel", 0.25)),
            0.01,
            key="mesh_fresnel",
        )
    with lc6:
        st.checkbox(
            "Flat shading",
            value=cast(Any, ss.get("mesh_flatshading", False)),
            key="mesh_flatshading",
            help="Toggle flat shading to better see facet divisions.",
        )

    st.markdown("**Background**")
    st.color_picker("Preview background", key="preview_bg_color")

    st.markdown("**Resolution & Quality**")
    rc1, rc2, rc3 = st.columns(3)
    with rc1:
        st.slider(
            "Preview resolution scale",
            0.2,
            1.0,
            _to_float_scalar(ss.get("preview_res_scale", 1.0)),
            0.05,
            key="preview_res_scale",
            help="Multiplier applied to n_theta/n_z for interactive previews to improve speed.",
        )
    with rc2:
        st.checkbox(
            "Exact Full Preview",
            value=cast(Any, ss.get("exact_full_preview", True)),
            key="exact_full_preview",
            help="When enabled, the Full preview uses the exact full resolution (n_theta/n_z) with no decimation.",
        )
    with rc3:
        st.checkbox(
            "Manual mode full res",
            value=cast(Any, ss.get("manual_full_res", True)),
            key="manual_full_res",
            help="In manual mode, use full base resolution when generating mesh PNG.",
        )
    st.slider(
        "PNG dpi",
        80,
        220,
        _to_int_scalar(ss.get("preview_dpi", 110)),
        5,
        key="preview_dpi",
        help="Higher DPI for crisper static PNG snapshots.",
    )

    st.caption(
        "Settings are applied immediately to new renders. Existing previews update on next recalculation / Update click (manual mode)."
    )


__all__ = ["render_appearance_settings", "ensure_appearance_defaults"]
