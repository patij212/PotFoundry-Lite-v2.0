import pytest
import numpy as np

from potfoundry import build_pot_mesh, STYLES
from potfoundry.core.geometry import r_outer_superformula_blossom, base_radius


@pytest.mark.fast
def test_superformula_blossom_neutral_strength_vector_and_scalar():
    """
    When sf_strength is omitted (default), SuperformulaBlossom must be neutral:
    r(theta, z) == r0 for both vector and scalar theta inputs.
    """
    H = 120.0
    z = H  # top ring
    r0 = 70.0  # base outer radius at z
    # Vector input
    thetas = np.linspace(0.0, 2 * np.pi, 128, endpoint=False)
    r_vec = r_outer_superformula_blossom(thetas, z, r0, H, {})
    assert isinstance(r_vec, np.ndarray)
    assert r_vec.shape == thetas.shape
    assert np.allclose(r_vec, r0)

    # Scalar input preserves scalar return and value
    r_sca = r_outer_superformula_blossom(0.123, z, r0, H, {})
    assert isinstance(r_sca, float)
    assert np.isclose(r_sca, r0)


@pytest.mark.fast
def test_build_pot_mesh_diagnostics_match_input_diameters_when_neutral():
    """
    With neutral style opts (no modulation), diagnostics ODs should match
    2*Rt and 2*Rb respectively.
    """
    H = 120.0
    Rt = 70.0  # radius (mm)
    Rb = 45.0  # radius (mm)
    t_wall = 3.0
    t_bottom = 3.0
    r_drain = 6.0
    expn = 1.2
    n_theta = 64
    n_z = 16

    style_fn = STYLES["SuperformulaBlossom"][0]
    verts, faces, diag = build_pot_mesh(
        H, Rt, Rb, t_wall, t_bottom, r_drain,
        expn=expn, n_theta=n_theta, n_z=n_z,
        r_outer_fn=style_fn, style_opts={}
    )

    # Estimated diameters should equal inputs (within a tiny tolerance)
    assert np.isclose(diag["estimated_top_od_mm"], 2 * Rt, rtol=1e-3, atol=1e-6)
    assert np.isclose(diag["estimated_bottom_od_mm"], 2 * Rb, rtol=1e-3, atol=1e-6)
