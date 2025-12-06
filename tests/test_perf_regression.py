import time

import pytest

from potfoundry import STYLES, build_pot_mesh
from potfoundry.core.optimizations import build_pot_mesh_accelerated


@pytest.mark.parametrize(
    "style,threshold",
    [
        ("FourierBloom", 2.0),
        ("LowPolyFacet", 2.0),
        ("SuperellipseMorph", 1.5),
    ],
)
def test_accelerated_speedup(style, threshold):
    style_fn, _ = STYLES[style]
    # Keep resolution moderate to avoid long running tests
    n_theta = 168
    n_z = 84

    # Average timing over several iterations (reduce noise)
    iters = 6
    time_std = 0.0
    time_acc = 0.0
    for _ in range(iters):
        start = time.perf_counter()
        _ = build_pot_mesh(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=n_theta, n_z=n_z,
            r_outer_fn=style_fn, style_opts={},
        )
        time_std += time.perf_counter() - start
        start = time.perf_counter()
        _, _, diag = build_pot_mesh_accelerated(
            H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
            expn=1.1, n_theta=n_theta, n_z=n_z,
            r_outer_fn=style_fn, style_opts={}, collect_timings=True,
            enforce_parity=False,
        )
        time_acc += time.perf_counter() - start
    time_std /= iters
    time_acc /= iters

    # If accelerated path used, assert speedups; otherwise skip (heuristic fallback)
    if not diag.get("accelerated_used"):
        pytest.skip("Accelerated path not used; heuristics chose standard builder")

    # Basic sanity checks for speedup
    speedup = time_std / time_acc if time_acc > 0 else float("inf")
    assert speedup >= threshold, f"speedup {speedup:.2f} < {threshold} for {style}"


def test_collect_timings_keys_and_thresholds():
    # Test that keys exist and timings are reasonable (soft thresholds)
    style_fn, _ = STYLES["FourierBloom"]
    verts, faces, diag = build_pot_mesh_accelerated(
        H=120, Rt=70, Rb=50, t_wall=3, t_bottom=3, r_drain=10,
        expn=1.1, n_theta=168, n_z=84,
        r_outer_fn=style_fn, style_opts={}, collect_timings=True,
        enforce_parity=False,
    )
    assert diag.get("accelerated_used") is True
    timings = diag.get("timings")
    assert timings is not None
    # expected keys
    for key in ["vectorized_vertex_generation", "face_building"]:
        assert key in timings
        assert timings[key] >= 0
    # soft thresholds (ms)
    assert timings["vectorized_vertex_generation"] < 0.2, "vectorized_vertex_generation too slow"
