import numpy as np
import potfoundry.core.accelerated as accmod
from potfoundry.core.optimizations import build_pot_mesh_accelerated as wrapper_accel
from potfoundry import STYLES

orig = accmod.accelerated_build_pot_mesh

def logged_accelerated_build_pot_mesh(*args, **kwargs):
    print('accelerated called with keys:', sorted(kwargs.keys()))
    # print the func types passed
    for k, v in kwargs.items():
        if callable(v):
            print('   callable', k, '->', getattr(v, '__name__', str(v)))
    return orig(*args, **kwargs)

accmod.accelerated_build_pot_mesh = logged_accelerated_build_pot_mesh

style_fn, _ = STYLES['SuperformulaBlossom']
H, Rt, Rb, t_wall, t_bottom, r_drain = 120, 70, 50, 3, 3, 10
n_theta, n_z = 168, 84

verts, faces, diag = wrapper_accel(H, Rt, Rb, t_wall, t_bottom, r_drain, 1.1, n_theta, n_z, style_fn, {})

print('diag', diag)
print('First drain vertex:', verts[(n_theta*(n_z+1)*2):((n_theta*(n_z+1)*2)+2)])
print('Done')
