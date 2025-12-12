import time

from potfoundry import STYLES
from potfoundry.core.optimizations import build_pot_mesh_accelerated

style_fn, _ = STYLES["SuperellipseMorph"]
start = time.perf_counter()
verts, faces, diag = build_pot_mesh_accelerated(
    H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
    expn=1.1, n_theta=168, n_z=84,
    r_outer_fn=style_fn, style_opts={}, collect_timings=True,
)
print("elapsed", time.perf_counter()-start)
print("diag timings:")
for k, v in (diag.get("timings") or {}).items():
    print(k, v*1000)
print("accelerated_used", diag.get("accelerated_used"))
