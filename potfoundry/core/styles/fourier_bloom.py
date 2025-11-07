"""
Fourier Bloom style function for PotFoundry.

This module contains the outer radius function for the fourier_bloom pot style.
"""

from __future__ import annotations

import math

# Constants
TAU = 2.0 * math.pi
import numpy as np

__all__ = ["r_outer_fourier_bloom"]


def r_outer_fourier_bloom(
    theta: NDArrayFloat | float, z: float, r0: float, H: float, opts: Dict[str, Any]
) -> NDArrayFloat | float:
    t = z / H if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)

    bc8 = float(opts.get("fb_base_cos8_amp", 0.12))
    bc8p = float(opts.get("fb_base_cos8_phase", 0.0))
    bs4 = float(opts.get("fb_base_sin4_amp", 0.05))
    bs4p = float(opts.get("fb_base_sin4_phase", 0.6))
    bc12 = float(opts.get("fb_base_cos12_amp", -0.04))
    bc12p = float(opts.get("fb_base_cos12_phase", 1.3))
    base = (
        1.0
        + bc8 * np.cos(8.0 * th + bc8p)
        + bs4 * np.sin(4.0 * th + bs4p)
        + bc12 * np.cos(12.0 * th + bc12p)
    )

    tc11 = float(opts.get("fb_top_cos11_amp", 0.18))
    tc11p = float(opts.get("fb_top_cos11_phase", 0.5))
    ts7 = float(opts.get("fb_top_sin7_amp", -0.07))
    ts7p = float(opts.get("fb_top_sin7_phase", 0.0))
    tc22 = float(opts.get("fb_top_cos22_amp", 0.05))
    tc22p = float(opts.get("fb_top_cos22_phase", 0.9))
    top = (
        1.0
        + tc11 * np.cos(11.0 * th + tc11p)
        + ts7 * np.sin(7.0 * th + ts7p)
        + tc22 * np.cos(22.0 * th + tc22p)
    )

    f = (1.0 - t) * base + t * top

    wob_amp = float(opts.get("fb_wobble_amp", 0.06))
    wob_freq = float(opts.get("fb_wobble_freq", 5.0))
    wob_zgain = float(opts.get("fb_wobble_zgain", 0.5))
    f *= 1.0 + wob_amp * np.sin(wob_freq * th + TAU * wob_zgain * t)

    strength = float(opts.get("fb_strength", 1.0))
    out = r0 * (1.0 + (f - 1.0) * strength)
    return float(out) if np.isscalar(theta) else out
