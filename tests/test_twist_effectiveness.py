from __future__ import annotations
import numpy as np

from potfoundry.core.geometry import build_pot_mesh, STYLES


def test_twist_changes_geometry():
    """Meshes with different total twist should differ at least at one vertex."""
    H = 120.0
    Rt = 70.0
    Rb = 45.0
    t_wall = 3.0
    t_bottom = 3.0
    r_drain = 8.0
    expn = 1.1
    n_theta = 96
    n_z = 48

    # Choose a style function that supports twist; SpiralRidges should comply
    r_outer_fn = STYLES["SpiralRidges"][0]

    # Build without twist
    opts0 = {
        "twist_total_turns": 0.0,
    }
    V0, F0, _ = build_pot_mesh(
        H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
        expn=expn, n_theta=n_theta, n_z=n_z, r_outer_fn=r_outer_fn, style_opts=opts0,
    )

    # Build with 0.5 total turns of twist
    opts1 = {
        "twist_total_turns": 0.5,
    }
    V1, F1, _ = build_pot_mesh(
        H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
        expn=expn, n_theta=n_theta, n_z=n_z, r_outer_fn=r_outer_fn, style_opts=opts1,
    )

    V0 = np.asarray(V0)
    V1 = np.asarray(V1)

    # Same topology expected
    assert len(F0) == len(F1)
    assert V0.shape == V1.shape

    # Twist should change at least one vertex position (allow tiny tolerance)
    diff = np.max(np.abs(V0 - V1))
    assert diff > 1e-6
