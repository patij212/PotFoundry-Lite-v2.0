import time
from potfoundry.core.geometry import build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated
from potfoundry.core.styles import STYLES

style_fn, _ = STYLES['SuperformulaBlossom']

# Warm-up runs
for i in range(3):
    build_pot_mesh(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=168, n_z=84, r_outer_fn=style_fn, style_opts={})
    build_pot_mesh_accelerated(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=168, n_z=84, r_outer_fn=style_fn, style_opts={}, enforce_parity=False)

N = 10
s_total = 0.0
a_total = 0.0
for i in range(N):
    start = time.perf_counter()
    build_pot_mesh(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=168, n_z=84, r_outer_fn=style_fn, style_opts={})
    s_total += time.perf_counter() - start
    start = time.perf_counter()
    build_pot_mesh_accelerated(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=168, n_z=84, r_outer_fn=style_fn, style_opts={}, enforce_parity=False)
    a_total += time.perf_counter() - start

print('std avg:', s_total / N)
print('acc avg:', a_total / N)
print('ratio:', (s_total / N) / (a_total / N))
