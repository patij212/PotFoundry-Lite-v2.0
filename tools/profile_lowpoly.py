import cProfile, pstats, io
from potfoundry.core.accelerated import accelerated_build_pot_mesh
from potfoundry.core.styles import STYLES
from potfoundry.core.geometry import base_radius
from potfoundry.core.mesh.outer_wall import spin_twist_radians
from potfoundry.core.mesh.grid import theta_grid_cached

if __name__ == '__main__':
    style_fn, _ = STYLES['LowPolyFacet']
    pr = cProfile.Profile()
    pr.enable()
    verts, faces, diag = accelerated_build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10, expn=1.1, n_theta=336, n_z=168,
        r_outer_fn=style_fn, style_opts={}, base_radius_fn=base_radius, spin_twist_fn=spin_twist_radians, theta_grid_fn=theta_grid_cached,
        collect_timings=True, enforce_parity=False,
    )
    pr.disable()
    s = io.StringIO()
    ps = pstats.Stats(pr, stream=s).sort_stats('cumulative')
    ps.strip_dirs().print_stats(40)
    print(s.getvalue())
    print('diagnostics', diag)
