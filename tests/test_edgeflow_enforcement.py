import json
from pathlib import Path
import numpy as np


def load_latest_row(jsonl_path: Path, zi: int = 42):
    """Scan the JSONL and return the most recent entry that contains
    detailed per-probe arrays for the requested zi.

    The diagnostics file mixes summary-only rows and full rows. We pick
    the latest object whose 'rows' array contains an element with
    matching 'zi' and that element contains both the canonical keys
    'R_new_raw_sample' and 'Env_to_use_sample'.
    """
    last_row = None
    with open(jsonl_path, "r", encoding="utf-8") as fh:
        for line in fh:
            try:
                obj = json.loads(line)
            except Exception:
                continue
            rows = obj.get("rows") or []
            for r in rows:
                if r.get("zi") != zi:
                    continue
                # prefer rows that include both canonical arrays
                if ("R_new_raw_sample" in r and "Env_to_use_sample" in r) or (
                    "R_new_sample" in r and "Env_to_use_sample" in r
                ):
                    last_row = r
    return last_row


def test_enforcement_invariant_latest_row():
    repo_root = Path(__file__).resolve().parents[1]
    jsonl = repo_root / "tools" / "edgeflow_verbose_diagnostics.jsonl"
    assert jsonl.exists(), f"Expected diagnostics jsonl at {jsonl}"
    row = load_latest_row(jsonl, zi=42)
    assert row is not None, "No matching row found for zi=42 in JSONL"

    # Look for arrays: prefer Env_to_use_raw_post, fall back to Env_to_use_sample/Env_to_use_raw
    def as_np(name):
        v = row.get(name)
        if v is None:
            return None
        return np.asarray(v, dtype=float)

    # pick first available radii array (check for None explicitly)
    r_new = None
    for cand in ("r_new_raw_sample", "R_new_raw_sample", "R_new_sample"):
        r_new = as_np(cand)
        if r_new is not None:
            break

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

    assert r_new is not None, "No final raw radii found in the selected row"
    assert env_post is not None, "No envelope to compare found in the selected row"

    # Normalize shapes: if row arrays are per-row (list of rows) take first matching zi sample
    if r_new.ndim == 2:
        r_new = r_new[0]
    if env_post.ndim == 2:
        env_post = env_post[0]

    assert r_new.shape == env_post.shape, (
        f"Shape mismatch r_new {r_new.shape} vs env {env_post.shape}"
    )

    # The invariant: r_new >= env_post elementwise
    diffs = r_new - env_post
    n_viol = int(np.count_nonzero(diffs < -1e-9))
    assert n_viol == 0, (
        f"Found {n_viol} cells where final_raw < env_post; min_delta={diffs.min():.6f}"
    )
