"""Utility helpers for preview package.

Contains the cache decorator compatible with various Streamlit runtimes,
and a small pyplot wrapper for backward compatibility across Streamlit
versions.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, ParamSpec, TypeVar, cast

from pfui._st import get_effective_st as get_st

P = ParamSpec("P")
R = TypeVar("R")


def cache_data(*args: Any, **kwargs: Any) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Lazily resolve st.cache_data and adapt callable/.decorate/no-op shapes."""

    def _decorator(fn: Callable[P, R]) -> Callable[P, R]:
        impl: Any = getattr(get_st(), "cache_data", None)
        try:
            if callable(impl):
                return cast(
                    "Callable[[Callable[P, R]], Callable[P, R]]", impl(*args, **kwargs),
                )(fn)
            if hasattr(impl, "decorate") and callable(impl.decorate):
                return cast(
                    "Callable[[Callable[P, R]], Callable[P, R]]",
                    impl.decorate(*args, **kwargs),
                )(fn)
        except Exception:
            # Any error while trying to create a cached wrapper should not
            # prevent the module from importing; fall back to a no-op.
            pass
        return fn

    return _decorator


def _pyplot(fig: Any, *, fill_width: bool, clear: bool = True) -> None:
    """Render matplotlib figure with Streamlit version compatibility."""
    try:
        get_st().pyplot(
            fig, clear_figure=clear, width=("stretch" if fill_width else "content"),
        )
    except TypeError:
        get_st().pyplot(fig, clear_figure=clear)


__all__ = [
    "_pyplot",
    "cache_data",
]
