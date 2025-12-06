"""Import-light bridge for heavy pot geometry functions.

This module exposes a conservative-typed wrapper `build_pot_mesh_safe` that
defers importing the numeric-heavy `potfoundry` geometry implementation until
call time. Callers (UI code) should use this function to avoid pulling NumPy
and large numeric types into their import-time type-checking.
"""

from __future__ import annotations

import importlib
from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    # Define the expected callable type for the builder so the type checker
    # understands the signature without importing heavy numeric types at
    # module import time.
    from collections.abc import Callable

    import numpy as np

    _BuildPotMeshType = Callable[..., tuple["np.ndarray", "np.ndarray", dict[str, Any]]]
else:
    _BuildPotMeshType = Any

# Import the lazy importer from this package; accessing `build_pot_mesh` will
# trigger the dynamic import only when `build_pot_mesh_safe` is called.


def build_pot_mesh_safe(
    H: float,
    Rt: float,
    Rb: float,
    t_wall: float,
    t_bottom: float,
    r_drain: float,
    expn: float,
    n_theta: int,
    n_z: int,
    r_outer_fn: Any,
    style_opts: dict[str, Any],
) -> tuple[
    list[tuple[float, float, float]], list[tuple[int, int, int]], dict[str, Any],
]:
    """Call the real mesh builder lazily and return conservative-typed results.

    The return types are intentionally `Any`/`Dict[str, Any]` to avoid importing
    NumPy typing into UI modules. Callers should treat the first two return
    values as vertex and face sequences and the third as a diagnostics mapping.

    Raises:
        RuntimeError: If the underlying builder is not available.

    """
    # Resolve the lazily-exported builder from the imports bridge at call time.
    _BUILDER_NOT_FOUND = object()
    builder_raw: Any = _BUILDER_NOT_FOUND
    try:
        builder_raw = getattr(
            importlib.import_module("pfui.imports"),
            "build_pot_mesh",
            _BUILDER_NOT_FOUND,
        )
    except Exception:
        builder_raw = _BUILDER_NOT_FOUND
    if builder_raw is _BUILDER_NOT_FOUND:
        raise RuntimeError("build_pot_mesh implementation not available")
    # Tell the type checker that builder matches the expected (stub) type.
    builder = cast("_BuildPotMeshType", builder_raw)
    # Call through directly; the underlying implementation does the heavy work
    # and will import NumPy at that time. We return conservative types so
    # callers don't incur heavy typing dependencies.
    verts, faces, diag = builder(
        H=H,
        Rt=Rt,
        Rb=Rb,
        t_wall=t_wall,
        t_bottom=t_bottom,
        r_drain=r_drain,
        expn=expn,
        n_theta=n_theta,
        n_z=n_z,
        r_outer_fn=r_outer_fn,
        style_opts=style_opts,
    )
    # Cast to conservative but structured types so callers (UI code) can
    # rely on predictable shapes without importing NumPy types at module import.
    return cast(
        "tuple[list[tuple[float, float, float]], list[tuple[int, int, int]], dict[str, Any]]",
        (verts, faces, diag),
    )


def adapt_r_outer_fn(fn: Any) -> Any:
    """Return a wrapper that accepts array-like theta and returns an array-like result.

    This central adapter mirrors the lightweight adapter used in the UI but lives in
    the import-light bridge so other callers (tests, scripts, UI) can reuse it
    without duplicating logic. It imports NumPy lazily at call time to avoid
    bringing heavy numeric imports into import-time for UI modules.

    Args:
        fn: Original style function which may accept scalar or array-like theta.

    Returns:
        A callable wrapper with the signature (theta, z, r_base, expn, opts) -> array-like

    """

    def _wrapped(theta: Any, z: Any, r_base: Any, expn: Any, opts: Any) -> Any:
        # Lazily import numpy if available and coerce input to an ndarray
        _np: Any = None
        try:
            import numpy as _np_mod

            _np = _np_mod
            th = _np.asarray(theta)
        except Exception:
            th = theta

        # Scalar fast-path
        if _np is not None and getattr(th, "ndim", None) == 0:
            try:
                res = fn(float(th), z, r_base, expn, opts)
                return _np.asarray(res)
            except Exception:
                # fall through to vectorized/per-element strategies
                pass

        # Vectorized attempt
        try:
            res = fn(th, z, r_base, expn, opts)
            return _np.asarray(res) if _np is not None else res
        except Exception:
            # per-element fallback
            if _np is not None:
                flat = []
                try:
                    iterator = th.ravel()
                except Exception:
                    # If ravel isn't available, iterate directly
                    iterator = th
                for t in iterator:
                    try:
                        flat.append(_np.asarray(fn(float(t), z, r_base, expn, opts)))
                    except Exception:
                        # Best-effort fallback per element
                        flat.append(_np.asarray(fn(t, z, r_base, expn, opts)))
                out = _np.asarray(flat)
                try:
                    return out.reshape(getattr(th, "shape", out.shape))
                except Exception:
                    return out
            else:
                try:
                    return [fn(float(t), z, r_base, expn, opts) for t in theta]
                except Exception:
                    # Final fallback: call original function with provided theta
                    return fn(theta, z, r_base, expn, opts)

    return _wrapped
