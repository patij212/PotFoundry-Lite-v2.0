import time

import numpy as np

n_theta = 168
n_z = 84

thetas = np.linspace(0.0, 2*np.pi, n_theta, endpoint=False)
cos_th = np.cos(thetas)
sin_th = np.sin(thetas)

# Broadcast cos to grid
cos_base = np.broadcast_to(cos_th[np.newaxis, :], (n_z, n_theta))
sin_base = np.broadcast_to(sin_th[np.newaxis, :], (n_z, n_theta))

m_exp_arr = np.linspace(2.0, 5.5, n_z)

abs_cos = np.maximum(np.abs(cos_base), 1e-12)
abs_sin = np.maximum(np.abs(sin_base), 1e-12)

m_exp_grid = m_exp_arr[:, np.newaxis]

# Time exp/log power comp
start = time.perf_counter()
c = np.exp(m_exp_grid * np.log(abs_cos)); s = np.exp(m_exp_grid * np.log(abs_sin))
print("pow exp/log time", time.perf_counter()-start)

start = time.perf_counter(); rf = np.exp((-1.0 / m_exp_grid) * np.log(np.maximum(c + s, 1e-12))); print("rf time", time.perf_counter()-start)

# Time other operations like np.cos(4*th)
th_grid = np.broadcast_to(thetas[np.newaxis, :], (n_z, n_theta))
start = time.perf_counter(); c4 = np.cos(4.0*th_grid); c8 = np.cos(8.0*th_grid); print("cos compute time", time.perf_counter()-start)

# Time pow via np.abs(cos_base)**m_exp_grid to compare
start = time.perf_counter(); cpow = np.abs(cos_base) ** m_exp_grid; print("direct pow time", time.perf_counter()-start)
