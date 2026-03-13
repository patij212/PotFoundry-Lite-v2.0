from potfoundry.core.optimizations import _ensure_canonical_drain_in_mesh
from potfoundry import STYLES, build_pot_mesh

style_fn, _ = STYLES['LowPolyFacet']
H,Rt,Rb,t_wall,t_bottom,r_drain = 120,70,50,3,3,10
n_theta,n_z = 168,84

verts_std,faces_std,diag_std = build_pot_mesh(H,Rt,Rb,t_wall,t_bottom,r_drain,1.1,n_theta,n_z,style_fn,{})
vertices_after, faces_after = _ensure_canonical_drain_in_mesh(verts_std, faces_std, t_bottom, r_drain, n_theta, n_z)

import numpy as np
print('same verts?', np.allclose(verts_std, vertices_after))
print('same faces?', np.array_equal(faces_std, faces_after))
print('n_verts', len(verts_std), 'n_verts_after', len(vertices_after))
print('First 10 verts std vs after')
for i in range(10):
    print(i, verts_std[i], vertices_after[i])
