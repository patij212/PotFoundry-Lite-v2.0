from potfoundry.core.geometry import build_pot_mesh as geom_build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated as wrapper_build
from potfoundry.core.mesh.grid import theta_grid_cached
from potfoundry.core.mesh.outer_wall import spin_twist_radians
from potfoundry.geometry import base_radius
from potfoundry import STYLES

style_fn, _ = STYLES['SuperformulaBlossom']
H, Rt, Rb, t_wall, t_bottom, r_drain = 120, 70, 50, 3, 3, 10
n_theta, n_z = 168, 84

std_verts, _, _ = geom_build_pot_mesh(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})
wrap_verts, _, diag = wrapper_build(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})

print('same?', (std_verts == wrap_verts).all())
print('diag', diag)
start = (n_theta*(n_z+1)*2)
print('std drain 0..10:')
for i in range(start, start+10):
    print(i, std_verts[i])
print('\nwrap drain 0..10:')
for i in range(start, start+10):
    print(i, wrap_verts[i])
