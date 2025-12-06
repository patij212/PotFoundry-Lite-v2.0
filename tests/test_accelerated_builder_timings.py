import pytest

from potfoundry import STYLES
from potfoundry.core.optimizations import build_pot_mesh_accelerated


@pytest.mark.parametrize("style", ["SuperformulaBlossom", "FourierBloom", "LowPolyFacet"])
def test_accelerated_builder_collect_timings_has_keys(style):
    style_fn, _ = STYLES[style]
    verts, faces, diag = build_pot_mesh_accelerated(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=168, n_z=84,
        r_outer_fn=style_fn, style_opts={}, collect_timings=True,
    )
    assert isinstance(diag, dict)
    # If the accelerated path was used, timings should be set; otherwise
    # heuristics may have fallen back to the standard builder which emits
    # `accelerated_used=False` and doesn't include timings.
    if diag.get("accelerated_used"):
        assert "timings" in diag
        keys = diag["timings"].keys()
    else:
        assert "timings" not in diag
        return
    # Key timings we expect
    assert "vectorized_vertex_generation" in keys
    assert "face_building" in keys
    assert diag["timings"]["vectorized_vertex_generation"] >= 0
    assert diag["timings"]["face_building"] >= 0
