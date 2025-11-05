"""
Utility functions for LowPolyFacet style.

This module contains helper functions used by the lowpoly_facet style,
including radius calculations and smooth min/max operations.
"""
from __future__ import annotations

import math
import math as _m  # Alias for base_radius function
from typing import Any

import numpy as np
import numpy.typing as npt

from ....types import StyleOpts, NDArrayFloat


def base_radius(
    z: float | NDArrayFloat,
    H: float,
    Rb: float | NDArrayFloat,
    Rt: float | NDArrayFloat,
    expn: float,
    opts: StyleOpts | dict[str, Any],
) -> float | NDArrayFloat:
    """Baseline OUTER RADIUS vs height (Rt/Rb are radii).

    This function accepts scalar or array-like `z`. For scalars it returns a
    Python float; for array-like inputs it returns a NumPy array of floats.
    The implementation preserves the original scalar behaviour while being
    robust when a caller accidentally passes a vector of z values.

    Args:
        z: Height value(s) at which to compute radius
        H: Total height of pot in mm
        Rb: Bottom radius in mm
        Rt: Top radius in mm
        expn: Exponent for profile curvature
        opts: Style options dictionary

    Returns:
        Computed radius at height z (scalar or array)
    """
    # Fast scalar path when H is non-positive
    if H <= 0:
        return float(Rb)

    z_arr = np.asarray(z)
    scalar_in = z_arr.shape == ()
    # Local temporaries may be scalar floats or numpy arrays depending on
    # whether the caller passed a scalar or vectorized `z`. Declare as a
    # union so mypy accepts both code paths.
    t: float | NDArrayFloat
    s0: float | NDArrayFloat
    s1: float | NDArrayFloat
    tw: float | NDArrayFloat
    # Local that may be scalar or array depending on input
    g: float | NDArrayFloat
    # Use vectorized math for array inputs, math (fast) for scalar
    if scalar_in:
        # normalized height
        t = 0.0 if H == 0 else max(0.0, min(1.0, float(z) / H))
        # Flare center warp (logistic remap of t)
        c = float(opts.get("flare_center", 0.5))
        k = float(opts.get("flare_sharp", 6.0))

        def _sig(x: float) -> float:
            return 1.0 / (1.0 + _m.exp(-k * (x - c)))

        s0 = _sig(0.0)
        s1 = _sig(1.0)
        tw = (_sig(t) - s0) / (s1 - s0 + 1e-9)
        r: float | NDArrayFloat = Rb + (Rt - Rb) * (tw ** float(expn))
        # Optional mid-height bell
        amp = float(opts.get("bell_amp", 0.0))
        if amp != 0.0:
            mu = float(opts.get("bell_center", 0.5))
            width = max(0.05, float(opts.get("bell_width", 0.22)))
            sigma = max(1e-3, width * 0.5)
            g = _m.exp(-0.5 * ((t - mu) / sigma) ** 2)
            r *= 1.0 + amp * g
        # Ensure we always return a Python float for scalar inputs even if
        # intermediate math produced a numpy scalar/array-like value.
        arr: NDArrayFloat = np.asarray(r, dtype=float)
        # If it's a true scalar or size-1 array, return it directly
        if getattr(arr, "size", 1) == 1:
            return float(arr.item())
        # Defensive fallback: if computation unexpectedly produced a larger
        # array in the scalar path, coerce deterministically to the first
        # value rather than raising an obscure exception. This keeps the
        # legacy scalar API stable while avoiding crashes during debug runs.
        return float(arr.ravel()[0])
    else:
        # Vectorized branch: operate on NumPy arrays
        t = np.where(H == 0, 0.0, np.clip(z_arr / H, 0.0, 1.0))
        c = float(opts.get("flare_center", 0.5))
        k = float(opts.get("flare_sharp", 6.0))

        def _sig_np(x: npt.NDArray[np.float64] | float) -> npt.NDArray[np.float64]:
            return 1.0 / (1.0 + np.exp(-k * (x - c)))

        s0 = _sig_np(0.0)
        s1 = _sig_np(1.0)
        tw = (_sig_np(t) - s0) / (s1 - s0 + 1e-9)
        r = Rb + (Rt - Rb) * (tw ** float(expn))
        amp = float(opts.get("bell_amp", 0.0))
        if amp != 0.0:
            mu = float(opts.get("bell_center", 0.5))
            width = max(0.05, float(opts.get("bell_width", 0.22)))
            sigma = max(1e-3, width * 0.5)
            g = float(np.exp(-0.5 * ((t - mu) / sigma) ** 2))
            r = r * (1.0 + amp * g)
        # Normalize type: if computation produced a scalar (0-d or size-1),
        # return a Python float so callers that expect scalars keep working.
        r = np.asarray(r, dtype=float)
        if r.shape == () or getattr(r, "size", 0) == 1:
            return float(r.item())
        return r
