import time

import numpy as np

from potfoundry.core.styles.superellipse_morph import r_outer_superellipse_morph

n_theta = 168
n_z = 84

thetas = np.linspace(0.0, 2*np.pi, n_theta, endpoint=False)
cos_th = np.cos(thetas)
sin_th = np.sin(thetas)
z_array = np.linspace(3.0, 120.0, n_z)

# 1) Single grid call
start = time.perf_counter()
res = r_outer_superellipse_morph(thetas[np.newaxis,:].repeat(n_z,axis=0), z_array[:, np.newaxis], 50.0, 120.0, {"_pf_cos_th": cos_th, "_pf_sin_th": sin_th})
print("grid call time:", time.perf_counter()-start)

# 2) per-z loop
start = time.perf_counter()
outs = []
for z in z_array:
    outs.append(r_outer_superellipse_morph(thetas, float(z), 50.0, 120.0, {"_pf_cos_th": cos_th, "_pf_sin_th": sin_th}))
outs = np.asarray(outs)
print("per-z calls time:", time.perf_counter()-start)

# 3) compute with default opts (no precomp)
start = time.perf_counter()
res2 = r_outer_superellipse_morph(thetas[np.newaxis,:].repeat(n_z,axis=0), z_array[:, np.newaxis], 50.0, 120.0, {})
print("grid call no opts time:", time.perf_counter()-start)
