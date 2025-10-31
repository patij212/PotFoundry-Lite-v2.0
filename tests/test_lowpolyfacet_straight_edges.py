from __future__ import annotations

import math
import numpy as np

from potfoundry.core.geometry import r_outer_lowpoly_facet, base_radius


def test_straight_seam_edges_plateau_matches_expected_limit():
    """
    When lp_cut_straight_edges=True, at the seam plane the upper envelope
    of the chamfer band should clamp to a constant value equal to
    r0 - min(cut_cap_mm, z_win * tan(angle)). Ensure the plateau exists
    and matches the expected constant within tolerance.
    """
    H = 120.0
    Rt = 70.0  # top radius
    Rb = 45.0  # bottom radius
    expn = 1.1

    facets = 24
    tiers = 6
    amp = 0.12
    jitter = 0.10
    bevel = 0.12

    thetas = np.linspace(0.0, 2.0 * math.pi, 720, endpoint=False)

    # Choose a mid seam
    k = 2
    h_tier = H / tiers
    z_win_frac = 0.12
    z_win = z_win_frac * h_tier
    z_seam = (k / tiers) * H

    base_opts = dict(
        lp_facets=facets,
        lp_tiers=tiers,
        lp_amp=amp,
        lp_jitter=jitter,
        lp_phase_deg=0,
        lp_bevel=bevel,
        lp_cut_bot_deg=12,
        lp_cut_top_deg=12,
        lp_cut_z_window_frac=100.0 * z_win_frac,
        lp_cut_cap_mm=0.8,
        _pf_rb=Rb,
        _pf_rt=Rt,
        _pf_expn=expn,
    )

    r0 = base_radius(z_seam, H, Rb, Rt, expn, base_opts)

    # Straight seam edges enabled
    opts_straight = dict(base_opts, lp_cut_straight_edges=True)
    r_straight = np.asarray(
        r_outer_lowpoly_facet(thetas, z_seam, r0, H, opts_straight), dtype=float
    )
    # Expected clamp at the bottom seam (top seam inactive this far away)
    angle_deg = float(base_opts["lp_cut_bot_deg"])
    z_win = (base_opts["lp_cut_z_window_frac"] * 0.01) * (H / tiers)
    depth = min(
        float(base_opts["lp_cut_cap_mm"]), z_win * math.tan(math.radians(angle_deg))
    )
    r_expected = r0 - depth

    # The maximum radius at the seam should equal the expected clamp within tolerance
    assert abs(float(np.max(r_straight)) - float(r_expected)) <= 1e-6

    # A substantial fraction of samples should be clamped (plateau exists)
    tol = 1e-5
    clamped = np.isclose(r_straight, r_expected, atol=tol)
    from typing import cast
    # Use explicit float denominator so static type checkers don't see mixed
    # numpy/object numeric unions in the division. Guard length with max(1, ...)
    # Use integer counts to avoid static-typing issues with NumPy scalar types
    count_i: int = int(np.count_nonzero(clamped))
    threshold: int = max(1, int(0.02 * float(len(r_straight))))
    assert count_i >= threshold  # at least ~2% of theta samples lie on the straight plateau

    # Within half of the seam window above the seam plane, variation across theta should remain tiny.
    # This guards against the jagged “saw tooth” perimeter that motivated the straight-edge fix.
    z_offsets = [0.25 * z_win, 0.50 * z_win]
    std_tolerance = 0.18  # mm; still tight enough to catch regressions while accommodating guard-only flattening
    for dz in z_offsets:
        z_sample = z_seam + dz
        r0_sample = base_radius(z_sample, H, Rb, Rt, expn, opts_straight)
        r_band = np.asarray(
            r_outer_lowpoly_facet(thetas, z_sample, r0_sample, H, opts_straight),
            dtype=float,
        )
        assert float(np.std(r_band)) <= std_tolerance


def _baseline_profile(
    thetas: np.ndarray,
    z: float,
    H: float,
    Rb: float,
    Rt: float,
    expn: float,
    opts: dict,
) -> np.ndarray:
    """Return the lowpoly profile without seam cuts for comparison."""
    base_opts = dict(opts)
    base_opts.update(
        {
            "lp_cut_bot_deg": 0.0,
            "lp_cut_top_deg": 0.0,
        }
    )
    r0 = base_radius(z, H, Rb, Rt, expn, base_opts)
    return np.asarray(r_outer_lowpoly_facet(thetas, z, r0, H, base_opts), dtype=float)


