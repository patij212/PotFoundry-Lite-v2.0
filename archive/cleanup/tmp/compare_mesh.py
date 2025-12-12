from potfoundry.core.optimizations import build_pot_mesh_accelerated
from potfoundry.geometry import build_pot_mesh, STYLES
import numpy as np
style_fn = STYLES['SuperformulaBlossom'][0]
verts_std, faces_std, _ = build_pot_mesh(120,70,50,3,3,10,1.1,168,84,style_fn,{})
verts_acc, faces_acc, _ = build_pot_mesh_accelerated(120,70,50,3,3,10,1.1,168,84,style_fn,{})
mask = ~np.isclose(verts_std, verts_acc, rtol=1e-6, atol=1e-9)
idx = np.argwhere(mask)
print('mismatch count', idx.shape[0])
print('first 10 mismatches', idx[:10])
for i in idx[:10]:
    vi = tuple(i)
    print(vi, verts_std[vi], verts_acc[vi])

# Also print last 10 vertices to inspect drain / inner differences
print('last 10 standard', verts_std[-10:])
print('last 10 accel', verts_acc[-10:])
