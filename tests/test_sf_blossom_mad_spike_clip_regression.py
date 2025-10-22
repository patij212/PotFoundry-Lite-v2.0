import numpy as np

from potfoundry.core.geometry import build_pot_mesh, STYLES


def test_superformula_blossom_mad_and_spike_clip_builds_mesh():
    # Reduced resolution for quick CI while still exercising the path
    H = 120.0
    Rt = 140.0 / 2.0
    Rb = 90.0 / 2.0
    t_wall = 3.0
    t_bottom = 3.0
    r_drain = 10.0
    expn = 1.1

    # Mirror the preset: "Crisp Petals (Strong Clip)"
    opts = {
        "sf_strength": 0.82,
        "sf_m_base": 8.0,
        "sf_m_top": 12.0,
        "sf_n1": 0.55,
        "sf_n2": 1.5,
        "sf_n3": 1.5,
        "sf_edge_solidify_enable": True,
        "sf_edge_solidify_strength": 0.6,
        "sf_edge_solidify_passes": 2,
        "sf_edge_solidify_sigma_s": 1.2,
        "sf_edge_solidify_sigma_r": 0.10,
        "sf_edge_solidify_micro_thresh": 0.08,
        "sf_edge_solidify_protect_grad": 0.18,
        "sf_edge_solidify_preserve_q": 0.95,
        # MAD spike clip with rim boost
        "sf_spike_mad_enable": True,
        "sf_spike_mad_k": 3.1,
        "sf_spike_mad_amount": 0.88,
        "sf_spike_mad_window": 9,
        "sf_spike_mad_z_boost_enable": True,
        "sf_spike_mad_z_start": 0.74,
        "sf_spike_mad_z_power": 1.6,
        "sf_spike_mad_k_drop_frac": 0.4,
        "sf_spike_mad_amount_boost": 0.25,
        # Quantile spike clip also enabled
        "sf_spike_clip_enable": True,
        "sf_spike_clip_quantile": 0.992,
        "sf_spike_clip_amount": 0.7,
        "sf_spike_clip_window": 9,
        # Keep parity-extras
        "sf_diagonal_smooth_passes": 1,
        "sf_edge_tame_strength": 0.18,
        "sf_edge_tame_k": 0.55,
        "sf_edge_sharp": 0.12,
    }

    verts, faces, diag = build_pot_mesh(
        H,
        Rt,
        Rb,
        t_wall,
        t_bottom,
        r_drain,
        expn=expn,
        n_theta=96,
        n_z=48,
        r_outer_fn=STYLES["SuperformulaBlossom"][0],
        style_opts=opts,
    )
    # Mesh should be non-empty and finite
    assert faces.size > 0
    assert verts.size > 0
    assert np.isfinite(np.asarray(verts)).all()
