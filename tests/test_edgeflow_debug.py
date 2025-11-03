from potfoundry.core.geometry import build_pot_mesh


def test_edgeflow_debug_small():
    """Smoke test: exercise the edge-flow debug path with a tiny mesh.

    This ensures the `sf_edge_flow_debug` + `sf_edge_flow_reconstruct_enable`
    codepaths execute without raising and produce non-empty meshes.
    """
    style_opts = {
        "sf_edge_flow_reconstruct_enable": True,
        "sf_edge_flow_mode": "ridge_paths",
        "sf_edge_flow_debug": True,
        # keep verbose diagnostics off for CI speed
        "sf_edge_flow_verbose_diagnostics": False,
    }

    verts, faces, diag = build_pot_mesh(
        H=40.0,
        Rt=35.0,
        Rb=25.0,
        t_wall=2.0,
        t_bottom=2.0,
        r_drain=4.0,
        expn=1.0,
        n_theta=24,
        n_z=6,
        r_outer_fn=None,
        style_opts=style_opts,
    )

    assert hasattr(verts, "size") and verts.size > 0
    assert hasattr(faces, "size") and faces.size > 0
    assert isinstance(diag, dict)
