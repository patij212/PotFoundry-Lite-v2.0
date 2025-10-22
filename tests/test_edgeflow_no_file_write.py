from pathlib import Path

import numpy as np

from potfoundry.core.geometry import build_pot_mesh


def test_no_file_written_when_disabled(tmp_path):
    """When sf_edge_flow_verbose_write_file is False, file writes are skipped but in-memory diagnostics are returned."""
    repo_root = Path(__file__).resolve().parents[1]
    jsonl = repo_root / 'tools' / 'edgeflow_verbose_diagnostics.jsonl'

    # Record pre-call state
    existed_before = jsonl.exists()
    mtime_before = None
    size_before = None
    if existed_before:
        stat = jsonl.stat()
        mtime_before = stat.st_mtime
        size_before = stat.st_size

    # Simple mesh parameters
    n_theta = 24
    n_z = 6

    def synthetic_r_outer_fn(thetas, z, r0, H_local, opts):
        return np.ones(n_theta) * 15.0

    style_opts = {
        'sf_style': 'SuperformulaBlossom',
        'sf_edge_flow_reconstruct_enable': True,
        'sf_edge_flow_verbose_diagnostics': True,
        'sf_edge_flow_verbose_write_file': False,  # disable file writes
        'sf_edge_flow_probe': True,
        'sf_edge_flow_probe_zi': 2,
        'sf_edge_flow_twist_compensate': False,
        'sf_edge_flow_auto_deoffset': False,
    }

    verts, faces, diagnostics = build_pot_mesh(
        H=7.0, Rt=40.0, Rb=40.0, t_wall=2.5, t_bottom=4.0, r_drain=3.0,
        expn=1.0, n_theta=n_theta, n_z=n_z,
        r_outer_fn=synthetic_r_outer_fn,
        style_opts=style_opts,
    )

    # Diagnostics must be present and include the in-memory collector
    assert isinstance(diagnostics, dict)
    ev = diagnostics.get('edgeflow_verbose')
    assert ev is not None and len(ev) > 0

    # Check file not modified or created
    existed_after = jsonl.exists()
    if existed_before:
        assert existed_after, "Existing diagnostics file was removed unexpectedly"
        stat2 = jsonl.stat()
        # Ensure mtime and size didn't change (allow tiny clock differences)
        assert stat2.st_mtime == mtime_before and stat2.st_size == size_before, "Diagnostics file was modified despite write disable"
    else:
        assert not existed_after, "Diagnostics file was created despite write disable"
