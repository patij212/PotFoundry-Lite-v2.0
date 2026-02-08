import time
from potfoundry import STYLES
from potfoundry.core.geometry import build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated

styles = ['FourierBloom', 'SuperellipseMorph']

for s in styles:
    fn, _ = STYLES[s]
    # Warmup
    for _ in range(2):
        build_pot_mesh(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=168, n_z=84, r_outer_fn=fn, style_opts={})
        build_pot_mesh_accelerated(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=168, n_z=84, r_outer_fn=fn, style_opts={}, collect_timings=True, enforce_parity=False)

    iters = 6
    s_tot = 0.0
    a_tot = 0.0
    for _ in range(iters):
        t0 = time.perf_counter()
        _, _, _ = build_pot_mesh(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=168, n_z=84, r_outer_fn=fn, style_opts={})
        s_tot += time.perf_counter() - t0
        t0 = time.perf_counter()
        _, _, diag = build_pot_mesh_accelerated(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=168, n_z=84, r_outer_fn=fn, style_opts={}, collect_timings=True, enforce_parity=False)
        a_tot += time.perf_counter() - t0
    print(s)
    print('std avg', s_tot/iters)
    print('acc avg', a_tot/iters)
    print('ratio', (s_tot/iters)/(a_tot/iters))
    print('diag', diag)
