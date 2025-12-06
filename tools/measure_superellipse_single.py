import time
from potfoundry import STYLES
from potfoundry.core.geometry import build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated

s = 'SuperellipseMorph'
fn, _ = STYLES[s]
start = time.perf_counter()
_, _, _ = build_pot_mesh(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=168, n_z=84, r_outer_fn=fn, style_opts={})
std_time = time.perf_counter() - start
start = time.perf_counter()
_, _, diag = build_pot_mesh_accelerated(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=168, n_z=84, r_outer_fn=fn, style_opts={}, collect_timings=True, enforce_parity=False)
acc_time = time.perf_counter() - start
print('std', std_time)
print('acc', acc_time)
print('ratio', std_time / acc_time)
print('diag', diag)
