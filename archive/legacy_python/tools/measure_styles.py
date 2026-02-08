"""Compare accelerated timings across multiple styles.

Usage:
  python tools/measure_styles.py
"""
from __future__ import annotations
import time
import json
from potfoundry import STYLES
from potfoundry.core.optimizations import build_pot_mesh_accelerated

def measure_style(name: str, n_theta=168, n_z=84):
    style_fn, _ = STYLES[name]
    opts = {}
    # Warm-up
    _ = build_pot_mesh_accelerated(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=n_theta, n_z=n_z, r_outer_fn=style_fn, style_opts=opts,
        collect_timings=False, enforce_parity=False,
    )
    t0 = time.perf_counter()
    _, _, diag = build_pot_mesh_accelerated(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=n_theta, n_z=n_z, r_outer_fn=style_fn, style_opts=opts,
        collect_timings=True, enforce_parity=False,
    )
    elapsed = time.perf_counter() - t0
    return name, elapsed, diag.get('timings', {}), diag

def main():
    styles = ["FourierBloom", "LowPolyFacet", "SuperellipseMorph", "SpiralRidges"]
    results = {}
    for s in styles:
        name, elapsed, timings, diag = measure_style(s)
        results[name] = {
            'elapsed': elapsed,
            'timings': timings,
            'diag': diag,
        }
        print(f"{name}: elapsed={elapsed:.4f}s")
        for k, v in timings.items():
            print(f"  {k}: {v}")
    with open('artifacts/styles_timings.json', 'w', encoding='utf-8') as fh:
        json.dump(results, fh, indent=2)

if __name__ == '__main__':
    main()
