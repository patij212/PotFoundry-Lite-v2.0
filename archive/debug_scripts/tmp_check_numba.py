from potfoundry.core.optimizations import HAS_NUMBA
from potfoundry import STYLES
style_fn,_ = STYLES['LowPolyFacet']
print('HAS_NUMBA:', HAS_NUMBA)
print('style has numba helper:', getattr(style_fn, '__numba_parallel__', None) is not None)
