#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

from potfoundry.geometry import STYLES, build_pot_mesh


def run_once(
    H: float,
    Rt: float,
    Rb: float,
    t_wall: float,
    t_bottom: float,
    r_drain: float,
    expn: float,
    n_theta: int,
    n_z: int,
    style_name: str,
    reps: int = 1,
 ) -> dict[str, Any]:
    r_outer_fn = STYLES.get(style_name, (None,))[0]
    opts: dict[str, Any] = {}
    t0 = time.perf_counter()
    v_arr = f_arr = None
    diag: dict[str, Any] = {}
    for _ in range(reps):
        v_arr, f_arr, diag = build_pot_mesh(
            H=H, Rt=Rt, Rb=Rb,
            t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
            expn=expn, n_theta=n_theta, n_z=n_z,
            r_outer_fn=r_outer_fn, style_opts=opts,
        )
    dt = (time.perf_counter() - t0) / reps
    return dict(time_s=dt, verts=len(v_arr) if v_arr is not None else 0, faces=len(f_arr) if f_arr is not None else 0, diag=diag)


def main():
    ap = argparse.ArgumentParser(description="Benchmark PotFoundry mesh builder")
    ap.add_argument("--out", type=Path, default=Path("artifacts/bench_build.json"))
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--style", type=str, default="HarmonicRipple", choices=list(STYLES.keys()))
    args = ap.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)

    # Sweep resolutions
    configs = [
        dict(n_theta=168, n_z=84),
        dict(n_theta=256, n_z=128),
        dict(n_theta=384, n_z=192),
        dict(n_theta=512, n_z=256),
    ]

    base = dict(H=120.0, Rt=70.0, Rb=45.0, t_wall=3.0, t_bottom=3.0, r_drain=10.0, expn=1.1)

    results: list[dict[str, Any]] = []
    for cfg in configs:
        r = run_once(**base, **cfg, style_name=args.style, reps=args.reps)
        r.update(cfg)
        results.append(r)
        print(f"n=({cfg['n_theta']},{cfg['n_z']}): {float(r['time_s'])*1000:.1f} ms; faces={int(r['faces']):,}")

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(dict(results=results, base=base, style=args.style, reps=args.reps), f, indent=2)


if __name__ == "__main__":
    main()
