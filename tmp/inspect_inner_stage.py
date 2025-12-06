import time

import numpy as np

from potfoundry import STYLES
from potfoundry.core.mesh.outer_wall import spin_twist_radians

style_fn, _ = STYLES["SuperellipseMorph"]

n_theta = 168
n_z = 84

thetas, cos_th, sin_th = (np.linspace(0.0, 2*np.pi, n_theta, endpoint=False), np.cos(np.linspace(0.0, 2*np.pi, n_theta, endpoint=False)), np.sin(np.linspace(0.0, 2*np.pi, n_theta, endpoint=False)))
# theta grid begin
z_inner = np.linspace(3.0, 120.0, n_z)

start = time.perf_counter()
r0_inner_array = np.array([50.0 for z in z_inner], dtype=np.float64)
print("base radius compute", time.perf_counter() - start)

start = time.perf_counter()
twist_inner_candidate = spin_twist_radians(z_inner, 120.0, {})
print("spin_twist_radians vectorized", time.perf_counter() - start)

_opts = {"_pf_cos_th": cos_th, "_pf_sin_th": sin_th}
start = time.perf_counter()
theta_grid_inner = np.broadcast_to(thetas[np.newaxis, :], (len(z_inner), n_theta))
z_grid_inner = z_inner[:, np.newaxis]
r0_grid_inner = r0_inner_array[:, np.newaxis]
print("calling style...")
start2 = time.perf_counter(); sample_in = style_fn(theta_grid_inner, z_grid_inner, r0_grid_inner, 120.0, _opts); dt = time.perf_counter() - start2
print("style_fn call time:", dt)
print("total inner stage so far", time.perf_counter() - start)

sample_arr = np.asarray(sample_in, dtype=float)
print("returned shape", sample_arr.shape)

start3 = time.perf_counter()
# clamp
sample_arr[sample_arr < (10+1.0)] = (10+1.0)
print("clamp time", time.perf_counter() - start3)

# Now measure per-z fallback time
start = time.perf_counter()
for i, z in enumerate(z_inner):
    r0 = r0_inner_array[i]
    r_out = style_fn(thetas, float(z), r0, 120.0, _opts)
    r_in = np.asarray(r_out, dtype=float) - 3.0
    r_in[r_in < (10+1.0)] = 10+1.0
print("per-z loop time", time.perf_counter() - start)


print("\nDone")
