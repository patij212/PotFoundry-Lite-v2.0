from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated

style_fn, _ = STYLES['HarmonicRipple']
H, Rt, Rb, t_wall, t_bottom, r_drain = 120, 70, 50, 3, 3, 10
n_theta, n_z = 8, 4

verts_std, faces_std, _ = build_pot_mesh(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})
verts_acc, faces_acc, _ = build_pot_mesh_accelerated(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})

n_outer = (n_z + 1) * n_theta
n_inner = (n_z + 1) * n_theta
print('n_outer', n_outer, 'n_inner', n_inner)
drain_start = n_outer + n_inner
print('drain_start', drain_start)
print('Standard drain z-values (first 16):', [float(v[2]) for v in verts_std[drain_start:drain_start + 2*n_theta]])
print('Accelerated drain z-values (first 16):', [float(v[2]) for v in verts_acc[drain_start:drain_start + 2*n_theta]])
print('Standard drain first 16 x-y pairs:', [(float(v[0]), float(v[1])) for v in verts_std[drain_start:drain_start + 2*n_theta]])
print('Accelerated drain first 16 x-y pairs:', [(float(v[0]), float(v[1])) for v in verts_acc[drain_start:drain_start + 2*n_theta]])

print('Interleaved indices (std):')
for i in range(n_theta):
    idx_under = drain_start + 2*i
    idx_top = drain_start + 2*i + 1
    print(i, 'under idx', idx_under, 'z', float(verts_std[idx_under][2]), ' top idx', idx_top, 'z', float(verts_std[idx_top][2]))

print('Interleaved indices (acc):')
for i in range(n_theta):
    idx_under = drain_start + 2*i
    idx_top = drain_start + 2*i + 1
    print(i, 'under idx', idx_under, 'z', float(verts_acc[idx_under][2]), ' top idx', idx_top, 'z', float(verts_acc[idx_top][2]))

# Compare angular ordering of drain vertices for both builders
import math
std_angles = [math.atan2(float(v[1]), float(v[0])) for v in verts_std[drain_start:drain_start + 2*n_theta]]
acc_angles = [math.atan2(float(v[1]), float(v[0])) for v in verts_acc[drain_start:drain_start + 2*n_theta]]
print('\nFirst few standard drain angles (radians):', std_angles[:16])
print('First few accelerated drain angles (radians):', acc_angles[:16])
