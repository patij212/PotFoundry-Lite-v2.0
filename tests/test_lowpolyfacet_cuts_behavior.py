from __future__ import annotations

import numpy as np

from potfoundry.core.geometry import (
    base_radius,
)
from potfoundry.core.styles.lowpoly_facet import r_outer_lowpoly_facet


def test_lowpolyfacet_cuts_do_not_extend_near_seams():
    """
    With lp_outward_mode=True and non-zero cut angles, verify that the
    resulting radius near tier seams never exceeds the baseline faceted radius.

    Baseline faceted radius is obtained by calling the style with outward OFF
    and both cut angles at 0°, which equals r0 * (1 - amp * (1 - tri**p)).
    """
    H = 120.0
    Rt = 70.0  # top radius
    Rb = 45.0  # bottom radius
    expn = 1.1

    facets = 12
    tiers = 6
    amp = 0.12
    jitter = 0.10
    bevel = 0.18

    # Choose a specific seam index and compute a z within the seam window
    k = 2
    h_tier = H / tiers
    z_win_frac = 0.12  # 12% of tier height (matches UI default semantics)
    z_win = z_win_frac * h_tier
    # Sample points inside the bottom and top seam windows around tier k
    z_bot = (k / tiers) * H + 0.5 * z_win
    z_top = ((k + 1) / tiers) * H - 0.5 * z_win

    thetas = np.linspace(0.0, 2.0 * np.pi, 720, endpoint=False)

    # Common style options (inject base-shape params for internal seam start calcs)
    base_opts = dict(
        lp_facets=facets,
        lp_tiers=tiers,
        lp_amp=amp,
        lp_jitter=jitter,
        lp_phase_deg=0,
        lp_bevel=bevel,
        lp_cut_z_window_frac=100.0 * z_win_frac,  # percent in UI
        lp_cut_cap_mm=0.8,
        _pf_rb=Rb,
        _pf_rt=Rt,
        _pf_expn=expn,
    )

    # Baseline: outward OFF, no cuts
    baseline_opts = dict(
        base_opts, lp_outward_mode=False, lp_cut_bot_deg=0, lp_cut_top_deg=0
    )

    # With cuts active: outward ON, but should not extend due to engine guard
    cut_opts = dict(
        base_opts, lp_outward_mode=True, lp_cut_bot_deg=10, lp_cut_top_deg=6
    )

    # Bottom-side check
    r0_bot = base_radius(z_bot, H, Rb, Rt, expn, baseline_opts)
    r_base_bot = np.asarray(
        r_outer_lowpoly_facet(thetas, z_bot, r0_bot, H, baseline_opts), dtype=float
    )
    r_cut_bot = np.asarray(
        r_outer_lowpoly_facet(thetas, z_bot, r0_bot, H, cut_opts), dtype=float
    )

    # Top-side check
    r0_top = base_radius(z_top, H, Rb, Rt, expn, baseline_opts)
    r_base_top = np.asarray(
        r_outer_lowpoly_facet(thetas, z_top, r0_top, H, baseline_opts), dtype=float
    )
    r_cut_top = np.asarray(
        r_outer_lowpoly_facet(thetas, z_top, r0_top, H, cut_opts), dtype=float
    )

    # Assert no outward growth within window (allow tiny numerical tolerance)
    eps = 1e-6
    assert float(np.max(r_cut_bot - r_base_bot)) <= eps
    assert float(np.max(r_cut_top - r_base_top)) <= eps
