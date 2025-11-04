"""
Harmonic Ripple style function for PotFoundry.

This module contains the outer radius function for the harmonic_ripple pot style.
"""
from __future__ import annotations

import math

# Constants
TAU = 2.0 * math.pi
import numpy as np
from numpy.typing import NDArray

from ...types import StyleOpts

__all__ = ["r_outer_harmonic_ripple"]

def r_outer_harmonic_ripple(
    theta: NDArrayFloat | float, z: float, r0: float, H: float, opts: Dict[str, Any]
) -> NDArrayFloat | float:
    t = z / H if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)

    petals = max(1, int(opts.get("hr_petals", 7)))
    pet_amp = float(opts.get("hr_petal_amp", 0.16))
    pet_ph = float(opts.get("hr_petal_phase_deg", 17.0)) * math.pi / 180.0
    pet_zg = float(opts.get("hr_petal_zgain", 0.6))

    rip_freq = max(1, int(opts.get("hr_ripple_freq", 31)))
    rip_amp = float(opts.get("hr_ripple_amp", 0.03))
    rip_ph = float(opts.get("hr_ripple_phase_deg", 0.0)) * math.pi / 180.0
    rip_zg = float(opts.get("hr_ripple_zgain", 1.0))

    bell = float(opts.get("hr_bell", 0.05))

    f = 1.0 + pet_amp * np.cos(petals * th + pet_ph + TAU * pet_zg * t)
    f *= 1.0 + rip_amp * np.sin(rip_freq * th + rip_ph + TAU * rip_zg * t)
    if bell != 0.0:
        f *= 1.0 + bell * np.exp(-((t - 0.5) ** 2.0) / 0.04)

    out = r0 * f
    return float(out) if np.isscalar(theta) else out



