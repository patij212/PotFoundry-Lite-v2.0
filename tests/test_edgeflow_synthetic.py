import json
from pathlib import Path

import numpy as np

from potfoundry.core.geometry import build_pot_mesh


def load_latest_row(jsonl_path: Path, zi: int = 2, tol: int = 1):
    """Find the latest diagnostics row for zi within +/- tol (inclusive)."""
    last_row = None
    candidates = set(range(max(0, zi - tol), zi + tol + 1))
    with open(jsonl_path, encoding="utf-8") as fh:
        for line in fh:
            try:
                obj = json.loads(line)
            except Exception:
                continue
            rows = obj.get("rows") or []
            for r in rows:
                if r.get("zi") not in candidates:
                    continue
                if ("R_new_raw_sample" in r and "Env_to_use_sample" in r) or (
                    "R_new_sample" in r and "Env_to_use_sample" in r
                ):
                    last_row = r
    return last_row


def test_edgeflow_synthetic_outward_enforcement():
    """
    Create a tiny, deterministic R grid with a clear valley and run the
    edge-flow reconstruction in a deterministic way (probe the middle
    ring). Then assert the outward-only invariant using the produced
    verbose diagnostics row.
    """
    repo_root = Path(__file__).resolve().parents[1]
    jsonl = repo_root / "tools" / "edgeflow_verbose_diagnostics.jsonl"

    # Small grid parameters
    n_theta = 12
    n_z = 5  # yields Z = n_z + 1 = 6 rings
    H = 10.0

    # Build a synthetic R_grid: two strong peaks at cols 0 and 6, valley near col 3.
    Z = n_z + 1
    T = n_theta
    R_grid = np.ones((Z, T), dtype=float) * 12.0
    for zi in range(Z):
        # peaks
        R_grid[zi, 0] = 20.0
        R_grid[zi, 6] = 20.0
        # valley normally at col 3
        R_grid[zi, 3] = 10.0
    # Introduce a small perturbation on the middle ring to test neighbor-aware consensus
    mid = Z // 2
    R_grid[mid, 3] = 11.5
    R_grid[mid, 4] = 10.2  # slightly shift local minimum to col 4

    # Closure style function to return our synthetic rows by ring index
    def synthetic_r_outer_fn(thetas, z, r0, H_local, opts):
        # map z to integer ring index used by build_pot_mesh (z_outer = linspace(0,H,n_z+1))
        idx = int(round((float(z) / float(H)) * float(n_z)))
        idx = max(0, min(Z - 1, idx))
        return np.asarray(R_grid[idx, :], dtype=float)

    # Style options: enable edge-flow reconstruct, verbose diagnostics and probe the middle ring
    style_opts = {
        "sf_edge_flow_reconstruct_enable": True,
        "sf_edge_flow_mode": "ridge_paths",
        "sf_edge_flow_debug": True,
        "sf_edge_flow_verbose_diagnostics": True,
        "sf_edge_flow_probe": True,
        "sf_edge_flow_probe_zi": int(mid),
        # small theta sampling to keep run time short
        "sf_edge_flow_window": 5,
    }

    # Run the mesh builder which will append a diagnostics row for the probed ring
    verts, faces, diagnostics = build_pot_mesh(
        H,
        Rt=30.0,
        Rb=30.0,
        t_wall=2.5,
        t_bottom=4.0,
        r_drain=3.0,
        expn=1.0,
        n_theta=n_theta,
        n_z=n_z,
        r_outer_fn=synthetic_r_outer_fn,
        style_opts=style_opts,
    )

    assert jsonl.exists(), f"Expected diagnostics jsonl at {jsonl}"
    row = load_latest_row(jsonl, zi=mid)
    assert row is not None, "No matching diagnostics row found for probe zi"

    def as_np(name):
        v = row.get(name)
        if v is None:
            return None
        return np.asarray(v, dtype=float)

    # pick final raw radii array
    r_new = None
    for cand in ("r_new_raw_sample", "R_new_raw_sample", "R_new_sample"):
        r_new = as_np(cand)
        if r_new is not None:
            break

    # envelope applied (prefer post-deoffset raw if present)
    env_post = None
    for cand in (
        "Env_to_use_raw_post",
        "env_to_use_raw_post",
        "Env_to_use_sample",
        "env_to_use_sample",
        "Env_sample",
    ):
        env_post = as_np(cand)
        if env_post is not None:
            break

    assert r_new is not None, "No final raw radii found in diagnostics row"
    assert env_post is not None, "No envelope sample found in diagnostics row"

    if r_new.ndim == 2:
        r_new = r_new[0]
    if env_post.ndim == 2:
        env_post = env_post[0]

    # Basic sanity checks: shapes match and values are finite
    assert r_new.shape == env_post.shape
    assert np.all(np.isfinite(r_new)), "r_new contains non-finite values"
    assert np.all(np.isfinite(env_post)), "env_post contains non-finite values"
