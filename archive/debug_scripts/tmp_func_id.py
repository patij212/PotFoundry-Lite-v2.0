from potfoundry.core.accelerated import accelerated_build_pot_mesh as direct_fn
from potfoundry.core.optimizations import build_pot_mesh_accelerated as wrapper_fn
from potfoundry.core.optimizations import accelerated_build_pot_mesh as wrapper_inner_accel

print('direct_fn', direct_fn)
print('wrapper_fn', wrapper_fn)
print('wrapper_inner_accel', wrapper_inner_accel)
print('direct == wrapper_inner:', direct_fn is wrapper_inner_accel)
