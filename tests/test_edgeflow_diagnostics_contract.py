from pathlib import Path
import numpy as np

from potfoundry.core.geometry import build_pot_mesh


def test_edgeflow_diagnostics_contract():
    """Request edgeflow diagnostics and assert canonical keys exist in returned entries."""
    n_theta = 24
    n_z = 6
    H = 7.0
    Z = n_z + 1

    # Simple synthetic radial grid that will trigger edgeflow logic
    R_grid = np.ones((Z, n_theta), dtype=float) * 15.0
    for zi in range(Z):
        R_grid[zi, 0] = 25.0
        R_grid[zi, n_theta // 2] = 25.0
        R_grid[zi, n_theta // 4] = 10.0

    def synthetic_r_outer_fn(thetas, z, r0, H_local, opts):
        idx = int(round((float(z) / float(H)) * float(n_z)))
        idx = max(0, min(Z - 1, idx))
        return np.asarray(R_grid[idx, :], dtype=float)

    style_opts = {
        'sf_edge_flow_reconstruct_enable': True,
        'sf_edge_flow_mode': 'ridge_paths',
        'sf_edge_flow_twist_compensate': False,
        'sf_edge_flow_auto_deoffset': False,
        'sf_edge_flow_verbose_diagnostics': True,
        'sf_edge_flow_probe': True,
        'sf_edge_flow_probe_zi': int(Z // 2),
        'sf_style': 'SuperformulaBlossom',  # explicit style hint
        'sf_edge_flow_window': 3,
    }

    verts, faces, diagnostics = build_pot_mesh(H, Rt=40.0, Rb=40.0, t_wall=2.5, t_bottom=4.0, r_drain=3.0,
                                              expn=1.0, n_theta=n_theta, n_z=n_z,
                                              r_outer_fn=synthetic_r_outer_fn,
                                              style_opts=style_opts)

    assert isinstance(diagnostics, dict)
    ev = diagnostics.get('edgeflow_verbose')
    assert ev is not None and len(ev) > 0, "Expected edgeflow_verbose to be present and non-empty"

    # Check canonical keys exist in the first available row sample
    entry = ev[0]
    rows = entry.get('rows') or []
    assert len(rows) > 0
    row = rows[0]
    expected_keys = {
        'zi', 'z', 'R_raw_sample', 'R_analysis_sample', 'Env_sample',
        'Env_to_use_sample', 'Env_to_use_raw_post', 'R_new_raw_sample'
    }
    missing = expected_keys - set(row.keys())
    assert not missing, f"Missing expected diagnostic keys: {missing}"

    # Shapes: R_new_raw_sample should match n_theta
    r_new_raw = np.asarray(row.get('R_new_raw_sample'))
    env_post = np.asarray(row.get('Env_to_use_raw_post'))
    assert r_new_raw.ndim == 1 or (r_new_raw.ndim == 2 and r_new_raw.shape[1] == n_theta)
    # Normalize to 1D for comparison if necessary
    if r_new_raw.ndim == 2:
        r_new_raw = r_new_raw[0]
    if env_post.ndim == 2:
        env_post = env_post[0]
    assert r_new_raw.shape[0] == n_theta
    assert env_post.shape[0] == n_theta

    # Numeric invariant: final raw radii >= envelope (within small tolerance)
    diffs = r_new_raw - env_post
    n_viol = int(np.count_nonzero(diffs < -1e-9))
    assert n_viol == 0, f"Found {n_viol} cells where final_raw < env_post; min_delta={diffs.min():.6f}"
