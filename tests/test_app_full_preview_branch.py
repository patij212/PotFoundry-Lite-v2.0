import numpy as np

# Ensure Streamlit has the `set_page_config` symbol at import time so importing
# `app` during test collection doesn't raise on environments with older/stub
# Streamlit builds used by CI runners.
import streamlit as st
if not hasattr(st, "set_page_config"):
    # noop replacement used only for import-time call in `app.py`
    st.set_page_config = lambda *a, **k: None

import importlib
import app


def test_build_mesh_kwargs_gradient_branch():
    # small mock mesh
    Vd = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 10.0], [-1.0, 0.0, 20.0]])
    Fd = np.array([[0, 1, 2]])

    ss = {
        "use_gradient_color": True,
        "preview_palette": "Custom",
        "preview_grad_c1": "#111111",
        "preview_grad_c2": "#222222",
        "preview_grad_c3": "#333333",
        "mesh_flatshading": False,
    }

    kwargs = app.build_mesh_kwargs_for_test(Vd, Fd, ss, n_theta=64, n_z=16, fig_h=2.0)

    # Basic sanity: keys required by go.Mesh3d exist
    for k in ("x", "y", "z", "i", "j", "k"):
        assert k in kwargs

    # Either vertexcolor or color must be present
    assert "vertexcolor" in kwargs or "color" in kwargs
