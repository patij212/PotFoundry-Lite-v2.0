"""Helper utilities for dynamically importing Streamlit in pfui modules.

This module provides a small API to always retrieve the current Streamlit
module via importlib.import_module("streamlit"). It lets tests swap out
`sys.modules['streamlit']` safely and ensures we always bind to the
latest stub/module instance.
"""
from __future__ import annotations

import importlib
import sys
from types import ModuleType
from typing import Any, MutableMapping, Protocol, cast
import base64


class StreamlitLike(Protocol):
    """A lightweight typing Protocol that describes streamlit-like
    objects used in our tests and UI code.

    We keep this intentionally minimal to be compatible with both the
    installed `streamlit` module and test shims that expose a subset
    of attributes (notably `session_state`).
    """

    session_state: MutableMapping[str, Any]
    def __getattr__(self, name: str) -> Any: ...


def get_st() -> StreamlitLike:  # pragma: no cover - tiny helper
    """Return the currently-imported Streamlit module.

    Uses importlib.import_module so tests that replace `sys.modules['streamlit']`
    are effective immediately. Do not assign the returned object to a
    module-level variable for long-lived references if you need tests to
    influence behavior.
    """
    # Prefer any explicit sys.modules entry so tests that set sys.modules['streamlit']
    # are always honored. Fall back to importlib when not present.
    try:
        mod_sys = sys.modules.get("streamlit")
    except Exception:
        mod_sys = None
    mod_import = None
    try:
        mod_import = importlib.import_module("streamlit")
    except Exception:
        mod_import = None

    # Prefer a module object that exposes common widget helpers like number_input
    # (this helps when tests monkeypatch an imported streamlit module). Fall
    # back to sys.modules entry or the imported module if neither expose widgets.
    def _has_widgets(m: ModuleType | None) -> bool:
        try:
            return m is not None and (hasattr(m, "number_input") or hasattr(m, "session_state"))
        except Exception:
            return False


        # (placeholder image helper intentionally moved to module-level)

    if _has_widgets(mod_sys) and _has_widgets(mod_import) and mod_sys is not mod_import:
        # Both expose widgets but differ — prefer the one in sys.modules
        return cast(StreamlitLike, mod_sys)
    if _has_widgets(mod_sys):
        return cast(StreamlitLike, mod_sys)
    if _has_widgets(mod_import):
        return cast(StreamlitLike, mod_import)
    if mod_sys is not None:
        return cast(StreamlitLike, mod_sys)
    if mod_import is not None:
        return cast(StreamlitLike, mod_import)
    raise ImportError("Streamlit module not found")


def get_components_v1() -> ModuleType:
    """Return the streamlit.components.v1 module using importlib.
    """
    return importlib.import_module("streamlit.components.v1")


def try_get_st() -> StreamlitLike | None:
    """Return the currently-imported Streamlit module, or None if missing.

    Unlike get_st(), this wrapper returns None instead of raising when
    Streamlit is not installed which is helpful in test environments
    where a minimal shim may not be present.
    """
    try:
        mod = sys.modules.get("streamlit")
        if mod is not None:
            return cast(StreamlitLike, mod)
        return cast(StreamlitLike, importlib.import_module("streamlit"))
    except Exception:
        return None


def safe_image(st: StreamlitLike, image: Any, **kwargs: Any) -> bool:
    """Safely display an image using Streamlit, returning True if displayed.

    This wrapper catches exceptions such as Streamlit MediaFileStorageError that
    can happen when a media id (PNG) is not found in server-side memory. When
    such an error occurs we show a benign placeholder and return False. This
    prevents the app from failing on missing media ids while providing an
    explicit log message for diagnostics.
    """
    if st is None:
        return False


    # nested safe_placeholder_image removed


    # nested safe_placeholder_image removed - top-level function added below


    # NOTE: Prior versions exposed `safe_placeholder_image` as a nested helper in
    # this function; the canonical, importable version is defined at the
    # module-level (`safe_placeholder_image`) to avoid nested import issues.
    try:
        st.image(image, **kwargs)
        return True
    except Exception as e:  # pragma: no cover - defensive behavior
        try:
            # Try to write a single-line warning in the UI but avoid crashing
            st.warning("Preview unavailable (media missing or failed to load)")
        except Exception:
            # If streamlit isn't fully importable, fall back to a no-op
            pass
        # As a graceful UI fallback, display a minimal transparent pixel as PNG
        try:
            # 1x1 transparent PNG - base64
            tiny_png_b64 = (
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
            )
            png_bytes = base64.b64decode(tiny_png_b64)
            st.image(png_bytes, **kwargs)
        except Exception:
            pass
        return False


# module-level safe_placeholder_image (importable)
def safe_placeholder_image(target: Any, image: Any, **kwargs: Any) -> bool:
    """Safely display an image into a Streamlit placeholder.
    """
    try:
        target.image(image, **kwargs)
        return True
    except Exception:  # pragma: no cover - defensive behavior
        try:
            st = get_effective_st()
            st.warning("Preview unavailable (media missing or failed to load)")
        except Exception:
            pass
        try:
            tiny_png_b64 = (
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
            )
            png_bytes = base64.b64decode(tiny_png_b64)
            target.image(png_bytes, **kwargs)
        except Exception:
            pass
        return False


_in_get_effective_st = False


def get_effective_st() -> StreamlitLike:
    """Return an effective Streamlit module instance.

    This helper prefers a `st` object available in the *caller* module's
    globals (commonly used in tests where the test module provides a shim
    instance named `st`) over the sys.modules/stdlib `streamlit` module
    resolved by `get_st()`. This centralizes the caller-preference logic so
    callers across pfui can behave consistently and tests can reliably
    inject shims.
    """
    # First, try to detect a calling-frame-provided `st` shim with a
    # mapping-like `session_state` in the caller's globals; this matches test
    # modules that set `st = ModuleType('...')` and monkeypatch its attributes.
    # Prevent re-entrant calls which can occur during stack inspection
    # or when other modules query Streamlit while importing pfui modules.
    global _in_get_effective_st
    if _in_get_effective_st:
        return get_st()
    _in_get_effective_st = True
    try:
        import inspect
        # Prefer gently walking the frame chain using f_back to avoid
        # the heavy getframeinfo/getmodule path used by inspect.stack() which
        # may trigger module-level attribute access and recursion.
        candidates: list[tuple[object, object, str]] = []
        frame = inspect.currentframe()
        # walk upward (skip current frame and this helper frame)
        if frame is not None:
            frame = frame.f_back
        while frame is not None:
            try:
                g = frame.f_globals
            except Exception:
                frame = frame.f_back
                continue
            if "st" in g:
                candidate = g.get("st")
                if candidate is not None and getattr(candidate, "session_state", None) is not None:
                    module_name = g.get("__name__", "")
                    candidates.append((frame, candidate, module_name))
            frame = frame.f_back

        # Prefer a candidate that comes from an external module (usually the
        # test module) rather than an internal pfui/potfoundry module to avoid
        # choosing our own local module-level st.
        for _frame, candidate, module_name in candidates:
            if not (
                module_name.startswith("pfui")
                or module_name.startswith("potfoundry")
                or module_name == "streamlit"
            ):
                return candidate

        # Fallback to any candidate if we didn't find an external one
        if candidates:
            return candidates[0][1]
    except Exception:
        pass
    finally:
        _in_get_effective_st = False

    # Fallback to the regular get_st() behavior
    return get_st()
