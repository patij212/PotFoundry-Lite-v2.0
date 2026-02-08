import numpy as np

from potfoundry.core.geometry import build_pot_mesh


def test_detect_lift_delta_on_valley():
    # Synthetic grid with a deep valley at theta index 6
    n_theta = 24
    n_z = 6
    Z = n_z + 1
    # Make valley much deeper relative to surrounding values so envelope should lift it
    R_grid = np.ones((Z, n_theta), dtype=float) * 120.0
    probe_zi = 2
    for zi in range(Z):
        # Make only the probe ring have a deep valley; other rings are high so the envelope lifts the valley
        if zi == probe_zi:
            R_grid[zi, 6] = 10.0
            R_grid[zi, 0] = 200.0
        else:
            R_grid[zi, 6] = 120.0
            R_grid[zi, 0] = 200.0

    import math

    def synthetic_r_outer_fn(
        thetas: object, z: float, r0: float, H_local: float, opts: dict,
    ) -> np.ndarray:
        frac = (float(z) / 7.0) * float(int(n_z))
        idx = math.floor(frac + 0.5)
        idx = max(0, min(Z - 1, idx))
        return np.asarray(R_grid[idx, :], dtype=float)

    style_opts = {
        "sf_style": "SuperformulaBlossom",
        "sf_edge_flow_reconstruct_enable": True,
        "sf_edge_flow_verbose_diagnostics": True,
        "sf_edge_flow_verbose_write_file": False,
        "sf_edge_flow_probe": True,
        "sf_edge_flow_probe_zi": probe_zi,
        "sf_edge_flow_mode": "quantile",
        "sf_edge_flow_quantile": 0.95,
        "sf_edge_flow_amount": 1.0,
        "sf_edge_flow_twist_compensate": False,
        "sf_edge_flow_auto_deoffset": False,
        "sf_edge_flow_window": 5,
    }

    verts, faces, diagnostics = build_pot_mesh(
        H=7.0,
        Rt=40.0,
        Rb=40.0,
        t_wall=2.5,
        t_bottom=4.0,
        r_drain=3.0,
        expn=1.0,
        n_theta=n_theta,
        n_z=n_z,
        r_outer_fn=synthetic_r_outer_fn,
        style_opts=style_opts,
    )

    ev = diagnostics.get("edgeflow_verbose")
    assert ev and len(ev) > 0
    # find the probe row
    probe_row = None
    from typing import cast

    for entry in ev:
        for r in entry.get("rows") or []:
            if int(cast("int", r.get("zi", -1))) == int(
                cast("int", style_opts["sf_edge_flow_probe_zi"]),
            ):
                probe_row = r
                break
        if probe_row is not None:
            break

    assert probe_row is not None
    lift_delta = probe_row.get("lift_delta")
    assert lift_delta is not None
    # Expect a positive lift at theta index 6
    assert (
        float(lift_delta[6]) > 0.0
    ), f"Expected positive lift at theta 6, got {lift_delta[6]}"
