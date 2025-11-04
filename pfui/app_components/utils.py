"""UI-agnostic utilities extracted from `app.py` (transitional).

These helpers are safe to import in tests without booting the Streamlit UI.
`app.py` imports and re-exports these to preserve its public API.
"""

from __future__ import annotations

import re
from typing import Any

import numpy as np

import pfui.schemas as SC
from pfui.colors import build_gradient_colors


def build_mesh_kwargs_for_test(Vd, Fd, ss, n_theta, n_z, fig_h):
    """Construct the mesh kwargs used for Plotly Mesh3d rendering.

    Mirrors the logic used in the full-preview path but kept isolated so
    unit tests can exercise the branch that previously left `mesh_kwargs`
    undefined when gradient coloring was active.
    """
    use_gradient = bool(ss.get("use_gradient_color", True))
    solid_hex = str(ss.get("solid_color", "#BFC7D5"))
    mesh_colors = []
    if len(Vd) and use_gradient:
        try:
            span_z = float(np.ptp(Vd[:, 2])) if len(Vd) else 0.0
            z_norm = (Vd[:, 2] - Vd[:, 2].min()) / max(1e-6, span_z)
            mesh_colors = build_gradient_colors(
                z_norm,
                ss.get("preview_palette", None),
                [
                    ss.get("preview_grad_c1", "#2850D0"),
                    ss.get("preview_grad_c2", "#5FA8FF"),
                    ss.get("preview_grad_c3", "#E2F3FF"),
                ],
            )
        except Exception:
            mesh_colors = [[200, 200, 230] for _ in range(len(Vd))]
    else:
        mesh_colors = []

    mesh_kwargs: dict[str, Any] = dict(
        x=Vd[:, 0],
        y=Vd[:, 1],
        z=Vd[:, 2],
        i=Fd[:, 0],
        j=Fd[:, 1],
        k=Fd[:, 2],
        flatshading=bool(ss.get("mesh_flatshading", False)),
        lighting=dict(
            ambient=min(max(float(ss.get("mesh_ambient", 0.35)), 0.0), 1.0),
            diffuse=min(max(float(ss.get("mesh_diffuse", 0.95)), 0.0), 1.0),
            specular=min(max(float(ss.get("mesh_specular", 0.25)), 0.0), 1.0),
            roughness=min(max(float(ss.get("mesh_roughness", 0.7)), 0.0), 1.0),
            fresnel=min(max(float(ss.get("mesh_fresnel", 0.2)), 0.0), 1.0),
        ),
        hoverinfo="skip",
        name="mesh",
        opacity=1.0,
    )
    if use_gradient and len(mesh_colors):
        mesh_kwargs["vertexcolor"] = mesh_colors
    else:
        mesh_kwargs["color"] = solid_hex
    return mesh_kwargs


def _mask_possible_secrets(text: str) -> str:
    """Mask common secret patterns and any known supabase key.

    Defensive: never reveal raw keys or long hashes in UI text.
    """
    try:
        # Try to access st.secrets lazily via import to avoid importing Streamlit at module import
        svc_key = None
        try:
            import streamlit as _st  # local import

            svc_key = _st.secrets.get("connections", {}).get("supabase", {}).get("key")
        except Exception:
            svc_key = None
        if svc_key and svc_key in text:
            text = text.replace(svc_key, "[REDACTED]")

        # Mask JWT-like tokens
        text = re.sub(
            r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED_JWT]", text
        )
        # Mask long hex hashes (>=48 hex chars)
        text = re.sub(r"[0-9a-fA-F]{48,}", "[REDACTED_HASH]", text)
    except Exception:
        return text
    return text


def resolve_schema_key(style_name: str) -> str:
    """Resolve a style identifier to a STYLE_SCHEMAS key.

    If exact key exists, return it; otherwise perform a case-insensitive
    match and fall back to the original value.
    """
    styles = SC.get_style_schemas()
    if style_name in styles:
        return style_name
    for k in styles.keys():
        if k.lower() == str(style_name).lower():
            return k
    return style_name


__all__ = [
    "build_mesh_kwargs_for_test",
    "_mask_possible_secrets",
    "resolve_schema_key",
]
