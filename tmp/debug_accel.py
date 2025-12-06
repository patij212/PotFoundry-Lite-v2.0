from potfoundry.core.optimizations import build_pot_mesh_accelerated
from potfoundry.geometry import build_pot_mesh, STYLES
import numpy as np
style_fn = STYLES['SuperformulaBlossom'][0]
verts_std, faces_std, _ = build_pot_mesh(120,70,50,3,3,10,1.1,168,84,style_fn,{})
verts_acc, faces_acc, diag = build_pot_mesh_accelerated(120,70,50,3,3,10,1.1,168,84,style_fn,{}, collect_timings=True)
print('diag:', diag)
# Find mismatches
mask = ~np.isclose(verts_std, verts_acc, rtol=1e-6, atol=1e-9)
idx = np.argwhere(mask)
print('mismatch_count:', idx.shape[0])
# Show up to first 20 unique vertex indices where any component differs
seen_rows = set()
count = 0
for r,c in idx:
    if r not in seen_rows:
        seen_rows.add(r)
        print('row', r, 'std:', verts_std[r], 'acc:', verts_acc[r])
        count += 1
    if count >= 10:
        break
print('last_5_std', verts_std[-5:])
print('last_5_acc', verts_acc[-5:])
print('first_5_std', verts_std[:5])
print('first_5_acc', verts_acc[:5])
