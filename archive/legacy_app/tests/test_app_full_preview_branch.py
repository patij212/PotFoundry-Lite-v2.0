import sys
import types
from collections.abc import Callable, Iterable
from typing import TYPE_CHECKING, Any, cast

import numpy as np

if "streamlit" not in sys.modules:
    # real streamlit not present; create a small stub module
    _st = types.ModuleType("streamlit")

    class _Dummy:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        def button(self, *a: Any, **k: Any) -> bool:
            return False

        def selectbox(self, *a: Any, **k: Any) -> Any:
            # return first option if provided
            return a[1][0] if len(a) > 1 and a[1] else None

        def slider(self, *a: Any, **k: Any) -> int:
            return 0

        def number_input(self, *a: Any, **k: Any) -> int:
            return 0

        def text_input(self, *a: Any, **k: Any) -> str:
            return ""

        def markdown(self, *a: Any, **k: Any) -> None:
            return None

        def caption(self, *a: Any, **k: Any) -> None:
            return None

        def write(self, *a: Any, **k: Any) -> None:
            return None

        def download_button(self, *a: Any, **k: Any) -> None:
            return None

    class _Cols(list[_Dummy]):
        def __init__(self, n: int) -> None:
            super().__init__([_Dummy() for _ in range(n)])

    def _columns(n: int) -> _Cols:
        return _Cols(n)

    class _Ctx:
        def __enter__(self) -> _Dummy:
            return _Dummy()

        def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
            return False

    def _tabs(labels: Iterable[Any]) -> tuple[_Dummy, ...]:
        # return tuple of dummy tab contexts matching requested labels
        return tuple(_Dummy() for _ in labels)

    class _CacheData:
        def __call__(self, *a: Any, **k: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
            def _wrap(f: Callable[..., Any]) -> Callable[..., Any]:
                return f

            return _wrap

        def clear(self) -> None:
            return None

    class _Empty:
        def image(self, *a: Any, **k: Any) -> None:
            return None

        def plotly_chart(self, *a: Any, **k: Any) -> None:
            return None

        def info(self, *a: Any, **k: Any) -> None:
            return None

        def empty(self) -> None:
            return None

        def caption(self, *a: Any, **k: Any) -> None:
            return None

    def _noop(*a: Any, **k: Any) -> None:
        return None

    def _empty_box(*a: Any, **k: Any) -> _Empty:
        return _Empty()

    def _columns_wrapper(*a: Any, **k: Any) -> _Cols:
        return _columns(a[0] if a else 1)

    def _tabs_wrapper(labels: Iterable[Any]) -> tuple[_Dummy, ...]:
        return _tabs(labels)

    def _spinner(*a: Any, **k: Any) -> _Ctx:
        return _Ctx()

    _st.set_page_config = _noop
    _st.title = _noop
    _st.caption = _noop
    _st.markdown = _noop
    _st.info = _noop
    _st.warning = _noop
    _st.success = _noop
    _st.subheader = _noop
    _st.empty = _empty_box
    _st.columns = _columns_wrapper
    _st.sidebar = _Ctx()
    _st.tabs = _tabs_wrapper

    _st.spinner = _spinner
    _st.cache_data = _CacheData()
    _st.session_state = {}
    _st.divider = _noop
    sys.modules["streamlit"] = _st


import ast
from importlib import import_module
from pathlib import Path

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
local_ns: dict[str, Any] = {}
# Provide the referenced helper from pfui.colors to the function globals
try:
    colors_mod = import_module("pfui.colors")
    local_ns["build_gradient_colors"] = colors_mod.build_gradient_colors
except Exception:
    # Fallback: if pfui.colors can't be imported in this environment, provide a simple stub
    # that returns numpy array like the real function
    import numpy as np

    def _mock_gradient(z: Any, p: Any, c: Any) -> np.ndarray:
        n = len(z) if hasattr(z, "__len__") else 0
        return np.full((n, 3), [200, 200, 230], dtype=np.uint8)

    local_ns["build_gradient_colors"] = _mock_gradient


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
app_build_mesh_kwargs_for_test = cast("Callable[..., dict[str, Any]]", _maybe_app_build)


def test_build_mesh_kwargs_gradient_branch():
    # small mock mesh
    Vd = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 10.0], [-1.0, 0.0, 20.0]])
    Fd = np.array([[0, 1, 2]])

    ss: dict[str, Any] = {
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
