import cProfile, pstats, io
from potfoundry.core.optimizations import build_pot_mesh_accelerated
from potfoundry.core.geometry import build_pot_mesh
from potfoundry.core.styles import STYLES

style_fn, _ = STYLES['SuperformulaBlossom']

# Standard builder
pr = cProfile.Profile()
pr.enable()
verts_s, faces_s, diag_s = build_pot_mesh(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=168, n_z=84, r_outer_fn=style_fn, style_opts={})
pr.disable()
ps = pstats.Stats(pr).sort_stats('cumulative')
print('--- Standard builder profile ---')
ps.print_stats(20)

# Accelerated builder
pr = cProfile.Profile()
pr.enable()
verts_a, faces_a, diag_a = build_pot_mesh_accelerated(H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=168, n_z=84, r_outer_fn=style_fn, style_opts={}, collect_timings=True, enforce_parity=False)
pr.disable()
ps = pstats.Stats(pr).sort_stats('cumulative')
print('--- Accelerated builder profile ---')
ps.print_stats(20)
print('Std diag:', diag_s)
print('Acc diag:', diag_a)
