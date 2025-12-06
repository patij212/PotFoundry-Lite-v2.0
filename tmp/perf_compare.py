import time

from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated

styles_to_check = ["SuperellipseMorph", "LowPolyFacet", "FourierBloom"]

for name in styles_to_check:
    style_fn, _ = STYLES[name]
    print(f"Measuring {name}:")
    start = time.perf_counter()
    verts_std, faces_std, _ = build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=168, n_z=84,
        r_outer_fn=style_fn, style_opts={},
    )
    t_std = time.perf_counter() - start

    start = time.perf_counter()
    verts_acc, faces_acc, diag = build_pot_mesh_accelerated(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=168, n_z=84,
        r_outer_fn=style_fn, style_opts={}, collect_timings=True,
    )
    t_acc = time.perf_counter() - start
    speedup = t_std / t_acc if t_acc>0 else float("inf")
    acc_used = diag.get("accelerated_used", diag.get("accelerated_used", True))
    print(f"  std: {t_std:.4f}s  acc: {t_acc:.4f}s  speedup: {speedup:.2f} acc_used={acc_used}")
    if acc_used and diag.get("timings"):
        for k, v in diag["timings"].items():
            print(f"    {k}: {v*1000:.2f} ms")
    print("\n")
