import potfoundry.core.geometry as geom
from potfoundry.core.optimizations import build_pot_mesh_accelerated
from potfoundry import STYLES

orig = geom.build_pot_mesh

def logged_build(H, Rt, Rb, t_wall, t_bottom, r_drain, expn, n_theta, n_z, r_outer_fn, style_opts):
    print('logged: build_pot_mesh called. r_outer_fn=', getattr(r_outer_fn, '__name__', r_outer_fn))
    return orig(H, Rt, Rb, t_wall, t_bottom, r_drain, expn, n_theta, n_z, r_outer_fn, style_opts)

geom.build_pot_mesh = logged_build
from potfoundry.core.optimizations import clear_mesh_cache
clear_mesh_cache()

style_fn,_ = STYLES['LowPolyFacet']
verts,faces,diag = build_pot_mesh_accelerated(H=120,Rt=70,Rb=50,t_wall=3,t_bottom=3,r_drain=10,expn=1.1,n_theta=168,n_z=84,r_outer_fn=style_fn,style_opts={})
print('diag:', diag)
print('done')
