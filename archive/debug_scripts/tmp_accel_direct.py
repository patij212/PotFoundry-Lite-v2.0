import numpy as np
from potfoundry import STYLES
from potfoundry.core.accelerated import accelerated_build_pot_mesh

style_fn, _ = STYLES['SuperformulaBlossom']
H, Rt, Rb, t_wall, t_bottom, r_drain = 120, 70, 50, 3, 3, 10
n_theta, n_z = 168, 84

verts_acc, faces_acc, diag = accelerated_build_pot_mesh(
    H=H, Rt=Rt, Rb=Rb, t_wall=t_wall, t_bottom=t_bottom, r_drain=r_drain,
    expn=1.1, n_theta=n_theta, n_z=n_z, r_outer_fn=style_fn, style_opts={},
    base_radius_fn=lambda z, H, Rb, Rt, expn, opts: Rb + (Rt-Rb)*(z/H)**1.1 if H>0 else Rb,
    spin_twist_fn=lambda z, H, opts: 0.0,
    theta_grid_fn=lambda n: (np.linspace(0.0, 2*np.pi, n, endpoint=False), np.cos(np.linspace(0.0, 2*np.pi, n, endpoint=False)), np.sin(np.linspace(0.0, 2*np.pi, n, endpoint=False)))
)

n_outer = (n_z + 1) * n_theta
n_inner = (n_z + 1) * n_theta
start = n_outer + n_inner
print('len verts', len(verts_acc))
print('Drain start', start)
print('acc drain first 10:')
for i in range(start, start+10):
    print(i, verts_acc[i])

# Compare with previous
print('\nacc drain some sample (last few):')
for i in range(start+150, start+161):
    print(i, verts_acc[i])
