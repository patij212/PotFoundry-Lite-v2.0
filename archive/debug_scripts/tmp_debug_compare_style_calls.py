from potfoundry.core.mesh import theta_grid_cached, refine_z_outer_for_seams
from potfoundry.core.styles import STYLES
from potfoundry.core.geometry import base_radius
import numpy as np

n_theta=168
n_z=84
H=120
Rt=70
Rb=50
expn=1.1
style_fn, _ = STYLES['SuperformulaBlossom']
style_opts={}

# grids
thetas, cos_th, sin_th = theta_grid_cached(n_theta)
z_outer = np.linspace(0.0, H, n_z+1)
z_outer = refine_z_outer_for_seams(z_outer, H, style_opts)

# per-z loop sampling using call_style_r_outer via sample_outer_rings
from potfoundry.core.mesh.outer_wall import call_style_r_outer
from potfoundry.core.geometry import base_radius as base_fn
per_z = []
for z in z_outer[:4]:
    r0 = base_fn(float(z), H, Rb, Rt, expn, style_opts)
    rvals = call_style_r_outer(style_fn, thetas, float(z), r0, H, style_opts)
    per_z.append(np.asarray(rvals,dtype=float))
per_z = np.vstack(per_z)

# vectorized call
n_z_test = min(4, len(z_outer))
test_zs = z_outer[:n_z_test]
from numpy import broadcast_to
theta_grid = broadcast_to(thetas[np.newaxis,:], (n_z_test, n_theta))
z_grid = test_zs[:,np.newaxis]
r0_grid = np.array([base_fn(float(z), H, Rb, Rt, expn, style_opts) for z in test_zs])[:, np.newaxis]
vec = np.asarray(style_fn(theta_grid, z_grid, r0_grid, H, style_opts), dtype=float)

# Compare
print('per_z shape', per_z.shape, 'vec shape', vec.shape)
diff = np.abs(per_z - vec)
print('max diff', diff.max())
# Print sample entries
for zi in range(min(4, per_z.shape[0])):
    print('z', test_zs[zi], ' per_z[zi,j=0:3]=',per_z[zi,:3], 'vec[zi,j=0:3]=', vec[zi,:3], 'maxdiff row', diff[zi].max())
