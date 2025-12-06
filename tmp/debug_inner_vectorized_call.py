import numpy as np

from potfoundry.core.styles.superellipse_morph import r_outer_superellipse_morph

n_theta = 168
n_z = 84

thetas = np.linspace(0.0, 2*np.pi, n_theta, endpoint=False)
cos_th = np.cos(thetas)
sin_th = np.sin(thetas)

z_inner = np.linspace(3.0, 120.0, n_z)

theta_grid_inner = np.broadcast_to(thetas[np.newaxis, :], (len(z_inner), n_theta))

z_grid_inner = z_inner[:, np.newaxis]

r0_inner_array = np.full((len(z_inner),), 50.0)
r0_grid_inner = r0_inner_array[:, np.newaxis]

_opts = {"_pf_cos_th": cos_th, "_pf_sin_th": sin_th}

print("Calling style with theta_grid,z_grid,r0_grid shapes:", theta_grid_inner.shape, z_grid_inner.shape, r0_grid_inner.shape)

res = r_outer_superellipse_morph(theta_grid_inner, z_grid_inner, r0_grid_inner, 120.0, _opts)
print("result shape:", np.asarray(res).shape)
