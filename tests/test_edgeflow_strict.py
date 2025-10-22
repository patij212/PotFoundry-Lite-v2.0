import json
from pathlib import Path
import numpy as np

from potfoundry.core.geometry import build_pot_mesh


def load_latest_row(jsonl_path: Path, zi: int = 2, tol: int = 0):
    """Find the latest diagnostics row for zi within +/- tol (inclusive)."""
    last_row = None
    candidates = set(range(max(0, zi - tol), zi + tol + 1))
    with open(jsonl_path, 'r', encoding='utf-8') as fh:
        for line in fh:
            try:
                obj = json.loads(line)
            except Exception:
                continue
            rows = obj.get('rows') or []
            for r in rows:
                if r.get('zi') not in candidates:
                    continue
                # Accept any diagnostics row matching the probe zi. Later
                # we will inspect available fields (env/r_new variants) and
                # fail with a clear message if required data is missing.
                last_row = r
    return last_row


def test_edgeflow_strict_outward_enforcement():
    """
    Strict deterministic test: disable twist compensation and auto-deoffset so
    the mapping between analysis and raw frames is identity. Verify that the
    final raw radii (`R_new_raw_sample`) are elementwise >= `Env_to_use_raw_post`.
    """
    repo_root = Path(__file__).resolve().parents[1]
    # Note: older tests relied on reading the file `tools/edgeflow_verbose_diagnostics.jsonl`.
    # We now prefer the diagnostics returned by `build_pot_mesh` (attached to the
    # returned diagnostics dict under key 'edgeflow_verbose') to avoid fragile
    # file-based test dependencies. The synthetic function-name trick below is
    # retained for compatibility with code paths that detect Blossom styles by
    # function identity or name.

    # Small grid parameters
    n_theta = 24
    n_z = 6  # yields Z = n_z + 1 = 7 rings
    H = 7.0

    # Synthetic radial grid: two peaks and a valley
    Z = n_z + 1
    T = n_theta
    R_grid = np.ones((Z, T), dtype=float) * 15.0
    for zi in range(Z):
        R_grid[zi, 0] = 25.0
        R_grid[zi, T // 2] = 25.0
        R_grid[zi, T // 4] = 10.0

    mid = Z // 2

    def synthetic_r_outer_fn(thetas, z, r0, H_local, opts):
        idx = int(round((float(z) / float(H)) * float(n_z)))
        idx = max(0, min(Z - 1, idx))
        return np.asarray(R_grid[idx, :], dtype=float)

    # Trick: mark our synthetic function with the same __name__ as the
    # SuperformulaBlossom style so the edge-flow block enables (it checks
    # function name when r_outer_fn doesn't equal the registered function).
    # Style opts: disable twist compensation and auto-deoffset; enable verbose diagnostics
    style_opts = {
        # explicit style hint (replaces function-name detection)
        'sf_style': 'SuperformulaBlossom',
        'sf_edge_flow_reconstruct_enable': True,
        'sf_edge_flow_mode': 'ridge_paths',
        # disable twist compensation so analysis==raw mapping
        'sf_edge_flow_twist_compensate': False,
        # ensure auto deoffset won't run
        'sf_edge_flow_auto_deoffset': False,
        'sf_edge_flow_debug': True,
        'sf_edge_flow_verbose_diagnostics': True,
        'sf_edge_flow_probe': True,
        'sf_edge_flow_probe_zi': int(mid),
        # smaller window to keep runtime tiny
        'sf_edge_flow_window': 3,
    }

    # Run mesh builder and request returned edgeflow diagnostics (if any)
    verts, faces, diagnostics = build_pot_mesh(H, Rt=40.0, Rb=40.0, t_wall=2.5, t_bottom=4.0, r_drain=3.0,
                                              expn=1.0, n_theta=n_theta, n_z=n_z,
                                              r_outer_fn=synthetic_r_outer_fn,
                                              style_opts=style_opts)

    # Prefer in-memory diagnostics when present
    ev = diagnostics.get('edgeflow_verbose') if isinstance(diagnostics, dict) else None
    assert diagnostics is not None, "build_pot_mesh did not return diagnostics dict"
    row = None
    if ev is not None and len(ev) > 0:
        # Find the latest row matching the probe zi in the returned diagnostics
        for entry in reversed(ev):
            rows = entry.get('rows') or []
            for r in rows:
                if int(r.get('zi', -1)) == int(mid):
                    row = r
                    break
            if row is not None:
                break
    # Fallback to file-based JSONL if in-memory diagnostics weren't returned
    if row is None:
        jsonl = repo_root / 'tools' / 'edgeflow_verbose_diagnostics.jsonl'
        assert jsonl.exists(), f"Expected diagnostics jsonl at {jsonl}"
        row = load_latest_row(jsonl, zi=mid, tol=0)
        assert row is not None, "No matching diagnostics row found for probe zi"

    def as_np(name):
        v = row.get(name)
        if v is None:
            return None
        return np.asarray(v, dtype=float)

    # Prefer the post-deoffset raw envelope when available
    env_post = None
    for cand in ('Env_to_use_raw_post', 'env_to_use_raw_post', 'Env_to_use_sample', 'env_to_use_sample', 'Env_sample'):
        env_post = as_np(cand)
        if env_post is not None:
            break

    r_new = None
    for cand in ('r_new_raw_sample', 'R_new_raw_sample', 'R_new_sample'):
        r_new = as_np(cand)
        if r_new is not None:
            break

    assert r_new is not None, "No final raw radii found in diagnostics row"
    assert env_post is not None, "No envelope sample found in diagnostics row"

    if r_new.ndim == 2:
        r_new = r_new[0]
    if env_post.ndim == 2:
        env_post = env_post[0]

    assert r_new.shape == env_post.shape

    # Strict outward-only invariant: final raw radii >= envelope (post-deoffset)
    diffs = r_new - env_post
    n_viol = int(np.count_nonzero(diffs < -1e-9))
    assert n_viol == 0, f"Found {n_viol} cells where final_raw < env_post; min_delta={diffs.min():.6f}"
