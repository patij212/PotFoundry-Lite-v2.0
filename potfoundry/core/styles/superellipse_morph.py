"""
Superellipse Morph style function for PotFoundry.

This module contains the outer radius function for the superellipse_morph pot style.
"""
from __future__ import annotations

import math
import numpy as np
from numpy.typing import NDArray

from ...types import StyleOpts

__all__ = ["r_outer_superellipse_morph"]

def r_outer_superellipse_morph(
    theta: NDArrayFloat | float, z: float, r0: float, H: float, opts: Dict[str, Any]
) -> NDArrayFloat | float:
    t = z / H if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)

    m_base = float(opts.get("se_m_base", 2.0))
    m_top = float(opts.get("se_m_top", 5.5))
    m_curve = float(opts.get("se_m_curve_exp", 1.1))
    m_exp = m_base + (m_top - m_base) * (t**m_curve)

    c = np.abs(np.cos(th)) ** m_exp
    s = np.abs(np.sin(th)) ** m_exp
    rf = (c + s) ** (-1.0 / max(m_exp, 1e-9))

    c4a = float(opts.get("se_c4_amp", 0.08))
    c4p = float(opts.get("se_c4_phase_deg", 23.0)) * math.pi / 180.0
    c8a = float(opts.get("se_c8_amp", 0.03))
    c8p = float(opts.get("se_c8_phase_deg", 0.0)) * math.pi / 180.0
    rf *= 1.0 + c4a * np.cos(4.0 * th + c4p) + c8a * np.cos(8.0 * th + c8p)

    out = r0 * rf
    return float(out) if np.isscalar(theta) else out



