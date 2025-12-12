from __future__ import annotations

import time

from potfoundry import STYLES
from potfoundry.core.optimizations import build_pot_mesh_accelerated

FAILED_STYLES = [
    "SuperformulaBlossom",
    "FourierBloom",
    "SpiralRidges",
    "SuperellipseMorph",
    "HarmonicRipple",
    "LowPolyFacet",
]

for style_name in FAILED_STYLES:
    style_fn, _ = STYLES[style_name]
    print(f"Profiling {style_name}...", end="")
    start = time.perf_counter()
    verts, faces, diag = build_pot_mesh_accelerated(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=168, n_z=84,
        r_outer_fn=style_fn, style_opts={}, collect_timings=True,
    )
    elapsed = time.perf_counter() - start
    print(f" done in {elapsed:.3f}s")
    if diag.get("accelerated_used") is False:
        print("  Acceleration was disabled by heuristics, skipping detailed timings (fallback used).")
        continue
    timings = diag.get("timings", {})
    print("  Per-stage timings (ms):")
    for k, v in timings.items():
        print(f"    {k}: {v*1000:.2f} ms")
    print("\n")
