import numpy as np

from potfoundry import STYLES
from potfoundry.core.accelerated import vectorized_vertex_generation
from potfoundry.core.mesh.outer_wall import spin_twist_radians


def style_func_multi_z(theta_grid, z_grid, r0_grid, H, opts):
    """Style function that supports multi-z input and returns (n_z, n_theta)

    It simply returns the theta grid offset by z_grid to validate broadcasting.
    """
    return theta_grid + (z_grid * 0.0)  # shape-preserving broadcast


def style_func_scalar_theta(theta, z, r0, H, opts):
    # scalar behavior: return theta as float
    return float(theta)


def test_vectorized_multi_z_style_accepts_grid_and_returns_expected_shape():
    n_theta = 8
    n_z = 4
    thetas = np.linspace(0.0, 2 * np.pi, n_theta, endpoint=False)
    cos_th = np.cos(thetas)
    sin_th = np.sin(thetas)
    z_array = np.linspace(0.0, 100.0, n_z)
    r0 = np.full((n_z,), 50.0)

    r_values, twist_array = vectorized_vertex_generation(
        z_array,
        thetas,
        cos_th,
        sin_th,
        H=100.0,
        Rb=40.0,
        Rt=60.0,
        expn=1.0,
        r_outer_fn=style_func_multi_z,
        style_opts={},
        base_radius_fn=lambda z, H, Rb, Rt, expn, opts: 50.0,
        spin_twist_fn=lambda z, H, opts: 0.0,
    )

    assert r_values.shape == (n_z, n_theta)
    assert twist_array.shape == (n_z,)


def test_vectorized_normalizes_spin_twist_outputs():
    n_theta = 12
    n_z = 6
    thetas = np.linspace(0.0, 2 * np.pi, n_theta, endpoint=False)
    cos_th = np.cos(thetas)
    sin_th = np.sin(thetas)
    z_array = np.linspace(0.0, 100.0, n_z)

    # Spin function returns scalar
    r_values1, twist1 = vectorized_vertex_generation(
        z_array, thetas, cos_th, sin_th, H=100.0, Rb=40.0, Rt=60.0, expn=1.0,
        r_outer_fn=style_func_multi_z, style_opts={}, base_radius_fn=lambda z, H, Rb, Rt, expn, opts: 45.0,
        spin_twist_fn=lambda z, H, opts: 0.25,
    )
    assert twist1.shape == (n_z,)
    assert np.allclose(twist1, 0.25)

    # Spin function returns a 1D array
    def spin_vec(z_arr, H, opts):
        return np.asarray(z_arr, dtype=float) * 0.0 + 0.5

    _, twist2 = vectorized_vertex_generation(
        z_array, thetas, cos_th, sin_th, H=100.0, Rb=40.0, Rt=60.0, expn=1.0,
        r_outer_fn=style_func_multi_z, style_opts={}, base_radius_fn=lambda z, H, Rb, Rt, expn, opts: 45.0,
        spin_twist_fn=spin_vec,
    )
    assert twist2.shape == (n_z,)
    assert np.allclose(twist2, 0.5)

    # Spin function returns shape (n_z, 1) array
    def spin_col(z_arr, H, opts):
        return np.asarray(z_arr, dtype=float)[:, np.newaxis] * 0.0 + 0.75

    _, twist3 = vectorized_vertex_generation(
        z_array, thetas, cos_th, sin_th, H=100.0, Rb=40.0, Rt=60.0, expn=1.0,
        r_outer_fn=style_func_multi_z, style_opts={}, base_radius_fn=lambda z, H, Rb, Rt, expn, opts: 45.0,
        spin_twist_fn=spin_col,
    )
    assert twist3.shape == (n_z,)
    assert np.allclose(twist3, 0.75)


def test_spin_twist_radians_array_and_scalar_consistent():
    # Scalar use
    scalar_val = spin_twist_radians(10.0, 100.0, {})
    assert isinstance(scalar_val, float)

    # Array input returns array of shape (n_z,)
    z_arr = np.linspace(0.0, 100.0, 5)
    arr_val = spin_twist_radians(z_arr, 100.0, {})
    assert isinstance(arr_val, np.ndarray)
    assert arr_val.shape == (len(z_arr),)


def test_style_vectorized_matches_per_z_loop_for_builtin_styles():
    """Verify that vectorized path (multi-z style function) yields the same
    results as the per-z scalar loop for a builtin style where vectorization
    is supported.
    """
    style_name = "SuperformulaBlossom"
    style_fn, _ = STYLES[style_name]

    n_theta = 48
    n_z = 8
    thetas = np.linspace(0.0, 2 * np.pi, n_theta, endpoint=False)
    cos_th = np.cos(thetas)
    sin_th = np.sin(thetas)
    z_array = np.linspace(0.0, 120.0, n_z)

    r_vect, twist_vect = vectorized_vertex_generation(
        z_array, thetas, cos_th, sin_th, H=120.0, Rb=40.0, Rt=60.0, expn=1.0,
        r_outer_fn=style_fn, style_opts={}, base_radius_fn=lambda z, H, Rb, Rt, expn, opts: 45.0,
        spin_twist_fn=lambda z, H, opts: 0.0,
    )

    # Compute using per-z loop
    r_loop = np.empty_like(r_vect)
    for i, z in enumerate(z_array):
        r_row = style_fn(thetas, float(z), 45.0, 120.0, {})
        r_loop[i] = np.asarray(r_row, dtype=float)

    assert r_vect.shape == r_loop.shape
    assert np.allclose(r_vect, r_loop, atol=1e-9)
