from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated as wrapper

style_fn, _ = STYLES['SuperformulaBlossom']
H, Rt, Rb, t_wall, t_bottom, r_drain = 120, 70, 50, 3, 3, 10
n_theta, n_z = 168, 84

std_verts, _, _ = build_pot_mesh(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})
wrap_verts, _, _ = wrapper(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})

start = (n_theta*(n_z+1)*2)

zs = wrap_verts[start:start+2*n_theta, 2]
print('unique z values', set(zs.tolist()))
print('first 40 z values:', zs[:40].tolist())
indices_top = [i for i,z in enumerate(zs) if abs(z-3.0) < 1e-9]
print('indices with z==t_bottom sample:', indices_top[:20])