def test_uniform_ring_does_not_extend_outward():
    """Uniform seam ring should only remove material; flatness is no longer enforced."""

    H = 120.0
    Rt = 70.0
    Rb = 45.0
    expn = 1.1
    facets = 24
    tiers = 6
    amp = 0.12
    jitter = 0.10
    bevel = 0.12

    thetas = np.linspace(0.0, 2.0 * math.pi, 720, endpoint=False)
    k = 2
    h_tier = H / tiers
    z_win_frac = 0.12
    z_seam = (k / tiers) * H

    opts = dict(
        lp_facets=facets,
        lp_tiers=tiers,
        lp_amp=amp,
        lp_jitter=jitter,
        lp_phase_deg=0,
        lp_bevel=bevel,
        lp_cut_bot_deg=12,
        lp_cut_top_deg=12,
        lp_cut_z_window_frac=100.0 * z_win_frac,
        lp_cut_cap_mm=0.8,
        lp_cut_straight_edges=True,
        lp_uniform_ring=True,
        _pf_rb=Rb,
        _pf_rt=Rt,
        _pf_expn=expn,
    )

    baseline = _baseline_profile(thetas, z_seam, H, Rb, Rt, expn, opts)
    r0 = base_radius(z_seam, H, Rb, Rt, expn, opts)
    seam = np.asarray(r_outer_lowpoly_facet(thetas, z_seam, r0, H, opts), dtype=float)

    assert np.all(seam <= baseline + 1e-6)

    z_win = (opts["lp_cut_z_window_frac"] * 0.01) * h_tier
    for dz in (0.25 * z_win, 0.5 * z_win):
        z_sample = z_seam + dz
        r0_sample = base_radius(z_sample, H, Rb, Rt, expn, opts)
        band = np.asarray(
            r_outer_lowpoly_facet(thetas, z_sample, r0_sample, H, opts), dtype=float
        )
        baseline_band = _baseline_profile(thetas, z_sample, H, Rb, Rt, expn, opts)
        assert np.all(band <= baseline_band + 1e-6)


def test_uniform_ring_outward_mode_remains_inward():
    """Outward guard plus uniform ring should still stay inward; flatness not enforced."""

    H = 120.0
    Rt = 70.0
    Rb = 45.0
    expn = 1.1
    facets = 24
    tiers = 6
    amp = 0.12
    jitter = 0.10
    bevel = 0.12

    thetas = np.linspace(0.0, 2.0 * math.pi, 720, endpoint=False)
    k = 2
    h_tier = H / tiers
    z_win_frac = 0.12
    z_seam = (k / tiers) * H

    opts = dict(
        lp_facets=facets,
        lp_tiers=tiers,
        lp_amp=amp,
        lp_jitter=jitter,
        lp_phase_deg=0,
        lp_bevel=bevel,
        lp_cut_bot_deg=12,
        lp_cut_top_deg=12,
        lp_cut_z_window_frac=100.0 * z_win_frac,
        lp_cut_cap_mm=0.8,
        lp_cut_straight_edges=True,
        lp_uniform_ring=True,
        lp_outward_mode=True,
        _pf_rb=Rb,
        _pf_rt=Rt,
        _pf_expn=expn,
    )

    baseline = _baseline_profile(thetas, z_seam, H, Rb, Rt, expn, opts)
    r0 = base_radius(z_seam, H, Rb, Rt, expn, opts)
    seam = np.asarray(r_outer_lowpoly_facet(thetas, z_seam, r0, H, opts), dtype=float)

    assert np.all(seam <= baseline + 1e-6)

    z_win = (opts["lp_cut_z_window_frac"] * 0.01) * h_tier
    for dz in (0.25 * z_win, 0.5 * z_win):
        z_sample = z_seam + dz
        r0_sample = base_radius(z_sample, H, Rb, Rt, expn, opts)
        band = np.asarray(
            r_outer_lowpoly_facet(thetas, z_sample, r0_sample, H, opts), dtype=float
        )
        baseline_band = _baseline_profile(thetas, z_sample, H, Rb, Rt, expn, opts)
        assert np.all(band <= baseline_band + 1e-6)
