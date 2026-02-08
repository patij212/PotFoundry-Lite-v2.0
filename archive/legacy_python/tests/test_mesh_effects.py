from __future__ import annotations

import numpy as np

from potfoundry.core.geometry import build_pot_mesh


def _base_opts():
    # minimal style opts; build_pot_mesh expects style_opts to include
    # keys read by base_radius/_spin_twist_radians and style outer functions
    return {
        "flare_center": 0.5,
        "flare_sharp": 6.0,
        "bell_amp": 0.0,
        "spin_turns": 0.0,
        "spin_phase_deg": 0.0,
        "spin_curve_exp": 1.0,
    }


def test_twist_changes_mesh():
    H = 120.0
    Rt = 70.0
    Rb = 45.0
    t_wall = 3.0
    t_bottom = 3.0
    r_drain = 10.0
    expn = 1.1
    n_theta = 64
    n_z = 32
    # use harmonic ripple outer fn for a simple style
    from potfoundry.core.styles.harmonic_ripple import r_outer_harmonic_ripple

    opts0 = _base_opts()
    verts0, faces0, diag0 = build_pot_mesh(
        H,
        Rt,
        Rb,
        t_wall,
        t_bottom,
        r_drain,
        expn,
        n_theta,
        n_z,
        r_outer_harmonic_ripple,
        opts0,
    )

    # apply twist
    opts1 = dict(opts0)
    opts1["spin_turns"] = 1.0
    verts1, faces1, diag1 = build_pot_mesh(
        H,
        Rt,
        Rb,
        t_wall,
        t_bottom,
        r_drain,
        expn,
        n_theta,
        n_z,
        r_outer_harmonic_ripple,
        opts1,
    )

    # The diagnostics or vertices should differ when twist is applied
    assert verts0.shape == verts1.shape
    # Check that at least one vertex moved
    assert not np.allclose(verts0, verts1)


def test_flare_changes_mesh():
    H = 120.0
    Rt = 70.0
    Rb = 45.0
    t_wall = 3.0
    t_bottom = 3.0
    r_drain = 10.0
    expn = 1.1
    n_theta = 64
    n_z = 32
    from potfoundry.core.styles.harmonic_ripple import r_outer_harmonic_ripple

    opts0 = _base_opts()
    verts0, faces0, diag0 = build_pot_mesh(
        H,
        Rt,
        Rb,
        t_wall,
        t_bottom,
        r_drain,
        expn,
        n_theta,
        n_z,
        r_outer_harmonic_ripple,
        opts0,
    )

    opts2 = dict(opts0)
    opts2["flare_center"] = 0.2
    verts2, faces2, diag2 = build_pot_mesh(
        H,
        Rt,
        Rb,
        t_wall,
        t_bottom,
        r_drain,
        expn,
        n_theta,
        n_z,
        r_outer_harmonic_ripple,
        opts2,
    )

    assert verts0.shape == verts2.shape
    assert not np.allclose(verts0, verts2)
