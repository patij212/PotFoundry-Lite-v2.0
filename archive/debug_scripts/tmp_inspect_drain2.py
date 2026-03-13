import numpy as np
from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.accelerated import vectorized_vertex_generation, build_vertices_vectorized
from potfoundry.geometry import _theta_grid_cached, base_radius
from potfoundry.core.mesh.outer_wall import spin_twist_radians
from potfoundry.core.mesh.drain import build_drain_hole

style_fn, _ = STYLES['SuperformulaBlossom']
H, Rt, Rb, t_wall, t_bottom, r_drain = 120, 70, 50, 3, 3, 10
n_theta, n_z = 168, 84

thetas, cos_th, sin_th = _theta_grid_cached(n_theta)
# z arrays like accelerated builder
z_outer = np.linspace(0.0, H, n_z + 1, dtype=np.float64)
z_inner = np.linspace(t_bottom, H, n_z + 1, dtype=np.float64)

# Build outer & inner vertices similar to accelerated building
r_outer_vals, twist_outer = vectorized_vertex_generation(
    z_outer, thetas, cos_th, sin_th, H, Rb, Rt, 1.1,
    style_fn, {},
    lambda z, H, Rb, Rt, expn, opts: Rb + (Rt - Rb) * (z/H)**1.1 if H>0 else Rb,  # base_radius
    spin_twist_radians,
)
outer_vertices = build_vertices_vectorized(r_outer_vals, twist_outer, z_outer, cos_th, sin_th)

r_inner_vals = r_outer_vals - t_wall
r_inner_vals[r_inner_vals < (r_drain + 1.0)] = (r_drain + 1.0)
inner_vertices = build_vertices_vectorized(r_inner_vals, twist_outer, z_inner, cos_th, sin_th)

verts_list = [tuple(v) for v in outer_vertices] + [tuple(v) for v in inner_vertices]
outer_idx = np.arange(len(outer_vertices), dtype=np.int32).reshape((len(z_outer), n_theta))
inner_idx = np.arange(len(outer_vertices), len(outer_vertices) + len(inner_vertices), dtype=np.int32).reshape((len(z_inner), n_theta))
j = np.arange(n_theta, dtype=np.int32)
jn = (j + 1) % n_theta

tri_bot1, tri_bot2, tri_top1, tri_top2, tri_cyl1, tri_cyl2, drain_under, drain_top = build_drain_hole(
    r_drain=r_drain, t_bottom=t_bottom, cos_th=cos_th, sin_th=sin_th,
    verts=verts_list, outer_idx=outer_idx, inner_idx=inner_idx, j_idx=j, jn=jn,
)

print('First drain_under indices:', drain_under[:10])
print('First drain_top indices:', drain_top[:10])
print('Drain under idx base:', drain_under[0])
print('Drain top idx base: ', drain_top[0])
print('Vertices at under idx 0:', verts_list[drain_under[0]])
print('Vertices at top idx 0:   ', verts_list[drain_top[0]])

# Convert to numpy and print last elements
vertices = np.asarray(verts_list, dtype=np.float64)
print('Vertices length', len(vertices))
print('last vertex', vertices[-1])
print('drain verts sample:')
for i in range(10):
    print(i, vertices[drain_under[i]], vertices[drain_top[i]])
