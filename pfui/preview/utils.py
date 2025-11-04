"""Utility helpers for preview package.

Contains the cache decorator compatible with various Streamlit runtimes,
and a small pyplot wrapper for backward compatibility across Streamlit
versions.
"""

from __future__ import annotations

from typing import Any, Callable, ParamSpec, TypeVar, cast

import streamlit as st

P = ParamSpec("P")
R = TypeVar("R")


def cache_data(*args: Any, **kwargs: Any) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Lazily resolve st.cache_data and adapt callable/.decorate/no-op shapes."""

    def _decorator(fn: Callable[P, R]) -> Callable[P, R]:
        impl: Any = getattr(st, "cache_data", None)
        try:
            if callable(impl):
                return cast(
                    Callable[[Callable[P, R]], Callable[P, R]], impl(*args, **kwargs)
                )(fn)
            if hasattr(impl, "decorate") and callable(getattr(impl, "decorate")):
                return cast(
                    Callable[[Callable[P, R]], Callable[P, R]],
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
        st.pyplot(
            fig, clear_figure=clear, width=("stretch" if fill_width else "content")
        )
    except TypeError:
        st.pyplot(fig, clear_figure=clear)


__all__ = [
    "cache_data",
    "_pyplot",
]
