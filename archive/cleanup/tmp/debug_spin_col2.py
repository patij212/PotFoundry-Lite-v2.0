import numpy as np

from potfoundry.core.accelerated import vectorized_vertex_generation


def style_func_multi_z(theta_grid, z_grid, r0_grid, H, opts):
    print("style_func_multi_z shapes", np.asarray(theta_grid).shape, np.asarray(z_grid).shape, np.asarray(r0_grid).shape)
    return theta_grid + (z_grid * 0.0)


def wrapper(theta_grid, z_grid, r0_grid, H, opts):
    print("wrapper called shapes", np.asarray(theta_grid).shape, np.asarray(z_grid).shape, np.asarray(r0_grid).shape)
    return style_func_multi_z(theta_grid, z_grid, r0_grid, H, opts)


def spin_col(z_arr, H, opts):
    print("spin_col called; type of z_arr", type(z_arr), "shape", np.asarray(z_arr).shape)
    # returns column vector shape
    return np.asarray(z_arr, dtype=float)[:, np.newaxis] * 0.0 + 0.75

n_theta = 12
n_z = 6

thetas = np.linspace(0.0, 2*np.pi, n_theta, endpoint=False)
cos_th = np.cos(thetas)
sin_th = np.sin(thetas)
z_array = np.linspace(0.0, 100.0, n_z)

r_values, twist = vectorized_vertex_generation(
    z_array, thetas, cos_th, sin_th, H=100.0, Rb=40.0, Rt=60.0, expn=1.0,
    r_outer_fn=wrapper, style_opts={}, base_radius_fn=lambda z, H, Rb, Rt, expn, opts: 45.0,
    spin_twist_fn=spin_col,
)
print("r_values shape", r_values.shape, "twist shape", twist.shape)
