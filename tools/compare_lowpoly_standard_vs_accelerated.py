import time
from potfoundry.core.geometry import build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated
from potfoundry.core.styles import STYLES
from potfoundry.core.geometry import base_radius
from potfoundry.core.mesh.outer_wall import spin_twist_radians
from potfoundry.core.mesh.grid import theta_grid_cached

style_fn, _ = STYLES['LowPolyFacet']

start = time.time()
verts_s, faces_s, diag_s = build_pot_mesh(
    H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=336, n_z=168,
    r_outer_fn=style_fn, style_opts={},
)
elapsed_s = time.time() - start

start = time.time()
verts_a, faces_a, diag_a = build_pot_mesh_accelerated(
    H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=336, n_z=168,
    r_outer_fn=style_fn, style_opts={}, collect_timings=True, enforce_parity=False,
)
elapsed_a = time.time() - start

print('standard:', elapsed_s)
print('accelerated:', elapsed_a)
print('ratio:', elapsed_s / elapsed_a if elapsed_a>0 else float('inf'))
print('std diag:', diag_s)
print('acc diag:', diag_a)
