from potfoundry.core.geometry import build_pot_mesh


def test_build_small_mesh_smoke():
    # small mesh to exercise core builder paths
    H = 50.0
    Rt = 60.0
    Rb = 40.0
    t_wall = 2.0
    t_bottom = 3.0
    r_drain = 5.0
    verts, faces, diag = build_pot_mesh(
        H, Rt, Rb, t_wall, t_bottom, r_drain, expn=1.0, n_theta=32, n_z=8
    )
    assert verts.shape[1] == 3
    assert faces.shape[1] == 3
    assert verts.shape[0] > 0
    assert faces.shape[0] > 0
    # diagnostics should include estimated top/bottom OD when present
    assert ("estimated_top_od_mm" in diag) or ("estimated_bottom_od_mm" in diag)
