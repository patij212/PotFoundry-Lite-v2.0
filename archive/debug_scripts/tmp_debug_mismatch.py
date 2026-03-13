import numpy as np
from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated

style_fn, _ = STYLES['SuperformulaBlossom']
H, Rt, Rb, t_wall, t_bottom, r_drain = 120, 70, 50, 3, 3, 10
n_theta, n_z = 168, 84

verts_std, faces_std, _ = build_pot_mesh(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})
verts_acc, faces_acc, _ = build_pot_mesh_accelerated(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})

print('verts shapes:', verts_std.shape, verts_acc.shape)
diff = np.linalg.norm(verts_std - verts_acc, axis=1)
print('max diff', diff.max(), 'mean diff', diff.mean())
# Show first 20 mismatches with index and coordinates
idxs = np.where(np.abs(verts_std - verts_acc).max(axis=1) > 1e-9)[0]
print('num mismatches:', len(idxs))
for k in idxs[:20]:
    print(k, verts_std[k], verts_acc[k], np.abs(verts_std[k] - verts_acc[k]))

# Optionally dump a small sample where mismatch is largest
k = int(np.argmax(diff))
print('largest mismatch idx', k, verts_std[k], verts_acc[k], diff[k])

print('Done')

# Categorize mismatches by region
n_outer = (n_z + 1) * n_theta
n_inner = (n_z + 1) * n_theta
drain_start = n_outer + n_inner

count_outer = sum(1 for i in idxs if i < n_outer)
count_inner = sum(1 for i in idxs if n_outer <= i < n_outer + n_inner)
count_drain = sum(1 for i in idxs if i >= drain_start)
print('mismatch counts by region:', {'outer': count_outer, 'inner': count_inner, 'drain': count_drain})

# Drill into drain mismatches to see angles and under/top patterns
drain_mismatch_locals = [i - drain_start for i in idxs if i >= drain_start]
drain_angles_mismatch = sorted(set([local // 2 for local in drain_mismatch_locals]))
print('Number of drain angle indices with mismatches:', len(drain_angles_mismatch))
print('First few angle indices with mismatches:', drain_angles_mismatch[:40])

# Print a few sample mismatches (angle and whether under/top)
for local in drain_mismatch_locals[:40]:
    angle = local // 2
    which = 'under' if (local % 2 == 0) else 'top'
    idx_abs = drain_start + local
    print('angle', angle, which, 'idx', idx_abs, 'std', verts_std[idx_abs], 'acc', verts_acc[idx_abs])
