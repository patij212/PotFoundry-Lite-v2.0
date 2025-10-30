import numpy as np
import sys
import types

# Some CI environments have a partially-stubbed `streamlit` where a few
# top-level helper symbols (set_page_config, title, columns, etc.) are
# missing which causes importing `app` during collection to raise. To avoid
# failing collection we inject a minimal, safe stub into sys.modules that
# provides no-op implementations of the small surface of the Streamlit API
# that `app.py` exercises at import time. This stub is intentionally
# lightweight and only used for import-time side-effects; the rest of the
# test suite uses the real Streamlit where available.
if "streamlit" not in sys.modules:
    # real streamlit not present; create a small stub module
    _st = types.ModuleType("streamlit")
    class _Dummy:
        def __init__(self, *args, **kwargs):
            pass
        def button(self, *a, **k):
            return False
        def selectbox(self, *a, **k):
            # return first option if provided
            opts = a[1] if len(a) > 1 else k.get('options')
            if isinstance(opts, (list, tuple)) and opts:
                return opts[0]
            return None
        def slider(self, *a, **k):
            # return the default value if provided
            return a[2] if len(a) > 2 else k.get('value')
        def text_input(self, *a, **k):
            return k.get('value', "")
        def number_input(self, *a, **k):
            return k.get('value', 0)
        def checkbox(self, *a, **k):
            return k.get('value', False)
        def caption(self, *a, **k):
            return None
        def write(self, *a, **k):
            return None
        def download_button(self, *a, **k):
            return None

    class _Cols(list):
        def __init__(self, n):
            super().__init__([_Dummy() for _ in range(n)])

    def _columns(n):
        return _Cols(n)

    class _Ctx:
        def __enter__(self):
            return _Dummy()
        def __exit__(self, exc_type, exc, tb):
            return False

    def _tabs(labels):
        # return tuple of dummy tab contexts matching requested labels
        return tuple(_Dummy() for _ in labels)

    class _CacheData:
        def clear(self):
            return None

    class _Empty:
        def image(self, *a, **k):
            return None
        def plotly_chart(self, *a, **k):
            return None
        def info(self, *a, **k):
            return None
        def empty(self):
            return None
        def caption(self, *a, **k):
            return None

    _st.set_page_config = lambda *a, **k: None
    _st.title = lambda *a, **k: None
    _st.caption = lambda *a, **k: None
    _st.markdown = lambda *a, **k: None
    _st.info = lambda *a, **k: None
    _st.warning = lambda *a, **k: None
    _st.success = lambda *a, **k: None
    _st.subheader = lambda *a, **k: None
    _st.empty = lambda *a, **k: _Empty()
    _st.columns = lambda *a, **k: _columns(a[0] if a else 1)
    _st.sidebar = _Ctx()
    _st.tabs = lambda labels: _tabs(labels)
    _st.spinner = lambda *a, **k: _Ctx()
    _st.cache_data = _CacheData()
    _st.session_state = {}
    _st.divider = lambda *a, **k: None
    _st.set_page_config = lambda *a, **k: None
    sys.modules["streamlit"] = _st

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
