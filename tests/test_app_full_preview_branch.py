import sys
import types

import numpy as np

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
            return a[1][0] if len(a) > 1 and a[1] else None

        def slider(self, *a, **k):
            return 0

        def number_input(self, *a, **k):
            return 0

        def text_input(self, *a, **k):
            return ""

        def markdown(self, *a, **k):
            return None

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
        def __call__(self, *a, **k):
            def _wrap(f):
                return f

            return _wrap

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

    setattr(_st, "set_page_config", lambda *a, **k: None)
    setattr(_st, "title", lambda *a, **k: None)
    setattr(_st, "caption", lambda *a, **k: None)
    setattr(_st, "markdown", lambda *a, **k: None)
    setattr(_st, "info", lambda *a, **k: None)
    setattr(_st, "warning", lambda *a, **k: None)
    setattr(_st, "success", lambda *a, **k: None)
    setattr(_st, "subheader", lambda *a, **k: None)
    setattr(_st, "empty", lambda *a, **k: _Empty())
    setattr(_st, "columns", lambda *a, **k: _columns(a[0] if a else 1))
    setattr(_st, "sidebar", _Ctx())
    setattr(_st, "tabs", lambda labels: _tabs(labels))

    setattr(_st, "spinner", lambda *a, **k: _Ctx())
    setattr(_st, "cache_data", _CacheData())
    setattr(_st, "session_state", {})
    setattr(_st, "divider", lambda *a, **k: None)
    sys.modules["streamlit"] = _st


import ast
from importlib import import_module
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, cast

# Provide a static-only stub so the type checker knows `app_build_mesh_kwargs_for_test`
# is a callable. This avoids Pylance warning about an Optional being called while
# keeping runtime behavior unchanged.
if TYPE_CHECKING:

    def app_build_mesh_kwargs_for_test(*args: Any, **kwargs: Any) -> dict[str, Any]: ...

# Instead of importing the whole `app` module (which runs lots of Streamlit
# UI code at import time), extract only the `build_mesh_kwargs_for_test`
# function source and load it into a local namespace. This avoids executing
# the rest of `app.py` during pytest collection.

app_src = Path(__file__).parent.parent / "app.py"
app_code = app_src.read_text(encoding="utf-8")
mod = ast.parse(app_code)
func_node = None
for node in ast.walk(mod):
    if isinstance(node, ast.FunctionDef) and node.name == "build_mesh_kwargs_for_test":
        func_node = node
        break
assert func_node is not None, "build_mesh_kwargs_for_test not found in app.py"
# Wrap the function node into a new module so it can be compiled independently
new_mod = ast.Module(body=[func_node], type_ignores=[])
ast.fix_missing_locations(new_mod)
code_obj = compile(new_mod, filename=str(app_src), mode="exec")
local_ns: dict = {}
# Provide the referenced helper from pfui.colors to the function globals
try:
    colors_mod = import_module("pfui.colors")
    local_ns["build_gradient_colors"] = getattr(colors_mod, "build_gradient_colors")
except Exception:
    # Fallback: if pfui.colors can't be imported in this environment, provide a simple stub
    local_ns["build_gradient_colors"] = lambda z, p, c: [[200, 200, 230] for _ in z]


try:
    exec(code_obj, globals(), local_ns)
except Exception as e:
    print(f"Error during exec: {e}")
    raise
print(f"DEBUG: local_ns after exec: {local_ns}")
# Retrieve into a temporary variable so the type-only stub name remains a
# callable in the type checker's view; then cast into the runtime name.
_maybe_app_build = local_ns.get("build_mesh_kwargs_for_test")
assert _maybe_app_build is not None
app_build_mesh_kwargs_for_test = cast(Callable[..., dict[str, Any]], _maybe_app_build)


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

    kwargs = app_build_mesh_kwargs_for_test(Vd, Fd, ss, n_theta=64, n_z=16, fig_h=2.0)

    # Basic sanity: keys required by go.Mesh3d exist
    for k in ("x", "y", "z", "i", "j", "k"):
        assert k in kwargs

    # Either vertexcolor or color must be present
    assert "vertexcolor" in kwargs or "color" in kwargs
