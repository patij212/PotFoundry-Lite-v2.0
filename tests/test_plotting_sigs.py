from pfui.app_components.plotting import compute_geom_sig, compute_app_sig


def test_compute_geom_sig_happy_path():
    sig = compute_geom_sig(
        H=100,
        Rt=50,
        Rb=30,
        expn=1.5,
        preview_n_theta=64,
        preview_n_z=32,
        style_name="petal",
        opts_json='{"a":1}',
        full_n_theta=256,
        full_n_z=128,
    )
    assert isinstance(sig, tuple)
    # Check element types coerced as documented
    assert sig[0] == 100.0
    assert sig[4] == 64
    assert sig[8] == 256


def test_compute_app_sig_happy_path():
    sig = compute_app_sig(
        preview_palette="viridis",
        preview_grad_c1="#111111",
        preview_grad_c2="#222222",
        preview_grad_c3="#333333",
        mesh_ambient=0.1,
        mesh_diffuse=0.2,
        mesh_specular=0.3,
        mesh_roughness=0.4,
        mesh_fresnel=0.5,
        show_inner=True,
        view_elev=12,
        view_azim=34,
        fig_w=640,
        fig_h=480,
        dpi=100,
        place_on_ground=False,
    )
    assert isinstance(sig, tuple)
    # Some spot checks for conversions
    assert sig[4] == 0.1
    assert sig[9] is True
    assert sig[14] == 100
