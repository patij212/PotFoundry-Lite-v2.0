import numpy as np
from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated

style_fn, _ = STYLES['SuperformulaBlossom']
H, Rt, Rb, t_wall, t_bottom, r_drain = 120, 70, 50, 3, 3, 10
n_theta, n_z = 168, 84

verts_std, faces_std, _ = build_pot_mesh(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})
verts_acc, faces_acc, _ = build_pot_mesh_accelerated(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})

n_outer = (n_z + 1) * n_theta
n_inner = (n_z + 1) * n_theta
start = n_outer + n_inner
print('Drain start', start)
print('Std drain first 10:')
for i in range(start, start+10):
    print(i, verts_std[i])
print('\nAcc drain first 10:')
for i in range(start, start+10):
    print(i, verts_acc[i])

# Print the last few vertices as well
print('\nStd last 5 vertices:')
for i in range(len(verts_std)-5, len(verts_std)):
    print(i, verts_std[i])
print('\nAcc last 5 vertices:')
for i in range(len(verts_acc)-5, len(verts_acc)):
    print(i, verts_acc[i])
