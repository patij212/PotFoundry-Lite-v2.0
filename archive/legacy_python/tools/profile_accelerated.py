"""Profiling helper for accelerated vs standard mesh generation.

Run this script to profile the build paths and show hotspots.
"""
import cProfile
import pstats
import io
from potfoundry.core.geometry import build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated
from potfoundry.core.styles import STYLES

def profile_style(style_name="SuperformulaBlossom", n_theta=168, n_z=84):
    style_fn, _ = STYLES[style_name]
    print(f"Profiling {style_name} at {n_theta}x{n_z}")
    pr = cProfile.Profile()
    # Profile standard build
    pr.enable()
    build_pot_mesh(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=n_theta, n_z=n_z,
        r_outer_fn=style_fn, style_opts={},
    )
    pr.disable()
    s = io.StringIO()
    ps = pstats.Stats(pr, stream=s).sort_stats("cumulative")
    ps.strip_dirs().print_stats(20)
    print(s.getvalue())

    # Profile accelerated build
    pr = cProfile.Profile()
    pr.enable()
    build_pot_mesh_accelerated(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=n_theta, n_z=n_z,
        r_outer_fn=style_fn, style_opts={},
    )
    pr.disable()
    s = io.StringIO()
    ps = pstats.Stats(pr, stream=s).sort_stats("cumulative")
    ps.strip_dirs().print_stats(20)
    print(s.getvalue())

if __name__ == "__main__":
    profile_style("SuperformulaBlossom", 168, 84)
    profile_style("LowPolyFacet", 168, 84)
