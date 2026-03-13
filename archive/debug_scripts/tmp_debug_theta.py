import numpy as np
from potfoundry.core.mesh.grid import theta_grid_cached
from potfoundry.geometry import _theta_grid_cached

n_theta = 168
thetas1, cos1, sin1 = _theta_grid_cached(n_theta)
thetas2, cos2, sin2 = theta_grid_cached(n_theta)

print('same shape', cos1.shape, cos2.shape)
print('first 10 cos1:', cos1[:10])
print('first 10 cos2:', cos2[:10])
print('first 10 sin1:', sin1[:10])
print('first 10 sin2:', sin2[:10])

# Check if arrays are identical
print('arrays equal?', np.allclose(cos1, cos2) and np.allclose(sin1, sin2))

# Check if shift exists: find offsets where cos1[i] == cos2[i+1]
for shift in [-2,-1,0,1,2]:
    if shift >= 0:
        eq = np.allclose(cos1[:len(cos1)-shift], cos2[shift:])
    else:
        eq = np.allclose(cos1[-shift:], cos2[:len(cos2)+shift])
    print('shift', shift, 'equal?', eq)
