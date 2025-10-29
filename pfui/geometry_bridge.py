"""Import-light bridge for heavy pot geometry functions.

This module exposes a conservative-typed wrapper `build_pot_mesh_safe` that
defers importing the numeric-heavy `potfoundry` geometry implementation until
call time. Callers (UI code) should use this function to avoid pulling NumPy
and large numeric types into their import-time type-checking.
"""
from __future__ import annotations

from typing import Any, Dict, Tuple, cast, List

# Import the lazy importer from this package; accessing `build_pot_mesh` will
# trigger the dynamic import only when `build_pot_mesh_safe` is called.
from .imports import build_pot_mesh as _lazy_build_pot_mesh


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
    style_opts: Dict[str, Any],
) -> Tuple[List[tuple[float, float, float]], List[tuple[int, int, int]], Dict[str, Any]]:
    """Call the real mesh builder lazily and return conservative-typed results.

    The return types are intentionally `Any`/`Dict[str, Any]` to avoid importing
    NumPy typing into UI modules. Callers should treat the first two return
    values as vertex and face sequences and the third as a diagnostics mapping.

    Raises:
        RuntimeError: If the underlying builder is not available.
    """
    builder = _lazy_build_pot_mesh
    if builder is None:
        raise RuntimeError("build_pot_mesh implementation not available")
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
        Tuple[List[tuple[float, float, float]], List[tuple[int, int, int]], Dict[str, Any]],
        (verts, faces, diag),
    )


def adapt_r_outer_fn(fn: Any):
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
    def _wrapped(theta, z, r_base, expn, opts):
        try:
            import numpy as _np
            th = _np.asarray(theta)
        except Exception:
            _np = None
            th = theta

        # Try scalar fast-path when input looks scalar
        try:
            if _np is not None and getattr(th, "ndim", None) == 0:
                res = fn(float(th), z, r_base, expn, opts)
                return _np.asarray(res) if _np is not None else res
        except Exception:
            pass

        # Try vectorized call first
        try:
            res = fn(th, z, r_base, expn, opts)
            return _np.asarray(res) if _np is not None else res
        except Exception:
            # Fall back to per-element invocation
            try:
                if _np is not None:
                    flat = [_np.asarray(fn(float(t), z, r_base, expn, opts)) for t in th.ravel()]
                    out = _np.asarray(flat)
                    try:
                        return out.reshape(th.shape)
                    except Exception:
                        return out
                else:
                    return [fn(float(t), z, r_base, expn, opts) for t in theta]
            except Exception:
                try:
                    return fn(float(theta), z, r_base, expn, opts)
                except Exception:
                    return fn(theta, z, r_base, expn, opts)

    return _wrapped
