"""Spiral Ridges style function for PotFoundry.

This module contains the outer radius function for the spiral_ridges pot style.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from ...types import NDArrayFloat

# Constants
TAU = 2.0 * math.pi


__all__ = ["r_outer_spiral_ridges"]

def r_outer_spiral_ridges(
    theta: NDArrayFloat | float, z: float, r0: float, H: float, opts: dict[str, Any],
) -> NDArrayFloat | float:
    t = z / H if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)
    is_grid = th.ndim == 2

    k = max(1, int(opts.get("spiral_k", 9)))
    turns = float(opts.get("spiral_turns", 1.15))
    phase = TAU * turns * t
    amp_min = float(opts.get("spiral_amp_min", 0.15))
    amp_max = float(opts.get("spiral_amp_max", 0.25))
    amp_curve = float(opts.get("spiral_amp_curve", 1.3))
    amp = amp_min + (amp_max - amp_min) * (t**amp_curve)

    # Compute k*th once (supports scalar or grid theta)
    kth = k * th
    f = 1.0 + amp * np.sin(kth + phase)

    groove_amp = float(opts.get("spiral_groove_amp", 0.04))
    groove_mult = float(opts.get("spiral_groove_mult", 3.0))
    phase_mult = float(opts.get("spiral_phase_mult", 1.7))
    if groove_amp != 0.0:
        f += groove_amp * np.sin(groove_mult * kth + phase_mult * phase)

    out = r0 * f
    return float(out) if np.isscalar(theta) else out


# Vectorize-supported style
r_outer_spiral_ridges.__vectorized__ = True



