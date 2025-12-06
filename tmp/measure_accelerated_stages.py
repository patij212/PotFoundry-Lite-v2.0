from __future__ import annotations

import time

import numpy as np

from potfoundry.core.accelerated import (
    build_faces_vectorized,
    build_vertices_vectorized,
    vectorized_vertex_generation,
)
from potfoundry.core.mesh import theta_grid_cached
from potfoundry.geometry import STYLES, base_radius

DEFAULT_ARGS = dict(H=120, Rt=70, Rb=50, expn=1.1, n_theta=168, n_z=84, t_wall=3, t_bottom=3, r_drain=10)

style_names = ["SuperformulaBlossom","FourierBloom","SpiralRidges","SuperellipseMorph","HarmonicRipple"]

for name in style_names:
    print(f"Measuring {name}...")
    style_fn = STYLES[name][0]
    n_theta = DEFAULT_ARGS["n_theta"]
    n_z = DEFAULT_ARGS["n_z"]
    thetas, cos_th, sin_th = theta_grid_cached(n_theta)
    z_outer = np.linspace(0.0, DEFAULT_ARGS["H"], n_z+1)

    t0 = time.perf_counter()
    r_vals, twist = vectorized_vertex_generation(z_outer, thetas, cos_th, sin_th, DEFAULT_ARGS["H"], DEFAULT_ARGS["Rb"], DEFAULT_ARGS["Rt"], DEFAULT_ARGS["expn"], style_fn, {}, base_radius, lambda z, H, opts: 0.0)
    dt1 = time.perf_counter() - t0

    t0 = time.perf_counter()
    verts = build_vertices_vectorized(r_vals, twist, z_outer, cos_th, sin_th)
    dt2 = time.perf_counter() - t0

    t0 = time.perf_counter()
    faces = build_faces_vectorized(n_z+1, n_theta)
    dt3 = time.perf_counter() - t0

    print(f"vectorized_vertex_generation: {dt1:.6f}s")
    print(f"build_vertices_vectorized: {dt2:.6f}s")
    print(f"build_faces_vectorized: {dt3:.6f}s")
    print()
