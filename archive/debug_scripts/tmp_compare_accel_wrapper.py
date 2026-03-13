import numpy as np
from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.accelerated import accelerated_build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated as wrapper_accel

style_fn, _ = STYLES['SuperformulaBlossom']
H, Rt, Rb, t_wall, t_bottom, r_drain = 120, 70, 50, 3, 3, 10
n_theta, n_z = 168, 84

std_verts, std_faces, _ = build_pot_mesh(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})
accel_verts_direct, accel_faces_direct, _ = accelerated_build_pot_mesh(
    H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
    expn=1.1, n_theta=n_theta, n_z=n_z, r_outer_fn=style_fn, style_opts={},
    base_radius_fn=lambda z, H, Rb, Rt, expn, opts: Rb + (Rt-Rb)*(z/H)**1.1 if H>0 else Rb,
    spin_twist_fn=lambda z, H, opts: 0.0,
    theta_grid_fn=lambda n: (np.linspace(0.0, 2*np.pi, n, endpoint=False), np.cos(np.linspace(0.0, 2*np.pi, n, endpoint=False)), np.sin(np.linspace(0.0, 2*np.pi, n, endpoint=False)))
)
accel_verts_wrapper, accel_faces_wrapper, _ = wrapper_accel(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})

# Differences
print('Std vs Direct:', np.allclose(std_verts, accel_verts_direct, rtol=1e-6, atol=1e-9))
print('Std vs Wrapper:', np.allclose(std_verts, accel_verts_wrapper, rtol=1e-6, atol=1e-9))
print('Direct vs Wrapper:', np.allclose(accel_verts_direct, accel_verts_wrapper, rtol=1e-6, atol=1e-9))

# Where mismatches are
if not np.allclose(std_verts, accel_verts_wrapper, rtol=1e-6, atol=1e-9):
    diff_idx = np.where(np.abs(std_verts - accel_verts_wrapper).max(axis=1) > 1e-9)[0]
    print('Wrapper mismatches:', len(diff_idx))
    print('First wrapper mismatch:', diff_idx[:10])
    print('Sample mismatch entries:')
    for i in diff_idx[:10]:
        print(i, std_verts[i], accel_verts_wrapper[i])

if not np.allclose(std_verts, accel_verts_direct, rtol=1e-6, atol=1e-9):
    diff_idx = np.where(np.abs(std_verts - accel_verts_direct).max(axis=1) > 1e-9)[0]
    print('Direct mismatches:', len(diff_idx))
    print('First direct mismatch:', diff_idx[:10])
    print('Sample mismatch entries:')
    for i in diff_idx[:10]:
        print(i, std_verts[i], accel_verts_direct[i])

print('Done')
