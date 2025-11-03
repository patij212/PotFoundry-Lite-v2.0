import pytest
from potfoundry.core.geometry import build_pot_mesh


def test_edgeflow_verbose_diagnostics_structure():
    """Integration-style test: run a small mesh with verbose edge-flow diagnostics

    This test keeps the mesh small but enables `sf_edge_flow_verbose_diagnostics`
    to validate that diagnostics include the expected keys/structure without
    asserting on numeric equality (keeps test robust across small engine changes).
    """
    style_opts = {
        "sf_edge_flow_reconstruct_enable": True,
        "sf_edge_flow_mode": "ridge_paths",
        "sf_edge_flow_debug": True,
        "sf_edge_flow_verbose_diagnostics": True,
        # Enable a small probe to force verbose edgeflow diagnostics to be produced
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

    # Basic output sanity
    assert hasattr(verts, "size") and verts.size > 0
    assert hasattr(faces, "size") and faces.size > 0
    assert isinstance(diag, dict)

    # Diagnostics should include an edgeflow-related summary when verbose diagnostics enabled
    # Accept either 'edgeflow_verbose' (current) or fallback 'edgeflow' keys
    if "edgeflow_verbose" in diag:
        assert isinstance(diag.get("edgeflow_verbose"), list)
        # ensure at least one entry has expected 'rows' structure
        ev = diag.get("edgeflow_verbose", [])
        assert any(isinstance(e, dict) and ("rows" in e or "summary" in e) for e in ev)
    else:
        assert "edgeflow" in diag
