import numpy as np
from potfoundry.geometry import build_pot_mesh, base_radius
from pfui.preview.visualization import make_preview_arrays
from pfui.imports import STYLES


def test_preview_mesh_parity():
    H = 120.0
    Rt = 140.0
    Rb = 90.0
    t_wall = 3.0
    t_bottom = 3.0
    r_drain = 10.0
    expn = 1.1
    n_theta = 64
    n_z = 32
    r_outer_fn = None
    style_opts = {}

    # Pick a valid style key from STYLES to use for preview arrays
    style_key = next(iter(STYLES.keys()))
    X, Y, Z = make_preview_arrays(H, Rt, Rb, expn, n_theta, n_z, style_key, '{}')

    verts, faces, diag = build_pot_mesh(H, Rt, Rb, t_wall, t_bottom, r_drain, expn, n_theta, n_z, r_outer_fn, style_opts)

    # The outer top ring vertices are stored first in the mesh vertex array
    # as (n_z+1) rings * n_theta elements per ring, take the last outer ring
    outer_start = (n_z) * n_theta
    outer_end = outer_start + n_theta
    top_verts = verts[outer_start:outer_end]
    # Sort by angle around Z to align with theta ordering
    angles = np.arctan2(top_verts[:, 1], top_verts[:, 0])
    order = np.argsort(angles)
    top_sorted = top_verts[order]

    X_row = X[-1, :]
    Y_row = Y[-1, :]
    # Both should have same number of samples
    assert top_sorted.shape[0] == X_row.shape[0]
    # compare in order (allow small eps due to float machine precision)
    # The arrays may be cyclically shifted; find best shift that minimizes error
    best_err = float('inf')
    best_shift = 0
    for s in range(n_theta):
        sx = np.roll(top_sorted[:, 0], s)
        sy = np.roll(top_sorted[:, 1], s)
        err = float(np.sum((sx - X_row)**2 + (sy - Y_row)**2))
        if err < best_err:
            best_err = err
            best_shift = s
    assert best_err < 1e-6 * n_theta, f"Best matching shift error too high: {best_err} (shift {best_shift})"
