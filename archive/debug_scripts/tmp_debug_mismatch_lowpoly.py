import numpy as np
from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated

style_fn, _ = STYLES['LowPolyFacet']
H, Rt, Rb, t_wall, t_bottom, r_drain = 120, 70, 50, 3, 3, 10
n_theta, n_z = 168, 84

verts_std, faces_std, _ = build_pot_mesh(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})
verts_acc, faces_acc, _ = build_pot_mesh_accelerated(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})

print('verts shapes:', verts_std.shape, verts_acc.shape)
diff = np.linalg.norm(verts_std - verts_acc, axis=1)
print('max diff', diff.max(), 'mean diff', diff.mean())
idxs = np.where(np.abs(verts_std - verts_acc).max(axis=1) > 1e-9)[0]
print('num mismatches:', len(idxs))
for k in idxs[:40]:
    rs = np.linalg.norm(verts_std[k,:2])
    ra = np.linalg.norm(verts_acc[k,:2])
    print(k, 'std_r', round(rs,6), 'acc_r', round(ra,6), 'std', verts_std[k], 'acc', verts_acc[k])

print('Done')
