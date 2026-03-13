from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated as wrapper

style_fn, _ = STYLES['SuperformulaBlossom']
H, Rt, Rb, t_wall, t_bottom, r_drain = 120, 70, 50, 3, 3, 10
n_theta, n_z = 168, 84

std_verts, std_faces, _ = build_pot_mesh(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})
wrap_verts, wrap_faces, diag = wrapper(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})
print('std == wrap?', (std_verts == wrap_verts).all())
print('diag', diag)
start = (n_theta*(n_z+1)*2)
print('std drain sample:')
for i in range(start, start+10):
    print(i, std_verts[i])
print('\nwrap drain sample:')
for i in range(start, start+10):
    print(i, wrap_verts[i])
