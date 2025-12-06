"""Profiler for accelerated vs standard builders.

This script benchmarks build_pot_mesh and build_pot_mesh_accelerated for a set
of styles and prints average runtime and speedup ratios.

Usage:
    python -m tmp.profile_accelerated_builder
"""
from __future__ import annotations

import statistics
import time

from potfoundry.core.optimizations import build_pot_mesh_accelerated
from potfoundry.geometry import STYLES, build_pot_mesh

TARGET_STYLES = [
    "SuperformulaBlossom",
    "FourierBloom",
    "SpiralRidges",
    "SuperellipseMorph",
    "HarmonicRipple",
    "LowPolyFacet",
]

N_WARMUP = 2
N_TRIALS = 5

DEFAULT_ARGS = dict(
    H=120,
    Rt=70,
    Rb=50,
    t_wall=3,
    t_bottom=3,
    r_drain=10,
    expn=1.1,
    n_theta=168,
    n_z=84,
)


def measure(style_name: str):
    print(f"Profiling {style_name}...\n")
    style_fn, _ = STYLES[style_name]
    # Warmup
    for _ in range(N_WARMUP):
        build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **DEFAULT_ARGS)
        verts_acc, faces_acc, diag_acc = build_pot_mesh_accelerated(
            r_outer_fn=style_fn, style_opts={}, **DEFAULT_ARGS,
        )

    std_times = []
    acc_times = []
    for _ in range(N_TRIALS):
        t0 = time.perf_counter()
        build_pot_mesh(r_outer_fn=style_fn, style_opts={}, **DEFAULT_ARGS)
        std_times.append(time.perf_counter() - t0)
        t0 = time.perf_counter()
        verts_acc, faces_acc, diag_acc = build_pot_mesh_accelerated(
            r_outer_fn=style_fn, style_opts={}, **DEFAULT_ARGS,
        )
        acc_times.append(time.perf_counter() - t0)

    avg_std = statistics.mean(std_times)
    avg_acc = statistics.mean(acc_times)
    speedup = avg_std / avg_acc if avg_acc > 0 else float("inf")

    print("Standard times:", [f"{t:.4f}s" for t in std_times])
    print("Accelerated times:", [f"{t:.4f}s" for t in acc_times])
    print(f"Average standard: {avg_std:.4f}s, accelerated: {avg_acc:.4f}s, speedup: {speedup:.2f}x\n")
    print(f"accelerated_used diag: {diag_acc.get('accelerated_used', None) if 'diag_acc' in locals() else 'n/a'}\n")
    return style_name, avg_std, avg_acc, speedup


if __name__ == "__main__":
    results = []
    for s in TARGET_STYLES:
        try:
            results.append(measure(s))
        except Exception as e:
            print(f"Failed to profile {s}: {e}\n")

    print("Summary:\n")
    for r in results:
        print(r)
