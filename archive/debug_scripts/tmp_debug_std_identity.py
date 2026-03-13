from potfoundry import build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated
from potfoundry.core.optimizations import build_pot_mesh_accelerated as wrapper
import inspect

print('build_pot_mesh id', build_pot_mesh, id(build_pot_mesh))
print('wrapper ref', wrapper, type(wrapper))

# Get fallback function from wrapper module by re-importing file contents
import importlib
import potfoundry.core.optimizations as opt

try:
    from potfoundry.core.geometry import build_pot_mesh as geom_build
    print('geom_build id', geom_build, id(geom_build))
except Exception as e:
    print('error reading geom_build', e)

# Print whether they are the same
print('build_pot_mesh is geom_build?', build_pot_mesh is geom_build)

PY