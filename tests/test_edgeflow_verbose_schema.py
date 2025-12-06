from potfoundry.core.geometry import build_pot_mesh


def test_edgeflow_verbose_schema():
    """Stricter schema test for verbose edgeflow diagnostics.

    Run a small mesh with verbose diagnostics and a probe enabled and assert
    that the returned diagnostics structure contains the expected keys and
    minimal types. This helps catch accidental regressions to the diagnostic
    contract.
    """
    style_opts = {
        "sf_edge_flow_reconstruct_enable": True,
        "sf_edge_flow_mode": "ridge_paths",
        "sf_edge_flow_debug": True,
        "sf_edge_flow_verbose_diagnostics": True,
        "sf_edge_flow_probe": True,
        "sf_edge_flow_probe_zi": 2,
    }

    verts, faces, diag = build_pot_mesh(
        H=60.0,
        Rt=50.0,
        Rb=40.0,
        t_wall=2.5,
        t_bottom=2.5,
        r_drain=6.0,
        expn=1.0,
        n_theta=48,
        n_z=12,
        r_outer_fn=None,
        style_opts=style_opts,
    )

    assert isinstance(diag, dict)
    assert "edgeflow_verbose" in diag, "edgeflow_verbose key must be present"
    ev = diag["edgeflow_verbose"]
    assert isinstance(ev, list), "edgeflow_verbose must be a list"
    # Expect at least one entry with rows populated
    assert any(isinstance(e, dict) and isinstance(e.get("rows"), list) for e in ev)

    for entry in ev:
        assert isinstance(entry, dict)
        rows = entry.get("rows")
        assert isinstance(rows, list)
        for row in rows:
            assert isinstance(row, dict)
            # minimal required fields and types
            assert "zi" in row and isinstance(row["zi"], int)
            assert "min_final_raw" in row and isinstance(
                row["min_final_raw"], (int, float),
            )
            # When present, sample arrays must be lists
            if "R_raw_sample" in row and row["R_raw_sample"] is not None:
                assert isinstance(row["R_raw_sample"], list)
            if "Env_sample" in row and row["Env_sample"] is not None:
                assert isinstance(row["Env_sample"], list)
