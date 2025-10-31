"""
Simple plotting helper for edgeflow diagnostics JSONL or in-memory diagnostics.

Usage:
    python tools/plot_edgeflow_diagnostics.py --jsonl tools/edgeflow_verbose_diagnostics.jsonl --outdir tmp/plots

If you have an in-memory diagnostics dict (e.g., in a notebook), you can reuse the plotting
functions below directly.
"""

import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np


def load_jsonl(path: Path):
    entries = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            try:
                entries.append(json.loads(line))
            except Exception:
                continue
    return entries


def plot_row(row, outpath: Path, title: str = ""):
    # prefer theta_sample if present
    thetas = row.get("theta_sample")
    if thetas is None and row.get("R_raw_sample") is not None:
        T = len(row.get("R_raw_sample"))
        thetas = np.arange(T) * (2.0 * np.pi / float(T))
    else:
        thetas = np.asarray(thetas, dtype=float)

    r_raw = np.asarray(row.get("R_raw_sample") or [], dtype=float)
    r_new_raw = np.asarray(row.get("R_new_raw_sample") or [], dtype=float)
    env_post = np.asarray(
        row.get("Env_to_use_raw_post") or row.get("Env_to_use_sample") or [],
        dtype=float,
    )
    lift_delta = np.asarray(row.get("lift_delta") or np.zeros_like(r_raw), dtype=float)
    violations = row.get("enforcement_violations_indices") or []

    plt.figure(figsize=(10, 4))
    plt.title(title)
    plt.plot(thetas, r_raw, label="R_raw", linestyle="--")
    plt.plot(thetas, r_new_raw, label="R_new_raw", linestyle="-")
    if env_post.size:
        plt.plot(thetas, env_post, label="Env_post", linestyle=":")
    # highlight lifted columns
    if lift_delta.size:
        mask = lift_delta > 1e-9
        if np.any(mask):
            plt.scatter(thetas[mask], r_new_raw[mask], color="orange", label="lifted")
    if violations:
        vi = np.asarray(violations, dtype=int)
        plt.scatter(
            thetas[vi], r_new_raw[vi], color="red", marker="x", s=60, label="violations"
        )

    plt.legend()
    plt.xlabel("theta (rad)")
    plt.ylabel("radius")
    plt.grid(True)
    outpath.parent.mkdir(parents=True, exist_ok=True)
    plt.tight_layout()
    plt.savefig(str(outpath))
    plt.close()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--jsonl", type=str, required=True)
    p.add_argument("--outdir", type=str, required=True)
    args = p.parse_args()
    entries = load_jsonl(Path(args.jsonl))
    outdir = Path(args.outdir)
    idx = 0
    for ent in entries:
        rows = ent.get("rows") or []
        for r in rows:
            title = f"zi={r.get('zi')} ts={ent.get('timestamp')}"
            outpath = outdir / f"edgeflow_diag_{idx}_zi{r.get('zi')}.png"
            plot_row(r, outpath, title=title)
            idx += 1


if __name__ == "__main__":
    main()
