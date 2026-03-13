import numpy as np
from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.accelerated import accelerated_build_pot_mesh
from potfoundry.geometry import base_radius
from potfoundry.core.mesh.outer_wall import spin_twist_radians
from potfoundry.core.mesh.grid import theta_grid_cached

style_fn, _ = STYLES['SuperformulaBlossom']
H, Rt, Rb, t_wall, t_bottom, r_drain = 120, 70, 50, 3, 3, 10
n_theta, n_z = 168, 84

std_verts, std_faces, _ = build_pot_mesh(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})
accel_verts, accel_faces, _ = accelerated_build_pot_mesh(
    H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
    expn=1.1, n_theta=n_theta, n_z=n_z, r_outer_fn=style_fn, style_opts={},
    base_radius_fn=base_radius,
    spin_twist_fn=spin_twist_radians,
    theta_grid_fn=theta_grid_cached
)

print('Std vs Accel with geom funcs equal?:', np.allclose(std_verts, accel_verts, rtol=1e-6, atol=1e-9))
idxs = np.where(np.abs(std_verts - accel_verts).max(axis=1) > 1e-9)[0]
print('mismatch count:', len(idxs), 'first few', idxs[:20])
if len(idxs) > 0:
    for i in idxs[:20]:
        print(i, std_verts[i], accel_verts[i])
print('Done')
