from pathlib import Path
import numpy as np
from potfoundry.core.geometry import build_pot_mesh, STYLES

n_theta=24; n_z=6; H=7.0
Z=n_z+1; T=n_theta
R_grid=np.ones((Z,T),dtype=float)*15.0
for zi in range(Z):
    R_grid[zi,0]=25.0
    R_grid[zi,T//2]=25.0
    R_grid[zi,T//4]=10.0

def synthetic_r_outer_fn(thetas,z,r0,H_local,opts):
    idx=int(round((float(z)/float(H))*float(n_z)))
    idx=max(0,min(Z-1,idx))
    return np.asarray(R_grid[idx,:],dtype=float)
style_opts = {
    'sf_style': 'SuperformulaBlossom',
    'sf_edge_flow_reconstruct_enable': True,
    'sf_edge_flow_mode': 'ridge_paths',
    'sf_edge_flow_twist_compensate': False,
    'sf_edge_flow_auto_deoffset': False,
    'sf_edge_flow_debug': True,
    'sf_edge_flow_verbose_diagnostics': True,
    'sf_edge_flow_probe': True,
    'sf_edge_flow_probe_zi': int(Z//2),
    'sf_edge_flow_window': 3,
}
verts, faces, diagnostics = build_pot_mesh(H, Rt=40.0, Rb=40.0, t_wall=2.5, t_bottom=4.0, r_drain=3.0,
                                          expn=1.0, n_theta=n_theta, n_z=n_z,
                                          r_outer_fn=synthetic_r_outer_fn,
                                          style_opts=style_opts)
print('diag keys:', list(diagnostics.keys()))
print('has edgeflow_verbose?', 'edgeflow_verbose' in diagnostics)
if 'edgeflow_verbose' in diagnostics:
    print('len:', len(diagnostics['edgeflow_verbose']))
    print('sample entry keys:', list(diagnostics['edgeflow_verbose'][0].keys()))
else:
    print('No edgeflow_verbose present')
