from potfoundry.geometry import STYLES, build_pot_mesh


def test_styles_are_tuples_and_callable():
    assert isinstance(STYLES, dict)
    for name, val in STYLES.items():
        assert (
            isinstance(val, tuple) and len(val) >= 1
        ), f"{name} must be a tuple(callable, ...)"
        assert callable(val[0]), f"{name} first element must be callable"


def test_mesh_build_smoke():
    r_outer = next(iter(STYLES.values()))[0]
    H, Rt, Rb = 100.0, 120.0, 80.0
    verts, faces, diag = build_pot_mesh(
        H=H,
        Rt=Rt,
        Rb=Rb,
        t_wall=3.0,
        t_bottom=3.0,
        r_drain=8.0,
        expn=1.1,
        n_theta=120,
        n_z=60,
        r_outer_fn=r_outer,
        style_opts={},
    )
    assert verts.shape[1] == 3
    assert faces.shape[1] == 3
    assert faces.shape[0] > 0
    assert "estimated_top_od_mm" in diag and "estimated_bottom_od_mm" in diag
