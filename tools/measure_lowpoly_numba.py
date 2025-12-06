"""Benchmark helper to compare LowPolyFacet per-z Python loop vs Numba acceleration.

Run this script to print baseline and accelerated timings for LowPolyFacet.
Example:
    PYTHONPATH=. python tools/measure_lowpoly_numba.py
"""
from __future__ import annotations
import time
import numpy as np
from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated

def run_bench():
    style_fn, _ = STYLES["LowPolyFacet"]
    opts = {}
    n_theta = 168
    n_z = 84
    print("Running baseline build_pot_mesh (python builder)")
    t0 = time.perf_counter()
    _ = build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=n_theta, n_z=n_z, r_outer_fn=style_fn, style_opts=opts,
    )
    base_time = time.perf_counter() - t0
    print(f"baseline standard builder: {base_time:.4f}s")

    print("Running accelerated builder with collect_timings (warm-up)")
    # Warm-up to ensure Numba compilation occurs before timing
    _ = build_pot_mesh_accelerated(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=n_theta, n_z=n_z, r_outer_fn=style_fn, style_opts=opts,
        collect_timings=False, enforce_parity=False,
    )
    # Perform timed runs and take average
    runs = 3
    acc_time_total = 0.0
    diag = None
    for _ in range(runs):
        t0 = time.perf_counter()
        _, _, diag = build_pot_mesh_accelerated(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=n_theta, n_z=n_z, r_outer_fn=style_fn, style_opts=opts,
            collect_timings=True, enforce_parity=False,
        )
        acc_time_total += time.perf_counter() - t0
    acc_time = acc_time_total / runs
    print(f"accelerated: {acc_time:.4f}s")
    timings = diag.get("timings", {})
    print("Timing breakdown:")
    if not timings:
        print("  <no timings captured; possibly fallback to standard builder or missing collect timings>")
    for k, v in timings.items():
        try:
            print(f"  {k}: {v:.6f}s")
        except Exception:
            print(f"  {k}: {v}")
    import json
    out = {
        "baseline_time": base_time,
        "accelerated_time": acc_time,
        "timings": timings,
        "diagnostics": diag,
    }
    with open("artifacts/lowpoly_numba_baseline.json", "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    print("Wrote artifacts/lowpoly_numba_baseline.json")
    print("Full diagnostics:", diag)

if __name__ == '__main__':
    run_bench()
