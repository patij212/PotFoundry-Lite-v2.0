import numpy as np
from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated
import math

style_fn, _ = STYLES['SuperformulaBlossom']
H, Rt, Rb, t_wall, t_bottom, r_drain = 120, 70, 50, 3, 3, 10
n_theta, n_z = 168, 84

verts_std, faces_std, _ = build_pot_mesh(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})
verts_acc, faces_acc, _ = build_pot_mesh_accelerated(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})

n_outer = (n_z + 1) * n_theta
n_inner = (n_z + 1) * n_theta
print('n_outer', n_outer, 'n_inner', n_inner)
drain_start = n_outer + n_inner
print('drain_start', drain_start)

std_angles = [math.atan2(float(v[1]), float(v[0])) for v in verts_std[drain_start:drain_start + 2*n_theta]]
acc_angles = [math.atan2(float(v[1]), float(v[0])) for v in verts_acc[drain_start:drain_start + 2*n_theta]]

mismatch_idx = [i for i in range(2*n_theta) if abs(std_angles[i] - acc_angles[i]) > 1e-9]
print('angle mismatch count:', len(mismatch_idx))
print('first mismatch indices:', mismatch_idx[:20])

print('\nStd angles sample:', std_angles[:40])
print('\nAcc angles sample:', acc_angles[:40])
