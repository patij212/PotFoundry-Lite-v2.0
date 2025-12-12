from potfoundry import STYLES
from potfoundry.core import optimizations

style_fn, _ = STYLES["SuperformulaBlossom"]

from potfoundry.core.geometry import build_pot_mesh
from potfoundry.core.accelerated import accelerated_build_pot_mesh
from potfoundry.core.geometry import base_radius
from potfoundry.core.mesh import theta_grid_cached
from potfoundry.core.mesh.outer_wall import spin_twist_radians

verts_std, faces_std, _ = build_pot_mesh(
    H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
    expn=1.1, n_theta=168, n_z=84,
    r_outer_fn=style_fn, style_opts={},
)

verts_acc_direct, faces_acc_direct, _ = accelerated_build_pot_mesh(
    H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
    expn=1.1, n_theta=168, n_z=84,
    r_outer_fn=style_fn, style_opts={},
    base_radius_fn=base_radius,
    spin_twist_fn=spin_twist_radians,
    theta_grid_fn=theta_grid_cached,
)
print('Direct accelerated run done')

from potfoundry.core import optimizations as opt
verts_acc_wrapper, faces_acc_wrapper, diag = opt.build_pot_mesh_accelerated(
    H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
    expn=1.1, n_theta=168, n_z=84,
    r_outer_fn=style_fn, style_opts={}, collect_timings=True,
)
print('Wrapper elapsed, diag:', diag)

import numpy as np

if not np.allclose(verts_std, verts_acc, rtol=1e-6, atol=1e-9):
    diffs = np.where(~np.isclose(verts_std, verts_acc, rtol=1e-6, atol=1e-9))[0]
    print('Number of differing vertices:', len(diffs))
    # show first few diffs
    for idx in diffs[:10]:
        print(idx, verts_std[idx], verts_acc[idx])
        n_theta=168
        zidx = idx // n_theta
        tidx = idx % n_theta
        print('z,theta:', zidx, tidx)
else:
    print('All vertices match')
